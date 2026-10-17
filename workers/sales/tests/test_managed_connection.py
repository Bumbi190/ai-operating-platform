"""Crash recovery tests: losing a receipt must not rotate a second identity."""
import hashlib,json,tempfile,unittest
from datetime import datetime,timezone,timedelta
from pathlib import Path
from workers.sales.journal import Journal,SingleInstance
from workers.sales.managed_connection import ManagedConnection,ConnectionUnavailable
NOW=datetime(2026,10,17,13,tzinfo=timezone.utc)
class Store:
 def __init__(self):self.values={};self.deleted=[]
 def write(self,name,secret):self.values[name]=secret
 def read(self,name):
  if name not in self.values:raise FileNotFoundError('MISSING')
  return self.values[name]
 def delete(self,name):self.deleted.append(name);self.values.pop(name,None)
class Server:
 def __init__(self):self.now=NOW;self.manager=None;self.generation=1;self.receipts={};self.dispatched=[];self.expiry=(NOW+timedelta(hours=1)).isoformat();self.lost=0;self.revoked=False;self.paused=False
 def factory(self,origin,token,purpose):
  parent=self
  class Client:
   def post(self,op,**v):return parent.post(token,op,**v)
  return Client()
 def post(self,token,operation,**v):
  self.dispatched.append((operation,v))
  if self.revoked:raise ConnectionUnavailable('NOT_FOUND')
  if operation=='adopt':
   h=v['managerTokenHash']
   if self.manager not in (None,h):raise ConnectionUnavailable('FENCED')
   self.manager=h;return {'generation':1,'expiresAt':self.expiry,'workerId':'60000000-0000-4000-8000-000000000001'}
  if hashlib.sha256(token.encode()).hexdigest()!=self.manager:raise ConnectionUnavailable('NOT_FOUND')
  if operation=='poll':return {'generation':self.generation,'workerExpiresAt':self.expiry,'desiredState':'paused' if self.paused else 'running','reconnectRequested':False,'executionPaused':False}
  if operation=='rotate':
   rid=v['rotationId']
   if rid not in self.receipts:
    if v['expectedGeneration']!=self.generation:raise ConnectionUnavailable('FENCED')
    self.generation+=1;self.expiry=(self.now+timedelta(hours=24)).isoformat();self.receipts[rid]={'generation':self.generation,'expiresAt':self.expiry}
   if self.lost:self.lost-=1;raise OSError('LOST_REPLY')
   return self.receipts[rid]
class ManagedTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.path=Path(self.tmp.name)/'journal.json';self.store=Store();self.server=Server();self.store.write('original','O'*43)
  self.config={'origin':'https://omnira.example','projectId':'10000000-0000-4000-8000-000000000001','workerId':'60000000-0000-4000-8000-000000000001','activeRef':'original','expiresAt':self.server.expiry,'generation':1}
 def connection(self):return ManagedConnection(self.config,self.store,Journal(self.path),self.server.factory)
 def test_adopt_and_rotate_without_secret_handoff(self):
  token=self.connection().ensure_worker_token(NOW);self.assertNotEqual(token,'O'*43);self.assertEqual(self.server.generation,2);data=self.path.read_text();self.assertNotIn(token,data);self.assertNotIn('O'*43,data)
  for secret in self.store.values.values():self.assertNotIn(secret,json.dumps(self.server.dispatched))
  self.assertIn('original',self.store.deleted)
 def test_lost_server_receipt_replays_same_rotation_after_restart(self):
  self.server.lost=3
  with self.assertRaises(ConnectionUnavailable):self.connection().ensure_worker_token(NOW)
  pending=json.loads(self.path.read_text())['pending'];self.assertEqual(self.server.generation,2)
  token=self.connection().ensure_worker_token(NOW);self.assertEqual(self.server.generation,2);self.assertEqual(token,self.store.read(pending['credentialRef']));self.assertEqual(len(self.server.receipts),1)
 def test_crash_before_active_pointer_recovers_same_receipt(self):
  real=Journal(self.path);original=real.save
  def crash(v):
   if v.get('generation')==2:raise OSError('POWER_LOSS')
   original(v)
  real.save=crash
  with self.assertRaises(OSError):ManagedConnection(self.config,self.store,real,self.server.factory).ensure_worker_token(NOW)
  self.assertEqual(self.server.generation,2);self.connection().ensure_worker_token(NOW);self.assertEqual(self.server.generation,2)
 def test_expired_lost_receipt_is_acknowledged_then_renewed(self):
  self.server.lost=3
  with self.assertRaises(ConnectionUnavailable):self.connection().ensure_worker_token(NOW)
  previous=json.loads(self.path.read_text())['pending']['credentialRef'];late=NOW+timedelta(hours=25);self.server.now=late
  token=self.connection().ensure_worker_token(late)
  self.assertEqual(self.server.generation,3);self.assertNotIn(previous,self.store.values);self.assertIsNone(json.loads(self.path.read_text())['pending']);self.assertEqual(token,self.store.read(json.loads(self.path.read_text())['activeRef']))
 def test_missing_staged_secret_stops_without_new_rotation(self):
  self.server.lost=3
  with self.assertRaises(ConnectionUnavailable):self.connection().ensure_worker_token(NOW)
  staged=json.loads(self.path.read_text())['pending']['credentialRef'];self.store.delete(staged)
  with self.assertRaises(ConnectionUnavailable):self.connection().ensure_worker_token(NOW)
  self.assertEqual(self.server.generation,2)
 def test_revoked_or_owner_changed_never_renews(self):
  self.connection().ensure_worker_token(NOW);self.server.revoked=True
  with self.assertRaises(ConnectionUnavailable):self.connection().ensure_worker_token(NOW)
  self.assertEqual(self.server.generation,2)
 def test_valid_token_not_rotated_until_twelve_hours_remain(self):
  c=self.connection();first=c.ensure_worker_token(NOW);self.assertEqual(c.ensure_worker_token(NOW+timedelta(hours=1)),first);self.assertEqual(self.server.generation,2)
 def test_parallel_starter_is_refused(self):
  with SingleInstance(self.path.with_suffix('.lock')):
   with self.assertRaises(ConnectionUnavailable):self.connection().ensure_worker_token(NOW)
 def test_existing_malformed_manager_is_not_overwritten(self):
  from workers.sales.credential_store import connection_key
  ref=connection_key(self.config['origin'],self.config['projectId'])+'/manager';self.store.write(ref,'corrupt')
  with self.assertRaises(ConnectionUnavailable):self.connection().ensure_worker_token(NOW)
  self.assertEqual(self.store.read(ref),'corrupt');self.assertIsNone(self.server.manager)
 def test_journal_refuses_cross_project_or_corruption(self):
  self.path.write_text('{"projectId":"other"}')
  with self.assertRaises(ConnectionUnavailable):self.connection().ensure_worker_token(NOW)
