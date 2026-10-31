"""Fresh-process loopback IMAP -> real API/SQL fixture. Synthetic data only."""
import json,os,sys
from pathlib import Path
from workers.sales.journal import Journal
from workers.sales.protocol import ProtocolError
from workers.sales.mailbox.inbox import read_inbox_batch
from workers.sales.mailbox.inbox_sync import sync_inbox_once
from workers.sales.tests.inbox_socket_fixture import inbox_server
sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
initial=json.loads(sys.stdin.readline())
def ask(value):
 print(json.dumps(value),flush=True);reply=json.loads(sys.stdin.readline())
 if reply.get('error'):raise ProtocolError(reply['error'])
 return reply
class Store:
 def read(self,ref):
  assert ref=='fixture-active-ref';return initial['canary']
class Client:
 def post(self,operation,**values):
  if operation=='commit_batch':
   if initial.get('crashBeforeCommit'):os._exit(24)
   if initial.get('pauseBeforeCommit'):ask({'control':'pause'})
   if initial.get('revokeBeforeCommit'):ask({'control':'revoke'})
  return ask({'token':initial['token'],'body':{'operation':operation,**values}})
try:
 root=Path(initial['stateDirectory']);mailbox=Journal(root/'mailbox.json');sync=Journal(root/'inbox.json')
 if mailbox.load() is None:mailbox.save({'active':{'credentialRef':'fixture-active-ref','email':'info@example.se','mailboxId':initial['mailboxId'],'generation':6},'pending':None})
 messages={int(k):dict(v) for k,v in initial.get('messages',{'12':{}}).items()}
 for m in messages.values():
  for k,v in list(m.items()):
   if isinstance(v,str):m[k]=v.encode()
 with inbox_server(messages,validity=initial.get('validity',10),next=initial.get('next',30)) as (wire,factory):
  def reader(config,cursor,selected,password):return read_inbox_batch(config,cursor,selected,password,client_factory=factory)
  result=sync_inbox_once(Client(),Store(),mailbox,sync,reader)
  raw=sync.path.read_text() if sync.path.exists() else ''
  assert initial['canary'] not in raw and 'Tack' not in raw
  commands=str(wire['commands']);assert 'UNSEEN' not in commands and 'STORE' not in commands and 'APPEND' not in commands and 'SELECT' not in commands
  print(json.dumps({'event':'complete','code':result.code,'authCount':wire['authCount'],'readOnly':True,'modelCalls':0,'externalCalls':0,'pending':bool((sync.load() or {}).get('pending'))}),flush=True)
except Exception as error:
 print(json.dumps({'event':'failed','errorType':type(error).__name__}),flush=True);sys.exit(1)
