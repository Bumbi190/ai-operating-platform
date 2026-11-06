"""Nova Desktop: small Windows hotkey companion for the existing Omnira/Atlas.

No AI keys, shell execution, background email access, or unattended publishing.
Requires only Python's standard library on Windows 11.
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes
from dataclasses import dataclass
import os
import queue
import re
import sys
import threading
import unicodedata
import webbrowser
import tkinter as tk
from tkinter import font as tkfont

ATLAS = "https://omniraos.se/atlas"
URLS = {
    "gmail": "https://mail.google.com/mail/u/0/#inbox",
    "outlook": "https://outlook.office.com/mail/",
    "atlas": ATLAS,
    "projects": "https://omniraos.se/projects",
    "planning": "https://omniraos.se/planning",
    "handlarborsen": "https://handlarborsen.se/",
    "familjestunden": "https://familje-stunden.se/",
}
# Only locally verified Start Menu shortcuts; no dynamic executable commands.
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


# Safety-first router: only known destinations are opened without AI.
# Reading private data, sending, editing, publishing and arbitrary jobs are
# never silently executed by this launcher.
SENSITIVE = re.compile(
    r"\b(las|hamta|sammanfatta|svara|besvara|skicka|maila|radera|"
    r"ta bort|publicera|posta|publicering|betala|kop|and(r|ra)|"
    r"skriv|skapa|planera|generera|analysera|bygg|fixa|utfor|gor)\b"
)
NAV = re.compile(r"^(?:hej\s+)?(?:nova[,:]?\s+)?(?:oppna|visa|ga till|starta|ta mig till)\b")


def route(text: str) -> Action:
    value = normalized(text)
    if not value:
        return Action("empty", description="Skriv eller diktera ett kommando.")
    if SENSITIVE.search(value):
        return Action("handoff", ATLAS, "Uppdrag till Atlas (kräver kontroll/godkännande).")
    if NAV.search(value):
        if re.search(r"\b(visual studio code|vs ?code|kodredigerare)\b", value):
            return Action("app", APP_SHORTCUTS["vscode"], "Startar Visual Studio Code.")
        if re.search(r"\b(filezilla)\b", value):
            return Action("app", APP_SHORTCUTS["filezilla"], "Startar FileZilla.")
        if re.search(r"\b(epic|epic games)\b", value):
            return Action("app", APP_SHORTCUTS["epic"], "Startar Epic Games Launcher.")
        if re.search(r"\b(chrome|google chrome)\b", value):
            return Action("app", APP_SHORTCUTS["chrome"], "Startar Google Chrome.")
        if re.search(r"\b(outlook)\b", value):
            return Action("app", APP_SHORTCUTS["outlook"], "Startar Outlook på datorn.")
        if re.search(r"\b(hotmail)\b", value):
            return Action("open", URLS["outlook"], "Öppnar Outlook i webbläsaren.")
        if re.search(r"\b(gmail|mejl|mail|epost|e-post|inkorg)\b", value):
            return Action("open", URLS["gmail"], "Öppnar Gmail i webbläsaren.")
        if re.search(r"\b(handlarborsen|handlarborsens)\b", value):
            return Action("open", URLS["handlarborsen"], "Öppnar Handlarbörsen.")
        if re.search(r"\b(familje.stunden|familjestunden)\b", value):
            return Action("open", URLS["familjestunden"], "Öppnar Familje-Stunden.")
        if re.search(r"\b(planering|planeringsvy)\b", value):
            return Action("open", URLS["planning"], "Öppnar Omniras planeringsvy.")
        if re.search(r"\b(projekt|webbuilder|webbbyggare|web studio)\b", value):
            return Action("open", URLS["projects"], "Öppnar projektvyn i Omnira.")
        if re.search(r"\b(atlas|omnira|nova)\b", value):
            return Action("open", URLS["atlas"], "Öppnar Atlas i Omnira.")
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
        # Create a message queue before any other thread posts a message.
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

    def stop(self) -> None:
        if self.thread_id:
            self.user32.PostThreadMessageW(self.thread_id, WM_QUIT, 0, 0)


class NovaWindow:
    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Nova – Omnira")
        self.root.configure(bg="#111421")
        self.root.geometry(self._initial_geometry())
        self.root.minsize(550, 250)
        self.root.attributes("-topmost", True)
        self.root.protocol("WM_DELETE_WINDOW", self.hide)
        self.events: queue.Queue[str] = queue.Queue()
        self.listener = HotkeyListener(self.events)
        self.mutex = None
        self._build()
        self.root.after(80, self._poll)
        self.listener.start()
        self.root.after(400, self._hotkey_status)

    def _initial_geometry(self) -> str:
        width, height = 690, 282
        return f"{width}x{height}+{max(10,(self.root.winfo_screenwidth()-width)//2)}+110"

    def _build(self) -> None:
        shell = tk.Frame(self.root, bg="#111421", padx=25, pady=17)
        shell.pack(fill="both", expand=True)
        tk.Label(shell, text="NOVA  /  OMNIRA", bg="#111421", fg="#9e9dff",
                 font=("Segoe UI Semibold", 13)).pack(anchor="w")
        tk.Label(shell, text="Din genväg till Atlas, program och uppgifter.",
                 bg="#111421", fg="#c2c5d4", font=("Segoe UI", 11)).pack(anchor="w", pady=(3, 11))
        self.entry = tk.Entry(shell, font=("Segoe UI", 13), bg="#222639", fg="#fafaff",
                              relief="flat", insertbackground="#fafaff", borderwidth=9)
        self.entry.pack(fill="x")
        self.entry.bind("<Return>", lambda _e: self.submit())
        self.entry.bind("<Escape>", lambda _e: self.hide())
        buttons = tk.Frame(shell, bg="#111421")
        buttons.pack(fill="x", pady=(11, 7))
        self._button(buttons, "Utför / öppna", self.submit, "#635bdb").pack(side="left", padx=(0, 9))
        self._button(buttons, "Diktera (Win + H)", self.dictate, "#32384e").pack(side="left", padx=(0, 9))
        self._button(buttons, "Öppna Atlas", lambda: self._open(URLS["atlas"], "Öppnar Atlas."), "#32384e").pack(side="left")
        self._button(buttons, "Avsluta", self.quit, "#272b3b").pack(side="right")
        self.status = tk.StringVar(value="Ctrl + Alt + Space öppnar Nova från andra program.")
        tk.Label(shell, textvariable=self.status, bg="#111421", fg="#a7b0c9",
                 anchor="w", wraplength=630, font=("Segoe UI", 10)).pack(fill="x", pady=(8, 0))
        self.entry.focus_set()

    def _button(self, parent: tk.Frame, text: str, command, color: str):
        return tk.Button(parent, text=text, command=command, font=("Segoe UI", 10),
                         bg=color, fg="white", activebackground="#827bfa",
                         activeforeground="white", relief="flat", cursor="hand2", padx=11, pady=7)

    def _hotkey_status(self) -> None:
        if self.listener.error:
            self.status.set(self.listener.error + " Nova fungerar ändå med mus och text.")

    def _poll(self) -> None:
        try:
            while True:
                if self.events.get_nowait() == "toggle":
                    if self.root.state() == "normal" and self.root.focus_displayof() is not None:
                        self.hide()
                    else:
                        self.show(with_dictation=True)
        except queue.Empty:
            pass
        self.root.after(80, self._poll)

    def show(self, with_dictation: bool = False) -> None:
        self.root.deiconify()
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.entry.focus_force()
        self.entry.select_range(0, "end")
        if with_dictation:
            self.root.after(350, self.dictate)

    def hide(self) -> None:
        self.root.attributes("-topmost", False)
        self.root.iconify()

    def dictate(self) -> None:
        self.entry.focus_force()
        try:
            # Windows' own voice-typing UI. No audio passes through Nova.
            u = ctypes.windll.user32
            VK_LWIN, VK_H, KEYUP = 0x5B, 0x48, 0x0002
            u.keybd_event(VK_LWIN, 0, 0, 0)
            u.keybd_event(VK_H, 0, 0, 0)
            u.keybd_event(VK_H, 0, KEYUP, 0)
            u.keybd_event(VK_LWIN, 0, KEYUP, 0)
            self.status.set("Tala till Windows röstinmatning. Granska texten och tryck Enter.")
        except Exception as exc:
            self.status.set(f"Kunde inte öppna röstinmatningen: {exc}. Skriv istället.")

    def _open(self, url: str, message: str) -> None:
        try:
            if webbrowser.open(url, new=2):
                self.status.set(message + " (webbläsaren avgör om sidan laddas)")
            else:
                self.status.set("Webbläsaren kunde inte bekräfta öppning.")
        except Exception as exc:
            self.status.set(f"Kunde inte öppna webbläsaren: {exc}")

    def submit(self) -> None:
        text = self.entry.get().strip()
        action = route(text)
        if action.kind == "empty":
            self.status.set(action.description)
        elif action.kind == "open":
            self._open(action.url, action.description)
        elif action.kind == "app":
            if os.path.isfile(action.url):
                try:
                    os.startfile(action.url)
                    self.status.set(action.description + " (start begärd)")
                except OSError as exc:
                    self.status.set(f"Programmet kunde inte startas: {exc}")
            else:
                self.status.set("Programgenvägen hittades inte. Inget program startades.")
        elif action.kind == "handoff":
            # Copy-only; Omnira's existing authenticated web app retains control.
            self.root.clipboard_clear()
            self.root.clipboard_append(text)
            self.root.update()
            self._open(action.url, "Uppdraget kopierat. Klistra in med Ctrl+V i Atlas. "
                       "Inga mejl, filer eller inlägg har skickats eller ändrats.")
        else:
            self.status.set("Okänd åtgärd. Ingen ändring gjord.")

    def quit(self) -> None:
        self.listener.stop()
        self.root.destroy()


def main() -> None:
    if sys.platform != "win32":
        print("Nova Desktop Windows kräver Windows.", file=sys.stderr)
        sys.exit(2)
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
    kernel32.CreateMutexW.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    mutex = kernel32.CreateMutexW(None, False, "Local\\OmniraNovaDesktop")
    if ctypes.get_last_error() == 183:
        # Desktop shortcut should bring the existing process to foreground.
        user32 = ctypes.windll.user32
        for caption in ("Nova – Omnira", "Nova - Omnira"):
            hwnd = user32.FindWindowW(None, caption)
            if hwnd:
                user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                user32.SetForegroundWindow(hwnd)
                break
        return
    try:
        app = NovaWindow()
        app.root.mainloop()
    finally:
        if mutex:
            kernel32.CloseHandle(mutex)


if __name__ == "__main__":
    main()
