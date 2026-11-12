"""Nova's native Windows UI. Small raster surfaces are rendered at the display DPI."""
from __future__ import annotations

import ctypes
from functools import lru_cache
import math
import struct
import sys
import tkinter as tk
from tkinter import font as tkfont
import zlib

TRANSPARENT = "#02030a"
SURFACE = "#191d21"
PANEL = "#202529"
INPUT = "#252c30"
ACCENT = "#afddce"
CYAN = "#91bdaf"
TEXT = "#f2f3ef"
MUTED = "#acb7b8"
SUCCESS = "#a4d4bc"
WARNING = "#edc491"
BORDER = "#364045"
INITIAL_OPACITY = 1.0


def enable_native_dpi():
    if sys.platform == "win32":
        try:
            ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        except AttributeError:
            ctypes.windll.user32.SetProcessDPIAware()


def window_scale(widget):
    if sys.platform == "win32":
        try:
            dpi = ctypes.windll.user32.GetDpiForWindow(ctypes.c_void_p(widget.winfo_id()))
            if dpi:
                return dpi / 96
        except AttributeError:
            pass
    return widget.winfo_fpixels("1i") / 96


def rgb(color):
    return tuple(bytes.fromhex(color[1:]))


def blend(a, b, weight):
    return tuple(round(c + (d - c) * weight) for c, d in zip(a, b))


def mix_color(first, second, fraction):
    return "#" + bytes(blend(rgb(first), rgb(second), max(0, min(1, fraction)))).hex()


def png(width, height, rows):
    def chunk(name, data):
        return struct.pack(">I", len(data)) + name + data + struct.pack(">I", zlib.crc32(name + data))
    header = struct.pack(">2I5B", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(
        b"".join(b"\0" + row for row in rows), 3)) + chunk(b"IEND", b"")


