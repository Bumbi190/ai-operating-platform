import io,json,os,secrets,hashlib,subprocess,sys,uuid,zipfile
from pathlib import Path
from datetime import datetime,timezone
root=Path(r"C:\Users\Andre\Projects\Omnira\.worktrees\atlas-harvey-sales-20261017")
ws=root/".superpowers/sdd/2026-10-17-atlas-harvey-sales-pilot"
sys.path.insert(0,str(root))
from workers.sales.credential_store import CredentialStore,connection_key
from workers.sales.claude_runtime import doctor
origin="https://ai-operating-platform-lamh7iolj-bumbi190s-projects.vercel.app"
project="8f673c09-1c8f-4d78-876e-4c14bf1c89b3"
sha="a446887d7d04cd242e4bb4839d087d4c89eeecbe"
readiness=doctor()
assert readiness.get("ready"),"CLAUDE_NOT_READY"
install=Path(os.environ["LOCALAPPDATA"])/"OmniraSales/pilots/handlarborsen-a446887"
receipt=install/"host.json"
if receipt.exists():raise SystemExit("EXISTING_INSTALL_REFUSED")
archive=subprocess.run(["git","archive","--format=zip",sha,"workers/sales"],cwd=root,stdout=subprocess.PIPE,check=True).stdout
if install.exists() and not any(install.iterdir()):install.rmdir()
install.mkdir(parents=True,exist_ok=False)
with zipfile.ZipFile(io.BytesIO(archive)) as z:
    for info in z.infolist():
        if info.is_dir():continue
        path=Path(info.filename)
        assert not path.is_absolute() and ".." not in path.parts and path.parts[:2]==("workers","sales")
        if not info.is_dir():
            target=install/path;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(info))
token=secrets.token_urlsafe(32)
worker=str(uuid.uuid4())
store=CredentialStore();store.write(connection_key(origin,project),token)
assert store.read(connection_key(origin,project))==token
v=json.loads((ws/"vercel-client.json").read_text(encoding="utf-8"))
record={"origin":origin,"projectId":project,"workerId":worker,"tokenHash":hashlib.sha256(token.encode()).hexdigest(),"sourceSha":sha,"node":v["node"],"vercelCli":v["cli"],"preparedAt":datetime.now(timezone.utc).isoformat(),"mode":"protected-preview-pilot","sendingEnabled":False,"status":"prepared"}
receipt.write_bytes((json.dumps(record,indent=2)+"\n").encode())
link=install/".vercel/project.json";link.parent.mkdir()
link.write_bytes(json.dumps({"projectId":"prj_ZwTfAGuJBW8iCjfSzBqx0Jwjz03T","orgId":"team_NlGVrs9ZItxkK4nMgRblBCI4","projectName":"ai-operating-platform-web"}).encode())
connections=Path(os.environ["LOCALAPPDATA"])/"OmniraSales/connections";connections.mkdir(parents=True,exist_ok=True)
cfg=connections/(project+".json")
assert not cfg.exists(),"EXISTING_CONNECTION_REFUSED"
cfg.write_bytes(json.dumps({"origin":origin,"projectId":project,"workerId":worker}).encode())
print(json.dumps({"workerId":worker,"tokenHash":record["tokenHash"],"projectId":project,"install":str(install),"status":"prepared","credentialStored":True,"cliReady":True,"sendingEnabled":False}))
