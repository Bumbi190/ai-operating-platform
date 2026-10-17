import hashlib,json,tempfile,threading,unittest
from pathlib import Path
from unittest.mock import Mock
from workers.sales.host import verify_installation,verify_launch_root,host_loop,HostBlocked
from workers.sales.journal import Journal,SingleInstance
class HostTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);(self.root/'worker.py').write_bytes(b'pinned-source')
  self.manifest={'sourceSha':'a'*40,'files':{'worker.py':hashlib.sha256(b'pinned-source').hexdigest()}}
  data=json.dumps(self.manifest).encode();(self.root/'installation-manifest.json').write_bytes(data);self.hash=hashlib.sha256(data).hexdigest()
 def test_pinned_manifest_detects_modified_source(self):
  verify_installation(self.root,self.hash);(self.root/'worker.py').write_bytes(b'changed')
  with self.assertRaises(HostBlocked):verify_installation(self.root,self.hash)
 def test_actual_launch_root_must_match_configured_installation(self):
  with self.assertRaises(HostBlocked):verify_launch_root(self.root)
 def test_manifest_itself_must_be_pinned(self):
  with self.assertRaises(HostBlocked):verify_installation(self.root,'0'*64)
 def test_rejects_parent_paths_and_reparse_points(self):
  self.manifest['files']={'../escape.py':'a'*64};raw=json.dumps(self.manifest).encode();(self.root/'installation-manifest.json').write_bytes(raw)
  with self.assertRaises(HostBlocked):verify_installation(self.root,hashlib.sha256(raw).hexdigest())
 def run_cycle(self,desired='running',ready=True,uncertain=False):
  stop=threading.Event();connection=Mock();connection.ensure_worker_token.return_value='x'*43;connection.poll_status.return_value={'desiredState':desired,'executionPaused':False}
  run=Mock(side_effect=lambda *_,**__:stop.set());journal=Journal(self.root/'dispatch.json')
  if uncertain:journal.save({'inFlight':True})
  def wait(_):stop.set()
  host_loop(connection,lambda _:Mock(),lambda:Mock(),lambda:{'ready':ready},journal,stop,run_once_fn=run,wait_fn=wait)
  return run,connection,journal
 def test_pause_prevents_new_job_dispatch(self):self.assertEqual(self.run_cycle(desired='paused')[0].call_count,0)
 def test_blocked_cli_prevents_new_job_dispatch(self):self.assertEqual(self.run_cycle(ready=False)[0].call_count,0)
 def test_restart_does_not_regenerate_uncertain_model_job(self):
  run,connection,journal=self.run_cycle(uncertain=True);self.assertEqual(run.call_count,0);self.assertTrue(journal.load()['inFlight'])
 def test_fresh_loop_dispatches_once_and_clears_guard(self):
  run,_,journal=self.run_cycle();self.assertEqual(run.call_count,1);self.assertFalse(journal.load()['inFlight'])
 def test_transient_claim_failure_does_not_permanently_block_host(self):
  stop=threading.Event();connection=Mock();connection.ensure_worker_token.return_value='x'*43;connection.poll_status.return_value={'desiredState':'running','executionPaused':False};journal=Journal(self.root/'claim.json');calls=[]
  def run(*args,**kwargs):
   calls.append(1)
   if len(calls)==1:raise OSError('CLAIM_TRANSPORT_FAILED')
   stop.set()
  cycles=[]
  def wait(_):
   cycles.append(1)
   if len(cycles)>2:stop.set()
  host_loop(connection,lambda _:Mock(),lambda:Mock(),lambda:{'ready':True},journal,stop,run_once_fn=run,wait_fn=wait)
  self.assertEqual(len(calls),2);self.assertFalse(journal.load()['inFlight'])
 def test_model_dispatch_guard_contains_identifiers_before_external_call(self):
  from workers.sales.worker import run_once
  journal=Journal(self.root/'interrupted.json');stop=threading.Event();connection=Mock();connection.ensure_worker_token.return_value='x'*43;connection.poll_status.return_value={'desiredState':'running','executionPaused':False}
  ref={'projectId':'p','workerId':'w','jobId':'j','claimId':'c','generation':1}
  class Client:
   def post(self,op,**v):
    if op=='claim':return {'ref':ref,'snapshot':{'contacts':[{'id':'contact','websiteUrl':None}],'offer':{}}}
    if op=='commit_research':return {}
    if op=='reserve_attempt':return {'attemptId':v['attemptId'],'dispatchBefore':'2099-10-17T13:00:00Z'}
    return {}
  class Adapter:
   def prepare(self,*_):
    state=journal.load();self.asserted=state and state.get('jobId')=='j' and state.get('attemptId')
    if not self.asserted:raise AssertionError('MISSING_DISPATCH_IDENTIFIERS')
    raise SystemExit('SIMULATED_POWER_LOSS')
  adapter=Adapter()
  with self.assertRaises(SystemExit):host_loop(connection,lambda _:Client(),lambda:adapter,lambda:{'ready':True},journal,stop,run_once_fn=run_once,wait_fn=lambda _:stop.set())
  self.assertTrue(adapter.asserted);self.assertTrue(journal.load()['inFlight'])
 def test_two_processes_cannot_own_same_lock(self):
  with SingleInstance(self.root/'host.lock'):
   with self.assertRaises(Exception):
    with SingleInstance(self.root/'host.lock'):pass
