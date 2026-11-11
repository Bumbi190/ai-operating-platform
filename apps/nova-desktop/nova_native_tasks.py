"""Nova Desktop: bounded, inspectable native tasks (first operator MVP).

No general shell, arbitrary URLs, clicks, scripts, web logins, email writes,
publishing or access to browser profiles. Only a small exact vocabulary of
read-only diagnostics and allowlisted navigation can execute.

Multi-step plans always require the operator's approval in the Nova UI.
"""
from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import webbrowser
from datetime import datetime

from nova_core import Action, APP_SHORTCUTS, URLS, normalized

# The projects below were verified to exist on the stationary Windows PC.
_HOME = Path(os.environ.get("USERPROFILE", str(Path.home())))
_REPO_PATHS = {
    "omnira": _HOME / "Projects" / "Omnira" / "Code" / "ai-operating-platform",
    "handlarborsen": _HOME / "Projects" / "Handlarborsen",
}
_FOLDER_PATHS = {
    "omnira": _HOME / "Projects" / "Omnira",
    "handlarborsen": _HOME / "Projects" / "Handlarborsen",
    "familjestunden": _HOME / "Projects" / "Familje-Stunden",
}

# The spoken language is deliberately not open-ended. No arbitrary URL or
# arbitrary filesystem location is accepted from a user utterance here.
_TARGETS = {
    "facebook": ("url", "facebook"),
    "instagram": ("url", "instagram"),
    "linkedin": ("url", "linkedin"),
    "pinterest": ("url", "pinterest"),
    "gmail": ("url", "gmail"),
    "mejl": ("url", "gmail"),
    "min mejl": ("url", "gmail"),
    "hotmail": ("url", "outlook"),
    "atlas": ("url", "atlas"),
    "omnira": ("url", "omnira"),
    "handlarborsen": ("url", "handlarborsen"),
    "familje stunden": ("url", "familjestunden"),
    "familje-stunden": ("url", "familjestunden"),
    "familjestunden": ("url", "familjestunden"),
    "webbuilder": ("url", "projects"),
    "strato": ("url", "strato"),
    "strato webmail": ("url", "strato"),
    "chatgpt": ("url", "chatgpt"),
    "chat gpt": ("url", "chatgpt"),
    "spotify": ("app", "spotify"),
    "kalender": ("url", "calendar"),
    "kalendern": ("url", "calendar"),
    "omniras kalender": ("url", "calendar"),
    "planering": ("url", "planning"),
    "planeringsoversikt": ("url", "planning"),
    "omniras marknadsplanering": ("url", "marketing"),
    "brave": ("app", "brave"),
    "chrome": ("app", "chrome"),
    "google chrome": ("app", "chrome"),
    "vs code": ("app", "vscode"),
    "visual studio code": ("app", "vscode"),
    "filezilla": ("app", "filezilla"),
    "epic games": ("app", "epic"),
    "outlook": ("app", "outlook"),
    "omniras projektmapp": ("folder", "omnira"),
    "handlarborsens projektmapp": ("folder", "handlarborsen"),
    "familje stundens projektmapp": ("folder", "familjestunden"),
}
_ALIAS = {
    "omnira": "Omnira",
    "handlarborsen": "Handlarbörsen",
    "familjestunden": "Familje-Stunden",
}
_PREAMBLE = re.compile(
    r"^(?:(?:hej|halla|ar)\s+)?(?:nova[,:\s]+)?"
    r"(?:(?:kan|vill|skulle)\s+du\s+)?"
)
_TRAILING = re.compile(r"[.!,?:;]+$")
_NOTE = re.compile(
    r"^(?:(?:hej\s+)?nova[\s,:]+)?(?:kan du\s+)?(?:skapa|spara|skriv)\s+"
    r"(?:en\s+)?anteckning(?:\s+med texten\s*:?\s+|\s*:\s*)(.+)$",
    re.IGNORECASE | re.DOTALL,
)
NOTES_DIR = _HOME / "Nova" / "Anteckningar"
_OPEN_VERB = re.compile(r"^(?:oppna|visa|starta|ga till|ta mig till)\s+")
_STATUS = re.compile(
    r"^(?:visa|kolla|kontrollera|ge mig)\s+"
    r"(?:(?:git|projekt)[ -]?)?status\s+(?:(?:pa|for|av)\s+)?"
    r"(omnira|handlarborsen)$"
)
_DISK_PHRASES = frozenset((
    "hur mycket ledigt diskutrymme har jag",
    "hur mycket ledigt utrymme har jag",
    "hur mycket plats har jag kvar pa disken",
    "kolla ledigt diskutrymme",
    "visa ledigt diskutrymme",
))


