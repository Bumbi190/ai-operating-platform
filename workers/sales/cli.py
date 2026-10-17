"""Local setup. Secret entry stays in this terminal, never in arguments or JSON."""
import argparse
import getpass
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path
from .claude_runtime import doctor,SafeClaudeTextRuntime
from .credential_store import CredentialStore,connection_key
from .protocol import SalesProtocolClient
from .harvey_adapter import HarveyDraftAdapter
from .worker import run_once
def main(argv=None):
    parser=argparse.ArgumentParser(description='Atlas sales drafting worker; sending disabled')
    sub=parser.add_subparsers(dest='command',required=True)
    sub.add_parser('doctor')
    connect=sub.add_parser('connect');connect.add_argument('--origin',required=True);connect.add_argument('--project',required=True);connect.add_argument('--worker',required=True)
    run=sub.add_parser('run');run.add_argument('--project',required=True);run.add_argument('--once',action='store_true');run.add_argument('--model',default='')
    args=parser.parse_args(argv)
    if args.command=='doctor':print(json.dumps(doctor()));return 0
    project=str(uuid.UUID(args.project))
    base=Path(os.environ.get('LOCALAPPDATA',str(Path.home()/'.local/share')))/'OmniraSales/connections'
    config_path=base/(project+'.json')
    if args.command=='connect':
        worker=str(uuid.UUID(args.worker));token=getpass.getpass('Worker token (stored in Windows Credential Manager): ')
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}',token):raise ValueError('INVALID_TOKEN')
        SalesProtocolClient(args.origin,token)  # validates origin without claiming or running a job
        CredentialStore().write(connection_key(args.origin,project),token)
        base.mkdir(parents=True,exist_ok=True);config_path.write_text(json.dumps({'origin':args.origin,'projectId':project,'workerId':worker}),encoding='utf-8')
        print('Connection saved. No job or model call has started.');return 0
    config=json.loads(config_path.read_text(encoding='utf-8'))
    if config.get('projectId')!=project:raise ValueError('PROJECT_MISMATCH')
    runtime=SafeClaudeTextRuntime(args.model)
    if not runtime.readiness.get('ready'):print(json.dumps(runtime.readiness));return 1
    client=SalesProtocolClient(config['origin'],CredentialStore().read(connection_key(config['origin'],project)))
    adapter=HarveyDraftAdapter(runtime)
    while True:
        worked=run_once(client,adapter)
        print(json.dumps({'worked':worked,'sendingEnabled':False}))
        if args.once:return 0 if worked else 1
        time.sleep(15)
if __name__=='__main__':
    try:sys.exit(main())
    except KeyboardInterrupt:sys.exit(130)
    except Exception:print('{"ready":false,"reason":"LOCAL_SETUP_OR_CONNECTION_FAILED"}');sys.exit(1)
