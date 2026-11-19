"""Versioned UNSAVED activity consumer authoring. Never installs or saves the map.

The v1 source is kept unchanged for existing installed identity visitors. This v2
candidate extends its native graph with a separate per-frame activity deadline.
"""
from pathlib import Path
import json,time,traceback,sys,hashlib
sys.path.insert(0,str(Path(__file__).resolve().parent))
import install_unreal_presence as base
import unreal as u
from office_install_guard import ProjectionFixture,atomic_bytes
BEL=u.BlueprintEditorLibrary
PROJECT=base.PROJECT
PROJECT_FILE=base.PROJECT_FILE
MAP_FILE=base.MAP_FILE
MAP=base.MAP
AVATAR=base.AVATAR
ASSET='/Game/OmniraGameplayV83/PresenceProbe/BP_OfficeStepActivityCandidate'
FILE=PROJECT/'Saved/OfficeActivityFixture/office-familje-pling.json'
OUT=PROJECT/'Saved/OfficeActivitySetup'
UNKNOWN=base.UNKNOWN
STALE='Pling\nAnslutning inaktuell · arbetsstatus okänd'
SCHEMA='omnira.office.private-presence.v2'
KIND='step_request_waiting_for_reply'

def assert_context(loaded=False):return base.assert_context(loaded)
def assert_exclusive_editor():return base.assert_exclusive_editor()

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
  'Invalidated':'bool','IdentityVerified':'bool','DisplayText':'string','NextPollAt':'double',
  'RawActivityKind':'string','RawActivityEvent':'string','LastActivityEvent':'string','RawActivityObserved':'double','LastActivityObserved':'double','RawActivityExpiry':'double','LastActivityExpiry':'double','ActivityDeadline':'double',
  'ActivityInvalidated':'bool','ActivityIndicated':'bool'}
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
 cdo.set_editor_property('ActivityInvalidated',True)
 cdo.set_editor_property('ActivityIndicated',False)
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
 stale_first,stale_tail=show(STALE,False)
 invalidate=assign('Invalidated','true')
 invalid_activity=assign('ActivityInvalidated','true');after(invalidate,invalid_activity)
 invalid_flag=assign('ActivityIndicated','false');after(invalid_activity,invalid_flag)
 invalid_caption=branch(eq(get('RawState'),'stale'));after(invalid_flag,invalid_caption)
 after(invalid_caption,stale_first);after(invalid_caption,unknown_first,'else')
 stale_invalidate=assign('RawState','stale');after(stale_invalidate,invalidate)
 # Deadline checks run on every real frame, including pause; only disk reads are throttled.
 current_fresh=both([calc('Less_DoubleDouble',get('NowMono'),get('ReceiptDeadline')),
  calc('Less_DoubleDouble',get('NowWall'),get('LastSeenExpiry'))])
 expired=branch(both([get('IdentityVerified'),neg(current_fresh)]));after(wall,expired)
 after(expired,stale_invalidate)
 poll=branch(calc('GreaterEqual_DoubleDouble',get('NowMono'),get('NextPollAt')))
 # A separate activity deadline runs on EVERY frame, also during world pause.
 def identity_display():
  a=fn('KismetStringLibrary','Left',SourceString=get('RawAgent'),Count='24')
  p=fn('KismetStringLibrary','Left',SourceString=get('RawProject'),Count='24')
  return concat(concat(concat(a,'\n'),p),'\nIdentitet verifierad · arbetsstatus okänd')
 activity_fresh=both([calc('Less_DoubleDouble',get('NowMono'),get('ActivityDeadline')),
  calc('Less_DoubleDouble',get('NowWall'),get('LastActivityExpiry'))])
 activity_expired=branch(both([get('IdentityVerified'),get('ActivityIndicated'),neg(activity_fresh)]))
 after(expired,activity_expired,'else')
 close_activity=assign('ActivityInvalidated','true');after(activity_expired,close_activity)
 close_indication=assign('ActivityIndicated','false');after(close_activity,close_indication)
 expired_first,expired_tail=show(identity_display(),True);after(close_indication,expired_first)
 after(expired_tail,poll);after(activity_expired,poll,'else')
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
 core=both(successes+[fn('KismetMathLibrary','BooleanOR',A=eq(get('RawSchema'),'omnira.office.private-presence.v2'),B=eq(get('RawSchema'),'omnira.office.private-presence.v1')),eq(get('RawAvatar'),AVATAR),
  eq(get('RawIdentity'),'verified'),eq(get('RawState'),'fresh'),eq(get('RawExecution'),'not_verified'),neg(get('RawWork'))])
 gate=branch(core);after(tail,gate);after(gate,invalidate,'else')
 details=require_fields(['expires_at_unix','project_text','agent_text'],gate)
 tail=details;valid_fields=[]
 for key,var in [('expires_at_unix','RawExpires'),('project_text','RawProject'),('agent_text','RawAgent')]:
  tail,success=field(key,var,tail);valid_fields.append(success)
 # Optional v2 activity fields never invalidate an otherwise valid v1 identity.
 activity_reads=[]
 reset_kind=assign('RawActivityKind','none');after(tail,reset_kind);tail=reset_kind
 reset_expiry=assign('RawActivityExpiry','0');after(tail,reset_expiry);tail=reset_expiry
 for key,var in [('activity_kind','RawActivityKind'),('activity_expires_at_unix','RawActivityExpiry'),('activity_event_key','RawActivityEvent'),('activity_observed_at_unix','RawActivityObserved')]:
  tail,success=field(key,var,tail);activity_reads.append(success)
 bounds=both(valid_fields+[
  calc('Greater_DoubleDouble',get('RawExpires'),get('NowWall')),
  calc('LessEqual_DoubleDouble',get('RawExpires'),calc('Add_DoubleDouble',get('NowWall'),'22')),
 ])
 bounds_gate=branch(bounds);after(tail,bounds_gate)
 stale_source=branch(both(valid_fields+[calc('LessEqual_DoubleDouble',get('RawExpires'),get('NowWall'))]))
 after(bounds_gate,stale_source,'else');after(stale_source,stale_invalidate);after(stale_source,invalidate,'else')
 newer=branch(calc('Greater_DoubleDouble',get('RawExpires'),get('LastSeenExpiry')));after(bounds_gate,newer)
 last=assign('LastSeenExpiry',get('RawExpires'));after(newer,last)
 deadline=assign('ReceiptDeadline',calc('Add_DoubleDouble',get('NowMono'),calc('Subtract_DoubleDouble',get('RawExpires'),get('NowWall'))))
 after(last,deadline)
 reset=assign('Invalidated','false');after(deadline,reset)
 valid=both([neg(get('Invalidated')),calc('EqualEqual_DoubleDouble',get('RawExpires'),get('LastSeenExpiry')),
  calc('Less_DoubleDouble',get('NowMono'),get('ReceiptDeadline'))])
 final=branch(valid);after(reset,final);after(newer,final,'else');after(final,stale_invalidate,'else')
 agent=fn('KismetStringLibrary','Left',SourceString=get('RawAgent'),Count='24')
 project=fn('KismetStringLibrary','Left',SourceString=get('RawProject'),Count='24')
 display=concat(concat(concat(agent,'\n'),project),'\nIdentitet verifierad · arbetsstatus okänd')
 known_first,known_tail=show(display,True);after(final,known_first)
 initial_activity=assign('ActivityIndicated','false');after(known_tail,initial_activity)
 activity_bounds=branch(both(activity_reads+[eq(get('RawSchema'),'omnira.office.private-presence.v2'),eq(get('RawActivityKind'),'step_request_waiting_for_reply'),
  fn('KismetMathLibrary','EqualEqual_IntInt',A=fn('KismetStringLibrary','Len',S=get('RawActivityEvent')),B='64'),
  calc('LessEqual_DoubleDouble',get('RawActivityObserved'),get('NowWall')),
  calc('GreaterEqual_DoubleDouble',get('RawActivityObserved'),calc('Subtract_DoubleDouble',get('NowWall'),'90')),
  calc('Greater_DoubleDouble',get('RawActivityExpiry'),get('NowWall')),
  calc('LessEqual_DoubleDouble',get('RawActivityExpiry'),get('RawExpires'))]))
 after(initial_activity,activity_bounds)
 activity_unknown=assign('ActivityInvalidated','true');after(activity_bounds,activity_unknown,'else')
 activity_newer=branch(both([calc('Greater_DoubleDouble',get('RawActivityObserved'),get('LastActivityObserved')),
  neg(fn('KismetStringLibrary','EqualEqual_StrStr',A=get('RawActivityEvent'),B=get('LastActivityEvent')))]))
 after(activity_bounds,activity_newer)
 activity_key=assign('LastActivityEvent',get('RawActivityEvent'));after(activity_newer,activity_key)
 activity_observed=assign('LastActivityObserved',get('RawActivityObserved'));after(activity_key,activity_observed)
 activity_last=assign('LastActivityExpiry',get('RawActivityExpiry'));after(activity_observed,activity_last)
 activity_deadline=assign('ActivityDeadline',calc('Add_DoubleDouble',get('NowMono'),calc('Subtract_DoubleDouble',get('RawActivityExpiry'),get('NowWall'))))
 after(activity_last,activity_deadline)
 activity_reset=assign('ActivityInvalidated','false');after(activity_deadline,activity_reset)
 activity_valid=branch(both([neg(get('ActivityInvalidated')),
  calc('Less_DoubleDouble',get('NowWall'),get('LastActivityExpiry')),
  calc('Less_DoubleDouble',get('NowMono'),get('ActivityDeadline'))]))
 after(activity_reset,activity_valid)
 # Same event may only shorten a deadline; expiration is never an event identity.
 same_event=branch(both([fn('KismetStringLibrary','EqualEqual_StrStr',A=get('RawActivityEvent'),B=get('LastActivityEvent')),
  calc('EqualEqual_DoubleDouble',get('RawActivityObserved'),get('LastActivityObserved'))]))
 after(activity_newer,same_event,'else');after(same_event,activity_unknown,'else')
 shorter=branch(calc('Less_DoubleDouble',get('RawActivityExpiry'),get('LastActivityExpiry')))
 after(same_event,shorter);after(shorter,activity_valid,'else')
 short_expiry=assign('LastActivityExpiry',get('RawActivityExpiry'));after(shorter,short_expiry)
 proposed=calc('Add_DoubleDouble',get('NowMono'),calc('Subtract_DoubleDouble',get('RawActivityExpiry'),get('NowWall')))
 earlier_mono=branch(calc('Less_DoubleDouble',proposed,get('ActivityDeadline')));after(short_expiry,earlier_mono)
 short_deadline=assign('ActivityDeadline',proposed);after(earlier_mono,short_deadline)
 after(short_deadline,activity_valid);after(earlier_mono,activity_valid,'else')
 after(activity_valid,activity_unknown,'else')
 indicated=assign('ActivityIndicated','true');after(activity_valid,indicated)
 activity_text=concat(concat(concat(agent,'\n'),project),'\nStegbegäran registrerad · körning ej verifierad')
 activity_first,activity_tail=show(activity_text,True);after(indicated,activity_first)
 # Billboard only when a real player camera exists; commandlet/editor has none.
 camera=fn('GameplayStatics','GetPlayerCameraManager',PlayerIndex='0')
 face=branch(fn('KismetSystemLibrary','IsValid',Object=camera))
 after(activity_tail,face);after(activity_unknown,face);after(unknown_tail,face);after(stale_tail,face)
 camera_pos=fn('PlayerCameraManager','GetCameraLocation',self=camera)
 position=fn('Actor','K2_GetActorLocation')
 look=fn('KismetMathLibrary','FindLookAtRotation',Start=position,Target=camera_pos)
 rotate=node('Actor','K2_SetActorRotation');put(rotate,'NewRotation',look);after(face,rotate)
 assert BEL.compile_blueprint(bp),str(ed.list_nodes_with_errors())
 assert not ed.list_nodes_with_errors(),str(ed.list_nodes_with_errors())

