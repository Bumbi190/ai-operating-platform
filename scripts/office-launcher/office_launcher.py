"""One-purpose Windows URL handler for the existing Omnira Unreal Office.

No listener, model calls, login tokens, shell, remote arguments or arbitrary URLs.
The browser can request only omnira-office://open; all launch arguments are local.
"""
from __future__ import annotations

from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import ntpath
import os
from pathlib import Path
import subprocess
import sys
import time

OFFICE_MAP = '/Game/OmniraRealismLab/Maps/Omnira_HQ_Office_Visit'
PROTOCOL = 'omnira-office'
OWNER = 'Omnira.OfficeLauncher.v1'
REGISTRY_KEY = r'Software\Classes\omnira-office'


class OfficeUnavailable(RuntimeError):
    """The locally approved Office target is missing or cannot be verified."""


def validate_uri(uri: str) -> None:
    if uri not in ('omnira-office://open', 'omnira-office://open/'):
        raise ValueError('Only the fixed Office opening link is supported')


@dataclass(frozen=True)
class OfficeTarget:
    engine: Path
    project: Path

    def verify(self) -> None:
        map_file = self.project.parent / ('Content' + OFFICE_MAP[5:] + '.umap')
        if not all(p.is_file() for p in (self.engine, self.project, map_file)):
            raise OfficeUnavailable('Office eller Unreal saknas. Kontrollera din lokala Office-installation.')
        try:
            metadata = json.loads(self.project.read_text(encoding='utf-8-sig'))
        except (OSError, UnicodeError, ValueError) as error:
            raise OfficeUnavailable('Office-projektet kunde inte verifieras.') from error
        if not isinstance(metadata, dict) or metadata.get('EngineAssociation') != '5.8':
            raise OfficeUnavailable('Office-projektet tillhor inte den godkanda Unreal-versionen 5.8.')

    def argv(self) -> list[str]:
        return [str(self.engine), str(self.project), OFFICE_MAP, '-game', '-d3d11',
                '-windowed', '-ResX=1440', '-ResY=900', '-nosplash']


def default_target() -> OfficeTarget:
    return OfficeTarget(
        Path(r'C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe'),
        Path.home() / 'Projects/Omnira/Design/Agent-Campus-3D/UnrealPilot/Omnira_Office_CastQA_v83/Omnira_Office_CastQA_v83.uproject',
    )


@dataclass(frozen=True)
class RunningOffice:
    pid: int
    argv: list[str]


def matching_office(process: RunningOffice, target: OfficeTarget) -> bool:
    args = process.argv
    norm = lambda value: ntpath.normcase(ntpath.normpath(str(value)))
    # Exact target, map and game mode. Ignore other projects and commandlet/editor work.
    if (not isinstance(process.pid, int) or process.pid <= 0 or len(args) < 4
            or norm(args[0]) != norm(target.engine)
            or norm(args[1]) != norm(target.project)
            or args[2] != OFFICE_MAP):
        return False
    flags = [value.lower() for value in args[3:]]
    allowed = {'-game', '-d3d11', '-windowed', '-nosplash', '-resx=1440', '-resy=900'}
    return '-game' in flags and all(value in allowed for value in flags)


def open_office(uri: str, target: OfficeTarget, backend) -> dict:
    validate_uri(uri)
    target.verify()
    for process in backend.running():
        if matching_office(process, target):
            return {'status': 'already_running', 'pid': process.pid,
                    'focused': backend.focus(process.pid)}
    return {'status': 'started', 'pid': backend.start(target.argv(), str(target.project.parent))}


