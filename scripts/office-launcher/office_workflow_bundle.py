"""Immutable local workflow bundle. Preparing it never changes URI registration."""
from pathlib import Path
import ast,hashlib,json,os,shutil,tempfile

MODULES=('office_launcher.py','office_install_guard.py','office_pairing.py','office_presence.py',
         'office_relay.py','office_visit_client.py','office_visit_process.py','office_visit_relay.py',
         'office_activity.py','office_workflow.py','office_workflow_state.py','office_workflow_ack.py',
         'office_workflow_native_guard.py','office_workflow_target.py','office_workflow_visit.py',
         'office_workflow_bundle.py')
ENTRY='office_workflow_entry.py'

def plain(path):
    path=Path(path)
    return not any(p.is_symlink() or (hasattr(p,'is_junction') and p.is_junction()) for p in (path,*path.parents))

def identity(payloads):
    hashes={n:hashlib.sha256(v).hexdigest() for n,v in payloads.items()}
    return hashlib.sha256(json.dumps(hashes,sort_keys=True).encode('ascii')).hexdigest()

def payloads(source):
    source=Path(source);names=(*MODULES,ENTRY)
    if not plain(source) or any(not plain(source/n) or not (source/n).is_file() for n in names):raise ValueError('Workflow source missing or redirected')
    files={n:(source/n).read_bytes() for n in names};marker=b'_EXPECTED = {}'
    if files[ENTRY].count(marker)!=1:raise ValueError('Workflow entry template differs')
    hashes={n:hashlib.sha256(files[n]).hexdigest() for n in MODULES}
    files[ENTRY]=files[ENTRY].replace(marker,b'_EXPECTED = '+json.dumps(hashes,sort_keys=True).encode('ascii'),1)
    return files

def verify_bundle(folder):
    folder=Path(folder)
    if not plain(folder) or not folder.is_dir() or set(p.name for p in folder.iterdir())!=set(MODULES)|{ENTRY}:raise ValueError('Workflow bundle content differs')
    files={p.name:p.read_bytes() for p in folder.iterdir() if p.is_file() and plain(p)}
    if set(files)!=set(MODULES)|{ENTRY} or identity(files)!=folder.name:raise ValueError('Workflow immutable bundle changed')
    tree=ast.parse(files[ENTRY]);node=next(n for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='_EXPECTED' for t in n.targets))
    if ast.literal_eval(node.value)!={n:hashlib.sha256(files[n]).hexdigest() for n in MODULES}:raise ValueError('Workflow bootstrap hashes differ')
    return folder

def prepare(source,destination):
    files=payloads(source);destination=Path(destination)
    if not plain(destination):raise ValueError('Redirected workflow bundle destination')
    folder=destination/identity(files)
    if folder.exists():
        verify_bundle(folder)
        if any((folder/n).read_bytes()!=v for n,v in files.items()):raise ValueError('Existing workflow bundle differs')
        return folder
    destination.mkdir(parents=True,exist_ok=True);staging=Path(tempfile.mkdtemp(prefix='.workflow-prepare-',dir=destination))
    try:
        for n,v in files.items():(staging/n).write_bytes(v)
        os.rename(staging,folder);verify_bundle(folder);return folder
    finally:
        if staging.exists():shutil.rmtree(staging)
