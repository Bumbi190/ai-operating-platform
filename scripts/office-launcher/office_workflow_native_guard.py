"""Read-only local installation integrity gate, not remote attestation.
A preview/test-only JSON bridge is deliberately not a canonical installation.
No installation receipt is created by this module or the workflow visit CLI.
"""
import re
import json
from pathlib import Path
from office_install_guard import canonical, digest
from office_launcher import OFFICE_MAP

FOLDER = 'Saved/OfficeWorkflowInstall'
ASSET = '/Game/OmniraGameplayV83/PrivateWorkflow/BP_OfficeWorkflowPresence'
SOURCES = ('office_workflow_visit.py','office_workflow_native_guard.py','office_workflow.py',
           'office_workflow_state.py','office_visit_relay.py','office_visit_client.py',
           'office_visit_process.py','office_launcher.py','office_install_guard.py',
           'office_presence.py','office_relay.py','office_activity.py')
CHECKS = ('fresh_native_tick','busy_returns_home','idle_permits_leisure','pause_expiry_holds',
          'wrong_binding_holds','wrong_scope_holds','legacy_presence_compatible')

def _no_redirects(path):
    if any(p.is_symlink() or (hasattr(p,'is_junction') and p.is_junction()) for p in (path,*path.parents)):
        raise ValueError('Redirected workflow installation')

def check_workflow_native(target, source):
    target.verify()
    root=target.project.parent;folder=root/FOLDER
    for path in (folder,folder/'installation.json',folder/'audit.json',folder/'runtime.json',folder/'transaction.json'):_no_redirects(path)
    receipt=json.loads((folder/'installation.json').read_text('utf-8'))
    if (receipt.get('scope')!='canonical_saved_workflow_v1' or receipt.get('installed') is not True
            or receipt.get('passed') is not True or type(receipt.get('workflow_protocol')) is not int
            or receipt.get('workflow_protocol')!=1 or receipt.get('map')!=OFFICE_MAP
            or receipt.get('asset')!=ASSET
            or canonical(receipt.get('projection_directory',''))!=canonical(root/'Saved/OfficePresence')):
        raise ValueError('Canonical workflow receiver unavailable')
    paths={'project':target.project,'map':root/('Content'+OFFICE_MAP[5:]+'.umap'),
           'asset':root/('Content'+ASSET[5:]+'.uasset')}
    paths.update({'source:'+n:Path(source)/n for n in SOURCES})
    packages=receipt.get('packages')
    if (not isinstance(packages,list) or not 1<=len(packages)<=256
            or any(not isinstance(p,str) or not re.fullmatch(r'/(Game|Engine)/(?:[A-Za-z0-9_]+/)*[A-Za-z0-9_]+',p) for p in packages)
            or len(set(packages))!=len(packages) or ASSET not in packages):
        raise ValueError('Workflow dependency closure missing')
    for package in packages:
        base=root/'Content' if package.startswith('/Game/') else target.engine.parents[2]/'Content'
        paths['dependency:'+package]=base/(package.split('/',2)[2]+'.uasset')
    for name,path in list(paths.items()):
        if name in ('map','asset') or name.startswith('dependency:'):
            for suffix in ('.uexp','.ubulk'):
                if path.with_suffix(suffix).exists():paths[name+suffix]=path.with_suffix(suffix)
    if not isinstance(receipt.get('artifacts'),dict) or set(receipt['artifacts'])!=set(paths):
        raise ValueError('Incomplete workflow installation')
    for name,path in paths.items():
        # Do not follow a redirected source/artifact into an unreviewed directory.
        _no_redirects(path)
        if (not path.is_file() or not isinstance(receipt['artifacts'][name],str) or not re.fullmatch(r'[0-9a-f]{64}',receipt['artifacts'][name]) or digest(path)!=receipt['artifacts'][name]):raise ValueError('Workflow installation changed')
    audit=json.loads((folder/'audit.json').read_text('utf-8'))
    runtime=json.loads((folder/'runtime.json').read_text('utf-8'))
    if (digest(folder/'audit.json')!=receipt.get('audit_sha256')
            or digest(folder/'runtime.json')!=receipt.get('runtime_sha256')):
        raise ValueError('Workflow proof changed')
    for proof in (audit,runtime):
        if proof.get('scope')!='canonical_saved_workflow_v1' or proof.get('passed') is not True:
            raise ValueError('Workflow acceptance missing')
        if proof.get('packages')!=packages or proof.get('artifacts')!=receipt['artifacts']:raise ValueError('Workflow acceptance differs')
    if audit.get('dependency_closure_verified') is not True:raise ValueError('Workflow dependency audit missing')
    if any(runtime.get(name) is not True for name in CHECKS):raise ValueError('Workflow runtime acceptance incomplete')
    pids=[receipt.get('finalizer_pid'),audit.get('pid'),runtime.get('pid')]
    if any(type(pid) is not int or pid<=0 for pid in pids) or len(set(pids))!=3:
        raise ValueError('Separate workflow verification missing')
    # Future installer must commit the exact accepted files, preserving map backup.
    from office_install_guard import OwnedInstallTransaction
    state=json.loads((folder/'transaction.json').read_text('utf-8'))
    expected={canonical(p) for name,p in paths.items() if not name.startswith(('source:','dependency:'))}
    expected.add(canonical(folder/'installation.json'))
    records=state.get('records',{})
    if (state.get('schema')!=OwnedInstallTransaction.SCHEMA or state.get('status')!='committed'
            or not isinstance(records,dict) or set(records)!=expected or not isinstance(state.get('order'),list)
            or len(state['order'])!=len(expected) or set(state['order'])!=expected):
        raise ValueError('Workflow installation not committed')
    map_path=canonical(paths['map'])
    if not records[map_path].get('before'):raise ValueError('Original map backup missing')
    for path,record in records.items():
        if not isinstance(record,dict):raise ValueError('Invalid workflow transaction')
        if digest(path)!=record.get('observed_after'):raise ValueError('Committed workflow file changed')
        backup=record.get('backup')
        if record.get('before') is not None:
            if backup is not None:_no_redirects(Path(backup))
            if (backup is None or canonical(Path(backup).parent)!=canonical(folder)
                    or digest(backup)!=record['before']):raise ValueError('Workflow rollback backup missing')
    return root/'Saved/OfficePresence'
