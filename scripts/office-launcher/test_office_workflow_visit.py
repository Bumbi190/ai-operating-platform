"""Real loopback/file/receiver tests; source HTTP and game lease are synthetic."""
import copy
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
import test_office_visit as fixture
from test_office_visit import Lease, Source, P, A, AV
from office_presence import AvatarBinding, write_presence
from office_visit_relay import OfficeVisitRelay
from office_workflow import WorkflowVisitPresenceReceiver, SCHEMA
from workflow_ack_fixture import FixtureNativeAck

class WorkflowSource(Source):
    state='idle'
    def workflow_presence(self, visit, secret, permitted):
        self.calls+=1;self.entered.set();self.release.wait(3)
        now=time.time()
        return {'schema':'omnira.office.workflow-state.v1','scope':'workflow_state_v1',
                'visit_id':visit,'avatar_id':AV,'project_id':P,'agent_id':A,
                'revision':self.calls,'observed_at_unix':now,'expires_at_unix':now+20,
                'workflow_state':self.state,'coverage':'incomplete' if self.state=='unknown' else 'complete',
                'execution':'not_verified'}

class WorkflowFrameTests(unittest.TestCase):
    def setUp(self):
        self.source=WorkflowSource();self.visit='019a7d46-1222-7000-8000-000000000001'
        self.receiver=WorkflowVisitPresenceReceiver(AvatarBinding(AV,P,A),self.visit)
    def data(self):return self.source.workflow_presence(self.visit,'synthetic',lambda:True)
    def test_unavailable_defaults_hold_and_only_complete_idle_releases(self):
        frame=self.receiver.view();self.assertEqual(frame['identity'],'unknown');self.assertTrue(frame['workflow_busy']);self.assertFalse(frame['workflow_state_known'])
        for state in ('idle','busy','unknown'):
            self.source.state=state;frame=self.receiver.accept_authorized(self.data())
            self.assertEqual(frame['schema'],SCHEMA);self.assertEqual(frame['identity'],'verified')
            self.assertEqual(frame['workflow_busy'],state!='idle');self.assertEqual(frame['workflow_state_known'],state!='unknown')
            self.assertEqual(frame['execution'],'not_verified');self.assertFalse(frame['work_verified'])
    def test_replay_changed_binding_and_extra_content_hold(self):
        for mutate in (lambda d:d.update(project_id=A),lambda d:d.update(prompt='SECRET'),lambda d:d.update(coverage='incomplete'),lambda d:d.update(revision=True),lambda d:d.update(scope='step_activity_v1')):
            receiver=WorkflowVisitPresenceReceiver(AvatarBinding(AV,P,A),self.visit);data=self.data();receiver.accept_authorized(data);data=copy.deepcopy(data);mutate(data)
            with self.assertRaises(ValueError):receiver.accept_authorized(data)
            self.assertTrue(receiver.view()['workflow_busy']);self.assertEqual(receiver.view()['identity'],'unknown')
    def test_duplicate_frame_never_changes_bytes_or_renews_monotonic_deadline(self):
        data=self.data();self.receiver.accept_authorized(data);deadline=self.receiver._native_deadline
        initial=self.receiver.view();time.sleep(.01);self.receiver.accept_authorized(data)
        self.assertEqual(initial,self.receiver.view());self.assertLessEqual(self.receiver._native_deadline,deadline)
        self.receiver._native_deadline=time.monotonic()-1
        self.assertEqual(self.receiver.view()['identity'],'unknown');self.assertTrue(self.receiver.view()['workflow_busy'])
    def test_atomic_writer_accepts_only_receiver_and_clears_after_expiry(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'frame.json';self.receiver.accept_authorized(self.data());write_presence(path,self.receiver)
            self.assertFalse(json.loads(path.read_text())['workflow_busy'])
            self.receiver._native_deadline=time.monotonic()-1;write_presence(path,self.receiver)
            self.assertTrue(json.loads(path.read_text())['workflow_busy']);self.assertEqual(list(Path(tmp).glob('*.tmp')),[])
            with self.assertRaises(TypeError):write_presence(path,self.data())

class WorkflowVisitTests(unittest.TestCase):
    call=fixture.VisitTests.call;wait_for=fixture.VisitTests.wait_for;projection=fixture.VisitTests.projection
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.lease=Lease();self.source=WorkflowSource()
        self.relay=OfficeVisitRelay(Path(self.tmp.name),self.lease,self.source,workflow=True)
        self.relay.start();self.addCleanup(self.relay.stop)
        self.native=FixtureNativeAck(Path(self.tmp.name)).start();self.addCleanup(self.native.stop)
    def payload(self,stage='prepare',scope='workflow_state_v1'):
        return {'protocol':2,'stage':stage,'visitId':self.call()[1]['visitId'],'avatarId':AV,'projectId':P,'agentId':A,'readScope':scope}
    def attach(self):return self.call('/attach',self.payload())
    def test_capability_is_not_authority_and_legacy_visit_stays_legacy(self):
        status=self.call()[1];self.assertEqual(status['workflowProtocol'],1);self.assertNotIn('readScope',status);self.assertEqual(self.source.calls,0)
        payload=self.payload();payload.pop('readScope');self.assertEqual(self.call('/attach',payload)[0],202)
        self.wait_for(lambda:self.call()[1]['acknowledged']);self.assertEqual(self.projection()['schema'],'omnira.office.private-presence.v1');self.assertFalse(self.relay.workflow)
    def test_explicit_scope_and_same_binding_required_for_confirm(self):
        self.assertEqual(self.attach()[0],202);self.wait_for(lambda:self.call()[1]['acknowledged'])
        bad=self.payload('confirm','step_activity_v1');self.assertEqual(self.call('/attach',bad)[0],400)
        bad=self.payload('confirm');bad['agentId']=P;self.assertEqual(self.call('/attach',bad)[0],409)
        status,data=self.call('/attach',self.payload('confirm'));self.assertEqual(status,200);self.assertEqual(data['readScope'],'workflow_state_v1');self.assertEqual(data['workflowProtocol'],1)
        self.assertTrue(self.relay._committed.is_set());self.assertFalse(self.projection()['workflow_busy'])
    def test_game_exit_clears_to_unknown_hold_without_waiting_for_another_poll(self):
        self.attach();self.wait_for(lambda:self.call()[1]['acknowledged']);self.lease.live=False
        self.wait_for(lambda:self.projection()['identity']=='unknown');frame=self.projection()
        self.assertEqual(frame['schema'],SCHEMA);self.assertTrue(frame['workflow_busy']);self.assertFalse(frame['workflow_state_known'])
    def test_explicit_disconnect_clears_and_stop_revokes_once(self):
        self.attach();self.wait_for(lambda:self.call()[1]['acknowledged'])
        self.assertEqual(self.call('/disconnect',{'protocol':2,'visitId':self.relay.visit_id})[0],200)
        self.assertTrue(self.projection()['workflow_busy']);self.relay.stop();self.relay.stop();self.assertEqual(self.source.revoked,1)
    def test_scope_cannot_be_upgraded_after_attach_and_unconfirmed_visit_expires(self):
        payload=self.payload();payload.pop('readScope');self.call('/attach',payload);self.wait_for(lambda:self.call()[1]['acknowledged'])
        self.assertEqual(self.call('/attach',self.payload('confirm'))[0],409)
        self.relay._pending_deadline=time.monotonic()-1;self.wait_for(lambda:self.relay._halt.is_set());self.assertFalse(self.call()[1]['acknowledged'])
    def test_late_source_cannot_revive_a_closed_game(self):
        self.source.release.clear();self.attach();self.assertTrue(self.source.entered.wait(2))
        self.lease.live=False;self.wait_for(lambda:self.relay._halt.is_set());self.source.release.set()
        time.sleep(.05);self.assertEqual(self.projection()['identity'],'unknown');self.assertFalse(self.call()[1]['acknowledged'])
    def test_workflow_scope_is_refused_without_local_capability(self):
        self.relay._workflow_capable=False
        self.assertEqual(self.attach()[0],400);self.assertEqual(self.source.calls,0)
    def test_absent_native_prepared_ack_never_polls_or_confirms(self):
        self.native.stop();self.attach();time.sleep(.15)
        self.assertEqual(self.source.calls,0);self.assertFalse(self.call()[1]['acknowledged'])
        self.relay._pending_deadline=time.monotonic()-1;self.wait_for(lambda:self.relay._halt.is_set())
        self.assertTrue(self.projection()['workflow_busy'])
    def test_source_error_or_wrong_binding_cannot_acknowledge_or_keep_idle(self):
        original=self.source.workflow_presence
        def wrong(*args):
            data=original(*args);data['agent_id']=P;return data
        self.source.workflow_presence=wrong;self.attach();self.wait_for(lambda:self.relay._halt.is_set())
        self.assertFalse(self.call()[1]['acknowledged']);self.assertTrue(self.projection()['workflow_busy'])

if __name__=='__main__':unittest.main()
