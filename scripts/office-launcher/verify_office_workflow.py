"""Focused local verification, capturing real exit codes without shell pipelines.
Requires existing Node/TypeScript and cached postgres:17-alpine; never installs packages.
Use --node-path to borrow existing dependencies and --receiver for the native pure
receiver integration. Neither option edits those source/dependency directories. Includes browser, relay,
legacy/activity/workflow transport, SQL and scoped strict TypeScript regression.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--node-path')
    p.add_argument('--receiver',type=Path)
    p.add_argument('--output',type=Path,required=True)
    args=p.parse_args()
    env=os.environ.copy()
    env['PYTHONPATH']=str(ROOT/'scripts/office-launcher')
    if args.node_path: env['NODE_PATH']=args.node_path
    if args.receiver: env['OFFICE_WORKFLOW_RECEIVER']=str(args.receiver.resolve())
    else: env.pop('OFFICE_WORKFLOW_RECEIVER',None)
    output=args.output.resolve();output.mkdir(parents=True,exist_ok=True)
    tests=sorted(str(f.relative_to(ROOT)) for f in (ROOT/'scripts/office-launcher').glob('test_office*.cjs'))
    commands=[('office_node',['node','--test',*tests]),
              ('office_companion',[sys.executable,'-m','unittest','test_office_workflow_visit','test_office_workflow_ack','test_office_workflow_native_guard','test_office_workflow_client','test_office_visit','test_office_visit_client','test_office_activity_relay','test_office_entry']),
              ('office_workflow_transport',['node','scripts/office-launcher/test_office_workflow_transport.mjs']),
              ('office_legacy_transport',['node','scripts/office-launcher/test_office_visit_transport.mjs']),
              ('office_activity_transport',['node','scripts/office-launcher/test_office_activity_transport.mjs']),
              ('office_sql',[sys.executable,'-m','unittest','scripts/office-launcher/test_office_workflow_sql.py','scripts/office-launcher/test_office_activity_sql.py','scripts/office-launcher/test_office_visit_sql.py']),
              ('office_strict_types',['node','scripts/office-launcher/check_office_workflow_types.cjs'])]
    receipt={'checked_at':datetime.now(timezone.utc).isoformat(),'native_pure_receiver_requested':bool(args.receiver),'checks':[]}
    for name,command in commands:
        started=time.monotonic()
        r=subprocess.run(command,cwd=ROOT,env=env,text=True,capture_output=True,timeout=180)
        (output/(name+'.txt')).write_text(r.stdout+r.stderr,encoding='utf-8')
        item={'check':name,'exit_code':r.returncode,'seconds':round(time.monotonic()-started,3),'log':name+'.txt'}
        receipt['checks'].append(item);print(json.dumps(item),flush=True)
        if r.returncode: print((r.stdout+r.stderr)[-5000:],flush=True)
    receipt['passed']=all(c['exit_code']==0 for c in receipt['checks'])
    (output/'verification.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
    return 0 if receipt['passed'] else 1
if __name__=='__main__':sys.exit(main())
