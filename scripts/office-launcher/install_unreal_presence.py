"""Native private identity receiver. Run ONLY in a separate UE Python commandlet.

All behavioral tests run before saving the consumer, map or project configuration.
The only expected live identity is an explicitly paired read-only relay projection.
This consumer never starts tasks, calls models, opens URLs or changes the Pling rig.
"""
from pathlib import Path
from datetime import datetime,timezone
import hashlib,json,shutil,time,traceback,os,subprocess,sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from office_install_guard import (GuardError,ProjectionFixture,OwnedInstallTransaction,atomic_bytes,validate_context,verify_artifacts)
import unreal as u

REPO=Path(__file__).resolve().parents[2]
PROJECT=Path(r'C:\Users\Andre\Projects\Omnira\Design\Agent-Campus-3D\UnrealPilot\Omnira_Office_CastQA_v83')
MAP='/Game/OmniraRealismLab/Maps/Omnira_HQ_Office_Visit'
MAP_FILE=PROJECT/'Content/OmniraRealismLab/Maps/Omnira_HQ_Office_Visit.umap'
PROJECT_FILE=PROJECT/'Omnira_Office_CastQA_v83.uproject'
ASSET='/Game/OmniraGameplayV83/PrivatePresence/BP_OfficePrivatePresence'
AVATAR='office-familje-pling'
ACTOR_NAME='SkeletalMeshActor_3'
OUT=PROJECT/'Saved/OfficePresenceSetup'
FILE=PROJECT/'Saved/OfficePresence'/f'{AVATAR}.json'
ASSET_FILE=PROJECT/'Content'/(ASSET[len('/Game/'):]+'.uasset')
ASSET_FILES=[ASSET_FILE,ASSET_FILE.with_suffix('.uexp'),ASSET_FILE.with_suffix('.ubulk')]
JOURNAL=OUT/'transaction.json'
INSTALL_MANIFEST=OUT/'installation.json'
UNKNOWN='Pling\nIngen verifierad anslutning\nArbetsstatus okänd'
BEL=u.BlueprintEditorLibrary
TEST_RESULTS=[]
TEST_FIXTURE=None


def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def snapshot_actors():
 result={}
 for a in u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors():
  result[a.get_name()]={'label':a.get_actor_label(),'class':a.get_class().get_path_name(),
   'location':[float(getattr(a.get_actor_location(),k)) for k in ('x','y','z')],
   'rotation':[float(getattr(a.get_actor_rotation(),k)) for k in ('pitch','yaw','roll')],
   'scale':[float(getattr(a.get_actor_scale3d(),k)) for k in ('x','y','z')],'tags':[str(t) for t in a.tags]}
 return result


