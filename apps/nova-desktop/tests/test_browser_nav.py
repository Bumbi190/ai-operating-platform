"""Browser-nav tests use a fake Windows API: never touch real browser tabs."""
import unittest

from nova_browser_nav import (
    BrowserNavigator, safe_browser_command, INPUT, _SHORTCUTS,
)
from nova_windows import WindowRef
from nova_auto_voice import AutoVoiceState


class FakeWin32:
    def __init__(self, foreground=11, allow_focus=True, modifiers=0, partial=False):
        self.foreground = foreground
        self.allow_focus = allow_focus
        self.modifiers = modifiers
        self.partial = partial
        self.sent = []
        self.restored = []
        self.focus_calls = []

    def GetForegroundWindow(self):
        return self.foreground

    def ShowWindow(self, handle, state):
        self.restored.append((handle, state))
        return True

    def SetForegroundWindow(self, hwnd):
        self.focus_calls.append(hwnd)
        if self.allow_focus:
            self.foreground = hwnd
            return True
        return False

    def GetAsyncKeyState(self, key):
        return self.modifiers if key == 0x11 else 0

    def SendInput(self, count, packet, sizeof):
        self.sent.append([
            (int(packet[i].u.ki.wVk), int(packet[i].u.ki.dwFlags))
            for i in range(count)
        ])
        if self.partial:
            return count - 1
        return count


class BrowserNavigationTests(unittest.TestCase):
    def test_natural_swedish_navigation_phrases(self):
        cases = {
            "Nova nästa flik": "tab_next",
            "Hej Nova gå till nästa flik": "tab_next",
            "Nova byt till föregående flik": "tab_previous",
            "Nova gå tillbaka": "back",
            "Hej Nova gå framåt": "forward",
            "Nova scrolla ner": "page_down",
            "Hej Nova scrolla upp": "page_up",
            "Nova byt till Brave": "brave",
            "Hej Nova växla till webbläsaren": "browser",
        }
        for spoken, command in cases.items():
            with self.subTest(spoken=spoken):
                action = safe_browser_command(spoken)
                self.assertIsNotNone(action)
                self.assertEqual(action.url, command)

    def test_no_multi_steps_or_mutations(self):
        for phrase in (
            "Nova scrolla ner och publicera",
            "Nästa flik och skicka mejl",
            "Nova gå tillbaka och radera meddelandet",
            "Nova skriv mitt lösenord",
            "Nova ta bort filen",
            "Nova scrolla ner femhundra gånger",
            "Nova skicka Ctrl Enter",
            "Nova klicka på köp",
            "Nova öppna https://evil.example",
            "Nova bläddra till Instagram och följ",
            "Nova nästa flik annars skicka betalning",
        ):
            with self.subTest(phrase=phrase):
                self.assertIsNone(safe_browser_command(phrase))

    def test_keys_are_fixed_and_small(self):
        self.assertEqual(set(_SHORTCUTS), {
            "tab_next", "tab_previous", "back", "forward",
            "page_up", "page_down",
        })
        for _name, (phrases, keys, desc) in _SHORTCUTS.items():
            self.assertTrue(phrases)
            self.assertTrue(desc)
            self.assertTrue(1 <= len(keys) <= 3)

    def test_exact_foreground_browser_remembered(self):
        b1 = WindowRef(11, "brave", "Brave")
        b2 = WindowRef(22, "brave", "Brave")
        fake = FakeWin32(foreground=22)
        nav = BrowserNavigator(user32=fake, enumerator=lambda: [b1, b2])
        nav.remember_foreground()
        self.assertEqual(nav.last_hwnd, 22)
        fake.foreground = 99  # Nova bubble now has focus
        result = nav.execute(safe_browser_command("Nova nästa flik"))
        self.assertTrue(result.accepted, result.message)
        self.assertEqual(fake.foreground, 22)
        self.assertEqual(fake.sent, [[(0x11, 0), (0x09, 0),
                                     (0x09, 2), (0x11, 2)]])

    def test_multiple_browser_windows_without_preference_are_rejected(self):
        fake = FakeWin32(foreground=99)
        nav = BrowserNavigator(user32=fake, enumerator=lambda: [
            WindowRef(11, "brave", "Brave"),
            WindowRef(22, "brave", "Brave"),
        ])
        result = nav.execute(safe_browser_command("Nova gå tillbaka"))
        self.assertFalse(result.accepted)
        self.assertIn("Flera", result.message)
        self.assertEqual(fake.sent, [])
        self.assertEqual(fake.focus_calls, [])

    def test_explicit_brave_focus_cannot_activate_chrome(self):
        brave = WindowRef(11, "brave", "Brave")
        chrome = WindowRef(22, "chrome", "Google Chrome")
        fake = FakeWin32(foreground=22)
        nav = BrowserNavigator(user32=fake, enumerator=lambda: [brave, chrome])
        result = nav.execute(safe_browser_command("Nova byt till Brave"))
        self.assertTrue(result.accepted, result.message)
        self.assertEqual(fake.foreground, 11)
        self.assertFalse(fake.sent)  # focusing alone never sends a shortcut
        self.assertEqual(fake.focus_calls, [11])

    def test_other_foreground_process_cannot_receive_shortcut(self):
        b = WindowRef(11, "brave", "Brave")
        fake = FakeWin32(foreground=99, allow_focus=False)
        nav = BrowserNavigator(user32=fake, enumerator=lambda: [b])
        result = nav.execute(safe_browser_command("Nova scrolla ner"))
        self.assertFalse(result.accepted)
        self.assertEqual(fake.sent, [])
        self.assertEqual(fake.foreground, 99)

    def test_modifiers_held_block_all_shortcuts(self):
        b = WindowRef(11, "brave", "Brave")
        fake = FakeWin32(foreground=11, modifiers=0x8000)
        nav = BrowserNavigator(user32=fake, enumerator=lambda: [b])
        result = nav.execute(safe_browser_command("Nova nästa flik"))
        self.assertFalse(result.accepted)
        self.assertEqual(fake.sent, [])

    def test_partial_injection_must_not_claim_success(self):
        b = WindowRef(11, "brave", "Brave")
        fake = FakeWin32(foreground=11, partial=True)
        nav = BrowserNavigator(user32=fake, enumerator=lambda: [b])
        result = nav.execute(safe_browser_command("Nova scrolla upp"))
        self.assertFalse(result.accepted)
        self.assertIn("blockerade", result.message)

    def test_browser_only_not_outlook_or_terminal(self):
        other = WindowRef(71, "outlook", "Outlook")
        fake = FakeWin32(foreground=71)
        nav = BrowserNavigator(user32=fake, enumerator=lambda: [other])
        result = nav.execute(safe_browser_command("Nova nästa flik"))
        self.assertFalse(result.accepted)
        self.assertFalse(fake.sent)

    def test_auto_voice_detects_browser_command_once(self):
        state = AutoVoiceState(quiet_seconds=3)
        state.arm("")
        self.assertIsNone(state.observe_submission("Nova nästa flik", 1))
        decision = state.observe_submission("Nova nästa flik", 4.15)
        self.assertEqual(decision.safe_navigation.kind, "browser_control")
        self.assertEqual(decision.safe_navigation.url, "tab_next")
        self.assertIsNone(state.observe_submission("Nova nästa flik", 9))


if __name__ == "__main__":
    unittest.main()
