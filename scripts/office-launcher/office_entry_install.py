"""Explicit current-user visit installer. No install, browser or network on import."""
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

MODULES = (
    'office_launcher.py', 'office_install_guard.py', 'office_pairing.py',
    'office_presence.py', 'office_relay.py', 'office_visit.py',
    'office_visit_client.py', 'office_visit_process.py', 'office_visit_relay.py',
    'install_unreal_presence.py', 'style_unreal_presence.py',
)
LEGACY_OWNER = 'Omnira.OfficeLauncher.v1'
VISIT_OWNER = 'Omnira.OfficeVisitLauncher.v1'
REGISTRY_KEY = r'Software\Classes\omnira-office'


@dataclass(frozen=True)
class Registration:
    owner: str
    command: str


def _plain(path: Path) -> bool:
    return not path.is_symlink() and not (hasattr(path, 'is_junction') and path.is_junction())


def build_payloads(source: Path) -> dict[str, bytes]:
    source = Path(source)
    payloads = {}
    for name in MODULES + ('office_entry.py',):
        path = source / name
        if not _plain(path) or not path.is_file():
            raise RuntimeError('Fixed Office source missing or redirected')
        payloads[name] = path.read_bytes()
    hashes = {name: hashlib.sha256(payloads[name]).hexdigest() for name in MODULES}
    marker = b'_EXPECTED = {}'
    if payloads['office_entry.py'].count(marker) != 1:
        raise RuntimeError('Unrecognized Office entry template')
    payloads['office_entry.py'] = payloads['office_entry.py'].replace(
        marker, b'_EXPECTED = ' + json.dumps(hashes, sort_keys=True).encode('ascii'), 1)
    return payloads


def _bundle_id(payloads: dict[str, bytes]) -> str:
    records = {name: hashlib.sha256(data).hexdigest() for name, data in payloads.items()}
    return hashlib.sha256(json.dumps(records, sort_keys=True).encode('ascii')).hexdigest()


def _verify_files(bundle: Path, payloads: dict[str, bytes]) -> None:
    if (not all(_plain(p) for p in (bundle, bundle.parent, bundle.parent.parent))
            or not bundle.is_dir() or set(p.name for p in bundle.iterdir()) != set(payloads)):
        raise RuntimeError('Unknown installed bundle content')
    for name, data in payloads.items():
        path = bundle / name
        if not _plain(path) or not path.is_file() or path.read_bytes() != data:
            raise RuntimeError('Installed bundle changed; preserving it')


def prepare_bundle(source: Path, destination: Path) -> Path:
    """Publish immutable fixed files; never overwrite an existing unknown edit."""
    payloads = build_payloads(source)
    destination = Path(destination)
    if not _plain(destination):
        raise RuntimeError('Redirected install directory')
    bundle = destination / _bundle_id(payloads)
    if bundle.exists():
        _verify_files(bundle, payloads)
        return bundle
    destination.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix='.prepare-', dir=destination))
    try:
        for name, data in payloads.items():
            (staging / name).write_bytes(data)
        _verify_files(staging, payloads)
        os.rename(staging, bundle)  # Unique target: never replace an existing bundle.
        return bundle
    finally:
        if staging.exists():
            shutil.rmtree(staging)  # Only this call's newly created temporary directory.


def legacy_command(root: Path, interpreter: Path) -> str:
    return subprocess.list2cmdline([str(interpreter), '-I', str(Path(root) / 'office_launcher.py'), '--open']) + ' "%1"'


def visit_command(bundle: Path, interpreter: Path) -> str:
    return subprocess.list2cmdline([str(interpreter), '-I', '-B', str(bundle / 'office_entry.py')]) + ' "%1"'


def _legacy(source: Path, root: Path, interpreter: Path) -> Registration:
    path = Path(root) / 'office_launcher.py'
    if not _plain(Path(root)) or not _plain(path) or not path.is_file():
        raise RuntimeError('Legacy Office installation missing or redirected')
    if path.read_bytes() != (Path(source) / 'office_launcher.py').read_bytes():
        raise RuntimeError('Legacy Office file changed; preserving it')
    return Registration(LEGACY_OWNER, legacy_command(root, interpreter))


def _audit(registry, allowed) -> Registration:
    own = registry.read()
    effective = registry.read(effective=True)
    if own not in allowed or effective != own:
        raise RuntimeError('Foreign or changed Office registration; preserving it')
    return own


