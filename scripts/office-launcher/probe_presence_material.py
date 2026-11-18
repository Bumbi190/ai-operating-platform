from pathlib import Path
import importlib.util,json
import unreal as u
spec=importlib.util.spec_from_file_location('office_native_installer',Path(__file__).with_name('install_unreal_presence.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.assert_context();m.assert_exclusive_editor()
assert u.get_editor_subsystem(u.LevelEditorSubsystem).load_level(m.MAP)
m.assert_context(loaded=True)
actor=next(a for a in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors() if 'OfficePresenceOwned' in [str(t) for t in a.tags])
text=actor.get_component_by_class(u.TextRenderComponent)
material=text.get_material(0)
r={'material':material.get_path_name(),'class':material.get_class().get_path_name(),'font':text.font.get_path_name()}
if isinstance(material,u.Material):
 r['shading_model']=str(material.get_editor_property('shading_model'))
 for prop in [u.MaterialProperty.MP_BASE_COLOR,u.MaterialProperty.MP_EMISSIVE_COLOR,u.MaterialProperty.MP_OPACITY_MASK]:
  node=u.MaterialEditingLibrary.get_material_property_input_node(material,prop)
  r[str(prop)]={'node':node.get_path_name() if node else None,'output':u.MaterialEditingLibrary.get_material_property_input_node_output_name(material,prop)}
(m.OUT/'material_probe.json').write_text(json.dumps(r,indent=2),encoding='utf-8')
print(json.dumps(r))