class WindowsBackend:
    """Use Windows APIs and fixed argument arrays; never a shell or caller command."""

    def __init__(self):
        if sys.platform != 'win32':
            raise OfficeUnavailable('Office-startaren fungerar pa Windows.')
        import ctypes
        from ctypes import wintypes as W
        self.ctypes, self.W = ctypes, W
        self.user = ctypes.WinDLL('user32', use_last_error=True)
        self.kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        self.shell = ctypes.WinDLL('shell32', use_last_error=True)
        self.kernel.LocalFree.argtypes = [W.HLOCAL]
        self.kernel.LocalFree.restype = W.HLOCAL
        self.shell.CommandLineToArgvW.argtypes = [W.LPCWSTR, ctypes.POINTER(ctypes.c_int)]
        self.shell.CommandLineToArgvW.restype = ctypes.POINTER(W.LPWSTR)
        self.user.GetWindowThreadProcessId.argtypes = [W.HWND, ctypes.POINTER(W.DWORD)]
        self.user.GetWindowThreadProcessId.restype = W.DWORD
        self.user.IsWindowVisible.argtypes = [W.HWND]
        self.user.ShowWindow.argtypes = [W.HWND, ctypes.c_int]
        self.user.SetForegroundWindow.argtypes = [W.HWND]
        self.user.SetForegroundWindow.restype = W.BOOL

    def split_command(self, command: str) -> list[str]:
        count = self.ctypes.c_int()
        result = self.shell.CommandLineToArgvW(command, self.ctypes.byref(count))
        if not result:
            raise OfficeUnavailable('Ett Unreal-fonster kunde inte identifieras.')
        try:
            return [result[i] for i in range(count.value)]
        finally:
            self.kernel.LocalFree(self.ctypes.cast(result, self.W.HLOCAL))

    def running(self) -> list[RunningOffice]:
        powershell = Path(os.environ.get('SystemRoot', r'C:\Windows')) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
        script = ("$ErrorActionPreference='Stop'; "
                  "[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); "
                  "@(Get-CimInstance Win32_Process -Filter \"Name='UnrealEditor.exe'\" | "
                  "Select-Object ProcessId,CommandLine) | ConvertTo-Json -Compress")
        try:
            result = subprocess.run([str(powershell), '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
                capture_output=True, text=True, encoding='utf-8-sig', timeout=15,
                check=True, creationflags=subprocess.CREATE_NO_WINDOW)
            rows = json.loads(result.stdout) if result.stdout.strip() else []
            if isinstance(rows, dict):
                rows = [rows]
            return [RunningOffice(int(row['ProcessId']), self.split_command(row['CommandLine']))
                    for row in rows if isinstance(row, dict) and isinstance(row.get('CommandLine'), str)]
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
            # If enumeration fails, do not assume no Office exists and start duplicates.
            raise OfficeUnavailable('Kunde inte kontrollera om Office redan ar oppet. Forsok igen.') from error

    def focus(self, pid: int) -> bool:
        found = []
        callback_type = self.ctypes.WINFUNCTYPE(self.W.BOOL, self.W.HWND, self.W.LPARAM)
        def visit(hwnd, unused):
            process_id = self.W.DWORD()
            self.user.GetWindowThreadProcessId(hwnd, self.ctypes.byref(process_id))
            if process_id.value == pid and self.user.IsWindowVisible(hwnd):
                found.append(hwnd)
            return True
        self.user.EnumWindows.argtypes = [callback_type, self.W.LPARAM]
        self.user.EnumWindows(callback_type(visit), 0)
        if not found:
            return False
        self.user.ShowWindow(found[0], 9)  # SW_RESTORE
        return bool(self.user.SetForegroundWindow(found[0]))

    def start(self, argv: list[str], cwd: str) -> int:
        return subprocess.Popen(argv, cwd=cwd, shell=False, close_fds=True).pid

    @contextmanager
    def lock(self):
        self.kernel.CreateMutexW.argtypes = [self.W.LPVOID, self.W.BOOL, self.W.LPCWSTR]
        self.kernel.CreateMutexW.restype = self.W.HANDLE
        self.kernel.WaitForSingleObject.argtypes = [self.W.HANDLE, self.W.DWORD]
        self.kernel.WaitForSingleObject.restype = self.W.DWORD
        self.kernel.ReleaseMutex.argtypes = [self.W.HANDLE]
        self.kernel.CloseHandle.argtypes = [self.W.HANDLE]
        handle = self.kernel.CreateMutexW(None, False, r'Local\OmniraOfficeLauncher.v1')
        if not handle:
            raise OfficeUnavailable('Office-startaren kunde inte lasas.')
        acquired = False
        try:
            # Serialize rapid clicks while checking for a previously launched instance.
            acquired = self.kernel.WaitForSingleObject(handle, 20000) in (0, 0x80)
            if not acquired:
                raise OfficeUnavailable('En Office-start pagar redan. Forsok igen om en stund.')
            yield
        finally:
            if acquired:
                self.kernel.ReleaseMutex(handle)
            self.kernel.CloseHandle(handle)


def install_dir() -> Path:
    value = os.environ.get('LOCALAPPDATA')
    if not value or not Path(value).is_absolute():
        raise OfficeUnavailable('Windows lokala programmapp kunde inte hittas.')
    return Path(value) / 'Omnira/OfficeLauncher'


def handler_command() -> str:
    interpreter = Path(sys.executable).with_name('pythonw.exe')
    if not interpreter.is_file():
        raise OfficeUnavailable('Python for Windows saknas.')
    script = install_dir() / 'office_launcher.py'
    return subprocess.list2cmdline([str(interpreter), '-I', str(script), '--open']) + ' "%1"'


def registration_state() -> bool:
    """Reject foreign effective/machine registrations and altered owned commands."""
    import winreg
    per_user = False
    expected = handler_command()
    for root, path in [(winreg.HKEY_CLASSES_ROOT, PROTOCOL),
                       (winreg.HKEY_CURRENT_USER, REGISTRY_KEY)]:
        try:
            existing = winreg.OpenKey(root, path)
        except FileNotFoundError:
            continue
        try:
            with existing:
                owner = winreg.QueryValueEx(existing, 'OmniraOwner')[0]
            with winreg.OpenKey(root, path + r'\shell\open\command') as key:
                command = winreg.QueryValueEx(key, '')[0]
        except OSError as error:
            raise OfficeUnavailable('En annan Office-startare ar redan registrerad; inget andrat.') from error
        if owner != OWNER or command != expected:
            raise OfficeUnavailable('Office-registreringen tillhor en annan startare eller har andrats; inget ersatt.')
        if root == winreg.HKEY_CURRENT_USER:
            per_user = True
    return per_user


def installed() -> bool:
    try:
        return registration_state() and (install_dir() / 'office_launcher.py').is_file()
    except (OfficeUnavailable, OSError):
        return False


def install() -> dict:
    import winreg
    target = default_target()
    target.verify()
    command = handler_command()
    registration_state()
    destination = install_dir()
    destination.mkdir(parents=True, exist_ok=True)
    payload = Path(__file__).read_bytes()
    staging = destination / 'office_launcher.py.new'
    staging.write_bytes(payload)
    os.replace(staging, destination / 'office_launcher.py')
    for suffix, values in [('', {'': 'URL:Omnira Office', 'URL Protocol': '', 'OmniraOwner': OWNER}),
                           (r'\shell\open\command', {'': command})]:
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, REGISTRY_KEY + suffix) as key:
            for name, value in values.items():
                winreg.SetValueEx(key, name, 0, winreg.REG_SZ, value)
    return {'status': 'installed', 'scope': 'current_user', 'source_sha256': hashlib.sha256(payload).hexdigest()}


