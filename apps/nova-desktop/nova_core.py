"""Pure routing + OS hotkey for Nova Desktop.

Only allowlisted browser destinations and local app shortcuts can be executed.
No arbitrary shell commands, credentials, network AI calls or email writes.
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes
from dataclasses import dataclass
import os
import queue
import re
import threading
import unicodedata

ATLAS = "https://omniraos.se/atlas"
URLS = {
    "gmail": "https://mail.google.com/mail/u/0/#inbox",
    "outlook": "https://outlook.office.com/mail/",
    "atlas": ATLAS,
    "projects": "https://omniraos.se/projects",
    "planning": "https://omniraos.se/planning",
    "handlarborsen": "https://handlarborsen.se/",
    "familjestunden": "https://familje-stunden.se/",
    "facebook": "https://www.facebook.com/",
    "instagram": "https://www.instagram.com/",
    "linkedin": "https://www.linkedin.com/",
    "pinterest": "https://www.pinterest.com/",
}
# Verified on the Windows PC 2026-11-06. Missing shortcuts fail closed.
APP_SHORTCUTS = {
    "vscode": os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows",
                           "Start Menu", "Programs", "Visual Studio Code", "Visual Studio Code.lnk"),
    "chrome": os.path.join(os.environ.get("PROGRAMDATA", ""), "Microsoft", "Windows",
                           "Start Menu", "Programs", "Google Chrome.lnk"),
    "filezilla": os.path.join(os.environ.get("PROGRAMDATA", ""), "Microsoft", "Windows",
                             "Start Menu", "Programs", "FileZilla FTP Client", "FileZilla.lnk"),
    "epic": os.path.join(os.environ.get("PROGRAMDATA", ""), "Microsoft", "Windows",
                         "Start Menu", "Programs", "Epic Games Launcher.lnk"),
    "outlook": os.path.join(os.environ.get("PROGRAMDATA", ""), "Microsoft", "Windows",
                            "Start Menu", "Programs", "Outlook (classic).lnk"),
}
MOD_ALT, MOD_CONTROL, MOD_NOREPEAT, VK_SPACE = 0x0001, 0x0002, 0x4000, 0x20
WM_HOTKEY, WM_QUIT, HOTKEY_ID = 0x0312, 0x0012, 0x4E56


def normalized(value: str) -> str:
    value = unicodedata.normalize("NFKD", value.casefold())
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", value).strip()


@dataclass(frozen=True)
class Action:
    kind: str
    url: str = ""
    description: str = ""


SENSITIVE = re.compile(
    r"\b(las|hamta|sammanfatta|svara|besvara|skicka|maila|radera|"
    r"ta bort|publicera|posta|publicering|betala|kop|and(r|ra)|"
    r"skriv|skapa|planera|generera|analysera|bygg|fixa|utfor|gor)\b"
)
# Natural spoken Swedish requests are normalized first. Only explicit
# navigation intents can open allowlisted sites; arbitrary URLs and shell
# instructions remain unavailable.
NAV = re.compile(
    r"^(?:(?:ar|hej|halla)\s+)?(?:nova[,:]?\s+)?"
    r"(?:(?:kan|skulle|vill)\s+du\s+)?"
    r"(?:oppna|visa|ga\s+till|starta|ta\s+mig\s+till|"
    r"navigera(?:\s+mig)?(?:\s+till)?)\b"
)


def route(text: str) -> Action:
    value = normalized(text)
    if not value:
        return Action("empty", description="Skriv eller diktera ett kommando.")
    if SENSITIVE.search(value):
        return Action("handoff", ATLAS, "Uppdrag till Atlas (kräver kontroll/godkännande).")
    # Read-only list; displays only allowlisted program names, never private titles.
    if re.search(r"\b(oppna fonster|oppna program|aktiva fonster)\b", value) and (
        "visa" in value or "lista" in value or "vilka" in value):
        return Action("windows", description="Visar godkända öppna program.")
    if re.search(r"\b(vaxla till|byt till|aktivera|fokusera)\b", value):
        for pattern, key, label in (
            (r"\b(chrome|webblasaren)\b", "chrome", "Google Chrome"),
            (r"\b(vs ?code|visual studio code)\b", "vscode", "VS Code"),
            (r"\boutlook\b", "outlook", "Outlook"),
            (r"\bfilezilla\b", "filezilla", "FileZilla"),
            (r"\b(epic|epic games)\b", "epic", "Epic Games"),
            (r"\b(utforskaren|filutforskaren)\b", "explorer", "Filutforskaren"),
        ):
            if re.search(pattern, value):
                return Action("focus", key, "Växlar till " + label)
    if NAV.search(value):
        for pattern, key, description in (
            (r"\b(visual studio code|vs ?code|kodredigerare)\b", "vscode", "Startar Visual Studio Code."),
            (r"\bfilezilla\b", "filezilla", "Startar FileZilla."),
            (r"\b(epic|epic games)\b", "epic", "Startar Epic Games Launcher."),
            (r"\b(chrome|google chrome)\b", "chrome", "Startar Google Chrome."),
            (r"\boutlook\b", "outlook", "Startar Outlook på datorn."),
        ):
            if re.search(pattern, value):
                return Action("app", APP_SHORTCUTS[key], description)
        for pattern, key, description in (
            (r"\b(facebook|fb)\b", "facebook", "Öppnar Facebook i webbläsaren."),
            (r"\b(instagram|insta)\b", "instagram", "Öppnar Instagram i webbläsaren."),
            (r"\blinkedin\b", "linkedin", "Öppnar LinkedIn i webbläsaren."),
            (r"\bpinterest\b", "pinterest", "Öppnar Pinterest i webbläsaren."),
            (r"\bhotmail\b", "outlook", "Öppnar Outlook i webbläsaren."),
            (r"\b(gmail|mejl|mail|epost|e-post|inkorg)\b", "gmail", "Öppnar Gmail i webbläsaren."),
            (r"\b(handlarborsen|handlarborsens)\b", "handlarborsen", "Öppnar Handlarbörsen."),
            (r"\b(familje.stunden|familjestunden)\b", "familjestunden", "Öppnar Familje-Stunden."),
            (r"\b(planering|planeringsvy)\b", "planning", "Öppnar Omniras planeringsvy."),
            (r"\b(projekt|webbuilder|webbbyggare|web studio)\b", "projects", "Öppnar Omniras projektvy."),
            (r"\b(atlas|omnira|nova)\b", "atlas", "Öppnar Atlas i Omnira."),
        ):
            if re.search(pattern, value):
                return Action("open", URLS[key], description)
    return Action("handoff", ATLAS, "Uppdrag till Atlas (ingen automatisk åtgärd).")


class HotkeyListener(threading.Thread):
    def __init__(self, events: queue.Queue[str]):
        super().__init__(daemon=True)
        self.events = events
        self.thread_id: int | None = None
        self.ready = threading.Event()
        self.error = ""
        self.user32 = ctypes.WinDLL("user32", use_last_error=True)
        self.kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)

    def run(self) -> None:
        msg = wintypes.MSG()
        self.user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, 0)
        self.thread_id = self.kernel32.GetCurrentThreadId()
        ok = self.user32.RegisterHotKey(None, HOTKEY_ID,
                                        MOD_ALT | MOD_CONTROL | MOD_NOREPEAT, VK_SPACE)
        if not ok:
            self.error = f"Ctrl+Alt+Space kunde inte registreras (Win32 {ctypes.get_last_error()})."
            self.ready.set()
            return
        self.ready.set()
        try:
            while self.user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
                if msg.message == WM_HOTKEY and msg.wParam == HOTKEY_ID:
                    self.events.put("toggle")
        finally:
            self.user32.UnregisterHotKey(None, HOTKEY_ID)

    def stop(self):
        if self.thread_id:
            self.user32.PostThreadMessageW(self.thread_id, WM_QUIT, 0, 0)
