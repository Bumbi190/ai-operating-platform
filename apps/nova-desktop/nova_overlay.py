"""Windows Nova bubble: a transparent, visible, cancelable launcher for Atlas.

Runs in the interactive user session. No credentials, inbox access or AI model
is stored locally. Verified navigation only; serious work is handed to Atlas.
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import threading
import time
import tkinter as tk
from tkinter import simpledialog
import webbrowser

from nova_live import LiveCall, uncertain_short_phrase
from nova_alma import ready as alma_ready
from nova_klara import ready as klara_ready
from nova_workspace import Workspace
from nova_commander import CommanderSession, commander_request, project_intent
from nova_core import (
    HotkeyListener, URLS, APP_SHORTCUTS, route, normalized,
    is_operator_request, is_calendar_read_request,
)
from nova_hotkey_host import HostEventListener
from nova_focus import ForegroundFocusGuard, show_idle_bubble
from nova_placement import (
    foreground_window_rectangle, choose_working_zone,
    read_saved_anchor, save_anchor, clear_anchor,
)
from nova_auto_voice import AutoVoiceState, native_command_text, navigation_followup, safe_auto_navigation, safe_stop_command, safe_uia_read_action, safe_window_focus, spotify_command
from nova_native_tasks import (
    NOTES_DIR, TaskPlan, parse_native_task, safe_native_voice_action, execute_native_step,
)
from nova_campaign_review import campaign_review_intent, campaign_review_url
from nova_browser_nav import BrowserNavigator, safe_browser_command
from nova_bridge import NovaBridge, PROD_ORIGIN, read_saved_preview_origin
from nova_uia import UIAutomationError, build_page_read_prompt, find_foreground_browser_window, read_window
from nova_code_jobs import CodeJobDraft, propose_code_job
from nova_local_audio import NativeAudioSession, local_model_ready
from nova_local_voice import CONVERSATION_SECONDS, PILOT_SECONDS
from nova_voice_intent import VoiceInterpreter, local_greeting
from nova_sanna import key_configured, status_speech
from nova_spoken_reply import SpokenReply, speech_chunks, load_reply_mode, save_reply_mode
from nova_windows import list_known_windows, focus_known_window
from nova_theme import (
    TRANSPARENT, SURFACE, PANEL, INPUT, ACCENT, CYAN, TEXT, MUTED,
    SUCCESS, WARNING, BORDER, INITIAL_OPACITY,
    enable_native_dpi, window_scale, paint_premium_panel, paint_nova_orb, PremiumButton, SlimScrollbar,
)
PROJECTS = {
    "Omnira": r"C:\Users\Andre\Projects\Omnira",
    "Handlarbörsen": r"C:\Users\Andre\Projects\Handlarborsen",
    "Familje-Stunden": r"C:\Users\Andre\Projects\Familje-Stunden",
}
BUBBLE_W, BUBBLE_H = 54, 54
PANEL_W, PANEL_H = 416, 520


def cursor_position() -> tuple[int, int]:
    """Physical/logical pointer position in the current Tk process context."""
    point = wintypes.POINT()
    if ctypes.windll.user32.GetCursorPos(ctypes.byref(point)):
        return point.x, point.y
    return 0, 0


def work_area(point: tuple[int, int] | None = None) -> tuple[int, int, int, int]:
    """Usable area for the *pointer's monitor*, not the primary desktop only."""
    px, py = point if point is not None else cursor_position()
    user = ctypes.windll.user32

    class MONITORINFO(ctypes.Structure):
        _fields_ = [
            ("cbSize", wintypes.DWORD),
            ("rcMonitor", wintypes.RECT),
            ("rcWork", wintypes.RECT),
            ("dwFlags", wintypes.DWORD),
        ]

    try:
        # MonitorFromPoint takes POINT by value. Explicit arg/restype avoids
        # truncated monitor handles on 64-bit Windows.
        user.MonitorFromPoint.argtypes = [wintypes.POINT, wintypes.DWORD]
        user.MonitorFromPoint.restype = wintypes.HMONITOR
        user.GetMonitorInfoW.argtypes = [wintypes.HMONITOR, ctypes.POINTER(MONITORINFO)]
        user.GetMonitorInfoW.restype = wintypes.BOOL
        monitor = user.MonitorFromPoint(wintypes.POINT(px, py), 2)
        info = MONITORINFO()
        info.cbSize = ctypes.sizeof(MONITORINFO)
        if monitor and user.GetMonitorInfoW(monitor, ctypes.byref(info)):
            rect = info.rcWork
            return rect.left, rect.top, rect.right, rect.bottom
    except (AttributeError, OSError, TypeError):
        pass
    rect = wintypes.RECT()
    if user.SystemParametersInfoW(48, 0, ctypes.byref(rect), 0):
        return rect.left, rect.top, rect.right, rect.bottom
    return 0, 0, user.GetSystemMetrics(0), user.GetSystemMetrics(1)


def visible_dock_area(
    area: tuple[int, int, int, int],
    pointer: tuple[int, int],
    max_width: int = 1440,
    max_height: int = 960,
) -> tuple[int, int, int, int]:
    """Create a view-sized zone centered near the pointer on ultra-wide desktops.

    A 5120 px screen isn't necessarily a 5120 px visible work *window*.
    Docking at the absolute edge can make a popup unreachable within the
    portion of the desktop currently in use. All resulting coordinates are
    clamped to the monitor's usable area (never offscreen).
    """
    left, top, right, bottom = area
    width = max(0, right - left)
    height = max(0, bottom - top)
    if not width or not height:
        return area
    vw = min(width, max_width)
    vh = min(height, max_height)
    px, py = pointer
    # Put the *right/bottom* edge near the pointer, not at the outer edge of
    # a huge screen. This is the key for a 5120 px Windows desktop where a
    # 1440 px cropped/remote browser viewport may be all the user can see.
    right_edge = min(max(px + 110, left + vw), right)
    bottom_edge = min(max(py + 130, top + vh), bottom)
    return right_edge - vw, bottom_edge - vh, right_edge, bottom_edge


