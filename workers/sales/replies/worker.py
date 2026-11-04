"""Receipt-first recovery. Never repeat an uncertain external text dispatch."""
import hashlib,json,threading,uuid
from datetime import datetime,timezone
HEARTBEAT_SECONDS=15

def _complete(receipt,ref):return isinstance(receipt,dict) and receipt.get('id')==ref['jobId'] and receipt.get('status') in ('awaiting_review','needs_input')
def _run(client,adapter_factory,journal,before_dispatch,can_dispatch):
 state=journal.load() or {'pending':None}
 pending=state.get('pending')
 if pending:
  ref=pending['ref']
  try:
   r=client.post('read_receipt',**ref)
   if _complete(r.get('receipt'),ref) or r.get('status')=='cancelled':state['pending']=None;journal.save(state);return False
   if r.get('expired') is True or r.get('status') in ('reconciling','failed'):
    pending['phase']='uncertain';journal.save(state)
    if r.get('status')=='running':client.post('report_failure',**ref)
  except Exception:pass
  return False
 if not can_dispatch:return False
 claim=client.post('claim');ref=claim.get('ref')
 if ref is None:return False
 if not isinstance(ref,dict) or set(ref)!={'projectId','jobId','workerId','claimId','generation'} or type(ref['generation']) is not int or ref['generation']<1:raise ValueError('INVALID_REPLY_CLAIM')
 for name in ('projectId','jobId','workerId','claimId'):uuid.UUID(ref[name])
 state['pending']={'ref':ref,'phase':'claimed'};journal.save(state)
 cancelled=threading.Event();finished=threading.Event()
 def heartbeat():
  while not finished.wait(HEARTBEAT_SECONDS):
   try:client.post('heartbeat',**ref)
   except Exception:cancelled.set();return
 thread=threading.Thread(target=heartbeat,name='sales-reply-heartbeat',daemon=True);thread.start()
 try:
  adapter=adapter_factory()
  attempt=str(uuid.uuid4());permit=client.post('reserve_attempt',**ref,attemptId=attempt)
  if permit.get('attemptId')!=attempt or datetime.fromisoformat(permit['dispatchBefore'].replace('Z','+00:00'))<=datetime.now(timezone.utc):raise ValueError('PERMIT_EXPIRED')
  if cancelled.is_set():raise ValueError('CANCELLED')
  state['pending'].update(phase='dispatching',attemptId=attempt);journal.save(state)
  if before_dispatch is not None:before_dispatch(ref,attempt)
  if cancelled.is_set() or datetime.fromisoformat(permit['dispatchBefore'].replace('Z','+00:00'))<=datetime.now(timezone.utc):raise ValueError('PERMIT_EXPIRED')
  draft=adapter.prepare(claim['snapshot'],permit,cancelled)
  if cancelled.is_set():raise ValueError('CANCELLED')
  state['pending'].update(phase='committing',payloadHash=hashlib.sha256(json.dumps(draft,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest());journal.save(state)
  try:receipt=client.post('complete',**ref,attemptId=attempt,draft=draft)
  except Exception:return False
  if not _complete(receipt,ref):return False
  state['pending']=None;journal.save(state);return True
 except Exception:
  state['pending']['phase']='uncertain';journal.save(state)
  try:client.post('report_failure',**ref)
  except Exception:pass
  return False
 finally:finished.set();thread.join(21)

def run_reply_once(client,adapter_factory,journal,before_dispatch=None,can_dispatch=True):
 try:
  with journal.lock():return _run(client,adapter_factory,journal,before_dispatch,can_dispatch)
 except Exception:return False
