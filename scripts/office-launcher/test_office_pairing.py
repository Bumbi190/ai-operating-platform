"""Foreground starter tests: real files/HTTP, synthetic source, captured browser boundary."""
import contextlib
import hashlib
import http.client
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
from datetime import datetime, timezone

from office_launcher import OfficeTarget
from office_relay import OfficeRelay
from test_office_presence import fixtures, PROJECT, AGENT
try:
    import office_pairing as pairing
except ImportError:
    pairing = None


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class PairingTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(pairing, 'Explicit Office pairing starter is missing')
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.project = self.root / 'Omnira_Office_CastQA_v83.uproject'
        self.engine = self.root / 'UnrealEditor.exe'
        self.engine.write_bytes(b'synthetic executable, never run')
        self.map = self.root / 'Content/OmniraRealismLab/Maps/Omnira_HQ_Office_Visit.umap'
        self.map.parent.mkdir(parents=True)
        self.map.write_bytes(b'synthetic saved native world')
        self.asset = self.root / 'Content/OmniraGameplayV83/PrivatePresence/BP_OfficePrivatePresence.uasset'
        self.asset.parent.mkdir(parents=True)
        self.asset.write_bytes(b'synthetic native receiver')
        self.material = self.asset.with_name('M_OfficePresenceText.uasset')
        self.material.write_bytes(b'synthetic readable material')
        self.evidence = self.root / 'Saved/OfficePresenceSetup'
        self.evidence.mkdir(parents=True)
        self.output = self.root / 'Saved/OfficePresence'
        self.target = OfficeTarget(self.engine, self.project)
        self.config = {'EngineAssociation': '5.8', 'Plugins': [{'Name': 'JsonBlueprintUtilities', 'Enabled': True}]}
        self.project.write_text(json.dumps(self.config), encoding='utf-8')
        self.manifest = {
            'installed': True, 'status': 'verified_local_identity_consumer',
            'fresh_process_verified': True, 'runtime_pause_expiry_verified': True,
            'project_after_sha256': sha(self.project),
            'avatar_id': 'office-familje-pling', 'linked_actor': 'SkeletalMeshActor_3',
            'linked_actor_label': 'Pling | Familje',
            'source_sha256': sha(Path(__file__).with_name('install_unreal_presence.py')),
            'asset_sha256': sha(self.asset), 'map_after_sha256': sha(self.map),
            'presentation': {'material_sha256': sha(self.material),
                             'source_sha256': sha(Path(__file__).with_name('style_unreal_presence.py'))},
        }
        self.audit = {'passed': True, 'installed': True, 'fresh_process': True,
                      'status': 'verified_local_identity_consumer', 'map_sha256': sha(self.map),
                      'asset_sha256': sha(self.asset),
                      'source_sha256': self.manifest['source_sha256'],
                      'presentation': {'material_sha256': sha(self.material), 'unlit': True, 'font_mask': True}}
        self.write_evidence()

    def write_evidence(self):
        for path, data in [(self.project, self.config), (self.evidence/'installation.json', self.manifest),
                           (self.evidence/'fresh_process_audit.json', self.audit)]:
            path.write_text(json.dumps(data), encoding='utf-8')

    def test_check_is_read_only_and_does_not_authenticate_the_backend(self):
        before = {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()}
        self.assertEqual(pairing.check_native(self.target), self.output)
        self.assertFalse(self.output.exists())
        with patch.object(pairing, 'default_target', return_value=self.target), patch.object(pairing, 'run_pairing', side_effect=AssertionError('check must not start a listener')):
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(pairing.main(['--check']), 0)
        result = json.loads(out.getvalue())
        self.assertEqual(result['status'], 'native_receiver_ready')
        self.assertIs(result['web_pairing_verified'], False)
        self.assertEqual(before, {str(p.relative_to(self.root)): p.read_bytes() for p in self.root.rglob('*') if p.is_file()})

    def test_missing_or_pending_evidence_starts_nothing(self):
        for field in ('installed', 'status'):
            with self.subTest(field=field):
                saved = self.manifest[field]
                self.manifest[field] = False if field == 'installed' else 'saved_pending_fresh_process_verification'
                self.write_evidence()
                with self.assertRaises(pairing.PairingUnavailable):
                    pairing.run_pairing(self.target, lambda _: self.fail('Browser opened before native verification'), threading.Event())
                self.assertFalse(self.output.exists())
                self.manifest[field] = saved
        self.write_evidence()
        (self.evidence/'fresh_process_audit.json').unlink()
        with self.assertRaises(pairing.PairingUnavailable):
            pairing.check_native(self.target)

    def test_map_asset_material_and_audit_drift_are_rejected(self):
        for path in (self.map, self.asset, self.material):
            with self.subTest(path=path.name):
                original = path.read_bytes()
                path.write_bytes(original + b' unreviewed change')
                with self.assertRaises(pairing.PairingUnavailable):
                    pairing.check_native(self.target)
                path.write_bytes(original)
        self.audit['map_sha256'] = '0' * 64
        self.write_evidence()
        with self.assertRaises(pairing.PairingUnavailable):
            pairing.check_native(self.target)

    def test_source_plugin_and_avatar_drift_are_rejected(self):
        mutations = [('source_sha256', '0'*64), ('avatar_id', 'office-foreign-pling')]
        for field, wrong in mutations:
            with self.subTest(field=field):
                original = self.manifest[field]
                self.manifest[field] = wrong
                self.write_evidence()
                with self.assertRaises(pairing.PairingUnavailable):
                    pairing.check_native(self.target)
                self.manifest[field] = original
        self.config['Plugins'][0]['Enabled'] = False
        self.write_evidence()
        with self.assertRaises(pairing.PairingUnavailable):
            pairing.check_native(self.target)

    def test_malformed_native_config_is_a_safe_rejection_before_browser_or_listener(self):
        self.config['Plugins'] = [None]
        self.write_evidence()
        with self.assertRaises(pairing.PairingUnavailable):
            pairing.run_pairing(self.target, lambda _: self.fail('Malformed native config opened browser'), threading.Event())
        self.assertFalse(self.output.exists())

    def test_missing_generator_and_absent_hashes_cannot_agree_as_ready(self):
        sources = self.root/'sources'
        sources.mkdir()
        (sources/'style_unreal_presence.py').write_bytes(Path(__file__).with_name('style_unreal_presence.py').read_bytes())
        self.manifest.pop('source_sha256')
        self.audit.pop('source_sha256')
        self.write_evidence()
        with patch.object(pairing, 'SOURCES', sources), self.assertRaises(pairing.PairingUnavailable):
            pairing.check_native(self.target)

    def test_pending_runtime_or_fresh_process_verification_blocks_pairing(self):
        for flag in ('fresh_process_verified', 'runtime_pause_expiry_verified'):
            with self.subTest(flag=flag):
                self.manifest[flag] = False
                self.write_evidence()
                with self.assertRaises(pairing.PairingUnavailable):
                    pairing.check_native(self.target)
                self.manifest[flag] = True

    def test_platform_disabled_plugin_descriptor_is_rejected(self):
        self.config['Plugins'][0]['PlatformDenyList'] = ['Win64']
        self.write_evidence()
        with self.assertRaises(pairing.PairingUnavailable):
            pairing.check_native(self.target)

    def request(self, parsed, key, route, body):
        c = http.client.HTTPConnection('127.0.0.1', int(parse_qs(parsed.fragment)['officePort'][0]), timeout=3)
        c.request('POST', route, json.dumps(body), {'Origin': 'https://omniraos.se', 'Authorization': 'Bearer '+key,
                                                 'Content-Type': 'application/json'})
        response = c.getresponse()
        result = response.status, json.loads(response.read())
        c.close()
        self.assertEqual(result[0], 200)
        return result[1]

    def connect_synthetic(self, url):
        parsed = urlsplit(url)
        self.assertEqual((parsed.scheme, parsed.netloc, parsed.path, parsed.query),
                         ('https', 'omniraos.se', '/atlas/office/connect', ''))
        values = parse_qs(parsed.fragment)
        self.assertEqual(set(values), {'officePort', 'officeKey'})
        key = values['officeKey'][0]
        self.assertGreaterEqual(len(key), 40)
        bound = self.request(parsed, key, '/bind', {'protocol': 1, 'avatarId': 'office-familje-pling', 'projectId': PROJECT, 'agentId': AGENT})
        binding, snapshot = fixtures()
        binding['verifiedAt'] = snapshot['generatedAt'] = datetime.now(timezone.utc).isoformat()
        self.request(parsed, key, '/snapshot', {'protocol': 1, 'connectionId': bound['connectionId'], 'binding': binding, 'snapshot': snapshot})
        self.assertEqual(json.loads((self.output/'office-familje-pling.json').read_text())['identity'], 'verified')
        return key

    def test_explicit_start_uses_real_relay_and_clears_on_normal_stop_without_key_output(self):
        stop = threading.Event()
        secrets = []
        def browser(url):
            secrets.append(self.connect_synthetic(url))
            stop.set()
            return True
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            pairing.run_pairing(self.target, browser, stop)
        result = json.loads((self.output/'office-familje-pling.json').read_text())
        self.assertEqual(result['identity'], 'unknown')
        self.assertIs(result['work_verified'], False)
        for p in self.root.rglob('*'):
            if p.is_file():
                self.assertNotIn(secrets[0].encode(), p.read_bytes())
        self.assertNotIn(secrets[0], out.getvalue())
        again = OfficeRelay(self.output, avatars=('office-familje-pling',))
        again.start()
        again.stop()

    def test_browser_error_clears_connected_identity_releases_lease_and_hides_secret(self):
        captured = []
        def browser(url):
            captured.append(self.connect_synthetic(url))
            raise RuntimeError('browser failed: ' + url)
        with self.assertRaises(pairing.PairingUnavailable) as error:
            pairing.run_pairing(self.target, browser, threading.Event())
        self.assertNotIn(captured[0], str(error.exception))
        self.assertEqual(json.loads((self.output/'office-familje-pling.json').read_text())['identity'], 'unknown')
        again = OfficeRelay(self.output, avatars=('office-familje-pling',))
        again.start()
        again.stop()

    def test_browser_refusal_does_not_leave_a_writer(self):
        with self.assertRaises(pairing.PairingUnavailable):
            pairing.run_pairing(self.target, lambda _: False, threading.Event())
        again = OfficeRelay(self.output, avatars=('office-familje-pling',))
        again.start()
        again.stop()

    def test_new_session_clears_previous_fresh_file_before_opening_browser(self):
        first = OfficeRelay(self.output, avatars=('office-familje-pling',))
        first.start()
        try:
            self.connect_synthetic(first.pairing_url())
            file = self.output/'office-familje-pling.json'
            previous_fresh = file.read_bytes()
        finally:
            first.stop()
        # Equivalent disk state to a killed writer; no process is actually killed.
        file.write_bytes(previous_fresh)
        def refuse(url):
            self.assertFalse(file.exists(), 'Previous session identity survived a new start')
            return False
        with self.assertRaises(pairing.PairingUnavailable):
            pairing.run_pairing(self.target, refuse, threading.Event())
        self.assertFalse(file.exists())

    def test_interrupt_can_return_to_python_and_clears_real_connected_identity(self):
        class InterruptibleWait:
            def wait(self, timeout=None):
                if timeout is None:
                    raise AssertionError('An indefinite Windows lock wait can defer Ctrl+C')
                raise KeyboardInterrupt
        def browser(url):
            self.connect_synthetic(url)
            return True
        with contextlib.redirect_stdout(io.StringIO()):
            pairing.run_pairing(self.target, browser, InterruptibleWait())
        self.assertEqual(json.loads((self.output/'office-familje-pling.json').read_text())['identity'], 'unknown')

    def test_partial_thread_startup_does_not_hang_or_retain_writer(self):
        code = '''import json,sys,threading
from pathlib import Path
from unittest.mock import patch
from office_launcher import OfficeTarget
from office_relay import OfficeRelay
import office_pairing as p
data=json.load(sys.stdin);target=OfficeTarget(Path(data['engine']),Path(data['project']))
original=threading.Thread.start;calls=0
def start(thread):
 global calls
 calls+=1
 if calls==data['fail_at']:raise RuntimeError('Synthetic worker startup failure')
 return original(thread)
with patch('office_relay.threading.Thread.start',start):
 try:p.run_pairing(target,lambda _:False,threading.Event())
 except p.PairingUnavailable:pass
 else:raise AssertionError('Worker failure was not reported')
relay=OfficeRelay(target.project.parent/'Saved/OfficePresence',avatars=('office-familje-pling',))
relay.start();relay.stop()
print('writer released')
'''
        for fail_at in (1, 2):
            with self.subTest(fail_at=fail_at):
                try:
                    result = subprocess.run([sys.executable, '-c', code], input=json.dumps({
                        'engine':str(self.engine), 'project':str(self.project), 'fail_at':fail_at}),
                        text=True, capture_output=True, timeout=4,
                        env={**os.environ, 'PYTHONPATH':str(Path(__file__).parent)})
                except subprocess.TimeoutExpired:
                    self.fail('Partial relay startup hung during cleanup')
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn('writer released', result.stdout)

    def test_second_start_preserves_live_relay_projection(self):
        first = OfficeRelay(self.output, avatars=('office-familje-pling',))
        first.start()
        self.addCleanup(first.stop)
        self.connect_synthetic(first.pairing_url())
        file = self.output/'office-familje-pling.json'
        before = file.read_bytes()
        with self.assertRaises(pairing.PairingUnavailable):
            pairing.run_pairing(self.target, lambda _: self.fail('Second starter opened browser'), threading.Event())
        self.assertEqual(file.read_bytes(), before)

    def test_cli_rejects_untrusted_arguments_before_touching_target_and_never_echoes_them(self):
        with patch.object(pairing, 'default_target', side_effect=AssertionError('Invalid args touched target')):
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                self.assertEqual(pairing.main(['--pair', 'https://evil.example#secret']), 1)
            self.assertNotIn('evil.example', out.getvalue())
            self.assertNotIn('secret', out.getvalue())


if __name__ == '__main__':
    unittest.main()
