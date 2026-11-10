"""Nova code-job intake only: project-scoped, reviewable, never an executor."""
import unittest
from pathlib import Path

from nova_code_jobs import PROJECTS, propose_code_job
from nova_core import normalized


class CodeJobProposalTests(unittest.TestCase):
    def test_project_scoped_code_requests(self):
        expected = (
            ("Nova, fixa buggen i WebBuilder", "webbuilder"),
            ("Hej Nova, kan du koda en funktion i Handlarbörsen?", "handlarborsen"),
            ("Implementera ett API i Omnira", "omnira"),
            ("Nova refaktorera koden i portfolion", "portfolio"),
            ("Nova analysera koden i Familje-Stunden", "familjestunden"),
        )
        for phrase, project in expected:
            with self.subTest(phrase=phrase):
                draft = propose_code_job(phrase)
                self.assertIsNotNone(draft)
                self.assertEqual(draft.project, project)
                self.assertEqual(draft.request, phrase)
                self.assertIn("Gör inga ändringar", draft.brief)
                self.assertIn("Inga commits", draft.brief)

    def test_atlas_planning_does_not_leak_local_windows_paths(self):
        draft = propose_code_job("Nova refaktorera koden i Handlarborsen")
        self.assertIsNotNone(draft)
        self.assertIsNotNone(draft.repository)
        self.assertIn(str(draft.repository), draft.brief)
        self.assertNotIn(str(draft.repository), draft.atlas_brief)
        self.assertIn("G?r ingen ?tg?rd", draft.atlas_brief)

    def test_unverified_git_root_is_explicitly_blocked(self):
        draft = propose_code_job("Nova fixa buggen i Familje-Stunden")
        self.assertIsNotNone(draft)
        self.assertEqual(draft.status, "repository_unverified")
        self.assertIsNone(draft.repository)

    def test_repositories_are_literal_registrations_not_speech_paths(self):
        for key in ("omnira", "webbuilder", "handlarborsen", "portfolio"):
            self.assertIsInstance(PROJECTS[key][1], Path)
        self.assertEqual(PROJECTS["omnira"][1], PROJECTS["webbuilder"][1])

    def test_ambiguous_or_non_code_requests_do_not_become_jobs(self):
        rejected = (
            "Nova öppna kalendern i Omnira",
            "Nova planera ett inlägg för Handlarbörsen",
            "Nova fixa mina mejl",
            "Nova fixa bugg i WebBuilder och Handlarbörsen",
            "Nova implementera detta",
            "Nova bygg API i https://attacker.invalid",
            "Nova fixa buggen i WebBuilder C:\\Windows\\System32",
            "Nova granska kod i okändprojekt",
            "Nova implementera API i WebBuilder och portfolion",
            "Nova fixa kalendern",
        )
        for phrase in rejected:
            with self.subTest(phrase=phrase):
                self.assertIsNone(propose_code_job(phrase))

    def test_very_long_or_nontext_input_is_rejected(self):
        self.assertIsNone(propose_code_job(""))
        self.assertIsNone(propose_code_job("Nova koda i Omnira " + "x" * 500))
        self.assertIsNone(propose_code_job(None))

    def test_code_job_status_keeps_swedish_text_readable(self):
        from pathlib import Path
        source = (Path(__file__).resolve().parents[1] / 'nova_overlay.py').read_text(encoding='utf-8')
        start = source.index('    def _present_code_job(')
        end = source.index('    def _present_uia_read_preview(', start)
        messages = source[start:end]
        self.assertIn('Koduppdrag f\u00f6r', messages)
        self.assertIn('Kopiera kodbrief', messages)
        self.assertNotIn('Koduppdrag f?r', messages)
        self.assertNotIn('beh?ver', messages)

    def test_overlay_only_previews_and_never_executes_agent(self):
        source = (Path(__file__).resolve().parents[1] / "nova_overlay.py").read_text(encoding="utf-8")
        self.assertIn("code_job = propose_code_job(text)", source)
        self.assertIn("self._present_code_job(code_job)", source)
        self.assertIn("def _copy_code_job_brief(", source)
        self.assertIn("Ingen agent har startats", source)
        self.assertIn('("Kopiera kodbrief"', source)
        self.assertIn("Planera med Atlas (utan kodändring)", source)
        self.assertIn("self.bridge.state.enqueue(prompt)", source)
        self.assertIn("Ingen kodagent eller verktygskörning startas", source)
        self.assertNotIn("subprocess.Popen", source[source.index("    def _present_code_job("):source.index("    def _received_voice_without_navigation(")])


if __name__ == "__main__":
    unittest.main()
