"""Fixed explicit workflow entry; no URI registration or free launch arguments."""
from pathlib import Path
import hashlib,json,sys
sys.dont_write_bytecode=True
_EXPECTED = {}

def verify():
    root=Path(__file__).absolute().parent
    if not _EXPECTED or set(p.name for p in root.iterdir())!=set(_EXPECTED)|{Path(__file__).name}:raise ValueError('Workflow bundle incomplete')
    for p in (root,*root.parents,*root.iterdir()):
        if p.is_symlink() or (hasattr(p,'is_junction') and p.is_junction()):raise ValueError('Redirected workflow bundle')
    if any(not (root/n).is_file() or hashlib.sha256((root/n).read_bytes()).hexdigest()!=h for n,h in _EXPECTED.items()):raise ValueError('Workflow bundle changed')
    records={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in root.iterdir()}
    if hashlib.sha256(json.dumps(records,sort_keys=True).encode('ascii')).hexdigest()!=root.name:raise ValueError('Workflow entry changed')
    return root

def main(args):
    try:
        if args!=['--workflow-visit']:raise ValueError('Only the fixed workflow action is supported')
        root=verify();sys.path.insert(0,str(root))
        from office_workflow_visit import main as visit
        return visit(args)
    except Exception:
        print('Workflowversionen av Office kunde inte verifieras. Ingen anslutning startad.');return 1

if __name__=='__main__':raise SystemExit(main(sys.argv[1:]))
