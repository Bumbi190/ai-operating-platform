"""Exact saved workflow installation gate. Preview proofs cannot enable visits."""
import re,json
from pathlib import Path
from office_install_guard import canonical,digest,OwnedInstallTransaction
from office_workflow_target import WORKFLOW_MAP as OFFICE_MAP,REVIEW_MAP
from office_workflow_bundle import MODULES,ENTRY

FOLDER='Saved/OfficeWorkflowInstall'
ASSET='/Game/OmniraGameplayV83/PrivateWorkflow/BP_OfficeWorkflowPresence'
SOURCES=(*MODULES,ENTRY)
CHECKS=('fresh_native_tick','busy_returns_home','idle_permits_leisure','pause_expiry_holds',
        'wrong_binding_holds','wrong_scope_holds','legacy_presence_compatible',
        'native_prepared_ack','native_applied_ack','missing_native_ack_holds','same_process_rebind_refused')
PLUGIN_CONTENT={'InterchangeAssets':'Plugins/Interchange/Assets/Content','ACLPlugin':'Plugins/Animation/ACLPlugin/Content'}

def _no_redirects(path):
    path=Path(path)
    if any(p.is_symlink() or (hasattr(p,'is_junction') and p.is_junction()) for p in (path,*path.parents)):raise ValueError('Redirected workflow installation')

def paths_for(target,source,packages):
    root=target.project.parent
    if (not isinstance(packages,list) or not 1<=len(packages)<=256 or ASSET not in packages
            or len(set(packages))!=len(packages)
            or any(not isinstance(p,str) or not re.fullmatch(r'/(Game|Engine|InterchangeAssets|ACLPlugin)/(?:[A-Za-z0-9_]+/)*[A-Za-z0-9_]+',p) for p in packages)):raise ValueError('Workflow dependency closure missing')
    paths={'project':target.project,'map':root/('Content'+OFFICE_MAP[5:]+'.umap'),
           'asset':root/('Content'+ASSET[5:]+'.uasset'),
           'source:review_map':root/('Content'+REVIEW_MAP[5:]+'.umap')}
    paths.update({'source:'+n:Path(source)/n for n in SOURCES})
    for package in packages:
        mount=package.split('/',2)[1]
        base=root/'Content' if mount=='Game' else target.engine.parents[2]/('Content' if mount=='Engine' else PLUGIN_CONTENT[mount])
        paths['dependency:'+package]=base/(package.split('/',2)[2]+'.uasset')
    for name,path in list(paths.items()):
        if name in ('map','asset','source:review_map') or name.startswith('dependency:'):
            for suffix in ('.uexp','.ubulk'):
                if path.with_suffix(suffix).exists():paths[name+suffix]=path.with_suffix(suffix)
    return paths

def check_workflow_native(target,source):
    target.verify();root=target.project.parent;folder=root/FOLDER;source=Path(source)
    for path in (folder,folder/'installation.json',folder/'audit.json',folder/'runtime.json',folder/'transaction.json'):_no_redirects(path)
    receipt=json.loads((folder/'installation.json').read_text('utf-8'))
    if (receipt.get('scope')!='canonical_saved_workflow_v1' or receipt.get('installed') is not True
            or receipt.get('passed') is not True or type(receipt.get('workflow_protocol')) is not int or receipt['workflow_protocol']!=1
            or receipt.get('map')!=OFFICE_MAP or receipt.get('asset')!=ASSET or receipt.get('copy_source')!=REVIEW_MAP
            or receipt.get('bundle_id')!=source.name or not re.fullmatch('[0-9a-f]{64}',source.name)
            or canonical(receipt.get('projection_directory',''))!=canonical(root/'Saved/OfficePresence')):raise ValueError('Canonical workflow receiver unavailable')
    paths=paths_for(target,source,receipt.get('packages'))
    if not isinstance(receipt.get('artifacts'),dict) or set(receipt['artifacts'])!=set(paths):raise ValueError('Incomplete workflow installation')
    for name,path in paths.items():
        _no_redirects(path)
        if not path.is_file() or not isinstance(receipt['artifacts'][name],str) or not re.fullmatch('[0-9a-f]{64}',receipt['artifacts'][name]) or digest(path)!=receipt['artifacts'][name]:raise ValueError('Workflow installation changed')
    audit=json.loads((folder/'audit.json').read_text('utf-8'));runtime=json.loads((folder/'runtime.json').read_text('utf-8'))
    if digest(folder/'audit.json')!=receipt.get('audit_sha256') or digest(folder/'runtime.json')!=receipt.get('runtime_sha256'):raise ValueError('Workflow proof changed')
    for proof in (audit,runtime):
        if proof.get('scope')!='canonical_saved_workflow_v1' or proof.get('passed') is not True or proof.get('cleanup_errors'):raise ValueError('Workflow acceptance missing')
        if proof.get('packages')!=receipt['packages'] or proof.get('artifacts')!=receipt['artifacts'] or proof.get('run_id')!=receipt.get('run_id') or not proof.get('run_id'):raise ValueError('Workflow acceptance differs')
    if audit.get('dependency_closure_verified') is not True or audit.get('enabled_saved_target') is not True:raise ValueError('Workflow dependency or saved binding audit missing')
    if any(runtime.get(name) is not True for name in CHECKS):raise ValueError('Workflow runtime acceptance incomplete')
    pids=[receipt.get('finalizer_pid'),audit.get('pid'),runtime.get('pid')]
    if any(type(pid) is not int or pid<=0 for pid in pids) or len(set(pids))!=3:raise ValueError('Separate workflow verification missing')
    state=json.loads((folder/'transaction.json').read_text('utf-8'))
    expected={canonical(p) for name,p in paths.items() if not name.startswith(('source:','dependency:'))};expected.add(canonical(folder/'installation.json'))
    records=state.get('records',{})
    if state.get('schema')!=OwnedInstallTransaction.SCHEMA or state.get('status')!='committed' or not isinstance(records,dict) or set(records)!=expected or not isinstance(state.get('order'),list) or len(state['order'])!=len(expected) or set(state['order'])!=expected:raise ValueError('Workflow installation not committed')
    map_record=records[canonical(paths['map'])]
    # New dedicated map rolls back by removal; an existing map needs a backup.
    # The established Office map is never owned by this transaction.
    if map_record.get('before') is None and (receipt.get('new_map') is not True or map_record.get('backup') is not None):raise ValueError('Original map backup or new-map provenance missing')
    for path,record in records.items():
        if not isinstance(record,dict) or digest(path)!=record.get('observed_after'):raise ValueError('Committed workflow file changed')
        backup=record.get('backup')
        if record.get('before') is not None:
            if backup is not None:_no_redirects(backup)
            if backup is None or canonical(Path(backup).parent)!=canonical(folder) or digest(backup)!=record['before']:raise ValueError('Workflow rollback backup missing')
    return root/'Saved/OfficePresence'
