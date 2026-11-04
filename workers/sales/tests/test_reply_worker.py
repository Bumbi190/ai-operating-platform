import json,tempfile,threading,unittest
from pathlib import Path
from datetime import datetime,timedelta,timezone
from unittest.mock import patch
from workers.sales.replies.worker import run_reply_once
from workers.sales.replies.adapter import HarveyReplyAdapter
from workers.sales.journal import Journal
from workers.sales.protocol import ProtocolError,SalesProtocolClient,SALES_ENDPOINTS
from workers.sales.host import inbox_background,host_loop
from workers.sales.tests.test_reply_adapter import Runtime,snapshot
REF={k:f'{i}0000000-0000-4000-8000-000000000091' for i,k in enumerate(('projectId','jobId','workerId','claimId'),1)};REF['generation']=1
class Server:
 def __init__(self):self.calls=[];self.accepted=None;self.claimed=False;self.lose=False;self.reject_commit=False;self.expired=False;self.cancel_heartbeat=False
 def post(self,op,**v):
  self.calls.append((op,v))
  if op=='claim':
   if self.claimed:return {'ref':None}
   self.claimed=True;return {'ref':dict(REF),'snapshot':snapshot()}
  if op=='reserve_attempt':return {'attemptId':v['attemptId'],'dispatchBefore':(datetime.now(timezone.utc)+timedelta(seconds=5)).isoformat()}
  if op=='heartbeat':
   if self.cancel_heartbeat:raise ProtocolError('FENCED')
   return {'ok':True}
  if op=='complete':
   if self.reject_commit:raise ProtocolError('FENCED')
   self.accepted={'id':REF['jobId'],'status':'awaiting_review'}
   if self.lose:raise ProtocolError('UNAVAILABLE')
   return self.accepted
  if op=='read_receipt':return {'receipt':self.accepted,'expired':self.expired,'status':'running' if self.accepted is None else 'awaiting_review'}
  if op=='report_failure':return {'id':REF['jobId'],'status':'reconciling'}
  raise AssertionError('unsafe operation '+op)
class ReplyWorkerTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.journal=Journal(Path(self.tmp.name)/'reply.json');self.server=Server();self.runtime=Runtime();self.factory=lambda:HarveyReplyAdapter(self.runtime)
 def test_reply_no_fetch_or_mail_call(self):
  with patch('socket.create_connection',side_effect=AssertionError('NO NETWORK')):
   self.assertTrue(run_reply_once(self.server,self.factory,self.journal))
  self.assertEqual(len(self.runtime.calls),1);self.assertIsNone(self.journal.load()['pending'])
  self.assertLessEqual(set(x[0] for x in self.server.calls),{'claim','heartbeat','reserve_attempt','complete'})
  complete=[v for op,v in self.server.calls if op=='complete'][0];self.assertIn('attemptId',complete);self.assertEqual(complete['draft']['evidenceIds'],[snapshot()['messageId']])
 def test_lost_durable_receipt_recovers_before_another_model_call(self):
  self.server.lose=True;self.assertFalse(run_reply_once(self.server,self.factory,self.journal))
  fresh=Journal(self.journal.path);self.assertFalse(run_reply_once(self.server,self.factory,fresh))
  self.assertEqual(len(self.runtime.calls),1);self.assertIsNone(fresh.load()['pending']);self.assertEqual(self.server.calls[-1][0],'read_receipt')
 def test_reply_dispatch_uncertain_remains_blocked(self):
  self.server.reject_commit=True;self.assertFalse(run_reply_once(self.server,self.factory,self.journal));self.server.expired=True
  self.assertFalse(run_reply_once(self.server,self.factory,self.journal));self.assertFalse(run_reply_once(self.server,self.factory,self.journal))
  self.assertEqual(len(self.runtime.calls),1);self.assertIsNotNone(self.journal.load()['pending'])
  raw=self.journal.path.read_text();self.assertNotIn('Vad kostar',raw);self.assertNotIn('Piloten',raw);self.assertNotIn('dealer@example.se',raw)
 def test_disabled_host_recovers_receipts_but_never_claims(self):
  self.assertFalse(run_reply_once(self.server,self.factory,self.journal,can_dispatch=False));self.assertEqual(self.server.calls,[])
 def test_journal_is_saved_before_external_dispatch(self):
  observed=[]
  def before(ref,attempt):observed.append((self.journal.load()['pending']['phase'],attempt))
  self.assertTrue(run_reply_once(self.server,self.factory,self.journal,before_dispatch=before));self.assertEqual(observed[0][0],'dispatching')
 def test_expired_permit_after_local_journaling_never_reaches_model(self):
  instant=datetime.now(timezone.utc);delayed=[False]
  class Clock:
   fromisoformat=staticmethod(datetime.fromisoformat)
   @staticmethod
   def now(_):return instant+timedelta(seconds=6 if delayed[0] else 0)
  with patch('workers.sales.replies.worker.datetime',Clock):
   worked=run_reply_once(self.server,self.factory,self.journal,before_dispatch=lambda *_:delayed.__setitem__(0,True))
  self.assertFalse(worked);self.assertEqual(self.runtime.calls,[])
 def test_heartbeat_fence_cancels_result_without_commit(self):
  self.server.cancel_heartbeat=True;original=self.runtime.generate
  def blocked(prompt,attempt,cancel):cancel.wait(.5);return original(prompt,attempt,cancel)
  self.runtime.generate=blocked
  with patch('workers.sales.replies.worker.HEARTBEAT_SECONDS',.02):self.assertFalse(run_reply_once(self.server,self.factory,self.journal))
  self.assertNotIn('complete',[op for op,_ in self.server.calls]);self.assertEqual(self.journal.load()['pending']['phase'],'uncertain')
 def test_managed_rotation_fences_late_reply(self):
  self.server.reject_commit=True;self.assertFalse(run_reply_once(self.server,self.factory,self.journal));self.assertEqual(len(self.runtime.calls),1);self.assertIsNotNone(self.journal.load()['pending'])
 def test_host_inbox_heartbeat_survives_reply_runtime(self):
  entered=threading.Event();release=threading.Event();inbox=threading.Event();stop=threading.Event()
  original=self.runtime.generate
  def blocked(*args):entered.set();release.wait(2);return original(*args)
  self.runtime.generate=blocked
  def cycle():entered.wait(1);inbox.set();return type('Result',(),{'delay':60})()
  with patch('workers.sales.replies.worker.HEARTBEAT_SECONDS',0.02):
   with inbox_background(cycle,stop):
    thread=threading.Thread(target=lambda:run_reply_once(self.server,self.factory,self.journal));thread.start()
    self.assertTrue(entered.wait(1));self.assertTrue(inbox.wait(1));threading.Event().wait(.06);self.assertIn('heartbeat',[op for op,_ in self.server.calls]);release.set();thread.join(2);self.assertFalse(thread.is_alive())
 def test_uncertain_reply_does_not_get_erased_by_initial_contact_loop(self):
  stop=threading.Event();calls=[]
  class Connection:
   def ensure_worker_token(self):return 'token'
   def poll_status(self):return {'desiredState':'running','executionPaused':False}
   def report_status(self,_):pass
  class State:
   def load(self):return {'inFlight':False}
   def save(self,v):calls.append(('save',v))
  host_loop(Connection(),lambda _:None,lambda:None,lambda:{'ready':True},State(),stop,run_once_fn=lambda *a,**k:calls.append(('initial',None)),wait_fn=lambda _:stop.set(),reply_cycle=lambda c,allowed:calls.append(('reply',allowed)),reply_uncertain=lambda:True)
  self.assertEqual(calls,[('reply',False)])
 def test_reply_client_uses_current_rotated_worker_ref_not_manager(self):
  from workers.sales.managed_connection import ManagedConnection,ConnectionUnavailable
  journal=Journal(Path(self.tmp.name)/'connection.json');config={'origin':'https://example.invalid','projectId':REF['projectId'],'workerId':REF['workerId'],'activeRef':'stale','expiresAt':'2027-01-01T00:00:00Z','generation':1}
  state={**config,'version':1,'generation':3,'activeRef':'rotated-worker','managerRef':'manager','adopted':True,'pending':None};journal.save(state);calls=[]
  class Store:
   def read(self,name):return {'rotated-worker':'W'*43,'manager':'M'*43}[name]
  connection=ManagedConnection(config,Store(),journal,lambda origin,token,purpose:calls.append((token,purpose)))
  connection.reply_client();self.assertEqual(calls,[('W'*43,'reply')]);self.assertEqual(journal.load(),state)
  state['pending']={'rotationId':'pending'};journal.save(state)
  with self.assertRaises(ConnectionUnavailable):connection.reply_client()
 def test_fixed_reply_transport_has_no_generic_endpoint(self):
  self.assertEqual(SALES_ENDPOINTS['reply'],'/api/sales/replies/worker');self.assertTrue(SalesProtocolClient('https://example.invalid','T'*43,'reply').url.endswith('/api/sales/replies/worker'))
if __name__=='__main__':unittest.main()
