"""Canonical receipt and owned upgrade regression."""
import tempfile,unittest,json
import sys
from unittest.mock import patch
from pathlib import Path
from types import SimpleNamespace
from office_install_guard import digest,canonical
from office_activity_install import validate_canonical,paths_for,SCHEMA,SOURCES,ASSET,PACKAGES
import office_activity_install as gate_module
import install_office_activity as native_install

class NewAssetRegistryTests(unittest.TestCase):
 def test_scan_saved_blueprint_before_dependency_lookup(self):
  with tempfile.TemporaryDirectory() as folder:
   font=SimpleNamespace(get_path_name=lambda:'/Engine/EngineFonts/RobotoDistanceField.RobotoDistanceField')
   component=SimpleNamespace(get_editor_property=lambda _:font)
   registry_state={'scanned':False}
   def scan(files,force_rescan=False):
    self.assertEqual(len(files),1);self.assertTrue(force_rescan);registry_state['scanned']=True
   registry=SimpleNamespace(scan_files_synchronous=scan,get_dependencies=lambda *_:[] if registry_state['scanned'] else None)
   unreal=SimpleNamespace(load_object=lambda *_:object(),get_default_object=lambda _:SimpleNamespace(get_component_by_class=lambda _:component),
    TextRenderComponent=object,AssetRegistryHelpers=SimpleNamespace(get_asset_registry=lambda:registry),AssetRegistryDependencyOptions=lambda **_:object())
   m=SimpleNamespace(PROJECT=Path(folder))
   with patch.dict(sys.modules,{'unreal':unreal}),patch('office_activity_stage.font_pages',return_value=[font]):
    self.assertEqual(native_install.packages(m),sorted(PACKAGES))

class CanonicalReceiptTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
  root=Path(self.tmp.name);self.source=root/'source';self.source.mkdir()
  self.target=SimpleNamespace(project=root/'Office/office.uproject',engine=root/'Engine/Binaries/Win64/UnrealEditor.exe',verify=lambda:None)
  self.out=self.target.project.parent/'Saved/OfficeActivityInstall';self.out.mkdir(parents=True)
  self.paths=paths_for(self.target,self.source,PACKAGES)
  for key,p in self.paths.items():p.parent.mkdir(parents=True,exist_ok=True);p.write_text('source' if key!='project' else '{"Plugins":[{"Name":"JsonBlueprintUtilities","Enabled":true}]}')
  import office_entry_install as entry
  for name in entry.MODULES:
   path=self.source/name
   if not path.exists():path.write_text('module')
  (self.source/'office_entry.py').write_text('_MODULES = '+repr(set(entry.MODULES))+'\n_EXPECTED = {}\n')
  self.hashes={k:digest(p) for k,p in self.paths.items()}
  self.candidate={'scope':SCHEMA,'installed':False,'run_id':'run','build_pid':1,'artifacts':self.hashes,'packages':list(PACKAGES),'projection_directory':str(self.out.parent/'OfficePresence')}
  self.audit={'run_id':'run','pid':2,'passed':True,'exact_binding':True,'presentation_verified':True,'preserved_actors':True,'behavior_tests':20,'artifacts':self.hashes}
  self.runtime={'run_id':'run','pid':3,'artifacts':self.hashes,'passed':True}
  for key in ('uses_saved_actor','pie_saved_actor_identity_verified','pause_observed_at_activity_expiry','pause_observed_at_identity_expiry','world_paused','native_tick_enabled','tick_when_paused','writer_stopped_after_native_ack','activity_expired_while_paused_with_stopped_writer','expiry_seen_without_writer','map_unchanged_before_exit','protected_files_unchanged'):self.runtime[key]=True
  self.receipt={'scope':SCHEMA,'installed':True,'passed':True,'run_id':'run','finalizer_pid':4,'artifacts':self.hashes,'packages':list(PACKAGES),'projection_directory':self.candidate['projection_directory']}
  self.audit['legacy_v1_exact']=True;self.runtime['fresh_seen_on_real_tick']=True
  self.candidate['bundle_id']=self.receipt['bundle_id']=gate_module.bundle_identity(self.source)
 def check(self):return validate_canonical(self.target,self.source,self.receipt,self.candidate,self.audit,self.runtime)
 def test_complete_receipt(self):self.assertEqual(self.check(),self.out.parent/'OfficePresence')
 def test_stage_or_pending_cannot_enable_capability(self):
  for changed in ({'scope':'isolated_saved_stage_v1'},{'installed':False},{'finalizer_pid':2}):
   old=dict(self.receipt);self.receipt.update(changed)
   with self.assertRaises(ValueError):self.check()
   self.receipt=old
  self.candidate['installed']=True
  with self.assertRaises(ValueError):self.check()
 def test_any_artifact_drift_fails(self):
  for key,path in self.paths.items():
   data=path.read_bytes();path.write_bytes(b'drift')
   with self.subTest(key=key),self.assertRaises(ValueError):self.check()
   path.write_bytes(data)
 def test_wrong_projection_or_missing_font_fails(self):
  self.candidate['projection_directory']='elsewhere'
  with self.assertRaises(ValueError):self.check()
  self.candidate['projection_directory']=self.receipt['projection_directory'];self.receipt['packages']=[ASSET]
  with self.assertRaises(ValueError):self.check()
 def test_path_escape_rejected(self):
  for package in ('/Engine/../secret','/Game/a\\b','/Other/root'):
   with self.assertRaises(ValueError):paths_for(self.target,self.source,[*PACKAGES,package])
 def test_every_runtime_claim_is_required(self):
  for key in [k for k,v in self.runtime.items() if v is True]:
   self.runtime[key]=False
   with self.subTest(key=key),self.assertRaises(ValueError):self.check()
   self.runtime[key]=True
 def test_full_bundle_and_exact_legacy_proof_are_pinned(self):
  path=self.source/'office_visit_relay.py';path.write_text('changed relay')
  with self.assertRaises(ValueError):self.check()
  path.write_text('module');self.audit['legacy_v1_exact']=False
  with self.assertRaises(ValueError):self.check()
 def test_committed_journal_is_required(self):
  receipt_path=self.out/'installation.json';receipt_path.write_text('{"installed":true}')
  records={canonical(p):{'before':None,'backup':None,'observed_after':digest(p)} for p in gate_module.transaction_paths(self.target)}
  backup=self.out/'original_map.umap';backup.write_text('original map')
  map_key=canonical(self.paths['map']);records[map_key].update(before=digest(backup),backup=str(backup))
  journal={'schema':'omnira.office.native-install-transaction.v1','status':'committed','records':records,'order':list(records)}
  path=self.out/'transaction.json';path.write_text(json.dumps(journal))
  gate_module.verify_committed(self.target,receipt_path)
  journal['status']='writing';path.write_text(json.dumps(journal))
  with self.assertRaises(ValueError):gate_module.verify_committed(self.target,receipt_path)
  journal['status']='committed';records[map_key]['backup']=None;path.write_text(json.dumps(journal))
  with self.assertRaises(ValueError):gate_module.verify_committed(self.target,receipt_path)
 def test_map_sidecars_are_in_guarded_scope(self):
  scope=gate_module.transaction_paths(self.target)
  for suffix in ('.umap','.uexp','.ubulk'):
   self.assertIn(self.target.project.parent/'Content'/(gate_module.MAP[6:]+suffix),scope)

