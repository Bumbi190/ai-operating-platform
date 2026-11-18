"""Scoped, journaled readability correction for the installed receiver label.

Copies the engine font material into this feature's own asset. Never edits engine
content, the receiver graph, the Pling rig or any pre-existing room actor.
"""
from pathlib import Path
import importlib.util,json,shutil,traceback
import unreal as u
spec=importlib.util.spec_from_file_location('office_native_installer',Path(__file__).with_name('install_unreal_presence.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
from office_install_guard import OwnedInstallTransaction,atomic_bytes,verify_artifacts
MATERIAL=m.ASSET.rsplit('/',1)[0]+'/M_OfficePresenceText'
MATERIAL_FILE=m.ASSET_FILE.with_name('M_OfficePresenceText.uasset')
NEW_FILES=[MATERIAL_FILE,MATERIAL_FILE.with_suffix('.uexp'),MATERIAL_FILE.with_suffix('.ubulk')]
JOURNAL=m.OUT/'presentation_transaction.json'
ENGINE_MATERIAL='/Engine/EngineMaterials/DefaultTextMaterialOpaque'
ml=u.MaterialEditingLibrary

def verify(actor,manifest):
 text=actor.get_component_by_class(u.TextRenderComponent)
 mat=text.get_material(0)
 assert mat.get_path_name()==MATERIAL+'.M_OfficePresenceText','Label must use its own readable text material'
 assert mat.get_editor_property('shading_model')==u.MaterialShadingModel.MSM_UNLIT,'Label must remain readable without room light'
 assert ml.get_material_property_input_node(mat,u.MaterialProperty.MP_EMISSIVE_COLOR),'Text color must drive emission'
 assert ml.get_material_property_input_node(mat,u.MaterialProperty.MP_OPACITY_MASK),'Font silhouette must be retained'
 recorded=manifest.get('presentation',{})
 assert recorded.get('material_sha256')==m.sha(MATERIAL_FILE),'Material hash changed'
 assert recorded.get('source_sha256')==m.sha(Path(__file__)),'Presentation patch changed'
 return {'material':mat.get_path_name(),'unlit':True,'font_mask':True,'material_sha256':m.sha(MATERIAL_FILE)}

def main():
 m.assert_context();m.assert_exclusive_editor()
 assert u.get_editor_subsystem(u.LevelEditorSubsystem).load_level(m.MAP)
 m.assert_context(loaded=True)
 manifest=json.loads(m.INSTALL_MANIFEST.read_text(encoding='utf-8'))
 verify_artifacts(manifest,source=Path(m.__file__),asset=m.ASSET_FILE,project=m.PROJECT_FILE)
 assert manifest.get('installed') is True,'Verify the original saved receiver before styling it'
 baseline=json.loads((m.OUT/'actors_before.json').read_text(encoding='utf-8'))
 m.verify_presence_actor(baseline)
 actors=u.get_editor_subsystem(u.EditorActorSubsystem)
 actor=next(a for a in actors.get_all_level_actors() if 'OfficePresenceOwned' in [str(t) for t in a.tags])
 before=m.sha(m.MAP_FILE);engine=u.EditorAssetLibrary.load_asset(ENGINE_MATERIAL)
 engine_file=Path(u.Paths.convert_relative_path_to_full(u.Paths.engine_content_dir()))/'EngineMaterials/DefaultTextMaterialOpaque.uasset'
 engine_before=m.sha(engine_file)
 proof={'passed':False,'saved_assets':False,'real_auth':False,'map_before_sha256':before}
 try:
  if '-OfficePresenceVerifyStyleOnly' in u.SystemLibrary.get_command_line() or manifest.get('presentation'):
   proof.update(verify(actor,manifest),passed=True,already_saved=True,map_unchanged=True)
  else:
   assert before==manifest['map_after_sha256'],'World changed after installed receiver verification'
   backup=m.OUT/f'Before_ReadablePresence_{before[:12]}.umap'
   if not backup.exists():shutil.copy2(m.MAP_FILE,backup)
   manifest_backup=m.OUT/f'Before_ReadablePresence_{m.sha(m.INSTALL_MANIFEST)[:12]}.json'
   if not manifest_backup.exists():shutil.copy2(m.INSTALL_MANIFEST,manifest_backup)
   tx=OwnedInstallTransaction(JOURNAL,originals={m.MAP_FILE:backup,m.INSTALL_MANIFEST:manifest_backup},
    new_files=NEW_FILES,rollback_order=[m.MAP_FILE,*NEW_FILES,m.INSTALL_MANIFEST])
   if JOURNAL.exists():
    previous=json.loads(JOURNAL.read_text(encoding='utf-8'))
    if previous.get('status') not in ('committed','rolled_back'):
     OwnedInstallTransaction.recover(JOURNAL,allowed_files=[m.MAP_FILE,m.INSTALL_MANIFEST,*NEW_FILES])
     raise RuntimeError('Recovered recorded presentation writes; restart editor before retry')
   tx.begin()
   try:
    def create_material():
     assert not u.EditorAssetLibrary.does_asset_exist(MATERIAL),'Refusing unrelated material asset'
     mat=u.AssetToolsHelpers.get_asset_tools().duplicate_asset('M_OfficePresenceText',MATERIAL.rsplit('/',1)[0],engine)
     assert mat
     color=ml.get_material_property_input_node(mat,u.MaterialProperty.MP_BASE_COLOR)
     output=ml.get_material_property_input_node_output_name(mat,u.MaterialProperty.MP_BASE_COLOR)
     assert color and ml.get_material_property_input_node(mat,u.MaterialProperty.MP_OPACITY_MASK)
     assert ml.connect_material_property(color,output,u.MaterialProperty.MP_EMISSIVE_COLOR)
     mat.set_editor_property('shading_model',u.MaterialShadingModel.MSM_UNLIT)
     ml.recompile_material(mat)
     assert u.EditorAssetLibrary.save_loaded_asset(mat)
     return mat
    mat=tx.step('create_owned_unlit_font_material',NEW_FILES,create_material)
    actor.get_component_by_class(u.TextRenderComponent).set_text_material(mat)
    assert m.sha(m.MAP_FILE)==before and m.sha(engine_file)==engine_before
    m.assert_context(loaded=True);m.assert_exclusive_editor()
    def save_map():assert u.get_editor_subsystem(u.LevelEditorSubsystem).save_current_level()
    tx.step('save_label_material_override',[m.MAP_FILE],save_map)
    m.verify_presence_actor(baseline)
    manifest.update(installed=False,status='styled_pending_fresh_process_verification',fresh_process_verified=False,
     runtime_pause_expiry_verified=False,map_after_sha256=m.sha(m.MAP_FILE),
     presentation={'material_sha256':m.sha(MATERIAL_FILE),'source_sha256':m.sha(Path(__file__))})
    tx.step('record_presentation',[m.INSTALL_MANIFEST],lambda:atomic_bytes(m.INSTALL_MANIFEST,(json.dumps(manifest,indent=2)+'\n').encode('utf-8')))
    proof.update(verify(actor,manifest),passed=True,saved_assets=True,map_after_sha256=m.sha(m.MAP_FILE),engine_unchanged=m.sha(engine_file)==engine_before)
    tx.commit()
   except Exception:
    tx.rollback();raise
 except Exception:
  proof['error']=traceback.format_exc()
  raise
 finally:
  atomic_bytes(m.OUT/'presentation_proof.json',(json.dumps(proof,indent=2)+'\n').encode('utf-8'))
  print(json.dumps(proof))

if __name__=='__main__':main()
