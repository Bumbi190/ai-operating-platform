"""Small, visibly executed, allowlisted browser navigation for Nova Desktop.

No arbitrary clicks, URL typing, page reading, passwords, network access,
scripting, clipboard, form submission or shell commands. Can only focus an
existing *verified* browser window and send a fixed navigation hotkey.

The user may have several Brave windows. Unless we have observed the exact
previously-focused browser window, never guess which window to control.
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes
from dataclasses import dataclass
import re
import sys

from nova_core import Action, normalized
from nova_windows import list_known_windows

BROWSER_KEYS = frozenset(("brave", "chrome", "edge", "firefox"))

# Whitelist is phrased for spoken Swedish. No partial/substring matches:
# "scrolla ner och publicera" must never be treated as scroll.
_SHORTCUTS = {
    "tab_next": (
        ("nasta flik", "ga till nasta flik", "byt till nasta flik",
         "vaxla till nasta flik", "bladdra till nasta flik"),
        (0x11, 0x09), "Nästa flik",  # Ctrl+Tab
    ),
    "tab_previous": (
        ("forra fliken", "foregaende flik", "ga till foregaende flik",
         "byt till forra fliken", "byt till foregaende flik",
         "vaxla till foregaende flik", "ga till forra fliken"),
        (0x11, 0x10, 0x09), "Föregående flik",  # Ctrl+Shift+Tab
    ),
    "back": (
        ("tillbaka", "ga tillbaka", "ga tillbaka i webblasaren",
         "ga tillbaka en sida", "forra sidan", "ga till forra sidan"),
        (0x12, 0x25), "Tillbaka i historiken",  # Alt+Left
    ),
    "forward": (
        ("framat", "ga framat", "ga framat i webblasaren",
         "ga till nasta sidan", "ga fram en sida"),
        (0x12, 0x27), "Framåt i historiken",  # Alt+Right
    ),
    "page_down": (
        ("scrolla ned", "scrolla ner", "scrolla nerat", "scrolla nedat",
         "scrolla ned en sida", "bladdra ned", "bladdra ner"),
        (0x22,), "Scrollar nedåt",  # PageDown
    ),
    "page_up": (
        ("scrolla upp", "scrolla uppat", "scrolla upp en sida",
         "bladdra upp", "ga upp en sida"),
        (0x21,), "Scrollar uppåt",  # PageUp
    ),
}
_FOCUS_PHRASES = frozenset((
    "byt till webblasaren", "vaxla till webblasaren",
    "byt till brave", "vaxla till brave",
    "byt till chrome", "vaxla till chrome",
    "byt till edge", "vaxla till edge",
    "byt till firefox", "vaxla till firefox",
    "visa webblasaren", "visa brave",
))
_PREFIX = re.compile(
    r"^(?:(?:hej|halla)\s+)?(?:nova[,:\s]+\s*)?"
    r"(?:(?:kan|vill|skulle)\s+du\s+)?"
)
_PUNCT = re.compile(r"[.!?,:;]+$")


def safe_browser_command(text: str) -> Action | None:
    text = normalized(text)
    text = _PUNCT.sub("", text).strip()
    if not text or len(text) > 110:
        return None
    phrase = _PREFIX.sub("", text, count=1).strip()
    if phrase in _FOCUS_PHRASES:
        target = next((b for b in BROWSER_KEYS if phrase.endswith(" " + b)), "browser")
        return Action(
            "browser_focus", target,
            "Växla till " + (target.title() if target != "browser"
                             else "senast använda webbläsare")
        )
    for operation, (phrases, _keys, description) in _SHORTCUTS.items():
        if phrase in phrases:
            return Action("browser_control", operation, description)
    return None


class MOUSEINPUT(ctypes.Structure):
    _fields_ = [
        ("dx", wintypes.LONG), ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD), ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD), ("dwExtraInfo", ctypes.c_size_t),
    ]


class KEYBDINPUT(ctypes.Structure):
    _fields_ = [
        ("wVk", wintypes.WORD), ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD), ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.c_size_t),
    ]


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = [
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD),
    ]


class INPUT_UNION(ctypes.Union):
    _fields_ = [("mi", MOUSEINPUT), ("ki", KEYBDINPUT),
                ("hi", HARDWAREINPUT)]


class INPUT(ctypes.Structure):
    _fields_ = [("type", wintypes.DWORD), ("u", INPUT_UNION)]


@dataclass(frozen=True)
class BrowserResult:
    accepted: bool
    message: str


class BrowserNavigator:
    def __init__(self, user32=None, enumerator=None):
        if sys.platform != "win32":
            raise RuntimeError("Windows required")
        self.u = user32 or ctypes.WinDLL("user32", use_last_error=True)
        self.enumerator = enumerator or list_known_windows
        self.last_hwnd: int | None = None
        if user32 is None:
            self.u.GetForegroundWindow.argtypes = []
            self.u.GetForegroundWindow.restype = wintypes.HWND
            self.u.SetForegroundWindow.argtypes = [wintypes.HWND]
            self.u.SetForegroundWindow.restype = wintypes.BOOL
            self.u.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
            self.u.GetAsyncKeyState.argtypes = [ctypes.c_int]
            self.u.GetAsyncKeyState.restype = wintypes.SHORT
            self.u.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
            self.u.SendInput.restype = wintypes.UINT

    def remember_foreground(self):
        """Observe only a known browser HWND, never page content or titles."""
        hwnd = int(self.u.GetForegroundWindow() or 0)
        if not hwnd:
            return
        matching = [w for w in self.enumerator()
                    if w.handle == hwnd and w.key in BROWSER_KEYS]
        if matching:
            self.last_hwnd = hwnd

    def choose(self, preferred: str | None = None):
        browsers = [w for w in self.enumerator() if w.key in BROWSER_KEYS
                    and (preferred is None or w.key == preferred)]
        if not browsers:
            return None, "Ingen godkänd webbläsare med öppet fönster hittades."
        current = int(self.u.GetForegroundWindow() or 0)
        for w in browsers:
            if w.handle == current:
                self.last_hwnd = current
                return w, ""
        for w in browsers:
            if w.handle == self.last_hwnd:
                return w, ""
        if len(browsers) == 1:
            return browsers[0], ""
        return None, (
            "Flera webbläsarfönster finns. Klicka på rätt fönster en gång, "
            "öppna Nova igen och upprepa kommandot."
        )

    def _focus(self, window) -> bool:
        current = int(self.u.GetForegroundWindow() or 0)
        if current != window.handle:
            self.u.ShowWindow(window.handle, 9)  # restore if minimized
            self.u.SetForegroundWindow(window.handle)
        # Must check *actual* foreground handle after Windows focus policy.
        return int(self.u.GetForegroundWindow() or 0) == window.handle

    def _modifiers_released(self) -> bool:
        # User's still-held Ctrl+Alt+Space must never be combined with input.
        return not any(
            int(self.u.GetAsyncKeyState(key)) & 0x8000
            for key in (0x10, 0x11, 0x12, 0x5B, 0x5C)
        )

    def execute(self, action: Action) -> BrowserResult:
        if action.kind not in ("browser_control", "browser_focus"):
            return BrowserResult(False, "Okänd navigeringsåtgärd.")
        if action.kind == "browser_control" and action.url not in _SHORTCUTS:
            return BrowserResult(False, "Otillåtet webbläsarkommando.")
        if action.kind == "browser_focus" and action.url not in BROWSER_KEYS | {"browser"}:
            return BrowserResult(False, "Otillåtet webbläsarmål.")
        preferred = (action.url if action.kind == "browser_focus"
                     and action.url in BROWSER_KEYS else None)
        window, reason = self.choose(preferred)
        if window is None:
            return BrowserResult(False, reason)
        if not self._modifiers_released():
            return BrowserResult(False, "Släpp Ctrl, Alt, Shift och Windows-tangenten och försök igen.")
        if not self._focus(window):
            return BrowserResult(False, "Windows kunde inte aktivera rätt webbläsarfönster.")
        if action.kind == "browser_focus":
            self.last_hwnd = window.handle
            return BrowserResult(True, "Växlade till " + window.label + ".")
        keys = _SHORTCUTS[action.url][1]
        # Input is sent only after choosing and activating a verified browser.
        # Chords are bounded to 1–3 keys, with no arbitrary text or mouse clicks.
        sequence = [
            (vk, 0) for vk in keys
        ] + [
            (vk, 0x0002) for vk in reversed(keys)
        ]
        packet = (INPUT * len(sequence))()
        for i, (vk, flags) in enumerate(sequence):
            packet[i].type = 1  # INPUT_KEYBOARD
            packet[i].u.ki = KEYBDINPUT(vk, 0, flags, 0, 0)
        if int(self.u.GetForegroundWindow() or 0) != window.handle:
            return BrowserResult(False, "Webbläsaren tappade fokus innan navigeringen.")
        sent = int(self.u.SendInput(len(packet), packet, ctypes.sizeof(INPUT)))
        if sent != len(packet):
            # A partial insertion could have left Ctrl/Alt/Shift down.
            # Send bounded key-up cleanup while the same verified browser
            # still owns focus. No extra click, text or command is introduced.
            if sent > 0 and int(self.u.GetForegroundWindow() or 0) == window.handle:
                releases = (INPUT * len(keys))()
                for i, vk in enumerate(reversed(keys)):
                    releases[i].type = 1
                    releases[i].u.ki = KEYBDINPUT(vk, 0, 0x0002, 0, 0)
                self.u.SendInput(len(releases), releases, ctypes.sizeof(INPUT))
            return BrowserResult(False, "Windows blockerade tangentkommandot (t.ex. behörighetsnivå).")
        self.last_hwnd = window.handle
        return BrowserResult(
            True, f"{action.description} i {window.label} – tangentkommandot skickat. "
                  "Webbplatsens resultat är inte verifierat."
        )
