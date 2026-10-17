"""Real crypto/queue/receipt integration with in-memory store and fake TLS clients."""
import base64,hashlib,json,sys,tempfile
from pathlib import Path
from workers.sales.mailbox.crypto import MailboxCrypto
from workers.sales.mailbox.probe import probe_strato
from workers.sales.mailbox.setup import process_mailbox_setup
from workers.sales.journal import Journal
from workers.sales.protocol import ProtocolError
sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
initial=json.loads(sys.stdin.readline())
def ask(v):
 print(json.dumps(v),flush=True);r=json.loads(sys.stdin.readline())
 if r.get('error'):raise ProtocolError(r['error'])
 return r
class Store:
 def __init__(self):self.values={}
 def read(self,n):
  if n not in self.values:raise FileNotFoundError()
  return self.values[n]
 def write(self,n,v):self.values[n]=v
 def delete(self,n):self.values.pop(n,None)
class Client:
 def post(self,operation,**v):return ask({'token':initial['token'],'body':{'operation':operation,**v}})
class Socket:
 def settimeout(self,_):pass
calls=[]
class SMTP:
 def __init__(self,*a,**kw):self.sock=Socket();self.esmtp_features={'auth':'PLAIN'};assert a==('smtp.strato.de',465);assert kw['ssl_context'].check_hostname
 def set_debuglevel(self,v):assert v==0
 def ehlo(self):calls.append('EHLO');return 250,b'ok'
 def docmd(self,command,value=''):
  if command=='AUTH':
   assert value=='PLAIN';return 334,b''
  assert value=='';assert base64.b64decode(command).endswith(initial['canary'].encode());calls.append('SMTP_AUTH');return 235,b'ok'
 def quit(self):calls.append('QUIT')
 def close(self):pass
class IMAP:
 def __init__(self,*a,**kw):self.sock=Socket();self.capabilities=('AUTH=PLAIN',);assert a==('imap.strato.de',993)
 def authenticate(self,mechanism,callback):assert mechanism=='PLAIN';assert callback(b'').endswith(initial['canary'].encode());calls.append('IMAP_AUTH');return 'OK',[]
 def logout(self):calls.append('LOGOUT')
 def shutdown(self):pass
def probe(email,password):return probe_strato(email,password,{'smtp':SMTP,'imap':IMAP})
phase='starting'
try:
 with tempfile.TemporaryDirectory() as directory:
  phase='pipe-encoding';assert hashlib.sha256(initial['canary'].encode('utf-8')).hexdigest()==initial['canaryHash']
  store=Store();journal=Journal(Path(directory)/'mailbox.json');crypto=MailboxCrypto(store,'private-rsa',initial['node']);client=Client();pub=crypto.public_key();phase='publish';client.post('publish_key',generation=1,**pub)
  phase='first-begin';ask({'control':'begin','email':'first@example.se'});phase='first-probe'
  try:process_mailbox_setup(client,crypto,store,journal,probe_fn=probe);raise AssertionError('LOST_EXPECTED')
  except ProtocolError:pass
  phase='first-lost';assert len([x for x in calls if x=='SMTP_AUTH'])==1 and 'active' not in journal.load()
  phase='first-recover';process_mailbox_setup(client,crypto,store,journal,probe_fn=probe);active=journal.load()['active'];assert active['email']=='first@example.se'
  assert len([x for x in calls if x=='SMTP_AUTH'])==1
  phase='second-begin';ask({'control':'begin','email':'second@example.se'});phase='second-probe'
  try:process_mailbox_setup(client,crypto,store,journal,probe_fn=probe);raise AssertionError('LOST_EXPECTED')
  except ProtocolError:pass
  phase='replacement-begin';ask({'control':'begin','email':'replacement@example.se'})
  process_mailbox_setup(client,crypto,store,journal,probe_fn=probe);assert journal.load()['active']==active
  phase='expire';ask({'control':'expire'})
  assert process_mailbox_setup(client,crypto,store,journal,probe_fn=probe) is False
  assert len([x for x in calls if x=='SMTP_AUTH'])==2
  phase='revoked-begin';ask({'control':'begin','email':'revoked@example.se'});phase='revoked-probe'
  def revoked_probe(email,password):
   receipt=probe(email,password);ask({'control':'revoke'});return receipt
  process_mailbox_setup(client,crypto,store,journal,probe_fn=revoked_probe);assert journal.load()['active']==active
  assert initial['canary'] not in journal.path.read_text()
  assert all(v==initial['canary'] or n=='private-rsa' for n,v in store.values.items())
  print(json.dumps({'event':'complete','fakeSmtpAuth':calls.count('SMTP_AUTH'),'fakeImapAuth':calls.count('IMAP_AUTH'),'realNetworkCalls':0,'modelCalls':0,'privateKeyBytes':len(store.values['private-rsa'].encode())}),flush=True)
except Exception as error:
 print(json.dumps({'event':'failed','phase':phase,'errorType':type(error).__name__}),flush=True);sys.exit(1)
