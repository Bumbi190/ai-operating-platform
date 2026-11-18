"""Unsaved, explicit scene captures of the installed Familje-Pling receiver."""
from pathlib import Path
import importlib.util,json,time,traceback
import unreal as u
spec=importlib.util.spec_from_file_location('office_native_installer',Path(__file__).with_name('install_unreal_presence.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
m.assert_context();m.assert_exclusive_editor()
before=m.sha(m.MAP_FILE)
assert u.get_editor_subsystem(u.LevelEditorSubsystem).load_level(m.MAP)
m.assert_context(loaded=True)
sub=u.get_editor_subsystem(u.EditorActorSubsystem)
world=u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world()
actors=sub.get_all_level_actors()
label=next(a for a in actors if 'OfficePresenceOwned' in [str(t) for t in a.tags])
pling=next(a for a in actors if a.get_name()==m.ACTOR_NAME)
origin=pling.get_actor_location();rotation=label.get_actor_rotation()
capture=sub.spawn_actor_from_class(u.SceneCapture2D,origin+u.Vector(400,300,170))
capture.set_actor_label('Private presence temporary review camera')
c=capture.capture_component2d
rt=u.RenderingLibrary.create_render_target2d(world,1600,900,u.TextureRenderTargetFormat.RTF_RGBA8)
c.set_editor_property('texture_target',rt)
c.set_editor_property('capture_source',u.SceneCaptureSource.SCS_FINAL_COLOR_LDR)
c.set_editor_property('capture_every_frame',True)
c.set_editor_property('always_persist_rendering_state',True)
views=[((400,300,170),58,'Familje_Pling_overview.png'),((240,200,225),50,'Familje_Pling_label.png')]
phase=0;started=time.monotonic();proof={'saved_assets':False,'real_auth':False,'map_before_sha256':before}
def camera():
 offset,fov,_=views[phase]
 location=origin+u.Vector(*offset)
 target=origin+u.Vector(0,0,145 if phase==0 else 228)
 capture.set_actor_location(location,False,False)
 capture.set_actor_rotation(u.MathLibrary.find_look_at_rotation(location,target),False)
 c.set_editor_property('fov_angle',float(fov))
 # Editor has no player camera. Face only the NEW label toward this temporary camera.
 look=u.MathLibrary.find_look_at_rotation(label.get_actor_location(),location)
 label.set_actor_rotation(u.Rotator(pitch=0,yaw=look.yaw,roll=0),False)
camera()
def finish():
 label.set_actor_rotation(rotation,False)
 sub.destroy_actor(capture)
 proof['map_unchanged']=m.sha(m.MAP_FILE)==before
 (m.OUT/'visual_review.json').write_text(json.dumps(proof,indent=2),encoding='utf-8')
 u.unregister_slate_post_tick_callback(handle)
 u.SystemLibrary.quit_editor()
def tick(dt):
 global phase,started
 try:
  c.capture_scene()
  if time.monotonic()-started<8:return
  u.RenderingLibrary.export_render_target(world,rt,str(m.OUT),views[phase][2])
  if phase==0:
   phase=1;started=time.monotonic();camera();return
  proof['rendered']=True
 except Exception:proof['error']=traceback.format_exc()
 finish()
handle=u.register_slate_post_tick_callback(tick)
