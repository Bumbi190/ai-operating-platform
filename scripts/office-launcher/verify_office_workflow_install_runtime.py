"""Fresh full-editor PIE acceptance of the dedicated saved workflow map.

PIE uses owned temporary projections, preserving the live namespace. Saved path
and enabled target are independently audited; a fixed-path game test is separate.
"""
from pathlib import Path
import json,os,subprocess,time,traceback,uuid
import unreal as u
from office_presence import AvatarBinding,write_presence
from office_workflow import WorkflowVisitPresenceReceiver
from office_workflow_ack import ack_path,read_native_ack
from office_install_guard import digest
from office_workflow_native_guard import CHECKS,FOLDER
from install_office_workflow_native import ROOT,OFFICE_MAP,inspect,check_candidate,write
import verify_office_workflow_native_runtime as base

def start(repo):
    repo=Path(repo);folder=ROOT/FOLDER;c=json.loads((folder/'candidate.json').read_text());assert c['passed'] and os.getpid()!=c['build_pid']
    inspect(c);check_candidate(c,Path(c['bundle']))
    out=folder/'pie';out.mkdir(exist_ok=True);write(out/'native-candidate.json',c)
    result={'scope':'canonical_saved_workflow_v1','passed':False,'pid':os.getpid(),'run_id':c['run_id'],'packages':c['packages'],'artifacts':c['artifacts'],'errors':[],'real_owner':False,'real_upstream_tls':False,'real_game_process_lease':False,'native_ack_fixture':False,'test_projection_override':True}
    lvl=u.get_editor_subsystem(u.LevelEditorSubsystem);ed=u.get_editor_subsystem(u.UnrealEditorSubsystem);sub=u.get_editor_subsystem(u.EditorActorSubsystem)
    avatar='office-familje-pling';temp=ROOT/'Saved/OfficeWorkflowRuntime'/uuid.uuid4().hex;temp.mkdir(parents=True)
    path=temp/(avatar+'.json');project=str(uuid.uuid4());agent=str(uuid.uuid4());visit=str(uuid.uuid4());r=WorkflowVisitPresenceReceiver(AvatarBinding(avatar,project,agent),visit)
    child=None;logs=[];editor_consumer=None;original_path=None
    def record():write(folder/'runtime.json',result)
    def begin():
        nonlocal editor_consumer,original_path
        assert lvl.load_level(OFFICE_MAP)
        editor_consumer=next(a for a in sub.get_all_level_actors() if a.get_name()==c['consumer']);assert editor_consumer.get_editor_property('Enabled')
        original_path=editor_consumer.get_editor_property('FilePath');assert original_path==str(ROOT/'Saved/OfficePresence'/(avatar+'.json'))
        editor_consumer.set_editor_property('FilePath',str(path));lvl.editor_request_begin_play()
    def actors():
        game=ed.get_game_world();assert game
        rows={a.get_name():a for a in u.GameplayStatics.get_all_actors_of_class(game,u.Actor)}
        return rows[c['consumer']],rows[c['target']]
    def frame(revision):
        now=time.time();return {'schema':'omnira.office.workflow-state.v1','scope':'workflow_state_v1','visit_id':visit,'avatar_id':avatar,'project_id':project,'agent_id':agent,'revision':revision,'observed_at_unix':now,'expires_at_unix':now+15,'workflow_state':'idle','coverage':'complete','execution':'not_verified'}
    def seq():
        nonlocal child
        # Negative protocol checks in a new world, before any source polling.
        begin();yield 1;consumer,target=actors();write_presence(path,r);deadline=time.monotonic()+8
        while read_native_ack(ack_path(temp,avatar),r.view(),'prepared') is None:assert time.monotonic()<deadline;yield .1
        r.accept_authorized(frame(1));write_presence(path,r);deadline=time.monotonic()+8
        while read_native_ack(ack_path(temp,avatar),r.view(),'applied') is None:assert time.monotonic()<deadline;yield .1
        for key,value,raw,flag in [('project_id',str(uuid.uuid4()),'RawProject','wrong_binding_holds'),('scope','test_only','RawScope','wrong_scope_holds')]:
            bad=r.view();bad[key]=value;path.write_text(json.dumps(bad));deadline=time.monotonic()+5
            while not (consumer.get_editor_property(raw)==value and consumer.get_editor_property('AppliedState')=='unknown' and target.get_editor_property('WorkflowBusy')):assert time.monotonic()<deadline;yield .1
            result[flag]=True;r.accept_authorized(frame(r.view()['revision']+1));write_presence(path,r);yield .65;assert consumer.get_editor_property('AppliedState')=='idle'
        path.write_text(json.dumps({'schema':'omnira.office.private-presence.v1','identity':'verified','data_state':'fresh','execution':'not_verified','work_verified':False,'avatar_id':avatar,'project_id':project,'agent_id':agent,'expires_at_unix':time.time()+10}));yield .7
        assert consumer.get_editor_property('AppliedState')=='unknown' and target.get_editor_property('WorkflowBusy');result['legacy_presence_compatible']=True
        first_game=ed.get_game_world();lvl.editor_request_end_play();yield .3
        while lvl.is_in_play_in_editor():yield .1
        editor_consumer.set_editor_property('FilePath',original_path)
        # Actual missing native acknowledgement: suppress native output before
        # preparation. The real browser/relay must stop with zero source reads.
        temp2=ROOT/'Saved/OfficeWorkflowRuntime'/uuid.uuid4().hex;temp2.mkdir();assert lvl.load_level(OFFICE_MAP)
        ec=next(a for a in sub.get_all_level_actors() if a.get_name()==c['consumer']);ec.set_editor_property('FilePath',str(temp2/(avatar+'.json')));lvl.editor_request_begin_play();yield .3
        deadline=time.monotonic()+15
        while not lvl.is_in_play_in_editor() or not ed.get_game_world() or ed.get_game_world()==first_game:assert time.monotonic()<deadline;yield .1
        consumer,target=actors();deadline=time.monotonic()+10
        while not consumer.get_editor_property('HasTarget'):assert time.monotonic()<deadline;yield .1
        result['missing_ack_fixture_directory']=str(temp2)
        result['missing_ack_initial']={'pinned_path':consumer.get_editor_property('PinnedPath'),'has_binding':consumer.get_editor_property('HasBinding'),'world':ed.get_game_world().get_path_name()};record()
        assert consumer.get_editor_property('PinnedPath')==str(temp2/(avatar+'.json')) and not consumer.get_editor_property('HasBinding')
        (temp2/'control.json').write_text(json.dumps({'gameAlive':True,'state':'idle','finish':False}))
        env=os.environ.copy();env['NODE_PATH']=r'C:\Users\Andre\Projects\Omnira\.worktrees\atlas-office-entry-20261106\node_modules';env['OFFICE_TEST_PYTHON']=r'C:\Python312\python.exe'
        logs.extend([(out/'missing-ack.stdout.txt').open('w'),(out/'missing-ack.stderr.txt').open('w')])
        child=subprocess.Popen(['node',str(repo/'scripts/office-launcher/workflow_missing_ack_transport_fixture.mjs'),str(temp2)],cwd=repo,env=env,stdout=logs[0],stderr=logs[1],creationflags=subprocess.CREATE_NO_WINDOW);deadline=time.monotonic()+35
        while child.poll() is None:assert time.monotonic()<deadline,'Missing native ack did not stop';yield .2
        state=json.loads((temp2/'transport.json').read_text());assert child.returncode!=0 and not state['connected'] and state['reads']==0
        result['missing_ack_observation']={'has_binding':consumer.get_editor_property('HasBinding'),'visit':consumer.get_editor_property('PinnedVisit'),'raw_visit':consumer.get_editor_property('RawVisit'),'raw_stage':consumer.get_editor_property('RawVisitState'),'state':state};record()
        assert consumer.get_editor_property('HasBinding') and consumer.get_editor_property('PinnedVisit')==state['visitId']
        assert consumer.get_editor_property('AppliedState')=='unknown' and target.get_editor_property('WorkflowBusy');result['missing_native_ack_holds']=True;result['missing_ack_transport']=state
        lvl.editor_request_end_play();yield 1.4;ec.set_editor_property('FilePath',original_path)
        for log in logs:log.close()
        assert lvl.load_level(OFFICE_MAP)
        # The complete browser/native-ack/navigation sequence uses the same saved
        # actor with enabled=True, changing only its unsaved PIE fixture path.
        base.start(ROOT,out,repo,saved_enabled=True);deadline=time.monotonic()+420
        while True:
            q=json.loads((out/'runtime.json').read_text())
            assert not q.get('errors'),q.get('errors')
            if q.get('passed'):break
            assert time.monotonic()<deadline;yield .3
        yield 4;assert not lvl.is_in_play_in_editor();assert lvl.load_level(OFFICE_MAP)
        inspect(c);check_candidate(c,Path(c['bundle']))
        for key in ('busy_returns_home','idle_permits_leisure','pause_expiry_holds','native_prepared_ack','native_applied_ack','same_process_rebind_refused'):assert q[key] is True;result[key]=True
        result['fresh_native_tick']=True;result['movement_sample_count']=len(q['samples']);result['pie_evidence_sha256']=digest(out/'runtime.json');result['map_unchanged']=True
        assert all(result[k] is True for k in CHECKS)
        result['passed']=True;result['phase']='complete';record();yield 1;u.SystemLibrary.quit_editor()
    gen=seq();state={'next':0,'busy':False}
    def tick(dt):
        if state['busy'] or time.monotonic()<state['next']:return
        state['busy']=True
        try:state['next']=time.monotonic()+next(gen)
        except StopIteration:u.unregister_slate_post_tick_callback(handle)
        except:
            result['errors'].append(traceback.format_exc());result['phase']='failed';record();u.unregister_slate_post_tick_callback(handle)
            if child and child.poll() is None:child.terminate()
            for log in logs:log.close()
            if lvl.is_in_play_in_editor():lvl.editor_request_end_play()
        finally:state['busy']=False
    record();handle=u.register_slate_post_tick_callback(tick)
