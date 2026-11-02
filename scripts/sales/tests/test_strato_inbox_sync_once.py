"""No network, no real credentials; check strict inbox-only action fencing."""
import importlib.util
import io
import json
from pathlib import Path
import unittest
from contextlib import redirect_stdout

SOURCE = Path(__file__).resolve().parents[1] / "strato-inbox-sync-once.py"
spec = importlib.util.spec_from_file_location("strato_sync_once", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class FakeClient:
    def __init__(self):
        self.calls=[]
    def post(self, operation, **values):
        self.calls.append((operation,values))
        return {"ok":True}

class TestSafeInboxSync(unittest.TestCase):
    def test_whitelist_only_inbox_actions(self):
        real=FakeClient()
        fenced=module.InboxOnlyTransport(real)
        for operation in ("claim_sync","read_batch_receipt","commit_batch","report_sync_failure"):
            self.assertEqual(fenced.post(operation,ref="fixture"),{"ok":True})
        self.assertEqual(len(real.calls),4)

    def test_send_reply_and_worker_claim_cannot_be_called(self):
        real=FakeClient()
        fenced=module.InboxOnlyTransport(real)
        for op in ("claim_send","reserve_attempt","claim_reply","claim","poll",
                   "send","publish","claim_model_job","claim_sync_other"):
            with self.assertRaises(module.SyncBlocked):
                fenced.post(op,projectId="any")
        self.assertEqual(real.calls,[])

    def test_explicit_flag_required_even_with_correct_project(self):
        buf=io.StringIO()
        with redirect_stdout(buf):
            rc=module.main(["--project","8f673c09-1c8f-4d78-876e-4c14bf1c89b3"])
        self.assertEqual(rc,1)
        self.assertEqual(json.loads(buf.getvalue())["status"],"not_started")

    def test_invalid_project_refuses_without_reading_credentials(self):
        result=module.sync_one("../../../other")
        self.assertEqual(result,{"status":"blocked","reason":"INVALID_PROJECT","emailsSent":0})

if __name__=="__main__":
    unittest.main()