def uninstall() -> dict:
    import winreg
    if not installed():
        raise OfficeUnavailable('Ingen matchande Omnira Office-registrering hittades; inget andrat.')
    # Remove only this handler, and retain its local files/diagnostics for recovery.
    for suffix in (r'\shell\open\command', r'\shell\open', r'\shell', ''):
        winreg.DeleteKey(winreg.HKEY_CURRENT_USER, REGISTRY_KEY + suffix)
    return {'status': 'uninstalled', 'local_files_retained': True}


def main(args: list[str]) -> int:
    try:
        if sys.platform != 'win32':
            raise OfficeUnavailable('Office-startaren fungerar pa Windows.')
        if args == ['--install']:
            result = install()
        elif args == ['--uninstall']:
            result = uninstall()
        elif args == ['--check']:
            default_target().verify()
            result = {'status': 'ready', 'protocol_installed': installed()}
        elif len(args) == 2 and args[0] == '--open':
            validate_uri(args[1])  # Reject before creating a mutex or reading local process state.
            backend = WindowsBackend()
            with backend.lock():
                result = open_office(args[1], default_target(), backend)
        else:
            raise ValueError('Use --open omnira-office://open, --check, --install or --uninstall')
        code = 0
    except (OfficeUnavailable, ValueError, OSError) as error:
        result = {'status': 'error', 'message': str(error)}
        code = 1
    if sys.stdout:
        print(json.dumps(result, ensure_ascii=True))
    if sys.platform == 'win32':
        try:
            path = install_dir()
            path.mkdir(parents=True, exist_ok=True)
            (path / 'last-result.json').write_text(json.dumps({**result, 'observed_at': time.time()}), encoding='utf-8')
        except OSError:
            pass
        if code and not sys.stdout:
            import ctypes
            ctypes.windll.user32.MessageBoxW(None, result['message'], 'Omnira Office', 0x10)
    return code


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
