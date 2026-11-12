import time
import unittest
from unittest.mock import Mock, patch

from nova_commander import project_intent
from nova_mail import decode_message, deliver, Draft, intent, read_inbox, MailError
from nova_overlay import NovaOverlay
from nova_workspace import Workspace

RAW = (b'From: Bjorn <bjorn@example.test>\r\nReply-To: inkorg@example.test\r\n'
       b'Subject: Offert\r\nMessage-ID: <fixture@example.test>\r\n'
       b'Content-Type: text/plain; charset=utf-8\r\n\r\nTestmeddelande')


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.ui = Mock()
        self.ui.expanded = True
        self.ws = Workspace(self.ui)
        self.mail = decode_message("Gmail", "andre@example.test", RAW)
        self.ws.source = self.mail

    def test_read_review_revise_then_send_once(self):
        self.ws.job = Mock()
        self.ws.handle(intent("Svara att jag kommer.", True), "")
        self.ws.job.assert_not_called()
        old = self.ws.draft
        self.ws.handle(intent("Lägg till Jag tar med offerten.", True), "")
        new = self.ws.draft
        self.assertIn("inkorg@example.test", new.preview())
        self.assertIn("Jag tar med offerten.", new.preview())
        self.ws.send_reviewed(old)
        self.ws.job.assert_not_called()
        self.ws.handle(intent("Nova, skicka svaret.", True), "")
        self.ws.send_reviewed(new)
        self.ws.job.assert_called_once()
        self.assertIsNone(self.ws.source)

    def test_draft_commands_do_not_send_when_quoted_negated_or_combined(self):
        for text in ("Skicka inte svaret", "Hon sa skicka svaret", "Svara att vi kan och skicka sedan"):
            self.assertNotEqual((intent(text, True) or (None,))[0], "send")
        self.assertIsNone(intent("Vi talade om mejlet i Gmail.", True))
        self.assertEqual(intent("Läs mejlet om offert i Strato"), ("subject", ("Strato", "offert")))

    def test_select_visible_mail_matches_subject_and_body(self):
        with patch("nova_mail.get_account", return_value=(self.mail.account, "dummy")), patch("nova_mail.imaplib.IMAP4_SSL") as ctor:
            box = ctor.return_value.__enter__.return_value
            box.select.return_value = ("OK", [b"4"])
            box.fetch.return_value = ("OK", [(b"4 (UID 901", b"Subject: Offert\r\n")])
            box.uid.return_value = ("OK", [(b"4 (UID 901", RAW)])
            with self.assertRaises(MailError):
                read_inbox("Gmail", visible="Inkorg Offert")
            self.assertEqual(read_inbox("Gmail", visible="Offert Testmeddelande").recipient, "inkorg@example.test")

    def test_latest_by_subject_preserves_the_subject_and_account(self):
        self.assertEqual(intent("Läs senaste mejlet om fredag i Strato."), ("latest_subject", ("Strato", "fredag")))
        self.assertIsNone(intent("Läs inte det senaste mejlet i Gmail"))

    def test_provider_switch_invalidates_review_and_stale_read(self):
        self.ws.handle(("draft", "Tack!"), "")
        stale = self.ws.draft
        self.ws.reset("Strato")
        self.ws.results.put((0, "read", self.mail, ""))
        self.ws.poll()
        self.ws.send_reviewed(stale)
        self.assertIsNone(self.ws.source)
        self.assertIsNone(self.ws.sending)

    def test_inbox_uses_readonly_uid_and_peek(self):
        with patch("nova_mail.get_account", return_value=(self.mail.account, "dummy")), patch("nova_mail.imaplib.IMAP4_SSL") as constructor:
            box = constructor.return_value.__enter__.return_value
            box.select.return_value = ("OK", [b"4"])
            box.fetch.return_value = ("OK", [b"4 (UID 901)"])
            box.uid.return_value = ("OK", [(b"4 (UID 901", RAW), b")"])
            result = read_inbox("Gmail")
            self.assertEqual(result.body, "Testmeddelande")
            box.select.assert_called_once_with("INBOX", readonly=True)
            self.assertEqual(box.uid.call_args.args[:2], ("FETCH", b"901"))
            self.assertIn("BODY.PEEK", box.uid.call_args.args[2])
            box.uid.return_value = ("OK", [b"901 902"])
            with self.assertRaisesRegex(MailError, "Flera mejl"):
                read_inbox("Strato", "Offert")

    def test_reply_to_exact_address_thread_and_edited_body(self):
        with patch("nova_mail.get_account", return_value=(self.mail.account, "dummy")), patch("nova_mail.smtplib.SMTP_SSL") as connect:
            server = connect.return_value
            server.send_message.return_value = {}
            deliver(Draft(self.mail, "Hej!").edit("append", "Vi ses."))
            msg = server.send_message.call_args.args[0]
            self.assertEqual(str(msg["In-Reply-To"]), "<fixture@example.test>")
            self.assertEqual(str(msg["Subject"]), "Re: Offert")
            self.assertEqual(server.send_message.call_args.kwargs["to_addrs"], ["inkorg@example.test"])
            self.assertEqual(msg.get_content().strip(), "Hej!\nVi ses.")

    def test_screen_is_a_local_request(self):
        for phrase in ("Nova, vad ser du på min skärm?", "Läs det aktiva fönstret.", "Ser du vad jag har på skärmen just nu?"):
            self.assertEqual(self.ws.route(phrase), ("screen", None), phrase)
        self.assertIsNone(self.ws.route("Han undrade vad du ser på skärmen."))

    def test_addressed_interrupt_and_one_turn_correction(self):
        ui = NovaOverlay.__new__(NovaOverlay)
        ui.spoken_reply = Mock(last_text="Jag läser din offert.")
        ui.bridge = Mock()
        ui.bridge.state.online.return_value = False
        ui.expanded = True
        ui._native_conversation_deadline = time.monotonic() + 60
        ui._phase = Mock()
        ui._resume_native_voice_after_reply = Mock()
        ui._received_native_transcript = Mock()
        self.assertFalse(ui._interrupt_phrase("Jag pratar i telefon."))
        self.assertTrue(ui._interrupt_phrase("Nova, vänta, lägg till på fredag."))
        ui.spoken_reply.stop.assert_called_once()
        ui._received_native_transcript.assert_called_once_with("lägg till på fredag.")
        self.assertGreater(ui._voice_turn_until, time.monotonic())
        ui.spoken_reply.last_text = "Nova, vänta"
        self.assertFalse(ui._interrupt_phrase("Nova, vänta"))

    def test_chatgpt_screen_read_keeps_the_requested_site(self):
        for text in ("Jättebra, Nova. Kan du se chatgipetinsidan jag har öppnat?",
                     "Nova, kan du läsa ChatGPT-sidan som jag har öppen?"):
            self.assertEqual(self.ws.route(text), ("page", "chatgpt"))
        for text in ("Han undrade om Nova kan läsa sidan", "Kan du se ChatGPT-sidan och skicka ett mejl?",
                     "Tack till Nova för att hon kan läsa sidan"):
            self.assertIsNone(self.ws.route(text))
        self.assertEqual(self.ws.route("Kan du läsa fliken jag har öppen?"), ("page", None))

    def test_named_project_routes(self):
        self.assertTrue(project_intent('Nova, byt ut "A" mot "B" i filen README.md i projektet Handlarbörsen'))
        self.assertFalse(project_intent("Öppna Omniras kalender"))
        self.assertFalse(project_intent("Ändra inte filen i projektet Omnira"))
