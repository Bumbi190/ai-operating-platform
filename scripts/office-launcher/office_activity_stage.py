"""Isolated saved-v2 lab. Never writes the canonical map or installation receipt.

Unreal commandlet switches: -OfficeActivityStageBuild / Audit / Finalize.
The separate PIE script consumes the same immutable saved-stage candidate.
"""
from pathlib import Path
import json,os,sys,uuid,traceback
sys.path.insert(0,str(Path(__file__).resolve().parent))
from office_install_guard import atomic_bytes,digest,OwnedInstallTransaction,validate_context
from office_activity_stage_guard import validate_stage,dependency_closure

TAG='OfficeActivityStageOwned'
PACKAGE='/Game/OmniraGameplayV83/ActivityStage20261113'
MAP=PACKAGE+'/Office_Activity_Stage'
ASSET=PACKAGE+'/BP_OfficeActivityStage'

def load_native():
 import office_activity_native as m
 m.ASSET=ASSET
 m.MAP=MAP;m.MAP_FILE=m.PROJECT/'Content'/(MAP[6:]+'.umap')
 m.OUT=m.PROJECT/'Saved/OfficeActivityStage20261113'
 m.FILE=m.OUT/'fixture'/f'{m.AVATAR}.json'
 def context(loaded=False):
  import unreal as u
  if not loaded:return m.base.assert_context(False)
  world=u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world() if loaded else None
  level=u.get_editor_subsystem(u.LevelEditorSubsystem).get_current_level() if loaded else None
  validate_context(active_project=u.Paths.convert_relative_path_to_full(u.Paths.get_project_file_path()),
   active_content=u.Paths.convert_relative_path_to_full(u.Paths.project_content_dir()),
   expected_project=m.PROJECT_FILE,expected_map_file=m.MAP_FILE,map_package=MAP,
   world_path=world.get_path_name() if world else None,level_path=level.get_path_name() if level else None)
 m.assert_context=context
 return m

def material_file(m):return m.base.ASSET_FILE.with_name('M_OfficePresenceText.uasset')
def protected_paths(m):
 paths={'live_map':m.base.MAP_FILE,'project':m.PROJECT_FILE,'live_blueprint':m.base.ASSET_FILE,'live_material':material_file(m)}
 for name in ('installation.json','fresh_process_audit.json','runtime_expiry_proof.json'):
  paths['live_'+name]=m.base.OUT/name
 return paths
def hashes(paths):return {key:digest(path) for key,path in paths.items()}
def assert_protected(m,candidate):
 assert hashes(protected_paths(m))==candidate['protected'],'Canonical Office artifacts changed'

def package_files(m,package):
 import unreal as u
 if package.startswith('/Game/'):root=m.PROJECT/'Content';relative=package[6:]
 elif package.startswith('/Engine/'):root=Path(u.Paths.convert_relative_path_to_full(u.Paths.engine_content_dir()));relative=package[8:]
 else:raise ValueError('Unreviewed dependency mount: '+package)
 file=root/(relative+'.uasset')
 if not file.exists():file=root/(relative+'.umap')
 assert file.is_file(),'Dependency missing: '+str(file)
 return [file]+[p for p in (file.with_suffix('.uexp'),file.with_suffix('.ubulk')) if p.exists()]

def font_pages(font):
 import unreal as u
 # UFont.Textures is protected in UE 5.8. Fully loaded offline-font pages are
 # embedded Texture2D subobjects, whose bytes are in the font package itself.
 assert font.get_path_name()=='/Engine/EngineFonts/RobotoDistanceField.RobotoDistanceField','Unreviewed font'
 pages=[o for o in u.ObjectIterator(u.Texture2D) if o.get_path_name().startswith(font.get_path_name()+':')]
 assert pages,'Loaded embedded font texture page missing'
 return pages