def create_consumer():
 assert not u.EditorAssetLibrary.does_asset_exist(ASSET),'Existing consumer requires explicit owned-update review'
 f=u.BlueprintFactory();f.set_editor_property('parent_class',u.TextRenderActor)
 bp=u.AssetToolsHelpers.get_asset_tools().create_asset(ASSET.rsplit('/',1)[1],ASSET.rsplit('/',1)[0],u.Blueprint,f)
 assert bp
 initial_ed=u.BlueprintGraphEditor.get_graph_editor(BEL.find_event_graph(bp))
 unix_node=initial_ed.add_call_function_node('/Script/Engine.KismetMathLibrary:ToUnixTimestampDouble')
 assert unix_node
 # Infer the real double pin type from the engine; a basic-name alias can fall back to integer.
 double_type=unix_node.find_output_pin('ReturnValue').get_pin_type()
 fields={'RawSchema':'string','RawAvatar':'string','RawIdentity':'string','RawState':'string',
  'RawExecution':'string','RawWork':'bool','RawExpires':'double','RawProject':'string','RawAgent':'string',
  'NowWall':'double','NowMono':'double','LastSeenExpiry':'double','ReceiptDeadline':'double',
  'Invalidated':'bool','IdentityVerified':'bool','DisplayText':'string','NextPollAt':'double'}
 for name,kind in fields.items():assert BEL.add_member_variable(bp,name,double_type if kind=='double' else BEL.get_basic_type_by_name(kind)),(name,kind)
 assert BEL.compile_blueprint(bp)
 build_graph(bp,unix_node)
 assert BEL.compile_blueprint(bp)
 ed=u.BlueprintGraphEditor.get_graph_editor(BEL.find_event_graph(bp))
 assert not ed.list_nodes_with_errors(),str(ed.list_nodes_with_errors())
 cls=u.load_object(None,bp.get_path_name()+'_C')
 assert cls,'Compiled consumer class missing'
 cdo=u.get_default_object(cls)
 cdo.set_editor_property('Invalidated',True)
 cdo.set_editor_property('DisplayText',UNKNOWN)
 cdo.set_editor_property('IdentityVerified',False)
 text=cdo.get_component_by_class(u.TextRenderComponent)
 assert text,'Native TextRender component missing'
 text.set_text(u.Text(UNKNOWN));text.set_world_size(11)
 text.set_text_render_color(u.Color(92,226,235,255))
 text.set_editor_property('horizontal_alignment',u.HorizTextAligment.EHTA_CENTER)
 text.set_editor_property('cast_shadow',False)
 text.set_collision_enabled(u.CollisionEnabled.NO_COLLISION)
 return bp,cls


