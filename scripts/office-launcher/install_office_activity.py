"""Explicit canonical local install/audit/finalize/rollback. No release or tasks."""
from pathlib import Path
from types import SimpleNamespace
import sys,json,os,uuid,shutil,time
sys.path.insert(0,str(Path(__file__).resolve().parent))
from office_install_guard import atomic_bytes,digest,OwnedInstallTransaction
import office_activity_install as gate

TAG='OfficeActivityOwned'
ASSET=gate.ASSET
MAP=gate.MAP

def load_native():
 import office_activity_native as m
 m.ASSET=ASSET;m.OUT=m.PROJECT/gate.FOLDER;m.FILE=m.PROJECT/'Saved/OfficePresence'/f'{m.AVATAR}.json'
 base_context=m.assert_context
 def context(loaded=False):
  base_context(loaded);assert_engine_mount(m)
 m.assert_context=context
 return m

def assert_engine_mount(m):
 import unreal as u
 from office_install_guard import canonical
 actual=u.Paths.convert_relative_path_to_full(u.Paths.engine_content_dir())
 expected=target(m).engine.parents[2]/'Content'
 if canonical(actual)!=canonical(expected):raise ValueError('Running Unreal engine content mount differs')

def target(m):
 return SimpleNamespace(project=m.PROJECT_FILE,engine=Path(r'C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe'))

def protected_paths(m):
 import office_activity_stage as stage
 return {k:p for k,p in stage.protected_paths(m).items() if k!='live_map'}

def hashes(paths):return {k:digest(p) for k,p in paths.items()}
def assert_protected(m,candidate):assert hashes(protected_paths(m))==candidate['protected'],'Protected Office files changed'

def packages(m):
 import unreal as u
 from office_activity_stage import font_pages
 from office_activity_stage_guard import dependency_closure
 cls=u.load_object(None,ASSET+'.BP_OfficeStepActivity_C');assert cls
 font=u.get_default_object(cls).get_component_by_class(u.TextRenderComponent).get_editor_property('font');assert font
 roots=[*gate.PACKAGES,font.get_path_name().split('.')[0],*(p.get_path_name().split('.')[0] for p in font_pages(font))]
 registry=u.AssetRegistryHelpers.get_asset_registry()
 registry.scan_files_synchronous([str(m.PROJECT/'Content'/(ASSET[6:]+'.uasset'))],force_rescan=True)
 options=u.AssetRegistryDependencyOptions(include_hard_package_references=True,include_soft_package_references=True)
 return sorted(dependency_closure(roots,lambda p:registry.get_dependencies(p,options)))

def artifact_paths(m):return gate.paths_for(target(m),Path(__file__).parent,packages(m))

def transaction(m):
 originals={};map_new=[]
 for suffix in ('.umap','.uexp','.ubulk'):
  path=m.MAP_FILE.with_suffix(suffix);backup=m.OUT/('original_map'+suffix)
  if backup.exists():originals[path]=backup
  else:map_new.append(path)
 new=[m.PROJECT/'Content'/(ASSET[6:]+s) for s in ('.uasset','.uexp','.ubulk')]
 new += [m.OUT/n for n in ('candidate.json','actors_before.json','installation.json')]
 return OwnedInstallTransaction(m.OUT/'transaction.json',originals=originals,new_files=[*map_new,*new],
  rollback_order=[m.MAP_FILE.with_suffix(s) for s in ('.umap','.uexp','.ubulk')]+new)

def restore_map_names(m,state):
 """NTFS keeps replacement filename casing; normalized journal keys are lower.

 Reapply only verified original map bytes through the approved cased path so
 Unreal's case-preserving package name is retained. Core recovery stays strict.
 """
 from office_install_guard import canonical
 if state.get('status')!='rolled_back':raise ValueError('Case restoration requires completed guarded recovery')
 for suffix in ('.umap','.uexp','.ubulk'):
  path=m.MAP_FILE.with_suffix(suffix);record=state['records'].get(canonical(path))
  if not record or record.get('before') is None:continue
  backup=Path(record['backup'])
  if canonical(backup.parent)!=canonical(m.OUT) or digest(backup)!=record['before']:raise ValueError('Original map backup differs')
  matches=[p for p in path.parent.iterdir() if p.name.casefold()==path.name.casefold()]
  if len(matches)!=1 or digest(matches[0])!=record['before']:raise ValueError('Map changed before filename case restoration')
  if matches[0].name!=path.name:atomic_bytes(path,backup.read_bytes())
  if path.name not in [p.name for p in path.parent.iterdir()] or digest(path)!=record['before']:raise ValueError('Exact map filename restoration failed')

