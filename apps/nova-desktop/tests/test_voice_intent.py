"""Language understanding never supplies executable arguments to the desktop."""
import json
import unittest
from unittest.mock import patch

from nova_core import APP_SHORTCUTS
from nova_voice_intent import interpret


class VoiceIntentTests(unittest.TestCase):
    def classify(self, phrase, decision, selected=False):
        with patch("nova_voice_intent.HTTPConnection") as connect:
            conn = connect.return_value
            response = conn.getresponse.return_value
            response.status = 200
            response.read.return_value = json.dumps({
                "done": True, "message": {"content": json.dumps({"intent": decision})}
            }).encode()
            result = interpret(phrase, selected)
            connect.assert_called_once_with("127.0.0.1", 11434, timeout=18)
            return result

    def test_named_target_and_context(self):
        result = self.classify("Skulle du plocka fram musikappen?", "open_spotify")
        self.assertEqual(result.action.url, APP_SHORTCUTS["spotify"])
        self.assertFalse(result.confirm)
        self.assertFalse(self.classify("Kör igång den igen", "play", True).confirm)
        self.assertTrue(self.classify("Kör igång den igen", "play").confirm)

    def test_model_cannot_supply_a_url_or_path(self):
        self.assertIsNone(self.classify("Visa musikappen", "https://example.org").action)
        self.assertIsNone(self.classify("Visa musikappen", "C:/Windows/example.exe").action)

    def test_reported_negative_and_specific_requests(self):
        with patch("nova_voice_intent.HTTPConnection") as conn:
            for phrase in ("Starta inte Spotify", "Hur startar jag Spotify?",
                           "Hörde mycket musik igår", "Spela en låt av Queen på Spotify",
                           "Öppna Spotify och skicka ett mejl"):
                self.assertIsNone(interpret(phrase, True).action)
            conn.assert_not_called()

    def test_unavailable_model_reports_a_recoverable_failure(self):
        with patch("nova_voice_intent.HTTPConnection") as conn:
            conn.return_value.request.side_effect = ConnectionRefusedError()
            result = interpret("Plocka fram musikappen", False)
            self.assertIsNone(result.action)
            self.assertIn("svarade inte", result.message)