def anchored_geometry(
    width: int, height: int, margin: int = 18,
    area: tuple[int, int, int, int] | None = None,
) -> str:
    left, top, right, bottom = area if area is not None else work_area()
    x = max(left, right - width - margin)
    y = max(top, bottom - height - margin)
    # On a narrow display, use every available pixel without hiding a corner.
    x = min(x, right - width)
    y = min(y, bottom - height)
    return f"{width}x{height}{x:+d}{y:+d}"


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
        enable_native_dpi()
        self.root = tk.Tk()
        self.scale = window_scale(self.root)
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
        self.opacity = INITIAL_OPACITY
        self.opacity_percent = tk.IntVar(value=round(self.opacity * 100))
        self.root.attributes("-alpha", self.opacity)
        self.root.protocol("WM_DELETE_WINDOW", self.collapse)

        self.events: queue.Queue[str] = queue.Queue()
        self.listener = (HostEventListener(self.events)
                         if os.environ.get("NOVA_EXTERNAL_HOTKEY") == "1"
                         else HotkeyListener(self.events))
        self.bridge = NovaBridge()
        # The approved preview host may persist; per-session pairing keys never do.
        local_app_data = os.environ.get("LOCALAPPDATA")
        self.spoken_reply = SpokenReply()
        self.workspace = Workspace(self)
        self.live_call = None
        self._call_on_wake = False
        self._reading_chunks = []
        self.reply_file = Path(local_app_data or str(Path.home())) / "Omnira" / "Nova" / "reply-mode.txt"
        self.reply_mode = load_reply_mode(self.reply_file)
        self._last_unclear_audio = 0.0
        self.last_heard = ""
        self._voice_turn_until = 0.0
        self._voice_answer_until = 0.0
        self._voice_navigation_until = 0.0
        self._sanna_key_notice = False
        self._sanna_key_ready = key_configured()
        self._commander = None
        self._commander_review = None
        self._destination_question = False
        self.preview_file = (Path(local_app_data) / "Omnira" / "Nova" / "preview-origin.txt"
                             if local_app_data else None)
        approved_preview = (read_saved_preview_origin(str(self.preview_file))
                            if self.preview_file else None)
        if approved_preview:
            self.bridge.state.switch_origin(approved_preview)
        # Dedicated marketing preview, independent of the Atlas bridge version.
        # File contains only a verified HTTPS preview origin, never credentials.
        self.campaign_preview_file = (
            Path(local_app_data) / "Omnira" / "Nova" / "campaign-preview-origin.txt"
            if local_app_data else None
        )
        self.bridge.start()
        self._bridge_speech_id = None
        self._bridge_speech_started = self._bridge_speech_ended = 0.0
        self.live_reply_id = None
        self.live_reply_text = ''
        self.expanded = False
        self.phase = "redo"
        self.closed = False
        self.phase_detail = "Redo för ett nytt uppdrag"
        self.task_epoch = 0
        self.draft = ""
        self.last_transcript = ""
        self.pending = ""
        self._waiting_operator_request = None
        self.pending_choices = []  # only visible inside the ⋯ menu
        self.pending_native_plan: TaskPlan | None = None
        self.pending_uia_read_instruction: str | None = None
        self.pending_uia_read_target: dict | None = None
        self.uia_results: queue.Queue = queue.Queue()
        self.native_task_epoch = 0
        self.history: list[tuple[str, str]] = []  # session UI trace, not AI memory
        # An approved saved preview is a hint that the user previously signed
        # in; NOT proof of a live SSO session. An expired session still needs
        # browser login, and we never persist browser cookies or pairing keys.
        self._atlas_login_opened = bool(approved_preview)
        self._voice_request_id = 0
        self._auto_voice = AutoVoiceState()
        self.voice_interpreter = VoiceInterpreter()
        self._voice_suggestion = None
        self._browser = BrowserNavigator()
        self.auto_voice_enabled = tk.BooleanVar(value=True)
        # Only a user gesture starts capture. Opening at login leaves the mic off.
        self.native_mic_hotkey = tk.BooleanVar(value=True)
        self._local_voice_only = True
        self.spotify_selected = False
        self._media_worker = None
        self._next_media_action = None
        self.native_mic_session: NativeAudioSession | None = None
        self._native_hotkey_pending_until = 0.0
        self._native_conversation_deadline = 0.0
        self._focus_guard = ForegroundFocusGuard()
        self._last_context_rect = None
        self._dock_area = self._area_near_pointer()
        self._placement_file = (Path(local_app_data) / "Omnira" / "Nova" / "position.json"
                                if local_app_data and os.environ.get("NOVA_NO_PLACEMENT_SAVE") != "1"
                                else None)
        self._manual_anchor: tuple[int, int] | None = (
            read_saved_anchor(str(self._placement_file)) if self._placement_file else None
        )
        self._drag_origin = None
        self._dragged = False
        self._setup_fonts()
        self._draw_collapsed()
        self.listener.start()
        self.root.after(100, self._process_events)
        self.root.after(450, self._hotkey_check)
        self.root.after(150, self._poll_bridge)
        self.root.after(160, self._poll_voice_auto)
        self.root.after(125, self._poll_native_mic)
        self.root.after(400, self._remember_active_window)
        self.root.after(900, self._show_bridge_status)
        show_idle_bubble(self.root)
        if self.reply_mode == "sanna" and self._call_voice() == "Klara":
            self.root.after_idle(self._prepare_local_call_voice)
        if os.environ.get("NOVA_START_EXPANDED") == "1":
            self.root.after(180, self._open_from_hotkey)

    def _px(self, value):
        return round(value * self.scale)

    def _setup_fonts(self):
        self.h = ("Segoe UI Semibold", -self._px(21))
        self.small = ("Segoe UI", -self._px(13))
        self.body = ("Segoe UI", -self._px(15))
        self.entry_font = ("Segoe UI", -self._px(16))

    def _size(self, width, height):
        x, y = self._manual_anchor or self._dock_area[2:]
        left, top, right, bottom = work_area((x - 1, y - 1))
        return min(self._px(width), right - left), min(self._px(height), bottom - top)

    def _refresh_scale(self):
        scale = window_scale(self.root)
        if abs(scale - self.scale) < .01 or self._drag_origin is not None:
            return
        self.scale = scale
        self._setup_fonts()
        if not self.expanded:
            self._draw_collapsed()
            return
        self.draft = self.command.get("1.0", "end-1c")
        cursor = self.command.index("insert")
        selection = self.command.tag_ranges("sel")
        focus = self.root.focus_get() is self.command
        transcript = self.transcript_var.get()
        bridge = self.bridge_var.get()
        scroll = self.chat.yview()[0]
        self._draw_expanded()
        self.command.mark_set("insert", cursor)
        if selection:
            self.command.tag_add("sel", *selection)
        self.transcript_var.set(transcript)
        self.bridge_var.set(bridge)
        self.chat.yview_moveto(scroll)
        if focus:
            self.command.focus_set()

    def _clear(self):
        for child in self.root.winfo_children():
            child.destroy()

    def _remember_active_window(self):
        """Remember the last active browser HWND and work area without reading its content."""
        try:
            self._refresh_scale()
            self._browser.remember_foreground()
            candidate = foreground_window_rectangle()
            if candidate is not None:
                cl, ct, cr, cb = candidate
                if cr - cl >= 500 and cb - ct >= 650:
                    self._last_context_rect = candidate
        finally:
            if not self.closed:
                self.root.after(400, self._remember_active_window)

    def _area_near_pointer(self) -> tuple[int, int, int, int]:
        pointer = cursor_position()
        foreground = foreground_window_rectangle()
        if foreground is not None:
            self._last_context_rect = foreground
        return choose_working_zone(
            work_area(pointer), pointer,
            foreground if foreground is not None else self._last_context_rect,
        )

    def _redock_near_pointer(self):
        """Explicit reset: relocate to the active app and clear pinned position."""
        self._manual_anchor = None
        if self._placement_file:
            clear_anchor(str(self._placement_file))
        self._dock_area = self._area_near_pointer()
        self._place(PANEL_W if self.expanded else BUBBLE_W,
                    PANEL_H if self.expanded else BUBBLE_H)

    def _place(self, width: int, height: int):
        width, height = self._size(width, height)
        right, bottom = self._manual_anchor or self._dock_area[2:]
        left, top, monitor_right, monitor_bottom = work_area((right - 1, bottom - 1))
        margin = 0 if self._manual_anchor else self._px(18)
        x = max(left, min(right - width - margin, monitor_right - width))
        y = max(top, min(bottom - height - margin, monitor_bottom - height))
        geometry = f"{width}x{height}{x:+d}{y:+d}"
        self._requested_geometry = geometry
        self.root.geometry(geometry)
        self.root.after(60, self._settle_placement, geometry)

    def _settle_placement(self, geometry):
        # On Windows, resizing a mapped override-redirect window can retain the old origin.
        if not self.closed and self._requested_geometry == geometry and self.root.winfo_ismapped():
            if self.root.geometry() != geometry:
                self.root.geometry(geometry)

    def _begin_drag(self, event):
        self._requested_geometry = None
        self._drag_origin = (
            event.x_root, event.y_root, self.root.winfo_x(), self.root.winfo_y()
        )
        self._dragged = False

    def _move_drag(self, event):
        if self._drag_origin is None:
            return
        sx, sy, ox, oy = self._drag_origin
        dx, dy = event.x_root - sx, event.y_root - sy
        if abs(dx) < 4 and abs(dy) < 4 and not self._dragged:
            return
        self._dragged = True
        left, top, right, bottom = work_area((event.x_root, event.y_root))
        width, height = self.root.winfo_width(), self.root.winfo_height()
        x = max(left, min(ox + dx, right - width))
        y = max(top, min(oy + dy, bottom - height))
        self.root.geometry(f"+{x}+{y}")
        self._manual_anchor = (x + width, y + height)

    def _save_dragged_position(self):
        if not self._dragged or self._manual_anchor is None or not self._placement_file:
            return
        try:
            save_anchor(str(self._placement_file), self._manual_anchor)
        except OSError:
            # The UI remains usable even if AppData is not writable.
            pass

    def _end_bubble_drag(self, _event):
        self._drag_origin = None
        if self._dragged:
            self._save_dragged_position()
        else:
            self._open_from_hotkey(wait_for_name=True)

    def _end_header_drag(self, _event):
        self._drag_origin = None
        self._save_dragged_position()

    def _bind_drag(self, widget, finish=None):
        widget.bind("<ButtonPress-1>", self._begin_drag)
        widget.bind("<B1-Motion>", self._move_drag)
        widget.bind("<ButtonRelease-1>", finish or self._end_header_drag)

    def _canvas(self, w, h):
        c = tk.Canvas(self.root, width=w, height=h, bg=TRANSPARENT,
                      bd=0, highlightthickness=0)
        c.pack(fill="both", expand=True)
        return c

    def _draw_collapsed(self):
        self.expanded = False
        self._clear()
        self._place(BUBBLE_W, BUBBLE_H)
        w, h = self._size(BUBBLE_W, BUBBLE_H)
        c = self._canvas(w, h)
        c.configure(cursor="hand2")

        def draw(hover):
            paint_nova_orb(c, min(w, h), hover=hover, inset=self._px(2))

        draw(False)
        self._bind_drag(c, self._end_bubble_drag)
        c.bind("<Button-3>", self._bubble_menu)
        c.bind("<Enter>", lambda _e: draw(True))
        c.bind("<Leave>", lambda _e: draw(False))
        self.bubble_canvas = c

    def _bubble_menu(self, event):
        menu = tk.Menu(self.root, tearoff=0, bg=SURFACE, fg=TEXT,
                       activebackground=INPUT, activeforeground=TEXT,
                       bd=1, relief="flat")
        menu.add_command(label="Öppna Nova", command=self._open_from_hotkey)
        menu.add_command(label="Flytta Nova till aktivt program", command=self._redock_near_pointer)
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
        px = self._px
        w, h = self._size(PANEL_W, PANEL_H)
        bg = self._canvas(w, h)
        paint_premium_panel(bg, w, h, self.scale)
        content = tk.Frame(bg, bg=SURFACE)
        inset = px(16)
        bg.create_window(inset, inset, window=content, anchor="nw",
                         width=w - 2 * inset, height=h - 2 * inset)
        content.columnconfigure(0, weight=1)
        content.rowconfigure(2, weight=1)

        top = tk.Frame(content, bg=SURFACE)
        top.grid(row=0, column=0, sticky="ew")
        logo = tk.Canvas(top, width=px(38), height=px(38), bg=SURFACE,
                         bd=0, highlightthickness=0)
        logo.pack(side="left", padx=(0, px(10)))
        paint_nova_orb(logo, px(38), background=SURFACE)
        self._btn(top, "×", self.collapse, width=3, surface=True).pack(side="right")
        self.more_button = self._btn(top, "⋯", self._show_more_menu, width=3, surface=True)
        self.more_button.pack(side="right")
        self._refresh_more_button()

        labels = tk.Frame(top, bg=SURFACE)
        labels.pack(side="left", fill="x", expand=True)
        title = tk.Label(labels, text="Nova", bg=SURFACE, fg=TEXT, font=self.h, anchor="w", pady=0)
        title.pack(anchor="w")
        for widget in (top, logo, labels, title):
            self._bind_drag(widget)
        self.phase_var = tk.StringVar()
        self.bridge_var = tk.StringVar(value=self._local_voice_caption())
        self.bridge_status = tk.Label(labels, textvariable=self.bridge_var, bg=SURFACE, fg=MUTED,
                                      font=self.small, anchor="w", cursor="hand2", pady=0)
        self.bridge_status.pack(fill="x")
        self.bridge_status.bind("<Button-1>", lambda _e: self._choose_voice_settings())

        self.activity = tk.Canvas(content, height=px(25), bg=SURFACE, highlightthickness=0, bd=0)
        self.activity.grid(row=1, column=0, sticky="ew", pady=(px(6), px(6)))
        self.activity_dot = self.activity.create_oval(px(3), px(10), px(9), px(16), outline="", fill=CYAN)
        self.activity_text = self.activity.create_text(px(18), px(13), anchor="w", font=self.small)
        self._phase(self.phase, self.phase_detail)

        chat_container = tk.Frame(content, bg=PANEL, padx=px(12), pady=px(7))
        chat_container.grid(row=2, column=0, sticky="nsew")
        scroll = SlimScrollbar(chat_container, scale=self.scale,
                               on_scroll=lambda fraction: self.chat.yview_moveto(fraction))
        scroll.pack(side="right", fill="y")
        self.chat = tk.Text(chat_container, height=1, width=1, wrap="word", font=self.body,
                            bg=PANEL, fg=TEXT, relief="flat", bd=0, padx=px(2), pady=0,
                            highlightthickness=0, spacing2=px(2), yscrollcommand=scroll.set,
                            selectbackground="#485c54", selectforeground=TEXT)
        self.chat.pack(fill="both", expand=True)
        self.chat.tag_configure("speaker", font=("Segoe UI Semibold", -px(12)), foreground=MUTED,
                                spacing1=px(9), spacing3=px(1))
        self.chat.tag_configure("user_name", foreground=ACCENT)
        self.chat.tag_configure("you", foreground=TEXT, spacing3=px(4))
        self.chat.tag_configure("nova", foreground=TEXT, spacing3=px(4))
        for kind, color in (("step", MUTED), ("warn", WARNING), ("ok", SUCCESS)):
            self.chat.tag_configure(kind, foreground=color, font=self.small, spacing1=px(4))
        if not self.history:
            self._append("nova", "Säg ”Hej Nova” följt av ditt uppdrag, eller skriv här.")
        else:
            self._render_history()

        self.voice_options = tk.Frame(content, bg=SURFACE)
        self.voice_options.grid(row=3, column=0, sticky="ew")
        self._display_voice_options()
        self.review_bar = tk.Frame(content, bg=SURFACE)
        self.review_bar.grid(row=4, column=0, sticky="ew")
        self._refresh_review_bar()

        live = tk.Frame(content, bg=SURFACE)
        live.grid(row=5, column=0, sticky="ew", pady=(px(8), px(5)))
        tk.Label(live, text="LIVE", bg=SURFACE, fg=MUTED,
                 font=("Segoe UI Semibold", -px(11))).pack(side="left", padx=(0, px(7)))
        self.transcript_var = tk.StringVar(value=self.last_heard or "—")
        self.transcript_label = tk.Label(live, textvariable=self.transcript_var, bg=SURFACE,
                                         fg=MUTED, font=self.small, anchor="w", width=1)
        self.transcript_label.pack(side="left", fill="x", expand=True)

        self.input_shell = tk.Frame(content, bg=BORDER, padx=1, pady=1)
        self.input_shell.grid(row=6, column=0, sticky="ew")
        self.command = tk.Text(self.input_shell, height=2, width=1, wrap="word", font=self.entry_font,
                               bg=INPUT, fg=TEXT, insertbackground=TEXT, relief="flat", bd=0,
                               padx=px(10), pady=px(6), highlightthickness=0,
                               selectbackground="#485c54", selectforeground=TEXT)
        self.command.pack(fill="x")
        self.command.bind("<FocusIn>", lambda _e: self.input_shell.configure(bg=CYAN))
        self.command.bind("<FocusOut>", lambda _e: self.input_shell.configure(bg=BORDER))
        self.command.bind("<Return>", self._submit_enter)
        self.command.bind("<Control-Return>", self._submit_enter)
        self.command.bind("<Control-period>", self._stop_shortcut)
        self.command.bind("<Escape>", lambda _e: self.collapse())
        self.command.bind("<KeyRelease>", self._on_input)
        self.command.insert("1.0", self.draft)
        actions = tk.Frame(content, bg=SURFACE)
        actions.grid(row=7, column=0, sticky="ew", pady=(px(9), 0))
        self.call_button = self._btn(actions, self._call_label(), self._start_live_call)
        self.call_button.pack(side="left", padx=(0, px(6)))
        self._btn(actions, "Stopp", self.stop).pack(side="left")
        self._btn(actions, "Skicka", self.send, emphasis=True).pack(side="right")

    def _btn(self, parent, label, callback, emphasis=False, surface=False, width=None):
        return PremiumButton(
            parent, label, callback, emphasis=emphasis,
            surface=surface, width=width, compact=(width is not None), scale=self.scale,
        )

    def _render_history(self):
        if not hasattr(self, "chat"):
            return
        self.chat.config(state="normal")
        self.chat.delete("1.0", "end")
        for kind, message in self.history:
            if kind in ("you", "nova"):
                speaker = "Du" if kind == "you" else "Nova"
                if message.startswith("NOVA (ATLAS):"):
                    speaker = "Nova · Atlas"
                tags = ("speaker", "user_name") if kind == "you" else ("speaker",)
                self.chat.insert("end", speaker + "\n", tags)
                message = re.sub(r"^(?:DU(?: \(lokalt tal\))?|Nova|NOVA \(ATLAS\)):\s*", "", message)
            self.chat.insert("end", message + "\n", kind)
        self.chat.config(state="disabled")
        self.chat.see("end")

    def _append(self, kind: str, text: str):
        self.history.append((kind, text))
        self.history = self.history[-80:]
        if self.expanded and hasattr(self, "chat"):
            self._render_history()

    def _display_voice_options(self):
        for child in self.voice_options.winfo_children():
            child.destroy()
        if self.reply_mode == "choose" and self._local_voice_only:
            self._btn(self.voice_options, "Tala med Bengt lokalt",
                      lambda: self._set_reply_mode("windows")).pack(side="left")
            self._btn(self.voice_options, "Anslut Sanna", self._connect_sanna).pack(side="right")

    def _set_reply_mode(self, mode):
        self._stop_reply()
        self.reply_mode = mode
        call = getattr(self, "live_call", None)
        if call and mode in ("sanna", "windows"):
            call.voice = self._call_voice()
        if self._call_voice() != "Klara" or mode == "text":
            self.spoken_reply.release_klara()
        self._sync_call_button()
        try:
            save_reply_mode(self.reply_file, mode)
        except OSError:
            self._append("warn", "Röstvalet gäller tills Nova stängs. Windows kunde inte spara det.")
        if self.expanded:
            self._display_voice_options()
        if mode == "windows" and self._local_voice_only:
            if self._conversation_active():
                self.voice_interpreter.prepare()
            self._play_reply("Nu är uppläsning med Bengt på.")
        elif mode == "sanna":
            self._append("nova", "Sanna är vald för uppläsning i Windows.")
        else:
            self._append("nova", "Lokala svar visas i rutan.")

    def _read_aloud(self, body):
        call = getattr(self, "live_call", None)
        self._reading_chunks = speech_chunks(body, limit=200 if call and call.voice == "Klara" else 540)
        if not getattr(self, "live_call", None) and self.reply_mode not in ("sanna", "windows"):
            self._append("nova", "Välj en röst i menyn för uppläsning.")
            self._reading_chunks.clear()
            return
        self._read_next_chunk()

    def _read_next_chunk(self):
        if not self._reading_chunks:
            return
        try:
            chunk = self._reading_chunks.pop(0)
            call = getattr(self, "live_call", None)
            if call and call.voice == "Klara":
                self.spoken_reply.speak(chunk, klara=True)
            elif call:
                self.spoken_reply.speak(chunk, sanna=call.voice == "Sanna", alma=call.voice == "Alma")
            else:
                self.spoken_reply.speak(chunk, sanna=self.reply_mode == "sanna")
            self._phase("talar", "Nova talar")
        except OSError:
            self._reading_chunks.clear()
            self._append("warn", "Uppläsningen kunde inte starta.")

    def _play_reply(self, message):
        try:
            self.spoken_reply.speak(message)
            self._phase("talar", "Nova läser upp svaret")
        except OSError:
            self._append("warn", "Uppläsningen kunde inte starta. Kontrollera Windows ljudutgång.")

    def _desktop_dialogue(self):
        return getattr(self, "_local_voice_only", False) or getattr(self, "reply_mode", None) == "sanna"

    def _reply(self, kind, message, *, spoken=None):
        self._append(kind, message)
        call = getattr(self, "live_call", None)
        if call and self._conversation_active():
            call.reply(message)
            self._read_aloud(message.removeprefix("Nova: "))
            return
        if getattr(self, "reply_mode", None) == "sanna" and self._conversation_active():
            text = (spoken or message.removeprefix("Nova: ")).strip()[:300]
            try:
                self.spoken_reply.speak(status_speech(text, getattr(self, "_sanna_key_ready", False)), sanna=True)
                self._phase("talar", "Sanna svarar")
            except OSError:
                self._append("warn", "Sannas uppläsning kunde inte starta i Windows.")
            return
        if (getattr(self, "reply_mode", None) == "windows" and self._conversation_active()
                and self._local_voice_only):
            self._play_reply(spoken or message.removeprefix("Nova: "))

    def _stop_reply(self):
        self._reading_chunks = []
        player = getattr(self, "spoken_reply", None)
        if player is not None:
            player.stop()

    def _choices(self, options):
        # Contextual actions are retained but never clutter the chat composer.
        self.pending_choices = list(options)
        self._refresh_more_button()
        if self.expanded and hasattr(self, "review_bar"):
            self._refresh_review_bar()

    def _refresh_review_bar(self):
        for child in self.review_bar.winfo_children():
            child.destroy()
        if not self.pending_choices:
            return
        label, callback = self.pending_choices[0]
        if label.startswith(("Skicka svaret", "Anslut Gmail", "Anslut Strato", "Godkänn", "Spara anteckning", "Kör i Atlas", "Anslut Atlas för uppdraget")):
            self._btn(self.review_bar, label, callback, emphasis=True).pack(side="left")
            cancel_label, cancel = self.pending_choices[-1]
            self._btn(self.review_bar, cancel_label, cancel).pack(side="right")

    def _refresh_more_button(self):
        if self.expanded and hasattr(self, "more_button"):
            self.more_button.set_attention(bool(self.pending_choices))

    def _on_native_mic_hotkey_toggle(self):
        if not self.native_mic_hotkey.get():
            self._end_live_call()
            self._stop_reply()
            self._native_conversation_deadline = 0.0
            self.stop_native_mic_pilot(quiet=True)
        self._phase("redo", "Lokal mikrofon vid snabbkommando" if self.native_mic_hotkey.get()
                    else "Skrivläge vid snabbkommando")

    def start_native_mic_pilot(self):
        """Capture one foreground pilot or the remaining local conversation."""
        if self.native_mic_session and self.native_mic_session.running():
            self._phase("lyssnar", "Lokalt mikrofontest pågår redan")
            return
        voice = self.bridge.state.voice_snapshot()
        if self.bridge.state.online() and voice.get("authorized") and voice.get("mode") != "native":
            self._append(
                "warn",
                "Nova: Koppla från Atlas webbläsarsamtal först. "
                "Jag öppnar inte två mikrofoner samtidigt."
            )
            self._phase("godkannande", "Stäng Atlas-rösten före lokalt test")
            return
        if not self.expanded:
            self.expand(listen=False)
        self._auto_voice.cancel()
        session = NativeAudioSession()
        transcribe = local_model_ready()
        remaining = self._native_conversation_deadline - time.monotonic()
        continuous = self._desktop_dialogue() and self._conversation_active() and transcribe
        limit = CONVERSATION_SECONDS if continuous else PILOT_SECONDS
        seconds = min(limit, remaining) if self._native_conversation_deadline else limit
        if seconds < 0.5:
            self._native_conversation_deadline = 0.0
            self._phase("klar", "Samtalet är pausat · tryck Prata")
            return
        try:
            session.start(seconds=seconds, transcribe=transcribe, conversation=continuous)
        except (RuntimeError, OSError, ValueError) as exc:
            self._append("warn", "Nova: Mikrofonen kunde inte startas (" + str(exc)[:120] + ").")
            self._phase("godkannande", "Lokal mikrofonmiljö saknas eller är upptagen")
            return
        self.native_mic_session = session
        self.spoken_reply.on_output_end = session.playback_ended
        self._phase("startar", "Öppnar mikrofonen")
        if not transcribe:
            self._append("warn", "Den lokala svenska talmodellen saknas. Skriv ditt kommando i rutan.")

    def stop_native_mic_pilot(self, *, quiet: bool = False, preserve_turn: bool = False):
        if not preserve_turn:
            self._discard_voice_interpretation()
        player = getattr(self, "spoken_reply", None)
        if player is not None:
            player.discard_prepared()
            player.on_output_end = None
        session = self.native_mic_session
        self.native_mic_session = None
        if session is None:
            return
        session.stop()
        if not quiet:
            self._append("step", "Nova: Lokal mikrofon stoppad. Inget ljud sparades.")
            self._phase("stoppad", "Lokal mikrofon avstängd")

    def _poll_native_mic(self):
        try:
            session = self.native_mic_session
            if getattr(self, "live_call", None) and not self._conversation_active():
                self.stop()
                return
            if session is None:
                return
            if self._native_conversation_deadline and not self._conversation_active():
                self.stop_native_mic_pilot(quiet=True)
                self._native_conversation_deadline = 0.0
                self._phase("klar", "Samtalet är pausat")
                return
            for event in session.pop_events():
                if session is not self.native_mic_session:
                    return
                kind = event.get("kind")
                if self.spoken_reply.process is not None and kind in ("level", "speech_start", "speech_end", "transcribing"):
                    continue
                audio_start, audio_end = event.get("audio_start"), event.get("audio_end")
                if (getattr(self, "live_call", None) and isinstance(audio_start, (float, int))
                        and audio_start < self.live_call.started and kind in ("transcript", "no_transcript")):
                    continue
                bridge_start = getattr(self, "_bridge_speech_started", 0.0)
                during_bridge = bridge_start and (getattr(self, "_bridge_speech_id", None) or (
                    isinstance(audio_start, (int, float)) and isinstance(audio_end, (int, float)) and
                    audio_start <= self._bridge_speech_ended and audio_end >= bridge_start))
                if kind in ("transcript", "no_transcript") and (during_bridge or self.spoken_reply.overlaps(
                        audio_start, audio_end)):
                    if kind == "transcript" and self._interrupt_phrase(event.get("text", "")):
                        continue
                    heard = event.get("text", "")
                    end_call = getattr(self, "live_call", None) and normalized(heard).strip(" .!?") in ("avsluta samtalet", "pausa samtalet")
                    if kind == "transcript" and (safe_stop_command(heard) or end_call):
                        self.stop()
                        return
                    continue
                if kind == "ready":
                    self._phase("lyssnar", self._listening_hint())
                elif kind == "loading":
                    self._phase("tolkar", "Laddar svensk talmodell lokalt")
                elif kind == "level":
                    if self.phase == "tanker":
                        continue
                    level = event.get("percent", 0)
                    if isinstance(level, (int, float)):
                        self._phase("lyssnar", self._listening_hint() + f" · {max(0, min(level, 100)):.1f} %")
                elif kind == "speech_start":
                    if self.reply_mode == "windows" and self._local_voice_only:
                        self.spoken_reply.prepare()
                    self._phase("lyssnar", self._listening_hint())
                elif kind == "speech_end":
                    self._phase("tolkar", "Talavsnitt avslutat")
                elif kind == "transcribing":
                    self._phase("tolkar", "Tolkar tal lokalt, utan moln")
                elif kind == "transcript":
                    phrase = event.get("text", "")
                    if isinstance(phrase, str) and phrase.strip():
                        if self._native_conversation_deadline and not self._conversation_active():
                            self.stop_native_mic_pilot(quiet=True)
                            self._phase("klar", "Samtalet är pausat · tryck Prata")
                            return
                        # Local navigation and clarification keep the same warm worker.
                        # Sanna playback and reviews pause capture before dispatch.
                        if not (self._conversation_active() and self._desktop_dialogue()):
                            self.stop_native_mic_pilot(quiet=True)
                        # Audio already in the recognizer when Prata was pressed
                        # cannot borrow the new one-turn permission.
                        start = event.get("audio_start")
                        if (isinstance(start, (int, float)) and self._voice_turn_until > time.monotonic()
                                and start < self._voice_turn_until - 15 and not native_command_text(phrase)[1]):
                            continue
                        if (getattr(self, "live_call", None) and uncertain_short_phrase(phrase, event.get("confidence"))
                                and not safe_stop_command(phrase) and normalized(phrase).strip(" .!?") not in
                                ("avsluta samtalet", "pausa samtalet", "vanta", "nova, vanta")):
                            self.last_heard = phrase[:180]
                            self.transcript_var.set(self.last_heard)
                            self._reply("nova", "Jag är osäker på vad jag hörde. Kan du ta den sista meningen igen?")
                            continue
                        self._received_native_transcript(phrase.strip())
                elif kind == "no_transcript":
                    self._phase("lyssnar", self._listening_hint())
                    if ((getattr(self, "live_call", None) or time.monotonic() < self._voice_turn_until)
                            and time.monotonic() - self._last_unclear_audio > 8):
                        self._last_unclear_audio = time.monotonic()
                        self._reply("nova", "Jag hörde ljud men uppfattade inte orden. Kan du säga det igen?")
                elif kind == "warning":
                    if event.get("code") == "TRANSCRIBER_BUSY":
                        self._append("warn", "Nova: Jag hann inte tolka den senaste frasen. Säg den igen.")
                    elif event.get("code") == "CAPTURE_OVERFLOW":
                        self._phase("godkannande", "Varning: ljudsamplingar tappades")
                elif kind == "error":
                    self._append(
                        "warn",
                        "Nova: Lokalt mikrofonfel (" + str(event.get("code", "okänt"))[:90] + ")."
                    )
                    self.stop_native_mic_pilot(quiet=True)
                    self._end_live_call()
                    self._phase("godkannande", "Lokal mikrofon avstängd efter fel")
                elif kind in ("finished", "exit"):
                    self.stop_native_mic_pilot(quiet=True)
                    if kind == "finished" and event.get("reason") == "pilot_timeout" and self._conversation_active():
                        self._resume_native_voice_after_reply()
                    else:
                        self._end_live_call()
                        self._phase("klar", "Mikrofon pausad · välj Samtal för att fortsätta")
        finally:
            if not self.closed:
                self.root.after(125, self._poll_native_mic)

    def _listening_hint(self):
        if getattr(self, "live_call", None):
            return "Samtal · tala fritt"
        now = time.monotonic()
        if now < self._voice_turn_until:
            return "Säg ditt uppdrag"
        if now < self._voice_answer_until:
            return "Väntar på ditt svar"
        if now < getattr(self, "_voice_navigation_until", 0):
            return "Säg nästa navigeringskommando"
        return "Säg ”Hej Nova” eller välj Samtal"

    def _interrupt_reply(self, correction=""):
        self._stop_reply()
        self._discard_voice_interpretation()
        if getattr(self, "live_call", None):
            self._cancel_commander()
            self.workspace.epoch += 1
        if getattr(self, "_bridge_speech_id", None):
            self._bridge_speech_id = None
            self._bridge_speech_ended = time.monotonic() + 0.15
        if self.bridge.state.online():
            self.bridge.state.request_voice_control("voice_interrupt")
            task = self.bridge.state.task
            if task and task.mode in ("nova_voice", "nova_speech"):
                self.bridge.state.cancel()
        self._voice_turn_until = time.monotonic() + 15
        if not self._conversation_active() and self.expanded:
            self._start_panel_voice()
        else:
            self._resume_native_voice_after_reply()
        self._phase("lyssnar", "Pausat · säg din ändring")
        if correction:
            self._received_native_transcript(correction)

    def _interrupt_phrase(self, phrase):
        # An addressed pause is distinguishable from other people in the room.
        match = re.fullmatch(r"(?:(?:hej|okej)[ ,]+)?nova[ ,.!]+(?:avbryt svaret|pausa uppläsningen|pausa svaret|vänta|pausa(?=[.!? ]*$))\b[ ,.!:—-]*(.*)", phrase.strip(), re.I)
        if not match and getattr(self, "live_call", None):
            match = re.fullmatch(r"(?:(?:nej|okej)[ ,]+)?(?:vänta|avbryt svaret|pausa uppläsningen|pausa svaret)\b[ ,.!:—-]*(.*)", phrase.strip(), re.I)
        if not match:
            return False
        spoken = (getattr(self, "live_reply_text", "") if getattr(self, "_bridge_speech_id", None)
                  else getattr(self.spoken_reply, "last_text", ""))
        echo = normalized(re.sub(r"[^\w ]", " ", spoken or ""))
        heard = normalized(re.sub(r"[^\w ]", " ", phrase))
        if heard and heard in echo:
            return False
        self._interrupt_reply(match[1].strip())
        return True

    def _received_native_transcript(self, phrase: str):
        command, has_wake = native_command_text(phrase)
        value = normalized(command)
        conversation = self._conversation_active()
        now = time.monotonic()
        answer = re.sub(r"[\s,.!?]+", " ", value.removeprefix("nova,") if has_wake else value).strip()
        prompted = conversation and now < getattr(self, "_voice_answer_until", 0)
        one_turn = conversation and now < getattr(self, "_voice_turn_until", 0)
        suggestion = getattr(self, "_voice_suggestion", None) if prompted else None
        yes = answer in ("ja", "ja tack", "japp", "precis", "absolut", "garna", "gor det", "ja gor det", "ja tack gor det")
        if suggestion and suggestion.kind in ("open", "app"):
            verb = re.sub(r"^(?:ja(?: tack)? )?", "", answer)
            target = safe_auto_navigation(verb)
            yes = yes or verb in ("oppna den", "oppna det", "starta den") or (target is not None and target == suggestion)
        no = answer in ("nej", "nej tack", "inte det")
        player = getattr(self, "spoken_reply", None)
        if conversation and player is not None and player.process is not None and safe_stop_command(command):
            self.stop()
            return
        if conversation and player is not None and player.process is not None and self._interrupt_phrase(phrase):
            return
        if conversation and has_wake and getattr(self, "_call_on_wake", False):
            self._start_live_call()
            if getattr(self, "live_call", None) and not answer:
                self._reply("nova", "Ja, jag lyssnar.")
                return
        if conversation and getattr(self, "live_call", None):
            self._live_input(re.sub(r"^Nova,\s*", "", command, flags=re.I))
            return
        workspace = getattr(self, "workspace", None)
        workspace_action = workspace.route(command) if workspace else None
        mail_followup = (workspace_action and workspace_action[0] in ("draft", "append", "remove")
                         and now < workspace.follow_until)
        continuation = None
        if not has_wake and conversation and now < getattr(self, "_voice_navigation_until", 0):
            continuation = navigation_followup(command, spotify_selected=getattr(self, "spotify_selected", False))
        screen_followup = (workspace_action and workspace_action[0] in ("screen", "page")
                           and conversation and now < getattr(self, "_voice_navigation_until", 0))
        followup = prompted and (
            (getattr(self, "_destination_question", False) and safe_auto_navigation("öppna " + answer))
            or (suggestion and (yes or no))
            or (getattr(self, "reply_mode", "") == "choose" and answer in ("bengt", "sanna")))
        if not (has_wake or one_turn or followup or continuation or mail_followup or screen_followup):
            return
        self._voice_turn_until = 0.0
        self._voice_answer_until = 0.0
        if has_wake and not answer and conversation:
            self._voice_turn_until = now + 15
            self._phase("lyssnar", "Ja, jag lyssnar på ditt nästa uppdrag")
            return
        self.last_heard = phrase[:180]
        if getattr(self, "expanded", False) and hasattr(self, "transcript_var"):
            self.transcript_var.set(self.last_heard)
        if conversation:
            self._voice_navigation_until = now + 20
        self._discard_voice_interpretation()
        addressed = True
        if safe_stop_command(command) or (has_wake and answer in ("jag pratar i telefon", "pausa lyssningen", "stang av mikrofonen")):
            self.stop()
            return
        if workspace_action and not (workspace_action[0] in ("append", "remove") and project_intent(command)):
            self._cancel_commander()
            self._choices([])
            self._stop_reply()
            self._append("you", "DU (lokalt tal): " + phrase)
            workspace.handle(workspace_action, command)
            return
        if workspace:
            workspace.reset(workspace.provider)
            self._stop_reply()
        if conversation and project_intent(command):
            self._append("you", "DU (lokalt tal): " + phrase)
            self._begin_commander(commander_request(command) or command)
            return
        if continuation:
            self._destination_question = False
            self._append("you", "DU (lokalt tal): " + phrase[:350])
            self._perform_interpreted_action(continuation)
            return
        if conversation and getattr(self, "reply_mode", None) == "choose" and self._local_voice_only:
            choice = re.fullmatch(r"(?:(?:valj|anvand|kor med|prata med|jag vill ha) (?:rosten )?)?(bengt|sanna)(?: tack)?", answer)
            if choice:
                self._append("you", "DU (lokalt tal): " + phrase[:180])
                if choice[1] == "bengt":
                    self._set_reply_mode("windows")
                else:
                    self._connect_sanna()
                return
        if suggestion and conversation and self._desktop_dialogue():
            if yes:
                self._append("you", "DU (lokalt tal): " + phrase)
                self._perform_interpreted_action(suggestion)
                return
            if no:
                self._reply("nova", "Okej. Vad vill du göra?")
                return
        if conversation and self._desktop_dialogue():
            if getattr(self, "_destination_question", False):
                self._destination_question = False
                target = re.sub(r"^nova[, ]+", "", value).strip(" .!?")
                resolved = safe_auto_navigation("öppna " + target)
                if resolved:
                    self._append("you", "DU (lokalt tal): " + phrase[:350])
                    self._perform_interpreted_action(resolved)
                    return
            incomplete = re.fullmatch(
                r"(?:(?:kan|vill|skulle) du (?:kunna )?)?(?:(?:ta|navigera) mig (?:till|dit)|"
                r"(?:oppna|visa|ga till))(?: (?:mig|den|det|den dar))?", answer.strip()
            )
            if incomplete:
                self._voice_answer_until = now + 25
                self._destination_question = True
                self._append("you", "DU (lokalt tal): " + phrase[:350])
                self._reply("nova", "Jag missade vart du ville gå. Vilken app eller sida?")
                return
            greeting = local_greeting(command)
            if greeting:
                self._append("you", "DU (lokalt tal): " + phrase[:350])
                self._reply("nova", greeting)
                return
        if addressed and normalized(command).removeprefix("nova, ").rstrip(".!?") in (
                "anslut sannas rost", "anslut sanna", "prata med sanna"):
            self._append("you", "DU (lokalt tal): " + phrase[:350])
            self._connect_sanna()
            return
        explicit_goal = commander_request(command, explicit_only=True) if conversation else None
        if explicit_goal:
            self._append("you", "DU (lokalt tal): " + phrase[:350])
            self._begin_commander(explicit_goal)
            return
        media = spotify_command(command, spotify_selected=getattr(self, "spotify_selected", False))
        if addressed and media:
            self._append("you", "DU (lokalt tal): " + phrase[:350])
            self._perform_interpreted_action(media)
            return
        action = safe_auto_navigation(command) if addressed else None
        if addressed and not action:
            local = (safe_native_voice_action(command) or safe_browser_command(command)
                     or safe_window_focus(command) or safe_uia_read_action(command)
                     or campaign_review_intent(command))
            if local or propose_code_job(command):
                keep_listening = local and local.kind in (
                    "native_read", "browser_control", "browser_focus", "focus", "spotify_media")
                if not keep_listening:
                    self.stop_native_mic_pilot(quiet=True)
                self.send(from_voice=True, safe_voice_action=local, transcript=command)
                if keep_listening and conversation and not self.native_mic_session:
                    self.root.after(400, self._resume_native_voice_after_reply)
                return
        self._append("you", "DU (lokalt tal): " + phrase[:350])
        if action and action.kind in ("open", "app"):
            self._waiting_operator_request = None
            self.pending = ""
            self.pending_native_plan = None
            if not (conversation and self._desktop_dialogue()):
                self.stop_native_mic_pilot(quiet=True)
            if action.kind == "open":
                self._open_url(action.url, action.description)
            else:
                self._start_app(action)
            if conversation and not getattr(self, "native_mic_session", None):
                # An exact user-requested local navigation should not end the
                # conversation. Only a live, consented session may rearm it.
                self.root.after(400, self._resume_native_voice_after_reply)
            return
        goal = commander_request(command)
        if conversation and goal:
            self._begin_commander(goal)
            return
        bridge = getattr(self, "bridge", None)
        if addressed and bridge and (is_operator_request(command) or is_calendar_read_request(command)):
            self.stop_native_mic_pilot(quiet=True)
            self._received_voice_without_navigation(command)
            return
        voice = bridge.state.voice_snapshot() if bridge else {}
        if (bridge and bridge.state.online()
                and voice.get("authorized") and voice.get("mode") == "native"):
            # Output voice does not select task capabilities. Use the existing
            # authenticated Atlas path and pause capture while it handles a turn.
            self.stop_native_mic_pilot(quiet=True)
            # Native STT is untrusted input. A potentially consequential
            # instruction stays a reviewable draft until the operator clicks.
            risk_terms = ("skicka", "publicera", "radera", "betala", "kopa",
                          "kop ", "skriv kod", "koda", "implementera", "installera",
                          "uppdatera", "lagg till", "lagga till", "lagger till",
                          "lagg in", "lagga in", "lagger in", "skapa", "planera in", "boka",
                          "flytta", "andra ", "andrar ", "ta bort", "tar bort",
                          "skriv", "spara", "svara", "besvara", "koper")
            if any(part in value for part in risk_terms):
                self.pending = phrase
                self._received_voice_without_navigation(phrase)
                return
            task_id, detail = bridge.state.enqueue_native_voice(phrase)
            if task_id:
                self._append("step", "Atlas svarar. Mikrofonen startar igen när Sanna talat klart.")
                self._phase("tolkar", "Atlas svarar med godkänd Nova-röst")
            else:
                self._append("warn", "Nova: " + detail)
                self._phase("godkannande", detail)
            return
        if conversation and self._desktop_dialogue():
            self.voice_interpreter.submit(command, self.spotify_selected)
            self._phase("tanker", "Formulerar ett svar")
            return
        if self.expanded and hasattr(self, "command"):
            existing = self.command.get("1.0", "end-1c")
            if not existing.strip():
                self.command.insert("1.0", phrase)
                self._on_input()
                self._phase("godkannande", "Utkast i rutan · Enter för fler alternativ")
                return
        self._phase("godkannande", "Ditt tidigare utkast ligger kvar i rutan")

    def _discard_voice_interpretation(self):
        self._voice_suggestion = None
        interpreter = getattr(self, "voice_interpreter", None)
        if interpreter:
            interpreter.cancel()

    def _perform_interpreted_action(self, action):
        if getattr(self, "live_call", None) and action.kind.startswith("live_"):
            if action.kind == "live_desktop":
                self._begin_commander(action.url)
            elif action.kind == "live_analyze":
                self.workspace.handle(("analyze", self.workspace.last_url), self.live_call.question)
            elif action.kind in ("live_website", "live_app_lookup", "live_volume", "live_news", "live_news_topic", "live_ask_target"):
                self.workspace.handle((action.kind.removeprefix("live_"), action.url), self.live_call.question)
            elif action.kind == "live_screen":
                self.workspace.handle(("screen", None), self.live_call.question)
            elif action.kind in ("live_draft", "live_inbox"):
                self.workspace.handle(("draft" if action.kind == "live_draft" else "latest", action.url), self.live_call.question)
        elif action.kind in ("browser_control", "browser_focus"):
            self._navigate_browser(action)
        elif action.kind == "focus":
            self.focus_window(action.url)
        elif action.kind == "app":
            self._start_app(action)
        elif action.kind == "open":
            self._open_url(action.url, action.description)
        elif action.kind == "spotify_media":
            self.spotify_selected = True
            self._control_spotify(action.url)

    def _poll_voice_interpretations(self):
        while True:
            try:
                turn, result = self.voice_interpreter.results.get_nowait()
            except queue.Empty:
                return
            if (turn != self.voice_interpreter.turn or not self._conversation_active()
                    or not self._desktop_dialogue() or not self.native_mic_session):
                continue
            if result.confirm:
                self._voice_answer_until = time.monotonic() + 25
                self._voice_suggestion = result.action
                self._reply("nova", result.message)
            elif result.action:
                self._perform_interpreted_action(result.action)
                continue
            else:
                if result.question:
                    self.voice_interpreter.remember_reply(result.question, result.message)
                self._reply("nova", result.message or f"Jag hörde ”{self.last_heard[:110]}”. Vilken app eller sida vill du till?")
            if self.native_mic_session and self.spoken_reply.process is None:
                self._phase("lyssnar", self._listening_hint())

    def _enter_commander_request(self):
        goal = simpledialog.askstring("Nova · Desktop Commander", "Vad vill du att jag gör på datorn?", parent=self.root)
        if goal and goal.strip():
            self._begin_commander(goal.strip())

    def _begin_commander(self, goal):
        self._cancel_commander()
        self._discard_voice_interpretation()
        if not getattr(self, "live_call", None):
            self.stop_native_mic_pilot(quiet=True)
        self._choices([])
        try:
            call = getattr(self, "live_call", None)
            reference = call.file_for(goal) if call else None
            job = CommanderSession(goal, reference=reference) if reference else CommanderSession(goal)
        except (OSError, ValueError) as exc:
            self._reply("warn", str(exc))
            self._resume_native_voice_after_reply()
            return
        self._commander = job
        self._commander_outcome = ""
        self._append("step", "Datoruppdrag: " + goal)
        self._phase("tolkar", "Nova förbereder datoruppdraget")
        self.root.after(75, lambda: self._poll_commander(job))

    def _cancel_commander(self):
        job = getattr(self, "_commander", None)
        if job:
            self._commander = None
            self._commander_review = None
            job.close()
            self._choices([])

    def _approve_commander(self, job, token):
        if self._commander is not job or self._commander_review != token or not self.expanded:
            return
        self._commander_review = None
        self._choices([])
        try:
            job.approve(token)
        except (OSError, ValueError):
            self._cancel_commander()
            self._reply("warn", "Kopplingen till Desktop Commander har stängts.")

    def _poll_commander(self, job):
        if self._commander is not job or self.closed:
            return
        while not job.events.empty():
            event = job.events.get_nowait()
            kind = event["kind"]
            if kind == "review":
                token = event["id"]
                self._commander_review = token
                arguments = json.dumps(event["args"], ensure_ascii=False, indent=2)
                self._append("step", "Föreslaget datorsteg · " + event["tool"] + "\n" + arguments)
                self._choices([("Godkänn datorsteget", lambda t=token: self._approve_commander(job, t)),
                               ("Avbryt", self.stop)])
                if getattr(self, "live_call", None):
                    self._reply("nova", "Datorsteget är förberett. Granska det i rutan.")
                self._phase("godkannande", "Granska åtgärden och målet")
            elif kind == "running":
                self._phase("navigerar", "Desktop Commander kör " + event["tool"])
            elif kind == "receipt":
                summaries = {"list_directory": "Jag har listat mappen.", "read_file": "Jag har läst filen.",
                             "create_directory": "Mappen är skapad.", "move_file": "Filen eller mappen har flyttats.",
                             "write_file": "Filen har skrivits."}
                self._commander_outcome = ("Desktop Commander rapporterade ett fel. Se svaret i rutan." if event["failed"]
                                           else summaries.get(event["tool"], "Desktop Commander har svarat. Se resultatet i rutan."))
                self._append("warn" if event["failed"] else "ok", event["tool"] + "\n" + event["text"])
                if getattr(self, "live_call", None):
                    self.live_call.observe(event["text"])
                    target = event.get("target")
                    if not event["failed"] and target:
                        self.live_call.file_reference = (job.project, target)
                self._phase("klar", "Desktop Commander har svarat")
            elif kind in ("error", "end"):
                if kind == "error" or not self._commander_outcome or event["text"].endswith("?"):
                    self._commander_outcome = event["text"]
                self._append("warn" if kind == "error" else "nova", event["text"])
                self._phase("godkannande" if kind == "error" else "klar", event["text"][:92])
            elif kind == "closed":
                self._cancel_commander()
                if event["code"]:
                    self._reply("warn", "Desktop Commander avslutades oväntat.")
                elif self._commander_outcome:
                    self._reply("nova", self._commander_outcome)
                self._resume_native_voice_after_reply()
                return
        self.root.after(75, lambda: self._poll_commander(job))

    def _make_more_menu(self):
        menu = tk.Menu(self.root, tearoff=0, bg=SURFACE, fg=TEXT,
                       activebackground=INPUT, activeforeground=TEXT,
                       bd=1, relief="flat")
        menu.add_command(label="Prata · ett uppdrag", command=self._listen_to_one_request)
        menu.add_command(label="Ge Nova ett datoruppdrag…", command=self._enter_commander_request)
        menu.add_command(label="Anslut Gmail…", command=lambda: self.workspace.configure("Gmail"))
        menu.add_command(label="Anslut Strato…", command=lambda: self.workspace.configure("Strato"))
        if self.pending_choices:
            for label, callback in self.pending_choices:
                menu.add_command(label=label, command=callback)
            menu.add_separator()
        menu.add_command(label="Anslut Atlas", command=self.connect_atlas)
        menu.add_command(label="Läs upp lokala svar med Bengt", command=lambda: self._set_reply_mode("windows"))
        menu.add_command(label="Visa bara text lokalt", command=lambda: self._set_reply_mode("text"))
        menu.add_command(label="Använd Sannas röst" if self._sanna_key_ready else "Anslut Sanna…", command=self._connect_sanna)
        if self._sanna_key_ready:
            menu.add_command(label="Byt ElevenLabs-nyckel…", command=self._configure_sanna)
        menu.add_separator()
        menu.add_command(label="Testa lokal mikrofon och svenska (25 sek)",
                         command=self.start_native_mic_pilot)
        menu.add_checkbutton(label="Starta mikrofonen med Ctrl+Alt+Space",
                             variable=self.native_mic_hotkey,
                             command=self._on_native_mic_hotkey_toggle)
        if self.native_mic_session and self.native_mic_session.running():
            menu.add_command(label="Stoppa lokalt mikrofontest",
                             command=self.stop_native_mic_pilot)
        menu.add_command(label="Flytta Nova till aktivt program", command=self._redock_near_pointer)
        menu.add_command(label="Välj skyddad testmiljö", command=self.choose_preview)
        menu.add_command(label="Öppna Atlas i webbläsaren",
                         command=lambda: self._open_url(URLS["atlas"], "Öppnar Atlas"))
        menu.add_separator()
        menu.add_command(label="Projektmappar", command=self.show_projects)
        menu.add_command(label="Öppna fönster", command=self.show_windows)
        menu.add_separator()
        menu.add_command(label="Stoppa pågående uppdrag (Ctrl+.)", command=self.stop)
        menu.add_checkbutton(
            label="Skicka röstkommandon efter 3 sekunder",
            variable=self.auto_voice_enabled,
            command=self._on_auto_voice_toggle,
        )
        menu.add_separator()
        opacity = tk.Menu(menu, tearoff=0, bg=SURFACE, fg=TEXT,
                          activebackground=INPUT, activeforeground=TEXT)
        for percent in (78, 84, 88, 94, 100):
            opacity.add_radiobutton(
                label=("Heltäckande · standard" if percent == 100 else f"{100 - percent} % transparent"),
                variable=self.opacity_percent, value=percent,
                command=lambda value=percent: self._set_opacity(value),
            )
        menu.add_cascade(label="Glas-effekt", menu=opacity)
        menu.add_command(label="Avsluta Nova", command=self.quit)
        return menu

    def _on_auto_voice_toggle(self):
        if not self.auto_voice_enabled.get():
            self._auto_voice.cancel()
            self._phase("redo", "Automatisk inskickning av röstkommandon avstängd")
        else:
            self._phase("redo", "Röstkommandon skickas efter 3 sekunders paus")

    def _set_opacity(self, percent: int):
        """User preference is session-local; no account settings are modified."""
        percent = max(75, min(100, int(percent)))
        self.opacity = percent / 100
        self.opacity_percent.set(percent)
        self.root.attributes("-alpha", self.opacity)

    def _show_more_menu(self):
        menu = self._make_more_menu()
        x = self.more_button.winfo_rootx()
        y = self.more_button.winfo_rooty() + self.more_button.winfo_height()
        try:
            menu.tk_popup(x, y)
        finally:
            menu.grab_release()

    def _submit_enter(self, event):
        if event.state & 0x0001:  # Shift+Enter: insert a newline.
            return None
        self.send()
        return "break"

    def _stop_shortcut(self, _event):
        self.stop()
        return "break"

    def _phase(self, state: str, detail: str):
        self.phase = state
        self.phase_detail = detail
        if not self.expanded:
            return
        label, color = {
            "redo": ("● Redo", SUCCESS),
            "lyssnar": ("● Lyssnar", ACCENT),
            "startar": ("● Startar mikrofonen", MUTED),
            "talar": ("● Talar", CYAN),
            "tanker": ("● Tänker", ACCENT),
            "tolkar": ("● Tolkar kommandot", ACCENT),
            "navigerar": ("● Navigerar – synlig åtgärd", ACCENT),
            "godkannande": ("● Väntar på ditt nästa steg", WARNING),
            "klar": ("● Klar med lokala åtgärden", SUCCESS),
            "stoppad": ("● Stoppad", WARNING),
        }.get(state, ("● Aktiv", MUTED))
        self.phase_var.set(label)
        # Keep the status compact even when an action supplies a long description.
        short = detail if len(detail) <= 45 else detail[:44] + "…"
        self.activity.itemconfigure(self.activity_dot, fill=color)
        self.activity.itemconfigure(self.activity_text, text=short, fill=MUTED)

    def _conversation_active(self):
        return (getattr(self, "_native_conversation_deadline", 0) > time.monotonic()
                and self.expanded and not getattr(self, "closed", False))

    def _resume_native_voice_after_reply(self):
        # The browser reports a bounded TTS completion before invoking
        # this callback. Never rearm after Stop, collapse, logout or timeout.
        if (self.closed or not self.expanded or getattr(self, "_commander", None) or getattr(self, "pending_native_plan", None)
                or getattr(self, "pending_uia_read_instruction", None)
                or getattr(self, "pending_code_job", None) or getattr(self, "pending", "")):
            return
        if not self._native_conversation_deadline or time.monotonic() >= self._native_conversation_deadline:
            self._native_conversation_deadline = 0.0
            self._phase("klar", "Samtalet pausat - tryck Ctrl+Alt+Space för att fortsätta")
            return
        if getattr(self, "live_call", None):
            if not self.native_mic_session or not self.native_mic_session.running():
                self.start_native_mic_pilot()
            return
        voice = self.bridge.state.voice_snapshot()
        if self._local_voice_only:
            if self.bridge.state.online() and voice.get("authorized") and voice.get("mode") != "native":
                return
        elif not (self.bridge.state.online() and voice.get("authorized") and voice.get("mode") == "native"):
            self._phase("godkannande", "Atlas frånkopplad · mikrofonen är pausad")
            return
        elif self.bridge.state.task and self.bridge.state.task.state in ("pending", "executing"):
            return
        if self.native_mic_session and self.native_mic_session.running():
            return
        self.start_native_mic_pilot()

    def _choose_voice_settings(self):
        if self.reply_mode == "sanna" and not self._sanna_key_ready:
            self._configure_sanna()
        else:
            self._connect_sanna()

    def _configure_sanna(self):
        from nova_sanna import save_key
        key = simpledialog.askstring("Nova · Sanna", "ElevenLabs-nyckel för att läsa upp egna svar. Sparas för ditt Windows-konto.", show="•", parent=self.root)
        if key:
            try:
                save_key(key)
                self._sanna_key_ready = True
                self._set_reply_mode("sanna")
                self._sanna_key_notice = False
                self._append("nova", "Nyckeln är sparad för Sannas uppläsning.")
            except (OSError, ValueError):
                self._append("warn", "Nyckeln kunde inte sparas.")

    def _connect_sanna(self):
        if not self._sanna_key_ready:
            self._configure_sanna()
            return
        self._set_reply_mode("sanna")
        if not getattr(self, "live_call", None):
            self._start_panel_voice()

    def _open_from_hotkey(self, *, wait_for_name=False):
        """Open the foreground panel and restore the selected voice."""
        if self._manual_anchor is None:
            self._redock_near_pointer()
        self.expand(listen=False)
        if not self.native_mic_hotkey.get():
            self._phase("redo", "Skriv ditt kommando")
            return
        if getattr(self, "live_call", None) and self._conversation_active():
            self._phase("lyssnar", self._listening_hint())
            return
        voice_ready = self.reply_mode in ("sanna", "windows") and (self._call_voice() != "Alma" or alma_ready())
        self._call_on_wake = wait_for_name and voice_ready
        if not wait_for_name and voice_ready:
            self._start_live_call()
        elif not self.native_mic_session or not self.native_mic_session.running():
            self._start_panel_voice()

    def _call_voice(self):
        if self.reply_mode == "sanna" and self._sanna_key_ready:
            return "Sanna"
        if self.reply_mode == "windows":
            return "Bengt"
        return "Klara" if klara_ready() else "Alma"

    def _prepare_local_call_voice(self):
        if not self.closed and self._call_voice() == "Klara":
            try:
                self.spoken_reply.prepare_klara()
            except OSError:
                pass  # The first spoken reply retries and reports start errors.

    def _call_label(self):
        return "Avbryt svar" if getattr(self, "live_call", None) else "Samtal · " + self._call_voice()

    def _end_live_call(self):
        self._call_on_wake = False
        if getattr(self, "spoken_reply", None):
            self.spoken_reply.release_klara()
        if getattr(self, "live_call", None):
            self.live_call = None
            self._sync_call_button()
            self._discard_voice_interpretation()

    def _sync_call_button(self):
        if self.expanded and hasattr(self, "call_button") and self.call_button.winfo_exists():
            self.call_button.set_label(self._call_label())

    def _start_live_call(self):
        if getattr(self, "live_call", None) and self._conversation_active():
            self._interrupt_reply()
            return
        if getattr(self, "_commander", None):
            self._phase("godkannande", "Slutför eller avbryt datoruppdraget först")
            return
        voice = self._call_voice()
        if voice == "Alma" and not alma_ready():
            self._append("warn", "Den lokala rösten Alma saknas. Installera Alma enligt Nova Desktops README eller välj en annan samtalsröst i menyn.")
            return
        if not local_model_ready():
            self._append("warn", "Den lokala svenska talmodellen saknas.")
            return
        bridge = self.bridge.state.voice_snapshot()
        if self.bridge.state.online() and bridge.get("authorized") and bridge.get("mode") != "native":
            self._append("warn", "Avsluta webbläsarens röstsamtal innan du startar samtalet i Windows.")
            return
        self._stop_reply()
        self._discard_voice_interpretation()
        self._local_voice_only = True
        now = time.monotonic()
        self._call_on_wake = False
        self._voice_turn_until = 0.0
        self.spotify_selected = False
        self.live_call = LiveCall(voice, now)
        self._native_conversation_deadline = now + CONVERSATION_SECONDS
        self.start_native_mic_pilot()
        if not self.native_mic_session:
            self._end_live_call()
            self._native_conversation_deadline = 0
            return
        self._sync_call_button()
        if voice == "Klara":
            self._prepare_local_call_voice()
        self.voice_interpreter.prepare(live=True)
        self._phase("lyssnar", self._listening_hint())
        if self.reply_mode == "sanna" and not self._sanna_key_ready:
            self._append("nova", "Du hör " + voice + " lokalt. Välj ⋯ → Anslut Sanna för att använda Sanna i samtalet.")
        self._append("nova", "Samtalet är igång med " + voice + ". Tala fritt. Säg ”vänta” för att avbryta mitt svar eller ”avsluta samtalet” när du är klar.")

    def _live_input(self, text):
        call = self.live_call
        self.last_heard = text[:180]
        self.transcript_var.set(self.last_heard)
        if safe_stop_command(text) or normalized(text).strip(" .!?") in ("avsluta samtalet", "pausa samtalet", "stang av mikrofonen", "jag pratar i telefon"):
            self.stop()
            return
        if self._interrupt_phrase(text):
            return
        if getattr(self, "_commander", None):
            if self._commander_review and normalized(text).strip(" .!?") in ("godkann datorsteget", "kor det visade datorsteget"):
                self._approve_commander(self._commander, self._commander_review)
                return
            self._cancel_commander()
        if getattr(self, "pending_native_plan", None):
            self._cancel_native_plan()
        self._stop_reply()
        self._discard_voice_interpretation()
        self._native_conversation_deadline = time.monotonic() + CONVERSATION_SECONDS
        self._append("you", "DU: " + text)
        call.hear(text)
        if call.voice == "Alma":
            self.spoken_reply.prepare_alma()
        workspace = self.workspace
        request = workspace.route(text)
        if request and not (request[0] in ("append", "remove") and (project_intent(text) or call.file_for(text))):
            if request[0] not in ("append", "remove", "draft", "send"):
                call.file_reference = None
            workspace.handle(request, text)
            return
        # Let callbacks from an older read expire while keeping the reviewed draft.
        workspace.pending_destination = None
        workspace.epoch += 1
        plan = parse_native_task(text)
        if plan:
            self._present_native_plan(plan)
            return
        action = (spotify_command(text, spotify_selected=self.spotify_selected) or safe_auto_navigation(text)
                  or safe_browser_command(text) or safe_window_focus(text))
        if action:
            self._perform_interpreted_action(action)
        elif (commander_request(text) or project_intent(text) or (call.file_for(text) and
                re.search(r"\b(?:las|andra|redigera|skriv|lagg till|lista|visa filerna|byt namn|flytta|ersatt)\b", normalized(text)))):
            self._begin_commander(commander_request(text) or text)
        else:
            self.voice_interpreter.submit_live(text, call.snapshot())
            self._phase("tanker", "Formulerar ett svar")

    def _listen_to_one_request(self):
        self._call_on_wake = False
        if getattr(self, "_commander", None):
            return
        bridge_voice = self.bridge.state.voice_snapshot()
        if self.spoken_reply.process is not None or (self._conversation_active() and
                bridge_voice.get("mode") == "native" and bridge_voice.get("status") in ("speaking", "thinking")):
            self._interrupt_reply()
            return
        self._voice_turn_until = time.monotonic() + 15
        self._start_panel_voice()
        self._phase("lyssnar", "Lyssnar på ditt nästa uppdrag")

    def _start_panel_voice(self):
        if getattr(self, "_commander", None):
            self._phase("godkannande", "Datoruppdraget pågår · välj Stopp för att avbryta")
            return
        if not self._conversation_active():
            self._destination_question = False
            self.spotify_selected = False
            self.voice_interpreter.history = ()
        voice = self.bridge.state.voice_snapshot()
        if self.bridge.state.online() and voice.get("authorized"):
            if voice.get("mode") != "native":
                # Opening the desktop panel must not resume a browser conversation
                # which would bypass Nova's local address check.
                self._voice_turn_until = 0.0
                self._phase("redo", "Välj Windows-mikrofon för att prata med Nova")
                self._append("nova", "Välj Avsluta röstsamtal i Omnira och sedan Koppla Windows-röst (Sanna). Du kan också skriva här.")
                return
            task = self.bridge.state.task
            if (voice.get("status") in ("speaking", "thinking", "transcribing")
                    or (task and task.state in ("pending", "executing"))):
                self._phase("tolkar", "Atlas svarar · tryck Stopp för att avbryta")
                return
            # Sanna is an output voice, not a request for offline-only work.
            self._local_voice_only = False
        else:
            self._local_voice_only = True
        if self.expanded:
            self._display_voice_options()
            if self._local_voice_only and self.reply_mode == "choose" and not self._conversation_active():
                self._voice_answer_until = time.monotonic() + 25
                self._append("nova", "Vill du höra svar? Välj en röst nedan eller säg ”Bengt” eller ”Sanna”.")
        if not local_model_ready():
            self._phase("redo", "Talmodellen saknas · skriv i rutan")
            return
        self._native_conversation_deadline = time.monotonic() + CONVERSATION_SECONDS
        self.start_native_mic_pilot()
        if self.native_mic_session and self.reply_mode in ("sanna", "windows"):
            self.voice_interpreter.prepare(live=getattr(self, "_call_on_wake", False))

    def expand(self, listen=False):
        if not self.expanded:
            self._draw_expanded()
        self.root.deiconify()
        # Tk on a saved ultrawide bottom-right position can resize its
        # override-redirect window without applying the new x/y until after
        # it is deiconified. Re-apply the clamped *panel* geometry once all
        # widgets are laid out, so no controls are drawn beyond the screen.
        self.root.update_idletasks()
        self._place(PANEL_W, PANEL_H)
        self.root.lift()
        self.root.attributes("-topmost", True)
        self.command.focus_force()
        if listen:
            # RegisterHotKey fires while Ctrl+Alt+Space may still be held.
            # Win+H issued immediately then becomes Win+Ctrl+Alt+H and can
            # silently fail. Wait for release before requesting dictation.
            self._voice_request_id += 1
            request_id = self._voice_request_id
            self.root.after(600, lambda: self._voice_after_hotkey(request_id))

    def collapse(self):
        self._end_live_call()
        if getattr(self, "workspace", None):
            self.workspace.reset()
        self._voice_turn_until = self._voice_answer_until = self._voice_navigation_until = 0.0
        self._cancel_commander()
        task = self.bridge.state.task
        if task and task.mode == "nova_speech":
            self.bridge.state.cancel()
        self._stop_reply()
        self._cancel_spotify_control()
        self._native_conversation_deadline = 0.0
        self._native_hotkey_pending_until = 0.0
        # Never leave native microphone capture hidden behind a collapsed UI.
        self.stop_native_mic_pilot(quiet=True)
        # Cancel any delayed voice launch or auto-run if the chat closes.
        self._voice_request_id += 1
        self._auto_voice.cancel()
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
        # Store only the immutable HTTPS host, never a cookie, key or token.
        if self.preview_file:
            try:
                self.preview_file.parent.mkdir(parents=True, exist_ok=True)
                self.preview_file.write_text(approved + "\n", encoding="utf-8")
            except OSError:
                self._append("warn", "Nova: Testmiljön valdes men kunde inte sparas.")
        self._atlas_login_opened = False
        self._append("ok", "Nova: Testmiljö vald: " + approved + ". Tidigare parning återkallad.")
        self.connect_atlas()

    def connect_atlas(self, *, auto_voice: bool = False, native_voice: bool = False):
        if 0 < time.monotonic() < self._native_hotkey_pending_until:
            auto_voice = True
            native_voice = True
        """First sign in without key, then explicitly pair with a short-lived key.

        A key-bearing fragment must not cross Vercel SSO redirects.
        """
        if self.bridge.state.online():
            voice = self.bridge.state.voice_snapshot()
            detail = "Nova är redan ansluten"
            if voice.get("authorized"):
                detail += " · röstsamtal " + str(voice.get("status", "aktivt"))
            else:
                detail += " · välj röstläge i Omnira"
            self._phase("klar", detail)
            return
        target = next(iter(self.bridge.state.origins))
        if target == PROD_ORIGIN:
            self._append("warn", "Atlas är ännu inte ansluten i produktion. "
                         "Välj först den skyddade Omnira-testmiljön.")
            self.choose_preview()
            return
        try:
            if not self._atlas_login_opened:
                # Open the SSO-protected preview WITHOUT any pairing fragment.
                if webbrowser.open(target + "/nova-bridge", new=1):
                    self._atlas_login_opened = True
                    self._append("nova", "Atlas steg 1/2: Omniras skyddade testmiljö öppnades. " +
                                 "Logga in där, klicka sedan på Atlas-statusen i Nova igen.")
                    self._phase("godkannande", "Atlas steg 1/2 · logga in och klicka Atlas igen")
                else:
                    self._append("warn", "Nova: Webbläsaren kunde inte öppna testmiljön.")
            else:
                # Only after manual SSO login do we send the in-memory fragment.
                if webbrowser.open(self.bridge.pairing_url(auto_voice=auto_voice, native_voice=native_voice), new=2):
                    self._phase("tolkar", "Ansluter Sannas röst" if native_voice else "Väntar på anslutning i Omnira")
                else:
                    self._append("warn", "Nova: Parningssidan kunde inte öppnas.")
        except Exception as exc:
            self._append("warn", "Nova: Atlas-kopplingen kunde inte öppnas: " + str(exc))

    def _local_voice_caption(self):
        if getattr(self, "live_call", None):
            return self.live_call.voice + " · samtal i Windows"
        if self.reply_mode == "sanna" and not self._sanna_key_ready:
            return self._call_voice() + " lokalt · Anslut Sanna"
        return {"windows": "Bengt · Windows-mikrofon", "sanna": "Sanna · Windows-mikrofon"}.get(
            self.reply_mode, "Textläge · Välj röst")

    def _show_bridge_status(self):
        waiting = self._waiting_operator_request
        if (waiting and self.expanded and waiting == self.pending and self.bridge.state.online()
                and self.bridge.state.voice_snapshot().get("authorized")):
            self._waiting_operator_request = None
            self._received_voice_without_navigation(waiting)
        if self._native_hotkey_pending_until and self.expanded:
            if time.monotonic() > self._native_hotkey_pending_until:
                self._native_hotkey_pending_until = 0.0
                self._phase("godkannande", "Välj Anslut Sannas röst för att försöka igen")
            elif self.bridge.state.online():
                voice = self.bridge.state.voice_snapshot()
                if voice.get("authorized") and voice.get("mode") == "native":
                    self._native_hotkey_pending_until = 0.0
                    if not self.pending:
                        self._start_panel_voice()
        if self.expanded and hasattr(self, "bridge_var"):
            if getattr(self, "live_call", None):
                self.bridge_var.set(self._local_voice_caption())
                return
            if self.bridge.state.online():
                voice = self.bridge.state.voice_snapshot()
                if voice.get("authorized") and voice.get("mode") == "native":
                    self.bridge_var.set(self._local_voice_caption() if self.reply_mode == "sanna" else "Sanna · Windows-mikrofon")
                elif voice.get("authorized"):
                    labels = {
                        "idle": "pausat - tryck Ctrl+Alt+Space",
                        "starting": "startar",
                        "listening": "lyssnar",
                        "transcribing": "tolkar tal",
                        "thinking": "arbetar",
                        "speaking": "pratar",
                        "error": "mikrofon pausad - tryck Ctrl+Alt+Space",
                    }
                    self.bridge_var.set("Nova-samtal - " + labels.get(voice.get("status"), "anslutet"))
                else:
                    self.bridge_var.set("Nova ansluten · välj röstläge i Omnira")
                self.bridge_status.configure(fg=MUTED)
            else:
                self.bridge_var.set("Anslut Sannas röst · fortsätt inloggningen"
                                    if self._native_hotkey_pending_until
                                    else self._local_voice_caption())
                self.bridge_status.configure(fg=MUTED)
        if not self.closed:
            self.root.after(900, self._show_bridge_status)

    def _poll_bridge(self):
        try:
            while True:
                event = self.bridge.state.events.get_nowait()
                kind = event.get("kind")
                if (kind in ("canceled", "done", "error") and getattr(self, "_bridge_speech_id", None)
                        and event.get("id", self._bridge_speech_id) == self._bridge_speech_id):
                    self._bridge_speech_id = None
                    self._bridge_speech_ended = time.monotonic() + 0.15
                # Pairing and voice consent are shown by the live header.
                if kind == "queued":
                    voice = self.bridge.state.voice_snapshot()
                    if (event.get("mode") in ("nova_speech", "nova_voice") and self._conversation_active()
                            and voice.get("authorized") and voice.get("mode") == "native"):
                        self._bridge_speech_id = event["id"]
                        self._bridge_speech_started = time.monotonic()
                        if not self.native_mic_session:
                            self.start_native_mic_pilot()
                    self.live_reply_id = None
                    self.live_reply_text = ""
                    self._phase("tolkar", "Nova förbereder rösten" if event.get("mode") == "nova_speech" else "Atlas förbereder svar")
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
                    task = self.bridge.state.task
                    if task and task.id == event.get("id") and task.mode in ("nova_voice", "nova_speech"):
                        self._phase("klar", "Atlas har svarat - lokal mikrofon startar igen")
                        self._append("ok", "Nova har talat klart.")
                        if self._native_conversation_deadline:
                            self.root.after(200, self._resume_native_voice_after_reply)
                    elif task and task.id == event.get("id") and task.mode == "atlas_operator":
                        self._phase("klar", "Atlas svar klart - granska utfallet i Omnira")
                        self._append("ok", "Nova: Atlas-turen avslutad. Granska eventuella ändringar eller godkännanden i Omnira.")
                    else:
                        self._phase("klar", "Atlas gav ett skrivskyddat svar")
                        self._append("ok", "Nova: Atlas-svaret klart. Inga arbetsverktyg kördes.")
                    self.live_reply_id = None
                elif kind == "error":
                    task = self.bridge.state.task
                    if task and task.id == event.get("id") and task.mode == "nova_speech":
                        self._append("warn", event.get("text") or "Sannas ljud kunde inte spelas upp.")
                        self._resume_native_voice_after_reply()
                        continue
                    self._native_conversation_deadline = 0.0
                    self._phase("godkannande", "Atlas kunde inte slutföra svaret")
                    self._append("warn", "Nova: " + event.get("text", "Atlas-svar misslyckades"))
                    self.live_reply_id = None
                elif kind == "canceled":
                    self._append("warn", "Nova: Avbrutet lokalt. Nätverkssvaret kan ha hunnit starta.")
                    self.live_reply_id = None
        except queue.Empty:
            pass
        try:
            while True:
                epoch, result = self.uia_results.get_nowait()
                self._finish_uia_read(epoch, result)
        except queue.Empty:
            pass
        if getattr(self, "workspace", None):
            self.workspace.poll()
        if not self.closed:
            self.root.after(150, self._poll_bridge)

    def _process_events(self):
        try:
            while True:
                event = self.events.get_nowait()
                if event == "stop":
                    self.stop()
                elif event in ("open", "toggle"):
                    self._open_from_hotkey()
        except queue.Empty:
            pass
        if not self.closed:
            code = self.spoken_reply.poll()
            if code == 0 and getattr(self, "_reading_chunks", None) and self.expanded:
                self._read_next_chunk()
                code = None
            elif code not in (None, 0):
                self._reading_chunks = []
            if code is not None and self._conversation_active():
                now = time.monotonic()
                if self._voice_suggestion or self._destination_question:
                    self._voice_answer_until = now + 25
                if self._voice_navigation_until:
                    self._voice_navigation_until = now + 20
                self._phase("lyssnar", self._listening_hint())
                if not self.native_mic_session:
                    self._resume_native_voice_after_reply()
            if code not in (None, 0) and getattr(self, "live_call", None):
                self._append("warn", "Uppläsningen med " + self.live_call.voice + " misslyckades. Svaret finns i chatten.")
            elif code == 3 and self.reply_mode == "sanna":
                if not self._sanna_key_notice:
                    self._append("nova", "För uppläsning av egna svar med Sanna, välj ⋯ → Anslut Sanna. Standardsvaren finns i Windows.")
                    self._sanna_key_notice = True
            elif code not in (None, 0):
                self._append("warn", "Kontrollera ElevenLabs-nyckeln och ljudutgången." if self.reply_mode == "sanna" else "Kontrollera Windows-rösten Bengt och ljudutgången.")
            self._poll_voice_interpretations()
            self.root.after(100, self._process_events)

    def _poll_voice_auto(self):
        """Inspect the text widget, not key events (Windows dictation can bypass them).

        One-shot voice submissions after a text pause. Only exact allowlisted
        navigation may execute; everything else is sent for review/read-only
        analysis. Typed text outside voice mode is never auto-sent.
        """
        try:
            if self.bridge.state.online() and self.bridge.state.voice_snapshot().get("authorized"):
                # Late Windows dictation must never create a second request while
                # the authenticated Atlas voice session is already in control.
                self._auto_voice.cancel()
            if self.expanded and self.auto_voice_enabled.get() and self._auto_voice.armed:
                spoken = self.command.get("1.0", "end-1c").strip()
                decision = self._auto_voice.observe_submission(
                    spoken, time.monotonic(), spotify_selected=self.spotify_selected)
                if decision is not None:
                    # Verify that the original, unmodified transcript is still
                    # in Nova's own focused text field.
                    if (self._focus_guard.has_focus(self.root, self.command)
                            and self.command.get("1.0", "end-1c").strip() == decision.text):
                        if decision.safe_navigation is not None:
                            if decision.safe_navigation.kind == "native_read":
                                note = "Nova: Röstkommando mottaget · läser lokal projektinformation."
                            elif decision.safe_navigation.kind == "native_preview":
                                note = "Nova: Röstkommando mottaget · visar plan för godkännande."
                            else:
                                note = "Nova: Röstkommando mottaget · kontrollerar navigering."
                            self._append("step", note)
                        else:
                            self._append("step", "Nova: Röstkommando mottaget automatiskt · granskar behörighet.")
                        self.send(from_voice=True, safe_voice_action=decision.safe_navigation)
                    else:
                        self._auto_voice.cancel()
                        self._phase("godkannande", "Fönsterfokus ändrades · tryck Skicka manuellt")
        except (tk.TclError, AttributeError):
            self._auto_voice.cancel()
        finally:
            if not self.closed:
                self.root.after(160, self._poll_voice_auto)

    def _on_input(self, _e=None):
        text = self.command.get("1.0", "end-1c").strip()
        self.draft = text
        self.transcript_var.set(text[-180:] or self.last_heard or "—")
        if self.phase == "lyssnar" and text:
            self.activity.itemconfigure(
                self.activity_text, text="Text mottagen · tryck Enter"
            )

    def _voice_after_hotkey(self, request_id: int, attempts: int = 0,
                            focus_attempts: int = 0):
        """Automatically request Win+H after the initiating hotkey is released."""
        if self.closed or not self.expanded or request_id != self._voice_request_id:
            return
        try:
            user32 = ctypes.windll.user32
            busy = any(user32.GetAsyncKeyState(code) & 0x8000
                       for code in (0x11, 0x12, 0x20))  # Ctrl, Alt, Space
        except (AttributeError, OSError):
            busy = False
        if busy:
            if attempts < 20:
                self.root.after(
                    100, lambda: self._voice_after_hotkey(
                        request_id, attempts + 1, focus_attempts
                    )
                )
            else:
                self._phase("godkannande", "Släpp Ctrl + Alt + Space och försök igen")
            return
        if not self._focus_guard.ensure_focus(self.root, self.command):
            # Keep all speech away from ChatGPT, email, or other windows.
            if focus_attempts < 4:
                self.root.after(170, lambda: self._voice_after_hotkey(
                    request_id, attempts, focus_attempts + 1
                ))
            else:
                self._phase("godkannande", "Klicka i Novas skrivfält för att prata")
                self._append("warn", "Nova: Windows gav inte Nova tangentbordsfokus. " +
                             "Röstinmatningen startades inte i ett annat program.")
            return
        self.dictate()

    def dictate(self):
        """Start the authorized Atlas microphone, not a duplicate Win+H session.

        Standalone Windows dictation is only a fallback when no browser pairing
        exists. Otherwise the browser owns the sole active microphone.
        """
        voice = self.bridge.state.voice_snapshot()
        if self.bridge.state.online() and voice.get("authorized"):
            self._auto_voice.cancel()
            self._voice_request_id += 1
            accepted, detail = self.bridge.state.request_voice_control("voice_resume")
            if accepted:
                self._phase("lyssnar", "Atlas startar/fortsätter lyssna i webbläsaren")
            else:
                self._append("warn", "Nova: " + detail)
                self._phase("godkannande", detail)
            return
        if self.bridge.state.online():
            self._auto_voice.cancel()
            self._phase("godkannande", "Starta röstsamtalet i den anslutna Omnira-webbläsaren")
            self._append("warn", "Nova: Välj röstläge i den anslutna Omnira-fliken.")
            return
        if not self.expanded:
            self.expand(False)
        if not self._focus_guard.ensure_focus(self.root, self.command):
            self._phase("godkannande", "Klicka i Novas skrivfält och tryck Prata")
            self._append("warn", "Nova: Ingen diktering – ett annat program har fokus.")
            return
        self._phase("lyssnar", "Säg ditt kommando när Windows lyssnar")
        # Cancel stale injection if the user sends, stops or collapses Nova
        # during the short gap before Windows voice typing is requested.
        self._voice_request_id += 1
        request_id = self._voice_request_id
        self.root.after(110, lambda: self._send_windows_voice_typing_shortcut(request_id))

    def _send_windows_voice_typing_shortcut(self, request_id: int | None = None):
        if self.closed or not self.expanded:
            return
        if request_id is not None and request_id != self._voice_request_id:
            return
        # Final check immediately before Win+H. Never type into ChatGPT,
        # an email editor or whatever window happened to steal focus.
        if not self._focus_guard.has_focus(self.root, self.command):
            self._phase("godkannande", "Nova saknar fokus · klicka i skrivfältet")
            self._append("warn", "Nova: Röststart avbruten eftersom fokus flyttades.")
            return
        try:
            user32 = ctypes.windll.user32
            # Windows voice typing: Win+H. It is the OS, not Nova, which
            # controls whether the mic and online speech recognizer are ready.
            for code, flags in ((0x5B, 0), (0x48, 0),
                                (0x48, 0x0002), (0x5B, 0x0002)):
                user32.keybd_event(code, 0, flags, 0)
            if self.auto_voice_enabled.get():
                current = self.command.get("1.0", "end-1c")
                if not current.strip():
                    self._auto_voice.arm(current)
                    self._phase("lyssnar", "Tala klart · Nova skickar efter 3 sekunder")
                else:
                    self._auto_voice.cancel()
                    self._phase("godkannande", "Töm skrivfältet för automatisk röstinskickning")
        except Exception as exc:
            self._auto_voice.cancel()
            self._phase("godkannande", "Windows kunde inte starta röstinmatning")
            self._append("warn", f"Nova: Röstinmatning misslyckades: {exc}")

    def _open_url(self, url: str, caption: str):
        self._discard_voice_interpretation()
        self.spotify_selected = False
        if getattr(self, "workspace", None):
            provider = next((name for name in ("Gmail", "Strato") if URLS[name.lower()] == url), None)
            self.workspace.reset(provider)
            if getattr(self, "live_call", None) and url in URLS.values():
                self.workspace.handle(("website", url), caption)
                return
        self._phase("navigerar", caption)
        self._append("step", "  ↳ " + caption)
        try:
            opened = webbrowser.open(url, new=2)
        except Exception as exc:
            self._reply("warn", f"Nova: Webbläsaren rapporterade ett fel: {exc}")
            self._phase("godkannande", "Öppning misslyckades")
            return
        if opened:
            self._choices([("Öppna Atlas", lambda: self._open_url(URLS["atlas"],
                                                               "Öppnar Atlas")),
                           ("Projekt", self.show_projects)])
            self._reply("ok", "Nova: Öppningen skickad till webbläsaren. "
                        "Sidans laddning/inloggning är inte verifierad.", spoken=caption)
            self._phase("klar", "Begäran skickad till webbläsaren")
        else:
            self._reply("warn", "Nova: Webbläsaren bekräftade inte öppningen.")
            self._phase("godkannande", "Kontrollera webbläsaren")

    def _start_app(self, action):
        self._discard_voice_interpretation()
        self.spotify_selected = False
        self._phase("navigerar", "Startar godkänt Windows-program")
        self._append("step", "  ↳ " + action.description)
        if action.url == APP_SHORTCUTS["spotify"] and any(w.key == "spotify" for w in list_known_windows()):
            self.focus_window("spotify")
            return
        if action.url != APP_SHORTCUTS["spotify"] and not os.path.isfile(action.url):
            self._reply("warn", "Nova: Programgenvägen hittades inte.")
            self._phase("godkannande", "Programmet saknas")
            return
        try:
            os.startfile("spotify:" if action.url == APP_SHORTCUTS["spotify"] else action.url)
            if action.url == APP_SHORTCUTS["spotify"]:
                self.spotify_selected = True
                epoch = self.native_task_epoch
                deadline = time.monotonic() + 7

                def verify_spotify():
                    if self.closed or not self.expanded or self.native_task_epoch != epoch:
                        return
                    if any(w.key == "spotify" for w in list_known_windows()):
                        self.focus_window("spotify")
                    elif time.monotonic() < deadline:
                        self.root.after(250, verify_spotify)
                    else:
                        self._reply("warn", "Jag har bett Windows starta Spotify men ser inget Spotify-fönster.")
                        self._phase("godkannande", "Spotify-fönstret saknas")
                self.root.after(100, verify_spotify)
                return
            self._reply("ok", "Nova: Windows har fått startkommandot. "
                         "Programfönstrets innehåll är inte verifierat.", spoken=action.description)
            self._phase("klar", "Startkommando skickat")
        except OSError as exc:
            self._reply("warn", "Nova: Programmet kunde inte startas: " + str(exc))
            self._phase("godkannande", "Programstart misslyckades")

    def _control_spotify(self, action: str):
        if action not in ("play", "pause"):
            return
        if self._media_worker is not None:
            # Keep the last requested state if the previous action is still pending.
            self._next_media_action = action
            return
        powershell = Path(os.environ["SystemRoot"]) / "System32/WindowsPowerShell/v1.0/powershell.exe"
        script = Path(__file__).with_name("nova_spotify.ps1")
        try:
            worker = subprocess.Popen(
                [str(powershell), "-NoProfile", "-NonInteractive", "-File", str(script), action],
                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
        except OSError:
            self._reply("warn", "Nova: Kunde inte ansluta till Windows mediestyrning.")
            return
        self._media_worker = worker
        self._phase("tolkar", "Kontrollerar Spotify")
        deadline = time.monotonic() + 15

        def check():
            if self._media_worker is not worker:
                return
            status = worker.poll()
            if status is None:
                if time.monotonic() < deadline:
                    self.root.after(100, check)
                    return
                worker.kill()
                status = 4
            self._media_worker = None
            self.spotify_selected = status == 0
            if status == 0:
                message = "Nu spelar Spotify." if action == "play" else "Musiken är pausad."
            else:
                message = {
                    2: "Hittade ingen entydig Spotify-spelare. Öppna Spotify och välj en låt.",
                    3: "Spotify kunde inte utföra kommandot. Välj en låt i spelaren.",
                    4: "Spotify har inte bekräftat att uppspelningen ändrades.",
                }.get(status, "Kunde inte kontrollera uppspelningen i Windows.")
            self._reply("ok" if status == 0 else "warn", "Nova: " + message,
                        spoken=message if status == 0 else "Jag kunde inte bekräfta uppspelningen i Spotify.")
            self._phase("klar" if status == 0 else "godkannande", message)
            following, self._next_media_action = self._next_media_action, None
            if following and (following != action or status != 0):
                self._control_spotify(following)

        self.root.after(100, check)

    def _cancel_spotify_control(self):
        self.spotify_selected = False
        self._next_media_action = None
        worker = getattr(self, "_media_worker", None)
        self._media_worker = None
        if worker is not None and worker.poll() is None:
            worker.kill()

    def _open_project_folder(self, path: str):
        self._discard_voice_interpretation()
        self.spotify_selected = False
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
        # Native Windows navigation is Nova's responsibility, not something
        # Atlas can magically do through an unconnected web tool.
        # No automatic clipboard transfer or remote execution.
        self._received_voice_without_navigation(text)

    def copy_pending(self):
        if not self.pending:
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(self.pending)
        self.root.update()
        self._append("step", "  ↳ Kommandot kopierades till urklipp på din begäran.")

    def _approved_operator_task(self, text: str):
        """A user-selected action in the Nova review menu, never model output."""
        if self.pending != text:
            self._append("warn", "Nova: Uppdraget hann ändras. Ge kommandot igen.")
            self._choices([])
            return
        task_id, detail = self.bridge.state.enqueue_operator(text)
        if task_id:
            self.pending = None
            self._choices([])
            self._append("step", "  ↳ Godkänt av dig. Atlas kontrollerar sina ordinarie verktygsbehörigheter.")
            self._phase("tolkar", "Atlas arbetar - avbryt med Stopp om du ångrar dig")
        else:
            self._append("warn", "Nova: " + detail)
            self._phase("godkannande", detail)

    def _approved_readonly_advice(self, text: str):
        if self.pending != text:
            self._append("warn", "Nova: Begäran hann ändras. Ge kommandot igen.")
            self._choices([])
            return
        self.pending = None
        self._choices([])
        task_id, detail = self.bridge.state.enqueue(text)
        if task_id:
            self._append("step", "  ↳ Fråga skickad till Atlas utan verktyg.")
            self._phase("tolkar", "Atlas ger rådgivning i läsläge")
        else:
            self._append("warn", "Nova: " + detail)
            self._phase("godkannande", detail)

    def _present_code_job(self, draft: CodeJobDraft):
        """Code requests get a reviewable brief, never direct shell authority."""
        self.pending_code_job = draft
        self.pending = draft.request
        self._phase("godkannande", "Koduppdrag för " + draft.label + " - granska förslaget")
        self._append(
            "nova",
            "Nova: Jag har identifierat koduppdrag för " + draft.label + ". "
            + ("Projektets Git-mapp behöver verifieras innan körning. "
               if draft.repository is None else "En lokal repo-kandidat är registrerad. ")
            + "Inga filer ändras och ingen kodagent startas automatiskt. "
            "Välj menyn ⋯ och sedan Kopiera kodbrief eller öppna projektet. "
            "Själva agentkörningen behöver en separat, isolerad körväg och ditt godkännande."
        )
        choices = [("Kopiera kodbrief", lambda d=draft: self._copy_code_job_brief(d))]
        if self.bridge.state.online():
            choices.insert(0, ("Planera med Atlas (utan kodändring)",
                               lambda d=draft: self._plan_code_job_with_atlas(d)))
        if draft.repository is not None:
            choices.append(("Öppna projektmapp", lambda d=draft: self._open_code_job_folder(d)))
        choices.append(("Avbryt koduppdrag", self._cancel_code_job))
        self._choices(choices)

    def _plan_code_job_with_atlas(self, draft: CodeJobDraft):
        """Explicitly approved LLM planning via the existing tool-free relay."""
        if getattr(self, "pending_code_job", None) != draft:
            self._append("warn", "Nova: Koduppdraget hann ändras. Ge kommandot igen.")
            return
        if not self.bridge.state.online():
            self._append("warn", "Nova: Atlas måste anslutas innan planering.")
            return
        prompt = ("Planera endast följande koduppdrag. Du har ingen åtkomst "
                  "till projektets faktiska filer eller Git-historik i detta "
                  "läge. Ange därför vad som måste kontrolleras på datorn och "
                  "redovisa osäkerheter. Starta ingen agent och föreslå inga "
                  "oannonserade ändringar.\n\n" + draft.atlas_brief)
        task_id, detail = self.bridge.state.enqueue(prompt)
        if not task_id:
            self._append("warn", "Nova: " + detail)
            self._phase("godkannande", detail)
            return
        self._choices([])
        self._append("step", "  ↳ Atlas skapar en plan i skrivskyddat läge. Ingen kodagent eller verktygskörning startas.")
        self._phase("tolkar", "Atlas planerar koduppdraget utan att ändra filer")

    def _copy_code_job_brief(self, draft: CodeJobDraft):
        if getattr(self, "pending_code_job", None) != draft:
            self._append("warn", "Nova: Koduppdraget har ändrats. Ge kommandot igen.")
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(draft.brief)
        self.root.update()
        self._append("step", "  ↳ Kodbrief kopierad på din begäran. Ingen agent har startats.")
        self._phase("klar", "Kodbrief redo att granskas i din kodagent")

    def _open_code_job_folder(self, draft: CodeJobDraft):
        if getattr(self, "pending_code_job", None) != draft or draft.repository is None:
            self._append("warn", "Nova: Projektet saknar en verifierad lokal Git-mapp.")
            return
        if not draft.repository.is_dir():
            self._append("warn", "Nova: Projektmappen finns inte längre på datorn.")
            return
        self._open_project_folder(str(draft.repository))

    def _cancel_code_job(self):
        self.pending_code_job = None
        self.pending = None
        self._choices([])
        self._append("step", "Nova: Kodförslaget avbröts. Ingen körning påbörjades.")
        self._phase("redo", "Redo för ett nytt uppdrag")

    def _cancel_operator_request(self):
        self.pending = ""
        self._waiting_operator_request = None
        self._choices([])
        self._phase("redo", "Uppdraget avbröts")

    def _received_voice_without_navigation(self, text: str):
        """Actionable commands require a click before entering tool-enabled Atlas."""
        if self.bridge.state.online() and self.bridge.state.voice_snapshot().get("authorized"):
            self.pending = text
            self._choices([
                ("Kör i Atlas (med verktyg)", lambda phrase=text: self._approved_operator_task(phrase)),
                ("Bara råd (utan verktyg)", lambda phrase=text: self._approved_readonly_advice(phrase)),
                ("Avbryt", self._cancel_operator_request),
            ])
            self._append("nova", "Nova: Det här kan behöva Atlas riktiga verktyg. "
                         "Välj Kör i Atlas för att godkänna just detta uppdrag. "
                         "Ordinarie behörigheter och granskningar gäller fortfarande.")
            self._phase("godkannande", "Granska uppdraget och välj Kör i Atlas")
            return
        if is_operator_request(text) or is_calendar_read_request(text):
            self.pending = text
            self._waiting_operator_request = text
            self._reply("nova", "Det uppdraget behöver Atlas. Du kan ansluta här "
                        "och sedan granska uppdraget i rutan.")
            self._native_conversation_deadline = 0.0
            self._choices([
                ("Anslut Atlas för uppdraget", lambda: self.connect_atlas(auto_voice=True, native_voice=True)),
                ("Avbryt", self._cancel_operator_request),
            ])
            self._phase("godkannande", "Arbetsorder väntar på anslutning")
            return
        if self.bridge.state.online():
            task_id, detail = self.bridge.state.enqueue(text)
            if task_id:
                self._append("step", "  ↳ Fråga skickad till Atlas i läsläge.")
                self._phase("tolkar", "Atlas ger råd, men utför inte åtgärder")
            else:
                self._append("warn", "Nova: " + detail)
                self._phase("godkannande", detail)
            return
        self.pending = text
        self._append("nova", "Nova: Kommandot togs emot. Jag kan öppna godkända "
                     "sidor och program lokalt, men Atlas behöver först paras "
                     "för att du ska kunna godkänna ett verktygsuppdrag.")
        self._choices([
            ("Anslut Atlas", self.connect_atlas),
            ("Kopiera begäran", self.copy_pending),
        ])
        self._phase("godkannande", "Atlas behöver anslutas")

    def _present_uia_read_preview(self, instruction: str):
        """Capture the foreground browser, then ask before reading any page text."""
        self.pending_uia_read_instruction = None
        self.pending_uia_read_target = None
        self.pending_native_plan = None
        self._choices([])

        if not self.bridge.state.online():
            self._append(
                "warn",
                "Nova: Atlas är inte ansluten. Ingen sidtext läses. Anslut Atlas och upprepa kommandot.",
            )
            self._choices([
                ("Anslut Atlas", self.connect_atlas),
                ("Avbryt", self._cancel_uia_read),
            ])
            self._phase("godkannande", "Anslut Atlas innan sidtext läses")
            return

        try:
            target = find_foreground_browser_window()
        except (UIAutomationError, ValueError) as exc:
            self._append(
                "warn",
                f"Nova: Jag hittar inget aktivt, synligt webbläsarfönster att läsa ({exc}).",
            )
            self._phase("godkannande", "öppna rätt chatt i Brave, Chrome, Edge eller Firefox")
            return

        self.pending_uia_read_instruction = instruction
        self.pending_uia_read_target = target
        browser = target.get("processName", "webbläsaren").capitalize()
        self._append(
            "step",
            f"Nova: Jag har hittat {browser}. Jag kan läsa den synliga sidtexten "
            "i det fönstret och skicka högst 3 000 tecken till Atlas i skrivskyddat läge. "
            "Kontrollera att rätt chatt och flik är öppen. Inga klick, skrivningar "
            "eller meddelanden skickas. Godkänn läsningen?",
        )
        self._choices([
            ("Läs och analysera", self._approve_uia_read),
            ("Avbryt", self._cancel_uia_read),
        ])
        self._phase("godkannande", "Väntar på godkännande att läsa vald webbläsarsida")

    def _cancel_uia_read(self):
        self.pending_uia_read_instruction = None
        self.pending_uia_read_target = None
        self._choices([])
        self._append("step", "Nova: Sidläsningen avbröts. Ingen sidtext lästes eller skickades.")
        self._phase("redo", "Redo för ett nytt kommando")

    def _approve_uia_read(self):
        instruction = self.pending_uia_read_instruction
        target = self.pending_uia_read_target
        self.pending_uia_read_instruction = None
        self.pending_uia_read_target = None
        self._choices([])

        if not instruction or not target:
            self._phase("redo", "Ingen väntande sidläsning")
            return
        if not self.bridge.state.online():
            self._append("warn", "Nova: Atlas kopplades från. Ingen sidtext lästes eller skickades.")
            self._phase("godkannande", "Anslut Atlas och upprepa kommandot")
            return

        epoch = self.task_epoch
        self._phase("tolkar", "Läser synlig text från den godkända webbläsarsidan")
        threading.Thread(
            target=self._read_uia_page_worker,
            args=(epoch, instruction, target),
            daemon=True,
            name="Nova-UIA-PageRead",
        ).start()

    def _read_uia_page_worker(self, epoch: int, instruction: str, target: dict):
        """Read outside Tk's UI thread; only return a bounded prompt to the UI."""
        try:
            page = read_window(target, user_requested=True, max_chars=8000)
            prompt = build_page_read_prompt(instruction, page.get("text", ""))
            result = {"ok": True, "page": page, "prompt": prompt}
        except (UIAutomationError, ValueError) as exc:
            result = {"ok": False, "error": str(exc)}
        except Exception:
            result = {"ok": False, "error": "uia_worker_error"}
        self.uia_results.put((epoch, result))

    def _finish_uia_read(self, epoch: int, result: dict):
        """Complete the local-to-Atlas handoff on Tk's main thread."""
        if self.closed or epoch != self.task_epoch:
            return
        if not result.get("ok"):
            error = result.get("error", "uia_worker_error")
            self._append(
                "warn",
                f"Nova: Jag kunde inte läsa den godkända sidan ({error}). Inget skickades till Atlas.",
            )
            self._phase(
                "godkannande",
                "Kontrollera att rätt webbläsarfönster fortfarande är aktivt och försök igen",
            )
            return
        if not self.bridge.state.online():
            self._append(
                "warn",
                "Nova: Sidtexten lästes lokalt men Atlas kopplades från. Inget skickades.",
            )
            self._phase("godkannande", "Anslut Atlas och upprepa kommandot")
            return

        page = result["page"]
        task_id, detail = self.bridge.state.enqueue(result["prompt"])
        if not task_id:
            self._append("warn", "Nova: " + detail)
            self._phase("godkannande", detail)
            return

        self._append(
            "step",
            f"Nova: Läste synlig text från {page.get('processName', 'webbläsaren')} "
            "och skickade den till Atlas i skrivskyddat läge. Inga ändringar gjordes.",
        )
        self._phase("tolkar", "Atlas analyserar den valda sidtexten")

    def _present_native_plan(self, plan: TaskPlan):
        """Review multi-step navigation; read-only local diagnostics run directly.

        This never interprets Atlas prose as an executable command. Only the
        strict native parser may create these allowlisted steps.
        """
        if not plan.steps:
            return
        if plan.requires_approval:
            if not getattr(self, "live_call", None):
                self.stop_native_mic_pilot(quiet=True)
            self.pending_native_plan = plan
            lines = "\n".join(
                f"  {i}. {step.description}" for i, step in enumerate(plan.steps, 1)
            )
            if plan.steps[0].kind == "note":
                step = plan.steps[0]
                self._reply("nova", f"Ny anteckning i {NOTES_DIR}\n\n{step.note}",
                            spoken="Kontrollera anteckningen i rutan innan du sparar den.")
                approval = "Spara anteckning"
            else:
                self._append("nova", "Godkänn öppningarna för att köra planen:\n" + lines)
                approval = f"Godkänn {len(plan.steps)} öppningar"
            self._choices([
                (approval, self._approve_native_plan),
                ("Avbryt planen", self._cancel_native_plan),
            ])
            self._phase("godkannande", "Granska uppgiften i rutan")
        else:
            self._execute_native_plan(plan)

    def _cancel_native_plan(self):
        self.native_task_epoch += 1
        self.pending_native_plan = None
        self._choices([])
        self._append("warn", "Nova: Planen avbröts innan nästa steg. "
                            "Redan öppnade fönster ändras inte tillbaka.")
        self._phase("stoppad", "Lokal arbetsplan avbruten")
        if self._conversation_active():
            self._resume_native_voice_after_reply()

    def _approve_native_plan(self):
        plan = self.pending_native_plan
        if plan is None:
            return
        self.pending_native_plan = None
        self._choices([])
        self._execute_native_plan(plan)

    def _execute_native_plan(self, plan: TaskPlan):
        self.native_task_epoch += 1
        epoch = self.native_task_epoch
        self._phase("navigerar", "Nova arbetar · enbart godkända lokala steg")
        self._execute_native_step(plan, 0, epoch)

    def _execute_native_step(self, plan: TaskPlan, index: int, epoch: int):
        if self.closed or epoch != self.native_task_epoch:
            return
        step = plan.steps[index]
        self._append("step", f"  ↳ Steg {index + 1}/{len(plan.steps)}: {step.description}")
        result = execute_native_step(step)
        self._reply("ok" if result.success else "warn", "Nova: " + result.text)
        if not result.success:
            self._phase("godkannande", "Steget misslyckades · inga fler steg")
            if plan.requires_approval and self._conversation_active():
                self._resume_native_voice_after_reply()
            return
        if index + 1 < len(plan.steps):
            # Each dispatch is visible; Stop cancels only not-yet-issued steps.
            self.root.after(
                500, lambda: self._execute_native_step(plan, index + 1, epoch)
            )
        else:
            self._phase("klar", "Lokal arbetsplan färdig · resultat redovisat")
        if plan.requires_approval and index + 1 == len(plan.steps) and self._conversation_active():
            self._resume_native_voice_after_reply()

    def send(self, *, from_voice: bool = False, safe_voice_action=None, transcript: str | None = None):
        if not self.expanded:
            self.expand(False)
        text = transcript if transcript is not None else self.command.get("1.0", "end-1c").strip()
        if not text:
            self._phase("redo", "Skriv eller diktera vad jag ska göra")
            return
        if getattr(self, "live_call", None) and self._conversation_active():
            if transcript is None:
                self.command.delete("1.0", "end")
                self.draft = ""
            self._live_input(text)
            return
        if normalized(text).strip(" .!?") in ("anslut sanna", "anslut sannas rost"):
            self.command.delete("1.0", "end")
            self.draft = ""
            self._connect_sanna()
            return
        self._cancel_commander()
        self._discard_voice_interpretation()
        # Code-job proposals are inert: only a reviewed draft is prepared.
        # Parsing happens before generic Atlas handoff for both voice and text.
        self.pending_code_job = None
        # Local emergency stop is handled before any Atlas/OS routing.
        # It never becomes a network prompt or a Windows automation step.
        if safe_stop_command(text):
            self._append("you", "DU: " + text)
            self.command.delete("1.0", "end")
            self.draft = ""
            self.stop()
            return
        self._waiting_operator_request = None
        self.pending = ""
        self.task_epoch += 1
        # A new user instruction cancels only steps not yet dispatched.
        self.native_task_epoch += 1
        self.pending_native_plan = None
        self.pending_uia_read_instruction = None
        self.pending_uia_read_target = None
        # Manual or automatic Send must clear the one-shot voice state.
        self._auto_voice.cancel()
        # A quick Enter must not start dictation later from a pending shortcut.
        self._voice_request_id += 1
        self._choices([])
        self._append("you", "DU: " + text)
        self._phase("tolkar", "Avgör vilken godkänd åtgärd som passar")
        if transcript is None:
            self.command.delete("1.0", "end")
            self.draft = ""
        self.transcript_var.set((self.last_heard or text[:180]) if from_voice and transcript is not None else text[:180])
        workspace = getattr(self, "workspace", None)
        if workspace:
            workspace_action = workspace.route(text)
            if workspace_action and not (workspace_action[0] in ("append", "remove") and project_intent(text)):
                self._stop_reply()
                workspace.handle(workspace_action, text)
                return
            workspace.reset(workspace.provider)
            self._stop_reply()
        if project_intent(text) and not from_voice:
            self._begin_commander(commander_request(text) or text)
            return
        if not from_voice:
            media = spotify_command(text, spotify_selected=self.spotify_selected)
            if media:
                self._perform_interpreted_action(media)
                return
        explicit_goal = commander_request(text, explicit_only=True) if not from_voice else None
        if explicit_goal:
            self._begin_commander(explicit_goal)
            return
        plan = parse_native_task(text)
        if not from_voice and plan is None:
            goal = commander_request(text)
            if goal and (not safe_auto_navigation(text) and not safe_browser_command(text)
                         and not safe_window_focus(text) and not safe_uia_read_action(text)
                         and not propose_code_job(text) and not campaign_review_intent(text)):
                self._begin_commander(goal)
                return
        # A note body is literal text, even when it contains a coding request.
        code_job = propose_code_job(text) if plan is None else None
        if code_job:
            self._present_code_job(code_job)
            return
        if from_voice:
            # A transcript that was not an exact allowlisted navigation must
            # never reach arbitrary local UI or shell execution.
            if (safe_voice_action is None or
                    (safe_stop_command(text) or spotify_command(text, spotify_selected=getattr(self, "spotify_selected", False))
                     or safe_auto_navigation(text) or safe_native_voice_action(text)
                     or safe_browser_command(text) or safe_window_focus(text)
                     or campaign_review_intent(text)
                     or safe_uia_read_action(text)) != safe_voice_action):
                self._received_voice_without_navigation(text)
                return
            if safe_voice_action.kind == "uia_read_preview":
                self._present_uia_read_preview(text)
                return
            if safe_voice_action.kind in ("native_read", "native_preview"):
                if plan is None or (plan.requires_approval !=
                                    (safe_voice_action.kind == "native_preview")):
                    self._received_voice_without_navigation(text)
                    return
                self._present_native_plan(plan)
                return
            action = safe_voice_action
        else:
            if plan is not None:
                self._present_native_plan(plan)
                return
            folder = public_project_command(text)
            if folder:
                self._open_project_folder(folder)
                return
            action = (safe_uia_read_action(text) or safe_browser_command(text)
                      or safe_window_focus(text) or campaign_review_intent(text)
                      or safe_auto_navigation(text) or route(text))
        if action.kind == "uia_read_preview":
            self._present_uia_read_preview(text)
        elif action.kind == "spotify_media":
            self.spotify_selected = True
            self._control_spotify(action.url)
        elif action.kind == "campaign_review":
            self._open_campaign_review(action.url)
        elif action.kind in ("browser_control", "browser_focus"):
            self._navigate_browser(action)
        elif action.kind == "open":
            self._open_url(action.url, action.description)
        elif action.kind == "app":
            self._start_app(action)
        elif action.kind == "windows":
            self.show_windows()
        elif action.kind == "focus":
            self.focus_window(action.url)
        elif action.kind == "handoff":
            self._received_voice_without_navigation(text)
        else:
            self._phase("redo", "Skriv eller diktera ett kommando")

    def _open_campaign_review(self, month: str):
        """GET-only handoff to an authenticated human-approval surface.

        If the dedicated protected preview is missing, open the already
        deployed Marketing Review instead and do not pretend to start agents.
        """
        approved = (
            read_saved_preview_origin(str(self.campaign_preview_file))
            if self.campaign_preview_file else None
        )
        if approved:
            try:
                url = campaign_review_url(approved, month)
                self._append(
                    "nova",
                    "Nova: Jag öppnar Campaign Planner i en skyddad testversion. "
                    "Inga agenter startar förrän du loggat in, granskat och "
                    "tryckt Godkänn på Omniras sida."
                )
                self._open_url(url, "Öppnar Campaign Planner-granskning utan att köa uppdrag")
                return
            except ValueError:
                pass
        self._append(
            "warn",
            "Nova: Den nya beställningssidan är inte aktiverad i denna "
            "Nova-version. Jag öppnar den befintliga marknadsgranskningen. "
            "Inga agenter har beställts."
        )
        self._open_url(
            URLS["marketing"],
            "Öppnar Omniras marknadsgranskning (ingen agentkörning skapad)"
        )

    def _navigate_browser(self, action):
        """Only allow safe, fixed browser shortcuts to a verified browser HWND."""
        self.spotify_selected = False
        self._phase("navigerar", "Söker verifierat webbläsarfönster")
        self._append("step", "  ↳ " + action.description)
        try:
            outcome = self._browser.execute(action)
            self._append("ok" if outcome.accepted else "warn", "Nova: " + outcome.message)
            self._phase("klar" if outcome.accepted else "godkannande", outcome.message)
        except (OSError, ValueError, AttributeError) as exc:
            self._append("warn", "Nova: Webbläsarnavigeringen misslyckades: " + str(exc))
            self._phase("godkannande", "Ingen navigeringsåtgärd utförd")

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
        self._discard_voice_interpretation()
        self.spotify_selected = False
        self._phase("navigerar", "Försöker växla till godkänt öppet program")
        self._append("step", "  ↳ Fönsterbyte: " + key)
        try:
            verified, message = focus_known_window(key)
            # Spotify remains the conversational target even if Windows denied foreground focus.
            self.spotify_selected = key == "spotify"
            if key == "spotify" and not verified and message.startswith("Windows nekade"):
                os.startfile("spotify:")
                epoch = self.native_task_epoch
                self.root.after(750, lambda: self._verify_spotify_focus(epoch))
                return
            self._reply("ok" if verified else "warn", "Nova: " + message,
                        spoken="Spotify är öppet." if key == "spotify" and verified else None)
            self._phase("klar" if verified else "godkannande", message)
        except Exception as exc:
            self._reply("warn", "Nova: Fönsterbytet misslyckades: " + str(exc))
            self._phase("godkannande", "Fönsterbyte misslyckades")

    def _verify_spotify_focus(self, epoch):
        if self.closed or not self.expanded or self.native_task_epoch != epoch:
            return
        verified, message = focus_known_window("spotify")
        self._reply("ok" if verified else "warn", "Nova: " + message,
                    spoken="Spotify är öppet." if verified else None)
        self._phase("klar" if verified else "godkannande", message)

    def show_projects(self):
        self.expand(False) if not self.expanded else None
        self._append("nova", "Nova: Här är de verifierade lokala arbetsmapparna. "
                     "Atlas är den centrala källan för projektminnet, "
                     "men dess minnestillstånd är inte anslutet till bubblan än.")
        for name, path in PROJECTS.items():
            self._append("step", f"  ↳ {name}: {'hittad' if os.path.isdir(path) else 'saknas'}")
        self._phase("godkannande", "Exempel: Öppna Omniras projektmapp")

    def stop(self):
        self._end_live_call()
        if getattr(self, "workspace", None):
            self.workspace.reset()
        self._voice_turn_until = self._voice_answer_until = self._voice_navigation_until = 0.0
        self._cancel_commander()
        self._stop_reply()
        self._cancel_spotify_control()
        self._native_hotkey_pending_until = 0.0
        self._native_conversation_deadline = 0.0
        self.stop_native_mic_pilot(quiet=True)
        self.bridge.state.request_voice_control("voice_interrupt")
        self._voice_request_id += 1
        self._auto_voice.cancel()
        self.native_task_epoch += 1
        self.pending_native_plan = None
        self.pending_code_job = None
        self.pending_uia_read_instruction = None
        self.pending_uia_read_target = None
        self.bridge.state.cancel()
        self.task_epoch += 1
        self._choices([])
        self._phase("stoppad", "Inga fler uppdrag utförs i Nova")
        self._append("warn", "Nova: Avbrutet. Detta stänger inte program eller "
                     "ångrar navigering som redan startats.")
        self.pending = ""
        self._waiting_operator_request = None

    def quit(self):
        self._end_live_call()
        self._native_conversation_deadline = 0.0
        if getattr(self, "workspace", None):
            self.workspace.reset()
        self._cancel_commander()
        self._stop_reply()
        self._cancel_spotify_control()
        self._native_hotkey_pending_until = 0.0
        self.stop_native_mic_pilot(quiet=True)
        self.closed = True
        self.native_task_epoch += 1
        self.pending_native_plan = None
        self.pending_code_job = None
        self.pending_uia_read_instruction = None
        self.pending_uia_read_target = None
        self._auto_voice.cancel()
        self.listener.stop()
        self.bridge.stop()
        self.root.destroy()
