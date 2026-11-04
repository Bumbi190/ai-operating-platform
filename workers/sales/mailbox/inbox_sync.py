"""Authorized batches with receipt-first recovery. Journals contain metadata only."""
from dataclasses import dataclass
import hashlib,json
from ..journal import JournalError
from ..protocol import ProtocolError
from .inbox import read_inbox_batch,InboxReadError
FAILURES={'AUTH_FAILED','TLS_FAILED','CONNECTION_FAILED','UNSUPPORTED_MIME','RECONCILING'}
@dataclass(frozen=True)
class SyncResult:
 code:str
 delay:int=60

def _scope(ref):return {k:ref[k] for k in ('projectId','mailboxId','configVersion','mailboxGeneration')}
def _delay(state,code):
 state['failures']=min(3,state.get('failures',0)+1)
 return SyncResult(code,(60,120,300)[state['failures']-1])
def _receipt(state,receipt):
 p=state['pending']
 if not isinstance(receipt,dict) or receipt.get('batchId')!=p['ref']['batchId']:return False
 if receipt.get('accepted') is True:
  if p.get('phase')!='committing':return False
  c=receipt.get('cursor',{})
  if any(c.get(k)!=p.get(target) for k,target in [('uidValidity','expectedValidity'),('scannedThroughUid','expectedThrough'),('epoch','expectedEpoch')]):return False
  state['failures']=0
 elif receipt.get('accepted') is False:
  if receipt.get('reasonCode') not in FAILURES or receipt.get('reasonCode')!=p.get('reasonCode'):return False
 else:return False
 state['pending']=None
 return True

def _sync(client,store,mailbox_journal,journal,reader):
 state=journal.load() or {'pending':None,'failures':0}
 pending=state.get('pending')
 if pending:
  try:reply=client.post('read_batch_receipt',**pending['ref'])
  except ProtocolError as e:
   if e.code=='FENCED':state['pending']=None;journal.save(state);return SyncResult('FENCED')
   return SyncResult(e.code or 'UNAVAILABLE')
  except Exception:return SyncResult('UNAVAILABLE')
  if reply.get('receipt') is not None:
   if not _receipt(state,reply['receipt']):return SyncResult('RECONCILING',300)
   journal.save(state);return SyncResult('RECOVERED')
  if reply.get('expired') is not True:return SyncResult('WAITING_RECEIPT')
  state['pending']=None;journal.save(state)
 mailbox=mailbox_journal.load() or {}
 if mailbox.get('pending'):return SyncResult('MAILBOX_SETUP_PENDING')
 claim=client.post('claim_sync').get('sync')
 if claim is None:return SyncResult('IDLE')
 ref=claim['ref'];active=mailbox.get('active') or {}
 if active.get('mailboxId')!=ref['mailboxId'] or active.get('generation')!=ref['mailboxGeneration'] or active.get('email')!=claim['mailboxEmail'] or not active.get('credentialRef'):return SyncResult('MAILBOX_NOT_CURRENT')
 state['pending']={'ref':ref,'phase':'reading'}
 blocked=state.get('authBlocked')==_scope(ref)
 if state.get('authBlocked') and not blocked:state.pop('authBlocked')
 journal.save(state)
 try:
  if blocked:raise InboxReadError('AUTH_FAILED')
  # Never look up another credential, and never persist the plaintext.
  password=store.read(active['credentialRef'])
  try:result=reader({**claim['config'],'email':claim['mailboxEmail'],'selectedAddresses':claim['selectedAddresses']},claim['cursor'],claim['selectedMessages'],password)
  finally:password=None
 except Exception as error:
  reason=error.args[0] if isinstance(error,InboxReadError) and error.args else None
  code=reason if reason in FAILURES else 'RECONCILING' if reason=='RESPONSE_TOO_LARGE' else 'CONNECTION_FAILED'
  if code=='AUTH_FAILED':state['authBlocked']=_scope(ref)
  state['pending'].update(phase='failure',reasonCode=code)
  response=_delay(state,code);journal.save(state)
  try:
   ack=client.post('report_sync_failure',ref=ref,reasonCode=code)
   if _receipt(state,ack):journal.save(state)
  except Exception:pass
  return response
 batch={'ref':ref,'expectedCursor':claim['cursor'],**result}
 p=state['pending'];p.update(phase='committing',payloadHash=hashlib.sha256(json.dumps(batch,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest(),expectedValidity=result['uidValidity'],expectedThrough=result['throughUid'],expectedEpoch=claim['cursor']['epoch']+(result['uidValidity']!=claim['cursor']['uidValidity']))
 journal.save(state)
 try:ack=client.post('commit_batch',**batch)
 except Exception:return SyncResult('WAITING_RECEIPT')
 if not _receipt(state,ack):return SyncResult('RECONCILING',300)
 journal.save(state);return SyncResult('SYNCED')

def sync_inbox_once(client,store,mailbox_journal,sync_journal,reader=read_inbox_batch):
 try:
  with sync_journal.lock():return _sync(client,store,mailbox_journal,sync_journal,reader)
 except JournalError:return SyncResult('ALREADY_RUNNING')
 except ProtocolError as e:return SyncResult(e.code or 'UNAVAILABLE')
 except Exception:return SyncResult('UNAVAILABLE')

def run_inbox_loop(cycle,stop,wait_fn=None):
 wait=wait_fn or stop.wait
 while not stop.is_set():
  try:result=cycle();delay=max(60,min(300,result.delay))
  except Exception:delay=60
  wait(delay)
