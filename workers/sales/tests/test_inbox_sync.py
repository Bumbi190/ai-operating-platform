"""Crash-boundary and authorization tests; no mailbox server or model involved."""
import copy,json,tempfile,unittest
from pathlib import Path
from unittest.mock import Mock
from workers.sales.journal import Journal
from workers.sales.protocol import ProtocolError
from workers.sales.mailbox.inbox import InboxReadError
from workers.sales.mailbox.inbox_sync import sync_inbox_once,run_inbox_loop
REF=dict(projectId='p',mailboxId='m',configVersion=1,mailboxGeneration=6,hostGeneration=2,claimId='c',batchId='b')
CURSOR=dict(uidValidity='11',scannedThroughUid=20,epoch=1)
CLAIM=dict(ref=REF,config=dict(folder='INBOX',since='2026-10-07T22:00:00Z',state='enabled'),mailboxEmail='info@handlarborsen.se',cursor=CURSOR,selectedMessages=[dict(uid=3,uidValidity='11')],selectedAddresses=[])
BATCH=dict(mode='selected_text',uidValidity='11',throughUid=20,rangeEnd=20,records=[dict(uid=3,text='MAIL_BODY_CANARY')])
class Server:
 def __init__(self):self.claim=copy.deepcopy(CLAIM);self.receipt=None;self.expired=False;self.lost=False;self.fenced=False;self.calls=[];self.failure=None
 def post(self,op,**v):
  self.calls.append((op,v))
  if self.fenced:raise ProtocolError('FENCED')
  if op=='claim_sync':return dict(sync=self.claim)
  if op=='read_batch_receipt':return dict(receipt=self.receipt,expired=self.expired)
  if op=='commit_batch':
   self.receipt=dict(accepted=True,batchId=REF['batchId'],cursor=CURSOR,records=1,inserted=1)
   if self.lost:raise OSError('lost')
   return self.receipt
  if op=='report_sync_failure':
   self.failure=v['reasonCode'];self.receipt=dict(accepted=False,batchId=v['ref']['batchId'],reasonCode=self.failure)
   if self.lost:raise OSError('lost')
   return self.receipt
  raise AssertionError(op)
class SyncTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.root=Path(self.tmp.name)
  self.mb=Journal(self.root/'mailbox.json');self.j=Journal(self.root/'inbox.json')
  self.mb.save(dict(active=dict(credentialRef='EXACT_REF',email=CLAIM['mailboxEmail'],mailboxId='m',generation=6),pending=None))
  self.store=Mock();self.store.read.return_value='PASSWORD_CANARY';self.reader=Mock(return_value=copy.deepcopy(BATCH));self.server=Server()
 def sync(self):return sync_inbox_once(self.server,self.store,self.mb,self.j,self.reader)
 def test_disabled_or_paused_claim_never_authenticates(self):
  self.server.claim=None;self.sync();self.reader.assert_not_called();self.store.read.assert_not_called()
 def test_only_active_matching_credential_and_selected_old_uid(self):
  self.sync();self.store.read.assert_called_once_with('EXACT_REF');args=self.reader.call_args.args
  self.assertEqual(args[0]['email'],CLAIM['mailboxEmail']);self.assertEqual(args[1],CURSOR);self.assertEqual(args[2],CLAIM['selectedMessages'])
  sent=self.server.calls[-1][1];self.assertEqual(sent['expectedCursor'],CURSOR);self.assertEqual(sent['throughUid'],20);self.assertIsNone(self.j.load()['pending'])
 def test_mailbox_replacement_or_setup_pending_never_authenticates(self):
  for changes in [dict(generation=7),dict(mailboxId='other'),dict(email='other@example.com')]:
   state=self.mb.load();state['active'].update(changes);self.mb.save(state);self.sync()
  self.reader.assert_not_called();self.store.read.assert_not_called()
 def test_pending_setup_prevents_even_claim(self):
  s=self.mb.load();s['pending']={'phase':'auth_started'};self.mb.save(s);self.sync();self.assertEqual(self.server.calls,[])
 def test_lost_commit_receipt_recovered_before_another_auth(self):
  self.server.lost=True;self.sync();self.assertIsNotNone(self.j.load()['pending']);self.server.lost=False;self.sync()
  self.assertEqual(self.reader.call_count,1);self.assertEqual(self.server.calls[-1][0],'read_batch_receipt');self.assertIsNone(self.j.load()['pending'])
 def test_crash_before_commit_waits_for_claim_expiry_then_rereads(self):
  self.reader.side_effect=KeyboardInterrupt
  with self.assertRaises(KeyboardInterrupt):self.sync()
  self.reader.side_effect=None;self.sync();self.assertEqual(self.reader.call_count,1)
  self.server.expired=True;self.sync();self.assertEqual(self.reader.call_count,2)
 def test_receipt_conflict_stops_without_advancing(self):
  self.server.lost=True;self.sync();self.server.receipt={'accepted':True,'batchId':'different'};self.server.lost=False
  self.assertEqual(self.sync().code,'RECONCILING');self.assertEqual(self.reader.call_count,1);self.assertIsNotNone(self.j.load()['pending'])
 def test_auth_failure_is_durable_even_when_failure_reply_lost(self):
  self.reader.side_effect=InboxReadError('AUTH_FAILED');self.server.lost=True;self.sync();self.server.receipt=None;self.server.expired=True;self.server.lost=False;self.sync()
  self.assertEqual(self.reader.call_count,1);self.assertEqual(self.server.failure,'AUTH_FAILED');self.assertIsNotNone(self.j.load()['authBlocked'])
 def test_explicit_new_config_version_allows_auth_after_owner_resume(self):
  self.reader.side_effect=InboxReadError('AUTH_FAILED');self.sync();self.reader.side_effect=None
  self.server.claim['ref']['configVersion']=2;self.sync();self.assertEqual(self.reader.call_count,2)
 def test_fence_during_read_never_retries_commit_or_moves_local_cursor(self):
  def read(*a):self.server.fenced=True;return copy.deepcopy(BATCH)
  self.reader.side_effect=read;self.sync();self.assertIsNotNone(self.j.load()['pending']);self.assertNotIn('cursor',self.j.load())
  self.sync();self.assertEqual(self.reader.call_count,1)
 def test_journal_contains_no_body_password_email_or_payload(self):
  self.server.lost=True;self.sync();raw=self.j.path.read_text()
  for v in ['MAIL_BODY_CANARY','PASSWORD_CANARY',CLAIM['mailboxEmail'],'records','expectedCursor']:self.assertNotIn(v,raw)
 def test_transport_failure_fixed_code_and_bounded_backoff(self):
  self.reader.side_effect=OSError('SERVER_SECRET_CANARY')
  self.assertEqual(self.sync().delay,60);self.assertEqual(self.sync().delay,120);self.assertEqual(self.sync().delay,300);self.assertEqual(self.sync().delay,300)
  self.assertNotIn('SERVER_SECRET_CANARY',self.j.path.read_text());self.assertEqual(self.server.failure,'CONNECTION_FAILED')
 def test_parallel_sync_is_refused_by_same_journal_lock(self):
  with self.j.lock():result=self.sync()
  self.assertEqual(result.code,'ALREADY_RUNNING');self.reader.assert_not_called()
 def test_stop_event_exits_without_read_or_model(self):
  import threading
  stop=threading.Event();stop.set();cycle=Mock();run_inbox_loop(cycle,stop);cycle.assert_not_called()
if __name__=='__main__':unittest.main()
