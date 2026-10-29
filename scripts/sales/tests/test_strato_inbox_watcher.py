"""Pure/fake watcher tests: no real IMAP, sales DB or Vercel calls."""
import importlib.util
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
import tempfile
import unittest

FILE=Path(__file__).resolve().parents[1]/"strato-inbox-watcher.py"
spec=importlib.util.spec_from_file_location("strato_watcher_fixture",FILE)
watch=importlib.util.module_from_spec(spec)
spec.loader.exec_module(watch)
PROJECT="8f673c09-1c8f-4d78-876e-4c14bf1c89b3"
VALIDITY=1791301212

def healthy(uid_next=34,validity=VALIDITY):
    return {"status":"ok","uidNext":uid_next,"uidValidity":validity,
            "emailsSent":0,"messageCount":23}

class TestConditionalInbox(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home=self.temp.name

    def test_initial_checkpoint_requires_explicit_trusted_baseline(self):
        result=watch.tick(PROJECT,home=self.home,probe=lambda _:healthy(),
                          sync=lambda _:self.fail("Sync should not run"))
        self.assertEqual(result["status"],"needs_bootstrap")
        self.assertIsNone(watch._read_checkpoint(PROJECT,self.home))

    def test_bootstrap_and_unchanged_inbox_skips_all_db_writes(self):
        result=watch.bootstrap(PROJECT,33,VALIDITY,home=self.home,probe=lambda _:healthy())
        self.assertEqual(result["status"],"bootstrapped")
        result=watch.tick(PROJECT,home=self.home,probe=lambda _:healthy(),
                          sync=lambda _:self.fail("No sync when UIDNEXT unchanged"))
        self.assertEqual(result["status"],"idle")

    def test_new_uid_triggers_single_scoped_sync_then_checkpoint(self):
        watch.bootstrap(PROJECT,33,VALIDITY,home=self.home,probe=lambda _:healthy())
        calls=[]
        def sync(_):
            calls.append("inbox_only")
            return {"status":"ok","syncResult":"SYNCED",
                    "cursor":{"scannedThroughUid":36,"uidValidity":VALIDITY}}
        result=watch.tick(PROJECT,home=self.home,probe=lambda _:healthy(37),sync=sync)
        self.assertEqual(result["status"],"synced")
        self.assertEqual(calls,["inbox_only"])
        self.assertEqual(watch._read_checkpoint(PROJECT,self.home),
                         {"scannedThroughUid":36,"uidValidity":VALIDITY})

    def test_unchanged_uid_does_not_reset_checkpoint_or_run_sync(self):
        watch.bootstrap(PROJECT,33,VALIDITY,home=self.home,probe=lambda _:healthy())
        result=watch.tick(PROJECT,home=self.home,probe=lambda _:healthy(31),
                          sync=lambda _:self.fail("Must not run"))
        self.assertEqual(result["status"],"idle")
        self.assertEqual(watch._read_checkpoint(PROJECT,self.home)["scannedThroughUid"],33)

    def test_failed_sync_does_not_advance(self):
        watch.bootstrap(PROJECT,33,VALIDITY,home=self.home,probe=lambda _:healthy())
        result=watch.tick(PROJECT,home=self.home,probe=lambda _:healthy(35),
                          sync=lambda _:{"status":"blocked","reason":"UNAVAILABLE"})
        self.assertEqual(result["status"],"blocked")
        self.assertEqual(watch._read_checkpoint(PROJECT,self.home)["scannedThroughUid"],33)

    def test_wrong_uidvalidity_in_receipt_refused(self):
        watch.bootstrap(PROJECT,33,VALIDITY,home=self.home,probe=lambda _:healthy())
        result=watch.tick(PROJECT,home=self.home,probe=lambda _:healthy(38),
                          sync=lambda _:{"status":"ok","syncResult":"SYNCED",
                          "cursor":{"scannedThroughUid":37,"uidValidity":VALIDITY-1}})
        self.assertEqual(result["reason"],"CURSOR_NOT_VERIFIED")
        self.assertEqual(watch._read_checkpoint(PROJECT,self.home)["scannedThroughUid"],33)

    def test_new_uidvalidity_may_only_advance_after_matching_receipt(self):
        watch.bootstrap(PROJECT,33,VALIDITY,home=self.home,probe=lambda _:healthy())
        result=watch.tick(PROJECT,home=self.home,probe=lambda _:healthy(2,VALIDITY+1),
                          sync=lambda _:{"status":"ok","syncResult":"SYNCED",
                          "cursor":{"scannedThroughUid":1,"uidValidity":VALIDITY+1}})
        self.assertEqual(result["status"],"synced")
        self.assertEqual(watch._read_checkpoint(PROJECT,self.home)["scannedThroughUid"],1)

    def test_hourly_heartbeat_checks_owner_selected_old_text(self):
        watch.bootstrap(PROJECT,33,VALIDITY,home=self.home,probe=lambda _:healthy())
        p=watch._checkpoint_path(PROJECT,self.home)
        state=json.loads(p.read_text())
        state["recordedAt"]=(datetime.now(timezone.utc)-timedelta(hours=2)).isoformat()
        p.write_text(json.dumps(state))
        calls=[]
        def sync(_):
            calls.append("inbox_only")
            return {"status":"ok","syncResult":"SYNCED",
                    "cursor":{"scannedThroughUid":33,"uidValidity":VALIDITY}}
        result=watch.tick(PROJECT,home=self.home,probe=lambda _:healthy(),sync=sync)
        self.assertEqual(result["status"],"synced")
        self.assertEqual(calls,["inbox_only"])

    def test_invalid_heartbeat_clock_blocks_instead_of_triggering_sync(self):
        watch.bootstrap(PROJECT,33,VALIDITY,home=self.home,probe=lambda _:healthy())
        p=watch._checkpoint_path(PROJECT,self.home)
        state=json.loads(p.read_text())
        state["recordedAt"]="not-a-timestamp"
        p.write_text(json.dumps(state))
        result=watch.tick(PROJECT,home=self.home,probe=lambda _:healthy(),
                          sync=lambda _:self.fail("Invalid clock cannot request DB sync"))
        self.assertEqual(result["reason"],"CHECKPOINT_AGE_UNVERIFIED")

    def test_unknown_probe_fails_closed(self):
        watch.bootstrap(PROJECT,33,VALIDITY,home=self.home,probe=lambda _:healthy())
        result=watch.tick(PROJECT,home=self.home,probe=lambda _:{"status":"unavailable"},
                          sync=lambda _:self.fail("Must not run"))
        self.assertEqual(result["status"],"blocked")
        self.assertEqual(watch._read_checkpoint(PROJECT,self.home)["scannedThroughUid"],33)

    def test_bootstrap_twice_refused(self):
        self.assertEqual(watch.bootstrap(PROJECT,33,VALIDITY,home=self.home,probe=lambda _:healthy())["status"],"bootstrapped")
        self.assertEqual(watch.bootstrap(PROJECT,33,VALIDITY,home=self.home,probe=lambda _:healthy())["reason"],"CHECKPOINT_ALREADY_INITIALIZED")

    def test_cursor_regression_rejected(self):
        watch.bootstrap(PROJECT,33,VALIDITY,home=self.home,probe=lambda _:healthy())
        with self.assertRaises(watch.WatchBlocked):
            watch._write_checkpoint(PROJECT,{"scannedThroughUid":31,"uidValidity":VALIDITY},self.home)

if __name__=="__main__":
    unittest.main()