def dependencies(m):
 """Re-enumerate hard AND soft package closure independently on every pass."""
 import unreal as u
 registry=u.AssetRegistryHelpers.get_asset_registry()
 options=u.AssetRegistryDependencyOptions(include_hard_package_references=True,include_soft_package_references=True)
 cls=u.load_object(None,ASSET+'.BP_OfficeActivityStage_C');assert cls
 text=u.get_default_object(cls).get_component_by_class(u.TextRenderComponent)
 font=text.get_editor_property('font');assert font,'Actual text font missing'
 font_package=font.get_path_name().split('.')[0]
 textures=font_pages(font)
 roots=[ASSET,m.base.ASSET.rsplit('/',1)[0]+'/M_OfficePresenceText',font_package]
 roots.extend(t.get_path_name().split('.')[0] for t in textures)
 packages=dependency_closure(roots,lambda package:registry.get_dependencies(package,options))
 assert font_package in packages and all(t.get_path_name().split('.')[0] in packages for t in textures)
 result={}
 for package in sorted(packages):
  for file in package_files(m,package):result['dependency:'+package+file.suffix]=file
 return result

def artifact_paths(m):
 result={'map':m.MAP_FILE,'blueprint':m.PROJECT/'Content'/(ASSET[6:]+'.uasset'),'project':m.PROJECT_FILE,
  'baseline':m.OUT/'actors_before.json'}
 for name in ('office_activity_stage.py','office_activity_stage_guard.py','office_activity_native.py',
  'install_unreal_presence.py','office_install_guard.py','verify_office_activity_stage_runtime.py'):
  result['source:'+name]=Path(__file__).with_name(name)
 for key in ('map','blueprint'):
  for suffix in ('.uexp','.ubulk'):
   p=result[key].with_suffix(suffix)
   if p.exists():result[key+suffix]=p
 result.update(dependencies(m));return result

def read_candidate(m):
 candidate=json.loads((m.OUT/'candidate.json').read_text('utf-8'))
 assert candidate.get('scope')=='isolated_saved_stage_v1' and candidate.get('installed') is False
 assert hashes(artifact_paths(m))==candidate['artifacts'],'Saved candidate drift'
 assert_protected(m,candidate)
 return candidate

def inspect_actor(m,candidate):
 import unreal as u
 m.assert_context(True)
 subsystem=u.get_editor_subsystem(u.EditorActorSubsystem)
 actors=subsystem.get_all_level_actors()
 owned=[a for a in actors if TAG in [str(t) for t in a.tags]]
 assert len(owned)==1,'Exactly one saved stage receiver required'
 actor=owned[0]
 assert actor.get_name()==candidate['actor_name']
 assert actor.get_class().get_path_name()==ASSET+'.BP_OfficeActivityStage_C'
 assert not [a for a in actors if 'OfficePresenceOwned' in [str(t) for t in a.tags]],'Lab must not have a second identity receiver'
 parent=actor.get_attach_parent_actor()
 assert parent and parent.get_name()==m.base.ACTOR_NAME and parent.get_actor_label()=='Pling | Familje'
 assert 'OfficeAvatar:'+m.AVATAR in [str(t) for t in actor.tags]
 delta=actor.get_actor_location()-parent.get_actor_location()
 assert abs(delta.x)<1 and abs(delta.y)<1 and 234<delta.z<236
 assert actor.get_actor_enable_collision() is False
 assert str(actor.get_component_by_class(u.TextRenderComponent).text)==m.UNKNOWN
 baseline=json.loads((m.OUT/'actors_before.json').read_text('utf-8'))
 actual=m.base.snapshot_actors();actual.pop(actor.get_name())
 assert actual==baseline,'Existing scene actor changed'
 text=actor.get_component_by_class(u.TextRenderComponent);mat=text.get_material(0)
 expected=m.base.ASSET.rsplit('/',1)[0]+'/M_OfficePresenceText.M_OfficePresenceText'
 assert mat and mat.get_path_name()==expected
 assert mat.get_editor_property('shading_model')==u.MaterialShadingModel.MSM_UNLIT
 assert u.MaterialEditingLibrary.get_material_property_input_node(mat,u.MaterialProperty.MP_EMISSIVE_COLOR)
 assert u.MaterialEditingLibrary.get_material_property_input_node(mat,u.MaterialProperty.MP_OPACITY_MASK)
 font=text.get_editor_property('font');assert font,'Native font dependency missing'
 cls=u.load_object(None,ASSET+'.BP_OfficeActivityStage_C')
 default_font=u.get_default_object(cls).get_component_by_class(u.TextRenderComponent).get_editor_property('font')
 assert font==default_font,'Unexpected per-actor font override'
 hashed_dependencies=dependencies(m)
 for resource in [font,*font_pages(font)]:
  package=resource.get_path_name().split('.')[0]
  assert any(key.startswith('dependency:'+package+'.') for key in hashed_dependencies),'Unhashed actual font resource'
 bp=u.EditorAssetLibrary.load_asset(ASSET);assert bp
 ed=u.BlueprintGraphEditor.get_graph_editor(u.BlueprintEditorLibrary.find_event_graph(bp))
 assert not ed.list_nodes_with_errors()
 return actor

