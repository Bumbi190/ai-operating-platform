import base64,ssl,tempfile,unittest
from pathlib import Path
from workers.sales.mailbox.probe import probe_strato
from workers.sales.mailbox.setup import process_mailbox_setup
from workers.sales.journal import Journal
class Socket:
 def settimeout(self,value):pass
class SMTP:
 def __init__(self,*a,**k):self.calls=[];self.sock=Socket();self.esmtp_features={'auth':'PLAIN LOGIN'};self.arguments=(a,k)
 def set_debuglevel(self,v):self.calls.append(('debug',v))
 def ehlo(self):self.calls.append(('EHLO',));return (250,b'ok')
 def docmd(self,command,value=''):self.calls.append((command,value));return (334,b'') if command=='AUTH' and value=='PLAIN' else (235,b'ok')
 def quit(self):self.calls.append(('QUIT',))
 def close(self):self.calls.append(('CLOSE',))
class IMAP:
 def __init__(self,*a,**k):self.calls=[];self.sock=Socket();self.capabilities=(b'IMAP4REV1',b'AUTH=PLAIN');self.arguments=(a,k)
 def authenticate(self,mechanism,callback):self.calls.append(('AUTHENTICATE',mechanism));self.credential=callback(b'');return ('OK',[])
 def logout(self):self.calls.append(('LOGOUT',))
 def shutdown(self):self.calls.append(('CLOSE',))
class Store:
 def __init__(self):self.values={}
 def write(self,n,v):self.values[n]=v
 def read(self,n):return self.values[n]
 def delete(self,n):self.values.pop(n,None)
