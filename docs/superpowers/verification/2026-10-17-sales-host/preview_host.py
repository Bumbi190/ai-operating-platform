"""Owned-host adapter for the protected PR386 preview; not a production transport.
Uses the already authenticated Vercel CLI. Sales bearer stays in Credential Manager
and curl stdin, never command arguments, chat, repository configuration or logs.
"""
import json,os,subprocess,sys,time
from pathlib import Path
from datetime import datetime,timedelta,timezone
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT))
from workers.sales.credential_store import CredentialStore,connection_key
from workers.sales.claude_runtime import SafeClaudeTextRuntime
from workers.sales.harvey_adapter import HarveyDraftAdapter
from workers.sales.worker import run_once
from workers.sales.protocol import ProtocolError
CONFIG=json.loads((ROOT/"host.json").read_text(encoding="utf-8"))
ORIGIN="https://ai-operating-platform-lamh7iolj-bumbi190s-projects.vercel.app"
assert CONFIG["origin"]==ORIGIN and CONFIG["projectId"]=="8f673c09-1c8f-4d78-876e-4c14bf1c89b3"
class PreviewClient:
    def __init__(self):
        self.token=CredentialStore().read(connection_key(ORIGIN,CONFIG["projectId"]))
    def post(self,operation,**values):
        body=json.dumps({"operation":operation,**values},ensure_ascii=False)
        if len(body.encode())>65536:raise ProtocolError("REQUEST_TOO_LARGE")
        curl="\n".join(['request = "POST"','header = "Content-Type: application/json"',
            "header = "+json.dumps("Authorization: Bearer "+self.token),
            "data-binary = "+json.dumps(body,ensure_ascii=False),
            'proxy = ""','max-time = 20','max-redirs = 0','proto = "=https"','silent','show-error'])+"\n"
        cmd=[CONFIG["node"],CONFIG["vercelCli"],"curl","/api/sales/worker","--deployment",ORIGIN,
             "--scope","bumbi190s-projects","--","--config","-"]
        try:
            p=subprocess.run(cmd,cwd=ROOT,input=curl.encode(),stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,timeout=40)
            if p.returncode or len(p.stdout)>131072:raise ProtocolError("PREVIEW_TRANSPORT_FAILED")
            result=json.loads(p.stdout.decode("utf-8"))
            if not isinstance(result,dict) or "code" in result:raise ProtocolError("PREVIEW_REQUEST_REFUSED")
            return result
        except Exception:raise ProtocolError("PREVIEW_REQUEST_FAILED") from None
def state(status,**details):
    result={"status":status,"projectId":CONFIG["projectId"],"workerId":CONFIG["workerId"],
        "pid":os.getpid(),"observedAt":datetime.now(timezone.utc).isoformat(),"sendingEnabled":False,**details}
    temp=ROOT/"health.tmp";temp.write_bytes(json.dumps(result).encode());temp.replace(ROOT/"health.json")
    print(json.dumps(result),flush=True)
def main():
    runtime=SafeClaudeTextRuntime()
    if not runtime.readiness.get("ready"):state("blocked",reason="CLAUDE_NOT_READY");return 1
    client=PreviewClient();adapter=HarveyDraftAdapter(runtime)
    deadline=datetime.fromisoformat(CONFIG["preparedAt"])+timedelta(hours=23)
    failures=0
    state("starting")
    while datetime.now(timezone.utc)<deadline:
        if (ROOT/"STOP").exists():state("stopped");return 0
        try:
            worked=run_once(client,adapter);failures=0
            state("connected",worked=worked)
            if "--once" in sys.argv:return 0
        except ProtocolError:
            failures+=1;state("unavailable",failures=failures)
            if failures>=3:return 1
        time.sleep(15)
    state("expired");return 0
if __name__=="__main__":
    try:sys.exit(main())
    except KeyboardInterrupt:state("stopped");sys.exit(130)
    except Exception:state("blocked",reason="LOCAL_HOST_FAILURE");sys.exit(1)
