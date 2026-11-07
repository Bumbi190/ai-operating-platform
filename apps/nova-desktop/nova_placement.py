"""Place Nova inside the application the user is working in, not at x=5120.

On ultrawide displays a normal application may occupy only a part of the
Windows virtual work area. Read solely its RECT and process ID; no window
title, content or screenshot is inspected.
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes
import os
import sys


def foreground_window_rectangle() -> tuple[int, int, int, int] | None:
    if sys.platform != "win32":
        return None
    u = ctypes.WinDLL("user32", use_last_error=True)
    u.GetForegroundWindow.argtypes = []
    u.GetForegroundWindow.restype = wintypes.HWND
    u.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
    u.GetWindowRect.restype = wintypes.BOOL
    u.GetWindowThreadProcessId.argtypes = [
        wintypes.HWND, ctypes.POINTER(wintypes.DWORD)
    ]
    u.GetWindowThreadProcessId.restype = wintypes.DWORD
    hwnd = u.GetForegroundWindow()
    if not hwnd:
        return None
    pid = wintypes.DWORD()
    u.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    if not pid.value or pid.value == os.getpid():
        # Do not anchor against Nova's own chat panel.
        return None
    rect = wintypes.RECT()
    if not u.GetWindowRect(hwnd, ctypes.byref(rect)):
        return None
    return rect.left, rect.top, rect.right, rect.bottom


def choose_working_zone(
    monitor: tuple[int, int, int, int],
    pointer: tuple[int, int],
    foreground: tuple[int, int, int, int] | None,
    width: int = 520,
    height: int = 720,
) -> tuple[int, int, int, int]:
    """Make a compact docking zone within the currently active application.

    A 5120px monitor may hold a 1800px browser on the left; the popup must
    not be anchored at the far right merely because the monitor extends there.
    """
    left, top, right, bottom = monitor
    if foreground:
        fl, ft, fr, fb = foreground
        clipped = max(left, fl), max(top, ft), min(right, fr), min(bottom, fb)
        cl, ct, cr, cb = clipped
        if cr - cl >= 500 and cb - ct >= 650:
            left, top, right, bottom = clipped
    viewport_width = min(right - left, width)
    viewport_height = min(bottom - top, height)
    if viewport_width <= 0 or viewport_height <= 0:
        return monitor
    px, py = pointer
    if not (left <= px < right and top <= py < bottom):
        # Pointer on another part of an ultrawide desktop: anchor inside the
        # active app, not around a remote pointer coordinate.
        px = left + min(right - left - 1, max(viewport_width // 2, int((right - left) * 0.56)))
        py = top + min(bottom - top - 1, max(viewport_height // 2, int((bottom - top) * 0.55)))
    right_edge = min(max(px + 50, left + viewport_width), right)
    bottom_edge = min(max(py + 55, top + viewport_height), bottom)
    return (
        right_edge - viewport_width,
        bottom_edge - viewport_height,
        right_edge,
        bottom_edge,
    )


def read_saved_anchor(path: str) -> tuple[int, int] | None:
    """Read user-dragged position; never store window titles or screen content."""
    import json
    try:
        from pathlib import Path
        file = Path(path)
        if file.stat().st_size > 120:
            return None
        data = json.loads(file.read_text(encoding="utf-8"))
        right, bottom = data.get("right"), data.get("bottom")
        if data.get("version") != 1:
            return None
        if (type(right) is not int or type(bottom) is not int
                or abs(right) > 100000 or abs(bottom) > 100000):
            return None
        return right, bottom
    except (OSError, UnicodeError, ValueError, KeyError, TypeError, AttributeError):
        return None


def save_anchor(path: str, anchor: tuple[int, int]) -> None:
    import json
    from pathlib import Path
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix(".tmp")
    temp.write_text(json.dumps({
        "version": 1, "right": int(anchor[0]), "bottom": int(anchor[1]),
    }), encoding="utf-8")
    temp.replace(target)


def clear_anchor(path: str) -> None:
    from pathlib import Path
    try:
        Path(path).unlink(missing_ok=True)
    except OSError:
        pass
