"""Editor-only saved Blueprint builder. New asset and isolated preview map only.
Runtime consumer is Blueprint/engine JSON, with no runtime Python dependency.
"""
from pathlib import Path
import hashlib
import json
import unreal as u
from office_native_graph import GraphOps

ASSET='/Game/OmniraGameplayV83/PrivateWorkflow/BP_OfficeWorkflowPresence'
MAP='/Game/OmniraRealismLab/Maps/Previews/Omnira_Office_WorkflowConsumer_Review_20261118'
AVATAR='office-familje-pling'
FIELDS=[('schema','Schema','string'),('scope','Scope','string'),('visit_state','VisitState','string'),
 ('visit_id','Visit','string'),('avatar_id','Avatar','string'),('project_id','Project','string'),('agent_id','Agent','string'),
 ('revision','Revision','double'),('observed_at_unix','Observed','double'),('expires_at_unix','Expiry','double'),
 ('workflow_state','State','string'),('coverage','Coverage','string'),('workflow_state_known','Known','bool'),
 ('workflow_busy','Busy','bool'),('identity','Identity','string'),('data_state','DataState','string'),
 ('execution','Execution','string'),('work_verified','WorkVerified','bool')]

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def sig(actor):
    components=[]
    for c in actor.get_components_by_class(u.MeshComponent):
        mesh=c.static_mesh if isinstance(c,u.StaticMeshComponent) else c.get_editor_property('skeletal_mesh_asset') if isinstance(c,u.SkeletalMeshComponent) else None
        components.append([c.get_name(),mesh.get_path_name() if mesh else None,c.get_editor_property('relative_location').to_tuple(),c.get_editor_property('relative_rotation').to_tuple(),[c.get_material(i).get_path_name() if c.get_material(i) else None for i in range(c.get_num_materials())],str(c.get_collision_enabled()),str(c.get_collision_profile_name()),c.get_editor_property('visible'),c.get_editor_property('hidden_in_game'),c.get_editor_property('cast_shadow'),c.get_editor_property('can_ever_affect_navigation')])
    return json.loads(json.dumps([actor.get_actor_label(),actor.get_class().get_path_name(),actor.get_actor_location().to_tuple(),actor.get_actor_rotation().to_tuple(),actor.get_actor_scale3d().to_tuple(),actor.get_editor_property('hidden'),components]))

