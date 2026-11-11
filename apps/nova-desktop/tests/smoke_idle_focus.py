"""Run in a fresh Windows process. The test desktop never becomes visible."""
import ctypes
from ctypes import wintypes
import os
from pathlib import Path
import sys
from unittest.mock import patch
from uuid import uuid4


def main():
    user32 = ctypes.WinDLL("user32", use_last_error=True)
    user32.CreateDesktopW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.LPVOID,
                                      wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID]
    user32.CreateDesktopW.restype = wintypes.HANDLE
    user32.SetThreadDesktop.argtypes = [wintypes.HANDLE]
    desktop = user32.CreateDesktopW("NovaFocusQA" + uuid4().hex, None, None, 0, 0x01ff, None)
    if not desktop or not user32.SetThreadDesktop(desktop):
        raise ctypes.WinError(ctypes.get_last_error())

    # A native sentinel lets Nova be the thread's first Tk window, reproducing
    # activation by Tk on startup even when no text field asks for focus.
    user32.CreateWindowExW.argtypes = [wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR,
                                      wintypes.DWORD, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                      ctypes.c_int, wintypes.HWND, wintypes.HANDLE,
                                      wintypes.HANDLE, wintypes.LPVOID]
    user32.CreateWindowExW.restype = wintypes.HWND
    current = user32.CreateWindowExW(0, "STATIC", "Focus sentinel", 0x90c00000,
                                     10, 10, 240, 90, None, None, None, None)
    if not current:
        raise ctypes.WinError(ctypes.get_last_error())
    user32.SetActiveWindow.argtypes = [wintypes.HWND]
    user32.GetActiveWindow.restype = wintypes.HWND
    user32.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
    user32.GetAncestor.restype = wintypes.HWND
    user32.IsWindowVisible.argtypes = [wintypes.HWND]
    user32.DestroyWindow.argtypes = [wintypes.HWND]
    user32.SetActiveWindow(current)
    assert user32.GetActiveWindow() == current
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    import nova_overlay

    env = {"NOVA_START_EXPANDED": "0", "NOVA_EXTERNAL_HOTKEY": "1"}
    with patch.dict(os.environ, env), patch.object(nova_overlay.NovaBridge, "start"), \
            patch.object(nova_overlay.HostEventListener, "start"):
        nova = nova_overlay.NovaOverlay()
        try:
            nova.root.update_idletasks()
            bubble = user32.GetAncestor(nova.root.winfo_id(), 2)
            assert bubble and user32.IsWindowVisible(bubble)
            assert (nova.root.winfo_width(), nova.root.winfo_height()) == (94, 94)
            assert not nova.expanded and not nova.native_mic_session
            assert user32.GetActiveWindow() == current
            nova.expand(listen=False)
            nova.root.update_idletasks()
            assert nova.expanded and user32.GetActiveWindow() == bubble
        finally:
            nova.root.destroy()
            user32.DestroyWindow(current)
    print("Collapsed bubble kept focus in the original app. Explicit open took focus.")


if __name__ == "__main__":
    main()
