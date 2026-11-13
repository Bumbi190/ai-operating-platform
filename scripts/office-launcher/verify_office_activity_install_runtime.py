"""Actual PIE tick/paused-world expiry test, using the independently reloaded canonical SAVED actor.
No owner authentication, source agent, model, workflow or real voice is exercised.
"""
from pathlib import Path
import importlib.util,json,time,traceback,unreal as u
import sys,os
sys.path.insert(0,str(Path(__file__).resolve().parent))
import install_office_activity as stage
from office_activity_stage_guard import verify_pie_observation,native_expiry_observed
m=stage.load_native()
candidate=None
proof={'synthetic':True,'real_auth':False,'saved_assets':False,'passed':False}
state={'phase':'waiting_world','start':time.monotonic()}
handle=None;fixture=None;context_valid=False;level=None;game=None

def finish(error=None):
 global handle
 if state.get('finished'):return
 state['finished']=True
 if error:proof['error']=error;proof['passed']=False
 def unpause():
  if game and u.GameplayStatics.is_game_paused(game):return u.GameplayStatics.set_game_paused(game,False)
 def end_play():
  if level and level.is_in_play_in_editor():level.editor_request_end_play()
 def restore():
  if fixture:fixture.restore()
 def unchanged():
  if not context_valid:return True
  stage.assert_protected(m,candidate)
  proof['protected_files_unchanged']=True
  same=m.base.sha(m.MAP_FILE)==proof.get('map_before_sha256')
  proof['map_unchanged_before_exit']=same;return same
 def artifacts():
  if not context_valid:return True
  proof['artifacts']=stage.hashes(stage.artifact_paths(m))
  return proof['artifacts']==candidate['artifacts']
 def unregister():
  global handle
  callback=handle;handle=None
  if callback:u.unregister_slate_post_tick_callback(callback)
 # Each action is independent: a PIE teardown error must never skip restoration.
 from office_install_guard import finish_checks,atomic_bytes
 finish_checks(proof,[('unpause',unpause),('end_play',end_play),('restore_projection',restore),('map_hash',unchanged),('artifact_hashes',artifacts),('unregister_callback',unregister)])
 try:
  if context_valid:
   m.OUT.mkdir(parents=True,exist_ok=True)
   atomic_bytes(m.OUT/'runtime-activity-proof.json',(json.dumps(proof,indent=2)+'\n').encode('utf-8'))
  else:print(json.dumps(proof))  # Wrong-project runs never write into the intended project's folders.
 finally:u.SystemLibrary.quit_editor()