class NativeInstallBoundaryTests(unittest.TestCase):
 @unittest.skipUnless(sys.platform=='win32','NTFS case-preserving restore regression')
 def test_rollback_preserves_map_filename_case(self):
  from office_install_guard import OwnedInstallTransaction,atomic_bytes
  with tempfile.TemporaryDirectory() as folder:
   root=Path(folder);original=root/'Office_Map.umap';original.write_bytes(b'original')
   backup=root/'original_map.umap';backup.write_bytes(b'original')
   tx=OwnedInstallTransaction(root/'transaction.json',originals={original:backup},new_files=[],rollback_order=[original]);tx.begin()
   tx.step('edit',[original],lambda:atomic_bytes(original,b'new'));tx.rollback()
   native_install.restore_map_names(SimpleNamespace(MAP_FILE=original,OUT=root),tx.state)
   self.assertIn('Office_Map.umap',[p.name for p in root.iterdir()]);self.assertEqual(original.read_bytes(),b'original')
 def test_removal_cannot_rebaseline_a_missing_child(self):
  before={'old':{},'child':{'parent':'old'},'pling':{'rig':'mesh'}}
  with self.assertRaises(ValueError):native_install.baseline_after_removal(before,'old',{'pling':before['pling']})
  self.assertEqual(native_install.baseline_after_removal(before,'old',{'child':before['child'],'pling':before['pling']}),{'child':before['child'],'pling':before['pling']})
 def test_actual_engine_mount_must_match(self):
  with tempfile.TemporaryDirectory() as folder:
   m=SimpleNamespace(PROJECT_FILE=Path(folder)/'office.uproject')
   unreal=SimpleNamespace(Paths=SimpleNamespace(engine_content_dir=lambda:folder,convert_relative_path_to_full=lambda p:p))
   with patch.dict(sys.modules,{'unreal':unreal}),patch.object(native_install,'target',return_value=SimpleNamespace(engine=Path(folder)/'Engine/Binaries/Win64/UnrealEditor.exe')):
    with self.assertRaises(ValueError):native_install.assert_engine_mount(m)

if __name__=='__main__':unittest.main()
