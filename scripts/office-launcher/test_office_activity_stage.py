"""Saved-stage acceptance must bind independent proofs to every artifact."""
import ast,copy,tempfile,unittest,json
from pathlib import Path
from types import SimpleNamespace
from office_activity_stage_guard import validate_stage
from unittest.mock import patch
import office_activity_stage as stage_module
import office_activity_stage_guard as guard_module

class StageGuardTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
  self.paths={k:Path(self.temp.name)/k for k in ('map','blueprint','material','font','project','source')}
  for p in self.paths.values():p.write_text('original')
  from office_install_guard import digest
  self.hashes={k:digest(p) for k,p in self.paths.items()}
  self.candidate={'scope':'isolated_saved_stage_v1','installed':False,'run_id':'test-run','artifacts':self.hashes,'build_pid':10}
  self.audit={'run_id':'test-run','artifacts':self.hashes,'pid':20,'passed':True,'exact_binding':True,'presentation_verified':True,'behavior_tests':20,'preserved_actors':True}
  self.runtime={'run_id':'test-run','artifacts':self.hashes,'pid':30,'passed':True,'uses_saved_actor':True,'world_paused':True,'native_tick_enabled':True,'tick_when_paused':True,'writer_stopped_after_native_ack':True,'activity_expired_while_paused_with_stopped_writer':True,'expiry_seen_without_writer':True,'map_unchanged_before_exit':True,'protected_files_unchanged':True}
  self.runtime.update(pie_saved_actor_identity_verified=True,pause_observed_at_activity_expiry=True,pause_observed_at_identity_expiry=True)
 def check(self):return validate_stage(self.candidate,self.audit,self.runtime,self.paths)
 def test_accepts_complete_independent_staging_evidence(self):self.assertTrue(self.check())
 def test_rejects_each_artifact_drift(self):
  for key,path in self.paths.items():
   with self.subTest(key=key):
    path.write_text('changed')
    with self.assertRaises(ValueError):self.check()
    path.write_text('original')
 def test_rejects_hash_only_receipt(self):
  self.audit={}
  with self.assertRaises(ValueError):self.check()
 def test_rejects_every_missing_acceptance_claim(self):
  for proof in (self.audit,self.runtime):
   for key in [k for k,v in proof.items() if v is True]:
    with self.subTest(key=key):
     proof[key]=False
     with self.assertRaises(ValueError):self.check()
     proof[key]=True
 def test_rejects_same_process_and_old_run(self):
  for key,value in [('pid',10),('pid',20),('run_id','old-run')]:
   previous=self.runtime[key];self.runtime[key]=value
   with self.assertRaises(ValueError):self.check()
   self.runtime[key]=previous
 def test_rejects_missing_or_added_dependencies(self):
  self.audit['artifacts']=dict(self.hashes);self.audit['artifacts'].pop('font')
  with self.assertRaises(ValueError):self.check()
 def test_rejects_cleanup_errors_and_live_claim(self):
  self.runtime['cleanup_errors']=['failure']
  with self.assertRaises(ValueError):self.check()
  self.runtime.pop('cleanup_errors');self.candidate['installed']=True
  with self.assertRaises(ValueError):self.check()
 def test_rejects_skipped_behavioral_checks(self):
  self.audit['behavior_tests']=0
  with self.assertRaises(ValueError):self.check()

