"""Omnira Premium: dependency-free Win/Tk visual theme for Nova Desktop.

A true Windows Acrylic blur is not claimed: the Tk application uses transparent
window opacity, rounded layered gradients, and carefully chosen contrast.
No app navigation, network calls, AI requests, or secrets live in this module.
"""
from __future__ import annotations

import math
import tkinter as tk
from tkinter import font as tkfont

TRANSPARENT = "#02030a"  # keyed corners are removed by Windows
SURFACE = "#111926"
PANEL = "#182235"
INPUT = "#1c283c"
ACCENT = "#ad9aff"
CYAN = "#64e5f2"
TEXT = "#f5f7ff"
MUTED = "#a0b0cd"
SUCCESS = "#70e6c5"
WARNING = "#ffd09e"
BORDER = "#344661"
INITIAL_OPACITY = 0.88


def mix_color(first: str, second: str, fraction: float) -> str:
    """Return a deterministic RGB blend, independently testable."""
    f = min(1.0, max(0.0, float(fraction)))
    a = tuple(int(first[n:n + 2], 16) for n in (1, 3, 5))
    b = tuple(int(second[n:n + 2], 16) for n in (1, 3, 5))
    return "#" + "".join(f"{round(x + (y - x) * f):02x}" for x, y in zip(a, b))


def rounded_rectangle(canvas, x1, y1, x2, y2, radius, **kwargs):
    radius = min(radius, (x2 - x1) / 2, (y2 - y1) / 2)
    pts = [
        x1 + radius, y1, x2 - radius, y1, x2, y1,
        x2, y1 + radius, x2, y2 - radius, x2, y2,
        x2 - radius, y2, x1 + radius, y2, x1, y2,
        x1, y2 - radius, x1, y1 + radius, x1, y1,
    ]
    return canvas.create_polygon(pts, smooth=True, splinesteps=20, **kwargs)


def paint_premium_panel(canvas: tk.Canvas, width: int, height: int) -> None:
    """Draw a restrained aurora/gradient panel with rounded, transparent edges.

    Tk Canvas has no clip paths or per-item alpha: each horizontal band is
    clipped mathematically to the round rectangle, and the global Tk window
    alpha controls the actual transparency.
    """
    # Soft nested perimeter traces add depth while leaving outer keyed corners.
    for inset, color in ((1, "#26314e"), (3, "#3a3762"), (5, "#272f4f")):
        rounded_rectangle(
            canvas, inset, inset, width - inset, height - inset, 28,
            fill="", outline=color, width=1,
        )
    rounded_rectangle(
        canvas, 7, 7, width - 7, height - 7, 25,
        fill="#0e1727", outline="#586084", width=1,
    )
    left, right, top, bottom, radius = 9, width - 9, 9, height - 9, 24
    for y in range(top + 1, bottom - 1, 2):
        fraction = (y - top) / max(1, bottom - top)
        top_color = mix_color("#24314c", "#0e1727", fraction)
        shade = mix_color(top_color, "#17122d", max(0.0, 0.34 - fraction) * 0.24)
        dy = min(y - top, bottom - y)
        corner_inset = 0
        if dy < radius:
            corner_inset = radius - math.sqrt(max(0, radius * radius - (radius - dy) ** 2))
        canvas.create_line(
            left + corner_inset, y, right - corner_inset, y,
            fill=shade, width=2,
        )
    # Thin upper spectrum: visual signature, not a distracting neon border.
    for i in range(80):
        start = 68 + (width - 136) * i / 80
        end = 68 + (width - 136) * (i + 1) / 80
        color = mix_color("#a48dff", CYAN, i / 79)
        canvas.create_line(start, 8, end + 0.5, 8, fill=color, width=2)
    canvas.create_line(22, height - 13, width - 22, height - 13,
                       fill="#293751", width=1)


def paint_nova_orb(canvas: tk.Canvas, size=94) -> None:
    center = size / 2
    canvas.create_oval(7, 7, size - 7, size - 7,
                       fill="#151b34", outline="#303b64", width=2)
    canvas.create_oval(12, 12, size - 12, size - 12,
                       fill="#1b2544", outline="#465181", width=1)
    canvas.create_arc(8, 8, size - 8, size - 8, start=42, extent=117,
                      outline=ACCENT, width=3, style="arc")
    canvas.create_arc(8, 8, size - 8, size - 8, start=215, extent=90,
                      outline=CYAN, width=2, style="arc", tags="nova-orbit")
    canvas.create_oval(22, 22, size - 22, size - 22,
                       fill="#252c55", outline="#5265a0", width=1)
    canvas.create_text(center, center - 1, text="N",
                       fill=TEXT, font=("Segoe UI Semibold", 30))
    canvas.create_oval(size - 26, size - 25, size - 13, size - 12,
                       fill=SUCCESS, outline="#162032", width=2)


