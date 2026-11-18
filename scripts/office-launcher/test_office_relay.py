"""Synthetic HTTP integration tests; this is not a live Omnira connection."""
import http.client
import json
from pathlib import Path
import tempfile
import time
import threading
import unittest
from unittest.mock import patch
from datetime import datetime, timezone
from test_office_presence import fixtures, PROJECT, AGENT
try:
    from office_relay import OfficeRelay
except ImportError:
    OfficeRelay = None

ORIGIN = 'https://omniraos.se'

class RelayTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(OfficeRelay, 'Paired Office relay is missing')
        self.tmp = tempfile.TemporaryDirectory()
        self.relay = OfficeRelay(Path(self.tmp.name), avatars=('office-test-pling',))
        self.relay.start()
        self.addCleanup(self.tmp.cleanup)
        self.addCleanup(self.relay.stop)

    def request(self, method, path, payload=None, **overrides):
        headers = {'Origin': ORIGIN, 'Authorization': 'Bearer ' + self.relay.session_key,
                   'Content-Type': 'application/json'}
        headers.update(overrides)
        connection = http.client.HTTPConnection('127.0.0.1', self.relay.port, timeout=3)
        connection.request(method, path, body=None if payload is None else json.dumps(payload), headers=headers)
        response = connection.getresponse()
        body = response.read()
        status, response_headers = response.status, dict(response.getheaders())
        connection.close()
        return status, json.loads(body) if body else None, response_headers

    def bind(self):
        result = self.request('POST', '/bind', {'protocol': 1, 'avatarId': 'office-test-pling',
                                             'projectId': PROJECT, 'agentId': AGENT})
        self.connection_id = result[1].get('connectionId')
        return result

    def frame(self):
        binding, snapshot = fixtures()
        stamp = datetime.now(timezone.utc).isoformat()
        binding['verifiedAt'] = snapshot['generatedAt'] = stamp
        return {'protocol': 1, 'connectionId': getattr(self, 'connection_id', None), 'binding': binding, 'snapshot': snapshot}

    def test_pairing_secret_is_fragment_only(self):
        url = self.relay.pairing_url()
        self.assertTrue(url.startswith(ORIGIN + '/atlas/office/connect#'))
        self.assertNotIn(self.relay.session_key, url.split('#')[0])
        self.assertEqual([p.name for p in Path(self.tmp.name).iterdir()], ['.office-relay.lock'])

    def test_status_and_preflight_are_exact_origin_and_private(self):
        status, body, headers = self.request('GET', '/status')
        self.assertEqual(status, 200)
        self.assertEqual(body['avatars'], ['office-test-pling'])
        self.assertEqual(headers['Cache-Control'], 'no-store')
        self.assertEqual(headers['Access-Control-Allow-Origin'], ORIGIN)
        status, _, _ = self.request('OPTIONS', '/snapshot', **{
            'Authorization': '', 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type'})
        self.assertEqual(status, 204)

    def test_rejects_missing_wrong_key_origin_host_and_query(self):
        for headers in ({'Authorization': ''}, {'Authorization': 'Bearer wrong'},
                        {'Origin': 'https://omniraos.se.evil.example'}, {'Origin': 'null'},
                        {'Origin': ''}, {'Host': 'evil.example'},
                        {'Host': 'localhost:' + str(self.relay.port)}):
            with self.subTest(headers=list(headers)):
                self.assertEqual(self.request('GET', '/status', **headers)[0], 403)
        self.assertEqual(self.request('GET', '/status?key=not-supported')[0], 404)

    def test_rejects_unbound_unknown_avatar_extra_fields_and_wrong_protocol(self):
        self.assertEqual(self.request('POST', '/snapshot', self.frame())[0], 409)
        for change in ({'avatarId': '../escape'}, {'avatarId': 'other-avatar'},
                       {'protocol': True}, {'extra': 'ignored-is-unsafe'}):
            data = {'protocol': 1, 'avatarId': 'office-test-pling', 'projectId': PROJECT, 'agentId': AGENT}
            data.update(change)
            self.assertEqual(self.request('POST', '/bind', data)[0], 400)
        self.assertEqual([p.name for p in Path(self.tmp.name).iterdir()], ['.office-relay.lock'])

    def test_synthetic_frame_writes_only_safe_projection_and_stop_clears_it(self):
        self.assertEqual(self.bind()[0], 200)
        frame = self.frame()
        frame['snapshot']['privatePrompt'] = 'DO NOT PERSIST'
        status, body, _ = self.request('POST', '/snapshot', frame)
        self.assertEqual((status, body['presence']['identity']), (200, 'verified'))
        self.assertFalse(body['presence']['work_verified'])
        saved = Path(self.tmp.name, 'office-test-pling.json')
        content = saved.read_text(encoding='utf-8')
        self.assertNotIn('DO NOT PERSIST', content)
        self.assertNotIn(self.relay.session_key, content)
        self.assertNotIn('description', content)
        self.relay.stop()
        self.assertEqual(json.loads(saved.read_text(encoding='utf-8'))['identity'], 'unknown')

    def test_scope_mismatch_clears_identity(self):
        self.bind()
        self.request('POST', '/snapshot', self.frame())
        frame = self.frame()
        frame['binding']['agent']['id'] = PROJECT
        status, body, _ = self.request('POST', '/snapshot', frame)
        self.assertEqual((status, body['presence']['identity']), (200, 'unknown'))

    def test_expired_snapshot_cannot_refresh_identity(self):
        self.bind()
        frame = self.frame()
        old = datetime.fromtimestamp(time.time() - 21, timezone.utc).isoformat()
        frame['binding']['verifiedAt'] = frame['snapshot']['generatedAt'] = old
        self.assertEqual(self.request('POST', '/snapshot', frame)[1]['presence']['identity'], 'unknown')

    def test_heartbeat_expires_disk_projection_without_another_browser_request(self):
        self.bind()
        self.request('POST', '/snapshot', self.frame())
        saved = Path(self.tmp.name, 'office-test-pling.json')
        with patch('office_presence.time.time', return_value=time.time() + 21):
            deadline = time.monotonic() + 2
            while time.monotonic() < deadline:
                if json.loads(saved.read_text(encoding='utf-8'))['identity'] == 'unknown':
                    break
                time.sleep(0.05)
        self.assertEqual(json.loads(saved.read_text(encoding='utf-8'))['data_state'], 'stale')

    def test_disconnect_clears_selected_identity(self):
        self.bind()
        self.request('POST', '/snapshot', self.frame())
        self.assertEqual(self.request('POST', '/disconnect', {'protocol': 1, 'connectionId': self.connection_id})[:2],
                         (200, {'protocol': 1, 'presence': None}))
        saved = Path(self.tmp.name, 'office-test-pling.json')
        self.assertEqual(json.loads(saved.read_text(encoding='utf-8'))['identity'], 'unknown')

    def test_transient_heartbeat_disk_failure_does_not_disable_expiry(self):
        from office_presence import write_presence
        self.bind()
        self.request('POST', '/snapshot', self.frame())
        failed = threading.Event()
        def fail_once(*args, **kwargs):
            if not failed.is_set():
                failed.set()
                raise OSError('Synthetic transient disk error')
            return write_presence(*args, **kwargs)
        with patch('office_relay.write_presence', side_effect=fail_once):
            self.assertTrue(failed.wait(2), 'Heartbeat must attempt the scheduled write')
            self.assertEqual(self.request('POST', '/snapshot', self.frame())[0], 200)
            saved = Path(self.tmp.name, 'office-test-pling.json')
            with patch('office_presence.time.time', return_value=time.time() + 21):
                deadline = time.monotonic() + 2
                while time.monotonic() < deadline:
                    if json.loads(saved.read_text(encoding='utf-8'))['identity'] == 'unknown':
                        break
                    time.sleep(0.05)
            self.assertEqual(json.loads(saved.read_text(encoding='utf-8'))['identity'], 'unknown')

    def test_output_directory_has_only_one_writer_and_can_be_reused_after_stop(self):
        self.bind()
        self.request('POST', '/snapshot', self.frame())
        other = OfficeRelay(Path(self.tmp.name), avatars=('office-test-pling',))
        with self.assertRaisesRegex(RuntimeError, 'active relay'):
            other.start()
        saved = Path(self.tmp.name, 'office-test-pling.json')
        self.assertEqual(json.loads(saved.read_text(encoding='utf-8'))['identity'], 'verified')
        other.stop()
        self.assertEqual(json.loads(saved.read_text(encoding='utf-8'))['identity'], 'verified')
        self.relay.stop()
        replacement = OfficeRelay(Path(self.tmp.name), avatars=('office-test-pling',))
        replacement.start()
        replacement.stop()

    def test_old_browser_connection_cannot_overwrite_or_clear_new_selection(self):
        first = self.bind()[1]
        self.assertIn('connectionId', first)
        old_frame = self.frame()
        second = self.bind()[1]
        self.assertNotEqual(first['connectionId'], second['connectionId'])
        self.assertEqual(self.request('POST', '/snapshot', old_frame)[0], 409)
        self.assertEqual(self.request('POST', '/snapshot', self.frame())[1]['presence']['identity'], 'verified')
        self.assertEqual(self.request('POST', '/disconnect', {
            'protocol': 1, 'connectionId': first['connectionId']})[0], 409)
        self.assertEqual(self.request('GET', '/status')[1]['presence']['identity'], 'verified')

    def test_oversized_payload_and_bad_content_type_are_rejected(self):
        # Header-first rejection is deterministic even on Windows, where closing
        # a socket with a fully queued unread body can surface as WinError 10053.
        connection = http.client.HTTPConnection('127.0.0.1', self.relay.port, timeout=3)
        connection.putrequest('POST', '/bind')
        for key, value in {'Origin': ORIGIN, 'Authorization': 'Bearer ' + self.relay.session_key,
                           'Content-Type': 'application/json', 'Content-Length': '300000'}.items():
            connection.putheader(key, value)
        connection.endheaders()
        response = connection.getresponse()
        self.assertEqual(response.status, 413)
        response.read()
        connection.close()
        self.assertEqual(self.request('POST', '/bind', {}, **{'Content-Type': 'text/plain'})[0], 415)

if __name__ == '__main__':
    unittest.main()
