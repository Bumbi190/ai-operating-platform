"""Synthetic native Blueprint-chain test. All assets/world changes remain unsaved."""
from pathlib import Path
import hashlib,json,traceback,unreal as u
root=Path(__file__).resolve().parents[2]
out=root/'.superpowers/office-launcher-20261112/presence'
result={'synthetic':True,'live_connection':False,'saved_assets':False}
mapfile=Path(r'C:\Users\Andre\Projects\Omnira\Design\Agent-Campus-3D\UnrealPilot\Omnira_Office_CastQA_v83\Content\OmniraRealismLab\Maps\Omnira_HQ_Office_Visit.umap')
before=hashlib.sha256(mapfile.read_bytes()).hexdigest()
try:
    bel=u.BlueprintEditorLibrary; lib=u.EditorAssetLibrary
    lvl=u.get_editor_subsystem(u.LevelEditorSubsystem)
    assert lvl.load_level('/Game/OmniraRealismLab/Maps/Omnira_HQ_Office_Visit')
    factory=u.BlueprintFactory();factory.set_editor_property('parent_class',u.Actor)
    bp=u.AssetToolsHelpers.get_asset_tools().create_asset('BP_PrivatePresenceJsonProbe','/Game/OmniraGameplayV83/PresenceProbe',u.Blueprint,factory)
    assert bp
    for name,kind in [('ProbeResult','string'),('LoadOk','bool'),('StringOk','bool')]:
        assert bel.add_member_variable(bp,name,bel.get_basic_type_by_name(kind))
    assert bel.compile_blueprint(bp)
    ed=u.BlueprintGraphEditor.get_graph_editor(bel.find_event_graph(bp))
    result['struct_methods']=[m for m in dir(ed) if 'struct' in m.lower() or 'split' in m.lower()]
    result['file_nodes']=[str(n) for n in ed.list_available_nodes([]) if 'FilePath' in str(n) or 'File Path' in str(n)][:15]
    def wire(a,p,b,q):
        op=a.find_output_pin(p);ip=b.find_input_pin(q)
        assert op.is_valid() and ip.is_valid() and op.try_create_connection(ip),(a.get_node_title(),p,b.get_node_title(),q)
    def call(name,x):
        node=ed.add_call_function_node(name)
        assert node,name
        node.set_node_pos(u.IntPoint(x,0))
        return node
    begin=next(n for n in ed.list_all_nodes() if 'BeginPlay' in str(n.get_node_title()).replace(' ',''))
    make=ed.create_node_from_name('Utilities|Struct|MakeFilePath',u.Vector2D(0,200),[])
    assert make
    path_pin=make.find_input_pin('FilePath')
    assert path_pin.is_valid() and path_pin.set_pin_value((out/'unreal-presence-test.json').as_posix())
    read=call('/Script/JsonBlueprintUtilities.JsonBlueprintFunctionLibrary:FromFile',300)
    wire(make,'FilePath',read,'File')
    result['source_method']='native_blueprint_from_file'
    convert=call('/Script/JsonBlueprintUtilities.JsonBlueprintFunctionLibrary:ToString',650)
    wire(begin,'then',read,'execute');wire(read,'then',convert,'execute')
    wire(read,'OutJsonObject',convert,'JsonObject')
    tail=convert
    for i,(name,node,pin) in enumerate([('ProbeResult',convert,'OutJsonString'),('LoadOk',read,'ReturnValue'),('StringOk',convert,'ReturnValue')]):
        setter=ed.add_set_member_variable_node(name);setter.set_node_pos(u.IntPoint(1000+i*300,0))
        wire(tail,'then',setter,'execute');wire(node,pin,setter,name);tail=setter
    assert bel.compile_blueprint(bp)
    assert not ed.list_nodes_with_errors()
    cls=u.load_object(None,bp.get_path_name()+'_C')
    assert cls
    actor=u.get_editor_subsystem(u.EditorActorSubsystem).spawn_actor_from_class(cls,u.Vector(0,0,-10000))
    actor.call_method('ReceiveBeginPlay')
    result['load_ok']=actor.get_editor_property('LoadOk')
    result['string_ok']=actor.get_editor_property('StringOk')
    text=actor.get_editor_property('ProbeResult')
    result['serialized']=text
    loaded=json.loads(text)
    expected=json.loads((out/'unreal-presence-test.json').read_text(encoding='utf-8'))
    assert loaded==expected
    result.update(passed=True,fields_roundtripped=len(loaded))
except Exception:
    result['error']=traceback.format_exc()
result['map_unchanged']=before==hashlib.sha256(mapfile.read_bytes()).hexdigest()
(out/'unreal-native-proof.json').write_text(json.dumps(result,ensure_ascii=True,indent=2),encoding='utf-8')
print(json.dumps(result))
