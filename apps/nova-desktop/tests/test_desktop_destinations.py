import json
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from nova_destinations import OFFICE, PORTFOLIO, match_entries, request, web_url
from nova_live import LiveCall, respond, tool_scope
from nova_news import parse_headlines
from nova_workspace import Workspace
import test_live_call


class DestinationTests(unittest.TestCase):
    def test_live_utterances_reach_the_desktop_tools(self):
        panel = test_live_call.LiveCallTests().panel()
        panel.workspace = Workspace(panel)
        panel.workspace.job = Mock()
        with patch("nova_workspace.webbrowser.open", return_value=True) as visit:
            panel._received_native_transcript("Vi vill öppna, omnira och navigera mig till office.")
            visit.assert_called_once_with(OFFICE, new=2)
            panel._received_native_transcript("Kan du navigera mig till andrehullkröm.se, min portfolie.")
            self.assertEqual(visit.call_count, 1)
            panel._received_native_transcript("Ja tack.")
            self.assertEqual(visit.call_args.args[0], PORTFOLIO)
            panel._received_native_transcript("Och analysera sidan för mig.")
            self.assertEqual(panel.workspace.job.call_args.args[0], "analyze")
            panel._received_native_transcript("Perfekt, kan du skruva ner musiken?")
            self.assertEqual(panel.workspace.job.call_args.args[0], "volume")
            panel._received_native_transcript("News!")
            panel._received_native_transcript("Jag vill höra på den om AI.")
            self.assertEqual(panel.workspace.job.call_args.args[0], "news")
            panel.voice_interpreter.submit_live.assert_not_called()

    def test_unlisted_destinations_and_compound_reads(self):
        self.assertEqual(request("Gå till exempel.se/Store och analysera sidan"), ("website_analyze", "https://exempel.se/Store"))
        self.assertEqual(request("Öppna exempel.se och gå till Kontakt"), ("website_link", ("https://exempel.se/", "kontakt")))
        self.assertEqual(request("Följ länken Priser"), ("link", "priser"))
        self.assertEqual(request("Öppna Audacity"), ("app_lookup", "Audacity"))
        self.assertIsNone(request("Jag sa att du skulle öppna Audacity"))
        self.assertIsNone(request("Öppna inte Audacity"))
        self.assertIsNone(web_url("https://example.org@elsewhere.se"))
        self.assertIsNone(web_url("file:///C:/Users"))
        for text in ("Öppna Gmail", "Öppna Spotify", "Skapa en anteckning med texten hej"):
            self.assertIsNone(request(text))

    def test_named_folders_and_paths_never_turn_into_domains(self):
        self.assertEqual(request("Öppna min projektmapp Ny Demo"), ("project_folder", "Ny Demo"))
        self.assertEqual(request("Öppna hämtade filer"), ("known_folder", "downloads"))
        self.assertEqual(request(r"Öppna filen C:\Mina Filer\rapport.pdf"), ("local_item", r"C:\Mina Filer\rapport.pdf"))
        self.assertIsNone(request("Min portfolio är väldigt viktig"))
        self.assertEqual(request("Öppna http://localhost:3000/Build"), ("website","http://localhost:3000/Build"))

    def test_app_ids_come_from_the_start_menu(self):
        apps = [{"Name":"Kalkylatorn med graffunktion","AppID":"os-entry"}, {"Name":"Studio One","AppID":"one"}, {"Name":"Studio Two","AppID":"two"}]
        self.assertEqual(match_entries("Kalkylator", apps), apps[:1])
        self.assertEqual(match_entries("Studio", apps), apps[1:])
        self.assertEqual(match_entries("inte installerad", apps), [])

    def test_model_choice_must_be_an_actual_spoken_target(self):
        call = LiveCall("Klara", 0)
        call.hear("Jag skulle gärna vilja jobba i Audacity.")
        for target, valid in (("Audacity", True), ("annan.se", False)):
            with patch("nova_voice_intent._local_chat", return_value=json.dumps({"action":"öppna_namngivet","target":target})):
                result = respond(call.snapshot())
                self.assertEqual(result.action.kind, "live_app_lookup" if valid else "live_ask_target")
        call.hear("Vad har hänt inom maskininlärning?")
        with patch("nova_voice_intent._local_chat", return_value=json.dumps({"action":"nyhetsrubriker","target":"maskininlärning"})):
            self.assertEqual(respond(call.snapshot()).action.url, "maskininlärning")
        call.hear("Kan du göra musiken lite svagare?")
        self.assertNotIn("spela", tool_scope(call.snapshot()[0]))

    def test_news_uses_only_recent_dated_headlines_with_a_source(self):
        xml = b"<rss><channel><item><title>Current AI story - Publisher</title><source>Publisher</source><pubDate>Wed, 11 Nov 2026 10:00:00 GMT</pubDate></item><item><title>Old</title><source>Old paper</source><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate></item></channel></rss>"
        result = parse_headlines(xml, datetime(2026,11,12,tzinfo=timezone.utc))
        self.assertIn("Publisher den 11/11", result)
        self.assertIn("Current AI story", result)
        self.assertNotIn("Old", result)
