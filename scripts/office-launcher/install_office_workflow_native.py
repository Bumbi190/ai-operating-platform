"""Explicit saved workflow map staging/audit/finalization, for full editor only.

The established Office map and URI registration are never written. Only the new
fixed workflow map is owned; rollback audits exact bytes before removing it.
"""
from pathlib import Path
import json,os,sys,uuid
import unreal as u
from office_install_guard import OwnedInstallTransaction,atomic_bytes,canonical,digest
from office_workflow_native_guard import ASSET,FOLDER,OFFICE_MAP,REVIEW_MAP,paths_for,check_workflow_native,_no_redirects,CHECKS,PLUGIN_CONTENT
from office_workflow_target import default_workflow_target
from office_workflow_bundle import verify_bundle
from build_office_workflow_native import sig

ROOT=Path(r'C:\Users\Andre\Projects\Omnira\Design\Agent-Campus-3D\UnrealPilot\Omnira_Office_CastQA_v83')
PRIOR=Path(r'C:\Users\Andre\Projects\Omnira\Temp\unreal-office-workflow-consumer-20261118')

def context():
    assert canonical(u.Paths.get_project_file_path())==canonical(default_workflow_target().project)
    assert '-run=' not in u.SystemLibrary.get_command_line().lower(),'Interactive editor required; no commandlet level loading'
    lvl=u.get_editor_subsystem(u.LevelEditorSubsystem);assert lvl and not lvl.is_in_play_in_editor()
    assert not u.EditorLoadingAndSavingUtils.get_dirty_content_packages() and not u.EditorLoadingAndSavingUtils.get_dirty_map_packages(),'Preserve unsaved editor work'
    return lvl,u.get_editor_subsystem(u.EditorActorSubsystem),u.get_editor_subsystem(u.UnrealEditorSubsystem)

def write(path,data):atomic_bytes(path,(json.dumps(data,indent=2)+'\n').encode('utf-8'))

def packages():
    reg=u.AssetRegistryHelpers.get_asset_registry();opts=u.AssetRegistryDependencyOptions(include_soft_package_references=True,include_hard_package_references=True)
    seen=set();todo=[ASSET]
    while todo:
        p=str(todo.pop())
        if p in seen or p.startswith('/Script/'):continue
        assert p.split('/',2)[1] in ('Game','Engine',*PLUGIN_CONTENT),p
        seen.add(p);assert len(seen)<=256
        todo.extend(str(v) for v in reg.get_dependencies(p,opts))
    return sorted(seen)

def check_candidate(candidate,bundle):
    assert candidate['scope']=='canonical_saved_workflow_v1' and candidate['installed'] is False
    assert candidate['bundle']==str(bundle) and candidate['bundle_id']==bundle.name
    assert all(digest(p)==h for p,h in candidate['protected'].items())
    target=default_workflow_target();target.verify();paths=paths_for(target,bundle,candidate['packages'])
    actual={n:digest(p) for n,p in paths.items()};assert all(actual.values()) and actual==candidate['artifacts']
    return actual

def inspect(candidate):
    lvl,sub,ed=context();assert lvl.load_level(OFFICE_MAP)
    actors={a.get_name():a for a in sub.get_all_level_actors()};prior=json.loads((PRIOR/'native-candidate.json').read_text())
    expected=dict(prior['original_signatures'])
    actor_count=1727
    if 'scene_update' in candidate:
        from install_office_workflow_scene_update import scene_expectations
        expected,actor_count=scene_expectations(candidate,prior)
    assert len(actors)==actor_count and all(n in actors and sig(actors[n])==v for n,v in expected.items())
    c=actors[candidate['consumer']];target=actors[candidate['target']]
    assert c.get_editor_property('Enabled') and c.get_editor_property('Target')==target
    assert c.get_editor_property('FilePath')==str(ROOT/'Saved/OfficePresence/office-familje-pling.json')
    assert not any(c.get_editor_property(n) for n in ('HasBinding','HasTarget','SessionClosed'))
    assert all(c.get_editor_property(n)=='' for n in ('PinnedVisit','PinnedAvatar','PinnedProject','PinnedAgent','PinnedPath'))
    assert not any(a.get_actor_label().startswith('TEMP ') for a in actors.values())
    assert not u.BlueprintGraphEditor.get_graph_editor(u.BlueprintEditorLibrary.find_event_graph(u.load_asset(ASSET))).list_nodes_with_errors()
    assert packages()==candidate['packages']

