"""Resident Windows hotkey host for Nova Desktop.

The host owns Ctrl+Alt+Space independently of the Nova chat UI. Closing the
chat (or quitting it entirely) leaves this tiny process listening. The next
hotkey starts the UI again. No external dependencies, model calls, or secrets.

An existing host receives an "open" signal when its shortcut is launched again.
The host and UI communicate only by named, auto-reset Windows events carrying
NO user text, credentials or command data.
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time

HOTKEY_NAME = "Local\\OmniraNovaHostHotkey"
OPEN_NAME = "Local\\OmniraNovaHostOpen"
REQUEST_NAME = "Local\\OmniraNovaHostRequest"
MUTEX_NAME = "Local\\OmniraNovaHostSingle"
VK_SPACE = 0x20
MOD_CONTROL = 0x0002
MOD_ALT = 0x0001
MOD_NOREPEAT = 0x4000
HOTKEY_ID = 0x4E56
WM_HOTKEY = 0x0312
PM_REMOVE = 0x0001
WAIT_OBJECT_0 = 0
WAIT_TIMEOUT = 0x102
ERROR_ALREADY_EXISTS = 183
SYNCHRONIZE = 0x00100000
EVENT_MODIFY_STATE = 0x0002

if sys.platform == "win32":
    K = ctypes.WinDLL("kernel32", use_last_error=True)
    U = ctypes.WinDLL("user32", use_last_error=True)
    K.CreateMutexW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.LPCWSTR]
    K.CreateMutexW.restype = wintypes.HANDLE
    K.CreateEventW.argtypes = [wintypes.LPVOID, wintypes.BOOL, wintypes.BOOL, wintypes.LPCWSTR]
    K.CreateEventW.restype = wintypes.HANDLE
    K.OpenEventW.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.LPCWSTR]
    K.OpenEventW.restype = wintypes.HANDLE
    K.SetEvent.argtypes = [wintypes.HANDLE]
    K.SetEvent.restype = wintypes.BOOL
    K.CloseHandle.argtypes = [wintypes.HANDLE]
    K.CloseHandle.restype = wintypes.BOOL
    K.WaitForMultipleObjects.argtypes = [
        wintypes.DWORD, ctypes.POINTER(wintypes.HANDLE),
        wintypes.BOOL, wintypes.DWORD
    ]
    K.WaitForMultipleObjects.restype = wintypes.DWORD
    U.RegisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.UINT, wintypes.UINT]
    U.RegisterHotKey.restype = wintypes.BOOL
    U.UnregisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int]
    U.UnregisterHotKey.restype = wintypes.BOOL
    U.PeekMessageW.argtypes = [
        ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT,
        wintypes.UINT, wintypes.UINT
    ]
    U.PeekMessageW.restype = wintypes.BOOL


def notify_running_host() -> bool:
    """Focus/request Nova from an existing host when desktop shortcut is used."""
    handle = K.OpenEventW(EVENT_MODIFY_STATE, False, REQUEST_NAME)
    if not handle:
        return False
    try:
        return bool(K.SetEvent(handle))
    finally:
        K.CloseHandle(handle)


class Guardian:
    def __init__(self, start_gui: bool = True):
        if sys.platform != "win32":
            raise RuntimeError("Windows required")
        self.mutex = K.CreateMutexW(None, False, MUTEX_NAME)
        if not self.mutex:
            raise OSError(ctypes.get_last_error(), "Cannot create Nova host mutex")
        self.duplicate = ctypes.get_last_error() == ERROR_ALREADY_EXISTS
        self.toggle_handle: int | None = None
        self.open_handle: int | None = None
        self.request_handle: int | None = None
        self.registered = False
        self.process: subprocess.Popen | None = None
        self.start_gui = start_gui
        self.launch_count = 0
        self.last_launch_attempt = 0.0
        self._stop = False
        if not self.duplicate:
            self.toggle_handle = K.CreateEventW(None, False, False, HOTKEY_NAME)
            self.open_handle = K.CreateEventW(None, False, False, OPEN_NAME)
            self.request_handle = K.CreateEventW(None, False, False, REQUEST_NAME)
            if not self.toggle_handle or not self.open_handle or not self.request_handle:
                self.close()
                raise OSError(ctypes.get_last_error(), "Cannot create Nova host events")

    def gui_running(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def launch_gui(self, expanded: bool) -> bool:
        if self.gui_running():
            return False
        # Stop a broken launcher from spawning a process every key-repeat.
        if time.monotonic() - self.last_launch_attempt < 0.6:
            return False
        self.last_launch_attempt = time.monotonic()
        app = Path(__file__).resolve().with_name("nova_desktop.py")
        env = dict(os.environ)
        env["NOVA_EXTERNAL_HOTKEY"] = "1"
        env["NOVA_START_EXPANDED"] = "1" if expanded else "0"
        try:
            self.process = subprocess.Popen(
                [sys.executable, str(app)],
                cwd=str(app.parent),
                env=env,
                close_fds=True,
            )
            self.launch_count += 1
            return True
        except OSError:
            self.process = None
            return False

    def _register(self):
        if self.registered:
            return True
        self.registered = bool(U.RegisterHotKey(
            None, HOTKEY_ID, MOD_CONTROL | MOD_ALT | MOD_NOREPEAT, VK_SPACE
        ))
        return self.registered

    def handle_shortcut(self, event: str):
        if not self.gui_running():
            self.launch_gui(expanded=True)
        elif event == "open":
            K.SetEvent(self.open_handle)
        else:
            K.SetEvent(self.toggle_handle)

    def run(self):
        if self.duplicate:
            notify_running_host()
            self.close()
            return
        msg = wintypes.MSG()
        # Create a message queue on this thread prior to RegisterHotKey.
        U.PeekMessageW(ctypes.byref(msg), None, 0, 0, 0)
        if self.start_gui:
            self.launch_gui(expanded=False)
        last_register_attempt = 0.0
        try:
            while not self._stop:
                now = time.monotonic()
                if not self.registered and now - last_register_attempt > 2:
                    last_register_attempt = now
                    self._register()
                while U.PeekMessageW(ctypes.byref(msg), None, 0, 0, PM_REMOVE):
                    if msg.message == WM_HOTKEY and msg.wParam == HOTKEY_ID:
                        self.handle_shortcut("toggle")
                if self.request_handle and K.WaitForMultipleObjects(
                    1, (wintypes.HANDLE * 1)(self.request_handle),
                    False, 0
                ) == WAIT_OBJECT_0:
                    self.handle_shortcut("open")
                time.sleep(0.06)
        finally:
            self.close()

    def close(self):
        self._stop = True
        if self.registered:
            U.UnregisterHotKey(None, HOTKEY_ID)
            self.registered = False
        for h in ("toggle_handle", "open_handle", "request_handle", "mutex"):
            handle = getattr(self, h, None)
            if handle:
                K.CloseHandle(handle)
                setattr(self, h, None)


class HostEventListener(threading.Thread):
    """Nova GUI listener for the resident host's named events.

    Keeps the same queue/ready/error/start/stop surface as the old HotkeyListener.
    """
    def __init__(self, events: queue.Queue[str]):
        super().__init__(daemon=True, name="NovaHostEvents")
        self.events = events
        self.ready = threading.Event()
        self.error = ""
        self._stop_flag = threading.Event()
        self.handles: list[int] = []

    def run(self):
        for name in (HOTKEY_NAME, OPEN_NAME):
            handle = K.OpenEventW(SYNCHRONIZE, False, name)
            if not handle:
                self.error = "Den permanenta Nova-lyssnaren hittades inte."
                for opened in self.handles:
                    K.CloseHandle(opened)
                self.handles.clear()
                self.ready.set()
                return
            self.handles.append(handle)
        self.ready.set()
        arr = (wintypes.HANDLE * len(self.handles))(*self.handles)
        try:
            while not self._stop_flag.is_set():
                outcome = K.WaitForMultipleObjects(len(self.handles), arr, False, 160)
                if outcome == WAIT_OBJECT_0:
                    self.events.put("toggle")
                elif outcome == WAIT_OBJECT_0 + 1:
                    self.events.put("open")
        finally:
            for handle in self.handles:
                K.CloseHandle(handle)
            self.handles.clear()

    def stop(self):
        self._stop_flag.set()


def main():
    if sys.platform != "win32":
        raise SystemExit("Nova Hotkey Host kräver Windows.")
    guardian = Guardian()
    guardian.run()


if __name__ == "__main__":
    main()
