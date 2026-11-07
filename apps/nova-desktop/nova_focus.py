"""Fail-closed Windows foreground focus guard for Nova voice typing.

Windows Win+H types into the *currently focused* text field. If Nova has not
actually gained foreground input, never synthesize Win+H: it could transcribe
into another application's private text box (such as ChatGPT or an email).
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes
import sys


class ForegroundFocusGuard:
    def __init__(self, user32=None):
        if sys.platform != "win32":
            raise RuntimeError("Nova focus guard requires Windows")
        self.u = user32 or ctypes.WinDLL("user32", use_last_error=True)
        if user32 is None:
            self.u.GetForegroundWindow.argtypes = []
            self.u.GetForegroundWindow.restype = wintypes.HWND
            self.u.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
            self.u.GetAncestor.restype = wintypes.HWND
            self.u.SetForegroundWindow.argtypes = [wintypes.HWND]
            self.u.SetForegroundWindow.restype = wintypes.BOOL

    def top_handle(self, root):
        # Tk's .winfo_id() may be a child HWND. GetAncestor(GA_ROOT)
        # gives the HWND comparable to GetForegroundWindow().
        return int(self.u.GetAncestor(root.winfo_id(), 2) or 0)

    def has_focus(self, root, text_widget) -> bool:
        try:
            if not root.winfo_exists() or not text_widget.winfo_exists():
                return False
            foreground = int(self.u.GetForegroundWindow() or 0)
            owning_top = self.top_handle(root)
            if not foreground or not owning_top or foreground != owning_top:
                return False
            # Tk's widget-level focus is essential. It is possible for Nova
            # to be foreground while a menu or button holds keyboard focus.
            return root.focus_get() is text_widget
        except (AttributeError, OSError, ValueError, TypeError):
            return False

    def ensure_focus(self, root, text_widget) -> bool:
        """Attempt a normal foreground activation, then verify, never assume."""
        try:
            root.deiconify()
            root.lift()
            root.attributes("-topmost", True)
            hwnd = self.top_handle(root)
            if not hwnd:
                return False
            if int(self.u.GetForegroundWindow() or 0) != hwnd:
                # Respect foreground-lock restrictions; no click simulation,
                # AttachThreadInput or changing Windows focus policy.
                self.u.SetForegroundWindow(hwnd)
            text_widget.focus_force()
            root.update_idletasks()
            return self.has_focus(root, text_widget)
        except (AttributeError, OSError, ValueError, TypeError):
            return False
