"""Actual PIE tick/paused-world expiry test, using an UNSAVED prototype.
No owner authentication, source agent, model, workflow or real voice is exercised.
"""
from pathlib import Path
import importlib.util,json,time,traceback,unreal as u
spec=importlib.util.spec_from_file_location('office_native_installer',Path(__file__).with_name('install_unreal_presence.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
proof={'synthetic':True,'real_auth':False,'saved_assets':False,'passed':False}
state={'phase':'waiting_world','start':time.monotonic()}
handle=None;fixture=None;context_valid=False;level=None;game=None

def finish(error=None):
 global handle
 if state.get('finished'):return
 state['finished']=True
 if error:proof['error']=error;proof['passed']=False
 def unpause():
  if game:return u.GameplayStatics.set_game_paused(game,False)
 def end_play():
  if level and level.is_in_play_in_editor():level.editor_request_end_play()
 def restore():
  if fixture:fixture.restore()
 def unchanged():
  if not context_valid:return True
  same=m.sha(m.MAP_FILE)==proof.get('map_before_sha256')
  proof['map_unchanged_before_exit']=same;return same
 # Each action is independent: a PIE teardown error must never skip restoration.
 from office_install_guard import finish_checks,atomic_bytes
 finish_checks(proof,[('unpause',unpause),('end_play',end_play),('restore_projection',restore),('map_hash',unchanged)])
 if context_valid:
  m.OUT.mkdir(parents=True,exist_ok=True)
  atomic_bytes(m.OUT/'runtime_expiry_proof.json',(json.dumps(proof,indent=2)+'\n').encode('utf-8'))
 else:print(json.dumps(proof))  # Wrong-project runs never write into the intended project's folders.
 if handle:u.unregister_slate_post_tick_callback(handle);handle=None
 u.SystemLibrary.quit_editor()


def advance(_delta):
 global game
 try:
  if time.monotonic()-state['start']>45:raise AssertionError('Timed out waiting for actual PIE expiry proof')
  if not level.is_in_play_in_editor():return
  game=u.EditorLevelLibrary.get_game_world()
  if not game:return
  actors=u.GameplayStatics.get_all_actors_with_tag(game,'OfficePresenceOwned' if proof.get('uses_installed_actor') else 'OfficeNativeRuntimeProbe')
  if proof.get('uses_installed_actor'):actors=[a for a in actors if 'OfficeAvatar:'+m.AVATAR in [str(t) for t in a.tags]]
  if len(actors)!=1:return
  actor=actors[0]
  if state['phase']=='waiting_world':
   proof['native_tick_enabled']=actor.is_actor_tick_enabled()
   assert proof['native_tick_enabled'],'Native actor must actually tick in PIE'
   tick=actor.get_editor_property('primary_actor_tick')
   proof['tick_interval']=tick.get_editor_property('tick_interval')
   proof['tick_when_paused']=tick.get_editor_property('tick_even_when_paused')
   m.assert_context();m.assert_exclusive_editor()
   state['expiry']=time.time()+4
   data={'schema':'omnira.office.private-presence.v1','avatar_id':m.AVATAR,'data_state':'fresh',
    'identity':'verified','execution':'not_verified','work_verified':False,'animation':'ambient',
    'project_text':'Runtime testprojekt','agent_text':'Runtime testagent','status_text':'UNTRUSTED',
    'step_reference':None,'step_expires_at_unix':None,'expires_at_unix':state['expiry']}
   fixture.write(json.dumps(data).encode('utf-8'))
   state['phase']='waiting_fresh';return
  if state['phase']=='waiting_fresh':
   if actor.get_editor_property('IdentityVerified'):
    assert 'Runtime testagent' in str(actor.get_editor_property('DisplayText'))
    proof['fresh_seen_on_real_tick']=True
    assert u.GameplayStatics.set_game_paused(game,True),'PIE pause request failed'
    proof['world_paused']=True;state['phase']='waiting_expired'
   elif time.time()>state['expiry']+1:raise AssertionError('No actual tick loaded the fresh projection')
  elif state['phase']=='waiting_expired' and time.time()>state['expiry']+.8:
   assert actor.get_editor_property('IdentityVerified') is False,'Expired identity must clear while PIE is paused'
   assert str(actor.get_editor_property('DisplayText'))==m.UNKNOWN
   assert json.loads(m.FILE.read_text())['identity']=='verified','Writer must remain stopped with an old file'
   proof['expiry_seen_without_writer']=True;proof['passed']=True
   finish()
 except Exception:finish(traceback.format_exc())

try:
 m.assert_context();m.assert_exclusive_editor();context_valid=True
 proof['map_before_sha256']=m.sha(m.MAP_FILE)
 level=u.get_editor_subsystem(u.LevelEditorSubsystem);assert level.load_level(m.MAP);m.assert_context(loaded=True)
 fixture=m.ProjectionFixture(m.FILE);fixture.acquire()
 if u.EditorAssetLibrary.does_asset_exist(m.ASSET):
  from office_install_guard import verify_artifacts
  manifest=json.loads(m.INSTALL_MANIFEST.read_text(encoding='utf-8'))
  verify_artifacts(manifest,source=Path(m.__file__),asset=m.ASSET_FILE,project=m.PROJECT_FILE)
  baseline=json.loads((m.OUT/'actors_before.json').read_text(encoding='utf-8'))
  proof.update(m.verify_presence_actor(baseline))
  proof['uses_installed_actor']=True
 else:
  bp,cls=m.create_consumer()
  probe=u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(cls,u.Vector(0,0,-10000))
  probe.tags=['OfficeNativeRuntimeProbe'];proof['uses_installed_actor']=False
 handle=u.register_slate_post_tick_callback(advance)
 level.editor_play_simulate()
except Exception:finish(traceback.format_exc())
