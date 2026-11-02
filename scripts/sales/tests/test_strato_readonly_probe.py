"""No network and no external account. Only fake read-only IMAP fixtures."""
import importlib.util
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "strato-readonly-probe.py"
spec = importlib.util.spec_from_file_location("strato_readonly_probe", SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class FakeIMAP:
    capabilities = ("IMAP4REV1", "AUTH=PLAIN")
    def __init__(self,host,port,ssl_context,timeout):
        if (host,port,timeout) != ("imap.strato.de",993,8):
            raise AssertionError("Unexpected endpoint or timeout")
        if not ssl_context.check_hostname or ssl_context.verify_mode != 2:
            raise AssertionError("Certificate verification disabled")
        self.calls = []
        self.debug = 1
        self.logged_out = False
    def authenticate(self,method,callback):
        self.calls.append(("authenticate",method))
        if method != "PLAIN" or callback(None) != b"\x00dealer@example.test\x00fake-secret":
            raise AssertionError("Wrong safe test credential")
        return ("OK", [b"Authenticated"])
    def select(self,folder,readonly=False):
        self.calls.append(("select",folder,readonly))
        if not readonly:
            raise AssertionError("Attempted writable mailbox")
        return ("OK", [b"17"])
    def response(self, name):
        self.calls.append(("response",name))
        return (name,[b"34"] if name == "UIDNEXT" else [b"1791301212"])
    def logout(self):
        self.logged_out=True
        self.calls.append(("logout",))
        return ("BYE", [b"bye"])

class TestReadonlyProbe(unittest.TestCase):
    def test_no_fetch_no_store_no_send_and_logout(self):
        fake = FakeIMAP("imap.strato.de",993,__import__("ssl").create_default_context(),8)
        result = module.check_imap_readonly("dealer@example.test","fake-secret",factory=lambda *a,**k:fake)
        self.assertEqual(result,{"status":"ok","imapAuthenticated":True,"inboxReadonly":True,
                                 "messageCount":17,"uidNext":34,"uidValidity":1791301212,
                                 "messagesFetched":0,"emailsSent":0})
        self.assertEqual(fake.calls,[("authenticate","PLAIN"),("select","INBOX",True),
                                     ("response","UIDNEXT"),("response","UIDVALIDITY"),("logout",)])
        self.assertTrue(fake.logged_out)
        self.assertEqual(fake.debug,0)
    def test_auth_missing_is_refused_before_select(self):
        fake=FakeIMAP("imap.strato.de",993,__import__("ssl").create_default_context(),8)
        fake.capabilities=("IMAP4REV1",)
        with self.assertRaises(module.ProbeConnectionFailed) as error:
            module.check_imap_readonly("dealer@example.test","fake-secret",factory=lambda *a,**k:fake)
        self.assertEqual(error.exception.code,"IMAP_AUTH_UNSUPPORTED")
        self.assertEqual(fake.calls,[("logout",)])
    def test_no_credential_never_connects(self):
        def forbidden(*args,**kwargs):raise AssertionError("Must not connect")
        with self.assertRaises(module.ProbeConnectionFailed):
            module.check_imap_readonly("dealer@example.test",None,factory=forbidden)
    def test_server_auth_failure_never_selects(self):
        fake=FakeIMAP("imap.strato.de",993,__import__("ssl").create_default_context(),8)
        def reject(method,cb):
            fake.calls.append(("authenticate",method))
            return ("NO",[b"Auth failed"])
        fake.authenticate=reject
        with self.assertRaises(module.ProbeConnectionFailed) as error:
            module.check_imap_readonly("dealer@example.test","fake-secret",factory=lambda *a,**k:fake)
        self.assertEqual(error.exception.code,"IMAP_AUTH_FAILED")
        self.assertEqual(fake.calls,[("authenticate","PLAIN"),("logout",)])
    def test_readonly_select_failure_does_not_fetch(self):
        fake=FakeIMAP("imap.strato.de",993,__import__("ssl").create_default_context(),8)
        def fail(folder,readonly=False):
            fake.calls.append(("select",folder,readonly))
            return ("NO",[])
        fake.select=fail
        with self.assertRaises(module.ProbeConnectionFailed) as error:
            module.check_imap_readonly("dealer@example.test","fake-secret",factory=lambda *a,**k:fake)
        self.assertEqual(error.exception.code,"INBOX_READ_FAILED")
        self.assertEqual(fake.calls,[("authenticate","PLAIN"),("select","INBOX",True),("logout",)])

if __name__ == "__main__":
    unittest.main()