def rollback_transaction(m,tx):
 tx.rollback();restore_map_names(m,tx.state)

def scene_snapshot(m):
 import unreal as u
 snapshot=m.base.snapshot_actors()
 for actor in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors():
  parent=actor.get_attach_parent_actor();entry=snapshot[actor.get_name()]
  entry['parent']=parent.get_name() if parent else None;entry['rig']={}
  for component in actor.get_components_by_class(u.SkeletalMeshComponent):
   mesh=component.get_skeletal_mesh_asset();anim=component.get_editor_property('anim_class')
   entry['rig'][component.get_name()]={'mesh':mesh.get_path_name() if mesh else None,'anim_class':anim.get_path_name() if anim else None,
    'animation_mode':str(component.get_editor_property('animation_mode'))}
 return snapshot

def baseline_after_removal(before,old_name,after):
 expected={k:v for k,v in before.items() if k!=old_name}
 if after!=expected:raise ValueError('Destroying old receiver changed another actor or rig')
 return expected

def exact_v1_test(m,cls,fixture):
 import unreal as u
 actors=u.get_editor_subsystem(u.EditorActorSubsystem);actor=actors.spawn_actor_from_class(cls,u.Vector(0,0,-10000))
 try:
  data={'schema':'omnira.office.private-presence.v1','avatar_id':m.AVATAR,'identity':'verified','data_state':'fresh',
   'execution':'not_verified','work_verified':False,'expires_at_unix':time.time()+15,'agent_text':'Legacy identity','project_text':'Legacy project'}
  fixture.write(json.dumps(data).encode('utf-8'));actor.call_method('ReceiveBeginPlay')
  assert actor.get_editor_property('IdentityVerified') is True and actor.get_editor_property('ActivityIndicated') is False
  assert 'Legacy identity' in str(actor.get_editor_property('DisplayText')) and 'arbetsstatus okänd' in str(actor.get_editor_property('DisplayText'))
 finally:actors.destroy_actor(actor)

def resume_transaction(m):
 tx=transaction(m);tx.state=json.loads(tx.journal.read_text('utf-8'))
 # Recovery verifies the same exact allowlist; normal writes additionally require
 # the original candidate scope and all current artifact hashes before acceptance.
 expected=set(tx.originals)|set(tx.new_files)
 assert set(tx.state['records'])==expected and set(tx.state['order'])==expected,'Transaction scope drift'
 return tx

def begin_operation(m,proof_file=None,*,load_candidate=True):
 m.assert_context();m.assert_exclusive_editor()
 tx=resume_transaction(m)
 tx.step('invalidate_acceptance',[m.OUT/'installation.json'],lambda:atomic_bytes(m.OUT/'installation.json',b'{"installed":false,"passed":false}'))
 if proof_file:
  assert proof_file in ('audit.json','runtime-activity-proof.json')
  atomic_bytes(m.OUT/proof_file,b'{"passed":false}')
 if not load_candidate:return None
 return read_candidate(m)

def read_candidate(m):
 candidate=json.loads((m.OUT/'candidate.json').read_text('utf-8'))
 assert candidate['scope']==gate.SCHEMA and candidate['installed'] is False
 assert candidate['projection_directory']==str(m.FILE.parent)
 assert candidate['packages']==packages(m)
 assert candidate['artifacts']==hashes(artifact_paths(m)),'Canonical candidate changed'
 assert_protected(m,candidate);return candidate

