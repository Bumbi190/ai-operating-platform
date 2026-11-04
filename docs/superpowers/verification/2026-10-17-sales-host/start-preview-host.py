import json,os,subprocess,sys
from pathlib import Path
root=Path(os.environ["LOCALAPPDATA"])/"OmniraSales/pilots/handlarborsen-a446887"
health=json.loads((root/"health.json").read_text())
assert health["status"]=="connected"
log=(root/"host.log").open("ab",buffering=0)
p=subprocess.Popen([sys.executable,str(root/"preview_host.py")],cwd=root,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.DEVNULL,close_fds=True,creationflags=subprocess.DETACHED_PROCESS|subprocess.CREATE_NO_WINDOW)
log.close()
(root/"process.json").write_bytes(json.dumps({"pid":p.pid,"python":sys.executable,"entrypoint":str(root/"preview_host.py"),"mode":"preview-only-23-hour-pilot","sendingEnabled":False}).encode())
print(json.dumps({"pid":p.pid,"started":True,"sendingEnabled":False}))
