"""Atomic non-secret state and an OS file lock; secrets live in Credential Manager."""
import json,os,tempfile
from contextlib import AbstractContextManager
from pathlib import Path
class JournalError(Exception):pass
class SingleInstance(AbstractContextManager):
 def __init__(self,path):self.path=Path(path);self.file=None
 def __enter__(self):
  self.path.parent.mkdir(parents=True,exist_ok=True)
  if self.path.is_symlink():raise JournalError('UNSAFE_LOCK')
  self.file=self.path.open('a+b');self.file.seek(0);self.file.write(b'\0');self.file.flush();self.file.seek(0)
  try:
   if os.name=='nt':
    import msvcrt
    msvcrt.locking(self.file.fileno(),msvcrt.LK_NBLCK,1)
   else:
    import fcntl
    fcntl.flock(self.file.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB)
  except OSError:self.file.close();self.file=None;raise JournalError('ALREADY_RUNNING') from None
  return self
 def __exit__(self,*args):
  if self.file:
   if os.name=='nt':
    import msvcrt
    self.file.seek(0);msvcrt.locking(self.file.fileno(),msvcrt.LK_UNLCK,1)
   else:
    import fcntl
    fcntl.flock(self.file.fileno(),fcntl.LOCK_UN)
   self.file.close();self.file=None
class Journal:
 def __init__(self,path):self.path=Path(path)
 def lock(self):return SingleInstance(self.path.with_suffix('.lock'))
 def load(self):
  try:
   if self.path.is_symlink():raise JournalError('UNSAFE_JOURNAL')
   if not self.path.exists():return None
   if self.path.stat().st_size>16384:raise JournalError('INVALID_JOURNAL')
   v=json.loads(self.path.read_text(encoding='utf-8'))
   if not isinstance(v,dict):raise JournalError('INVALID_JOURNAL')
   return v
  except (OSError,ValueError):raise JournalError('INVALID_JOURNAL') from None
 def save(self,value):
  self.path.parent.mkdir(parents=True,exist_ok=True)
  if self.path.is_symlink():raise JournalError('UNSAFE_JOURNAL')
  fd,name=tempfile.mkstemp(prefix=self.path.name+'.',dir=self.path.parent)
  try:
   with os.fdopen(fd,'w',encoding='utf-8',newline='\n') as f:
    json.dump(value,f,separators=(',',':'),ensure_ascii=False);f.flush();os.fsync(f.fileno())
   os.replace(name,self.path)
   if os.name!='nt':
    directory=os.open(self.path.parent,os.O_RDONLY)
    try:os.fsync(directory)
    finally:os.close(directory)
  finally:
   if os.path.exists(name):os.unlink(name)
