import tempfile,unittest
from pathlib import Path
from workers.sales.host import initial_send_cycle
from workers.sales.journal import Journal
class EmptyClient:
 def __init__(self):self.operations=[]
 def post(self,operation,**kw):self.operations.append(operation);return {'ref':None}
class Connection:
 def __init__(self):self.client=EmptyClient()
 def poll_status(self):return {'desiredState':'running','executionPaused':False}
 def initial_send_client(self):return self.client
class InitialSendHostTests(unittest.TestCase):
 def test_default_off_and_mailbox_requirement_do_not_claim(self):
  with tempfile.TemporaryDirectory() as p:
   for config in [{},{'mailboxEnabled':True},{'initialSendEnabled':True},{'initialSendEnabled':'true','mailboxEnabled':True}]:self.assertIsNone(initial_send_cycle(config,Path(p),None,None,None,lambda:None))
 def test_enabled_initial_cycle_claims_separate_queue_without_creating_transport(self):
  with tempfile.TemporaryDirectory() as p:
   c=Connection();cycle=initial_send_cycle({'initialSendEnabled':True,'mailboxEnabled':True},Path(p),c,None,Journal(Path(p)/'mailbox.json'),lambda:None)
   self.assertFalse(cycle());self.assertEqual(c.client.operations,['claim'])
 def test_paused_initial_cycle_does_not_claim(self):
  with tempfile.TemporaryDirectory() as p:
   c=Connection();c.poll_status=lambda:{'desiredState':'running','executionPaused':True}
   cycle=initial_send_cycle({'initialSendEnabled':True,'mailboxEnabled':True},Path(p),c,None,None,lambda:None);self.assertFalse(cycle());self.assertEqual(c.client.operations,[])
