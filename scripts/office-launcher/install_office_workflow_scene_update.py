"""Guarded maintenance of an accepted saved scene; all workflow checks rerun."""
from pathlib import Path
import json,os,shutil,uuid
import unreal as u
from office_install_guard import OwnedInstallTransaction,atomic_bytes,canonical,digest
from office_workflow_native_guard import FOLDER,OFFICE_MAP,REVIEW_MAP,ASSET,check_workflow_native,paths_for,_no_redirects
from office_workflow_target import default_workflow_target,matching_workflow
from office_launcher import WindowsBackend
from office_workflow_bundle import verify_bundle
from build_office_workflow_native import sig

ROOT=Path(r'C:\Users\Andre\Projects\Omnira\Design\Agent-Campus-3D\UnrealPilot\Omnira_Office_CastQA_v83')
FIX=ROOT/'Saved/OfficeTradingFix20261119'

def scene_expectations(candidate,prior):
    update=candidate['scene_update']
    manifest=FIX/'preview.json';physical=FIX/'physical-qa.json'
    assert update['manifest']==str(manifest) and update['physical_qa']==str(physical)
    for p in (manifest,physical):_no_redirects(p)
    assert digest(manifest)==update['manifest_sha256'] and digest(physical)==update['physical_qa_sha256']
    m=json.loads(manifest.read_text());q=json.loads(physical.read_text())
    assert m['passed'] and q['passed'] and not q['errors'] and q['player_blocked'] and q['legacy_hidden']
    assert q['displacement_cm']>150 and 'BLOCK' in q['capsule']['pawn'].upper()
    assert m['source']==OFFICE_MAP and m['map']=='/Game/OmniraRealismLab/Maps/Previews/Omnira_Office_TradingResident_Review_20261119'
    assert digest(ROOT/('Content'+m['map'][5:]+'.umap'))==m['map_sha256']
    before=m['original_signatures'];after=m['preview_signatures']
    assert len(before)==1727 and len(after)==1732
    assert all(n in before and before[n]==v for n,v in prior['original_signatures'].items())
    assert all(n in after and after[n]==v for n,v in before.items())
    assert set(after)-set(before)=={m['resident'],*m['props'].values()}
    assert after[m['resident']][0]=='Resident | Trading-Pling'
    assert after[m['resident']][1]=='/Game/OmniraGameplayV83/OfficeFreeLife20261117/BP_Pling_FreeLife.BP_Pling_FreeLife_C'
    assert m['legacy']=='SkeletalMeshActor_6' and all(after[n][1]=='/Script/Engine.StaticMeshActor' for n in m['props'].values())
    assert len(set(m['props'].values()))==4
    original_map=ROOT/('Content'+OFFICE_MAP[5:]+'.umap')
    assert m['protected'][str(original_map)]==update['previous_map_sha256']
    return after,len(after)

