import hashlib,json,ssl,tempfile,unittest
from pathlib import Path
from datetime import datetime,timezone,timedelta
from email import policy
from email.parser import BytesParser
from workers.sales.journal import Journal
from workers.sales.sending.transport import send_once
def snapshot(**changes):
 d={'version':1,'projectId':'8f673c09-1c8f-4d78-876e-4c14bf1c89b3','ownerId':'d63a09fb-448e-41b8-9fb2-9a608f5f1800','revisionId':'91736c50-3db6-4d68-86f8-1660672fed0f','revisionHash':'a'*64,'sourceJobId':'9ff8cf88-41e6-4951-8bf1-4c1af09d6901','sourceMessageId':'846ed8ed-f3e5-4356-8608-8dafc9046f40','mailboxId':'5964032c-aad9-47c5-b986-71dc7339d775','mailboxGeneration':6,'workerId':'49d30271-cf0b-47c9-a70d-2bce5b9b09ba','policyId':'b1131538-9775-4f03-bede-9cb86d49f789','policyVersion':1,'senderEmail':'info@handlarborsen.se','senderName':'Andre','toEmail':'andrehultgren190@gmail.com','subject':'Svar på test','body':'Hej!\n\nTack för ditt svar.\n\nAndre','messageId':'<synthetic-send-test@handlarborsen.se>','date':'Sun, 18 Oct 2026 09:00:00 +0000','inReplyTo':'<saved@example.se>','references':['<original@example.se>']}
 d.update(changes);s=json.dumps(d,ensure_ascii=False,separators=(',',':'))
 return {'sealedJson':s,'snapshotSha256':hashlib.sha256(s.encode()).hexdigest()}
class Store:
 def __init__(self):self.reads=[]
 def read(self,key):self.reads.append(key);return 'secret-test-password'
class SMTP:
 def __init__(self,*args,**kwargs):self.args=args;self.kwargs=kwargs;self.calls=[];self.raw=None;self.lose250=False
 def set_debuglevel(self,v):self.calls.append(('debug',v))
 def ehlo(self):return 250,b'ok'
 def login(self,user,password):self.calls.append(('auth',user));return 235,b'ok'
 def mail(self,address):self.calls.append(('mail',address));return 250,b'ok'
 def rcpt(self,address):self.calls.append(('rcpt',address));return 250,b'ok'
 def data(self,raw):
  self.calls.append(('data',));self.raw=raw
  if self.lose250:raise TimeoutError('secret-test-password arbitrary server transcript')
  return 250,b'accepted arbitrary text'
 def close(self):self.calls.append(('close',))
class SendTransportTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);p=Path(self.tmp.name)
  self.mb=Journal(p/'mailbox.json');self.mb.save({'active':{'mailboxId':'5964032c-aad9-47c5-b986-71dc7339d775','generation':6,'email':'info@handlarborsen.se','credentialRef':'test-secret-ref'}})
  self.dispatch=Journal(p/'send.json');self.store=Store();self.smtp=None;self.permits=0
 def factory(self,*args,**kw):self.smtp=SMTP(*args,**kw);return self.smtp
 def permit(self):
  self.permits+=1
  return {'dispatchBefore':(datetime.now(timezone.utc)+timedelta(seconds=5)).isoformat(),'snapshotSha256':self.s['snapshotSha256']}
 def send(self,**kw):
  self.s=kw.pop('s',snapshot());return send_once(self.s,self.store,self.mb,self.dispatch,self.factory,begin_dispatch=kw.pop('permit',self.permit))
 def test_ssl_and_exact_plaintext_envelope(self):
  result=self.send();self.assertEqual(result['status'],'smtp_accepted');self.assertEqual(self.smtp.args,('smtp.strato.de',465));ctx=self.smtp.kwargs['context'];self.assertEqual(ctx.verify_mode,ssl.CERT_REQUIRED);self.assertTrue(ctx.check_hostname);self.assertGreaterEqual(ctx.minimum_version,ssl.TLSVersion.TLSv1_2)
  m=BytesParser(policy=policy.default).parsebytes(self.smtp.raw);self.assertEqual(m['From'],'Andre <info@handlarborsen.se>');self.assertEqual(m['To'],'andrehultgren190@gmail.com');self.assertEqual(m['In-Reply-To'],'<saved@example.se>');self.assertNotIn('Bcc',m);self.assertNotIn('Cc',m);self.assertEqual(m.get_content().replace('\r\n','\n').rstrip('\n'),json.loads(self.s['sealedJson'])['body'])
 def test_double_invocation_one_data(self):
  first=self.send();self.assertEqual(self.send(),first);self.assertEqual(self.permits,1);self.assertEqual(len(self.store.reads),1)
 def test_hash_mismatch_never_reads_secret(self):
  s=snapshot();s['sealedJson']+=' ';self.send(s=s);self.assertEqual(self.store.reads,[]);self.assertIsNone(self.smtp)
 def test_header_injection_never_reads_secret(self):
  self.send(s=snapshot(subject='Test\r\nBcc: evil@example.se'));self.assertEqual(self.store.reads,[])
 def test_changed_active_mailbox_never_reads_secret(self):
  v=self.mb.load();v['active']['generation']=7;self.mb.save(v);self.send();self.assertEqual(self.store.reads,[])
 def test_expired_permit_never_reaches_mail(self):
  self.send(permit=lambda:{'dispatchBefore':'2000-01-01T00:00:00Z','snapshotSha256':self.s['snapshotSha256']});self.assertFalse(any(c[0]=='mail' for c in self.smtp.calls))
 def test_lost250_does_not_resend_or_log_secret(self):
  def factory(*a,**kw):self.smtp=SMTP(*a,**kw);self.smtp.lose250=True;return self.smtp
  self.factory=factory;result=self.send();self.assertEqual(result['status'],'delivery_unknown');self.assertEqual(self.send(),result);self.assertNotIn('secret-test-password',json.dumps(self.dispatch.load()));self.assertNotIn('arbitrary',json.dumps(result));self.assertEqual(self.permits,1)
 def test_existing_dispatch_intent_never_connects(self):
  self.dispatch.save({'snapshotSha256':snapshot()['snapshotSha256'],'phase':'dispatching','mimeSha256':'c'*64});self.assertEqual(self.send()['status'],'delivery_unknown');self.assertIsNone(self.smtp)
