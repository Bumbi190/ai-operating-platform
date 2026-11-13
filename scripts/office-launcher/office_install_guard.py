"""Scoped local-install guards, projection fixtures and guarded filesystem recovery.

No Unreal import, credentials, network or arbitrary-command execution. Recovery
requires a caller-supplied allowlist and never overwrites an unrecorded change.
"""
from __future__ import annotations
import hashlib,json,os,tempfile
from pathlib import Path

class GuardError(RuntimeError):pass

def canonical(path):return os.path.normcase(os.path.realpath(os.fspath(path)))
def digest(path):
 try:return hashlib.sha256(Path(path).read_bytes()).hexdigest()
 except FileNotFoundError:return None

def atomic_bytes(path,data):
 path=Path(path)
 fd,temporary=tempfile.mkstemp(prefix=path.name+'.',suffix='.tmp',dir=path.parent)
 try:
  with os.fdopen(fd,'wb') as stream:
   stream.write(data);stream.flush();os.fsync(stream.fileno())
  os.replace(temporary,path)
 finally:
  if os.path.exists(temporary):os.unlink(temporary)

def validate_context(*,active_project,active_content,expected_project,expected_map_file,map_package,world_path=None,level_path=None):
 expected=Path(expected_project)
 if not expected.is_file() or canonical(active_project)!=canonical(expected):raise GuardError('Wrong active Unreal project')
 if canonical(active_content)!=canonical(expected.parent/'Content'):raise GuardError('Wrong active /Game content root')
 if not map_package.startswith('/Game/') or '..' in map_package:raise GuardError('Invalid expected map package')
 mapped=Path(active_content)/(map_package[len('/Game/'):]+'.umap')
 if canonical(mapped)!=canonical(expected_map_file) or not Path(expected_map_file).is_file():raise GuardError('Wrong physical map target')
 expected_world=map_package+'.'+map_package.rsplit('/',1)[1]
 if world_path is not None and world_path!=expected_world:raise GuardError('Wrong loaded world package')
 if level_path is not None and level_path!=expected_world+':PersistentLevel':raise GuardError('Wrong active level')

