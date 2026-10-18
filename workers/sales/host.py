"""Pinned, single-user worker lifecycle. Never resume an uncertain model dispatch."""
import hashlib,json,os,re,threading
from contextlib import contextmanager
from pathlib import Path,PurePosixPath
from .journal import Journal,SingleInstance
from .managed_connection import ManagedConnection
from .credential_store import CredentialStore,connection_key
from .claude_runtime import doctor,SafeClaudeTextRuntime
from .protocol import SalesProtocolClient
from .harvey_adapter import HarveyDraftAdapter
from .worker import run_once
class HostBlocked(Exception):pass
def safe_path(path):
 path=Path(path)
 for part in [path,*path.parents]:
  if part.is_symlink() or (hasattr(part,'is_junction') and part.is_junction()):raise HostBlocked('REPARSE_POINT_REFUSED')
 return path

def verify_launch_root(configured):
 if Path(configured).resolve()!=Path(__file__).resolve().parents[2]:raise HostBlocked('LAUNCH_ROOT_MISMATCH')

def verify_installation(root,manifest_hash):
 root=safe_path(Path(root).absolute());path=safe_path(root/'installation-manifest.json')
 if not re.fullmatch(r'[a-f0-9]{64}',manifest_hash):raise HostBlocked('INVALID_MANIFEST_PIN')
 raw=path.read_bytes()
 if len(raw)>262144 or hashlib.sha256(raw).hexdigest()!=manifest_hash:raise HostBlocked('MANIFEST_MISMATCH')
 manifest=json.loads(raw)
 if not re.fullmatch(r'[a-f0-9]{40}',manifest.get('sourceSha','')) or not isinstance(manifest.get('files'),dict) or not manifest['files']:raise HostBlocked('INVALID_MANIFEST')
 for name,digest in manifest['files'].items():
  relative=PurePosixPath(name)
  if relative.is_absolute() or '..' in relative.parts or '\\' in name or ':' in name or not re.fullmatch(r'[a-f0-9]{64}',digest):raise HostBlocked('INVALID_MANIFEST_PATH')
  item=safe_path(root/name)
  if not item.is_file() or hashlib.sha256(item.read_bytes()).hexdigest()!=digest:raise HostBlocked('SOURCE_MISMATCH')
 return manifest

def host_loop(connection,client_factory,adapter_factory,doctor_fn,dispatch_journal,stop,run_once_fn=run_once,wait_fn=None,verify_fn=lambda:None,mailbox_cycle=None,reply_cycle=None,reply_uncertain=lambda:False):
 wait_fn=wait_fn or stop.wait
 while not stop.is_set():
  try:
   verify_fn();token=connection.ensure_worker_token();status=connection.poll_status()
   readiness=doctor_fn();uncertain=bool((dispatch_journal.load() or {}).get('inFlight')) or reply_uncertain()
   ready=readiness.get('ready') is True and not uncertain
   connection.report_status('ready' if ready else 'blocked')
   if mailbox_cycle is not None:mailbox_cycle(connection)
   if reply_cycle is not None:reply_cycle(connection,ready and status.get('desiredState')=='running' and status.get('executionPaused') is False)
   if ready and not reply_uncertain() and status.get('desiredState')=='running' and status.get('executionPaused') is False:
    def mark_dispatch(ref,attempt_id):
     dispatch_journal.save({'inFlight':True,'phase':'model',**{k:ref[k] for k in ['projectId','workerId','jobId','claimId','generation']},'attemptId':attempt_id})
    run_once_fn(client_factory(token),adapter_factory(),before_dispatch=mark_dispatch)
    dispatch_journal.save({'inFlight':False})
  except Exception:
   # Fixed metadata only; no exception/payload/credential in logs.
   pass
  wait_fn(15)

@contextmanager
def inbox_background(cycle,stop):
 from .mailbox.inbox_sync import run_inbox_loop
 thread=threading.Thread(target=run_inbox_loop,args=(cycle,stop),name='sales-inbox',daemon=True)
 thread.start()
 try:yield thread
 finally:
  stop.set();thread.join(180)
  if thread.is_alive():raise HostBlocked('INBOX_SHUTDOWN_TIMEOUT')

def main(project):
 base=safe_path(Path(os.environ['LOCALAPPDATA'])/'OmniraSales'/'connections');config=json.loads(safe_path(base/(project+'.json')).read_text(encoding='utf-8'))
 if config.get('projectId')!=project:raise HostBlocked('PROJECT_MISMATCH')
 root=Path(config['installationRoot']);verify_launch_root(root);verify=lambda:verify_installation(root,config['manifestSha256'])
 verify()
 state=base/project;state.mkdir(parents=True,exist_ok=True);safe_path(state)
 if config.get('transport')=='vercel_preview':
  from .preview_transport import ProtectedPreviewClient
  factory=lambda origin,token,purpose:ProtectedPreviewClient(config,token,purpose)
 else:
  factory=lambda origin,token,purpose:SalesProtocolClient(origin,token,purpose)
 store=CredentialStore();connection=ManagedConnection(config,store,Journal(state/'connection.json'),factory)
 mailbox_cycle=None;inbox_cycle=None
 if config.get('mailboxEnabled') is True:
  from .mailbox.crypto import MailboxCrypto
  from .mailbox.setup import process_mailbox_setup
  crypto=MailboxCrypto(store,config.get('mailboxKeyRef') or connection_key(config['origin'],project)+'/strato-key',config['node']);mailbox_journal=Journal(state/'mailbox.json')
  from .mailbox.inbox_sync import sync_inbox_once
  def inbox_cycle():
   verify()
   return sync_inbox_once(connection.inbox_client(),store,mailbox_journal,Journal(state/'inbox.json'))
  def mailbox_cycle(current):
   client=current.mailbox_client()
   if not (mailbox_journal.load() or {}).get('pending'):
    public=crypto.public_key();status=current.poll_status();client.post('publish_key',generation=status['generation'],**public)
   process_mailbox_setup(client,crypto,store,mailbox_journal,diagnostic=lambda value:Journal(state/'mailbox-diagnostic.json').save(value))
 reply_journal=Journal(state/'reply-dispatch.json')
 reply_cycle=None
 if config.get('replyEnabled') is True:
  from .replies.worker import run_reply_once
  from .replies.adapter import HarveyReplyAdapter
  def reply_cycle(current,allowed):return run_reply_once(current.reply_client(),lambda:HarveyReplyAdapter(SafeClaudeTextRuntime('')),reply_journal,can_dispatch=allowed)
 def reply_uncertain():return bool((reply_journal.load() or {}).get('pending'))
 stop=threading.Event()
 with SingleInstance(state/'host.lock'):
  def run_host():
   host_loop(connection,lambda token:factory(config['origin'],token,'worker'),lambda:HarveyDraftAdapter(SafeClaudeTextRuntime('')),doctor,Journal(state/'dispatch.json'),stop,verify_fn=verify,mailbox_cycle=mailbox_cycle,reply_cycle=reply_cycle,reply_uncertain=reply_uncertain)
  if inbox_cycle is None:run_host()
  else:
   with inbox_background(inbox_cycle,stop):run_host()
