import importlib.util
from pathlib import Path
import subprocess
import sys
import time
import unittest
SPEC=importlib.util.find_spec('office_visit_process')
if SPEC:
    from office_visit_process import WindowsProcessLease
    from office_launcher import OfficeTarget, RunningOffice


class ProcessTests(unittest.TestCase):
    def test_process_lease_feature_exists(self):
        self.assertIsNotNone(SPEC,'Pinned Office process identity missing')
    @unittest.skipUnless(sys.platform=='win32','Windows kernel process handle')
    def test_pinned_handle_stays_dead_after_owned_process_exits(self):
        self.assertIsNotNone(SPEC,'Pinned Office process identity missing')
        child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'])
        try:
            target=OfficeTarget(Path(sys.executable),Path('C:/synthetic/office.uproject'))
            class Backend:
                def running(self):return [RunningOffice(child.pid,target.argv())]
            lease=WindowsProcessLease.pin(child.pid,target,Backend())
            try:
                self.assertTrue(lease.alive())
                child.terminate();child.wait(timeout=5)
                self.assertFalse(lease.alive());self.assertFalse(lease.alive())
            finally:lease.close()
        finally:
            if child.poll() is None:child.terminate();child.wait(timeout=5)
