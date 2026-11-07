"""Windows Nova bubble: a transparent, visible, cancelable launcher for Atlas.

Runs in the interactive user session. No credentials, inbox access or AI model
is stored locally. Verified navigation only; serious work is handed to Atlas.
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes
import math
import os
from pathlib import Path
import queue
import tkinter as tk
from tkinter import font as tkfont, simpledialog
import webbrowser

from nova_core import HotkeyListener, URLS, APP_SHORTCUTS, route, normalized
from nova_bridge import NovaBridge, PROD_ORIGIN, read_saved_preview_origin
from nova_windows import list_known_windows, focus_known_window


TRANSPARENT = "#02030a"
SURFACE = "#141926"
PANEL = "#1b2234"
ACCENT = "#9186ff"
TEXT = "#f6f5ff"
MUTED = "#a9b4ce"
SUCCESS = "#64d6b1"
WARNING = "#ffcf88"
PROJECTS = {
    "Omnira": r"C:\Users\Andre\Projects\Omnira",
    "Handlarbörsen": r"C:\Users\Andre\Projects\Handlarborsen",
    "Familje-Stunden": r"C:\Users\Andre\Projects\Familje-Stunden",
}
BUBBLE_W, BUBBLE_H = 94, 94
PANEL_W, PANEL_H = 442, 600


def work_area():
    """Return the Win32 desktop work area, excluding the taskbar."""
    rect = wintypes.RECT()
    if ctypes.windll.user32.SystemParametersInfoW(48, 0, ctypes.byref(rect), 0):
        return rect.left, rect.top, rect.right, rect.bottom
    user = ctypes.windll.user32
    return 0, 0, user.GetSystemMetrics(0), user.GetSystemMetrics(1)


def anchored_geometry(width: int, height: int, margin: int = 18) -> str:
    left, top, right, bottom = work_area()
    x = max(left, right - width - margin)
    y = max(top, bottom - height - margin)
    return f"{width}x{height}+{x}+{y}"


def rounded_rectangle(canvas: tk.Canvas, x1, y1, x2, y2, radius, **kwargs):
    points = [
        x1 + radius, y1, x2 - radius, y1, x2, y1, x2, y1 + radius,
        x2, y2 - radius, x2, y2, x2 - radius, y2,
        x1 + radius, y2, x1, y2, x1, y2 - radius,
        x1, y1 + radius, x1, y1,
    ]
    return canvas.create_polygon(points, smooth=True, splinesteps=15, **kwargs)


def public_project_command(command: str) -> str | None:
    """Explicit open/locate requests only; never arbitrary filesystem paths."""
    s = normalized(command)
    verbs = ("oppna", "visa", "hitta", "ga till", "ta mig till")
    if not any(s.startswith(v + " ") or s.startswith("nova " + v + " ") for v in verbs):
        return None
    if not any(part in s for part in ("mapp", "katalog", "filutforsk", "projektmapp")):
        return None
    if "handlarborsen" in s:
        return PROJECTS["Handlarbörsen"]
    if "familje stunden" in s or "familje-stunden" in s or "familjestunden" in s:
        return PROJECTS["Familje-Stunden"]
    if "omnira" in s or "atlas" in s:
        return PROJECTS["Omnira"]
    return None


class NovaOverlay:
    def __init__(self):
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title("Nova – Omnira")
        self.root.configure(bg=TRANSPARENT)
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        # Keyed color punches out the window corners on Windows.
        try:
            self.root.wm_attributes("-transparentcolor", TRANSPARENT)
        except tk.TclError:
            pass
        self.root.attributes("-alpha", 0.96)
        self.root.protocol("WM_DELETE_WINDOW", self.collapse)

        self.events: queue.Queue[str] = queue.Queue()
        self.listener = HotkeyListener(self.events)
        self.bridge = NovaBridge()
        # Only a verified local HTTPS preview host is persisted (never tokens).
        # A missing or invalid preference keeps Nova disconnected by default.
        local_app_data = os.environ.get("LOCALAPPDATA")
        self.preview_file = (Path(local_app_data) / "Omnira" / "Nova" / "preview-origin.txt"
                             if local_app_data else None)
        approved_preview = (read_saved_preview_origin(str(self.preview_file))
                            if self.preview_file else None)
        if approved_preview:
            self.bridge.state.switch_origin(approved_preview)
        self.bridge.start()
        self.live_reply_id = None
        self.live_reply_text = ''
        self.expanded = False
        self.phase = "redo"
        self.closed = False
        self.anim_tick = 0
        self.task_epoch = 0
        self.draft = ""
        self.last_transcript = ""
        self.pending = ""
        self.history: list[tuple[str, str]] = []  # session UI trace, not AI memory
        self._setup_fonts()
        self._draw_collapsed()
        self.listener.start()
        self.root.after(100, self._process_events)
        self.root.after(450, self._hotkey_check)
        self.root.after(170, self._animate)
        self.root.after(150, self._poll_bridge)
        self.root.after(900, self._show_bridge_status)
        self.root.deiconify()
        self.root.lift()

    def _setup_fonts(self):
        self.h = ("Segoe UI Semibold", 12)
        self.small = ("Segoe UI", 9)
        self.body = ("Segoe UI", 10)
        self.entry_font = ("Segoe UI", 11)

    def _clear(self):
        for child in self.root.winfo_children():
            child.destroy()

    def _place(self, width: int, height: int):
        self.root.geometry(anchored_geometry(width, height))
        self.root.lift()

    def _canvas(self, w, h):
        c = tk.Canvas(self.root, width=w, height=h, bg=TRANSPARENT,
                      bd=0, highlightthickness=0)
        c.pack(fill="both", expand=True)
        return c

    def _draw_collapsed(self):
        self.expanded = False
        self._clear()
        self._place(BUBBLE_W, BUBBLE_H)
        c = self._canvas(BUBBLE_W, BUBBLE_H)
        c.create_oval(8, 8, 86, 86, fill="#21203f", outline=ACCENT, width=3)
        c.create_oval(16, 16, 78, 78, fill="#302961", outline="")
        c.create_text(47, 43, text="N", fill="#f7f3ff",
                      font=("Segoe UI Semibold", 30))
        c.create_oval(69, 69, 83, 83, fill=SUCCESS, outline=SURFACE, width=2)
        c.bind("<Button-1>", lambda _e: self.expand(False))
        c.bind("<Button-3>", self._bubble_menu)
        c.bind("<Enter>", lambda _e: c.configure(cursor="hand2"))
        self.bubble_canvas = c

    def _bubble_menu(self, event):
        menu = tk.Menu(self.root, tearoff=0)
        menu.add_command(label="Öppna Nova", command=lambda: self.expand(False))
        menu.add_command(label="Anslut Atlas", command=self.connect_atlas)
        menu.add_command(label="Välj skyddad testmiljö", command=self.choose_preview)
        menu.add_command(label="Öppna Atlas", command=lambda: self._open_url(
            URLS["atlas"], "Öppnar Atlas i webbläsaren"))
        menu.add_separator()
        menu.add_command(label="Avsluta Nova", command=self.quit)
        menu.tk_popup(event.x_root, event.y_root)
        menu.grab_release()

    def _draw_expanded(self):
        self.expanded = True
        self._clear()
        self._place(PANEL_W, PANEL_H)
        bg = self._canvas(PANEL_W, PANEL_H)
        rounded_rectangle(bg, 1, 1, PANEL_W - 2, PANEL_H - 2, 25,
                          fill=SURFACE, outline="#535079", width=2)
        content = tk.Frame(bg, bg=SURFACE)
        bg.create_window(18, 18, window=content, anchor="nw",
                         width=PANEL_W - 36, height=PANEL_H - 36)
        top = tk.Frame(content, bg=SURFACE)
        top.pack(fill="x", pady=(0, 9))
        logo = tk.Canvas(top, width=41, height=41, bg=SURFACE,
                         bd=0, highlightthickness=0)
        logo.pack(side="left", padx=(0, 11))
        logo.create_oval(2, 2, 39, 39, fill="#343065", outline=ACCENT, width=1)
        logo.create_text(20, 19, text="N", font=("Segoe UI Semibold", 17), fill=TEXT)
        labels = tk.Frame(top, bg=SURFACE)
        labels.pack(side="left", fill="x", expand=True)
        tk.Label(labels, text="NOVA  ·  OMNIRA", bg=SURFACE, fg=TEXT,
                 font=self.h, anchor="w").pack(anchor="w")
        self.phase_var = tk.StringVar(value="● Redo att hjälpa")
        tk.Label(labels, textvariable=self.phase_var, bg=SURFACE, fg=SUCCESS,
                 font=self.small, anchor="w").pack(anchor="w")
        self.bridge_var = tk.StringVar(value="Atlas: ej ansluten")
        tk.Label(labels, textvariable=self.bridge_var, bg=SURFACE, fg=MUTED,
                 font=("Segoe UI", 8), anchor="w").pack(anchor="w")
        self._btn(top, "×", self.quit, width=3, surface=True).pack(side="right")
        self._btn(top, "–", self.collapse, width=3, surface=True).pack(side="right", padx=(0, 5))
        self._btn(top, "Anslut Atlas", self.connect_atlas, surface=True).pack(side="right", padx=(0, 5))

        self.activity = tk.Canvas(content, width=PANEL_W-36, height=44,
                                  bg=PANEL, highlightthickness=0, bd=0)
        self.activity.pack(fill="x", pady=(0, 9))
        self.activity_text = self.activity.create_text(
            22, 26, anchor="w", text="Tryck på mikrofonen eller skriv till Nova.",
            fill=MUTED, font=self.small)

        chat_container = tk.Frame(content, bg=PANEL, padx=9, pady=7)
        chat_container.pack(fill="both", expand=True)
        scroll = tk.Scrollbar(chat_container, orient="vertical",
                              troughcolor=PANEL, activebackground=ACCENT)
        scroll.pack(side="right", fill="y")
        self.chat = tk.Text(chat_container, height=7, wrap="word", font=self.body,
                            bg=PANEL, fg=TEXT, relief="flat", bd=0,
                            padx=5, pady=9, highlightthickness=0,
                            yscrollcommand=scroll.set)
        self.chat.pack(side="left", fill="both", expand=True)
        scroll.config(command=self.chat.yview)
        self.chat.tag_configure("you", foreground="#b5b4ff", spacing1=10)
        self.chat.tag_configure("nova", foreground=TEXT, spacing1=9)
        self.chat.tag_configure("step", foreground=MUTED, spacing1=4)
        self.chat.tag_configure("warn", foreground=WARNING, spacing1=6)
        self.chat.tag_configure("ok", foreground=SUCCESS, spacing1=5)
        self.chat.config(state="disabled")
        self._render_history()

        live = tk.Frame(content, bg=SURFACE)
        live.pack(fill="x", pady=(10, 2))
        tk.Label(live, text="DET DU SÄGER", bg=SURFACE, fg=MUTED,
                 font=("Segoe UI Semibold", 8)).pack(anchor="w")
        self.transcript_var = tk.StringVar(value="—")
        self.transcript_label = tk.Label(
            live, textvariable=self.transcript_var, bg=SURFACE, fg="#c9c8ff",
            font=self.small, anchor="w", wraplength=384, justify="left")
        self.transcript_label.pack(fill="x", pady=(2, 2))

        self.command = tk.Text(content, height=2, wrap="word", font=self.entry_font,
                               bg="#272b41", fg=TEXT, insertbackground=TEXT,
                               relief="flat", padx=12, pady=9, highlightthickness=1,
                               highlightbackground="#4a496a", highlightcolor=ACCENT)
        self.command.pack(fill="x", pady=(7, 8))
        self.command.bind("<Control-Return>", lambda _e: self.send())
        self.command.bind("<Escape>", lambda _e: self.collapse())
        self.command.bind("<KeyRelease>", self._on_input)
        self.command.insert("1.0", self.draft)
        actions = tk.Frame(content, bg=SURFACE)
        actions.pack(fill="x")
        self._btn(actions, "🎙 Tala", self.dictate).pack(side="left", padx=(0, 5))
        self._btn(actions, "➤ Skicka", self.send, emphasis=True).pack(side="left", padx=(0, 5))
        self._btn(actions, "Projekt", self.show_projects, surface=True).pack(side="left", padx=(0, 5))
        self._btn(actions, "Fönster", self.show_windows, surface=True).pack(side="left", padx=(0, 5))
        self._btn(actions, "Stopp", self.stop, surface=True).pack(side="right")
        self.choices = tk.Frame(content, bg=SURFACE)
        self.choices.pack(fill="x", pady=(6, 0))
        tk.Label(content,
                 text="Ctrl+Alt+Space · Ctrl+Enter skickar · Inga mejl skickas automatiskt",
                 bg=SURFACE, fg="#828ba9", font=("Segoe UI", 8)).pack(
                     fill="x", pady=(9, 0))

        if not self.history:
            self._append("nova", "Nova: Jag öppnar godkända program och projekt. "
                          "Mer avancerade uppdrag lämnar jag till Atlas – utan att "
                          "påstå att de redan är utförda.")
        if self.draft:
            self.transcript_var.set(self.draft[:180])

    def _btn(self, parent, label, callback, emphasis=False, surface=False, width=None):
        return tk.Button(
            parent, text=label, command=callback, width=width, padx=9, pady=7,
            font=("Segoe UI Semibold", 9), cursor="hand2", bd=0, relief="flat",
            bg=("#605bd2" if emphasis else "#313852" if surface else "#403a76"),
            fg=TEXT, activebackground="#746cf3", activeforeground=TEXT,
        )

    def _render_history(self):
        if not hasattr(self, "chat"):
            return
        self.chat.config(state="normal")
        self.chat.delete("1.0", "end")
        for kind, message in self.history:
            self.chat.insert("end", message + "\n", kind)
        self.chat.config(state="disabled")
        self.chat.see("end")

    def _append(self, kind: str, text: str):
        self.history.append((kind, text))
        self.history = self.history[-80:]
        if self.expanded and hasattr(self, "chat"):
            self._render_history()

    def _choices(self, options):
        if not self.expanded:
            return
        for child in self.choices.winfo_children():
            child.destroy()
        for label, callback in options:
            self._btn(self.choices, label, callback, surface=True).pack(
                side="left", padx=(0, 6))

    def _phase(self, state: str, detail: str):
        self.phase = state
        if not self.expanded:
            return
        label, color = {
            "redo": ("● Redo", SUCCESS),
            "lyssnar": ("● Diktering begärd · inväntar text", ACCENT),
            "tolkar": ("● Tolkar kommandot", ACCENT),
            "navigerar": ("● Navigerar – synlig åtgärd", ACCENT),
            "godkannande": ("● Väntar på ditt nästa steg", WARNING),
            "klar": ("● Klar med lokala åtgärden", SUCCESS),
            "stoppad": ("● Stoppad", WARNING),
        }.get(state, ("● Aktiv", MUTED))
        self.phase_var.set(label)
        self.activity.itemconfigure(self.activity_text, text=detail[:90], fill=color)

    def expand(self, listen=False):
        if not self.expanded:
            self._draw_expanded()
        self.root.deiconify()
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.command.focus_force()
        if listen:
            self.root.after(280, self.dictate)

    def collapse(self):
        if self.expanded:
            self.draft = self.command.get("1.0", "end-1c")
        self._draw_collapsed()

    def _hotkey_check(self):
        if self.listener.error and self.expanded:
            self._append("warn", "Nova: " + self.listener.error +
                         " Jag fungerar fortfarande med musen.")

    def choose_preview(self):
        """Explicitly approve one protected preview origin for the current session."""
        self.expand(False)
        preview = simpledialog.askstring(
            "Omnira — skyddad testmiljö",
            "Klistra in exakt HTTPS-adress till Omniras Vercel-preview. "
            "Inga andra domäner accepteras.",
            parent=self.root,
        )
        if not preview:
            self._append("step", "Nova: Inget byte av testmiljö gjordes.")
            return
        try:
            approved = self.bridge.state.switch_origin(preview)
        except ValueError as exc:
            self._append("warn", "Nova: Testadressen avvisades: " + str(exc))
            self._phase("godkannande", "Ange en godkänd Omnira-preview")
            return
        # The origin only is safe to save locally. Never persist the key.
        if self.preview_file:
            try:
                self.preview_file.parent.mkdir(parents=True, exist_ok=True)
                self.preview_file.write_text(approved + "\n", encoding="utf-8")
            except OSError:
                self._append("warn", "Nova: Testmiljön valdes, men kunde inte sparas för nästa start.")
        self._append("ok", "Nova: Testmiljö vald: " + approved + ". Tidigare parning återkallad.")
        self.connect_atlas()

    def connect_atlas(self):
        """Pair through the authenticated Omnira browser, not via stored cookies."""
        target = next(iter(self.bridge.state.origins))
        if target == PROD_ORIGIN:
            self._append("warn", "Nova: Webbdelen är ännu inte publicerad på omniraos.se. "
                         "Välj först en skyddad Vercel-preview för att inte öppna en saknad sida.")
            self.choose_preview()
            return
        self._append("step", "Nova: Öppnar skyddad webbläsarparning (läsläge).")
        self._phase("godkannande", "Klicka Anslut i Omnira-fliken. Webbdelen kräver publicerad preview.")
        try:
            # Only the exact trusted Omnira origin receives the link. Ephemeral
            # secret is in the fragment, never in the HTTP request or cookies.
            if not webbrowser.open(self.bridge.pairing_url(), new=2):
                self._append("warn", "Nova: Webbläsaren kunde inte öppna parningssidan.")
            else:
                self._append("step", "Nova: Skyddad preview öppnad. Logga in och välj Anslut. " +
                             "Novas lokala parningsnyckel sparas inte på disk.")
        except Exception as exc:
            self._append("warn", "Nova: Kopplingen kunde inte initieras: " + str(exc))

    def _show_bridge_status(self):
        if self.expanded and hasattr(self, "bridge_var"):
            self.bridge_var.set("Atlas: kopplad (enbart läsning)" if self.bridge.state.online()
                                else "Atlas: ej ansluten")
        if not self.closed:
            self.root.after(900, self._show_bridge_status)

    def _poll_bridge(self):
        try:
            while True:
                event = self.bridge.state.events.get_nowait()
                kind = event.get("kind")
                if kind == "connected":
                    self._append("ok", "Nova: Autentiserad Atlas-flik har anslutit i läsläge.")
                    self._phase("klar", "Atlas ansluten · inga skrivverktyg")
                elif kind == "queued":
                    self.live_reply_id = None
                    self.live_reply_text = ""
                    self._phase("tolkar", "Atlas förbereder svar")
                elif kind == "text":
                    reply_id = event.get("id")
                    part = event.get("text", "")
                    if reply_id != self.live_reply_id:
                        self.live_reply_id = reply_id
                        self.live_reply_text = ""
                        self._append("nova", "NOVA (ATLAS): ")
                    self.live_reply_text = (self.live_reply_text + part)[:30_000]
                    # Replace a single message row instead of streaming noisy lines.
                    if self.history and self.history[-1][0] == "nova":
                        self.history[-1] = ("nova", "NOVA (ATLAS): " + self.live_reply_text)
                        if self.expanded:
                            self._render_history()
                    self._phase("tolkar", "Atlas svarar i läsläge · " +
                                str(len(self.live_reply_text)) + " tecken")
                elif kind == "done":
                    self._phase("klar", "Atlas svarade · ingen skrivåtgärd utförd")
                    self._append("ok", "Nova: Atlas-svaret klart. Inga arbetsverktyg kördes.")
                    self.live_reply_id = None
                elif kind == "error":
                    self._phase("godkannande", "Atlas kunde inte slutföra svaret")
                    self._append("warn", "Nova: " + event.get("text", "Atlas-svar misslyckades"))
                    self.live_reply_id = None
                elif kind == "canceled":
                    self._append("warn", "Nova: Avbrutet lokalt. Nätverkssvaret kan ha hunnit starta.")
                    self.live_reply_id = None
        except queue.Empty:
            pass
        if not self.closed:
            self.root.after(150, self._poll_bridge)

    def _process_events(self):
        try:
            while True:
                event = self.events.get_nowait()
                if event == "toggle":
                    # Shortcuts open the bubble; already-expanded shortcut
                    # intentionally returns to collapsed bubble.
                    if self.expanded:
                        self.collapse()
                    else:
                        self.expand(listen=True)
        except queue.Empty:
            pass
        if not self.closed:
            self.root.after(100, self._process_events)

    def _animate(self):
        if self.expanded and self.phase == "lyssnar":
            w = PANEL_W - 36
            self.activity.delete("pulse")
            for i in range(7):
                h = 4 + 17 * abs(math.sin(self.anim_tick / 5 + i * .66))
                x = w - 95 + i * 12
                self.activity.create_rectangle(x, 26-h/2, x+6, 26+h/2,
                                               fill=ACCENT, outline="", tags="pulse")
            self.anim_tick += 1
        elif self.expanded:
            self.activity.delete("pulse")
        if not self.closed:
            self.root.after(170, self._animate)

    def _on_input(self, _e=None):
        text = self.command.get("1.0", "end-1c").strip()
        self.draft = text
        self.transcript_var.set(text[-180:] if text else "—")
        if self.phase == "lyssnar" and text:
            self.activity.itemconfigure(self.activity_text,
                                        text="Text mottagen · granska och tryck Ctrl+Enter")

    def dictate(self):
        self.expand(False) if not self.expanded else None
        self.command.focus_force()
        self._phase("lyssnar", "Försöker öppna Windows röstinmatning · ljudnivå mäts inte")
        self._append("step", "Nova · Startar Windows röstinmatning (Win+H).")
        try:
            user32 = ctypes.windll.user32
            # Win+H launches the operating system's voice input into the focused text field.
            for code, flags in ((0x5B, 0), (0x48, 0),
                                (0x48, 0x0002), (0x5B, 0x0002)):
                user32.keybd_event(code, 0, flags, 0)
        except Exception as exc:
            self._phase("godkannande", "Windows-diktering kunde inte öppnas")
            self._append("warn", f"Nova: Diktering misslyckades: {exc}. Skriv istället.")

    def _open_url(self, url: str, caption: str):
        self._phase("navigerar", caption)
        self._append("step", "  ↳ " + caption)
        try:
            opened = webbrowser.open(url, new=2)
        except Exception as exc:
            self._append("warn", f"Nova: Webbläsaren rapporterade ett fel: {exc}")
            self._phase("godkannande", "Öppning misslyckades")
            return
        if opened:
            self._choices([("Öppna Atlas", lambda: self._open_url(URLS["atlas"],
                                                               "Öppnar Atlas")),
                           ("Projekt", self.show_projects)])
            self._append("ok", "Nova: Öppningen skickad till webbläsaren. "
                         "Sidans laddning/inloggning är inte verifierad.")
            self._phase("klar", "Begäran skickad till webbläsaren")
        else:
            self._append("warn", "Nova: Webbläsaren bekräftade inte öppningen.")
            self._phase("godkannande", "Kontrollera webbläsaren")

    def _start_app(self, action):
        self._phase("navigerar", "Startar godkänt Windows-program")
        self._append("step", "  ↳ " + action.description)
        if not os.path.isfile(action.url):
            self._append("warn", "Nova: Programgenvägen hittades inte.")
            self._phase("godkannande", "Programmet saknas")
            return
        try:
            os.startfile(action.url)
            self._append("ok", "Nova: Windows har fått startkommandot. "
                         "Programfönstrets innehåll är inte verifierat.")
            self._phase("klar", "Startkommando skickat")
        except OSError as exc:
            self._append("warn", "Nova: Programmet kunde inte startas: " + str(exc))
            self._phase("godkannande", "Programstart misslyckades")

    def _open_project_folder(self, path: str):
        self._phase("navigerar", "Navigerar till vald projektmapp")
        self._append("step", "  ↳ Filutforskaren: " + os.path.basename(path))
        if not os.path.isdir(path):
            self._append("warn", "Nova: Projektmappen finns inte på denna dator.")
            self._phase("godkannande", "Projektmapp saknas")
            return
        try:
            os.startfile(path)
            self._append("ok", "Nova: Windows fick instruktion att visa projektmappen.")
            self._phase("klar", "Mappöppning begärd")
        except OSError as exc:
            self._append("warn", "Nova: Kunde inte öppna projektmappen: " + str(exc))
            self._phase("godkannande", "Navigeringen misslyckades")

    def _handoff(self, text: str):
        self._phase("godkannande", "Atlas krävs för projektminne och avancerat arbete")
        self.root.clipboard_clear()
        self.root.clipboard_append(text)
        self.root.update()
        self._append("nova", "Nova: Det här kräver Atlas och dess behörigheter. "
                     "Jag har kopierat din begäran och kan öppna Atlas. "
                     "Klistra in med Ctrl+V och godkänn åtgärder där.")
        self._append("warn", "Mejl, sociala inlägg, filer och konton har inte ändrats.")
        self.pending = text
        self._choices([("Öppna Atlas", lambda: self._open_url(URLS["atlas"],
                                                            "Öppnar Atlas för granskning")),
                       ("Kopiera igen", self.copy_pending), ("Avbryt", self.stop)])
        self._phase("godkannande", "Kopierat till urklipp · välj Öppna Atlas")

    def copy_pending(self):
        if not self.pending:
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(self.pending)
        self.root.update()
        self._append("step", "  ↳ Uppdraget kopierades igen, ingen åtgärd skickad.")

    def send(self):
        if not self.expanded:
            self.expand(False)
        text = self.command.get("1.0", "end-1c").strip()
        if not text:
            self._phase("redo", "Skriv eller diktera vad jag ska göra")
            return
        self.task_epoch += 1
        self._append("you", "DU: " + text)
        self._phase("tolkar", "Avgör vilken godkänd åtgärd som passar")
        self.command.delete("1.0", "end")
        self.draft = ""
        self.transcript_var.set(text[:180])
        folder = public_project_command(text)
        if folder:
            self._open_project_folder(folder)
            return
        action = route(text)
        if action.kind == "open":
            self._open_url(action.url, action.description)
        elif action.kind == "app":
            self._start_app(action)
        elif action.kind == "windows":
            self.show_windows()
        elif action.kind == "focus":
            self.focus_window(action.url)
        elif action.kind == "handoff":
            if self.bridge.state.online():
                task_id, detail = self.bridge.state.enqueue(text)
                if task_id:
                    self._phase("tolkar", "Atlas analyserar frågan i läsläge")
                    self._append("step", "  ↳ Fråga skickad till autentiserade Atlas (utan verktyg).")
                else:
                    self._append("warn", "Nova: " + detail)
                    self._phase("godkannande", detail)
            else:
                self._handoff(text)
        else:
            self._phase("redo", "Skriv eller diktera ett kommando")

    def show_windows(self):
        self.expand(False) if not self.expanded else None
        self._phase("navigerar", "Inventerar godkända öppna fönster (läser inte innehåll)")
        try:
            known = list_known_windows()
            seen = set()
            for window in known:
                if window.key not in seen:
                    self._append("step", "  ↳ Öppet: " + window.label)
                    seen.add(window.key)
            self._append("nova", "Nova: " +
                         (f"{len(seen)} godkända appar syns. Säg t.ex. 'Växla till Chrome'."
                          if seen else "Jag hittar inga godkända öppna program."))
            self._phase("klar", "Fönsterinventering avslutad – inget innehåll lästes")
        except Exception as exc:
            self._append("warn", "Nova: Fönsterlistning misslyckades: " + str(exc))
            self._phase("godkannande", "Fönsterlistning misslyckades")

    def focus_window(self, key):
        self._phase("navigerar", "Försöker växla till godkänt öppet program")
        self._append("step", "  ↳ Fönsterbyte: " + key)
        try:
            verified, message = focus_known_window(key)
            self._append("ok" if verified else "warn", "Nova: " + message)
            self._phase("klar" if verified else "godkannande", message)
        except Exception as exc:
            self._append("warn", "Nova: Fönsterbytet misslyckades: " + str(exc))
            self._phase("godkannande", "Fönsterbyte misslyckades")

    def show_projects(self):
        self.expand(False) if not self.expanded else None
        self._append("nova", "Nova: Här är de verifierade lokala arbetsmapparna. "
                     "Atlas är den centrala källan för projektminnet, "
                     "men dess minnestillstånd är inte anslutet till bubblan än.")
        for name, path in PROJECTS.items():
            self._append("step", f"  ↳ {name}: {'hittad' if os.path.isdir(path) else 'saknas'}")
        self._phase("godkannande", "Exempel: Öppna Omniras projektmapp")

    def stop(self):
        self.bridge.state.cancel()
        self.task_epoch += 1
        self._choices([])
        self._phase("stoppad", "Inga fler uppdrag utförs i Nova")
        self._append("warn", "Nova: Avbrutet. Detta stänger inte program eller "
                     "ångrar navigering som redan startats.")
        self.pending = ""

    def quit(self):
        self.closed = True
        self.listener.stop()
        self.bridge.stop()
        self.root.destroy()