def build():
    import install_office_workflow_native as base
    lvl,sub,ed=base.context();out=ROOT/FOLDER
    old=json.loads((out/'candidate.json').read_text())
    receipt=json.loads((out/'installation.json').read_text())
    bundle=verify_bundle(old['bundle'])
    check_workflow_native(default_workflow_target(),bundle)
    assert not any(matching_workflow(p,default_workflow_target()) for p in WindowsBackend().running()),'Preserve running Office game'
    assert shutil.disk_usage(ROOT).free>1024**3,'Reserve space for verified rollback'
    m=json.loads((FIX/'preview.json').read_text())
    update={'manifest':str(FIX/'preview.json'),'manifest_sha256':digest(FIX/'preview.json'),'physical_qa':str(FIX/'physical-qa.json'),'physical_qa_sha256':digest(FIX/'physical-qa.json'),'previous_map_sha256':receipt['artifacts']['map']}
    prior=json.loads((base.PRIOR/'native-candidate.json').read_text())
    expected,count=scene_expectations({'scene_update':update},prior)
    assert all(digest(p)==h for p,h in m['protected'].items())
    assert lvl.load_level(m['map'])
    actors={a.get_name():a for a in sub.get_all_level_actors()}
    assert len(actors)==count and all(sig(actors[n])==v for n,v in expected.items())
    resident=actors[m['resident']]
    assert resident.get_editor_property('OfficeAvatar')==actors[m['legacy']]
    assert not resident.get_editor_property('ActivitySource') and not resident.get_editor_property('WorkflowBusy')
    for k,n in m['props'].items():assert resident.get_editor_property(k)==actors[n]
    run=uuid.uuid4().hex;archive=FIX/('accepted-backup-'+run);archive.mkdir()
    # Preserve the complete accepted proof set before replacing any journal.
    shutil.copytree(out,archive/'install')
    review=ROOT/('Content'+REVIEW_MAP[5:]+'.umap');atomic_bytes(archive/'review.umap',review.read_bytes())
    archived={str(p.relative_to(archive)):digest(p) for p in archive.rglob('*') if p.is_file()}
    base.write(archive/'archive.json',{'run_id':old['run_id'],'files':archived})
    assert all(digest(archive/n)==h for n,h in archived.items())
    target=default_workflow_target();mapfile=ROOT/('Content'+OFFICE_MAP[5:]+'.umap');asset=ROOT/('Content'+ASSET[5:]+'.uasset')
    owned=[target.project,asset,mapfile,out/'installation.json']
    backups={}
    for i,p in enumerate(owned):
        b=out/('scene-'+run+'-'+str(i)+p.suffix);atomic_bytes(b,p.read_bytes());backups[p]=b
    tx=OwnedInstallTransaction(out/'transaction.json',originals=backups,new_files=[],rollback_order=list(reversed(owned)))
    tx.begin()
    state={'archive':str(archive),'expected_review':digest(review),'phase':'prepared'}
    base.write(FIX/'maintenance.json',state)
    try:
        assert u.EditorLoadingAndSavingUtils.save_map(ed.get_editor_world(),REVIEW_MAP)
        assert lvl.load_level(REVIEW_MAP)
        actors={a.get_name():a for a in sub.get_all_level_actors()}
        consumer=actors[old['consumer']]
        consumer.set_editor_property('Enabled',False)
        assert lvl.save_current_level()
        state.update(expected_review=digest(review),phase='source_saved');base.write(FIX/'maintenance.json',state)
        def save_map():assert u.EditorLoadingAndSavingUtils.save_map(ed.get_editor_world(),OFFICE_MAP)
        tx.step('copy_reviewed_trading_scene',[mapfile],save_map)
        assert lvl.load_level(OFFICE_MAP)
        actors={a.get_name():a for a in sub.get_all_level_actors()}
        actors[old['consumer']].set_editor_property('Enabled',True)
        def save_enabled():assert lvl.save_current_level()
        tx.step('enable_saved_workflow_consumer',[mapfile],save_enabled)
        protected={p:h for p,h in old['protected'].items() if canonical(p)!=canonical(review)}
        protected[str(review)]=digest(review)
        c={**old,'installed':False,'passed':False,'run_id':run,'build_pid':os.getpid(),'new_map':False,'protected':protected,'scene_update':update}
        c['packages']=base.packages()
        c['artifacts']={n:digest(p) for n,p in paths_for(target,bundle,c['packages']).items()}
        assert all(c['artifacts'].values())
        base.write(out/'candidate.json',c)
        base.inspect(c);base.check_candidate(c,bundle)
        c['passed']=True;base.write(out/'candidate.json',c)
        state.update(phase='staged',run_id=run);base.write(FIX/'maintenance.json',state)
        print('TRADING_SCENE_STAGED '+run)
    except:
        tx.rollback()
        # Restore only our recorded source and metadata; preserve unknown drift.
        assert digest(review)==state['expected_review']
        atomic_bytes(review,(archive/'review.umap').read_bytes())
        for name in ['candidate.json','audit.json','runtime.json','transaction.json','installation.json']:
            original=archive/'install'/name
            assert original.is_file()
            atomic_bytes(out/name,original.read_bytes())
        check_workflow_native(target,bundle)
        state['phase']='rolled_back';base.write(FIX/'maintenance.json',state)
        raise
