"""Isolated send runtime: no real SMTP/IMAP/socket. Metadata-only crash markers."""
import json,sys,os,socket,smtplib,imaplib,hashlib,ssl
from pathlib import Path
from email import policy
from email.parser import BytesParser
from workers.sales.journal import Journal
from workers.sales.protocol import ProtocolError
from workers.sales.sending.transport import send_once
from workers.sales.sending.worker import run_send_once
sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
initial=json.loads(sys.stdin.readline());root=Path(initial['stateDirectory']);counts={'smtp':0,'data':0,'network':0}
def refuse(*a,**kw):counts['network']+=1;raise AssertionError('NETWORK_REFUSED')
socket.socket=refuse;smtplib.SMTP=refuse;smtplib.SMTP_SSL=refuse;imaplib.IMAP4=refuse;imaplib.IMAP4_SSL=refuse
def ask(v):
 print(json.dumps(v,ensure_ascii=False),flush=True);answer=json.loads(sys.stdin.readline())
 if answer.get('error'):raise ProtocolError(answer['error'])
 return answer
class Client:
 def post(self,op,**v):
  if op=='begin_dispatch' and initial.get('mode')=='crashBeforePermit':os._exit(24)
  result=ask({'token':initial['token'],'body':{'operation':op,**v}})
  if op=='complete' and initial.get('mode')=='lostHttpReceipt':raise ProtocolError('UNAVAILABLE')
  return result
class Store:
 def read(self,key):assert key=='synthetic-key';return 'not-a-real-password'
class SMTP:
 def __init__(self,host,port,**kw):
  counts['smtp']+=1;assert host=='smtp.strato.de' and port==465 and kw['context'].verify_mode==ssl.CERT_REQUIRED and kw['context'].check_hostname
 def set_debuglevel(self,value):assert value==0
 def ehlo(self):return 250,b'ok'
 def login(self,user,password):
  assert user==initial['senderEmail'] and password=='not-a-real-password'
  if initial.get('mode') in ('pause','revoke','rotate','suppression','newMail','mailbox'):ask({'control':'change'})
  return 235,b'ok'
 def mail(self,value):assert value==initial['senderEmail'];return 250,b'ok'
 def rcpt(self,value):assert value==initial['recipient'];return 250,b'ok'
 def data(self,raw):
  m=BytesParser(policy=policy.default).parsebytes(raw)
  assert str(m['From'])=='Andre <'+initial['senderEmail']+'>'
  assert str(m['To'])==initial['recipient'] and str(m['Subject'])=='Syntetiskt sändprov'
  assert m.get_content().replace('\r\n','\n').rstrip('\n')=='Syntetiskt svar.\n\nAndre'
  assert not m.get('Cc') and not m.get('Bcc') and m['In-Reply-To']=='<synthetic-send-source@example.se>'
  counts['data']+=1
  path=root/'data-count.json';old=json.loads(path.read_text()) if path.exists() else {'count':0};old['count']+=1;path.write_text(json.dumps(old))
  if initial.get('mode')=='crashAfterData':os._exit(25)
  if initial.get('mode')=='lost250':raise TimeoutError('secret arbitrary transcript')
  return 250,b'accepted arbitrary transcript'
 def close(self):pass
try:
 mb=Journal(root/'mailbox.json')
 if mb.load() is None:mb.save({'active':{'mailboxId':initial['mailboxId'],'generation':6,'email':initial['senderEmail'],'credentialRef':'synthetic-key'}})
 journal=Journal(root/'send-dispatch.json')
 result=run_send_once(Client(),journal,lambda:lambda snapshot,begin:send_once(snapshot,Store(),mb,Journal(root/'send-envelope.json'),SMTP,begin_dispatch=begin))
 for file in root.glob('*.json'):
  raw=file.read_text(encoding='utf-8');assert 'Syntetiskt svar' not in raw and initial['token'] not in raw and 'not-a-real-password' not in raw
 print(json.dumps({'event':'complete','smtp':counts['smtp'],'data':counts['data'],'network':counts['network'],'pending':bool((journal.load() or {}).get('pending')),'result':result}),flush=True)
except Exception as e:print(json.dumps({'event':'failed','errorType':type(e).__name__}),flush=True);sys.exit(1)