def owned_files(m):
 return [m.MAP_FILE,m.MAP_FILE.with_suffix('.uexp'),m.MAP_FILE.with_suffix('.ubulk'),
  m.PROJECT/'Content'/(ASSET[6:]+'.uasset'),m.PROJECT/'Content'/(ASSET[6:]+'.uexp'),m.PROJECT/'Content'/(ASSET[6:]+'.ubulk'),
  m.OUT/'candidate.json',m.OUT/'actors_before.json']

def invalidate_acceptance(m):
 atomic_bytes(m.OUT/'staging_acceptance.json',json.dumps({'scope':'isolated_saved_stage_v1','installed':False,'passed':False}).encode('utf-8'))

def begin_operation(m,proof_file=None,*,load_candidate=True):
 m.assert_context();m.assert_exclusive_editor()
 m.OUT.mkdir(parents=True,exist_ok=True)
 invalidate_acceptance(m)
 if proof_file:
  assert proof_file in ('audit.json','runtime-activity-proof.json'),'Unknown evidence target'
  atomic_bytes(m.OUT/proof_file,b'{"passed":false}')
 return read_candidate(m) if load_candidate else None

def build(m):
 import unreal as u
 m.assert_context();m.assert_exclusive_editor()
 assert not u.EditorAssetLibrary.does_asset_exist(ASSET) and not u.EditorAssetLibrary.does_asset_exist(MAP),'Stage already exists; no overwrite'
 before=hashes(protected_paths(m));assert all(before.values())
 m.OUT.mkdir(parents=True,exist_ok=True)
 new=owned_files(m)
 tx=OwnedInstallTransaction(m.OUT/'transaction.json',originals={},new_files=new,rollback_order=new)
 tx.begin()
 fixture=m.ProjectionFixture(m.FILE)
 try:
  assert u.get_editor_subsystem(u.LevelEditorSubsystem).load_level(m.base.MAP)
  m.base.assert_context(True)
  actors=u.get_editor_subsystem(u.EditorActorSubsystem)
  old=[a for a in actors.get_all_level_actors() if 'OfficePresenceOwned' in [str(t) for t in a.tags]]
  assert len(old)==1;assert actors.destroy_actor(old[0])
  baseline=m.base.snapshot_actors()
  tx.step('record_baseline',[m.OUT/'actors_before.json'],lambda:atomic_bytes(m.OUT/'actors_before.json',json.dumps(baseline,indent=2).encode('utf-8')))
  bp,cls=m.create_consumer();fixture.acquire()
  tests=m.behavioral_tests(cls,fixture);fixture.restore()
  parent=next(a for a in actors.get_all_level_actors() if a.get_name()==m.base.ACTOR_NAME)
  assert parent.get_actor_label()=='Pling | Familje'
  actor=actors.spawn_actor_from_class(cls,parent.get_actor_location()+u.Vector(0,0,235))
  actor.tags=[TAG,'OfficeAvatar:'+m.AVATAR];actor.set_actor_label('Office Activity | Isolated saved stage')
  actor.set_actor_enable_collision(False)
  text=actor.get_component_by_class(u.TextRenderComponent)
  text.set_text_material(u.EditorAssetLibrary.load_asset(m.base.ASSET.rsplit('/',1)[0]+'/M_OfficePresenceText'))
  actor.attach_to_actor(parent,'None',u.AttachmentRule.KEEP_WORLD,u.AttachmentRule.KEEP_WORLD,u.AttachmentRule.KEEP_WORLD,False)
  def save_bp():assert u.EditorAssetLibrary.save_loaded_asset(bp)
  tx.step('save_isolated_blueprint',new[3:6],save_bp)
  m.assert_exclusive_editor();assert hashes(protected_paths(m))==before
  def save_map():
   world=u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
   assert u.EditorLoadingAndSavingUtils.save_map(world,MAP)
  tx.step('save_duplicate_map',new[:3],save_map)
  candidate={'scope':'isolated_saved_stage_v1','installed':False,'run_id':uuid.uuid4().hex,
   'build_pid':os.getpid(),'protected':before,'actor_name':actor.get_name(),'tests':tests,'artifacts':hashes(artifact_paths(m))}
  assert u.get_editor_subsystem(u.LevelEditorSubsystem).load_level(MAP)
  inspect_actor(m,candidate);assert_protected(m,candidate)
  tx.step('record_candidate',[m.OUT/'candidate.json'],lambda:atomic_bytes(m.OUT/'candidate.json',json.dumps(candidate,indent=2).encode('utf-8')))
  tx.commit();print('OFFICE_ACTIVITY_STAGE_BUILD_OK '+candidate['run_id'])
 except Exception:
  try:fixture.restore()
  finally:tx.rollback()
  raise