def build_graph(bp,unix_node):
 ed=u.BlueprintGraphEditor.get_graph_editor(BEL.find_event_graph(bp))
 count=0
 def node(owner,name):
  nonlocal count
  n=ed.add_call_function_node('/Script/Engine.'+owner+':'+name);assert n,(owner,name)
  n.set_node_pos(u.IntPoint((count%7)*300,(count//7)*220));count+=1
  return n
 def wire(a,p,b,q):
  x=a.find_output_pin(p);y=b.find_input_pin(q)
  assert x.is_valid() and y.is_valid() and x.try_create_connection(y),(str(a.get_node_title()),p,str(b.get_node_title()),q)
 def put(n,p,value):
  if isinstance(value,tuple):wire(value[0],value[1],n,p)
  else:assert n.find_input_pin(p).set_pin_value(str(value)),(str(n.get_node_title()),p,value)
 def fn(owner,name,**args):
  n=node(owner,name)
  for p,v in args.items():put(n,p,v)
  return n,'ReturnValue'
 def get(name):
  n=ed.add_get_member_variable_node(name);assert n,name
  return n,name
 def assign(name,value):
  n=ed.add_set_member_variable_node(name);assert n,name
  put(n,name,value);return n
 def after(a,b,p='then'):wire(a,p,b,'execute');return b
 def branch(condition):
  n=ed.create_node_from_name('Utilities|FlowControl|Branch',u.Vector2D(0,0),[]);assert n
  put(n,'Condition',condition);return n
 def both(values):
  out=values[0]
  for v in values[1:]:out=fn('KismetMathLibrary','BooleanAND',A=out,B=v)
  return out
 def eq(value,text):return fn('KismetStringLibrary','EqualEqual_StrStr',A=value,B=text)
 def neg(value):return fn('KismetMathLibrary','Not_PreBool',A=value)
 def calc(name,a,b):return fn('KismetMathLibrary',name,A=a,B=b)
 def concat(a,b):return fn('KismetStringLibrary','Concat_StrStr',A=a,B=b)
 def show(value,valid):
  first=assign('IdentityVerified','true' if valid else 'false')
  text=assign('DisplayText',value);after(first,text)
  set_text=node('TextRenderComponent','K2_SetText')
  put(set_text,'self',get('TextRender'))
  put(set_text,'Value',fn('KismetTextLibrary','Conv_StringToText',InString=get('DisplayText')))
  after(text,set_text)
  return first,set_text
 def field(field_name,var_name,tail):
  n=ed.add_call_function_node('/Script/JsonBlueprintUtilities.JsonBlueprintFunctionLibrary:GetField');assert n
  put(n,'FieldName',field_name);wire(read,'OutJsonObject',n,'JsonObject')
  setter=assign(var_name,(n,'OutValue'))
  after(tail,n);after(n,setter)
  return setter,(n,'ReturnValue')
 events=ed.list_all_nodes()
 begin=next(n for n in events if 'BeginPlay' in str(n.get_node_title()).replace(' ',''))
 tick=next(n for n in events if 'Tick' in str(n.get_node_title()))
 pause=node('Actor','SetTickableWhenPaused');put(pause,'bTickableWhenPaused','true');after(begin,pause)
 interval=node('Actor','SetActorTickInterval');put(interval,'TickInterval','0.0');after(pause,interval)
 put(unix_node,'Time',fn('KismetMathLibrary','UtcNow'))
 wall=assign('NowWall',(unix_node,'ReturnValue'))
 mono=node('GameplayStatics','GetAccurateRealTime')
 mono_value=calc('Add_DoubleDouble',fn('KismetMathLibrary','Conv_IntToDouble',InInt=(mono,'Seconds')),(mono,'PartialSeconds'))
 capture_mono=assign('NowMono',mono_value)
 start_first,start_tail=show(UNKNOWN,False)
 after(interval,capture_mono);after(tick,capture_mono);after(capture_mono,wall)
 make=ed.create_node_from_name('Utilities|Struct|MakeFilePath',u.Vector2D(0,200),[]);assert make
 put(make,'FilePath',FILE.as_posix())
 read=ed.add_call_function_node('/Script/JsonBlueprintUtilities.JsonBlueprintFunctionLibrary:FromFile');assert read
 wire(make,'FilePath',read,'File')
 exists=branch(fn('BlueprintPathsLibrary','FileExists',InPath=FILE.as_posix()))
 after(start_tail,exists);after(exists,read)
 load_ok=branch((read,'ReturnValue'));after(read,load_ok)
 unknown_first,unknown_tail=show(UNKNOWN,False)
 invalidate=assign('Invalidated','true');after(invalidate,unknown_first)
 # Deadline checks run on every real frame, including pause; only disk reads are throttled.
 current_fresh=both([calc('Less_DoubleDouble',get('NowMono'),get('ReceiptDeadline')),
  calc('Less_DoubleDouble',get('NowWall'),get('LastSeenExpiry'))])
 expired=branch(both([get('IdentityVerified'),neg(current_fresh)]));after(wall,expired)
 after(expired,invalidate)
 poll=branch(calc('GreaterEqual_DoubleDouble',get('NowMono'),get('NextPollAt')))
 after(expired,poll,'else')
 next_poll=assign('NextPollAt',calc('Add_DoubleDouble',get('NowMono'),'0.5'))
 after(poll,next_poll);after(next_poll,start_first)
 after(load_ok,invalidate,'else');after(exists,invalidate,'else')
 def require_fields(keys,tail):
  results=[]
  for key in keys:
   n=ed.add_call_function_node('/Script/JsonBlueprintUtilities.JsonBlueprintFunctionLibrary:HasField');assert n
   put(n,'FieldName',key);wire(read,'OutJsonObject',n,'JsonObject')
   after(tail,n);tail=n;results.append((n,'ReturnValue'))
  gate=branch(both(results));after(tail,gate);after(gate,invalidate,'else')
  return gate
 present=require_fields(['schema','avatar_id','identity','data_state','execution','work_verified'],load_ok)
 tail=present
 successes=[]
 # Parse the non-null core first. Offline files deliberately have null expiry.
 for idx,(key,var) in enumerate([('schema','RawSchema'),('avatar_id','RawAvatar'),('identity','RawIdentity'),
  ('data_state','RawState'),('execution','RawExecution'),('work_verified','RawWork')]):
  n=ed.add_call_function_node('/Script/JsonBlueprintUtilities.JsonBlueprintFunctionLibrary:GetField');assert n
  put(n,'FieldName',key);wire(read,'OutJsonObject',n,'JsonObject')
  setter=assign(var,(n,'OutValue'))
  after(tail,n,'then');after(n,setter);tail=setter;successes.append((n,'ReturnValue'))
 core=both(successes+[eq(get('RawSchema'),'omnira.office.private-presence.v1'),eq(get('RawAvatar'),AVATAR),
  eq(get('RawIdentity'),'verified'),eq(get('RawState'),'fresh'),eq(get('RawExecution'),'not_verified'),neg(get('RawWork'))])
 gate=branch(core);after(tail,gate);after(gate,invalidate,'else')
 details=require_fields(['expires_at_unix','project_text','agent_text'],gate)
 tail=details;valid_fields=[]
 for key,var in [('expires_at_unix','RawExpires'),('project_text','RawProject'),('agent_text','RawAgent')]:
  tail,success=field(key,var,tail);valid_fields.append(success)
 bounds=both(valid_fields+[
  calc('Greater_DoubleDouble',get('RawExpires'),get('NowWall')),
  calc('LessEqual_DoubleDouble',get('RawExpires'),calc('Add_DoubleDouble',get('NowWall'),'22')),
 ])
 bounds_gate=branch(bounds);after(tail,bounds_gate);after(bounds_gate,invalidate,'else')
 newer=branch(calc('Greater_DoubleDouble',get('RawExpires'),get('LastSeenExpiry')));after(bounds_gate,newer)
 last=assign('LastSeenExpiry',get('RawExpires'));after(newer,last)
 deadline=assign('ReceiptDeadline',calc('Add_DoubleDouble',get('NowMono'),calc('Subtract_DoubleDouble',get('RawExpires'),get('NowWall'))))
 after(last,deadline)
 reset=assign('Invalidated','false');after(deadline,reset)
 valid=both([neg(get('Invalidated')),calc('EqualEqual_DoubleDouble',get('RawExpires'),get('LastSeenExpiry')),
  calc('Less_DoubleDouble',get('NowMono'),get('ReceiptDeadline'))])
 final=branch(valid);after(reset,final);after(newer,final,'else');after(final,invalidate,'else')
 agent=fn('KismetStringLibrary','Left',SourceString=get('RawAgent'),Count='24')
 project=fn('KismetStringLibrary','Left',SourceString=get('RawProject'),Count='24')
 display=concat(concat(concat(agent,'\n'),project),'\nIdentitet verifierad · arbetsstatus okänd')
 known_first,known_tail=show(display,True);after(final,known_first)
 # Billboard only when a real player camera exists; commandlet/editor has none.
 camera=fn('GameplayStatics','GetPlayerCameraManager',PlayerIndex='0')
 face=branch(fn('KismetSystemLibrary','IsValid',Object=camera))
 after(known_tail,face);after(unknown_tail,face)
 camera_pos=fn('PlayerCameraManager','GetCameraLocation',self=camera)
 position=fn('Actor','K2_GetActorLocation')
 look=fn('KismetMathLibrary','FindLookAtRotation',Start=position,Target=camera_pos)
 rotate=node('Actor','K2_SetActorRotation');put(rotate,'NewRotation',look);after(face,rotate)
 assert BEL.compile_blueprint(bp),str(ed.list_nodes_with_errors())
 assert not ed.list_nodes_with_errors(),str(ed.list_nodes_with_errors())


def transient_test_class(parent):
 # Unsaved child-only injector: never add test controls or editable deadlines to production.
 factory=u.BlueprintFactory();factory.set_editor_property('parent_class',parent)
 bp=u.AssetToolsHelpers.get_asset_tools().create_asset('BP_PrivatePresenceTestHarness','/Game/OmniraGameplayV83/PresenceProbe',u.Blueprint,factory)
 assert bp
 ed=u.BlueprintGraphEditor.get_graph_editor(BEL.find_event_graph(bp))
 overlap=next(n for n in ed.list_all_nodes() if 'beginoverlap' in str(n.get_node_title()).replace(' ','').lower())
 def wire(a,p,b,q):assert a.find_output_pin(p).try_create_connection(b.find_input_pin(q))
 valid=ed.add_call_function_node('/Script/Engine.KismetSystemLibrary:IsValid')
 wire(overlap,'OtherActor',valid,'Object')
 branch=ed.create_node_from_name('Utilities|FlowControl|Branch',u.Vector2D(0,0),[])
 wire(overlap,'then',branch,'execute');wire(valid,'ReturnValue',branch,'Condition')
 for port,offset in [('then','20'),('else','-1')]:
  now=ed.add_get_member_variable_node('NowMono')
  plus=ed.add_call_function_node('/Script/Engine.KismetMathLibrary:Add_DoubleDouble')
  plus.find_input_pin('B').set_pin_value(offset);wire(now,'NowMono',plus,'A')
  setter=ed.add_set_member_variable_node('ReceiptDeadline')
  wire(plus,'ReturnValue',setter,'ReceiptDeadline');wire(branch,port,setter,'execute')
 assert BEL.compile_blueprint(bp),str(ed.list_nodes_with_errors())
 return u.load_object(None,bp.get_path_name()+'_C')


def behavioral_tests(cls):
 cls=transient_test_class(cls)
 actors=u.get_editor_subsystem(u.EditorActorSubsystem)
 actor=actors.spawn_actor_from_class(cls,u.Vector(0,0,-10000));assert actor
 tests=TEST_RESULTS
 assert isinstance(actor.get_editor_property('RawExpires'),float),'Native epoch must retain fractional double precision'
 def tick():
  time.sleep(.51)  # Advance real poll time; do not add test controls to the production actor.
  actor.call_method('ReceiveTick',(0.5,))
 def write(**changes):
  expiry=max(time.time()+3,float(actor.get_editor_property('LastSeenExpiry'))+.02)
  data={'schema':'omnira.office.private-presence.v1','avatar_id':AVATAR,'data_state':'fresh',
   'identity':'verified','execution':'not_verified','work_verified':False,'animation':'ambient',
   'project_text':'Syntetiskt projekt','agent_text':'Syntetisk Pling','status_text':'UNTRUSTED_WORK_CLAIM',
   'step_reference':None,'step_expires_at_unix':None,'expires_at_unix':expiry}
  data.update(changes);TEST_FIXTURE.write(json.dumps(data,ensure_ascii=False).encode('utf-8'));return data
 def known(name):
  facts={key:str(actor.get_editor_property(key)) for key in ['RawSchema','RawAvatar','RawExpires','NowWall','NowMono','LastSeenExpiry','ReceiptDeadline','Invalidated']}
  assert actor.get_editor_property('IdentityVerified') is True,(name,json.dumps(facts))
  text=str(actor.get_editor_property('DisplayText'))
  assert 'Syntetisk Pling' in text and 'UNTRUSTED_WORK_CLAIM' not in text,name
  assert str(actor.get_component_by_class(u.TextRenderComponent).text)==text,name
  tests.append(name)
 def unknown(name):
  assert actor.get_editor_property('IdentityVerified') is False,name
  assert str(actor.get_editor_property('DisplayText'))==UNKNOWN,name
  assert str(actor.get_component_by_class(u.TextRenderComponent).text)==UNKNOWN,name
  tests.append(name)
 write();actor.call_method('ReceiveBeginPlay');known('fresh_expected_identity_and_safe_native_text')
 for changes,name in [({'avatar_id':'another-pling'},'wrong_avatar_clears'),
  ({'schema':'other-schema'},'wrong_schema_clears'),({'work_verified':True},'work_claim_rejected'),
  ({'execution':'working'},'execution_claim_rejected'),({'expires_at_unix':time.time()+120},'future_deadline_rejected')]:
  write();tick();known('fresh_before_'+name)
  write(**changes);tick();unknown(name)
 write();tick();known('fresh_before_missing_file')
 TEST_FIXTURE.remove();tick();unknown('missing_file_clears_without_writer')
 write(expires_at_unix=time.time()+20);tick();known('fresh_before_monotonic_expiry')
 actor.call_method('ReceiveActorBeginOverlap',(None,))
 tick();unknown('independent_monotonic_deadline_expires')
 actor.call_method('ReceiveActorBeginOverlap',(actor,))
 tick();unknown('expired_same_file_cannot_revive')
 write();tick();known('genuinely_newer_source_can_reconnect')
 actors.destroy_actor(actor)
 actor=actors.spawn_actor_from_class(cls,u.Vector(0,0,-10000));assert actor
 write(expires_at_unix=time.time()+.2);actor.call_method('ReceiveBeginPlay');known('short_lived_frame_initially_fresh')
 time.sleep(.3);tick();unknown('source_deadline_expires_when_writer_stopped')
 actors.destroy_actor(actor)
 return tests,None


def verify_presence_actor(baseline=None):
 actors=u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()
 owned=[a for a in actors if 'OfficePresenceOwned' in [str(t) for t in a.tags]]
 assert len(owned)==1,('Expected exactly one installed presence actor',len(owned))
 actor=owned[0]
 assert actor.get_class().get_path_name()==ASSET+'.'+ASSET.rsplit('/',1)[1]+'_C'
 parent=actor.get_attach_parent_actor()
 assert parent and parent.get_name()==ACTOR_NAME and parent.get_actor_label()=='Pling | Familje'
 offset=actor.get_actor_location()-parent.get_actor_location()
 assert abs(offset.x)<1 and abs(offset.y)<1 and 180<offset.z<260
 assert 'OfficeAvatar:'+AVATAR in [str(t) for t in actor.tags]
 assert actor.get_actor_enable_collision() is False
 assert str(actor.get_component_by_class(u.TextRenderComponent).text)==UNKNOWN
 after=snapshot_actors()
 if baseline is not None:
  assert len(after)==len(baseline)+1
  changes={key:{'before':value,'after':after.get(key)} for key,value in baseline.items() if after.get(key)!=value}
  assert not changes,('Existing actors changed',json.dumps(dict(list(changes.items())[:4])))
 return {'preserved_actors':len(baseline) if baseline is not None else None,'added_actors':1,'native_actor_name':actor.get_name()}


def assert_context(loaded=False):
 world=u.get_editor_subsystem(u.UnrealEditorSubsystem).get_editor_world() if loaded else None
 level=u.get_editor_subsystem(u.LevelEditorSubsystem).get_current_level() if loaded else None
 if loaded:assert world and level,'Expected loaded editor world and active level'
 validate_context(
  active_project=u.Paths.convert_relative_path_to_full(u.Paths.get_project_file_path()),
  active_content=u.Paths.convert_relative_path_to_full(u.Paths.project_content_dir()),
  expected_project=PROJECT_FILE,expected_map_file=MAP_FILE,map_package=MAP,
  world_path=world.get_path_name() if world else None,level_path=level.get_path_name() if level else None)


def assert_exclusive_editor():
 command="Get-CimInstance Win32_Process | Where-Object { $_.Name -in @('UnrealEditor.exe','UnrealEditor-Cmd.exe') } | Select-Object -ExpandProperty ProcessId | ConvertTo-Json -Compress"
 result=subprocess.run(['powershell.exe','-NoProfile','-Command',command],capture_output=True,text=True,timeout=20,check=True)
 pids=json.loads(result.stdout) if result.stdout.strip() else []
 if not isinstance(pids,list):pids=[pids]
 assert not [pid for pid in pids if pid!=os.getpid()],'Another Unreal process appeared; no save performed'


def install_consumer(bp,cls,baseline,before_hash,project_hash,proof):
 assert sha(MAP_FILE)==before_hash,'Map changed externally during native tests'
 assert sha(PROJECT_FILE)==project_hash,'Project configuration changed externally during native tests'
 assert_context(loaded=True)
 assert_exclusive_editor()
 actors=u.get_editor_subsystem(u.EditorActorSubsystem)
 targets=[a for a in actors.get_all_level_actors() if a.get_name()==ACTOR_NAME]
 assert len(targets)==1 and targets[0].get_actor_label()=='Pling | Familje','Explicit Familje Pling no longer matches'
 target=targets[0]
 assert not [a for a in actors.get_all_level_actors() if 'OfficePresenceOwned' in [str(t) for t in a.tags]]
 actor=actors.spawn_actor_from_class(cls,target.get_actor_location()+u.Vector(0,0,235))
 assert actor
 actor.set_actor_label('Office Presence | Familje-Pling')
 actor.tags=['OfficePresenceOwned','OfficeAvatar:'+AVATAR]
 actor.set_folder_path('Campus/PrivatePresence')
 actor.set_actor_enable_collision(False)
 actor.get_component_by_class(u.TextRenderComponent).set_text(u.Text(UNKNOWN))
 actor.attach_to_actor(target,'None',u.AttachmentRule.KEEP_WORLD,u.AttachmentRule.KEEP_WORLD,u.AttachmentRule.KEEP_WORLD,False)
 proof.update(verify_presence_actor(baseline))
 # Runtime Json module is bundled with this engine. No Python/network code is used by the actor.
 config=json.loads(PROJECT_FILE.read_text(encoding='utf-8-sig'))
 entries=[entry for entry in config.get('Plugins',[]) if entry.get('Name')=='JsonBlueprintUtilities']
 assert len(entries)<=1,'Ambiguous plugin configuration'
 if entries:entries[0]['Enabled']=True
 else:config.setdefault('Plugins',[]).append({'Name':'JsonBlueprintUtilities','Enabled':True})
 tx=OwnedInstallTransaction(JOURNAL,originals={MAP_FILE:Path(proof['backup']),PROJECT_FILE:Path(proof['project_backup'])},
  new_files=[*ASSET_FILES,INSTALL_MANIFEST],rollback_order=[MAP_FILE,*ASSET_FILES,INSTALL_MANIFEST,PROJECT_FILE])
 tx.begin()
 try:
  tx.step('enable_runtime_plugin',[PROJECT_FILE],lambda:atomic_bytes(PROJECT_FILE,(json.dumps(config,indent=2)+'\n').encode('utf-8')))
  proof['project_plugin_enabled']=True
  def save_asset():assert u.EditorAssetLibrary.save_loaded_asset(bp),'Consumer asset save failed'
  tx.step('save_blueprint',ASSET_FILES,save_asset);proof['saved_assets']=True
  assert_context(loaded=True);assert_exclusive_editor()
  def save_map():assert u.get_editor_subsystem(u.LevelEditorSubsystem).save_current_level(),'Map save failed'
  tx.step('save_map',[MAP_FILE],save_map)
  proof.update(verify_presence_actor(baseline))
  proof.update(installed=False,status='saved_pending_fresh_process_verification',
   map_after_sha256=sha(MAP_FILE),project_after_sha256=sha(PROJECT_FILE),asset_sha256=sha(ASSET_FILE),
   source_sha256=sha(Path(__file__)),asset=ASSET,avatar_id=AVATAR,linked_actor=ACTOR_NAME,
   linked_actor_label='Pling | Familje')
  verify_artifacts(proof,source=Path(__file__),asset=ASSET_FILE,project=PROJECT_FILE)
  tx.step('record_candidate',[INSTALL_MANIFEST],lambda:atomic_bytes(INSTALL_MANIFEST,(json.dumps(proof,indent=2)+'\n').encode('utf-8')))
  tx.commit()
 except Exception:
  actors.destroy_actor(actor)
  assert_exclusive_editor()
  try:tx.rollback();proof['rolled_back']=True
  except Exception:proof['recovery_error']=traceback.format_exc()
  raise


def main():
 global TEST_FIXTURE
 assert_context();assert_exclusive_editor()  # Before any fixture/backups/mutation in the intended project.
 OUT.mkdir(parents=True,exist_ok=True)
 if JOURNAL.exists():
  old=json.loads(JOURNAL.read_text(encoding='utf-8'))
  if old.get('status') not in ('committed','rolled_back'):
   OwnedInstallTransaction.recover(JOURNAL,allowed_files=[MAP_FILE,PROJECT_FILE,*ASSET_FILES,INSTALL_MANIFEST])
   raise GuardError('Recorded installation recovered safely; restart editor before retry to discard cached packages')
 before_hash=sha(MAP_FILE);project_hash=sha(PROJECT_FILE)
 backup=OUT/f'Before_OfficePresence_{before_hash[:12]}.umap'
 if not backup.exists():shutil.copy2(MAP_FILE,backup)
 assert sha(backup)==before_hash,'Map backup is not exact'
 project_backup=OUT/f'Before_OfficePresence_{project_hash[:12]}.uproject'
 if not project_backup.exists():shutil.copy2(PROJECT_FILE,project_backup)
 assert sha(project_backup)==project_hash,'Project backup is not exact'
 proof={'synthetic_tests':True,'real_auth':False,'live_execution':False,'installed':False,'passed':False,
  'map_before_sha256':before_hash,'backup':str(backup),'project_before_sha256':project_hash,
  'project_backup':str(project_backup),'saved_assets':False,'context_valid':True}
 fixture=ProjectionFixture(FILE);failure=None
 try:
  assert u.get_editor_subsystem(u.LevelEditorSubsystem).load_level(MAP);assert_context(loaded=True)
  if u.EditorAssetLibrary.does_asset_exist(ASSET):
   manifest=json.loads((OUT/'installation.json').read_text(encoding='utf-8'))
   verify_artifacts(manifest,source=Path(__file__),asset=ASSET_FILE,project=PROJECT_FILE)
   proof.update(verify_presence_actor())
   proof.update(installed=manifest.get('installed') is True,already_saved=True,asset=ASSET,
    status=manifest.get('status'),map_after_sha256=sha(MAP_FILE),passed=True)
  else:
   baseline=snapshot_actors()
   atomic_bytes(OUT/'actors_before.json',json.dumps(baseline,indent=2).encode('utf-8'))
   bp,cls=create_consumer()
   assert_exclusive_editor();fixture.acquire();TEST_FIXTURE=fixture
   proof['tests'],_=behavioral_tests(cls)
   install_consumer(bp,cls,baseline,before_hash,project_hash,proof)
   proof['passed']=True
 except Exception as error:
  failure=error;proof['error']=traceback.format_exc();proof['passed']=False
 finally:
  try:fixture.restore()
  except Exception as error:
   failure=failure or error;proof['cleanup_error']=traceback.format_exc();proof['passed']=False;proof['installed']=False
  TEST_FIXTURE=None
  proof['tests']=TEST_RESULTS;proof['map_unchanged']=sha(MAP_FILE)==before_hash
  atomic_bytes(OUT/'verification.json',(json.dumps(proof,indent=2)+'\n').encode('utf-8'))
  print(json.dumps(proof))
 if failure:raise RuntimeError('Native installation failed; inspect verification and transaction journal') from failure

if __name__=='__main__':
 main()
