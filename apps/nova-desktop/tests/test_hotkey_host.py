"""Tests for the resident Windows hotkey process and GUI named events.

Do not use the production names; tests run with isolated kernel objects.
No keyboard injection, passwords, shell commands or model requests.
"""
import os
import queue
import threading
import time
import unittest
from unittest.mock import patch
from uuid import uuid4

import nova_hotkey_host as host


@unittest.skipUnless(os.name == "nt", "Windows-only host")
class HotkeyHostTests(unittest.TestCase):
    def unique(self, tag):
        return "Local\\NovaHotkeyTest" + tag + uuid4().hex

    def test_host_events_open_and_toggle(self):
        toggle_name = self.unique("Toggle")
        open_name = self.unique("Open")
        stop_name = self.unique("Stop")
        toggle = host.K.CreateEventW(None, False, False, toggle_name)
        open_ = host.K.CreateEventW(None, False, False, open_name)
        stop_ = host.K.CreateEventW(None, False, False, stop_name)
        self.assertTrue(toggle)
        self.assertTrue(open_)
        self.assertTrue(stop_)
        try:
            with patch.object(host, "HOTKEY_NAME", toggle_name), patch.object(host, "OPEN_NAME", open_name), patch.object(host, "STOP_NAME", stop_name):
                results = queue.Queue()
                listener = host.HostEventListener(results)
                listener.start()
                self.assertTrue(listener.ready.wait(1.5))
                self.assertFalse(listener.error)
                self.assertTrue(host.K.SetEvent(toggle))
                self.assertEqual(results.get(timeout=1.5), "toggle")
                self.assertTrue(host.K.SetEvent(open_))
                self.assertEqual(results.get(timeout=1.5), "open")
                self.assertTrue(host.K.SetEvent(stop_))
                self.assertEqual(results.get(timeout=1.5), "stop")
                listener.stop()
                listener.join(timeout=1.5)
                self.assertFalse(listener.is_alive())
        finally:
            host.K.CloseHandle(toggle)
            host.K.CloseHandle(open_)
            host.K.CloseHandle(stop_)

    def test_desktop_shortcut_reopens_without_voice_autostart(self):
        mutex_name = self.unique("Mutex")
        toggle_name = self.unique("Toggle")
        open_name = self.unique("Open")
        stop_name = self.unique("Stop")
        request_name = self.unique("Request")
        with patch.object(host, "MUTEX_NAME", mutex_name), \
             patch.object(host, "HOTKEY_NAME", toggle_name), \
             patch.object(host, "OPEN_NAME", open_name), \
             patch.object(host, "STOP_NAME", stop_name), \
             patch.object(host, "REQUEST_NAME", request_name):
            guardian = host.Guardian(start_gui=False)
            calls = []

            class Dummy:
                def poll(self):
                    return None

            try:
                with patch.object(host.subprocess, "Popen",
                                  side_effect=lambda args, **kwargs: (
                                      calls.append((args, kwargs)), Dummy())[1]):
                    guardian.handle_shortcut("open")
                self.assertEqual(len(calls), 1)
                self.assertEqual(calls[0][1]["env"]["NOVA_START_EXPANDED"], "0")
                host.K.WaitForSingleObject.argtypes = [
                    host.wintypes.HANDLE, host.wintypes.DWORD]
                host.K.WaitForSingleObject.restype = host.wintypes.DWORD
                self.assertEqual(
                    host.K.WaitForSingleObject(guardian.open_handle, 100),
                    host.WAIT_OBJECT_0)
            finally:
                guardian.close()

    def test_emergency_stop_never_spawns_ui_and_signals_running_ui(self):
        with patch.object(host, "MUTEX_NAME", self.unique("Mutex")), \
             patch.object(host, "HOTKEY_NAME", self.unique("Toggle")), \
             patch.object(host, "OPEN_NAME", self.unique("Open")), \
             patch.object(host, "STOP_NAME", self.unique("Stop")), \
             patch.object(host, "REQUEST_NAME", self.unique("Request")):
            guardian = host.Guardian(start_gui=False)
            host.K.WaitForSingleObject.argtypes = [host.wintypes.HANDLE, host.wintypes.DWORD]
            host.K.WaitForSingleObject.restype = host.wintypes.DWORD
            try:
                with patch.object(host.subprocess, "Popen") as spawn:
                    guardian.handle_shortcut("stop")
                    spawn.assert_not_called()
                class RunningUI:
                    def poll(self): return None
                guardian.process = RunningUI()
                guardian.handle_shortcut("stop")
                self.assertEqual(host.K.WaitForSingleObject(guardian.stop_handle, 200), host.WAIT_OBJECT_0)
            finally:
                guardian.close()

    def test_guardian_single_instance_and_safe_launch(self):
        mutex_name = self.unique("Mutex")
        toggle_name = self.unique("Toggle")
        open_name = self.unique("Open")
        stop_name = self.unique("Stop")
        request_name = self.unique("Request")
        with patch.object(host, "MUTEX_NAME", mutex_name), \
             patch.object(host, "HOTKEY_NAME", toggle_name), \
             patch.object(host, "OPEN_NAME", open_name), \
             patch.object(host, "STOP_NAME", stop_name), \
             patch.object(host, "REQUEST_NAME", request_name):
            guardian = host.Guardian(start_gui=False)
            duplicate = host.Guardian(start_gui=False)
            try:
                self.assertFalse(guardian.duplicate)
                self.assertTrue(duplicate.duplicate)
                self.assertFalse(guardian.gui_running())
                # A second desktop-shortcut launch signals the already-running
                # host, instead of creating another long-lived process.
                self.assertTrue(host.notify_running_host())
                host.K.WaitForSingleObject.argtypes = [host.wintypes.HANDLE, host.wintypes.DWORD]
                host.K.WaitForSingleObject.restype = host.wintypes.DWORD
                self.assertEqual(host.K.WaitForSingleObject(guardian.request_handle, 40),
                                 host.WAIT_OBJECT_0)
                spawned = []
                class Dummy:
                    def poll(self): return None
                def fake_spawn(args, **kwargs):
                    spawned.append((args, kwargs))
                    return Dummy()
                with patch.object(host.subprocess, "Popen", side_effect=fake_spawn):
                    self.assertTrue(guardian.launch_gui(expanded=True))
                    self.assertFalse(guardian.launch_gui(expanded=True))
                self.assertEqual(len(spawned), 1)
                args, kwargs = spawned[0]
                self.assertEqual(kwargs["env"]["NOVA_EXTERNAL_HOTKEY"], "1")
                self.assertEqual(kwargs["env"]["NOVA_START_EXPANDED"], "1")
                self.assertTrue(args[1].endswith("nova_desktop.py"))
            finally:
                duplicate.close()
                guardian.close()


if __name__ == "__main__":
    unittest.main()