def inspect_actor(m,candidate):
 import unreal as u
 from office_activity_stage import font_pages
 m.assert_context(True)
 actors=u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
 owned=[a for a in actors if TAG in [str(t) for t in a.tags]];assert len(owned)==1
 actor=owned[0];assert actor.get_name()==candidate['actor_name']
 assert actor.get_class().get_path_name()==ASSET+'.BP_OfficeStepActivity_C'
 assert not [a for a in actors if 'OfficePresenceOwned' in [str(t) for t in a.tags]],'Duplicate old receiver'
 parent=actor.get_attach_parent_actor();assert parent and parent.get_name()==m.base.ACTOR_NAME and parent.get_actor_label()=='Pling | Familje'
 assert 'OfficeAvatar:'+m.AVATAR in [str(t) for t in actor.tags]
 delta=actor.get_actor_location()-parent.get_actor_location();assert abs(delta.x)<1 and abs(delta.y)<1 and 234<delta.z<236
 assert actor.get_actor_enable_collision() is False
 text=actor.get_component_by_class(u.TextRenderComponent);assert str(text.text)==m.UNKNOWN
 baseline=json.loads((m.OUT/'actors_before.json').read_text('utf-8'))
 actual=scene_snapshot(m);actual.pop(actor.get_name());assert actual==baseline,'Scene actor or rig changed'
 mat=text.get_material(0);assert mat.get_path_name()==gate.MATERIAL+'.M_OfficePresenceText'
 assert mat.get_editor_property('shading_model')==u.MaterialShadingModel.MSM_UNLIT
 for prop in (u.MaterialProperty.MP_EMISSIVE_COLOR,u.MaterialProperty.MP_OPACITY_MASK):assert u.MaterialEditingLibrary.get_material_property_input_node(mat,prop)
 font=text.get_editor_property('font');assert font and font_pages(font)
 default=u.get_default_object(actor.get_class()).get_component_by_class(u.TextRenderComponent).get_editor_property('font')
 assert font==default
 bp=u.EditorAssetLibrary.load_asset(ASSET)
 assert not u.BlueprintGraphEditor.get_graph_editor(u.BlueprintEditorLibrary.find_event_graph(bp)).list_nodes_with_errors()
 return actor

def install(m):
 import unreal as u
 from office_pairing import check_native
 from office_launcher import default_target
 m.assert_context();m.assert_exclusive_editor();check_native(default_target())
 assert not u.EditorAssetLibrary.does_asset_exist(ASSET),'Existing canonical v2 asset; use guarded recovery'
 assert not (m.OUT/'installation.json').exists(),'Existing installation receipt; no overwrite'
 m.OUT.mkdir(parents=True,exist_ok=True)
 before=hashes(protected_paths(m));assert all(before.values())
 for suffix in ('.umap','.uexp','.ubulk'):
  path=m.MAP_FILE.with_suffix(suffix);backup=m.OUT/('original_map'+suffix)
  if backup.exists():assert digest(backup)==digest(path),'Original backup differs'
  elif path.exists():shutil.copy2(path,backup)
 tx=transaction(m);tx.begin();fixture=m.ProjectionFixture(m.FILE)
 try:
  fixture.acquire()
  assert u.get_editor_subsystem(u.LevelEditorSubsystem).load_level(MAP);m.assert_context(True)
  actors=u.get_editor_subsystem(u.EditorActorSubsystem)
  m.base.verify_presence_actor()
  old=next(a for a in actors.get_all_level_actors() if 'OfficePresenceOwned' in [str(t) for t in a.tags])
  before_actors=scene_snapshot(m);old_name=old.get_name();assert actors.destroy_actor(old)
  baseline=baseline_after_removal(before_actors,old_name,scene_snapshot(m))
  tx.step('baseline',[m.OUT/'actors_before.json'],lambda:atomic_bytes(m.OUT/'actors_before.json',json.dumps(baseline,indent=2).encode('utf-8')))
  bp,cls=m.create_consumer();tests=m.behavioral_tests(cls,fixture);exact_v1_test(m,cls,fixture)
  parent=next(a for a in actors.get_all_level_actors() if a.get_name()==m.base.ACTOR_NAME)
  actor=actors.spawn_actor_from_class(cls,parent.get_actor_location()+u.Vector(0,0,235))
  actor.tags=[TAG,'OfficeAvatar:'+m.AVATAR];actor.set_actor_label('Office Activity | Familje-Pling');actor.set_actor_enable_collision(False)
  actor.get_component_by_class(u.TextRenderComponent).set_text_material(u.EditorAssetLibrary.load_asset(gate.MATERIAL))
  actor.attach_to_actor(parent,'None',u.AttachmentRule.KEEP_WORLD,u.AttachmentRule.KEEP_WORLD,u.AttachmentRule.KEEP_WORLD,False)
  candidate={'scope':gate.SCHEMA,'installed':False,'build_pid':os.getpid(),'run_id':uuid.uuid4().hex,
   'protected':before,'actor_name':actor.get_name(),'tests':tests,'projection_directory':str(m.FILE.parent),'bundle_id':gate.bundle_identity(Path(__file__).parent)}
  asset_files=[m.PROJECT/'Content'/(ASSET[6:]+s) for s in ('.uasset','.uexp','.ubulk')]
  def save_bp():assert u.EditorAssetLibrary.save_loaded_asset(bp)
  tx.step('save_canonical_blueprint',asset_files,save_bp)
  candidate['packages']=packages(m)
  inspect_actor(m,candidate);assert_protected(m,candidate);m.assert_exclusive_editor()
  def save_map():assert u.get_editor_subsystem(u.LevelEditorSubsystem).save_current_level()
  tx.step('save_canonical_map',[m.MAP_FILE.with_suffix(s) for s in ('.umap','.uexp','.ubulk')],save_map)
  candidate['artifacts']=hashes(artifact_paths(m))
  tx.step('candidate',[m.OUT/'candidate.json'],lambda:atomic_bytes(m.OUT/'candidate.json',json.dumps(candidate,indent=2).encode('utf-8')))
  tx.step('pending_receipt',[m.OUT/'installation.json'],lambda:atomic_bytes(m.OUT/'installation.json',b'{"installed":false,"passed":false}'))
  print('OFFICE_ACTIVITY_INSTALL_PENDING '+candidate['run_id'])
 except Exception:
  try:fixture.restore()
  finally:rollback_transaction(m,tx)
  raise
 finally:
  try:fixture.restore()
  except Exception:rollback_transaction(m,tx);raise

