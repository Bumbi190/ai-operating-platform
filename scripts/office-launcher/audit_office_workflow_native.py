"""Read-only saved-preview audit for the interactive editor.

LevelEditorSubsystem.load_level is not commandlet-safe in UE 5.8.4. Use
audit_office_workflow_cold_asset.py for the separate-process asset/default audit.
"""
from pathlib import Path
import hashlib,json,os
import unreal as u
from build_office_workflow_native import sig,ASSET,MAP,AVATAR

def audit(root,output,*,independent=False):
    root,output=Path(root),Path(output);meta=json.loads((output/'native-candidate.json').read_text())
    lvl=u.get_editor_subsystem(u.LevelEditorSubsystem);sub=u.get_editor_subsystem(u.EditorActorSubsystem)
    assert not lvl.is_in_play_in_editor();assert lvl.load_level(MAP)
    sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
    assert all(sha(p)==h for p,h in meta['protected'].items())
    assert sha(root/'Content'/Path(MAP.removeprefix('/Game/')).with_suffix('.umap'))==meta['map_sha256']
    assert sha(root/'Content'/Path(ASSET.removeprefix('/Game/')).with_suffix('.uasset'))==meta['asset_sha256']
    actors={a.get_name():a for a in sub.get_all_level_actors()}
    assert len(actors)==len(meta['original_signatures'])+1
    assert all(sig(actors[n])==v for n,v in meta['original_signatures'].items())
    assert not any(a.get_actor_label().startswith('TEMP ') for a in actors.values())
    consumer=actors[meta['consumer']];target=actors[meta['target']]
    assert consumer.get_editor_property('Target')==target
    assert not consumer.get_editor_property('Enabled') and not consumer.get_editor_property('HasBinding') and not consumer.get_editor_property('HasTarget') and not consumer.get_editor_property('SessionClosed')
    assert all(consumer.get_editor_property(k)=='' for k in ('PinnedVisit','PinnedAvatar','PinnedProject','PinnedAgent','PinnedPath'))
    assert consumer.get_editor_property('FilePath')==str(root/'Saved/OfficePresence'/(AVATAR+'.json'))
    bridges=[a for a in actors.values() if a.get_actor_label().startswith('Workflow candidate |')]
    assert len(bridges)==3 and all(not a.get_editor_property('Enabled') and not a.get_editor_property('HasBound') for a in bridges)
    registry=u.AssetRegistryHelpers.get_asset_registry();options=u.AssetRegistryDependencyOptions(include_soft_package_references=True,include_hard_package_references=True)
    seen=set();todo=[ASSET];dependencies={};missing=[]
    while todo:
        package=todo.pop()
        if package in seen:continue
        seen.add(package);assert len(seen)<2048
        if not package.startswith(('/Game/','/Engine/')):continue
        content=root/'Content' if package.startswith('/Game/') else Path(r'C:\Program Files\Epic Games\UE_5.8\Engine\Content')
        path=content/(package.split('/',2)[2]+'.uasset')
        if path.is_file():
            dependencies[package]={'path':str(path),'sha256':sha(path)}
            for suffix in ('.uexp','.ubulk'):
                if path.with_suffix(suffix).is_file():dependencies[package+suffix]={'path':str(path.with_suffix(suffix)),'sha256':sha(path.with_suffix(suffix))}
        else:missing.append(package)
        todo.extend(str(p) for p in registry.get_dependencies(package,options))
    result={'scope':'isolated_saved_workflow_audit_v1','passed':True,'pid':os.getpid(),'independent_process_requested':independent,
            'map':MAP,'asset':ASSET,'map_sha256':meta['map_sha256'],'asset_sha256':meta['asset_sha256'],
            'disabled_default':True,'no_saved_binding':True,'native_target':target.get_name(),'actor_count':len(actors),
            'protected_count':len(meta['protected']),'preserved_actor_count':len(meta['original_signatures']),
            'old_test_bridges_off':True,'consumer_dependencies':dependencies,'missing_dependency_packages':missing}
    (output/('independent-audit.json' if independent else 'audit.json')).write_text(json.dumps(result,indent=2))
    print('WORKFLOW_NATIVE_SAVED_AUDIT_PASS '+str(os.getpid()))
    return result
