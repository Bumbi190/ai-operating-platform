import json
from pathlib import Path
import tempfile
import unittest
import test_office_visit as fixture
from test_office_visit import Lease, Source, P, A, AV
from office_visit_relay import OfficeVisitRelay

class ActivitySource(Source):
    activity=False
    def presence(self,*args):
        result=super().presence(*args)
        if self.activity:
            result.update(readScope='step_activity_v1',nativeActivityProtocol=1)
            result['snapshot']['availability']['stepEvidence']=True
            result['snapshot']['projects'][0]['agents'][0]['stepRequest']={
                'kind':'step_request_waiting_for_reply','runId':'44444444-4444-4444-8444-444444444444',
                'stepOrder':0,'observedAt':self.created.isoformat(),'leaseUntil':result['leaseUntil']}
        return result

class ActivityRelayTests(unittest.TestCase):
    call=fixture.VisitTests.call
    wait_for=fixture.VisitTests.wait_for
    projection=fixture.VisitTests.projection
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.lease=Lease();self.source=ActivitySource()
        self.relay=OfficeVisitRelay(Path(self.tmp.name),self.lease,self.source,activity=True)
        self.relay.start();self.addCleanup(self.relay.stop)
    def attach(self,activity=False):
        self.source.activity=activity
        body={'protocol':2,'stage':'prepare','visitId':self.call()[1]['visitId'],'avatarId':AV,'projectId':P,'agentId':A}
        if activity:body['readScope']='step_activity_v1'
        return self.call('/attach',body)
    def test_capability_does_not_expand_a_legacy_visit(self):
        self.assertEqual(self.call()[1]['activityProtocol'],1)
        self.assertEqual(self.attach()[0],202)
        self.wait_for(lambda:self.call()[1]['acknowledged'])
        self.assertEqual(self.projection()['schema'],'omnira.office.private-presence.v1')
        self.assertNotIn('readScope',self.call()[1])
    def test_explicit_activity_reaches_v2_and_exit_clears(self):
        self.assertEqual(self.attach(True)[0],202)
        self.wait_for(lambda:self.call()[1]['acknowledged'])
        frame=self.projection();self.assertEqual(frame['schema'],'omnira.office.private-presence.v2')
        self.assertEqual(frame['activity_kind'],'step_request_waiting_for_reply')
        self.assertFalse(frame['work_verified'])
        self.lease.live=False;self.wait_for(lambda:self.projection()['identity']=='unknown')
        self.assertNotEqual(self.projection().get('activity_kind'),'step_request_waiting_for_reply')
        self.assertEqual(self.projection()['identity'],'unknown')
    def test_wrong_scope_from_source_cannot_attach_activity(self):
        self.source.activity=False
        body={'protocol':2,'stage':'prepare','visitId':self.call()[1]['visitId'],'avatarId':AV,'projectId':P,'agentId':A,'readScope':'step_activity_v1'}
        self.assertEqual(self.call('/attach',body)[0],202)
        self.wait_for(lambda:self.relay._halt.is_set())
        self.assertFalse(self.call()[1]['acknowledged'])
        self.assertEqual(self.projection()['identity'],'unknown')

    def test_boolean_native_protocol_is_not_an_integer_version(self):
        original=self.source.presence
        def wrong(*args):
            result=original(*args);result['nativeActivityProtocol']=True;return result
        self.source.presence=wrong
        self.assertEqual(self.attach(True)[0],202)
        self.wait_for(lambda:self.relay._halt.is_set())
        self.assertFalse(self.call()[1]['acknowledged'])

if __name__=='__main__':unittest.main()
