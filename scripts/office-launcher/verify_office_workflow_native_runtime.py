"""PIE integration against the saved consumer and real browser/relay/file chain.
Only owner/DB/upstream socket and game-process lease are synthetic. No fake native
acknowledger is imported; the compiled Blueprint writes both receipt phases.
"""
from pathlib import Path
import json,os,shutil,subprocess,time,traceback,uuid
import unreal as u
from office_workflow import WorkflowVisitPresenceReceiver
from office_presence import AvatarBinding,write_presence
from office_workflow_ack import ack_path,read_native_ack

def start(root,output,repo):
    root,output,repo=Path(root),Path(output),Path(repo)
    meta=json.loads((output/'native-candidate.json').read_text());assert meta['passed']
    folder=root/'Saved/OfficeWorkflowRuntime'/str(uuid.uuid4());folder.mkdir(parents=True)
    control={'gameAlive':True,'state':'idle','finish':False};q={'passed':False,'phase':'start','scope':'isolated_saved_workflow_runtime_v1','errors':[],'samples':[],'fixture_directory':str(folder),'real_owner':False,'real_upstream_tls':False,'real_game_process_lease':False,'native_ack_fixture':False}
    lvl=u.get_editor_subsystem(u.LevelEditorSubsystem);ed=u.get_editor_subsystem(u.UnrealEditorSubsystem);sub=u.get_editor_subsystem(u.EditorActorSubsystem)
    perf=u.get_default_object(u.load_class(None,'/Script/UnrealEd.EditorPerformanceSettings'));oldperf=perf.get_editor_property('bThrottleCPUWhenNotForeground');perf.set_editor_property('bThrottleCPUWhenNotForeground',False)
    oldfps=u.SystemLibrary.get_console_variable_float_value('t.MaxFPS');oldblur=u.SystemLibrary.get_console_variable_int_value('r.MotionBlurQuality')
    child=None;cam=None;log=None;err=None
    def rec():(output/'runtime.json').write_text(json.dumps(q,indent=2))
    def cmd(**values):
        control.update(values);tmp=folder/'control.tmp';tmp.write_text(json.dumps(control));tmp.replace(folder/'control.json')
    def transport():
        try:return json.loads((folder/'transport.json').read_text())
        except:return {}
    def seq():
        nonlocal child,cam,log,err
        assert not lvl.is_in_play_in_editor();assert lvl.load_level(meta['map'])
        cam=sub.spawn_actor_from_class(u.CameraActor,u.Vector(80,1440,715));cam.set_actor_label('TEMP Native workflow runtime camera');cam.camera_component.set_field_of_view(58);cam.set_actor_rotation(u.MathLibrary.find_look_at_rotation(cam.get_actor_location(),u.Vector(500,1890,605)),False)
        lvl.editor_request_begin_play();yield .55;game=ed.get_game_world()
        while not game or u.GameplayStatics.get_time_seconds(game)<1:yield .1;game=ed.get_game_world()
        actors={a.get_name():a for a in u.GameplayStatics.get_all_actors_of_class(game,u.Actor)};a=actors[meta['target']];c=actors[meta['consumer']];a.set_editor_property('FirstActivity',3);an=a.get_component_by_class(u.SkeletalMeshComponent).get_anim_instance()
        pc=u.GameplayStatics.get_player_controller(game,0);pc.get_controlled_pawn().set_actor_location(u.Vector(-1750,1100,99),False,True);pc.set_view_target_with_blend(actors[cam.get_name()],0)
        for value in ('t.MaxFPS 35','r.MotionBlurQuality 0'):u.SystemLibrary.execute_console_command(game,value,pc)
        assert not c.get_editor_property('Enabled') and not c.get_editor_property('HasBinding');q['disabled_default']=True
        c.set_editor_property('FilePath',str(folder/'office-familje-pling.json'));c.set_editor_property('Enabled',True);cmd()
        harness=repo/'scripts/office-launcher/workflow_native_transport_fixture.mjs';assert 'FixtureNativeAck' not in harness.read_text()
        env=os.environ.copy();env['NODE_PATH']=r'C:\Users\Andre\Projects\Omnira\.worktrees\atlas-office-entry-20261106\node_modules';env['OFFICE_TEST_PYTHON']=r'C:\Python312\python.exe'
        log=(output/'native-transport.stdout.txt').open('w');err=(output/'native-transport.stderr.txt').open('w')
        child=subprocess.Popen(['node',str(harness),str(folder)],cwd=repo,env=env,stdout=log,stderr=err,creationflags=subprocess.CREATE_NO_WINDOW)
        q['phase']='native_handshake';rec();deadline=time.monotonic()+18
        while not transport().get('connected'):
            assert child.poll() is None,'Native transport process stopped before confirmation'
            assert time.monotonic()<deadline,'Native browser/companion handshake timed out'
            yield .1
        assert c.get_editor_property('HasBinding') and c.get_editor_property('AckPhase')=='applied'
        q['native_prepared_ack']=True;q['native_applied_ack']=True;q['browser_detached']=True;q['binding']={k:c.get_editor_property('Pinned'+n) for k,n in [('visit_id','Visit'),('project_id','Project'),('agent_id','Agent'),('avatar_id','Avatar')]}
        ack=json.loads(ack_path(folder,'office-familje-pling').read_text('utf-8-sig'));assert ack['phase']=='applied' and ack['visit_id']==q['binding']['visit_id'];q['first_native_ack']=ack
        def sample(phase):
            q['samples'].append({'phase':phase,'state':c.get_editor_property('AppliedState'),'known':a.get_editor_property('WorkflowStateKnown'),'busy':a.get_editor_property('WorkflowBusy'),'location':a.get_actor_location().to_tuple(),'speed':a.get_velocity().length(),'leisure':a.get_editor_property('IsLeisure'),'leisure_kind':a.get_editor_property('LeisureKind'),'home_distance':(a.get_actor_location()-a.get_editor_property('HomePoint')).length()});rec()
        q['phase']='idle_to_film';deadline=time.monotonic()+110
        while not (a.get_editor_property('IsLeisure') and a.get_editor_property('LeisureKind')==3 and an.get_curve_value('LeisureFilm')>.9):
            assert child.poll() is None;assert time.monotonic()<deadline,'Film leisure target timed out';sample(q['phase']);yield .5
        q['film_curve']=an.get_curve_value('LeisureFilm');q['idle_permits_leisure']=True
        screenshots=set((root/'Saved/Screenshots').rglob('*.png'));u.SystemLibrary.execute_console_command(game,'Shot',pc);yield .7;new=set((root/'Saved/Screenshots').rglob('*.png'))-screenshots
        if new:shutil.copy2(max(new,key=lambda p:p.stat().st_mtime),output/'Workflow_native_film.png')
        q['phase']='busy_returns_home';cmd(state='busy');deadline=time.monotonic()+18
        while not (a.get_editor_property('WorkflowStateKnown') and a.get_editor_property('WorkflowBusy') and not a.get_editor_property('IsLeisure')):
            assert time.monotonic()<deadline;yield .1
        q['interrupt_since_source_observed_seconds']=time.time()-c.get_editor_property('LastObserved');deadline=time.monotonic()+110
        while not (a.get_editor_property('AtWorkHome') and (a.get_actor_location()-a.get_editor_property('HomePoint')).length()<95 and a.get_velocity().length()<1):
            assert child.poll() is None;assert time.monotonic()<deadline,'Home return timed out';sample(q['phase']);yield .5
        q['busy_returns_home']=True;q['home_distance']=(a.get_actor_location()-a.get_editor_property('HomePoint')).length()
        q['phase']='idle_resume';cmd(state='idle');deadline=time.monotonic()+30
        while not (a.get_editor_property('WorkflowStateKnown') and not a.get_editor_property('WorkflowBusy') and a.get_velocity().length()>20):
            assert time.monotonic()<deadline;yield .15
        q['resume_speed']=a.get_velocity().length();q['phase']='paused_expiry';cmd(ttl=2.0);previous=c.get_editor_property('LastRevision');deadline=time.monotonic()+12
        while not (c.get_editor_property('LastRevision')>previous and c.get_editor_property('LastExpiry')-c.get_editor_property('LastObserved')<3):
            assert child.poll() is None;assert time.monotonic()<deadline,'Short lease not observed';yield .1
        old_frame=json.loads((folder/'office-familje-pling.json').read_text());before=u.GameplayStatics.get_time_seconds(game);assert u.GameplayStatics.set_game_paused(game,True);until=time.monotonic()+2.7
        while time.monotonic()<until:yield .1
        q['paused_world_seconds']=u.GameplayStatics.get_time_seconds(game)-before
        assert q['paused_world_seconds']<.1 and c.get_editor_property('AppliedState')=='unknown' and a.get_editor_property('WorkflowBusy') and not a.get_editor_property('WorkflowStateKnown');q['pause_expiry_holds']=True
        assert u.GameplayStatics.set_game_paused(game,False);yield .6
        assert c.get_editor_property('SessionClosed');q['closed_holds']=True
        (folder/'office-familje-pling.json').write_text(json.dumps(old_frame));yield .6
        assert c.get_editor_property('AppliedState')=='unknown' and a.get_editor_property('WorkflowBusy');q['expired_replay_holds']=True
        binding=q['binding'];other=WorkflowVisitPresenceReceiver(AvatarBinding(binding['avatar_id'],binding['project_id'],binding['agent_id']),str(uuid.uuid4()));write_presence(folder/'office-familje-pling.json',other);yield .6
        assert c.get_editor_property('PinnedVisit')==binding['visit_id'] and c.get_editor_property('SessionClosed') and read_native_ack(ack_path(folder,'office-familje-pling'),other.view(),'prepared') is None;q['same_process_rebind_refused']=True
        assert all(not actor.get_editor_property('WorkflowStateKnown') and not actor.get_editor_property('WorkflowBusy') for actor in actors.values() if actor.get_actor_label() in ('Resident | Prompt-Pling','Resident | Handlar-Pling'));q['peers_unchanged']=True
        cmd(finish=True,gameAlive=False);deadline=time.monotonic()+8
        while child.poll() is None:assert time.monotonic()<deadline;yield .1
        assert child.returncode==0;q['transport']=transport();assert q['transport'].get('revoked') is True;q['passed']=True;q['phase']='complete';rec();lvl.editor_request_end_play();yield 1.2
        sub.destroy_actor(cam);perf.set_editor_property('bThrottleCPUWhenNotForeground',oldperf)
        for value in ('t.MaxFPS '+str(oldfps),'r.MotionBlurQuality '+str(oldblur)):u.SystemLibrary.execute_console_command(ed.get_editor_world(),value)
        log.close();err.close()
    gen=seq();state={'next':0,'busy':False,'start':time.monotonic()}
    def tick(dt):
        if state['busy'] or time.monotonic()<state['next']:return
        state['busy']=True
        try:
            assert time.monotonic()-state['start']<400,'Native runtime fixture timed out'
            state['next']=time.monotonic()+next(gen)
        except StopIteration:u.unregister_slate_post_tick_callback(handle)
        except:
            q['errors'].append(traceback.format_exc());q['phase']='failed';rec();u.unregister_slate_post_tick_callback(handle);cmd(finish=True,gameAlive=False);perf.set_editor_property('bThrottleCPUWhenNotForeground',oldperf)
            game=ed.get_game_world()
            if game:u.GameplayStatics.set_game_paused(game,False)
            if lvl.is_in_play_in_editor():lvl.editor_request_end_play()
        finally:state['busy']=False
    rec();handle=u.register_slate_post_tick_callback(tick)
