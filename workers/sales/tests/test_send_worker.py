import tempfile,unittest
from pathlib import Path
from unittest.mock import Mock
from workers.sales.journal import Journal
from workers.sales.sending.worker import run_send_once
REF={'projectId':'8f673c09-1c8f-4d78-876e-4c14bf1c89b3','sendJobId':'91736c50-3db6-4d68-86f8-1660672fed0f','workerId':'49d30271-cf0b-47c9-a70d-2bce5b9b09ba','claimId':'b1131538-9775-4f03-bede-9cb86d49f789','generation':1}
class Client:
 def __init__(self):self.calls=[];self.accepted=None;self.lost=False;self.reserved=False;self.claimed=False
 def post(self,action,**data):
  self.calls.append(action)
  if action=='claim':
   if self.claimed:return {'ref':None}
   self.claimed=True;return {'ref':REF,'snapshot':{'sealedJson':'private','snapshotSha256':'a'*64}}
  if action=='heartbeat':return {'ok':True}
  if action=='begin_dispatch':self.reserved=True;return {'dispatchBefore':'2099-01-01T00:00:00Z','snapshotSha256':'a'*64}
  if action=='complete':
   self.accepted=data['receipt']
   if self.lost:raise TimeoutError('private upstream error')
   return {'id':REF['sendJobId'],'status':self.accepted['status']}
  if action=='read_receipt':return {'receipt':self.accepted,'summary':{'id':REF['sendJobId'],'status':self.accepted['status'] if self.accepted else 'dispatching' if self.reserved else 'claimed'},'snapshotSha256':'a'*64,'dispatchReserved':self.reserved,'expired':False}
  if action=='report_uncertain':return {'id':REF['sendJobId'],'status':'delivery_unknown' if self.reserved else 'failed_before_send'}
  raise AssertionError(action)
class SendWorkerTests(unittest.TestCase):
 def setUp(self):
  t=tempfile.TemporaryDirectory();self.addCleanup(t.cleanup);self.journal=Journal(Path(t.name)/'worker.json');self.client=Client();self.count=0
 def factory(self):
  self.count+=1
  def send(snapshot,begin_dispatch):
   begin_dispatch();return {'status':'smtp_accepted','mimeSha256':'c'*64}
  return send
 def test_exactly_one_dispatch_and_accepted_recovery(self):
  self.assertTrue(run_send_once(self.client,self.journal,self.factory));run_send_once(self.client,self.journal,self.factory);self.assertEqual(self.count,1);self.assertEqual(self.client.calls.count('begin_dispatch'),1)
 def test_receipt_first_before_transport_construction(self):
  self.client.accepted={'status':'smtp_accepted','mimeSha256':'c'*64};self.journal.save({'pending':{'ref':REF,'phase':'dispatching'}})
  run_send_once(self.client,self.journal,self.factory);self.assertEqual(self.count,0);self.assertEqual(self.client.calls,['read_receipt'])
 def test_lost_http_accepted_receipt_no_additional_transport(self):
  self.client.lost=True;run_send_once(self.client,self.journal,self.factory);self.client.lost=False;run_send_once(self.client,self.journal,self.factory);self.assertEqual(self.count,1);self.assertEqual(self.client.calls.count('begin_dispatch'),1);self.assertIsNone(self.journal.load()['pending'])
 def test_unknown_reservation_never_reconnects(self):
  self.client.reserved=True;self.journal.save({'pending':{'ref':REF,'phase':'dispatching'}})
  run_send_once(self.client,self.journal,self.factory);run_send_once(self.client,self.journal,self.factory);self.assertEqual(self.count,0);self.assertNotIn('claim',self.client.calls)
 def test_crash_before_envelope_does_not_retry(self):
  self.journal.save({'pending':{'ref':REF,'phase':'claimed'}});run_send_once(self.client,self.journal,self.factory);self.assertEqual(self.count,0);self.assertIn('report_uncertain',self.client.calls)
 def test_disabled_cannot_claim(self):
  run_send_once(self.client,self.journal,self.factory,can_dispatch=False);self.assertEqual(self.client.calls,[])

class DurableEnvelopeReceiptTests(unittest.TestCase):
 def test_crash_after_local_smtp_receipt_recovers_without_transport(self):
  with tempfile.TemporaryDirectory() as path:
   journal=Journal(Path(path)/'worker.json');envelope=Journal(Path(path)/'envelope.json')
   receipt={'status':'smtp_accepted','mimeSha256':'c'*64}
   journal.save({'pending':{'ref':REF,'phase':'dispatching','snapshotSha256':'a'*64}})
   envelope.save({'phase':'complete','snapshotSha256':'a'*64,'mimeSha256':'c'*64,'receipt':receipt})
   client=Client();client.reserved=True
   factory=Mock(side_effect=AssertionError('NO_SMTP_RECONNECT'))
   run_send_once(client,journal,factory,envelope_journal=envelope)
   self.assertEqual(client.accepted,receipt);self.assertIsNone(journal.load()['pending']);factory.assert_not_called()
 def test_another_envelope_hash_cannot_supply_acceptance(self):
  with tempfile.TemporaryDirectory() as path:
   journal=Journal(Path(path)/'worker.json');envelope=Journal(Path(path)/'envelope.json')
   journal.save({'pending':{'ref':REF,'phase':'dispatching','snapshotSha256':'a'*64}})
   envelope.save({'phase':'complete','snapshotSha256':'b'*64,'mimeSha256':'c'*64,'receipt':{'status':'smtp_accepted','mimeSha256':'c'*64}})
   client=Client();client.reserved=True;factory=Mock(side_effect=AssertionError('NO_SMTP_RECONNECT'))
   run_send_once(client,journal,factory,envelope_journal=envelope)
   self.assertIsNone(client.accepted);self.assertIsNotNone(journal.load()['pending']);factory.assert_not_called()