def advance(_delta):
 global game
 try:
  if time.monotonic()-state['start']>45:raise AssertionError('Timed out waiting for actual PIE expiry proof')
  if not level.is_in_play_in_editor():return
  game=u.EditorLevelLibrary.get_game_world()
  if not game:return
  actors=u.GameplayStatics.get_all_actors_with_tag(game,stage.TAG)
  assert len(actors)==1,'Exactly one saved receiver must survive in PIE'
  actor=actors[0]
  parent=actor.get_attach_parent_actor();assert parent,'Saved receiver parent missing in PIE'
  observed={'name':actor.get_name(),'class':actor.get_class().get_path_name(),
   'parent_name':parent.get_name(),'parent_label':parent.get_actor_label()}
  expected={'name':candidate['actor_name'],'class':stage.ASSET+'.BP_OfficeStepActivity_C',
   'parent_name':m.base.ACTOR_NAME,'parent_label':'Pling | Familje'}
  verify_pie_observation(expected,observed,same_actor=state.get('actor',actor)==actor,
   paused=u.GameplayStatics.is_game_paused(game),require_pause=state['phase'] in ('waiting_activity_expired','waiting_expired'))
  proof['pie_saved_actor_identity_verified']=True
  if state['phase']=='waiting_world':
   state['actor']=actor
   proof['native_tick_enabled']=actor.is_actor_tick_enabled()
   assert proof['native_tick_enabled'],'Native actor must actually tick in PIE'
   tick=actor.get_editor_property('primary_actor_tick')
   proof['tick_interval']=tick.get_editor_property('tick_interval')
   proof['tick_when_paused']=tick.get_editor_property('tick_even_when_paused')
   m.assert_context();m.assert_exclusive_editor()
   state['expiry']=time.time()+5
   state['activity_expiry']=time.time()+1.5
   data={'schema':'omnira.office.private-presence.v2','avatar_id':m.AVATAR,'data_state':'fresh',
    'identity':'verified','execution':'not_verified','work_verified':False,'animation':'ambient',
    'project_text':'Runtime testprojekt','agent_text':'Prov '+candidate['run_id'][:8],'status_text':'UNTRUSTED',
    'step_reference':None,'step_expires_at_unix':None,'expires_at_unix':state['expiry'],
    'activity_kind':'step_request_waiting_for_reply','activity_expires_at_unix':state['activity_expiry'],
    'activity_event_key':'a'*64,'activity_observed_at_unix':time.time()-1}
   fixture.write(json.dumps(data).encode('utf-8'))
   state['phase']='waiting_fresh';return
  if state['phase']=='waiting_fresh':
   if actor.get_editor_property('IdentityVerified'):
    assert 'Prov '+candidate['run_id'][:8] in str(actor.get_editor_property('DisplayText'))
    assert actor.get_editor_property('ActivityIndicated') is True
    assert 'Stegbegäran registrerad' in str(actor.get_editor_property('DisplayText'))
    proof['fresh_seen_on_real_tick']=True
    proof['writer_stopped_after_native_ack']=True
    state['stopped_file_sha256']=stage.digest(m.FILE)
    assert u.GameplayStatics.set_game_paused(game,True),'PIE pause request failed'
    proof['world_paused']=True;state['phase']='waiting_activity_expired'
   else:
    # Match a live writer during cold PIE startup; freeze only AFTER native ack.
    # A stopped-writer expiry assertion before the first real read is invalid.
    data=json.loads(m.FILE.read_text('utf-8'))
    state['expiry']=time.time()+5;state['activity_expiry']=time.time()+1.5
    data['expires_at_unix']=state['expiry'];data['activity_expires_at_unix']=state['activity_expiry']
    data['activity_event_key']=m.hashlib.sha256(str(time.time_ns()).encode('ascii')).hexdigest();data['activity_observed_at_unix']=time.time()-1
    fixture.write(json.dumps(data).encode('utf-8'))
  elif state['phase']=='waiting_activity_expired' and native_expiry_observed(time.time(),actor.get_editor_property('NowWall'),state['activity_expiry']):
   proof['activity_expiry_native_wall']=actor.get_editor_property('NowWall')
   proof['pause_observed_at_activity_expiry']=True
   assert actor.get_editor_property('IdentityVerified') is True,'Identity should still be valid'
   assert actor.get_editor_property('ActivityIndicated') is False,'Activity must expire on paused-world real tick'
   assert 'Stegbegäran registrerad' not in str(actor.get_editor_property('DisplayText'))
   assert json.loads(m.FILE.read_text())['activity_kind']=='step_request_waiting_for_reply'
   assert stage.digest(m.FILE)==state['stopped_file_sha256'],'Projection bytes changed after writer stopped'
   proof['activity_expired_while_paused_with_stopped_writer']=True;state['phase']='waiting_expired'
  elif state['phase']=='waiting_expired' and native_expiry_observed(time.time(),actor.get_editor_property('NowWall'),state['expiry']):
   proof['identity_expiry_native_wall']=actor.get_editor_property('NowWall')
   proof['pause_observed_at_identity_expiry']=True
   assert actor.get_editor_property('IdentityVerified') is False,'Expired identity must clear while PIE is paused'
   assert str(actor.get_editor_property('DisplayText'))==m.STALE
   assert actor.get_editor_property('ActivityIndicated') is False
   assert json.loads(m.FILE.read_text())['identity']=='verified','Writer must remain stopped with an old file'
   assert stage.digest(m.FILE)==state['stopped_file_sha256'],'Projection bytes changed after writer stopped'
   proof['expiry_seen_without_writer']=True;proof['passed']=True
   finish()
 except Exception:finish(traceback.format_exc())

try:
 candidate=stage.begin_operation(m,'runtime-activity-proof.json');context_valid=True
 proof.update(run_id=candidate['run_id'],pid=os.getpid(),saved_assets=True)
 assert os.getpid()!=candidate['build_pid']
 proof['map_before_sha256']=m.base.sha(m.MAP_FILE)
 level=u.get_editor_subsystem(u.LevelEditorSubsystem);assert level.load_level(m.MAP);m.assert_context(loaded=True)
 fixture=m.ProjectionFixture(m.FILE);fixture.acquire()
 stage.inspect_actor(m,candidate)
 proof['uses_saved_actor']=True
 handle=u.register_slate_post_tick_callback(advance)
 level.editor_play_simulate()
except Exception:finish(traceback.format_exc())
