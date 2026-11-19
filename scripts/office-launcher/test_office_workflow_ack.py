"""Receipt parser and lifecycle tests, including missing/torn/forged native acks."""
import copy,json,tempfile,time
from pathlib import Path
import unittest
from office_presence import AvatarBinding
from office_workflow import WorkflowVisitPresenceReceiver
from office_workflow_ack import KEYS,SCHEMA,read_native_ack

V='019a7d46-1222-7000-8000-000000000001';P='22222222-2222-4222-8222-222222222222';A='33333333-3333-4333-8333-333333333333';AV='office-familje-pling'
class NativeAckTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.path=Path(self.tmp.name)/'native.json'
        self.receiver=WorkflowVisitPresenceReceiver(AvatarBinding(AV,P,A),V)
    def write(self,frame,phase):
        data={k:frame[k] for k in KEYS-{'schema','scope','phase'}};data.update(schema=SCHEMA,scope='workflow_state_v1',phase=phase);self.path.write_text(json.dumps(data));return data
    def active(self):
        now=time.time();self.receiver.accept_authorized({'schema':'omnira.office.workflow-state.v1','scope':'workflow_state_v1','visit_id':V,'avatar_id':AV,'project_id':P,'agent_id':A,'revision':1,'observed_at_unix':now,'expires_at_unix':now+20,'workflow_state':'idle','coverage':'complete','execution':'not_verified'});return self.receiver.view()
    def test_preparing_hold_has_finite_lease_and_requires_matching_native_prepared_ack(self):
        frame=self.receiver.view();self.assertEqual(frame['visit_state'],'preparing');self.assertTrue(frame['workflow_busy']);self.assertFalse(frame['workflow_state_known']);self.assertLessEqual(frame['expires_at_unix']-frame['observed_at_unix'],15)
        self.assertIsNone(read_native_ack(self.path,frame,'prepared'));self.write(frame,'prepared');self.assertGreater(read_native_ack(self.path,frame,'prepared'),time.monotonic());self.assertIsNone(read_native_ack(self.path,frame,'applied'))
    def test_active_ack_requires_exact_binding_state_revision_and_deadline(self):
        frame=self.active();self.write(frame,'applied');self.assertGreater(read_native_ack(self.path,frame,'applied'),time.monotonic())
        for change in ({'visit_id':A},{'project_id':A},{'agent_id':P},{'schema':'test_only'},{'scope':'identity_v1'},{'phase':'prepared'},{'revision':True},{'revision':2},{'workflow_busy':True},{'workflow_state_known':1},{'expires_at_unix':frame['expires_at_unix']+1},{'execution':'verified'}):
            bad=self.write(frame,'applied');bad.update(change);self.path.write_text(json.dumps(bad));self.assertIsNone(read_native_ack(self.path,frame,'applied'),str(change))
    def test_native_double_integer_revision_is_accepted_without_boolean_coercion(self):
        frame=self.active();data=self.write(frame,'applied');data['revision']=1.0;self.path.write_text(json.dumps(data));self.assertIsNotNone(read_native_ack(self.path,frame,'applied'))
    def test_torn_oversized_duplicate_and_extra_payloads_fail_closed(self):
        frame=self.active();data=self.write(frame,'applied')
        for text in ('{',' '.join(['x']*4097),'[]',json.dumps({**data,'prompt':'SECRET'}),json.dumps(data)[:-1]+',"revision":1}'):
            self.path.write_text(text);self.assertIsNone(read_native_ack(self.path,frame,'applied'))
    def test_same_ack_never_exceeds_accepted_source_monotonic_deadline(self):
        from office_visit_relay import OfficeVisitRelay
        from test_office_visit import Lease,Source
        relay=OfficeVisitRelay(Path(self.tmp.name),Lease(),Source(),workflow=True)
        relay.workflow=True;relay._receiver=self.receiver;frame=self.active();self.path=Path(self.tmp.name)/(AV+'.json.native-ack.json');self.write(frame,'applied')
        for _ in range(3):self.assertTrue(relay._native_workflow_ack('applied'));self.assertLessEqual(relay._native_receipt_deadline,self.receiver._native_deadline)
    def test_closed_receiver_cannot_accept_new_source_or_release_hold(self):
        receiver=WorkflowVisitPresenceReceiver(AvatarBinding(AV,P,A),V,closed=True);frame=receiver.view();self.assertEqual(frame['visit_state'],'closed');self.assertTrue(frame['workflow_busy']);self.assertEqual(frame['revision'],0)
        with self.assertRaises(ValueError):receiver.accept_authorized({})

if __name__=='__main__':unittest.main()