@dataclass(frozen=True)
class TaskStep:
    kind: str
    key: str              # exact whitelist registry key
    description: str
    note: str = ""


@dataclass(frozen=True)
class TaskPlan:
    steps: tuple[TaskStep, ...]
    requires_approval: bool


@dataclass(frozen=True)
class TaskResult:
    success: bool
    text: str


def _clean(text: str) -> str:
    s = normalized(text)
    s = _TRAILING.sub("", s).strip()
    return _PREAMBLE.sub("", s, count=1).strip()


def _one_open(clause: str, inherit_verb: bool) -> TaskStep | None:
    trimmed = clause.strip()
    match = _OPEN_VERB.match(trimmed)
    if match:
        target = trimmed[match.end():].strip()
    elif inherit_verb:
        target = trimmed
    else:
        return None
    item = _TARGETS.get(target)
    if not item:
        return None
    kind, key = item
    if kind == "url" and key not in URLS:
        return None
    if kind == "app" and key not in APP_SHORTCUTS:
        return None
    if kind == "folder" and key not in _FOLDER_PATHS:
        return None
    return TaskStep(kind, key, "Öppna " + target)


def parse_native_task(text: str) -> TaskPlan | None:
    """Return only read-only diagnostics or an EXACT two/three-step opening plan.

    Single opens are intentionally left to existing Nova routing; no extra
    confirmation or duplicate browser tab is introduced for those.
    """
    if not isinstance(text, str) or len(text) > 2200:
        return None
    note = _NOTE.fullmatch(text.strip())
    if note:
        body = note.group(1).strip()
        if 0 < len(body) <= 2000:
            return TaskPlan((TaskStep("note", "new", "Spara ny anteckning", body),), True)
        return None
    if len(text) > 240:
        return None
    s = _clean(text)
    if not s:
        return None
    status = _STATUS.fullmatch(s)
    if status:
        project = status.group(1)
        return TaskPlan(
            (TaskStep("git_status", project, "Läs lokal Git-status för " + _ALIAS[project]),),
            requires_approval=False,
        )
    if s in _DISK_PHRASES:
        return TaskPlan(
            (TaskStep("disk_free", "system", "Läs ledigt diskutrymme på systemdisken"),),
            requires_approval=False,
        )
    # For multi-step navigation ONLY: no "och skicka", unknown site, path,
    # arbitrary link, semicolon, or interpreted code is allowed.
    clauses = s.split(" och ")
    if len(clauses) == 1:
        step = _one_open(s, inherit_verb=False)
        if step and step.kind == "folder":
            return TaskPlan((step,), False)
    if not 2 <= len(clauses) <= 3:
        return None
    steps: list[TaskStep] = []
    for i, clause in enumerate(clauses):
        action = _one_open(clause, inherit_verb=(i > 0))
        if action is None:
            return None
        steps.append(action)
    return TaskPlan(tuple(steps), requires_approval=True)


def safe_native_voice_action(text: str) -> Action | None:
    """Mark a recognized native task as voice-submittable, not auto-approved."""
    plan = parse_native_task(text)
    if not plan:
        return None
    if plan.requires_approval:
        return Action("native_preview", description="Visa kontrollerad arbetsplan")
    return Action("native_read", description="Läs lokalt projektstatus/utrymme")


