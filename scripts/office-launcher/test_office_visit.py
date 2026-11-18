"""Real loopback/file boundaries; only upstream HTTPS and OS process are synthetic."""
from datetime import datetime, timezone, timedelta
import hashlib
import http.client
import importlib.util
import json
import socket
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

SPEC = importlib.util.find_spec('office_visit_relay')
if SPEC:
    from office_visit_relay import OfficeVisitRelay

P='22222222-2222-4222-8222-222222222222'
A='33333333-3333-4333-8333-333333333333'
AV='office-familje-pling'


class Lease:
    def __init__(self): self.live=True
    def alive(self): return self.live


class Source:
    def __init__(self):
        self.calls=0; self.revoked=0; self.entered=threading.Event(); self.release=threading.Event(); self.release.set()
        self.created=datetime.now(timezone.utc)
    def presence(self, visit, secret, permitted):
        self.calls+=1; self.entered.set(); self.release.wait(3)
        now=datetime.now(timezone.utc)
        stamp=now.isoformat()
        return {'visitId':visit,'avatarId':AV,'projectId':P,'agentId':A,'createdAt':self.created.isoformat(),
                'expiresAt':(self.created+timedelta(hours=4)).isoformat(), 'leaseUntil':(now+timedelta(seconds=30)).isoformat(), 'generatedAt':stamp,
                'binding':{'schemaVersion':1,'source':'AUTHENTICATED_PROJECT_AGENT_MATCH_V036',
                           'verifiedIdentity':True,'verifiedAt':stamp,'character':'pling','public3dBinding':'none',
                           'project':{'id':P,'slug':'synthetic','name':'Synthetic project'},'agent':{'id':A,'name':'Synthetic agent'}},
                'snapshot':{'schemaVersion':2,'dataSource':'authorized_organisation_read','generatedAt':stamp,
                            'availability':{'projects':True,'agents':True,'stepEvidence':False},
                            'projects':[{'id':P,'slug':'synthetic','agents':[{'id':A,'executionEvidence':'unavailable','stepRequest':None}]}]}}
    def revoke(self, visit, secret): self.revoked+=1


class VisitTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(SPEC,'Office visit companion missing')
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.lease=Lease();self.source=Source()
        self.relay=OfficeVisitRelay(Path(self.tmp.name),self.lease,self.source)
        self.relay.start();self.addCleanup(self.relay.stop)
    def call(self,path='/status',body=None,**headers):
        conn=http.client.HTTPConnection('127.0.0.1',self.relay.port,timeout=4)
        values={'Origin':'https://omniraos.se','Authorization':'Bearer '+self.relay.session_key,**headers}
        if body is not None: values['Content-Type']='application/json'
        conn.request('GET' if body is None else 'POST',path,None if body is None else json.dumps(body),values)
        response=conn.getresponse();text=response.read();conn.close()
        return response.status,json.loads(text) if text else None
    def attach(self):
        status,data=self.call();self.assertEqual(status,200)
        return self.call('/attach',{'protocol':2,'stage':'prepare','visitId':data['visitId'],'avatarId':AV,'projectId':P,'agentId':A})
    def wait_for(self,predicate):
        end=time.monotonic()+3
        while not predicate() and time.monotonic()<end: time.sleep(.02)
        self.assertTrue(predicate())
    def projection(self):return json.loads((Path(self.tmp.name)/(AV+'.json')).read_text('utf-8'))
    def test_status_exposes_digest_but_never_native_secret(self):
        status,data=self.call();self.assertEqual(status,200);self.assertEqual(data['protocol'],2)
        self.assertRegex(data['secretDigest'],r'^[0-9a-f]{64}$')
        self.assertNotIn(self.relay._secret,json.dumps(data));self.assertNotIn(self.relay._secret,self.relay.pairing_url())
        self.assertEqual(self.source.calls,0)
    def test_exact_origin_host_key_and_legacy_routes_fail_closed(self):
        for headers in [{'Origin':'https://evil.test'},{'Host':'localhost:'+str(self.relay.port)},{'Authorization':'Bearer wrong'}]:
            self.assertEqual(self.call(**headers)[0],403)
        for route in ['/bind','/snapshot','/status?x=1']:
            self.assertEqual(self.call(route,{'protocol':1})[0],404)
    def test_only_native_fetch_publishes_selected_identity(self):
        self.assertEqual(self.attach()[0],202)
        self.wait_for(lambda:self.call()[1]['acknowledged'])
        data=self.projection();self.assertEqual(data['identity'],'verified');self.assertFalse(data['work_verified'])
        self.assertEqual(data['agent_text'],'Synthetic agent')
        self.assertEqual(self.source.calls,1)
    def test_second_writer_cannot_take_over(self):
        other=OfficeVisitRelay(Path(self.tmp.name),self.lease,Source())
        with self.assertRaises(RuntimeError):other.start()
        self.assertEqual(self.call()[0],200)
    def test_exit_during_network_request_discards_frame_and_stops_requests(self):
        self.source.release.clear();self.attach();self.assertTrue(self.source.entered.wait(2))
        self.lease.live=False
        self.wait_for(lambda:self.relay._halt.is_set())
        self.source.release.set();time.sleep(.1)
        self.assertNotEqual(self.projection()['identity'],'verified')
        self.relay.stop();self.assertEqual(self.source.calls,1);self.assertEqual(self.source.revoked,1)
    def test_explicit_disconnect_clears_verified_data(self):
        self.attach();self.wait_for(lambda:self.call()[1]['acknowledged'])
        visit=self.call()[1]['visitId']
        self.assertEqual(self.call('/disconnect',{'protocol':2,'visitId':visit})[0],200)
        self.assertEqual(self.projection()['identity'],'unknown')
    def test_mismatched_native_scope_never_acknowledges(self):
        original=self.source.presence
        def wrong(*args):
            result=original(*args);result['agentId']='44444444-4444-4444-8444-444444444444';return result
        self.source.presence=wrong
        self.attach();self.wait_for(lambda:self.relay._halt.is_set())
        self.assertFalse(self.call()[1]['acknowledged']);self.assertEqual(self.projection()['identity'],'unknown')

    def test_preacquired_writer_lease_is_retained_during_start(self):
        with tempfile.TemporaryDirectory() as tmp:
            relay=OfficeVisitRelay(Path(tmp),self.lease,Source())
            relay._acquire_writer()
            handle=relay._writer_lease
            try:
                relay.start();self.assertIs(relay._writer_lease,handle)
            finally:relay.stop()

    def test_unexposed_failed_start_makes_no_server_request(self):
        other=Source();relay=OfficeVisitRelay(Path(self.tmp.name),None,other)
        relay.stop()
        self.assertEqual(other.calls,0);self.assertEqual(other.revoked,0)

    def test_monotonic_visit_deadline_cannot_be_extended_by_clock_change(self):
        self.attach();self.wait_for(lambda:self.call()[1]['acknowledged'])
        self.relay._deadline=time.monotonic()-.1
        self.wait_for(lambda:self.relay._halt.is_set())
        self.wait_for(lambda:self.projection()['identity']=='unknown')
        self.assertEqual(self.projection()['identity'],'unknown')

    def test_process_monitor_is_not_blocked_by_a_slow_projection_write(self):
        entered,released=threading.Event(),threading.Event()
        def slow_write():entered.set();released.wait(2)
        with patch.object(self.relay,'_write',side_effect=slow_write):
            try:
                self.assertTrue(entered.wait(1.5))
                self.lease.live=False
                observed=self.relay._halt.wait(.6)
            finally:released.set()
        self.assertTrue(observed,'Disk I/O delayed game-exit detection')

    def test_unconfirmed_attach_expires_without_renewable_polling(self):
        self.attach();self.wait_for(lambda:self.call()[1]['acknowledged'])
        self.relay._pending_deadline=time.monotonic()-.1
        self.wait_for(lambda:self.relay._halt.is_set())
        self.wait_for(lambda:self.projection()['identity']=='unknown')
        self.assertEqual(self.source.calls,1)

    def test_last_frame_never_outlives_hard_expiry_without_more_writes(self):
        original=self.source.presence
        deadline=datetime.now(timezone.utc)+timedelta(seconds=1.5)
        def last_frame(*args):
            data=original(*args);data['expiresAt']=deadline.isoformat();data['leaseUntil']=deadline.isoformat();return data
        self.source.presence=last_frame
        self.attach();self.wait_for(lambda:self.call()[1]['acknowledged'])
        self.assertLessEqual(self.projection()['expires_at_unix'],deadline.timestamp())

    def test_slow_local_headers_do_not_hold_shutdown_and_writer(self):
        connection=socket.create_connection(('127.0.0.1',self.relay.port))
        connection.sendall(b'POST /attach HTTP/1.1\r\nHost: ')
        time.sleep(.1)
        started=time.monotonic()
        try:self.relay.stop()
        finally:connection.close()
        self.assertLess(time.monotonic()-started,1,'Incomplete HTTP held the writer')

    def test_late_failed_worker_cannot_write_after_new_relay_acquires_writer(self):
        entered,released=threading.Event(),threading.Event()
        def late_failure(*args):
            entered.set();released.wait(12);raise OSError('Late upstream failure')
        self.source.presence=late_failure;self.attach();self.assertTrue(entered.wait(2))
        self.relay.stop()
        replacement=OfficeVisitRelay(Path(self.tmp.name),Lease(),Source())
        replacement.start()
        try:
            connection=http.client.HTTPConnection('127.0.0.1',replacement.port,timeout=3)
            headers={'Origin':'https://omniraos.se','Authorization':'Bearer '+replacement.session_key,'Content-Type':'application/json'}
            connection.request('GET','/status',headers=headers);data=json.loads(connection.getresponse().read());connection.close()
            connection=http.client.HTTPConnection('127.0.0.1',replacement.port,timeout=3)
            connection.request('POST','/attach',json.dumps({'protocol':2,'stage':'prepare','visitId':data['visitId'],'avatarId':AV,'projectId':P,'agentId':A}),headers)
            self.assertEqual(connection.getresponse().status,202);connection.close()
            self.wait_for(lambda:self.projection()['identity']=='verified')
            released.set();self.relay._threads[2].join(timeout=1)
            self.assertEqual(self.projection()['identity'],'verified')
        finally:released.set();replacement.stop()


if __name__=='__main__':unittest.main()