def _switch(registry, before: Registration, after: Registration) -> None:
    _audit(registry, (before,))
    if before == after:
        return
    try:
        registry.write(after)
        _audit(registry, (after,))
    except Exception:
        # Roll back only values written by this transaction. Never replace foreign drift.
        current = registry.read()
        if current.owner in (before.owner, after.owner) and current.command in (before.command, after.command):
            registry.write(before)
            _audit(registry, (before,))
        raise


def install_visit(source: Path, root: Path, registry, interpreter: Path) -> dict:
    old = _legacy(source, root, interpreter)
    payloads = build_payloads(source)
    bundle = Path(root) / 'visits' / _bundle_id(payloads)
    new = Registration(VISIT_OWNER, visit_command(bundle, interpreter))
    previous = _audit(registry, (old, new))  # Before any file write.
    if previous == new:
        _verify_files(bundle, payloads)  # Idempotence means the same existing bytes, not repair.
    else:
        prepared = prepare_bundle(source, Path(root) / 'visits')
        if prepared != bundle:
            raise RuntimeError('Bundle identity mismatch')
    _legacy(source, root, interpreter)
    _switch(registry, previous, new)
    return {'status': 'installed', 'scope': 'current_user', 'bundle': str(bundle),
            'bundle_id': bundle.name, 'legacy_file_unchanged': True}


def restore_launcher(source: Path, root: Path, registry, interpreter: Path) -> dict:
    old = _legacy(source, root, interpreter)
    payloads = build_payloads(source)
    bundle = Path(root) / 'visits' / _bundle_id(payloads)
    new = Registration(VISIT_OWNER, visit_command(bundle, interpreter))
    previous = _audit(registry, (new,))
    _verify_files(bundle, payloads)
    _switch(registry, previous, old)
    return {'status': 'restored_launch_only', 'local_files_retained': True}


class WindowsRegistry:
    def read(self, effective=False):
        import winreg
        root, path = ((winreg.HKEY_CLASSES_ROOT, 'omnira-office') if effective
                      else (winreg.HKEY_CURRENT_USER, REGISTRY_KEY))
        try:
            with winreg.OpenKey(root, path) as key:
                owner = winreg.QueryValueEx(key, 'OmniraOwner')[0]
            with winreg.OpenKey(root, path + r'\shell\open\command') as key:
                command = winreg.QueryValueEx(key, '')[0]
        except OSError:
            raise RuntimeError('Verified legacy Office handler is required') from None
        return Registration(owner, command)

    def write(self, registration):
        import winreg
        # Existing keys only. Do not create/modify protocol labels or unrelated values.
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REGISTRY_KEY + r'\shell\open\command', 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, '', 0, winreg.REG_SZ, registration.command)
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, REGISTRY_KEY, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, 'OmniraOwner', 0, winreg.REG_SZ, registration.owner)


def main(args: list[str]) -> int:
    try:
        if sys.platform != 'win32' or args not in (['--check'], ['--install-visit'], ['--restore-launcher']):
            raise RuntimeError('Unsupported installer invocation')
        from office_launcher import default_target, install_dir
        source = Path(__file__).absolute().parent
        root = install_dir()
        interpreter = Path(sys.executable).with_name('pythonw.exe')
        if not interpreter.is_file():
            raise RuntimeError('Windows Python missing')
        if args != ['--restore-launcher']:
            from office_pairing import check_native
            check_native(default_target())  # Restore must survive an unhealthy receiver.
        registry = WindowsRegistry()
        if args == ['--check']:
            old = _legacy(source, root, interpreter)
            payloads = build_payloads(source)
            bundle = root / 'visits' / _bundle_id(payloads)
            new = Registration(VISIT_OWNER, visit_command(bundle, interpreter))
            current = _audit(registry, (old, new))
            if current == new:
                _verify_files(bundle, payloads)
            result = {'status': 'ready', 'visit_installed': current == new, 'native_receiver_verified': True}
        elif args == ['--install-visit']:
            result = install_visit(source, root, registry, interpreter)
        else:
            result = restore_launcher(source, root, registry, interpreter)
        print(json.dumps(result, ensure_ascii=True))
        return 0
    except Exception:
        print(json.dumps({'status': 'unavailable', 'message': 'Office-startaren kunde inte verifieras. Ingen okänd installation ersätts.'}, ensure_ascii=True))
        return 1


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