def _git_read(path: Path, *args: str) -> str:
    # All arguments are constant templates. Do not accept CLI/paths from text.
    command = [
        "git", "-c", "core.fsmonitor=false", "-C", str(path),
        *args,
    ]
    env = os.environ.copy()
    env["GIT_OPTIONAL_LOCKS"] = "0"
    env["GIT_TERMINAL_PROMPT"] = "0"
    run = subprocess.run(
        command, capture_output=True, text=True,
        errors="replace", timeout=5,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        env=env, check=True,
    )
    return run.stdout.strip()


def execute_native_step(step: TaskStep, *, browser_open=None, app_open=None,
                        git_read=None, disk_usage=None) -> TaskResult:
    """Revalidate every step, including when caller creates TaskStep manually."""
    browser_open = browser_open or webbrowser.open
    git_read = git_read or _git_read
    disk_usage = disk_usage or shutil.disk_usage

    try:
        if step.kind == "note" and step.key == "new" and 0 < len(step.note.strip()) <= 2000:
            NOTES_DIR.mkdir(parents=True, exist_ok=True)
            prefix = datetime.now().strftime("Anteckning-%Y-%m-%d-%H%M%S-")
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=NOTES_DIR,
                                             prefix=prefix, suffix=".txt", delete=False) as file:
                try:
                    file.write(step.note + "\n")
                    file.flush()
                except OSError:
                    file.close()
                    Path(file.name).unlink(missing_ok=True)
                    raise
            return TaskResult(True, "Anteckningen sparades i " + file.name)
        if step.kind == "url" and step.key in URLS and \
                (step.kind, step.key) in _TARGETS.values():
            ok = browser_open(URLS[step.key], new=2)
            return TaskResult(bool(ok),
                              "Öppning begärd: " + step.description +
                              ". Webbplatsens laddning är inte verifierad." if ok
                              else "Webbläsaren bekräftade inte öppningen.")
        if step.kind == "app" and step.key in APP_SHORTCUTS and \
                (step.kind, step.key) in _TARGETS.values():
            path = APP_SHORTCUTS[step.key]
            if not os.path.isfile(path):
                return TaskResult(False, "Programgenvägen hittades inte: " + step.key)
            (app_open or os.startfile)(path)
            return TaskResult(True, "Start begärd: " + step.description +
                              ". Programfönstret är inte verifierat.")
        if step.kind == "folder" and step.key in _FOLDER_PATHS:
            path = _FOLDER_PATHS[step.key]
            if not path.is_dir():
                return TaskResult(False, "Projektmappen finns inte: " + step.key)
            (app_open or os.startfile)(str(path))
            return TaskResult(True, "Filutforskaren ombads öppna " + step.key + ".")
        if step.kind == "git_status" and step.key in _REPO_PATHS:
            path = _REPO_PATHS[step.key]
            if not path.is_dir():
                return TaskResult(False, "Projektmappen finns inte: " + step.key)
            branch = git_read(path, "branch", "--show-current")
            revision = git_read(path, "rev-parse", "--short", "HEAD")
            dirty = git_read(path, "status", "--porcelain=v1", "--untracked-files=no")
            count = len(dirty.splitlines()) if dirty else 0
            summary = (f"{_ALIAS[step.key]}: branch {branch or '(detached)'}, "
                       f"commit {revision}, {count} ändrade spårade filer. "
                       "Endast lokal Git-status, inte driftstatus eller kunddata.")
            return TaskResult(True, summary)
        if step.kind == "disk_free" and step.key == "system":
            drive = os.environ.get("SystemDrive", "C:") + "\\"
            size = disk_usage(drive)
            gb = 1024 ** 3
            return TaskResult(
                True, "Ledigt utrymme på systemdisken: "
                f"{size.free / gb:.1f} GB av {size.total / gb:.1f} GB. "
                "Ingen fil har ändrats.",
            )
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        return TaskResult(False, "Det lokala steget misslyckades: " +
                          type(exc).__name__)
    return TaskResult(False, "Åtgärden är inte godkänd för lokal körning.")