def behavioral_tests(cls,fixture):
 actors=u.get_editor_subsystem(u.EditorActorSubsystem)
 actor=actors.spawn_actor_from_class(cls,u.Vector(0,0,-10000));assert actor
 tests=[];failures=[]
 def write(**changes):
  data={'schema':SCHEMA,'avatar_id':AVATAR,'data_state':'fresh','identity':'verified',
   'execution':'not_verified','work_verified':False,'animation':'ambient','project_text':'Syntetiskt projekt',
   'agent_text':'Syntetisk Pling','status_text':'UNTRUSTED_WORK_CLAIM','expires_at_unix':time.time()+18,
   'activity_kind':KIND,'activity_expires_at_unix':time.time()+1.2,'activity_event_key':hashlib.sha256(str(time.time_ns()).encode('ascii')).hexdigest(),'activity_observed_at_unix':time.time()-1}
  data.update(changes);fixture.write(json.dumps(data,ensure_ascii=False).encode('utf-8'));return data
 def tick():
  time.sleep(.51);actor.call_method('ReceiveTick',(0.5,))
 def expect(identity,activity,name):
  if actor.get_editor_property('IdentityVerified') is not identity:failures.append(name+':identity')
  if actor.get_editor_property('ActivityIndicated') is not activity:failures.append(name+':activity flag')
  text=str(actor.get_editor_property('DisplayText'))
  assert 'UNTRUSTED' not in text,name
  assert str(actor.get_component_by_class(u.TextRenderComponent).text)==text,name
  if identity and ('Stegbegäran registrerad' in text) is not activity:failures.append(name+':caption')
  tests.append(name)
 try:
  d=write();actor.call_method('ReceiveBeginPlay');expect(True,True,'fixed_activity_text_from_native_graph')
  time.sleep(1.25);tick();expect(True,False,'activity_expires_before_identity_with_stopped_writer')
  tick();expect(True,False,'same_expired_file_cannot_revive_activity')
  write(activity_expires_at_unix=time.time()+3);tick();expect(True,True,'newer_activity_deadline_can_be_displayed')
  write(activity_kind='none',activity_expires_at_unix=0);tick();expect(True,False,'no_activity_preserves_identity')
  write(activity_kind='invented_work_status');tick();expect(True,False,'unknown_kind_never_becomes_execution')
  write(activity_expires_at_unix=time.time()+120);tick();expect(True,False,'activity_cannot_outlive_identity')
  write(schema='omnira.office.private-presence.v1');tick();expect(True,False,'v1_identity_remains_compatible_without_activity')
  for changes,name in [({'schema':'other-schema'},'unknown_schema_rejected'),
   ({'work_verified':True},'work_claim_rejected'),({'execution':'working'},'execution_claim_rejected'),
   ({'avatar_id':'other-avatar'},'wrong_avatar_rejected')]:
   write(**changes);tick();expect(False,False,name)
  fixture.remove();tick();expect(False,False,'missing_file_clears')
  observed=time.time()-1
  write(activity_expires_at_unix=time.time()+10,activity_event_key='b'*64,activity_observed_at_unix=observed);tick();expect(True,True,'request_before_shorter_new_event')
  same=write(activity_expires_at_unix=time.time()+5,activity_event_key='c'*64,activity_observed_at_unix=observed+.1);tick();expect(True,True,'new_event_with_earlier_claim_deadline')
  write(activity_expires_at_unix=same['activity_expires_at_unix'],activity_event_key='d'*64,activity_observed_at_unix=observed+.2);tick();expect(True,True,'new_event_with_equal_claim_deadline')
  write(activity_expires_at_unix=time.time()+2,activity_event_key='d'*64,activity_observed_at_unix=observed+.2);tick();expect(True,True,'same_event_shortened_lease_still_valid')
  time.sleep(2.1);tick();expect(True,False,'shortened_lease_expires')
  actors.destroy_actor(actor);actor=actors.spawn_actor_from_class(cls,u.Vector(0,0,-10000))
  write(expires_at_unix=time.time()+1,activity_expires_at_unix=time.time()+.7);actor.call_method('ReceiveBeginPlay');expect(True,True,'fresh_before_stale_identity')
  time.sleep(1.1);tick();expect(False,False,'stale_identity_clears_activity_flag')
  if 'Anslutning inaktuell' not in str(actor.get_editor_property('DisplayText')):failures.append('expired_identity_has_stale_caption')
  tick()
  if 'Anslutning inaktuell' not in str(actor.get_editor_property('DisplayText')):failures.append('stale_caption_survives_unchanged_file')
 finally:actors.destroy_actor(actor)
 assert not failures,'; '.join(failures)
 return tests

