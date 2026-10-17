"""Persist a staged OS credential before an idempotent, generation-bound receipt."""
from .probe import probe_strato
from ..credential_store import connection_key
from ..protocol import ProtocolError
def _failed(reason):return {'smtpAuthenticatedAt':None,'imapAuthenticatedAt':None,'localStored':False,'reasonCode':reason}
def _commit(client,pending):return client.post('commit_probe',**{k:pending[k] for k in ['setupId','claimId','hostGeneration','mailboxGeneration','receipt']})
def _resolve(client,store,journal,state):
 pending=state['pending']
 if 'receipt' not in pending:
  # A process may have died anywhere inside auth or local persistence. Never log in again.
  pending['receipt']=_failed('UNCERTAIN_PROBE');pending['phase']='uncertain';journal.save(state)
 try:ack=_commit(client,pending)
 except ProtocolError as e:
  if getattr(e,'code',None) not in ('FENCED','NOT_FOUND'):raise
  ack={'current':False}
 success=ack.get('current') is True and ack.get('mailboxGeneration')==pending['mailboxGeneration'] and ack.get('status',{}).get('status')=='authenticated' and pending['receipt'].get('localStored') is True
 previous=None
 if success:
  # Read back again after a restart; an absent staged secret cannot become active.
  store.read(pending['credentialRef'])
  previous=(state.get('active') or {}).get('credentialRef')
  state['active']={'credentialRef':pending['credentialRef'],'email':pending['email'],'mailboxId':pending['mailboxId'],'generation':pending['mailboxGeneration']}
 else:store.delete(pending['credentialRef'])
 state['pending']=None
 if previous and previous!=state.get('active',{}).get('credentialRef'):state['cleanupRef']=previous
 journal.save(state)
 if state.get('cleanupRef'):
  store.delete(state['cleanupRef']);state.pop('cleanupRef');journal.save(state)
 return True

def process_mailbox_setup(client,crypto,store,journal,probe_fn=probe_strato):
 state=journal.load() or {'pending':None}
 if state.get('cleanupRef'):
  store.delete(state['cleanupRef']);state.pop('cleanupRef');journal.save(state)
 if state.get('pending'):return _resolve(client,store,journal,state)
 claim=client.post('claim_setup')
 if claim.get('setup') is None and 'context' not in claim:return False
 context=claim['context'];reference=connection_key('https://mailbox.local',context['projectId'])+'/mailbox/'+context['workerId']+'/'+context['setupId']
 pending={k:claim[k] for k in ['claimId','hostGeneration','mailboxGeneration']};pending.update(setupId=context['setupId'],mailboxId=context['mailboxId'],email=context['email'],credentialRef=reference,phase='claimed');state['pending']=pending;journal.save(state)
 try:
  credential=crypto.open(context,claim['envelope'])
  if credential['email']!=context['email']:raise ValueError()
 except Exception:
  pending['receipt']=_failed('CRYPTO_REFUSED');journal.save(state);return _resolve(client,store,journal,state)
 pending['phase']='auth_started';journal.save(state)
 result=probe_fn(credential['email'],credential['password']);pending['receipt']=result
 if result.get('smtpAuthenticatedAt') and result.get('imapAuthenticatedAt') and result.get('reasonCode') is None:
  try:
   store.write(reference,credential['password'])
   if store.read(reference)!=credential['password']:raise OSError()
   result={**result,'localStored':True};pending['receipt']=result;pending['phase']='stored'
  except Exception:pending['receipt']={**result,'localStored':False,'reasonCode':'LOCAL_STORE_FAILED'}
 # No plaintext value is added to state, the API input, an exception, argv or logs.
 credential=None;journal.save(state)
 return _resolve(client,store,journal,state)
