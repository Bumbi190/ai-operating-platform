"""Projection atomicity under actual Windows reader locks; synthetic identities only."""
import ctypes
import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from datetime import datetime, timezone
import office_presence as presence
from office_relay import OfficeRelay
from test_office_presence import fixtures, PROJECT, AGENT, NOW

def sharing_error(code=32):
    error = PermissionError(13, 'Synthetic Windows file sharing failure')
    error.winerror = code
    return error

def hold_reader(path):
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateFileW.argtypes = [ctypes.c_wchar_p, ctypes.c_uint32, ctypes.c_uint32,
                                  ctypes.c_void_p, ctypes.c_uint32, ctypes.c_uint32, ctypes.c_void_p]
    kernel.CreateFileW.restype = ctypes.c_void_p
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel.CloseHandle.restype = ctypes.c_int
    handle = kernel.CreateFileW(str(path), 0x80000000, 3, None, 3, 0, None)
    if handle == ctypes.c_void_p(-1).value:
        raise ctypes.WinError(ctypes.get_last_error())
    closed = threading.Event()
    def release():
        if not closed.is_set():
            if not kernel.CloseHandle(handle):
                raise ctypes.WinError(ctypes.get_last_error())
            closed.set()
    return release

class PresenceIOTests(unittest.TestCase):
    def receiver(self):
        receiver = presence.PresenceReceiver(presence.AvatarBinding('office-test-pling', PROJECT, AGENT))
        receiver.accept(*fixtures(), now=NOW)
        return receiver

    def test_one_sharing_conflict_recovers_without_leaving_staging_files(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'avatar.json'
            path.write_text('old bytes', encoding='utf8')
            replace = os.replace
            blocked = True
            def once(source, target):
                nonlocal blocked
                if blocked:
                    blocked = False
                    raise sharing_error()
                return replace(source, target)
            with patch('office_presence.os.replace', side_effect=once):
                try: presence.write_presence(path, self.receiver(), now=NOW)
                except OSError as error: self.fail('A short reader lock aborted publication: '+str(error))
            self.assertEqual(json.loads(path.read_text())['identity'], 'verified')
            self.assertEqual(sorted(p.name for p in Path(directory).iterdir()), ['avatar.json'])

    def test_expiry_during_retry_publishes_unknown_instead_of_cached_fresh_data(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'avatar.json'
            receiver = self.receiver()
            replace = os.replace
            with patch('office_presence.time.time', return_value=NOW+19.9) as clock:
                blocked = True
                def once(source, target):
                    nonlocal blocked
                    if blocked:
                        blocked = False
                        clock.return_value = NOW+21
                        raise sharing_error()
                    return replace(source, target)
                with patch('office_presence.os.replace', side_effect=once):
                    try: presence.write_presence(path, receiver)
                    except OSError as error: self.fail('A short lock prevented the expiry update: '+str(error))
            frame = json.loads(path.read_text())
            self.assertEqual((frame['identity'], frame['data_state']), ('unknown', 'stale'))
            self.assertIsNone(frame['expires_at_unix'])

    def test_permanent_access_denial_remains_bounded_and_atomic(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'avatar.json';path.write_text('original', encoding='utf8')
            start=time.monotonic()
            with patch('office_presence.os.replace', side_effect=sharing_error(5)):
                with self.assertRaises(PermissionError):
                    presence.write_presence(path, self.receiver(), now=NOW)
            self.assertLess(time.monotonic()-start,1.5)
            self.assertEqual(path.read_text(), 'original')
            self.assertEqual(sorted(p.name for p in Path(directory).iterdir()), ['avatar.json'])

    def request(self, relay, route, data):
        conn = http.client.HTTPConnection('127.0.0.1', relay.port, timeout=3)
        conn.request('POST', route, json.dumps(data), {'Origin':'https://omniraos.se',
                     'Authorization':'Bearer '+relay.session_key,'Content-Type':'application/json'})
        response=conn.getresponse();body=json.loads(response.read());status=response.status;conn.close()
        return status,body

    def bound(self, directory):
        relay=OfficeRelay(Path(directory),avatars=('office-test-pling',));relay.start()
        status,data=self.request(relay,'/bind',{'protocol':1,'avatarId':'office-test-pling','projectId':PROJECT,'agentId':AGENT})
        self.assertEqual(status,200)
        binding,snapshot=fixtures();stamp=datetime.now(timezone.utc).isoformat()
        binding['verifiedAt']=snapshot['generatedAt']=stamp
        return relay,{'protocol':1,'connectionId':data['connectionId'],'binding':binding,'snapshot':snapshot}


    @unittest.skipUnless(os.name=='nt','Actual Win32 reader sharing semantics')
    def test_short_actual_windows_reader_lock_does_not_break_http_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            relay,frame=self.bound(directory)
            release=hold_reader(Path(directory)/'office-test-pling.json')
            timer=threading.Timer(.08,release);timer.start()
            try:
                status,body=self.request(relay,'/snapshot',frame)
                self.assertEqual(status,200,'Short native reader lock must not terminate the browser connection')
                self.assertEqual(body['presence']['identity'],'verified')
                self.assertLessEqual(body['presence']['expires_at_unix'],datetime.fromisoformat(frame['snapshot']['generatedAt']).timestamp()+20)
                disk=json.loads(Path(directory,'office-test-pling.json').read_text())
                self.assertEqual(disk['identity'],'verified')
            finally:
                timer.join();release();relay.stop()

    @unittest.skipUnless(os.name=='nt','Actual Win32 reader sharing semantics')
    def test_persistent_actual_reader_lock_remains_bounded_and_atomic(self):
        with tempfile.TemporaryDirectory() as directory:
            relay,frame=self.bound(directory)
            target=Path(directory)/'office-test-pling.json';before=target.read_bytes()
            release=hold_reader(target)
            try:
                start=time.monotonic();status,_=self.request(relay,'/snapshot',frame)
                self.assertEqual(status,503)
                self.assertLess(time.monotonic()-start,1.5)
                self.assertEqual(target.read_bytes(),before)
                self.assertFalse(list(Path(directory).glob('*.tmp')))
            finally:release();relay.stop()

if __name__=='__main__':unittest.main()