def build(root, output, prior):
    root,output=Path(root),Path(output);output.mkdir(parents=True,exist_ok=True)
    EAL=u.EditorAssetLibrary;BEL=u.BlueprintEditorLibrary
    lvl=u.get_editor_subsystem(u.LevelEditorSubsystem);sub=u.get_editor_subsystem(u.EditorActorSubsystem);ed=u.get_editor_subsystem(u.UnrealEditorSubsystem)
    assert not lvl.is_in_play_in_editor()
    src=prior['map'];source_file=root/'Content'/Path(src.removeprefix('/Game/')).with_suffix('.umap')
    assert prior['final_passed'] and sha(source_file)==prior['map_sha256']
    protected=dict(prior['protected']);protected[str(source_file)]=prior['map_sha256']
    old_bp=root/'Content'/Path(prior['blueprint'].removeprefix('/Game/')).with_suffix('.uasset');protected[str(old_bp)]=sha(old_bp)
    assert all(sha(p)==h for p,h in protected.items())
    manifest=output/'native-candidate.json'
    if EAL.does_asset_exist(ASSET) or EAL.does_asset_exist(MAP):
        assert manifest.exists(),'Existing unowned workflow consumer asset/map'
        previous=json.loads(manifest.read_text());assert previous['asset']==ASSET and previous['map']==MAP
        assert lvl.load_level(MAP);before=previous['original_signatures']
    else:
        assert lvl.load_level(src);before={a.get_name():sig(a) for a in sub.get_all_level_actors()}
        assert u.EditorLoadingAndSavingUtils.save_map(ed.get_editor_world(),MAP);assert lvl.load_level(MAP)
    result={'scope':'isolated_saved_workflow_candidate_v1','installed':False,'passed':False,'asset':ASSET,'map':MAP,
            'source_map':src,'protected':protected,'original_signatures':before,'errors':[],
            'binding_policy':'one workflow binding per native game world; restart required for another visit'}
    manifest.write_text(json.dumps(result,indent=2))
    factory=u.BlueprintFactory();factory.set_editor_property('parent_class',u.Actor)
    bp=EAL.load_asset(ASSET) if EAL.does_asset_exist(ASSET) else u.AssetToolsHelpers.get_asset_tools().create_asset(ASSET.rsplit('/',1)[1],ASSET.rsplit('/',1)[0],u.Blueprint,factory)
    assert bp
    g=GraphOps(bp);graph=g.graph;graph.remove_nodes(graph.list_all_nodes())
    res=u.load_class(None,'/Game/OmniraGameplayV83/OfficeFreeLife20261117/BP_Pling_FreeLife.BP_Pling_FreeLife_C')
    real=g.fn('GameplayStatics','GetTimeSeconds')[0].find_output_pin('ReturnValue').get_pin_type()
    names={k:BEL.get_basic_type_by_name('bool') for k in ['Enabled','HasTarget','HasBinding','SessionClosed','Invalidated','ConfigGood','AppliedKnown','AppliedBusy']}
    names.update({k:BEL.get_object_reference_type(res) for k in ['Target','PinnedTarget']})
    names.update({k:real for k in ['NowWall','NowMono','LastWall','LastMono','NextPoll','NextAck','Deadline','PrepDeadline','PrepObserved','PrepExpiry','LastRevision','LastObserved','LastExpiry','AckRevision','AckObserved','AckExpiry']})
    names.update({k:BEL.get_basic_type_by_name('string') for k in ['FilePath','PinnedPath','AckPath','PinnedVisit','PinnedAvatar','PinnedProject','PinnedAgent','OriginalNormalized','MirrorNormalized','LastFingerprint','LastState','LastStage','AppliedState','AckPhase']})
    for _,name,kind in FIELDS:names['Raw'+name]=real if kind=='double' else BEL.get_basic_type_by_name(kind)
    for name,typ in names.items():
        # Reloading/rebuilding only this owned candidate is supported.
        if not bp.generated_class() or not hasattr(u.get_default_object(bp.generated_class()),name):
            # add_member_variable returns false when a prior build already added it.
            BEL.add_member_variable(bp,name,typ)
        if name in ('Enabled','Target','FilePath'):BEL.set_blueprint_variable_instance_editable(bp,name,True)
    assert BEL.compile_blueprint(bp)
    g=GraphOps(bp);graph=g.graph
    def allof(items):
        value=items[0]
        for x in items[1:]:value=g.both(value,x)
        return value
    def eq(a,b):return g.fn('KismetStringLibrary','EqualEqual_StrStr',A=a,B=b)
    def literal(value):return g.fn('KismetSystemLibrary','MakeLiteralString',Value=value)
    def after_value(tail,name,value):return g.after(tail,g.assign(name,value))
    def hold(tail):
        for name,value in [('AppliedState','unknown'),('AppliedKnown','false'),('AppliedBusy','true'),('AckPhase','unavailable'),('AckRevision','0'),('AckObserved','0'),('AckExpiry','0')]:tail=after_value(tail,name,value)
        tail=g.after(tail,g.extset(g.get('PinnedTarget'),res,'WorkflowStateKnown','false'))
        return g.after(tail,g.extset(g.get('PinnedTarget'),res,'WorkflowBusy','true'))
    def file_struct(value):
        n=graph.create_node_from_name('Utilities|Struct|MakeFilePath',u.Vector2D(0,0),[]);assert n;g.put(n,'FilePath',value);return n,'FilePath'
    def fresh(obs,expiry,maximum='20'):
        return allof([g.calc('GreaterEqual_DoubleDouble',obs,'0'),g.calc('LessEqual_DoubleDouble',obs,g.get('NowWall')),g.calc('Greater_DoubleDouble',expiry,g.get('NowWall')),g.calc('LessEqual_DoubleDouble',expiry,g.calc('Add_DoubleDouble',obs,maximum))])
    def uuid_ok(value):
        parse=g.fn('KismetGuidLibrary','Parse_StringToGuid',GuidString=value)[0]
        return allof([(parse,'Success'),g.fn('KismetGuidLibrary','IsValid_Guid',InGuid=(parse,'OutGuid')),g.calc('EqualEqual_IntInt',g.fn('KismetStringLibrary','Len',S=value),'36'),eq(value,g.fn('KismetStringLibrary','ToLower',SourceString=value)),*[eq(g.fn('KismetStringLibrary','Mid',SourceString=value,Start=str(i),Count='1'),'-') for i in (8,13,18,23)]])
    begin=BEL.add_event_override(bp,'ReceiveBeginPlay',u.IntPoint(-1000,0))
    t=g.after(begin,g.fn('Actor','SetTickableWhenPaused',bTickableWhenPaused='true')[0]);g.after(t,g.fn('Actor','SetActorTickInterval',TickInterval='0')[0])
    tick=BEL.add_event_override(bp,'ReceiveTick',u.IntPoint(-1000,200))
    t=after_value(tick,'ConfigGood','false')
    t=after_value(t,'NowWall',g.fn('KismetMathLibrary','ToUnixTimestampDouble',Time=g.fn('KismetMathLibrary','UtcNow')))
    accurate=g.fn('GameplayStatics','GetAccurateRealTime')[0]
    t=after_value(t,'NowMono',g.calc('Add_DoubleDouble',g.fn('KismetMathLibrary','Conv_IntToDouble',InInt=(accurate,'Seconds')),(accurate,'PartialSeconds')))
    enabled=g.branch(g.get('Enabled'));g.after(t,enabled)
    had=g.branch(g.get('HasTarget'));g.after(enabled,had)
    valid_target=g.branch(g.valid(g.get('Target')));g.after(had,valid_target,'else')
    first=after_value(valid_target,'PinnedTarget',g.get('Target'));first=after_value(first,'PinnedPath',g.get('FilePath'));first=after_value(first,'AckPath',g.fn('KismetStringLibrary','Concat_StrStr',A=g.get('FilePath'),B='.native-ack.json'));first=after_value(first,'HasTarget','true')
    config=g.assign('ConfigGood',allof([g.valid(g.get('PinnedTarget')),g.calc('EqualEqual_ObjectObject',g.get('Target'),g.get('PinnedTarget')),eq(g.get('FilePath'),g.get('PinnedPath')),g.invert(eq(g.get('PinnedPath'),''))]));g.after(had,config);g.after(first,config)
    can_run=g.branch(g.get('ConfigGood'));g.after(hold(config),can_run)
    # All invalid paths converge on a conservative hold and do not replay cache.
    invalid=g.assign('Invalidated','true')
    g.after(can_run,invalid,'else')
    clock=g.branch(allof([g.calc('GreaterEqual_DoubleDouble',g.get('NowWall'),g.get('LastWall')),g.calc('GreaterEqual_DoubleDouble',g.get('NowMono'),g.get('LastMono'))]));g.after(can_run,clock);g.after(clock,invalid,'else')
    t=after_value(clock,'LastWall',g.get('NowWall'));t=after_value(t,'LastMono',g.get('NowMono'))
    poll=g.branch(g.calc('GreaterEqual_DoubleDouble',g.get('NowMono'),g.get('NextPoll')));g.after(t,poll)
    t=after_value(poll,'NextPoll',g.calc('Add_DoubleDouble',g.get('NowMono'),'.25'))
    exists=g.branch(g.fn('BlueprintPathsLibrary','FileExists',InPath=g.get('PinnedPath')));g.after(t,exists);g.after(exists,invalid,'else')
    read=g.fn('JsonBlueprintFunctionLibrary','FromFile','JsonBlueprintUtilities',File=file_struct(g.get('PinnedPath')))[0];g.after(exists,read)
    parsed=g.branch((read,'ReturnValue'));g.after(read,parsed);g.after(parsed,invalid,'else');t=parsed;success=[]
    for key,name,_ in FIELDS:
        field=g.fn('JsonBlueprintFunctionLibrary','GetField','JsonBlueprintUtilities',JsonObject=(read,'OutJsonObject'),FieldName=key)[0]
        t=g.after(t,field);t=after_value(t,'Raw'+name,(field,'OutValue'));success.append((field,'ReturnValue'))
    original=g.fn('JsonBlueprintFunctionLibrary','ToString','JsonBlueprintUtilities',JsonObject=(read,'OutJsonObject'))[0];t=g.after(t,original);t=after_value(t,'OriginalNormalized',(original,'OutJsonString'))
    # UE GetField coerces some wrong primitive types. Clone and rewrite each
    # typed field, then compare normalized JSON to reject coercions and extras.
    mirror=g.fn('JsonBlueprintFunctionLibrary','FromString','JsonBlueprintUtilities',JsonString=g.get('OriginalNormalized'))[0];t=g.after(t,mirror)
    for key,name,_ in FIELDS:
        node=g.fn('JsonBlueprintFunctionLibrary','SetField','JsonBlueprintUtilities',JsonObject=(mirror,'OutJsonObject'),FieldName=key,Value=g.get('Raw'+name))[0];t=g.after(t,node)
    normalized=g.fn('JsonBlueprintFunctionLibrary','ToString','JsonBlueprintUtilities',JsonObject=(mirror,'OutJsonObject'))[0];t=g.after(t,normalized);t=after_value(t,'MirrorNormalized',(normalized,'OutJsonString'))
    keys=g.fn('JsonBlueprintFunctionLibrary','GetFieldNames','JsonBlueprintUtilities',JsonObject=(read,'OutJsonObject'))[0];t=g.after(t,keys)
    count=g.fn('KismetArrayLibrary','Array_Length',TargetArray=(keys,'FieldNames'))
    header=g.branch(allof(success+[(original,'ReturnValue'),(mirror,'ReturnValue'),(normalized,'ReturnValue'),(keys,'ReturnValue'),g.calc('EqualEqual_IntInt',count,str(len(FIELDS))),eq(g.get('OriginalNormalized'),g.get('MirrorNormalized')),eq(g.get('RawSchema'),'omnira.office.workflow-presence.v1'),eq(g.get('RawScope'),'workflow_state_v1'),eq(g.get('RawAvatar'),AVATAR),eq(g.get('RawExecution'),'not_verified'),g.invert(g.get('RawWorkVerified')),*[uuid_ok(g.get('Raw'+n)) for n in ('Visit','Project','Agent')]]));g.after(t,header);g.after(header,invalid,'else')
    bound=g.branch(g.get('HasBinding'));g.after(header,bound)
    prep_flags=allof([eq(g.get('RawVisitState'),'preparing'),eq(g.get('RawIdentity'),'unknown'),eq(g.get('RawDataState'),'unavailable'),eq(g.get('RawState'),'unknown'),eq(g.get('RawCoverage'),'incomplete'),g.invert(g.get('RawKnown')),g.get('RawBusy'),g.calc('EqualEqual_DoubleDouble',g.get('RawRevision'),'0'),fresh(g.get('RawObserved'),g.get('RawExpiry'),'15')])
    initial=g.branch(prep_flags);g.after(bound,initial,'else');g.after(initial,invalid,'else');t=initial
    for n in ('Visit','Avatar','Project','Agent'):t=after_value(t,'Pinned'+n,g.get('Raw'+n))
    for n,value in [('HasBinding','true'),('Invalidated','false'),('LastStage','preparing'),('PrepObserved',g.get('RawObserved')),('PrepExpiry',g.get('RawExpiry')),('PrepDeadline',g.calc('Add_DoubleDouble',g.get('NowMono'),g.calc('Subtract_DoubleDouble',g.get('RawExpiry'),g.get('NowWall'))))]:t=after_value(t,n,value)
    initial_done=t
    matching=g.branch(allof([eq(g.get('Raw'+n),g.get('Pinned'+n)) for n in ('Visit','Avatar','Project','Agent')]));g.after(bound,matching);g.after(matching,invalid,'else')
    closed=g.branch(g.get('SessionClosed'));g.after(matching,closed)
    preparing=g.branch(eq(g.get('RawVisitState'),'preparing'));g.after(closed,preparing,'else')
    repeat=g.branch(allof([prep_flags,eq(g.get('LastStage'),'preparing'),g.invert(g.get('Invalidated')),g.calc('EqualEqual_DoubleDouble',g.get('RawObserved'),g.get('PrepObserved')),g.calc('EqualEqual_DoubleDouble',g.get('RawExpiry'),g.get('PrepExpiry'))]));g.after(preparing,repeat);g.after(repeat,invalid,'else')
    closing=g.branch(eq(g.get('RawVisitState'),'closed'));g.after(preparing,closing,'else')
    close_flags=g.branch(allof([eq(g.get('RawIdentity'),'unknown'),eq(g.get('RawDataState'),'unavailable'),eq(g.get('RawState'),'unknown'),eq(g.get('RawCoverage'),'incomplete'),g.invert(g.get('RawKnown')),g.get('RawBusy'),*[g.calc('EqualEqual_DoubleDouble',g.get('Raw'+n),'0') for n in ('Revision','Observed','Expiry')]]));g.after(closing,close_flags);g.after(close_flags,invalid,'else');close_done=after_value(close_flags,'SessionClosed','true');close_done=after_value(close_done,'LastStage','closed');close_done=after_value(close_done,'Invalidated','true')
    idle=allof([eq(g.get('RawState'),'idle'),eq(g.get('RawCoverage'),'complete'),g.get('RawKnown'),g.invert(g.get('RawBusy'))])
    busy=allof([eq(g.get('RawState'),'busy'),eq(g.get('RawCoverage'),'complete'),g.get('RawKnown'),g.get('RawBusy')])
    unknown=allof([eq(g.get('RawState'),'unknown'),eq(g.get('RawCoverage'),'incomplete'),g.invert(g.get('RawKnown')),g.get('RawBusy')])
    active=g.branch(allof([eq(g.get('RawVisitState'),'active'),eq(g.get('RawIdentity'),'verified'),eq(g.get('RawDataState'),'fresh'),g.either(idle,g.either(busy,unknown)),fresh(g.get('RawObserved'),g.get('RawExpiry')),g.calc('Greater_DoubleDouble',g.get('RawRevision'),'0'),g.calc('LessEqual_DoubleDouble',g.get('RawRevision'),'9007199254740991'),g.calc('EqualEqual_DoubleDouble',g.get('RawRevision'),g.fn('KismetMathLibrary','Conv_Int64ToDouble',InInt=g.fn('KismetMathLibrary','FTrunc64',A=g.get('RawRevision')))),g.calc('GreaterEqual_DoubleDouble',g.get('RawObserved'),g.get('LastObserved'))]));g.after(closing,active,'else');g.after(active,invalid,'else')
    newer=g.branch(g.calc('Greater_DoubleDouble',g.get('RawRevision'),g.get('LastRevision')));g.after(active,newer);t=newer
    for name,value in [('LastRevision',g.get('RawRevision')),('LastObserved',g.get('RawObserved')),('LastExpiry',g.get('RawExpiry')),('LastState',g.get('RawState')),('LastStage','active'),('LastFingerprint',g.get('OriginalNormalized')),('Deadline',g.calc('Add_DoubleDouble',g.get('NowMono'),g.calc('Subtract_DoubleDouble',g.get('RawExpiry'),g.get('NowWall')))),('Invalidated','false')]:t=after_value(t,name,value)
    active_done=t
    duplicate=g.branch(allof([g.invert(g.get('Invalidated')),g.calc('EqualEqual_DoubleDouble',g.get('RawRevision'),g.get('LastRevision')),eq(g.get('OriginalNormalized'),g.get('LastFingerprint'))]));g.after(newer,duplicate,'else');g.after(duplicate,invalid,'else')
    # Cached gates and native receipt are updated every real tick, also paused.
    finish=g.branch(g.get('SessionClosed'))
    for node in (initial_done,repeat,closed,close_done,active_done,duplicate,invalid):g.after(node,finish)
    g.after(poll,finish,'else')
    disabled=g.branch(g.both(g.get('HasTarget'),g.valid(g.get('PinnedTarget'))));g.after(enabled,disabled,'else');g.after(hold(disabled),finish)
    ack_closed=after_value(finish,'AckPhase','closed')
    cached_prep=g.branch(allof([g.get('ConfigGood'),g.get('HasBinding'),g.invert(g.get('Invalidated')),eq(g.get('LastStage'),'preparing'),g.calc('Less_DoubleDouble',g.get('NowWall'),g.get('PrepExpiry')),g.calc('Less_DoubleDouble',g.get('NowMono'),g.get('PrepDeadline'))]));g.after(finish,cached_prep,'else')
    t=after_value(cached_prep,'AckPhase','prepared');t=after_value(t,'AckObserved',g.get('PrepObserved'));prep_ack=after_value(t,'AckExpiry',g.get('PrepExpiry'))
    cached_active=g.branch(allof([g.get('ConfigGood'),g.get('HasBinding'),g.invert(g.get('Invalidated')),eq(g.get('LastStage'),'active'),g.calc('Less_DoubleDouble',g.get('NowWall'),g.get('LastExpiry')),g.calc('Less_DoubleDouble',g.get('NowMono'),g.get('Deadline'))]));g.after(cached_prep,cached_active,'else')
    t=after_value(cached_active,'AppliedState',g.get('LastState'));t=after_value(t,'AppliedKnown',g.invert(eq(g.get('LastState'),'unknown')));t=after_value(t,'AppliedBusy',g.invert(eq(g.get('LastState'),'idle')))
    t=g.after(t,g.extset(g.get('PinnedTarget'),res,'WorkflowStateKnown',g.get('AppliedKnown')));t=g.after(t,g.extset(g.get('PinnedTarget'),res,'WorkflowBusy',g.get('AppliedBusy')))
    for name,value in [('AckPhase','applied'),('AckRevision',g.get('LastRevision')),('AckObserved',g.get('LastObserved')),('AckExpiry',g.get('LastExpiry'))]:t=after_value(t,name,value)
    applied_ack=t
    send=g.branch(g.both(g.get('HasBinding'),g.calc('GreaterEqual_DoubleDouble',g.get('NowMono'),g.get('NextAck'))))
    for node in (ack_closed,prep_ack,applied_ack):g.after(node,send)
    g.after(cached_active,send,'else')
    t=after_value(send,'NextAck',g.calc('Add_DoubleDouble',g.get('NowMono'),'.25'))
    ack=g.fn('JsonBlueprintFunctionLibrary','FromString','JsonBlueprintUtilities',JsonString='{}')[0];t=g.after(t,ack)
    ack_fields=[('schema',literal('omnira.office.workflow-native-ack.v1')),('scope',literal('workflow_state_v1')),('phase',g.get('AckPhase'))]+[(key,g.get('Pinned'+n)) for key,n in [('visit_id','Visit'),('avatar_id','Avatar'),('project_id','Project'),('agent_id','Agent')]]+[(key,g.get(n)) for key,n in [('revision','AckRevision'),('observed_at_unix','AckObserved'),('expires_at_unix','AckExpiry'),('workflow_state','AppliedState'),('workflow_state_known','AppliedKnown'),('workflow_busy','AppliedBusy')]]+[('execution',literal('not_verified'))]
    for key,value in ack_fields:t=g.after(t,g.fn('JsonBlueprintFunctionLibrary','SetField','JsonBlueprintUtilities',JsonObject=(ack,'OutJsonObject'),FieldName=key,Value=value)[0])
    g.after(t,g.fn('JsonBlueprintFunctionLibrary','ToFile','JsonBlueprintUtilities',JsonObject=(ack,'OutJsonObject'),File=file_struct(g.get('AckPath')))[0])
    assert BEL.compile_blueprint(bp)
    assert not graph.list_nodes_with_errors(),str(graph.list_nodes_with_errors())
    cdo=u.get_default_object(bp.generated_class());cdo.set_editor_property('Enabled',False);cdo.set_editor_property('Invalidated',True);cdo.set_editor_property('AppliedState','disabled');cdo.set_editor_property('AppliedBusy',True);cdo.set_editor_property('FilePath',str(root/'Saved/OfficePresence'/ (AVATAR+'.json')))
    assert EAL.save_loaded_asset(bp,False)
    actors=list(sub.get_all_level_actors());target=next(a for a in actors if a.get_actor_label()=='Resident | Familje-Pling')
    consumer=next((a for a in actors if a.get_class()==bp.generated_class()),None) or sub.spawn_actor_from_class(bp.generated_class(),u.Vector(0,0,-1500))
    consumer.set_actor_label('Workflow presence | Familje | OFF');consumer.set_folder_path('Omnira/Workflow Presence OFF');consumer.set_editor_property('Target',target);consumer.set_editor_property('Enabled',False)
    assert lvl.save_current_level()
    assert all(sha(p)==h for p,h in protected.items())
    after={a.get_name():sig(a) for a in sub.get_all_level_actors()}
    assert all(after.get(n)==v for n,v in before.items()),'Original scene changed'
    result.update(passed=True,graph_nodes=len(graph.list_all_nodes()),consumer=consumer.get_name(),target=target.get_name(),actor_count=len(after),map_sha256=sha(root/'Content'/Path(MAP.removeprefix('/Game/')).with_suffix('.umap')),asset_sha256=sha(root/'Content'/Path(ASSET.removeprefix('/Game/')).with_suffix('.uasset')))
    manifest.write_text(json.dumps(result,indent=2));return result