@lru_cache(maxsize=48)
def rounded_surface(width, height, radius, fill, edge, background):
    """Mirror the corner pixels; wide/large panels never require a pixel-by-pixel fill."""
    radius = min(radius, width // 2, height // 2)
    body, line, back = map(rgb, (fill, edge, background))
    rows = []
    for y in range(radius + 1):
        corner = bytearray()
        for x in range(radius):
            distance = radius - math.hypot(max(0, radius - x - .5), max(0, radius - y - .5))
            outer = min(1, max(0, distance + .5))
            inner = min(1, max(0, distance - .5))
            corner.extend(blend(blend(back, line, outer), body, inner))
        if y >= radius:
            corner = bytearray(bytes(line) + bytes(body) * max(0, radius - 1))
        middle = bytes(line if y == 0 else body) * (width - radius * 2)
        opposite = b"".join(corner[i:i + 3] for i in range(len(corner) - 3, -1, -3))
        rows.append(bytes(corner) + middle + opposite)
    return png(width, height, rows[:-1] + [rows[-1]] * (height - radius * 2) + rows[-2::-1])


def _edges(points):
    # A normalized inward-facing normal gives distance in physical pixels.
    result = []
    for (x, y), (end_x, end_y) in zip(points, points[1:] + points[:1]):
        dx, dy = end_x - x, end_y - y
        length = math.hypot(dx, dy)
        result.append((-dy / length, dx / length, (dy * x - dx * y) / length))
    return result


def _coverage(value):
    return max(0.0, min(1.0, value))


@lru_cache(maxsize=16)
def mark_image(size, background, hover=False):
    # Three faces of a folded N, drawn at the target resolution.
    faces = [
        (_edges(((.292, .302), (.394, .302), (.394, .704), (.292, .704))), rgb("#9bbcb2")),
        (_edges(((.606, .302), (.708, .302), (.708, .704), (.606, .704))), rgb("#b5d5ca")),
        (_edges(((.292, .302), (.412, .302), (.708, .704), (.588, .704))), rgb("#e4eee7")),
    ]
    top = rgb("#35443f" if hover else "#303d39")
    bottom = rgb("#232b2a" if hover else "#222928")
    edge = rgb("#596c62" if hover else "#48574f")
    back = rgb(background)
    radius = size * .32
    flat = size / 2 - radius - 1
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            nx, ny = (x + .5) / size, (y + .5) / size
            dx = max(abs(x + .5 - size / 2) - flat, 0)
            dy = max(abs(y + .5 - size / 2) - flat, 0)
            distance = math.hypot(dx, dy) - radius
            tile = blend(top, bottom, .22 * nx + .78 * ny)
            color = blend(back, edge, _coverage(.5 - distance))
            color = blend(color, tile, _coverage(-.5 - distance))
            if .26 < nx < .74 and .27 < ny < .74:
                for edges, ink in faces:
                    nearest = min(a * nx + b * ny + c for a, b, c in edges)
                    color = blend(color, ink, _coverage(nearest * size + .5))
            row.extend(color)
        rows.append(bytes(row))
    return png(size, size, rows)


def paint_image(canvas, data, x=0, y=0):
    # Keep the Tcl image alive for exactly as long as this canvas.
    canvas._artwork = tk.PhotoImage(master=canvas, data=data, format="png")
    canvas.create_image(x, y, anchor="nw", image=canvas._artwork)


def paint_premium_panel(canvas, width, height, scale=1):
    data = rounded_surface(width, height, round(17 * scale), SURFACE, BORDER, TRANSPARENT)
    paint_image(canvas, data)


def paint_nova_orb(canvas, size, background=TRANSPARENT, hover=False, inset=0):
    canvas.delete("all")
    data = mark_image(size - 2 * inset, background, hover)
    paint_image(canvas, data, inset, inset)


class PremiumButton(tk.Canvas):
    def __init__(self, parent, label, command, emphasis=False, surface=False,
                 width=None, compact=False, scale=1):
        self.label, self.command = label, command
        self.emphasis, self.surface = emphasis, surface
        self.attention = False
        self._hover = False
        self._scale = scale
        icon = width is not None and len(label) <= 2
        self._font = tkfont.Font(root=parent, family="Segoe UI Semibold",
                                 size=-round((18 if icon else 13) * scale))
        self._pixel_height = round((30 if compact else 34) * scale)
        self._pixel_width = self._pixel_height if icon else self._font.measure(label) + round(24 * scale)
        super().__init__(parent, width=self._pixel_width, height=self._pixel_height, bg=parent.cget("bg"),
                         bd=0, highlightthickness=0, relief="flat", cursor="hand2", takefocus=True)
        self.bind("<Enter>", lambda _e: self._highlight(True))
        self.bind("<Leave>", lambda _e: self._highlight(False))
        for event in ("<Button-1>", "<Return>", "<space>"):
            self.bind(event, self._activate)
        self.bind("<FocusIn>", lambda _e: self._paint())
        self.bind("<FocusOut>", lambda _e: self._paint())
        self._paint()

    def set_attention(self, value):
        if self.attention != bool(value):
            self.attention = bool(value)
            self._paint()

    def _highlight(self, value):
        self._hover = value
        self._paint()

    def _activate(self, _event):
        self.command()
        return "break"

    def _paint(self):
        self.delete("all")
        if self.emphasis:
            fill, edge, text = ("#c1e6d9" if self._hover else ACCENT), ACCENT, "#15241f"
        elif self.attention or self._hover:
            fill, edge, text = "#303b39", "#4c6059", TEXT
        elif self.surface:
            fill, edge, text = SURFACE, SURFACE, MUTED
        else:
            fill, edge, text = "#282e32", "#3a4246", TEXT
        if self.focus_get() is self:
            edge = CYAN
        w, h = self._pixel_width, self._pixel_height
        paint_image(self, rounded_surface(w, h, round(9 * self._scale), fill, edge, self.cget("bg")))
        self.create_text(w / 2, h / 2, text=self.label, fill=text, font=self._font)


class SlimScrollbar(tk.Canvas):
    def __init__(self, parent, on_scroll, scale=1, **kwargs):
        self.scale = scale
        super().__init__(parent, width=round(6 * scale), bg=PANEL, borderwidth=0, highlightthickness=0,
                         relief="flat", cursor="hand2", **kwargs)
        self.first, self.last = 0.0, 1.0
        self.on_scroll = on_scroll
        self.bind("<Configure>", lambda _e: self._paint())
        self.bind("<Button-1>", self._jump)
        self.bind("<B1-Motion>", self._jump)

    def set(self, first, last):
        self.first, self.last = float(first), float(last)
        self._paint()

    def _paint(self):
        self.delete("all")
        if self.last - self.first >= .999:
            return
        w, h = self.winfo_width(), self.winfo_height()
        top = max(2, self.first * h)
        bottom = min(h - 2, max(top + 12 * self.scale, self.last * h))
        if bottom > top:
            self.create_line(w / 2, top, w / 2, bottom, fill="#586461",
                             width=max(2, round(3 * self.scale)), capstyle="round")

    def _jump(self, event):
        viewport = self.last - self.first
        fraction = event.y / max(1, self.winfo_height()) - viewport / 2
        self.on_scroll(max(0, min(1 - viewport, fraction)))