class RuntimeCleanupTests(unittest.TestCase):
 def test_dependency_failure_still_records_failure_and_quits(self):
  source=Path(__file__).with_name('verify_office_activity_stage_runtime.py')
  tree=ast.parse(source.read_text('utf-8'))
  finish=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='finish')
  with tempfile.TemporaryDirectory() as folder:
   events=[];root=Path(folder)
   def missing_dependencies(_):raise ValueError('dependency disappeared')
   stage=SimpleNamespace(assert_protected=lambda *_:None,artifact_paths=missing_dependencies,hashes=lambda _: {})
   unreal=SimpleNamespace(unregister_slate_post_tick_callback=lambda _:events.append('unregister'),SystemLibrary=SimpleNamespace(quit_editor=lambda:events.append('quit')))
   namespace={'stage':stage,'u':unreal,'state':{},'handle':'callback','fixture':SimpleNamespace(restore=lambda:events.append('restore')),
    'game':None,'level':None,'context_valid':True,'candidate':{},'json':json,
    'm':SimpleNamespace(OUT=root,MAP_FILE=root/'map',base=SimpleNamespace(sha=lambda _:'hash')),
    'proof':{'passed':True,'map_before_sha256':'hash'}}
   exec(compile(ast.Module(body=[finish],type_ignores=[]),str(source),'exec'),namespace)
   namespace['finish']()
   self.assertEqual(events,['restore','unregister','quit'])
   proof=json.loads((root/'runtime-activity-proof.json').read_text('utf-8'))
   self.assertFalse(proof['passed']);self.assertTrue(proof['cleanup_errors'])

class RecheckAndNativeEvidenceTests(unittest.TestCase):
 def test_expiry_assertion_waits_for_actual_native_tick(self):
  self.assertFalse(guard_module.native_expiry_observed(101.3,99.9,100))
  self.assertFalse(guard_module.native_expiry_observed(99.9,101,100))
  self.assertTrue(guard_module.native_expiry_observed(101.3,100.1,100))
 def test_failed_candidate_check_revokes_acceptance_and_previous_operation_proof(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder)
   m=SimpleNamespace(OUT=root,assert_context=lambda:None,assert_exclusive_editor=lambda:None)
   for name in ('staging_acceptance.json','audit.json'):(root/name).write_text('{"passed":true}')
   with patch.object(stage_module,'read_candidate',side_effect=ValueError('drift')):
    with self.assertRaises(ValueError):stage_module.begin_operation(m,'audit.json')
   for name in ('staging_acceptance.json','audit.json'):
    self.assertFalse(json.loads((root/name).read_text())['passed'])
 def test_rollback_failure_first_revokes_acceptance(self):
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);receipt=root/'staging_acceptance.json';receipt.write_text('{"passed":true}')
   m=SimpleNamespace(OUT=root,assert_context=lambda:None,assert_exclusive_editor=lambda:None)
   with patch.object(stage_module,'protected_paths',return_value={}),patch.object(stage_module,'owned_files',return_value=[]),patch.object(stage_module.OwnedInstallTransaction,'recover',side_effect=ValueError('external drift')):
    with self.assertRaises(ValueError):stage_module.rollback(m)
   self.assertFalse(json.loads(receipt.read_text())['passed'])
 def test_font_and_external_texture_are_explicit_dependency_roots(self):
  roots=['/Game/Stage/BP','/Game/Stage/Material','/Engine/Font','/Engine/ExternalFontPage']
  self.assertEqual(guard_module.dependency_closure(roots,lambda _:[]),set(roots))
  with self.assertRaises(ValueError):guard_module.dependency_closure(roots,lambda _:None)
 def test_pie_rejects_replaced_actor_or_resumed_world(self):
  expected={'name':'Receiver','class':'Class','parent_name':'Pling','parent_label':'Pling | Familje'}
  self.assertTrue(guard_module.verify_pie_observation(expected,expected,same_actor=True,paused=True,require_pause=True))
  for key in expected:
   actual={**expected,key:'other'}
   with self.assertRaises(ValueError):guard_module.verify_pie_observation(expected,actual,same_actor=True,paused=True,require_pause=True)
  for changed in ({'same_actor':False},{'paused':False}):
   options={'same_actor':True,'paused':True,'require_pause':True,**changed}
   with self.assertRaises(ValueError):guard_module.verify_pie_observation(expected,expected,**options)

if __name__=='__main__':unittest.main()