def audit(m):
 import unreal as u
 candidate=begin_operation(m,'audit.json');assert os.getpid()!=candidate['build_pid']
 assert u.get_editor_subsystem(u.LevelEditorSubsystem).load_level(MAP)
 actor=inspect_actor(m,candidate)
 fixture=m.ProjectionFixture(m.FILE);fixture.acquire()
 try:tests=m.behavioral_tests(actor.get_class(),fixture)
 finally:fixture.restore()
 assert_protected(m,candidate)
 proof={'run_id':candidate['run_id'],'pid':os.getpid(),'passed':True,'exact_binding':True,
  'presentation_verified':True,'preserved_actors':True,'behavior_tests':len(tests),'artifacts':hashes(artifact_paths(m))}
 assert proof['artifacts']==candidate['artifacts']
 atomic_bytes(m.OUT/'audit.json',json.dumps(proof,indent=2).encode('utf-8'))
 print('OFFICE_ACTIVITY_STAGE_AUDIT_OK '+candidate['run_id'])

def finalize(m):
 import unreal as u
 candidate=begin_operation(m)
 assert u.get_editor_subsystem(u.LevelEditorSubsystem).load_level(MAP)
 inspect_actor(m,candidate)
 audit_proof=json.loads((m.OUT/'audit.json').read_text('utf-8'))
 runtime=json.loads((m.OUT/'runtime-activity-proof.json').read_text('utf-8'))
 assert os.getpid() not in (candidate['build_pid'],audit_proof['pid'],runtime['pid'])
 validate_stage(candidate,audit_proof,runtime,artifact_paths(m))
 receipt={'scope':'isolated_saved_stage_v1','installed':False,'passed':True,'run_id':candidate['run_id'],
  'artifacts':candidate['artifacts'],'audit_sha256':digest(m.OUT/'audit.json'),
  'runtime_sha256':digest(m.OUT/'runtime-activity-proof.json'),'finalizer_pid':os.getpid(),
  'live_launcher_enabled':False,'real_auth':False,'workflow_execution_verified':False}
 atomic_bytes(m.OUT/'staging_acceptance.json',json.dumps(receipt,indent=2).encode('utf-8'))
 print('OFFICE_ACTIVITY_STAGE_FINALIZE_OK '+candidate['run_id'])

def rollback(m):
 begin_operation(m,load_candidate=False)
 before=hashes(protected_paths(m))
 OwnedInstallTransaction.recover(m.OUT/'transaction.json',allowed_files=owned_files(m))
 assert not any(p.exists() for p in owned_files(m)),'Owned rollback incomplete'
 assert hashes(protected_paths(m))==before,'Protected Office drift during rollback'
 print('OFFICE_ACTIVITY_STAGE_ROLLBACK_OK')

def main():
 import unreal as u
 m=load_native();m.assert_context();m.assert_exclusive_editor()
 command=u.SystemLibrary.get_command_line()
 if '-OfficeActivityStageBuild' in command:build(m)
 elif '-OfficeActivityStageAudit' in command:audit(m)
 elif '-OfficeActivityStageFinalize' in command:finalize(m)
 elif '-OfficeActivityStageRollback' in command:rollback(m)
 else:raise ValueError('Explicit isolated stage operation required')

if __name__=='__main__':main()
