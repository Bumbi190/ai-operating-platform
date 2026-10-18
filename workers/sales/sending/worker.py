"""Separate durable send queue. Receipt recovery never constructs SMTP transport."""
import threading,uuid
HEARTBEAT_SECONDS=15
TERMINAL={'smtp_accepted','failed_before_send','cancelled'}
def _ref(value):
 if not isinstance(value,dict) or set(value)!={'projectId','sendJobId','workerId','claimId','generation'} or type(value['generation']) is not int or value['generation']<1:raise ValueError('INVALID_SEND_CLAIM')
 for k in ['projectId','sendJobId','workerId','claimId']:uuid.UUID(value[k])
 return value
def _run(client,journal,transport_factory,can_dispatch):
 state=journal.load() or {'pending':None};pending=state.get('pending')
 if pending:
  ref=_ref(pending['ref'])
  try:
   remote=client.post('read_receipt',**ref);summary=remote.get('summary') or {}
   if summary.get('id')!=ref['sendJobId']:return False
   if summary.get('status') in TERMINAL:
    state['pending']=None;journal.save(state);return False
   if pending.get('receipt') and pending['receipt']['status']!='delivery_unknown':
    receipt=client.post('complete',**ref,receipt=pending['receipt'])
    if receipt.get('id')==ref['sendJobId'] and receipt.get('status') in TERMINAL:state['pending']=None;journal.save(state)
    return False
   # A restart without a terminal receipt never runs the external envelope again.
   pending['phase']='uncertain';journal.save(state);client.post('report_uncertain',**ref)
  except Exception:pass
  return False
 if not can_dispatch:return False
 claim=client.post('claim')
 if claim.get('ref') is None:return False
 ref=_ref(claim['ref']);state['pending']={'ref':ref,'phase':'claimed'};journal.save(state)
 finished=threading.Event();cancelled=threading.Event()
 def heartbeat():
  while not finished.wait(HEARTBEAT_SECONDS):
   try:client.post('heartbeat',**ref)
   except Exception:cancelled.set();return
 thread=threading.Thread(target=heartbeat,name='sales-send-heartbeat',daemon=True);thread.start()
 try:
  def begin_dispatch():
   if cancelled.is_set():raise ValueError('SEND_FENCED')
   state['pending']['phase']='reserving';journal.save(state)
   permit=client.post('begin_dispatch',**ref)
   state['pending']['phase']='dispatching';journal.save(state)
   if cancelled.is_set():raise ValueError('SEND_FENCED')
   return permit
  receipt=transport_factory()(claim['snapshot'],begin_dispatch)
  if not isinstance(receipt,dict) or set(receipt)!={'status','mimeSha256'} or receipt['status'] not in ('smtp_accepted','failed_before_send','delivery_unknown'):raise ValueError('INVALID_SEND_RECEIPT')
  state['pending'].update(phase='committing',receipt=receipt);journal.save(state)
  result=client.post('complete',**ref,receipt=receipt)
  if result.get('id')==ref['sendJobId'] and result.get('status') in TERMINAL:
   state['pending']=None;journal.save(state);return result['status']=='smtp_accepted'
  return False
 except Exception:
  try:client.post('report_uncertain',**ref)
  except Exception:pass
  return False
 finally:finished.set();thread.join(21)
def run_send_once(client,journal,transport_factory,can_dispatch=True):
 try:
  with journal.lock():return _run(client,journal,transport_factory,can_dispatch)
 except Exception:return False