class MailboxTests(unittest.TestCase):
 def probe(self,smtp=None,imap=None):
  s=smtp or SMTP();i=imap or IMAP();args=[]
  def sf(*a,**k):args.append(('smtp',a,k));return s
  def imf(*a,**k):args.append(('imap',a,k));return i
  return probe_strato('info@example.se','unicode🔐å',{'smtp':sf,'imap':imf}),s,i,args
 def test_only_fixed_verified_tls_plain_auth_and_logout(self):
  r,s,i,args=self.probe();self.assertIsNotNone(r['smtpAuthenticatedAt']);self.assertIsNotNone(r['imapAuthenticatedAt']);self.assertIsNone(r['reasonCode']);self.assertFalse(r['localStored']);self.assertEqual(args[0][1],('smtp.strato.de',465));self.assertEqual(args[1][1],('imap.strato.de',993))
  for _,_,kw in args:self.assertTrue(kw['ssl_context'].check_hostname);self.assertEqual(kw['ssl_context'].verify_mode,ssl.CERT_REQUIRED);self.assertGreaterEqual(kw['ssl_context'].minimum_version,ssl.TLSVersion.TLSv1_2);self.assertEqual(kw['timeout'],10)
  self.assertEqual(len(s.calls),5);self.assertEqual([x[0] for x in s.calls[:3]],['debug','EHLO','AUTH']);self.assertEqual(s.calls[2],('AUTH','PLAIN'));self.assertEqual(base64.b64decode(s.calls[3][0]),b'\0info@example.se\0'+'unicode🔐å'.encode());self.assertEqual(s.calls[-1],('QUIT',));self.assertEqual(i.calls,[('AUTHENTICATE','PLAIN'),('LOGOUT',)]);self.assertIn('unicode🔐å'.encode(),i.credential)
 def test_unsupported_plain_has_no_fallback_or_mail_action(self):
  s=SMTP();s.esmtp_features={'auth':'CRAM-MD5'};r,s,i,_=self.probe(smtp=s);self.assertEqual(r['reasonCode'],'UNSUPPORTED_AUTH');self.assertNotIn('AUTH',[x[0] for x in s.calls]);self.assertEqual(i.calls,[])
 def test_partial_success_is_not_authenticated(self):
  class BadIMAP(IMAP):
   def authenticate(self,*_):raise Exception('PRIVATE_PASSWORD_CANARY')
  r,*_=self.probe(imap=BadIMAP());self.assertIsNotNone(r['smtpAuthenticatedAt']);self.assertIsNone(r['imapAuthenticatedAt']);self.assertNotIn('PRIVATE_PASSWORD',str(r));self.assertFalse(r['localStored'])
 def test_certificate_or_timeout_errors_are_fixed_codes(self):
  for error in [ssl.SSLCertVerificationError('PRIVATE'),TimeoutError('PRIVATE')]:
   def fail(*a,**k):raise error
   r=probe_strato('info@example.se','password',{'smtp':fail,'imap':fail});self.assertIn(r['reasonCode'],['TLS_FAILED','CONNECTION_FAILED']);self.assertNotIn('PRIVATE',str(r))
 def setup_fixture(self):
  tmp=tempfile.TemporaryDirectory();self.addCleanup(tmp.cleanup);store=Store();journal=Journal(Path(tmp.name)/'mailbox.json')
  context={'projectId':'p','workerId':'w','mailboxId':'m','setupId':'s','kid':'k','email':'info@example.se','expiresAt':'2099-10-17T13:00:00Z'}
  claim={'context':context,'envelope':{},'claimId':'c','hostGeneration':1,'mailboxGeneration':1}
  class Crypto:
   def open(self,c,e):return {'email':c['email'],'password':'PRIVATE_PASSWORD_CANARY'}
  class Client:
   def __init__(self):self.claimed=False;self.lost=0;self.commits=[];self.current=True
   def post(self,op,**v):
    if op=='claim_setup':
     if self.claimed:return {'setup':None}
     self.claimed=True;return claim
    self.commits.append(v)
    if self.lost:self.lost-=1;raise OSError('LOST_REPLY')
    return {'current':self.current,'mailboxGeneration':1,'status':{'status':'authenticated'}}
  probes=[]
  def probe(email,password):probes.append((email,password));return {'smtpAuthenticatedAt':'2026-10-17T13:00:00Z','imapAuthenticatedAt':'2026-10-17T13:00:00Z','reasonCode':None,'localStored':False}
  return Client(),Crypto(),store,journal,probe,probes
 def test_lost_commit_recovers_without_auth_retry_or_secret_journal(self):
  client,crypto,store,journal,probe,probes=self.setup_fixture();client.lost=1
  with self.assertRaises(Exception):process_mailbox_setup(client,crypto,store,journal,probe_fn=probe)
  self.assertEqual(len(probes),1);self.assertNotIn('PRIVATE_PASSWORD_CANARY',journal.path.read_text());self.assertNotIn('PRIVATE_PASSWORD_CANARY',str(client.commits));self.assertNotIn('active',journal.load())
  process_mailbox_setup(client,crypto,store,journal,probe_fn=probe);self.assertEqual(len(probes),1);self.assertEqual(journal.load()['active']['email'],'info@example.se')
 def test_stale_acknowledgement_never_overwrites_newer_active_reference(self):
  client,crypto,store,journal,probe,probes=self.setup_fixture();journal.save({'active':{'credentialRef':'previous','generation':2,'email':'old@example.se'},'pending':None});store.write('previous','old');client.current=False
  process_mailbox_setup(client,crypto,store,journal,probe_fn=probe);self.assertEqual(journal.load()['active']['credentialRef'],'previous');self.assertEqual(store.values,{'previous':'old'})
 def test_expired_or_revoked_claim_drops_staged_secret_without_auth_retry(self):
  from workers.sales.protocol import ProtocolError
  client,crypto,store,journal,probe,probes=self.setup_fixture();client.lost=1
  with self.assertRaises(Exception):process_mailbox_setup(client,crypto,store,journal,probe_fn=probe)
  def fenced(*args,**kwargs):raise ProtocolError('FENCED')
  client.post=fenced;process_mailbox_setup(client,crypto,store,journal,probe_fn=probe)
  self.assertEqual(len(probes),1);self.assertIsNone(journal.load()['pending']);self.assertEqual(store.values,{})
 def test_restart_after_uncertain_auth_never_authenticates_again(self):
  client,crypto,store,journal,probe,probes=self.setup_fixture()
  def crash(*_):raise SystemExit('SIMULATED_POWER_LOSS')
  with self.assertRaises(SystemExit):process_mailbox_setup(client,crypto,store,journal,probe_fn=crash)
  process_mailbox_setup(client,crypto,store,journal,probe_fn=probe);self.assertEqual(len(probes),0);self.assertEqual(client.commits[-1]['receipt']['reasonCode'],'UNCERTAIN_PROBE');self.assertNotIn('active',journal.load())
