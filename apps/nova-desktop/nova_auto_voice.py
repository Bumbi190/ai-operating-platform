"""Strict one-shot auto navigation from Windows voice-typed text.

Windows voice typing does not expose an authoritative 'utterance finished'
event to Tkinter. We approximate end of command by waiting for unchanged text.
Auto execution is restricted to exact allowlisted navigation commands; richer
requests, arbitrary URLs, code, mail, publishing and file mutations never run.
"""
from __future__ import annotations

from dataclasses import dataclass
import re

from nova_core import Action, NAV, normalized, route
from nova_browser_nav import safe_browser_command

VOICE_QUIET_SECONDS = 3.0

# Deliberately tiny, explicit utterance grammar. A command with conjunctions,
# secondary instructions, or arbitrary URL text will not match in full.
SAFE_NAV_TARGETS = frozenset((
    "facebook", "fb", "instagram", "insta", "linkedin", "pinterest",
    "gmail", "min gmail", "min mejl", "mejl", "mail", "min mail",
    "hotmail", "outlook", "brave", "chrome", "google chrome", "vs code",
    "visual studio code", "filezilla", "epic", "epic games",
    "atlas", "omnira", "handlarborsen", "familje stunden",
    "familje-stunden", "familjestunden", "webbuilder",
))

# Spoken command punctuation may be recognized, but ignore it only at the
# *end* of the full sentence. Middle punctuation is not a target alias.
_TRAILING_PUNCT = re.compile(r"[.!,?:;]+$")
_DIRECT_FOCUS = re.compile(
    r"^(?:hej\s+)?(?:nova[,\s:]+)?"
    r"(?:kan\s+du\s+)?(?:byt\s+till|vaxla\s+till)\s+"
    r"(?:vs\s*code|visual\s+studio\s+code|outlook|filezilla|epic|epic\s+games)$"
)


def safe_window_focus(text: str) -> Action | None:
    """Only a small named group of non-destructive application switches."""
    cleaned = _TRAILING_PUNCT.sub("", normalized(text)).strip()
    if not _DIRECT_FOCUS.fullmatch(cleaned):
        return None
    action = route(cleaned)
    return action if action.kind == "focus" and action.url in {
        "vscode", "outlook", "filezilla", "epic"
    } else None


def safe_auto_navigation(text: str) -> Action | None:
    cleaned = normalized(text)
    while cleaned and _TRAILING_PUNCT.search(cleaned):
        cleaned = _TRAILING_PUNCT.sub("", cleaned).strip()
    if not cleaned or len(cleaned) > 140:
        return None
    match = NAV.match(cleaned)
    if not match:
        return None
    target = cleaned[match.end():].strip()
    if target not in SAFE_NAV_TARGETS:
        return None
    selected = route(cleaned)
    if selected.kind not in ("open", "app"):
        return None
    return selected


@dataclass(frozen=True)
class VoiceDecision:
    """Receiving speech is automatic; executing any side effect is separate."""
    text: str
    safe_navigation: Action | None


@dataclass
class AutoVoiceState:
    """State machine: arm -> observe changes -> quiet text -> one submission."""

    quiet_seconds: float = VOICE_QUIET_SECONDS
    armed: bool = False
    baseline: str = ""
    latest: str = ""
    last_change_at: float | None = None
    saw_new_text: bool = False
    completed: bool = False

    def arm(self, baseline: str):
        self.armed = True
        self.baseline = baseline
        self.latest = baseline
        self.last_change_at = None
        self.saw_new_text = False
        self.completed = False

    def cancel(self):
        self.armed = False
        self.completed = True

    def _stabilized(self, text: str, now: float) -> bool:
        if not self.armed or self.completed:
            return False
        if text != self.latest:
            self.latest = text
            self.last_change_at = now
            self.saw_new_text = self.saw_new_text or text != self.baseline
            return False
        return bool(
            self.saw_new_text
            and self.last_change_at is not None
            and now - self.last_change_at >= self.quiet_seconds
        )

    def observe(self, text: str, now: float) -> Action | None:
        """Compatibility: previous safe-navigation-only interface."""
        if not self._stabilized(text, now):
            return None
        action = safe_auto_navigation(text)
        if action is not None:
            self.cancel()
        return action

    def observe_submission(self, text: str, now: float) -> VoiceDecision | None:
        """Auto-SEND one transcribed phrase after ~3s, but never auto-authorize.

        A safe navigation is eligible for local execution. Other phrases are
        only passed to a read-only Atlas question or a pending/manual review
        state. No tools, email sends or publishing are granted here.
        """
        if not self._stabilized(text, now):
            return None
        cleaned = text.strip()
        if len(cleaned) < 3:
            return None
        decision = VoiceDecision(
            text=cleaned,
            safe_navigation=(safe_auto_navigation(cleaned)
                             or safe_browser_command(cleaned)
                             or safe_window_focus(cleaned)),
        )
        self.cancel()
        return decision
