"""Allowlisted Windows window switching. Does not read window content.

Only executable identity, never window title, is presented. This module does
not click, type, inspect email, or run shell commands.
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes
from dataclasses import dataclass
import os
import sys

ALLOWLIST = {
    "chrome": ("chrome.exe", "Google Chrome"),
    "brave": ("brave.exe", "Brave"),
    "edge": ("msedge.exe", "Microsoft Edge"),
    "firefox": ("firefox.exe", "Mozilla Firefox"),
    "vscode": ("code.exe", "Visual Studio Code"),
    "outlook": ("outlook.exe", "Outlook"),
    "filezilla": ("filezilla.exe", "FileZilla"),
    "epic": ("epicgameslauncher.exe", "Epic Games"),
    "explorer": ("explorer.exe", "Filutforskaren"),
}


@dataclass(frozen=True)
class WindowRef:
    handle: int
    key: str
    label: str


def list_known_windows() -> list[WindowRef]:
    """Read-only enumerate desktop windows, exposing only safe app labels."""
    if sys.platform != "win32":
        return []
    u = ctypes.WinDLL("user32", use_last_error=True)
    k = ctypes.WinDLL("kernel32", use_last_error=True)
    PROC_QUERY_LIMITED_INFORMATION = 0x1000

    u.EnumWindows.argtypes = [ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM),
                              wintypes.LPARAM]
    u.EnumWindows.restype = wintypes.BOOL
    u.IsWindowVisible.argtypes = [wintypes.HWND]
    u.IsWindowVisible.restype = wintypes.BOOL
    u.GetWindowTextLengthW.argtypes = [wintypes.HWND]
    u.GetWindowTextLengthW.restype = ctypes.c_int
    u.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    u.GetWindowThreadProcessId.restype = wintypes.DWORD
    k.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    k.OpenProcess.restype = wintypes.HANDLE
    k.QueryFullProcessImageNameW.argtypes = [
        wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    k.QueryFullProcessImageNameW.restype = wintypes.BOOL
    k.CloseHandle.argtypes = [wintypes.HANDLE]
    k.CloseHandle.restype = wintypes.BOOL

    result: list[WindowRef] = []
    appnames = {exe: (key, label) for key, (exe, label) in ALLOWLIST.items()}

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def visit(hwnd, _):
        if not u.IsWindowVisible(hwnd) or u.GetWindowTextLengthW(hwnd) == 0:
            return True
        pid = wintypes.DWORD()
        u.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if not pid.value:
            return True
        handle = k.OpenProcess(PROC_QUERY_LIMITED_INFORMATION, False, pid.value)
        if not handle:
            return True
        try:
            buffer = ctypes.create_unicode_buffer(1024)
            length = wintypes.DWORD(len(buffer))
            if not k.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(length)):
                return True
            basename = os.path.basename(buffer.value).casefold()
            if basename in appnames:
                key, label = appnames[basename]
                result.append(WindowRef(int(hwnd), key, label))
        finally:
            k.CloseHandle(handle)
        return True

    u.EnumWindows(visit, 0)
    return result


def choose_focus_target(candidates: list[WindowRef], current: int) -> WindowRef | None:
    """Never guess between several same-app windows, such as Explorer folders."""
    for window in candidates:
        if window.handle == current:
            return window
    return candidates[0] if len(candidates) == 1 else None


def focus_known_window(key: str) -> tuple[bool, str]:
    """Foreground one matching verified window; do not choose an ambiguous HWND."""
    if key not in ALLOWLIST:
        return False, "Programmet är inte godkänt för fönsterväxling."
    candidates = [w for w in list_known_windows() if w.key == key]
    if not candidates:
        return False, "Inget öppet fönster hittades för " + ALLOWLIST[key][1] + "."
    u = ctypes.WinDLL("user32", use_last_error=True)
    u.GetForegroundWindow.argtypes = []
    u.GetForegroundWindow.restype = wintypes.HWND
    window = choose_focus_target(candidates, int(u.GetForegroundWindow() or 0))
    if window is None:
        return False, (
            "Flera fönster för " + ALLOWLIST[key][1] +
            " är öppna. Välj rätt fönster först och upprepa kommandot."
        )
    u.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    u.SetForegroundWindow.argtypes = [wintypes.HWND]
    u.SetForegroundWindow.restype = wintypes.BOOL
    u.GetForegroundWindow.argtypes = []
    u.GetForegroundWindow.restype = wintypes.HWND
    u.ShowWindow(window.handle, 9)
    ok = bool(u.SetForegroundWindow(window.handle))
    verified = bool(ok and int(u.GetForegroundWindow() or 0) == window.handle)
    if verified:
        return True, "Windows växlade till " + window.label + "."
    return False, ("Windows nekade att flytta fokus till " + window.label +
                   ". Klicka på fönstret manuellt.")
