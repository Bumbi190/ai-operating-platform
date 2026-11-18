from pathlib import Path
import unreal as u,json,time,sys,uuid,traceback,shutil
sys.path.insert(0,r'D:\Projekt\Omnira\Worktrees\office-workflow-status-20261118\scripts\office-launcher')
from office_presence import AvatarBinding,write_presence
from office_workflow import WorkflowVisitPresenceReceiver
from office_workflow_ack import read_native_ack,ack_path
root=Path(r'C:\Users\Andre\Projects\Omnira\Design\Agent-Campus-3D\UnrealPilot\Omnira_Office_CastQA_v83');out=Path(r'C:\Users\Andre\Projects\Omnira\Temp\unreal-office-workflow-consumer-20261118');meta=json.loads((out/'native-candidate.json').read_text());folder=root/'Saved/OfficeWorkflowSmoke'/str(uuid.uuid4());folder.mkdir(parents=True);avatar='office-familje-pling';project=str(uuid.uuid4());agent=str(uuid.uuid4());visit=str(uuid.uuid4());frame_path=folder/(avatar+'.json');receiver=WorkflowVisitPresenceReceiver(AvatarBinding(avatar,project,agent),visit);r={'passed':False,'phase':'start','errors':[]};lvl=u.get_editor_subsystem(u.LevelEditorSubsystem);ed=u.get_editor_subsystem(u.UnrealEditorSubsystem)
def rec():(out/'smoke.json').write_text(json.dumps(r,indent=2))
def data(rev):
 now=time.time();return {'schema':'omnira.office.workflow-state.v1','scope':'workflow_state_v1','visit_id':visit,'avatar_id':avatar,'project_id':project,'agent_id':agent,'revision':rev,'observed_at_unix':now,'expires_at_unix':now+10,'workflow_state':'idle','coverage':'complete','execution':'not_verified'}
def seq():
 assert not lvl.is_in_play_in_editor();assert lvl.load_level(meta['map']);lvl.editor_request_begin_play();yield .7
 game=ed.get_game_world();assert game
 actors={a.get_name():a for a in u.GameplayStatics.get_all_actors_of_class(game,u.Actor)};a=actors[meta['target']];c=actors[meta['consumer']];assert not c.get_editor_property('Enabled');write_presence(frame_path,receiver);c.set_editor_property('FilePath',str(frame_path));c.set_editor_property('Enabled',True)
 r['phase']='prepare';rec();deadline=time.monotonic()+10
 while read_native_ack(ack_path(folder,avatar),receiver.view(),'prepared') is None:
  assert time.monotonic()<deadline,'Native prepared ack missing';yield .1
 r['native_prepared_ack']=True;r['phase']='active';receiver.accept_authorized(data(1));write_presence(frame_path,receiver);rec();deadline=time.monotonic()+8
 while read_native_ack(ack_path(folder,avatar),receiver.view(),'applied') is None:
  assert time.monotonic()<deadline,'Native applied ack missing';yield .1
 assert a.get_editor_property('WorkflowStateKnown') and not a.get_editor_property('WorkflowBusy');r['native_applied_ack']=True
 fractional=receiver.view();fractional['revision']=1.5;frame_path.write_text(json.dumps(fractional));yield .65;assert c.get_editor_property('AppliedState')=='unknown' and a.get_editor_property('WorkflowBusy');r['fractional_revision_rejected']=True
 receiver.accept_authorized(data(2));write_presence(frame_path,receiver);yield .65;assert c.get_editor_property('AppliedState')=='idle'
 bad=receiver.view();bad['workflow_state_known']='true';frame_path.write_text(json.dumps(bad));yield .65
 assert c.get_editor_property('AppliedState')=='unknown' and a.get_editor_property('WorkflowBusy');r['primitive_coercion_rejected']=True
 receiver.accept_authorized(data(9007199254740991));write_presence(frame_path,receiver);yield .65;assert c.get_editor_property('AppliedState')=='idle' and c.get_editor_property('LastRevision')==9007199254740991;assert read_native_ack(ack_path(folder,avatar),receiver.view(),'applied') is not None;r['safe_integer_max_revision_passed']=True;r['higher_revision_recovers']=True
 wrong=receiver.view();wrong['scope']='test_only';frame_path.write_text(json.dumps(wrong));yield .65;assert c.get_editor_property('AppliedState')=='unknown' and a.get_editor_property('WorkflowBusy');r['wrong_scope_holds']=True
 closed=WorkflowVisitPresenceReceiver(AvatarBinding(avatar,project,agent),visit,closed=True);write_presence(frame_path,closed);yield .65;assert c.get_editor_property('SessionClosed') and a.get_editor_property('WorkflowBusy');r['closed_holds']=True
 other=WorkflowVisitPresenceReceiver(AvatarBinding(avatar,project,agent),str(uuid.uuid4()));write_presence(frame_path,other);yield .65;assert c.get_editor_property('SessionClosed') and c.get_editor_property('PinnedVisit')==visit and a.get_editor_property('WorkflowBusy');r['same_process_rebind_refused']=True
 r['passed']=True;r['phase']='complete';rec();lvl.editor_request_end_play();yield 1;shutil.rmtree(folder)
gen=seq();state={'next':0,'busy':False}
def tick(dt):
 if state['busy'] or time.monotonic()<state['next']:return
 state['busy']=True
 try:state['next']=time.monotonic()+next(gen)
 except StopIteration:u.unregister_slate_post_tick_callback(handle)
 except:
  r['errors'].append(traceback.format_exc());rec();u.unregister_slate_post_tick_callback(handle)
  if lvl.is_in_play_in_editor():lvl.editor_request_end_play()
 finally:state['busy']=False
rec();handle=u.register_slate_post_tick_callback(tick)