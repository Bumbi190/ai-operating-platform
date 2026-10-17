import hashlib,json,tempfile,threading,unittest
from pathlib import Path
from unittest.mock import Mock
from workers.sales.host import verify_installation,host_loop,HostBlocked
from workers.sales.journal import Journal,SingleInstance
class HostTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name);(self.root/'worker.py').write_bytes(b'pinned-source')
  self.manifest={'sourceSha':'a'*40,'files':{'worker.py':hashlib.sha256(b'pinned-source').hexdigest()}}
  data=json.dumps(self.manifest).encode();(self.root/'installation-manifest.json').write_bytes(data);self.hash=hashlib.sha256(data).hexdigest()
 def test_pinned_manifest_detects_modified_source(self):
  verify_installation(self.root,self.hash);(self.root/'worker.py').write_bytes(b'changed')
  with self.assertRaises(HostBlocked):verify_installation(self.root,self.hash)
 def test_manifest_itself_must_be_pinned(self):
  with self.assertRaises(HostBlocked):verify_installation(self.root,'0'*64)
 def test_rejects_parent_paths_and_reparse_points(self):
  self.manifest['files']={'../escape.py':'a'*64};raw=json.dumps(self.manifest).encode();(self.root/'installation-manifest.json').write_bytes(raw)
  with self.assertRaises(HostBlocked):verify_installation(self.root,hashlib.sha256(raw).hexdigest())
 def run_cycle(self,desired='running',ready=True,uncertain=False):
  stop=threading.Event();connection=Mock();connection.ensure_worker_token.return_value='x'*43;connection.poll_status.return_value={'desiredState':desired,'executionPaused':False}
  run=Mock(side_effect=lambda *_:stop.set());journal=Journal(self.root/'dispatch.json')
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
 def test_two_processes_cannot_own_same_lock(self):
  with SingleInstance(self.root/'host.lock'):
   with self.assertRaises(Exception):
    with SingleInstance(self.root/'host.lock'):pass