def build(bundle):
    bundle=verify_bundle(bundle);lvl,sub,ed=context();out=ROOT/FOLDER;_no_redirects(out)
    if out.exists():
        # Only our exact completed rollback may be continued. Preserve its
        # journal as evidence; never repair an active/foreign installation.
        old=json.loads((out/'transaction.json').read_text());assert old['status']=='rolled_back'
        assert all(digest(p)==r['before'] for p,r in old['records'].items())
        assert set(p.name for p in out.iterdir())=={'original_project.uproject','original_consumer.uasset','transaction.json'}
        atomic_bytes(out/('attempt-'+uuid.uuid4().hex+'-rollback.json'),(out/'transaction.json').read_bytes())
    prior=json.loads((PRIOR/'native-candidate.json').read_text());assert prior['passed'] and prior['map']==REVIEW_MAP
    assert digest(ROOT/('Content'+REVIEW_MAP[5:]+'.umap'))==prior['map_sha256']
    protected=dict(prior['protected']);protected[str(ROOT/('Content'+REVIEW_MAP[5:]+'.umap'))]=prior['map_sha256']
    legacy=ROOT/'Content/OmniraRealismLab/Maps/Omnira_HQ_Office_Visit.umap';protected[str(legacy)]=digest(legacy)
    assert all(h and digest(p)==h for p,h in protected.items())
    target=default_workflow_target();package_list=packages()
    for name,p in paths_for(target,bundle,package_list).items():
        if name=='map':continue
        _no_redirects(p);assert p.is_file(),'Missing dependency '+str(p)
    out.mkdir(exist_ok=True);mapfile=ROOT/('Content'+OFFICE_MAP[5:]+'.umap');asset=ROOT/('Content'+ASSET[5:]+'.uasset')
    originals={target.project:out/'original_project.uproject',asset:out/'original_consumer.uasset'}
    for p,b in originals.items():_no_redirects(p);atomic_bytes(b,p.read_bytes())
    assert not mapfile.exists() and not mapfile.with_suffix('.uexp').exists() and not mapfile.with_suffix('.ubulk').exists()
    owned=[*originals,mapfile,out/'installation.json'];tx=OwnedInstallTransaction(out/'transaction.json',originals=originals,new_files=owned[2:],rollback_order=[out/'installation.json',mapfile,*originals]);tx.begin()
    try:
        assert lvl.load_level(REVIEW_MAP)
        # Duplicate the clean source before changing any instance properties.
        # Saving a copy of a dirty source would leave that source dirty in memory.
        def save():assert u.EditorLoadingAndSavingUtils.save_map(ed.get_editor_world(),OFFICE_MAP)
        tx.step('save_owned_workflow_map',[mapfile],save)
        assert lvl.load_level(OFFICE_MAP)
        actors={a.get_name():a for a in sub.get_all_level_actors()};c=actors[prior['consumer']]
        assert not c.get_editor_property('Enabled');c.set_editor_property('Enabled',True);c.set_actor_label('Workflow presence | Familje')
        def save_enabled():assert lvl.save_current_level()
        tx.step('save_enabled_workflow_target',[mapfile],save_enabled)
        candidate={'scope':'canonical_saved_workflow_v1','installed':False,'passed':False,'run_id':uuid.uuid4().hex,'build_pid':os.getpid(),'map':OFFICE_MAP,'asset':ASSET,'copy_source':REVIEW_MAP,'new_map':True,'bundle':str(bundle),'bundle_id':bundle.name,'protected':protected,'consumer':prior['consumer'],'target':prior['target'],'packages':package_list}
        candidate['artifacts']={n:digest(p) for n,p in paths_for(target,bundle,candidate['packages']).items()};assert all(candidate['artifacts'].values())
        write(out/'candidate.json',candidate);inspect(candidate);check_candidate(candidate,bundle)
        candidate['passed']=True;write(out/'candidate.json',candidate)
        print('WORKFLOW_MAP_STAGED '+candidate['run_id'])
    except:
        tx.rollback();raise