class ProjectionFixture:
 def __init__(self,path):
  self.path=Path(path);self._handle=None;self._captured=False;self._written=False;self._original=None;self._expected=None
 def acquire(self):
  if self._handle is not None:raise GuardError('Fixture already acquired')
  self.path.parent.mkdir(parents=True,exist_ok=True)
  handle=(self.path.parent/'.office-relay.lock').open('a+b')
  if handle.seek(0,2)==0:handle.write(b'0');handle.flush()
  handle.seek(0)
  try:
   try:
    if os.name=='nt':
     import msvcrt
     msvcrt.locking(handle.fileno(),msvcrt.LK_NBLCK,1)
    else:
     import fcntl
     fcntl.flock(handle.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
   except OSError:raise GuardError('Active Office relay owns the projection') from None
   try:self._original=self.path.read_bytes()
   except FileNotFoundError:self._original=None
   self._expected=None if self._original is None else hashlib.sha256(self._original).hexdigest()
   self._captured=True;self._handle=handle
  except BaseException:handle.close();raise
 def _check(self):
  if self._handle is None or not self._captured:raise GuardError('No captured fixture lease')
  if digest(self.path)!=self._expected:raise GuardError('Projection changed outside this fixture; preserving it')
 def write(self,data):
  self._check();atomic_bytes(self.path,data)
  self._written=True;self._expected=hashlib.sha256(data).hexdigest()
 def remove(self):
  self._check();self.path.unlink(missing_ok=True)
  self._written=True;self._expected=None
 def restore(self):
  if self._handle is None:return
  try:
   if self._captured and self._written:
    self._check()
    if self._original is None:self.path.unlink(missing_ok=True)
    else:atomic_bytes(self.path,self._original)
  finally:
   self._handle.close();self._handle=None

class OwnedInstallTransaction:
 SCHEMA='omnira.office.native-install-transaction.v1'
 def __init__(self,journal,*,originals,new_files,rollback_order):
  self.journal=Path(journal)
  self.originals={canonical(p):Path(b) for p,b in originals.items()}
  self.new_files=[canonical(p) for p in new_files]
  if set(self.originals)&set(self.new_files) or len(set(self.new_files))!=len(self.new_files):raise GuardError('Overlapping installation paths')
  self.order=[canonical(p) for p in rollback_order]
  if set(self.order)!=set(self.originals)|set(self.new_files):raise GuardError('Incomplete rollback scope')
  self.state=None
 def _persist(self):atomic_bytes(self.journal,(json.dumps(self.state,indent=2)+'\n').encode('utf-8'))
 def begin(self):
  if self.journal.exists():
   previous=json.loads(self.journal.read_text(encoding='utf-8'))
   if previous.get('status') not in ('committed','rolled_back'):raise GuardError('Unfinished installation requires guarded recovery first')
  records={}
  for path,backup in self.originals.items():
   before=digest(path)
   if before is None or digest(backup)!=before:raise GuardError('Original/backup hash mismatch')
   if canonical(backup.parent)!=canonical(self.journal.parent):raise GuardError('Backup outside transaction directory')
   records[path]={'backup':str(backup),'before':before,'observed_after':before}
  for path in self.new_files:
   if Path(path).exists():raise GuardError('Refusing existing new-asset target')
   records[path]={'backup':None,'before':None,'observed_after':None}
  self.state={'schema':self.SCHEMA,'status':'prepared','records':records,'order':self.order,'steps':[]}
  self._persist()
 def step(self,name,paths,action):
  selected=[canonical(p) for p in paths]
  for path in selected:
   if path not in self.state['records']:raise GuardError('Write outside installation scope')
   if digest(path)!=self.state['records'][path]['observed_after']:raise GuardError('Unexpected pre-write change')
  self.state.update(status='writing',intent={'name':name,'paths':selected});self._persist()
  try:return action()
  finally:
   for path in selected:self.state['records'][path]['observed_after']=digest(path)
   self.state.update(status='applied',intent=None);self.state['steps'].append(name);self._persist()
 def commit(self):
  self.state.update(status='committed',intent=None);self._persist()
 def rollback(self):
  self._recover(self.journal,self.state,set(self.state['records']))
 @classmethod
 def recover(cls,journal,*,allowed_files):
  journal=Path(journal);state=json.loads(journal.read_text(encoding='utf-8'))
  cls._recover(journal,state,{canonical(p) for p in allowed_files})
 @classmethod
 def _recover(cls,journal,state,allowed):
  if state.get('schema')!=cls.SCHEMA or set(state.get('records',{}))!=allowed:raise GuardError('Recovery scope mismatch')
  records=state['records']
  if set(state.get('order',[]))!=allowed:raise GuardError('Recovery order mismatch')
  # Audit ALL files before restoring any: unknown drift requires manual review.
  for path,record in records.items():
   current=digest(path)
   if current not in (record['before'],record['observed_after']):raise GuardError('Unrecorded change; no automatic recovery')
   backup=record['backup']
   if backup is not None:
    if canonical(Path(backup).parent)!=canonical(Path(journal).parent) or digest(backup)!=record['before']:
     raise GuardError('Unverified recovery backup')
  for path in state['order']:
   record=records[path]
   if digest(path)==record['before']:continue
   if digest(path)!=record['observed_after']:raise GuardError('Change during recovery; preserving file')
   if record['backup'] is None:Path(path).unlink(missing_ok=True)
   else:atomic_bytes(path,Path(record['backup']).read_bytes())
  state.update(status='rolled_back',intent=None)
  atomic_bytes(journal,(json.dumps(state,indent=2)+'\n').encode('utf-8'))

def finish_checks(proof,actions):
 errors=[]
 for name,action in actions:
  try:
   if action() is False:raise GuardError('Verification returned false')
  except Exception as error:errors.append({'step':name,'error':str(error)})
 if errors:
  proof['passed']=False;proof['cleanup_errors']=errors
 return not errors

def verify_artifacts(manifest,*,source,asset,project):
 source_hash=digest(source)
 if source_hash is None or manifest.get('source_sha256')!=source_hash:raise GuardError('Generator missing or differs from recorded installation')
 actual=digest(asset)
 if actual is None or manifest.get('asset_sha256')!=actual:raise GuardError('Saved Blueprint differs from recorded installation')
 config=json.loads(Path(project).read_text(encoding='utf-8-sig'))
 plugins=[p for p in config.get('Plugins',[]) if p.get('Name')=='JsonBlueprintUtilities']
 if len(plugins)!=1 or plugins[0].get('Enabled') is not True:raise GuardError('Required runtime JSON plugin is disabled or ambiguous')