class PremiumButton(tk.Canvas):
    """Accessible-ish canvas pill: focus, hover and keyboard activation."""

    def __init__(
        self, parent, label: str, command,
        emphasis: bool = False, surface: bool = False,
        width: int | None = None, compact: bool = False,
    ):
        self.label = label
        self.command = command
        self.emphasis = emphasis
        self.surface = surface
        self.attention = False
        self._hover = False
        self._font = tkfont.Font(family="Segoe UI Semibold", size=9 if compact else 10)
        natural_width = self._font.measure(label)
        self._pixel_width = max(31, natural_width + (15 if compact else 30))
        if width is not None:
            self._pixel_width = max(31, self._pixel_width if len(label) > 2 else 32)
        self._pixel_height = 31 if compact else 39
        parent_bg = parent.cget("bg")
        super().__init__(
            parent, width=self._pixel_width, height=self._pixel_height,
            bg=parent_bg, bd=0, highlightthickness=0, relief="flat",
            cursor="hand2", takefocus=True,
        )
        self.bind("<Enter>", self._entered)
        self.bind("<Leave>", self._left)
        self.bind("<Button-1>", self._activate)
        self.bind("<Return>", self._activate)
        self.bind("<space>", self._activate)
        self.bind("<FocusIn>", lambda _e: self._paint())
        self.bind("<FocusOut>", lambda _e: self._paint())
        self._paint()

    def set_attention(self, value: bool):
        self.attention = bool(value)
        self._paint()

    def _entered(self, _event):
        self._hover = True
        self._paint()

    def _left(self, _event):
        self._hover = False
        self._paint()

    def _activate(self, _event):
        self.command()

    def _paint(self):
        self.delete("all")
        width, height = self._pixel_width, self._pixel_height
        if self.emphasis:
            fill = "#655fe0" if not self._hover else "#7974f5"
            stroke = "#a79dff"
            text = "#ffffff"
        elif self.attention:
            fill = "#383267" if not self._hover else "#49418b"
            stroke = "#8981e3"
            text = TEXT
        elif self.surface:
            fill = "#1b2940" if not self._hover else "#2b3957"
            stroke = "#3f5578"
            text = "#dbe7fa"
        else:
            fill = "#252a50" if not self._hover else "#35376c"
            stroke = "#5a65a4"
            text = TEXT
        radius = 12 if height < 36 else 15
        rounded_rectangle(self, 1, 2, width - 1, height - 1, radius,
                          fill=fill, outline=stroke, width=1)
        if self.emphasis:
            self.create_line(16, 4, width - 16, 4, fill="#b9aaff", width=1)
        if self.focus_get() is self:
            rounded_rectangle(self, 3, 4, width - 3, height - 3, radius - 2,
                              fill="", outline=CYAN, width=1)
        self.create_text(width / 2, height / 2 + 0.2, text=self.label,
                         fill=text, font=self._font)


class SlimScrollbar(tk.Canvas):
    """Dark, narrow scrollbar replacing the native white Windows scrollbar."""

    def __init__(self, parent, on_scroll, **kwargs):
        super().__init__(
            parent, width=9, bg=PANEL, borderwidth=0, highlightthickness=0,
            relief="flat", cursor="hand2", **kwargs,
        )
        self.first, self.last = 0.0, 1.0
        self.on_scroll = on_scroll
        self.bind("<Configure>", lambda _e: self._paint())
        self.bind("<Button-1>", self._jump)
        self.bind("<B1-Motion>", self._jump)

    def set(self, first, last):
        self.first = max(0.0, min(1.0, float(first)))
        self.last = max(self.first, min(1.0, float(last)))
        self._paint()

    def _paint(self):
        self.delete("all")
        width = max(9, self.winfo_width())
        height = max(20, self.winfo_height())
        self.create_line(width / 2, 4, width / 2, height - 4,
                         fill="#273950", width=3)
        if self.last - self.first >= 0.999:
            return
        thumb_top = 4 + self.first * (height - 8)
        thumb_end = 4 + self.last * (height - 8)
        if thumb_end - thumb_top < 20:
            thumb_end = thumb_top + 20
        rounded_rectangle(self, 2, thumb_top, width - 2,
                          min(height - 3, thumb_end), 3,
                          fill="#827cbb", outline="#9c98d3", width=1)

    def _jump(self, event):
        height = max(20, self.winfo_height())
        fraction = max(0, min(1, (event.y - 4) / max(1, height - 8)))
        viewport = self.last - self.first
        self.on_scroll(max(0, min(1 - viewport, fraction - viewport / 2)))
