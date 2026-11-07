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

VOICE_QUIET_SECONDS = 2.6

# Deliberately tiny, explicit utterance grammar. A command with conjunctions,
# secondary instructions, or arbitrary URL text will not match in full.
SAFE_NAV_TARGETS = frozenset((
    "facebook", "fb", "instagram", "insta", "linkedin", "pinterest",
    "gmail", "min gmail", "min mejl", "mejl", "mail", "min mail",
    "hotmail", "outlook", "chrome", "google chrome", "vs code",
    "visual studio code", "filezilla", "epic", "epic games",
    "atlas", "omnira", "handlarborsen", "familje stunden",
    "familje-stunden", "familjestunden", "webbuilder",
))

# Spoken command punctuation may be recognized, but ignore it only at the
# *end* of the full sentence. Middle punctuation is not a target alias.
_TRAILING_PUNCT = re.compile(r"[.!,?:;]+$")


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


@dataclass
class AutoVoiceState:
    """State machine: arm -> observe changes -> silence -> one safe action."""

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

    def observe(self, text: str, now: float) -> Action | None:
        if not self.armed or self.completed:
            return None
        if text != self.latest:
            self.latest = text
            self.last_change_at = now
            self.saw_new_text = self.saw_new_text or text != self.baseline
            return None
        if not self.saw_new_text or self.last_change_at is None:
            return None
        if now - self.last_change_at < self.quiet_seconds:
            return None
        action = safe_auto_navigation(text)
        if action is None:
            # Do not arm a general chat/agent executor. The operator can
            # manually submit this complex or unrecognized request.
            return None
        self.completed = True
        self.armed = False
        return action
