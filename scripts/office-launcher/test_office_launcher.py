"""Behavioral tests for the fixed, shell-free Office launch boundary."""
import importlib.util
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('office_launcher.py')
if SOURCE.exists():
    spec = importlib.util.spec_from_file_location('office_launcher', SOURCE)
    import sys
    launcher = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = launcher
    spec.loader.exec_module(launcher)
else:
    launcher = None


class Backend:
    def __init__(self, processes=(), focused=True):
        self.processes = processes
        self.focused = focused
        self.starts = []
        self.focuses = []
        self.queries = 0

    def running(self):
        self.queries += 1
        return self.processes

    def focus(self, pid):
        self.focuses.append(pid)
        return self.focused

    def start(self, argv, cwd):
        self.starts.append((argv, cwd))
        return 4321


class OfficeLauncherTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(launcher, 'The Office launcher has not been implemented')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.engine = root / 'Engine' / 'UnrealEditor.exe'
        self.engine.parent.mkdir()
        self.engine.write_bytes(b'placeholder')
        self.project = root / 'Office' / 'Omnira_Office_CastQA_v83.uproject'
        self.project.parent.mkdir()
        self.project.write_text(json.dumps({'FileVersion': 3, 'EngineAssociation': '5.8'}))
        self.map_file = self.project.parent / 'Content/OmniraRealismLab/Maps/Omnira_HQ_Office_Visit.umap'
        self.map_file.parent.mkdir(parents=True)
        self.map_file.write_bytes(b'placeholder')
        self.target = launcher.OfficeTarget(self.engine, self.project)

    def test_opens_only_the_approved_project_map_and_render_flags(self):
        backend = Backend()
        result = launcher.open_office('omnira-office://open', self.target, backend)
        self.assertEqual(result, {'status': 'started', 'pid': 4321})
        self.assertEqual(backend.starts, [([
            str(self.engine), str(self.project), '/Game/OmniraRealismLab/Maps/Omnira_HQ_Office_Visit',
            '-game', '-d3d11', '-windowed', '-ResX=1440', '-ResY=900', '-nosplash',
        ], str(self.project.parent))])

    def test_repeated_click_focuses_the_exact_existing_office(self):
        running = launcher.RunningOffice(27, [str(self.engine), str(self.project),
            launcher.OFFICE_MAP, '-game', '-d3d11'])
        backend = Backend([running])
        result = launcher.open_office('omnira-office://open/', self.target, backend)
        self.assertEqual(result, {'status': 'already_running', 'pid': 27, 'focused': True})
        self.assertEqual(backend.focuses, [27])
        self.assertEqual(backend.starts, [])

    def test_a_starting_or_unfocusable_office_never_creates_a_duplicate(self):
        running = launcher.RunningOffice(27, [str(self.engine), str(self.project), launcher.OFFICE_MAP, '-game'])
        backend = Backend([running], focused=False)
        result = launcher.open_office('omnira-office://open', self.target, backend)
        self.assertFalse(result['focused'])
        self.assertEqual(backend.starts, [])

    def test_other_editor_project_map_or_executable_is_never_focused(self):
        valid = [str(self.engine), str(self.project), launcher.OFFICE_MAP, '-game']
        variants = [
            [str(self.engine), str(self.project), launcher.OFFICE_MAP],
            [str(self.engine), str(self.project), '/Game/AnotherMap', '-game'],
            [str(self.engine), str(self.project) + '.other', launcher.OFFICE_MAP, '-game'],
            [str(self.engine) + '.other', str(self.project), launcher.OFFICE_MAP, '-game'],
            valid + ['-run=pythonscript'],
            valid + ['-ExecCmds=quit'],
            valid + ['-RenderOffscreen'],
            valid + ['-nullrhi'],
            valid + ['-unattended'],
            valid + [str(self.project)],
        ]
        for argv in variants:
            with self.subTest(argv=argv):
                backend = Backend([launcher.RunningOffice(18, argv)])
                launcher.open_office('omnira-office://open', self.target, backend)
                self.assertEqual(backend.focuses, [])
                self.assertEqual(len(backend.starts), 1)

    def test_untrusted_urls_are_rejected_before_any_os_action(self):
        bad = ['', 'https://omniraos.se', 'omnira-office://open?cmd=calc',
            'omnira-office://open#token', 'omnira-office://open/../',
            'omnira-office://open%22%20-execcmds=quit', 'omnira-office://open" --install',
            'omnira-office://other', 'omnira-office://user@open', 'omnira-office://open:80',
            'omnira-office://open\n', ' omnira-office://open', 'omnira-office://OPEN',
            'omnira-office://open;calc.exe', 'omnira-office://open/extra',
        ]
        for uri in bad:
            with self.subTest(uri=uri):
                backend = Backend()
                with self.assertRaises(ValueError):
                    launcher.open_office(uri, self.target, backend)
                self.assertEqual((backend.queries, backend.starts, backend.focuses), (0, [], []))

    def test_missing_engine_project_or_map_is_an_error_not_a_false_success(self):
        for missing in [self.engine, self.project, self.map_file]:
            with self.subTest(missing=missing):
                original = missing.read_bytes()
                missing.unlink()
                backend = Backend()
                with self.assertRaises(launcher.OfficeUnavailable):
                    launcher.open_office('omnira-office://open', self.target, backend)
                self.assertEqual(backend.starts, [])
                missing.write_bytes(original)

    def test_invalid_project_metadata_is_rejected(self):
        for payload in ['not json', '{"EngineAssociation":"other"}', '[]']:
            with self.subTest(payload=payload):
                self.project.write_text(payload)
                with self.assertRaises(launcher.OfficeUnavailable):
                    launcher.open_office('omnira-office://open', self.target, Backend())

    def test_install_refuses_existing_registration_without_our_owner_marker(self):
        class ExistingKey:
            def __enter__(self): return self
            def __exit__(self, *args): pass
        registry = SimpleNamespace(HKEY_CURRENT_USER=1, HKEY_CLASSES_ROOT=2, REG_SZ=1,
            OpenKey=lambda *args: ExistingKey(),
            CreateKey=lambda *args: ExistingKey(), SetValueEx=lambda *args: None,
            QueryValueEx=lambda *args: (_ for _ in ()).throw(FileNotFoundError('No owner marker')))
        with patch.dict('sys.modules', {'winreg': registry}), \
             patch.object(launcher, 'default_target', return_value=self.target), \
             patch.object(launcher, 'handler_command', return_value='fixed command'), \
             patch.object(launcher, 'install_dir', return_value=Path(self.tmp.name) / 'installed'):
            with self.assertRaises(launcher.OfficeUnavailable):
                launcher.install()

    def test_install_refuses_machine_wide_foreign_handler(self):
        class ExistingKey:
            def __enter__(self): return self
            def __exit__(self, *args): pass
        def open_key(root, path):
            if root == 1: raise FileNotFoundError('No per-user key')
            return ExistingKey()
        registry = SimpleNamespace(HKEY_CURRENT_USER=1, HKEY_CLASSES_ROOT=2, REG_SZ=1,
            OpenKey=open_key, CreateKey=lambda *args: ExistingKey(), SetValueEx=lambda *args: None,
            QueryValueEx=lambda *args: ('Another.Application', 1))
        with patch.dict('sys.modules', {'winreg': registry}), \
             patch.object(launcher, 'default_target', return_value=self.target), \
             patch.object(launcher, 'handler_command', return_value='fixed command'), \
             patch.object(launcher, 'install_dir', return_value=Path(self.tmp.name) / 'installed'):
            with self.assertRaises(launcher.OfficeUnavailable):
                launcher.install()

    def test_install_refuses_changed_command_even_with_our_owner_marker(self):
        class ExistingKey:
            def __enter__(self): return self
            def __exit__(self, *args): pass
        def query(key, name):
            return (launcher.OWNER if name == 'OmniraOwner' else 'foreign.exe "%1"', 1)
        registry = SimpleNamespace(HKEY_CURRENT_USER=1, HKEY_CLASSES_ROOT=2, REG_SZ=1,
            OpenKey=lambda *args: ExistingKey(), CreateKey=lambda *args: ExistingKey(),
            SetValueEx=lambda *args: None, QueryValueEx=query)
        with patch.dict('sys.modules', {'winreg': registry}), \
             patch.object(launcher, 'default_target', return_value=self.target), \
             patch.object(launcher, 'handler_command', return_value='fixed command'), \
             patch.object(launcher, 'install_dir', return_value=Path(self.tmp.name) / 'installed'):
            with self.assertRaises(launcher.OfficeUnavailable):
                launcher.install()


if __name__ == '__main__':
    unittest.main()
