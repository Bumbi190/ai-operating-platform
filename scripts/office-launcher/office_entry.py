"""Installed fixed-verb entry. Build-time hashes are filled by office_entry_install."""
from pathlib import Path
import hashlib
import json
import sys

sys.dont_write_bytecode = True
_EXPECTED = {}
_MODULES = {
    'office_launcher.py', 'office_install_guard.py', 'office_pairing.py',
    'office_presence.py', 'office_relay.py', 'office_visit.py',
    'office_visit_client.py', 'office_visit_process.py', 'office_visit_relay.py',
    'install_unreal_presence.py', 'style_unreal_presence.py',
}


def verify_bundle() -> Path:
    base = Path(__file__).absolute().parent
    bootstrap = Path(__file__).absolute()
    owned_paths = (base, base.parent, base.parent.parent, bootstrap)
    if (not bootstrap.is_file() or any(p.is_symlink() or
            (hasattr(p, 'is_junction') and p.is_junction()) for p in owned_paths)):
        raise RuntimeError('Unverified bundle')
    if set(_EXPECTED) != _MODULES or set(p.name for p in base.iterdir()) != _MODULES | {'office_entry.py'}:
        raise RuntimeError('Incomplete bundle')
    for name, expected in _EXPECTED.items():
        path = base / name
        if not path.is_file() or path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise RuntimeError('Changed bundle')
    records = {name: hashlib.sha256((base / name).read_bytes()).hexdigest()
               for name in _MODULES | {'office_entry.py'}}
    expected_id = hashlib.sha256(json.dumps(records, sort_keys=True).encode('ascii')).hexdigest()
    if base.name != expected_id:
        raise RuntimeError('Changed entry')
    return base


def main(args: list[str]) -> int:
    try:
        if len(args) != 1 or args[0] not in (
            'omnira-office://open', 'omnira-office://open/',
            'omnira-office://visit', 'omnira-office://visit/',
        ):
            raise ValueError('Unsupported entry')
        base = verify_bundle()  # No product imports, local processes or listener before verification.
        sys.path.insert(0, str(base))
        if args[0] in ('omnira-office://open', 'omnira-office://open/'):
            from office_launcher import main as launch
            return launch(['--open', args[0]])
        from office_visit import main as visit
        result = visit(['--visit'])
        if result:
            raise RuntimeError('Visit unavailable')
        return 0
    except Exception:
        message = 'Office kunde inte öppnas säkert. Kontrollera den lokala startaren och försök igen.'
        if sys.stdout:
            print(json.dumps({'status': 'unavailable', 'message': message}, ensure_ascii=True))
        elif sys.platform == 'win32':
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, message, 'Omnira Office', 0x10)
        return 1


if __name__ == '__mp_main__':
    # Windows spawn reimports the real installed entry before unpickling a target.
    # Recheck files before that target can import a bundled HTTPS worker.
    verify_bundle()
elif __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
