"""Commandlet-safe cold asset/default audit. Does not load an editor level."""
from pathlib import Path
import hashlib,json,os
import unreal as u

root=Path(r'C:\Users\Andre\Projects\Omnira\Design\Agent-Campus-3D\UnrealPilot\Omnira_Office_CastQA_v83')
output=Path(r'C:\Users\Andre\Projects\Omnira\Temp\unreal-office-workflow-consumer-20261118')
meta=json.loads((output/'native-candidate.json').read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert all(sha(p)==h for p,h in meta['protected'].items())
assert sha(root/'Content'/Path(meta['map'].removeprefix('/Game/')).with_suffix('.umap'))==meta['map_sha256']
assert sha(root/'Content'/Path(meta['asset'].removeprefix('/Game/')).with_suffix('.uasset'))==meta['asset_sha256']
bp=u.load_asset(meta['asset']);assert bp and bp.generated_class()
cdo=u.get_default_object(bp.generated_class())
assert not cdo.get_editor_property('Enabled') and not cdo.get_editor_property('HasBinding') and not cdo.get_editor_property('HasTarget') and not cdo.get_editor_property('SessionClosed')
assert all(cdo.get_editor_property(n)=='' for n in ('PinnedVisit','PinnedAvatar','PinnedProject','PinnedAgent','PinnedPath'))
assert cdo.get_editor_property('FilePath')==str(root/'Saved/OfficePresence/office-familje-pling.json')
r={'scope':'isolated_workflow_cold_asset_audit_v1','passed':True,'pid':os.getpid(),'world_loaded':False,'asset_loaded':True,'disabled_default':True,'blank_binding':True,'map_sha256':meta['map_sha256'],'asset_sha256':meta['asset_sha256'],'protected_count':len(meta['protected'])}
(output/'cold-asset-audit.json').write_text(json.dumps(r,indent=2))
print('WORKFLOW_COLD_ASSET_AUDIT_PASS '+str(os.getpid()))
