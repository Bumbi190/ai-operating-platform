"""Bounded code-job intake for Nova Desktop.

A spoken/typed code request is a proposal, NOT authority to run a terminal,
edit a repository or spend model tokens. A distinct operator click is needed
before any future agent execution. Project locations are hardcoded to exact,
locally verified repositories; no paths supplied by speech are trusted.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import os
import re

from nova_core import normalized

_HOME = Path(os.environ.get("USERPROFILE", str(Path.home())))

# Only exact repositories verified on the Windows computer. Familje-Stunden
# remains proposal-only until its actual Git repository has been identified.
PROJECTS: dict[str, tuple[str, Path | None]] = {
    "omnira": ("Omnira", _HOME / "Projects" / "Omnira" / "Code" / "ai-operating-platform"),
    "webbuilder": ("Omnira WebBuilder", _HOME / "Projects" / "Omnira" / "Code" / "ai-operating-platform"),
    "handlarborsen": ("Handlarbörsen", _HOME / "Projects" / "Handlarborsen"),
    "portfolio": ("Portfolio", _HOME / "OneDrive" / "Skrivbord" / "Min_Portfolio_Hemsida"),
    "familjestunden": ("Familje-Stunden", None),
}
PROJECT_ALIASES: dict[str, tuple[str, ...]] = {
    "webbuilder": ("webbuilder", "web builder", "web studio", "webstudion"),
    "handlarborsen": ("handlarborsen", "handlar borsen", "handlarborsens"),
    "portfolio": ("portfolio", "portfolion", "min portfolio"),
    "familjestunden": ("familjestunden", "familje stunden", "familje-stunden"),
    "omnira": ("omnira", "omnirans", "omnira os", "omniras"),
}
_CODE_VERBS = re.compile(
    r"\b(?:koda|kodjobb|koduppdrag|kodandring|kodandringar|"
    r"programmera|implementera|refaktorera|refaktorering|"
    r"granska koden|granska kod|analysera koden|"
    r"skriv kod|andra kod|andra koden|"
    r"fixa (?:en |ett |den |det )?(?:bugg|buggen|fel|felet)|"
    r"ratta (?:en |ett |den |det )?(?:bugg|buggen|fel|felet)|"
    r"bygg (?:en |ett )?(?:funktion|integration|api)|"
    r"utveckla (?:en |ett )?(?:funktion|integration|api))\b"
)
_PREAMBLE = re.compile(r"^(?:hej\s+)?nova[,\s:]+")
_UNSAFE_SCOPE = re.compile(r"(?:\.\./|[A-Za-z]:\\|\\\\|https?://)", re.IGNORECASE)


@dataclass(frozen=True)
class CodeJobDraft:
    project: str
    label: str
    repository: Path | None
    request: str
    status: str  # ready_for_review | repository_unverified

    @property
    def atlas_brief(self) -> str:
        """Plan-only cloud handoff omits local filesystem paths."""
        return (
            f"Projekt: {self.label}\n"
            f"?nskem?l: {self.request}\n"
            "Detta ?r ett planeringsunderlag, inte en beh?righet att "
            "k?ra kod. G?r ingen ?tg?rd och beg?r explicit godk?nnande "
            "innan varje eventuellt verktygssteg."
        )

    @property
    def brief(self) -> str:
        repo = str(self.repository) if self.repository else "Repository needs human verification"
        return (
            f"Projekt: {self.label}\n"
            f"Verifierad repo-kandidat: {repo}\n"
            f"Önskemål: {self.request}\n\n"
            "Uppdrag till kodagenten: Undersök omfattningen och redovisa en "
            "kort arbetsplan, berörda filer, teststrategi, risker och "
            "eventuella kostnader. Kontrollera aktuell branch, ocommittade "
            "ändringar och pågående arbete. Bevara allt befintligt arbete. "
            "Gör inga ändringar i detta planeringssteg. "
            "Inga commits, pushes, merges, databasändringar, API-nycklar, "
            "installationer eller produktionsdeploy utan separat godkännande. "
            "Skapa inte nya branches utan att först stämma av behov och "
            "städplan."
        )


def propose_code_job(value: str) -> CodeJobDraft | None:
    """Classify explicit project code requests, fail closed on ambiguity."""
    if not isinstance(value, str) or not (4 <= len(value) <= 500):
        return None
    cleaned = normalized(value)
    cleaned = _PREAMBLE.sub("", cleaned).strip()
    if not _CODE_VERBS.search(cleaned):
        return None
    # Do not map a speech transcript that contains a file path, URL or a
    # second instruction to a filesystem operation; the caller can ask again.
    if _UNSAFE_SCOPE.search(cleaned):
        return None
    found = set()
    for key, aliases in PROJECT_ALIASES.items():
        if any(re.search(r"(?<![a-z0-9])" + re.escape(a) + r"(?![a-z0-9])", cleaned)
               for a in aliases):
            found.add(key)

    # "WebBuilder i Omnira" is one product in one repository, not two jobs.
    if "webbuilder" in found and "omnira" in found:
        found.remove("omnira")
    if len(found) != 1:
        return None

    project = next(iter(found))
    label, repository = PROJECTS[project]
    return CodeJobDraft(
        project=project,
        label=label,
        repository=repository,
        request=value.strip(),
        status="ready_for_review" if repository is not None else "repository_unverified",
    )
