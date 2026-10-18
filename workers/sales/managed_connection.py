"""Idempotent host adoption/rotation. No job or model operation is retried here."""
import hashlib,re,secrets,uuid
from datetime import datetime,timedelta,timezone
from .credential_store import connection_key
from .journal import JournalError
from .protocol import SalesProtocolClient
class ConnectionUnavailable(Exception):pass
def digest(token):return hashlib.sha256(token.encode('utf-8')).hexdigest()
def timestamp(value):
 try:
  t=datetime.fromisoformat(value.replace('Z','+00:00'))
  if t.tzinfo is None:raise ValueError()
  return t
 except (ValueError,TypeError,AttributeError):raise ConnectionUnavailable('INVALID_RECEIPT') from None
def default_factory(origin,token,purpose):return SalesProtocolClient(origin,token,purpose=purpose)
class ManagedConnection:
 def __init__(self,config,store,journal,client_factory=default_factory):
  self.config=dict(config);self.store=store;self.journal=journal;self.factory=client_factory
 def _secret(self,name):
  try:v=self.store.read(name)
  except Exception:raise ConnectionUnavailable('CREDENTIAL_UNAVAILABLE') from None
  if not re.fullmatch(r'[A-Za-z0-9_-]{43}',v):raise ConnectionUnavailable('CREDENTIAL_UNAVAILABLE')
  return v
 def _stage(self,name):
  v=secrets.token_urlsafe(32);self.store.write(name,v)
  if self._secret(name)!=v:raise ConnectionUnavailable('CREDENTIAL_READBACK_FAILED')
  return v
 def _post(self,token,operation,**values):
  for _ in range(3):
   try:return self.factory(self.config['origin'],token,'host').post(operation,**values)
   except Exception:pass
  raise ConnectionUnavailable('HOST_UNAVAILABLE')
 def _state(self):
  try:s=self.journal.load()
  except JournalError:raise ConnectionUnavailable('INVALID_JOURNAL') from None
  if s is None:
   s={k:self.config[k] for k in ['origin','projectId','workerId','activeRef','expiresAt','generation']};s.update(version=1,adopted=False,pending=None)
  if any(s.get(k)!=self.config[k] for k in ['origin','projectId','workerId']) or s.get('version')!=1 or not isinstance(s.get('generation'),int) or s['generation']<1:raise ConnectionUnavailable('INVALID_JOURNAL')
  return s
 def _adopt(self,s):
  name=connection_key(s['origin'],s['projectId'])+'/manager'
  if not s.get('managerRef'):
   try:self.store.read(name)
   except FileNotFoundError:self._stage(name)
   except Exception:raise ConnectionUnavailable('CREDENTIAL_UNAVAILABLE') from None
   self._secret(name)
   s['managerRef']=name;self.journal.save(s)
  manager=self._secret(s['managerRef'])
  if not s['adopted']:
   # Recover server acceptance after an uncertain adoption without replacing the manager.
   try:r=self.factory(s['origin'],manager,'host').post('poll');g=r['generation'];expiry=r['workerExpiresAt']
   except Exception:
    token=self._secret(s['activeRef']);r=self._post(token,'adopt',managerTokenHash=digest(manager));g=r['generation'];expiry=r['expiresAt']
   if g!=s['generation']:raise ConnectionUnavailable('GENERATION_MISMATCH')
   timestamp(expiry);s.update(adopted=True,expiresAt=expiry);self.journal.save(s)
  return manager
 def ensure_worker_token(self,now=None):
  now=now or datetime.now(timezone.utc)
  try:
   with self.journal.lock():return self._ensure(now)
  except JournalError:raise ConnectionUnavailable('ALREADY_RUNNING') from None
 def _ensure(self,now,recovered_expired=False):
  s=self._state();manager=self._adopt(s)
  status=self._post(manager,'poll')
  if s.get('cleanupRef'):
   self.store.delete(s['cleanupRef']);s.pop('cleanupRef');self.journal.save(s)
  pending=s.get('pending')
  if pending:
   token=self._secret(pending['credentialRef'])
   if digest(token)!=pending['newTokenHash']:raise ConnectionUnavailable('STAGED_CREDENTIAL_MISMATCH')
  else:
   if status.get('generation')!=s['generation']:raise ConnectionUnavailable('GENERATION_MISMATCH')
   if timestamp(s['expiresAt'])-now>timedelta(hours=12) and not status.get('reconnectRequested'):return self._secret(s['activeRef'])
   ref=connection_key(s['origin'],s['projectId'])+'/worker/'+str(uuid.uuid4());token=self._stage(ref)
   pending={'rotationId':str(uuid.uuid4()),'newTokenHash':digest(token),'expectedGeneration':s['generation'],'credentialRef':ref}
   s['pending']=pending;self.journal.save(s)
  receipt=self._post(manager,'rotate',**{k:pending[k] for k in ['rotationId','newTokenHash','expectedGeneration']})
  if receipt.get('generation')!=pending['expectedGeneration']+1:raise ConnectionUnavailable('INVALID_RECEIPT')
  expiry=timestamp(receipt.get('expiresAt'))
  previous=s['activeRef'];s.update(activeRef=pending['credentialRef'],generation=receipt['generation'],expiresAt=receipt['expiresAt'],pending=None,cleanupRef=previous)
  self.journal.save(s)
  self.store.delete(previous);s.pop('cleanupRef');self.journal.save(s)
  if expiry<=now:
   if recovered_expired:raise ConnectionUnavailable('HOST_CLOCK_MISMATCH')
   return self._ensure(now,recovered_expired=True)
  return token
 def poll_status(self):
  try:
   with self.journal.lock():
    s=self._state();return self._post(self._secret(s['managerRef']),'poll')
  except (JournalError,KeyError):raise ConnectionUnavailable('HOST_UNAVAILABLE') from None
 def report_status(self,cli_state):
  if cli_state not in ('ready','blocked','unknown'):raise ConnectionUnavailable('INVALID_STATUS')
  try:
   with self.journal.lock():
    s=self._state();return self._post(self._secret(s['managerRef']),'report_status',generation=s['generation'],cliState=cli_state)
  except (JournalError,KeyError):raise ConnectionUnavailable('HOST_UNAVAILABLE') from None

 def reply_client(self):
  try:
   with self.journal.lock():
    s=self._state()
    if not s.get('adopted') or s.get('pending'):raise ConnectionUnavailable('HOST_UNAVAILABLE')
    return self.factory(s['origin'],self._secret(s['activeRef']),'reply')
  except (JournalError,KeyError):raise ConnectionUnavailable('HOST_UNAVAILABLE') from None
 def send_client(self):
  try:
   with self.journal.lock():
    s=self._state()
    if not s.get('adopted') or s.get('pending'):raise ConnectionUnavailable('HOST_UNAVAILABLE')
    return self.factory(s['origin'],self._secret(s['activeRef']),'send')
  except (JournalError,KeyError):raise ConnectionUnavailable('HOST_UNAVAILABLE') from None

 def inbox_client(self):return self._manager_client('inbox')

 def mailbox_client(self):return self._manager_client('mailbox')

 def _manager_client(self,purpose):
  try:
   with self.journal.lock():
    s=self._state();return self.factory(s['origin'],self._secret(s['managerRef']),purpose)
  except (JournalError,KeyError):raise ConnectionUnavailable('HOST_UNAVAILABLE') from None
