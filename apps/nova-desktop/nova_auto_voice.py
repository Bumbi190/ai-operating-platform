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
from nova_native_tasks import safe_native_voice_action
from nova_campaign_review import campaign_review_intent

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
    "strato", "strato mail", "strato webmail", "min strato",
    "chatgpt", "chat gpt", "spotify",
    "kalender", "kalendern", "kalendern i omnira", "omniras kalender", "calendar",
    "kalendern i om era", "kalendern i omira",
    "planering", "planeringsvy", "planeringsoversikt",
    "marknadsplanering", "marknadsforing", "sociala medier",
    "contentcenter", "content center", "innehallscenter",
    "innehallsoversikt", "omniras innehallsoversikt", "content",
))

# Spoken command punctuation may be recognized, but ignore it only at the
# *end* of the full sentence. Middle punctuation is not a target alias.
_TRAILING_PUNCT = re.compile(r"[.!,?:;]+$")
_DIRECT_FOCUS = re.compile(
    r"^(?:hej\s+)?(?:nova[,\s:]+)?"
    r"(?:kan\s+du\s+)?(?:byt\s+till|vaxla\s+till)\s+"
    r"(?:vs\s*code|visual\s+studio\s+code|outlook|filezilla|epic|epic\s+games)$"
)
_UIA_READ = re.compile(
    r"^(?:hej\s+)?(?:nova[\s,:]+)?"
    r"(?:las|sammanfatta|analysera)\s+"
    r"(?:(?:den\s+har|den\s+aktiva|aktiva|den)\s+)?"
    r"(?:(?:chatgpt|chat\s+gpt)[\s-]+)?"
    r"(?:sidan|chatten|konversationen)\b(?:\s+.*)?$"
)



_SPOKEN_NAME = re.compile(r"^(?:hej[ ,]+)?(?:nova|innova)\b[.,:!?\s]*", re.I)
# Remove only a complete filler at the start, never part of the instruction.
_SPOKEN_FILLER = re.compile(r"^ja(?:,?\s+det)?[,.!?]\s+", re.I)
_SPOKEN_NAV = re.compile(r"^((?:(?:kan|vill|skulle) du )?)navgera\b", re.I)


def native_command_text(phrase: str) -> tuple[str, bool]:
    """Repair the spoken command prefix while preserving literal task contents."""
    phrase = phrase.strip()
    name = _SPOKEN_NAME.match(phrase)
    body = phrase[name.end():] if name else phrase
    body = _SPOKEN_FILLER.sub("", body, count=1)
    body = _SPOKEN_NAV.sub(r"\1navigera", body, count=1)
    return ("Nova, " + body if name else body), bool(name)


def safe_stop_command(text: str) -> Action | None:
    """An exact emergency stop outranks navigation, Atlas handoff and approvals."""
    cleaned = _TRAILING_PUNCT.sub("", normalized(text)).strip()
    cleaned = re.sub(r"^(hej nova|nova)[,:]\s*", r"\1 ", cleaned)
    if cleaned not in {
        "stopp", "stop", "avbryt", "tyst", "sluta prata",
        "nova stopp", "nova stop", "nova avbryt", "nova tyst",
        "nova sluta prata", "hej nova stopp", "hej nova avbryt",
    }:
        return None
    return Action("stop", description="Stoppar Novas aktiva uppdrag och beg?r att Atlas avbryter p?g?ende svar.")


def safe_window_focus(text: str) -> Action | None:
    """Only a small named group of non-destructive application switches."""
    cleaned = _TRAILING_PUNCT.sub("", normalized(text)).strip()
    if not _DIRECT_FOCUS.fullmatch(cleaned):
        return None
    action = route(cleaned)
    return action if action.kind == "focus" and action.url in {
        "vscode", "outlook", "filezilla", "epic"
    } else None