def audit():
    out=ROOT/FOLDER;candidate=json.loads((out/'candidate.json').read_text());assert os.getpid()!=candidate['build_pid']
    bundle=verify_bundle(candidate['bundle']);inspect(candidate);check_candidate(candidate,bundle)
    proof={'scope':'canonical_saved_workflow_v1','run_id':candidate['run_id'],'pid':os.getpid(),'passed':True,'packages':candidate['packages'],'artifacts':candidate['artifacts'],'dependency_closure_verified':True,'enabled_saved_target':True,'preserved_actor_count':1726,'actor_count':len(u.get_editor_subsystem(u.EditorActorSubsystem).get_all_level_actors()),'scene_update':candidate.get('scene_update')}
    write(out/'audit.json',proof);print('WORKFLOW_SAVED_AUDIT_PASS '+str(os.getpid()))

def finalize():
    out=ROOT/FOLDER;c=json.loads((out/'candidate.json').read_text());bundle=verify_bundle(c['bundle']);inspect(c);check_candidate(c,bundle)
    audit=json.loads((out/'audit.json').read_text());runtime=json.loads((out/'runtime.json').read_text())
    game_proof=out/'fixed-game/proof.json';game=json.loads(game_proof.read_text())
    assert game['run_id']==c['run_id'] and game['scope']=='fixed_workflow_game_path_v1' and not game['errors']
    assert all(game[k] is True for k in ('passed','real_game_process_lease','prepared_and_applied_native_ack','busy_applied','idle_applied_again','kernel_handle_exit_closes_visit','projection_restored'))
    assert game['native_ack_fixture'] is False and game['fixed_projection_directory']==str(ROOT/'Saved/OfficePresence')
    assert os.getpid() not in (c['build_pid'],audit['pid'],runtime['pid'])
    for proof in (audit,runtime):assert proof['passed'] and proof['run_id']==c['run_id'] and proof['packages']==c['packages'] and proof['artifacts']==c['artifacts']
    assert audit['dependency_closure_verified'] and audit['enabled_saved_target'] and all(runtime[k] is True for k in CHECKS)
    receipt={k:c[k] for k in ('scope','run_id','map','asset','copy_source','new_map','bundle_id','packages','artifacts')}
    receipt.update(installed=True,passed=True,workflow_protocol=1,projection_directory=str(ROOT/'Saved/OfficePresence'),finalizer_pid=os.getpid(),audit_sha256=digest(out/'audit.json'),runtime_sha256=digest(out/'runtime.json'),fixed_game_sha256=digest(game_proof))
    state=json.loads((out/'transaction.json').read_text());tx=OwnedInstallTransaction.__new__(OwnedInstallTransaction);tx.journal=out/'transaction.json';tx.state=state
    tx.step('record_final_acceptance',[out/'installation.json'],lambda:write(out/'installation.json',receipt));tx.commit()
    check_workflow_native(default_workflow_target(),bundle);print('WORKFLOW_INSTALL_FINALIZED')

def rollback():
    context();out=ROOT/FOLDER;c=json.loads((out/'candidate.json').read_text());paths=paths_for(default_workflow_target(),c['bundle'],c['packages'])
    owned={p for n,p in paths.items() if not n.startswith(('source:','dependency:'))}|{out/'installation.json'}
    OwnedInstallTransaction.recover(out/'transaction.json',allowed_files=owned)
    assert all(digest(p)==h for p,h in c['protected'].items());print('WORKFLOW_OWNED_MAP_ROLLED_BACK')
