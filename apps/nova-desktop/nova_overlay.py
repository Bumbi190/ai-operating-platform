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
import time
import tkinter as tk
from tkinter import font as tkfont, simpledialog
import webbrowser

from nova_core import HotkeyListener, URLS, APP_SHORTCUTS, route, normalized
from nova_hotkey_host import HostEventListener
from nova_focus import ForegroundFocusGuard
from nova_placement import (
    foreground_window_rectangle, choose_working_zone,
    read_saved_anchor, save_anchor, clear_anchor,
)
from nova_auto_voice import AutoVoiceState, safe_auto_navigation
from nova_bridge import NovaBridge, PROD_ORIGIN, read_saved_preview_origin
from nova_windows import list_known_windows, focus_known_window
from nova_theme import (
    TRANSPARENT, SURFACE, PANEL, INPUT, ACCENT, CYAN, TEXT, MUTED,
    SUCCESS, WARNING, BORDER, INITIAL_OPACITY,
    paint_premium_panel, paint_nova_orb, PremiumButton, SlimScrollbar,
)
PROJECTS = {
    "Omnira": r"C:\Users\Andre\Projects\Omnira",
    "Handlarbörsen": r"C:\Users\Andre\Projects\Handlarborsen",
    "Familje-Stunden": r"C:\Users\Andre\Projects\Familje-Stunden",
}
BUBBLE_W, BUBBLE_H = 94, 94
PANEL_W, PANEL_H = 442, 600


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
        self.pending_choices = []  # only visible inside the ⋯ menu
        self.history: list[tuple[str, str]] = []  # session UI trace, not AI memory
        self._atlas_login_opened = False  # explicit SSO sign-in before pairing key
        self._voice_request_id = 0
        self._auto_voice = AutoVoiceState()
        self.auto_voice_enabled = tk.BooleanVar(value=True)
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
        self.root.after(170, self._animate)
        self.root.after(150, self._poll_bridge)
        self.root.after(160, self._poll_voice_auto)
        self.root.after(400, self._remember_active_window)
        self.root.after(900, self._show_bridge_status)
        self.root.deiconify()
        self.root.lift()
        if os.environ.get("NOVA_START_EXPANDED") == "1":
            self.root.after(180, lambda: self.expand(listen=True))

    def _setup_fonts(self):
        self.h = ("Segoe UI Semibold", 12)
        self.small = ("Segoe UI", 9)
        self.body = ("Segoe UI", 10)
        self.entry_font = ("Segoe UI", 11)

    def _clear(self):
        for child in self.root.winfo_children():
            child.destroy()

    def _remember_active_window(self):
        """Remember the last other foreground app, even if Nova gains focus
        before the hotkey event reaches the overlay process.
        """
        try:
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
        if self._manual_anchor is None:
            geometry = anchored_geometry(width, height, area=self._dock_area)
        else:
            right, bottom = self._manual_anchor
            left, top, monitor_right, monitor_bottom = work_area((right - 1, bottom - 1))
            x = max(left, min(right - width, monitor_right - width))
            y = max(top, min(bottom - height, monitor_bottom - height))
            geometry = f"{width}x{height}{x:+d}{y:+d}"
        self.root.geometry(geometry)
        self.root.lift()

    def _begin_drag(self, event):
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
            self.expand(False)

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
        c = self._canvas(BUBBLE_W, BUBBLE_H)
        paint_nova_orb(c, BUBBLE_W)
        self._bind_drag(c, self._end_bubble_drag)
        c.bind("<Button-3>", self._bubble_menu)
        c.bind("<Enter>", lambda _e: c.configure(cursor="hand2"))
        self.bubble_canvas = c

    def _bubble_menu(self, event):
        menu = tk.Menu(self.root, tearoff=0, bg="#172135", fg=TEXT,
                       activebackground="#363560", activeforeground=TEXT,
                       bd=1, relief="flat")
        menu.add_command(label="Öppna Nova", command=lambda: self.expand(False))
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
        bg = self._canvas(PANEL_W, PANEL_H)
        paint_premium_panel(bg, PANEL_W, PANEL_H)
        content = tk.Frame(bg, bg=SURFACE)
        bg.create_window(18, 18, window=content, anchor="nw",
                         width=PANEL_W - 36, height=PANEL_H - 36)
        top = tk.Frame(content, bg=SURFACE)
        top.pack(fill="x", pady=(0, 9))
        logo = tk.Canvas(top, width=42, height=42, bg=SURFACE,
                         bd=0, highlightthickness=0)
        logo.pack(side="left", padx=(0, 11))
        logo.create_oval(1, 1, 40, 40, fill="#222a4d",
                         outline="#5f6d99", width=1)
        logo.create_arc(1, 1, 40, 40, start=48, extent=112,
                        outline=CYAN, width=2, style="arc")
        logo.create_arc(4, 4, 37, 37, start=214, extent=95,
                        outline=ACCENT, width=2, style="arc")
        logo.create_text(21, 20, text="N",
                         font=("Segoe UI Semibold", 19), fill=TEXT)
        labels = tk.Frame(top, bg=SURFACE)
        labels.pack(side="left", fill="x", expand=True)
        self._bind_drag(top)
        self._bind_drag(logo)
        self._bind_drag(labels)
        tk.Label(labels, text="N O V A", bg=SURFACE, fg=TEXT,
                 font=("Segoe UI Semibold", 14), anchor="w").pack(anchor="w")
        tk.Label(labels, text="OMNIRA  /  DESKTOP INTELLIGENCE",
                 bg=SURFACE, fg=CYAN,
                 font=("Segoe UI Semibold", 7), anchor="w").pack(anchor="w")
        # Activity strip below already shows task state; avoid repeating it here.
        self.phase_var = tk.StringVar(value="● Redo att hjälpa")
        self.bridge_var = tk.StringVar(value="Atlas offline · klicka för att ansluta")
        self.bridge_status = tk.Label(
            labels, textvariable=self.bridge_var, bg=SURFACE, fg=CYAN,
            font=("Segoe UI", 8, "underline"), anchor="w", cursor="hand2",
        )
        self.bridge_status.pack(anchor="w")
        for child in labels.winfo_children():
            if child is not self.bridge_status:
                self._bind_drag(child)
        self.bridge_status.bind("<Button-1>", lambda _e: self.connect_atlas())
        # Standard window close must NOT shut down the global hotkey listener.
        # Full termination remains available only through the explicit ⋯ menu.
        self._btn(top, "×", self.collapse, width=3, surface=True).pack(side="right")
        self._btn(top, "–", self.collapse, width=3, surface=True).pack(side="right", padx=(0, 5))
        self.more_button = self._btn(top, "⋯", self._show_more_menu,
                                     width=3, surface=True)
        self.more_button.pack(side="right", padx=(0, 5))
        self._refresh_more_button()

        self.activity = tk.Canvas(content, width=PANEL_W-36, height=35,
                                  bg=SURFACE, highlightthickness=0, bd=0)
        self.activity.pack(fill="x", pady=(3, 9))
        rounded_rectangle(self.activity, 1, 1, PANEL_W - 39, 34, 10,
                          fill="#1a2940", outline="#324b6b", width=1)
        self.activity.create_oval(15, 14, 23, 22, fill=CYAN, outline="")
        self.activity_text = self.activity.create_text(
            36, 18, anchor="w", text="Redo för ett nytt kommando",
            fill=MUTED, font=self.small)

        chat_shell = tk.Frame(content, bg=BORDER, padx=1, pady=1)
        chat_shell.pack(fill="both", expand=True)
        chat_container = tk.Frame(chat_shell, bg=PANEL, padx=12, pady=9)
        chat_container.pack(fill="both", expand=True)
        scroll = SlimScrollbar(chat_container,
                               on_scroll=lambda fraction: self.chat.yview_moveto(fraction))
        scroll.pack(side="right", fill="y", padx=(5, 0))
        self.chat = tk.Text(chat_container, height=4, wrap="word", font=self.body,
                            bg=PANEL, fg=TEXT, relief="flat", bd=0,
                            padx=7, pady=9, highlightthickness=0,
                            spacing1=2, spacing3=3,
                            yscrollcommand=scroll.set)
        self.chat.pack(side="left", fill="both", expand=True)
        self.chat.tag_configure("you", foreground="#c2b9ff", spacing1=10)
        self.chat.tag_configure("nova", foreground=TEXT, spacing1=9)
        self.chat.tag_configure("step", foreground=CYAN, spacing1=4)
        self.chat.tag_configure("warn", foreground=WARNING, spacing1=6)
        self.chat.tag_configure("ok", foreground=SUCCESS, spacing1=5)
        self.chat.config(state="disabled")
        self._render_history()

        live = tk.Frame(content, bg=SURFACE)
        live.pack(fill="x", pady=(8, 0))
        tk.Label(live, text="LIVE  /", bg=SURFACE, fg=CYAN,
                 font=("Segoe UI Semibold", 8)).pack(side="left", padx=(0, 8))
        self.transcript_var = tk.StringVar(value="—")
        self.transcript_label = tk.Label(
            live, textvariable=self.transcript_var, bg=SURFACE, fg="#c9c8ff",
            font=self.small, anchor="w", width=35, justify="left")
        self.transcript_label.pack(side="left", fill="x", expand=True)

        self.input_shell = tk.Frame(content, bg="#4c5c83", padx=1, pady=1)
        self.input_shell.pack(fill="x", pady=(7, 8))
        self.command = tk.Text(self.input_shell, height=2, wrap="word", font=self.entry_font,
                               bg=INPUT, fg=TEXT, insertbackground=CYAN,
                               relief="flat", padx=13, pady=7, highlightthickness=0,
                               selectbackground="#55559a")
        self.command.pack(fill="x")
        self.command.bind("<FocusIn>", lambda _e: self.input_shell.configure(bg=CYAN))
        self.command.bind("<FocusOut>", lambda _e: self.input_shell.configure(bg="#4c5c83"))
        self.command.bind("<Return>", self._submit_enter)
        self.command.bind("<Control-Return>", self._submit_enter)
        self.command.bind("<Control-period>", self._stop_shortcut)
        self.command.bind("<Escape>", lambda _e: self.collapse())
        self.command.bind("<KeyRelease>", self._on_input)
        self.command.insert("1.0", self.draft)
        actions = tk.Frame(content, bg=SURFACE)
        actions.pack(fill="x")
        self._btn(actions, "🎙 Prata", self.dictate).pack(side="left", padx=(0, 8))
        self._btn(actions, "➤ Skicka", self.send, emphasis=True).pack(side="right")
        tk.Label(content,
                 text="Enter skickar · Shift+Enter ny rad · Fler val under ⋯",
                 bg=SURFACE, fg="#828ba9", font=("Segoe UI", 8)).pack(
                     fill="x", pady=(6, 0))

        if not self.history:
            self._append("nova", "Nova: Jag öppnar godkända program och projekt. "
                          "Mer avancerade uppdrag lämnar jag till Atlas – utan att "
                          "påstå att de redan är utförda.")
        if self.draft:
            self.transcript_var.set(self.draft[:180])

    def _btn(self, parent, label, callback, emphasis=False, surface=False, width=None):
        return PremiumButton(
            parent, label, callback, emphasis=emphasis,
            surface=surface, width=width, compact=(width is not None),
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
        # Contextual actions are retained but never clutter the chat composer.
        self.pending_choices = list(options)
        self._refresh_more_button()

    def _refresh_more_button(self):
        if self.expanded and hasattr(self, "more_button"):
            self.more_button.set_attention(bool(self.pending_choices))

    def _make_more_menu(self):
        menu = tk.Menu(self.root, tearoff=0, bg="#172135", fg=TEXT,
                       activebackground="#363560", activeforeground=TEXT,
                       bd=1, relief="flat")
        if self.pending_choices:
            for label, callback in self.pending_choices:
                menu.add_command(label=label, command=callback)
            menu.add_separator()
        menu.add_command(label="Anslut Atlas", command=self.connect_atlas)
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
        opacity = tk.Menu(menu, tearoff=0, bg="#172135", fg=TEXT,
                          activebackground="#363560", activeforeground=TEXT)
        for percent in (78, 84, 88, 94):
            opacity.add_radiobutton(
                label=f"{100 - percent} % transparent" +
                      (" · standard" if percent == 88 else ""),
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
        percent = max(75, min(98, int(percent)))
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
        # The status strip is 35px high. Never let a long sentence run into
        # the right-hand edge; only the readable short status is displayed.
        short = detail if len(detail) <= 45 else detail[:44] + "…"
        self.activity.itemconfigure(self.activity_text, text=short, fill=color)

    def expand(self, listen=False):
        if not self.expanded:
            self._draw_expanded()
        self.root.deiconify()
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

    def connect_atlas(self):
        """First sign in without key, then explicitly pair with a short-lived key.

        A key-bearing fragment must not cross Vercel SSO redirects.
        """
        if self.bridge.state.online():
            self._phase("klar", "Atlas är redan ansluten (enbart läsning)")
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
                if webbrowser.open(target + "/nova-bridge", new=2):
                    self._atlas_login_opened = True
                    self._append("nova", "Atlas steg 1/2: Omniras skyddade testmiljö öppnades. " +
                                 "Logga in där, klicka sedan på Atlas-statusen i Nova igen.")
                    self._phase("godkannande", "Atlas steg 1/2 · logga in och klicka Atlas igen")
                else:
                    self._append("warn", "Nova: Webbläsaren kunde inte öppna testmiljön.")
            else:
                # Only after manual SSO login do we send the in-memory fragment.
                if webbrowser.open(self.bridge.pairing_url(), new=2):
                    self._append("nova", "Atlas steg 2/2: Klicka Anslut i webbläsaren. " +
                                 "Därefter kan Atlas svara här i läsläge.")
                    self._phase("godkannande", "Atlas steg 2/2 · klicka Anslut i webbläsaren")
                else:
                    self._append("warn", "Nova: Parningssidan kunde inte öppnas.")
        except Exception as exc:
            self._append("warn", "Nova: Atlas-kopplingen kunde inte öppnas: " + str(exc))

    def _show_bridge_status(self):
        if self.expanded and hasattr(self, "bridge_var"):
            if self.bridge.state.online():
                self.bridge_var.set("Atlas ansluten · läsläge")
                self.bridge_status.configure(fg=SUCCESS)
            elif self._atlas_login_opened:
                self.bridge_var.set("Atlas · klicka för att slutföra anslutningen")
                self.bridge_status.configure(fg=CYAN)
            else:
                self.bridge_var.set("Atlas offline · klicka för att ansluta")
                self.bridge_status.configure(fg=CYAN)
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
                if event == "open":
                    if self._manual_anchor is None:
                        self._redock_near_pointer()
                    self.expand(listen=False)
                elif event == "toggle":
                    # A resident hotkey host survives even if the GUI exits.
                    if self.expanded:
                        self.collapse()
                    else:
                        if self._manual_anchor is None:
                            self._redock_near_pointer()
                        self.expand(listen=True)
        except queue.Empty:
            pass
        if not self.closed:
            self.root.after(100, self._process_events)

    def _animate(self):
        # Only the small collapsed Nova orb animates. The expanded status strip
        # stays completely static: no fake audio level and no overlapping bars.
        self.anim_tick = (self.anim_tick + 1) % 720
        if not self.expanded and hasattr(self, "bubble_canvas"):
            self.bubble_canvas.itemconfigure(
                "nova-orbit", start=(215 + self.anim_tick * 2) % 360
            )
        if not self.closed:
            self.root.after(170, self._animate)

    def _poll_voice_auto(self):
        """Inspect the text widget, not key events (Windows dictation can bypass them).

        One-shot voice submissions after a text pause. Only exact allowlisted
        navigation may execute; everything else is sent for review/read-only
        analysis. Typed text outside voice mode is never auto-sent.
        """
        try:
            if self.expanded and self.auto_voice_enabled.get() and self._auto_voice.armed:
                spoken = self.command.get("1.0", "end-1c").strip()
                decision = self._auto_voice.observe_submission(spoken, time.monotonic())
                if decision is not None:
                    # Verify that the original, unmodified transcript is still
                    # in Nova's own focused text field.
                    if (self._focus_guard.has_focus(self.root, self.command)
                            and self.command.get("1.0", "end-1c").strip() == decision.text):
                        if decision.safe_navigation is not None:
                            self._append("step", "Nova: Röstkommando mottaget · öppnar godkänd sida.")
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
        self.transcript_var.set(text[-180:] if text else "—")
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
        """Start Windows voice typing. Windows listens when its toolbar is ready.

        No second click on Nova's Prata button is needed after the global
        shortcut. No always-on microphone is activated by this application.
        """
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

    def _received_voice_without_navigation(self, text: str):
        """Deliver a spoken command to Nova, not a powerful OS executor.

        Atlas is an AI backend; without a tool-enabled native Windows agent
        it cannot open arbitrary desktop applications or press UI controls.
        No implicit clipboard copy, email, publishing or changes occur here.
        """
        if self.bridge.state.online():
            task_id, detail = self.bridge.state.enqueue(text)
            if task_id:
                self._append("step", "  ↳ Fråga skickad till Atlas i läsläge.")
                self._phase("tolkar", "Atlas förbereder svar (kan inte styra Windows)")
            else:
                self._append("warn", "Nova: " + detail)
                self._phase("godkannande", detail)
        else:
            self.pending = text
            self._append(
                "nova",
                "Nova: Jag har tagit emot kommandot. "
                "Jag kan öppna godkända sidor och program lokalt, men mer "
                "avancerad Windows-styrning är ännu inte inkopplad. "
                "Atlas ger projektkunskap och svar, inte fri datornavigering. "
                "Inget har ändrats eller skickats."
            )
            self._choices([
                ("Anslut Atlas för rådgivning", self.connect_atlas),
                ("Kopiera begäran", self.copy_pending),
            ])
            self._phase("godkannande", "Kommandot mottaget · kräver en separat behörighet")

    def send(self, *, from_voice: bool = False, safe_voice_action=None):
        if not self.expanded:
            self.expand(False)
        text = self.command.get("1.0", "end-1c").strip()
        if not text:
            self._phase("redo", "Skriv eller diktera vad jag ska göra")
            return
        self.task_epoch += 1
        # Manual or automatic Send must clear the one-shot voice state.
        self._auto_voice.cancel()
        # A quick Enter must not start dictation later from a pending shortcut.
        self._voice_request_id += 1
        self._choices([])
        self._append("you", "DU: " + text)
        self._phase("tolkar", "Avgör vilken godkänd åtgärd som passar")
        self.command.delete("1.0", "end")
        self.draft = ""
        self.transcript_var.set(text[:180])
        if from_voice:
            # A transcript that was not an exact allowlisted navigation must
            # never reach arbitrary local UI or shell execution.
            if safe_voice_action is None or safe_auto_navigation(text) != safe_voice_action:
                self._received_voice_without_navigation(text)
                return
            action = safe_voice_action
        else:
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
        self._voice_request_id += 1
        self._auto_voice.cancel()
        self.bridge.state.cancel()
        self.task_epoch += 1
        self._choices([])
        self._phase("stoppad", "Inga fler uppdrag utförs i Nova")
        self._append("warn", "Nova: Avbrutet. Detta stänger inte program eller "
                     "ångrar navigering som redan startats.")
        self.pending = ""

    def quit(self):
        self.closed = True
        self._auto_voice.cancel()
        self.listener.stop()
        self.bridge.stop()
        self.root.destroy()