def safe_uia_read_action(text: str) -> Action | None:
    """Prepare a user-approved read of the visible foreground browser page."""
    cleaned = _TRAILING_PUNCT.sub("", normalized(text)).strip()
    if not cleaned or len(cleaned) > 500 or not _UIA_READ.fullmatch(cleaned):
        return None
    return Action(
        "uia_read_preview",
        "active_browser",
        "L\u00e4ser synlig sidtext i aktiv webbl\u00e4sare efter godk\u00e4nnande.",
    )


# Additional conversational forms still require a complete, named destination.
_REQUEST_PREFIX = (
    r"^(?:(?:hej|halla) +)?(?:nova[,:]? +)?"
    r"(?:(?:(?:kan|vill|skulle) du|kan vi) +(?:kunna +)?(?:snalla +)?)?"
)
_CONVERSATIONAL_NAV = re.compile(
    _REQUEST_PREFIX + r"(?:oppna(?: upp)?|visa(?: mig)?|ta mig(?: tillbaka)? till|"
    r"ga (?:in (?:pa|i)|tillbaka till|over till|till)|hoppa (?:in pa|till)|"
    r"navigera(?: mig)?(?: tillbaka)? (?:till|in pa)|vaxla till|byt till) +"
)
_SPOKEN_TARGETS = {
    "om nira": "omnira", "omira": "omnira", "om mira": "omnira", "om era": "omnira",
    "omnila": "omnira", "spot ify": "spotify",
}
_MEDIA_COMMAND = re.compile(
    _REQUEST_PREFIX + r"(?P<verb>tryck(?:a)? pa play|spela(?: upp)?|playa|play|"
    r"satt(?:a)? (?:pa|igang)|starta|ateruppta|fortsatt spela|pausa|paus)"
    r"(?: (?P<object>lite musik|musiken|musik|uppspelningen|laten|den))?"
    r"(?: (?:i |pa )?(?P<app>spotify))?(?: nu)?(?:,? tack)?$"
)


def spotify_command(text: str, *, spotify_selected: bool = False) -> Action | None:
    value = _TRAILING_PUNCT.sub("", normalized(text)).strip()
    match = _MEDIA_COMMAND.fullmatch(value)
    if not match or not (match["app"] or spotify_selected):
        return None
    verb = match["verb"]
    # "Starta Spotify" opens the app. Starting music needs a media object.
    if verb in ("starta", "satt pa", "satta pa", "satt igang", "satta igang") and not match["object"]:
        return None
    return Action("spotify_media", "pause" if verb in ("pausa", "paus") else "play")


def safe_auto_navigation(text: str) -> Action | None:
    cleaned = normalized(text)
    while cleaned and _TRAILING_PUNCT.search(cleaned):
        cleaned = _TRAILING_PUNCT.sub("", cleaned).strip()
    if not cleaned or len(cleaned) > 140:
        return None
    match = _CONVERSATIONAL_NAV.match(cleaned) or NAV.match(cleaned)
    if not match:
        return None
    target = cleaned[match.end():].strip()
    target = re.sub(r"(?:,? (?:tack|ar du snall))$", "", target).removesuffix(" nu")
    if re.fullmatch(r"spot[.,… ]+spotify", target):
        target = "spotify"
    target = _SPOKEN_TARGETS.get(target, target)
    if match.group().strip().endswith(("byt till", "vaxla till")) and target not in ("omnira", "spotify"):
        return None
    if target not in SAFE_NAV_TARGETS:
        return None
    selected = route("öppna " + target)
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

    def observe_submission(self, text: str, now: float, *, spotify_selected: bool = False) -> VoiceDecision | None:
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
            safe_navigation=(safe_stop_command(cleaned)
                             or safe_auto_navigation(cleaned)
                             or spotify_command(cleaned, spotify_selected=spotify_selected)
                             or safe_browser_command(cleaned)
                             or safe_window_focus(cleaned)
                             or safe_native_voice_action(cleaned)
                             or campaign_review_intent(cleaned)
                             or safe_uia_read_action(cleaned)),
        )
        self.cancel()
        return decision
