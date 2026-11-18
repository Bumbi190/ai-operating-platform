import hashlib,json,unittest
from workers.sales.tests.test_send_transport import SendTransportTests,snapshot

class InitialTransportTests(SendTransportTests):
 def initial(self,**changes):
  d=json.loads(snapshot()['sealedJson']);d.pop('sourceMessageId');d.update(version=2,kind='initial',contactId='30000000-0000-4000-8000-000000000001',contactVersion=1,offerRevisionId='40000000-0000-4000-8000-000000000001',historyRevisionId='70000000-0000-4000-8000-000000000001',ruleRevisionId='70000000-0000-4000-8000-000000000002',historyGapAccepted=True,inReplyTo=None,references=[])
  d.update(changes);raw=json.dumps(d);return {'sealedJson':raw,'snapshotSha256':hashlib.sha256(raw.encode()).hexdigest()}
 def test_initial_v2_exact_envelope_has_no_fabricated_reply_headers(self):
  from email import policy
  from email.parser import BytesParser
  result=self.send(s=self.initial());self.assertEqual(result['status'],'smtp_accepted')
  msg=BytesParser(policy=policy.default).parsebytes(self.smtp.raw)
  self.assertNotIn('In-Reply-To',msg);self.assertNotIn('References',msg);self.assertEqual(msg['To'],'andrehultgren190@gmail.com')
 def test_initial_cannot_smuggle_reply_headers(self):
  result=self.send(s=self.initial(inReplyTo='<fake@example.se>'));self.assertEqual(result['status'],'failed_before_send');self.assertEqual(self.store.reads,[]);self.assertIsNone(self.smtp)
 def test_initial_invalid_contact_version_never_authenticates(self):
  self.send(s=self.initial(contactVersion=True));self.assertEqual(self.store.reads,[])
 def test_initial_uncertain_recovery_never_sends_again(self):
  from workers.sales.tests.test_send_transport import SMTP
  def factory(*a,**kw):self.smtp=SMTP(*a,**kw);self.smtp.lose250=True;return self.smtp
  self.factory=factory;s=self.initial();first=self.send(s=s);self.assertEqual(first['status'],'delivery_unknown');self.assertEqual(self.send(s=s),first);self.assertEqual(self.permits,1)