def main():
 assert_context();assert_exclusive_editor()
 proof={'synthetic':True,'installed':False,'saved_assets':False,'real_auth':False,'live_execution':False,'passed':False}
 files=[MAP_FILE,PROJECT_FILE,base.ASSET_FILE]
 before={str(p):base.sha(p) for p in files};fixture=ProjectionFixture(FILE)
 try:
  assert u.get_editor_subsystem(u.LevelEditorSubsystem).load_level(MAP);assert_context(True)
  bp,cls=create_consumer();fixture.acquire()
  proof['tests']=behavioral_tests(cls,fixture);proof['passed']=True
 except Exception:
  proof['error']=traceback.format_exc()
 finally:
  try:fixture.restore()
  except Exception:proof['cleanup_error']=traceback.format_exc();proof['passed']=False
  proof['saved_files_unchanged']=all(base.sha(Path(p))==value for p,value in before.items())
  proof['passed']=proof['passed'] and proof['saved_files_unchanged']
  proof['source_sha256']=base.sha(Path(__file__))
  OUT.mkdir(parents=True,exist_ok=True);atomic_bytes(OUT/'native-local-proof.json',(json.dumps(proof,indent=2)+'\n').encode('utf-8'))
  print(json.dumps(proof))
 if not proof['passed']:raise RuntimeError('Native activity candidate failed')

if __name__=='__main__':main()
