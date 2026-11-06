"""Nova Desktop entrypoint; never duplicates Omnira's AI or memory.

Routing/hotkey: nova_core.py
Windows bubble: nova_overlay.py
Existing Atlas: omniraos.se (authenticated browser)
"""
from __future__ import annotations
import ctypes
from ctypes import wintypes
import sys

# Re-exports preserve the original router test and external module contract.
from nova_core import URLS, APP_SHORTCUTS, route, normalized, Action, HotkeyListener


def main() -> None:
    if sys.platform != "win32":
        raise SystemExit("Nova Desktop kräver Windows.")
    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel32.CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
    kernel32.CreateMutexW.restype = wintypes.HANDLE
    kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
    mutex = kernel32.CreateMutexW(None, False, "Local\\OmniraNovaDesktop")
    if not mutex:
        raise SystemExit("Kan inte skapa Nova-processlås.")
    if ctypes.get_last_error() == 183:
        user32 = ctypes.windll.user32
        for caption in ("Nova – Omnira", "Nova - Omnira"):
            hwnd = user32.FindWindowW(None, caption)
            if hwnd:
                user32.ShowWindow(hwnd, 9)
                user32.SetForegroundWindow(hwnd)
                break
        kernel32.CloseHandle(mutex)
        return
    try:
        from nova_overlay import NovaOverlay
        app = NovaOverlay()
        app.root.mainloop()
    finally:
        kernel32.CloseHandle(mutex)


if __name__ == "__main__":
    main()