def audit(m):
 import unreal as u
 candidate=begin_operation(m,'audit.json');assert os.getpid()!=candidate['build_pid']
 assert u.get_editor_subsystem(u.LevelEditorSubsystem).load_level(MAP)
 actor=inspect_actor(m,candidate);fixture=m.ProjectionFixture(m.FILE);fixture.acquire()
 try:tests=m.behavioral_tests(actor.get_class(),fixture);exact_v1_test(m,actor.get_class(),fixture)
 finally:fixture.restore()
 assert_protected(m,candidate)
 proof={'run_id':candidate['run_id'],'pid':os.getpid(),'passed':True,'exact_binding':True,'presentation_verified':True,
  'preserved_actors':True,'legacy_v1_exact':True,'behavior_tests':len(tests),'artifacts':hashes(artifact_paths(m))}
 assert proof['artifacts']==candidate['artifacts']
 atomic_bytes(m.OUT/'audit.json',json.dumps(proof,indent=2).encode('utf-8'));print('OFFICE_ACTIVITY_INSTALL_AUDIT_OK')

def finalize(m):
 import unreal as u
 candidate=begin_operation(m)
 assert u.get_editor_subsystem(u.LevelEditorSubsystem).load_level(MAP);inspect_actor(m,candidate)
 audit_proof=json.loads((m.OUT/'audit.json').read_text('utf-8'));runtime=json.loads((m.OUT/'runtime-activity-proof.json').read_text('utf-8'))
 receipt={k:candidate[k] for k in ('scope','run_id','artifacts','packages','projection_directory','bundle_id')}
 receipt.update(installed=True,passed=True,finalizer_pid=os.getpid())
 gate.validate_canonical(target(m),Path(__file__).parent,receipt,candidate,audit_proof,runtime)
 for name,key in (('candidate.json','candidate_sha256'),('audit.json','audit_sha256'),('runtime-activity-proof.json','runtime_sha256')):receipt[key]=digest(m.OUT/name)
 tx=resume_transaction(m)
 tx.step('finalized_receipt',[m.OUT/'installation.json'],lambda:atomic_bytes(m.OUT/'installation.json',json.dumps(receipt,indent=2).encode('utf-8')))
 tx.commit();print('OFFICE_ACTIVITY_INSTALL_FINALIZED '+candidate['run_id'])

def rollback(m):
 m.assert_context();m.assert_exclusive_editor()
 tx=resume_transaction(m)
 tx.step('invalidate_before_rollback',[m.OUT/'installation.json'],lambda:atomic_bytes(m.OUT/'installation.json',b'{"installed":false,"passed":false}'))
 rollback_transaction(m,tx);print('OFFICE_ACTIVITY_INSTALL_ROLLED_BACK')

def main():
 import unreal as u
 m=load_native();command=u.SystemLibrary.get_command_line()
 operations={'-OfficeActivityInstall':install,'-OfficeActivityAudit':audit,'-OfficeActivityFinalize':finalize,'-OfficeActivityRollback':rollback}
 choices=[v for k,v in operations.items() if k in command];assert len(choices)==1
 choices[0](m)

if __name__=='__main__':main()
