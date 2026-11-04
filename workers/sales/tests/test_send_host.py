import tempfile,threading,unittest
from pathlib import Path
from unittest.mock import Mock
from workers.sales.host import send_background,host_loop
from workers.sales.journal import Journal
from workers.sales.protocol import SALES_ENDPOINTS
class SendHostTests(unittest.TestCase):
 def test_send_uses_fixed_endpoint(self):self.assertEqual(SALES_ENDPOINTS.get('send'),'/api/sales/sending/worker')
 def test_slow_smtp_keeps_main_host_heartbeat_running(self):
  stop=threading.Event();entered=threading.Event();release=threading.Event()
  def cycle():entered.set();release.wait(2)
  connection=Mock();connection.poll_status.return_value={'desiredState':'running','executionPaused':False}
  with tempfile.TemporaryDirectory() as path:
   with send_background(cycle,stop):
    self.assertTrue(entered.wait(1));host_loop(connection,lambda _:Mock(),lambda:Mock(),lambda:{'ready':False},Journal(Path(path)/'model.json'),stop,wait_fn=lambda _:stop.set());connection.report_status.assert_called_with('blocked');release.set()
