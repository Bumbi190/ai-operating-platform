import copy
import importlib.util
from pathlib import Path
import sys
import time
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parent))
from office_presence import AvatarBinding

P='22222222-2222-4222-8222-222222222222'
A='33333333-3333-4333-8333-333333333333'
R='44444444-4444-4444-8444-444444444444'

def data(now, *, observed=None, lease=None):
    from datetime import datetime,timezone
    iso=lambda t:datetime.fromtimestamp(t,timezone.utc).isoformat()
    return ({'schemaVersion':1,'source':'AUTHENTICATED_PROJECT_AGENT_MATCH_V036','verifiedIdentity':True,
      'verifiedAt':iso(now),'character':'pling','public3dBinding':'none','project':{'id':P,'slug':'synthetic','name':'Synthetic project'},'agent':{'id':A,'name':'Synthetic agent'}},
      {'schemaVersion':2,'dataSource':'authorized_organisation_read','generatedAt':iso(now),'availability':{'projects':True,'agents':True,'stepEvidence':True},
       'projects':[{'id':P,'slug':'synthetic','agents':[{'id':A,'executionEvidence':'unavailable','stepRequest':{'kind':'step_request_waiting_for_reply','runId':R,'stepOrder':0,'observedAt':iso(now-1 if observed is None else observed),'leaseUntil':iso(now+5 if lease is None else lease)}}]}]})

class ActivityReceiverTests(unittest.TestCase):
    def receiver(self):
        spec=importlib.util.find_spec('office_activity')
        self.assertIsNotNone(spec,'Activity receiver missing')
        from office_activity import ActivityPresenceReceiver
        return ActivityPresenceReceiver(AvatarBinding('office-familje-pling',P,A))

    def test_fixed_projection_and_claim_lease_cap(self):
        r=self.receiver();now=time.time();b,s=data(now)
        f=r.accept(b,s,now=now)
        self.assertEqual(f['schema'],'omnira.office.private-presence.v2')
        self.assertEqual(f['activity_kind'],'step_request_waiting_for_reply')
        self.assertAlmostEqual(f['activity_expires_at_unix'],now+5,places=3)
        self.assertEqual(f['status_text'],'Stegbegäran registrerad · körning ej verifierad')
        self.assertFalse(f['work_verified']);self.assertEqual(f['animation'],'ambient')
        exact_deadline=f['activity_expires_at_unix']
        self.assertEqual(r.view(now=exact_deadline)['activity_kind'],'none')
        self.assertEqual(r.view(now=exact_deadline)['identity'],'verified')

    def test_invalid_or_absent_lease_never_creates_activity(self):
        for lease in [None,'broken','2000-01-01T00:00:00Z',True]:
            r=self.receiver();now=time.time();b,s=data(now);s['projects'][0]['agents'][0]['stepRequest']['leaseUntil']=lease
            f=r.accept(b,s,now=now);self.assertEqual(f['identity'],'verified');self.assertEqual(f['activity_kind'],'none')

    def test_monotonic_expiry_cannot_be_renewed_by_new_identity(self):
        with patch('time.monotonic',return_value=100):
            r=self.receiver();now=time.time();b,s=data(now);r.accept(b,s,now=now)
        with patch('time.monotonic',return_value=106):
            # Wall clock and source remain plausible; monotonic deadline already passed.
            b2,s2=data(now+1,observed=now-1,lease=now+20)
            self.assertEqual(r.accept(b2,s2,now=now+1)['activity_kind'],'none')

    def test_replay_does_not_clear_or_extend_a_newer_frame(self):
        r=self.receiver();now=time.time();b,s=data(now);r.accept(b,s,now=now)
        b2,s2=data(now+1,observed=now-.5,lease=now+6);f=r.accept(b2,s2,now=now+1)
        replay=r.accept(b,s,now=now+1)
        self.assertEqual(replay['activity_expires_at_unix'],f['activity_expires_at_unix'])

    def test_answer_clears_activity_but_old_event_cannot_reappear(self):
        r=self.receiver();now=time.time();b,s=data(now);r.accept(b,s,now=now)
        b2,s2=data(now+1);s2['projects'][0]['agents'][0]['stepRequest']=None;r.accept(b2,s2,now=now+1)
        b3,s3=data(now+2,observed=now-1,lease=now+10)
        self.assertEqual(r.accept(b3,s3,now=now+2)['activity_kind'],'none')

    def test_unavailable_or_wrong_identity_clears_everything(self):
        r=self.receiver();now=time.time();b,s=data(now);r.accept(b,s,now=now)
        b['agent']['id']=P;f=r.accept(b,s,now=now)
        self.assertEqual(f['identity'],'unknown');self.assertEqual(f['activity_kind'],'none')

    def test_new_step_after_old_expiry_can_be_indicated(self):
        r=self.receiver();now=time.time();b,s=data(now);r.accept(b,s,now=now)
        r.view(now=now+6)
        b2,s2=data(now+7,observed=now+6,lease=now+15)
        self.assertEqual(r.accept(b2,s2,now=now+7)['activity_kind'],'step_request_waiting_for_reply')

    def test_renewal_cannot_serialize_a_later_deadline_for_the_same_event(self):
        with patch('time.monotonic',return_value=100):
            r=self.receiver();now=time.time();b,s=data(now,lease=now+30);first=r.accept(b,s,now=now)
        with patch('time.monotonic',return_value=108):
            b2,s2=data(now+8,observed=now-1,lease=now+38);later=r.accept(b2,s2,now=now+8)
            self.assertLessEqual(later['activity_expires_at_unix'],first['activity_expires_at_unix'])

    def test_projection_carries_event_identity_independent_of_deadline(self):
        r=self.receiver();now=time.time();b,s=data(now);f=r.accept(b,s,now=now)
        self.assertRegex(f.get('activity_event_key',''),r'^[a-f0-9]{64}$')
        self.assertAlmostEqual(f['activity_observed_at_unix'],now-1,places=3)

if __name__=='__main__':unittest.main()
