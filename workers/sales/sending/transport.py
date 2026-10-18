"""One fixed Strato envelope. Durable uncertainty is terminal; never retry DATA."""
import hashlib,json,re,smtplib,ssl,uuid
from datetime import datetime,timezone
from email.message import EmailMessage
from email import policy
from email.utils import parsedate_to_datetime
class SendError(Exception):pass
FIELDS={'version','projectId','ownerId','revisionId','revisionHash','sourceJobId','sourceMessageId','mailboxId','mailboxGeneration','workerId','policyId','policyVersion','senderEmail','senderName','toEmail','subject','body','messageId','date','inReplyTo','references'}
EMAIL=re.compile(r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$")
MID=re.compile(r'^<[^\s<>@]+@[^\s<>@]+>$')
def validate_snapshot(snapshot):
 if not isinstance(snapshot,dict) or set(snapshot)!={'sealedJson','snapshotSha256'}:raise SendError('INVALID_SNAPSHOT')
 raw=snapshot['sealedJson'];h=snapshot['snapshotSha256']
 if not isinstance(raw,str) or len(raw.encode())>32768 or not isinstance(h,str) or hashlib.sha256(raw.encode()).hexdigest()!=h:raise SendError('INVALID_SNAPSHOT')
 def pairs(values):
  d={}
  for k,v in values:
   if k in d:raise SendError('INVALID_SNAPSHOT')
   d[k]=v
  return d
 d=json.loads(raw,object_pairs_hook=pairs)
 if not isinstance(d,dict) or set(d)!=FIELDS or d['version']!=1:raise SendError('INVALID_SNAPSHOT')
 for k in ['projectId','ownerId','revisionId','sourceJobId','sourceMessageId','mailboxId','workerId','policyId']:uuid.UUID(d[k])
 for k in ['mailboxGeneration','policyVersion']:
  if type(d[k]) is not int or d[k]<1:raise SendError('INVALID_SNAPSHOT')
 if not re.fullmatch('[a-f0-9]{64}',d['revisionHash']):raise SendError('INVALID_SNAPSHOT')
 for k in ['senderEmail','toEmail']:
  if not isinstance(d[k],str) or len(d[k])>254 or not EMAIL.fullmatch(d[k]):raise SendError('INVALID_ENVELOPE')
 for k,maxlen in [('senderName',100),('subject',90),('date',100),('messageId',254)]:
  if not isinstance(d[k],str) or not 1<=len(d[k])<=maxlen or any(ord(c)<32 or ord(c)==127 for c in d[k]):raise SendError('INVALID_ENVELOPE')
 if not isinstance(d['body'],str) or not 1<=len(d['body'])<=2000 or any(ord(c)<32 and c not in '\n\r\t' for c in d['body']):raise SendError('INVALID_BODY')
 if not MID.fullmatch(d['messageId']) or parsedate_to_datetime(d['date']).tzinfo is None:raise SendError('INVALID_ENVELOPE')
 if d['inReplyTo'] is not None and (not isinstance(d['inReplyTo'],str) or len(d['inReplyTo'])>998 or not MID.fullmatch(d['inReplyTo'])):raise SendError('INVALID_REPLY_HEADER')
 refs=d['references']
 if not isinstance(refs,list) or len(refs)>20 or any(not isinstance(x,str) or len(x)>998 or not MID.fullmatch(x) for x in refs) or sum(len(x) for x in refs)>4096:raise SendError('INVALID_REPLY_HEADER')
 return d
def _receipt(status,h):return {'status':status,'mimeSha256':h}
def send_once(snapshot,credential_store,mailbox_journal,dispatch_journal,smtp_factory=None,*,begin_dispatch):
 smtp=None;intent=False;mime_hash='0'*64
 try:
  with dispatch_journal.lock():
   d=validate_snapshot(snapshot);h=snapshot['snapshotSha256'];prior=dispatch_journal.load()
   if prior and prior.get('snapshotSha256')==h:
    if prior.get('receipt'):return prior['receipt']
    if prior.get('phase')=='dispatching':return _receipt('delivery_unknown',prior.get('mimeSha256',mime_hash))
   if prior and prior.get('phase')=='dispatching':raise SendError('UNRESOLVED_SEND')
   active=(mailbox_journal.load() or {}).get('active') or {}
   if active.get('mailboxId')!=d['mailboxId'] or active.get('generation')!=d['mailboxGeneration'] or active.get('email')!=d['senderEmail'] or not active.get('credentialRef'):raise SendError('MAILBOX_CHANGED')
   message=EmailMessage(policy=policy.SMTP)
   message['From']=d['senderName']+' <'+d['senderEmail']+'>'
   message['To']=d['toEmail'];message['Subject']=d['subject'];message['Date']=d['date'];message['Message-ID']=d['messageId']
   if d['inReplyTo']:message['In-Reply-To']=d['inReplyTo']
   refs=list(d['references'])
   if d['inReplyTo'] and (not refs or refs[-1]!=d['inReplyTo']):refs.append(d['inReplyTo'])
   if refs:message['References']=' '.join(refs[-20:])
   message.set_content(d['body'],charset='utf-8',cte='quoted-printable');raw=message.as_bytes();mime_hash=hashlib.sha256(raw).hexdigest()
   context=ssl.create_default_context();context.minimum_version=ssl.TLSVersion.TLSv1_2
   smtp=(smtp_factory or smtplib.SMTP_SSL)('smtp.strato.de',465,context=context,timeout=20)
   smtp.set_debuglevel(0)
   if smtp.ehlo()[0]!=250:raise SendError('SMTP_CONNECT_FAILED')
   password=credential_store.read(active['credentialRef'])
   try:
    if smtp.login(d['senderEmail'],password)[0]!=235:raise SendError('SMTP_AUTH_FAILED')
   finally:password=None
   # Recheck local mailbox after authentication, before obtaining authority.
   if (mailbox_journal.load() or {}).get('active')!=active:raise SendError('MAILBOX_CHANGED')
   permit=begin_dispatch()
   deadline=datetime.fromisoformat(permit['dispatchBefore'].replace('Z','+00:00'))
   if permit.get('snapshotSha256')!=h or deadline<=datetime.now(timezone.utc):raise SendError('PERMIT_EXPIRED')
   dispatch_journal.save({'snapshotSha256':h,'phase':'dispatching','mimeSha256':mime_hash})
   intent=True
   if deadline<=datetime.now(timezone.utc):raise SendError('PERMIT_EXPIRED')
   if smtp.mail(d['senderEmail'])[0]!=250:raise SendError('SMTP_MAIL_FAILED')
   if smtp.rcpt(d['toEmail'])[0] not in (250,251):raise SendError('SMTP_RCPT_FAILED')
   if smtp.data(raw)[0]!=250:raise SendError('SMTP_DATA_UNCERTAIN')
   receipt=_receipt('smtp_accepted',mime_hash)
   dispatch_journal.save({'snapshotSha256':h,'phase':'complete','mimeSha256':mime_hash,'receipt':receipt})
   return receipt
 except Exception:
  receipt=_receipt('delivery_unknown' if intent else 'failed_before_send',mime_hash)
  try:
   # Never replace another unresolved job or persist private content/errors.
   prior=dispatch_journal.load()
   if not prior or prior.get('snapshotSha256')==snapshot.get('snapshotSha256'):
    dispatch_journal.save({'snapshotSha256':snapshot.get('snapshotSha256'),'phase':'complete','mimeSha256':mime_hash,'receipt':receipt})
  except Exception:pass
  return receipt
 finally:
  if smtp:
   try:smtp.close()
   except Exception:pass
