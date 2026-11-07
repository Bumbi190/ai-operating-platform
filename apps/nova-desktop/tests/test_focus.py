"""The voice focus guard must fail closed if another app owns input."""
import unittest
from nova_focus import ForegroundFocusGuard


class StubRoot:
    def __init__(self, widget):
        self.widget = widget
        self.focused = widget
        self.active = True
        self.attributes_calls = []

    def winfo_id(self):
        return 51

    def winfo_exists(self):
        return True

    def focus_get(self):
        return self.focused

    def deiconify(self):
        pass

    def lift(self):
        pass

    def attributes(self, *args):
        self.attributes_calls.append(args)

    def update_idletasks(self):
        pass


class StubInput:
    def winfo_exists(self):
        return True

    def focus_force(self):
        pass


class FakeUser32:
    foreground = 99
    set_success = False

    def GetAncestor(self, hwnd, flag):
        assert flag == 2
        return 99

    def GetForegroundWindow(self):
        return self.foreground

    def SetForegroundWindow(self, hwnd):
        if self.set_success:
            self.foreground = hwnd
        return self.set_success


class FocusGuardTests(unittest.TestCase):
    def test_foreground_and_widget_both_required(self):
        widget = StubInput()
        root = StubRoot(widget)
        win = FakeUser32()
        guard = ForegroundFocusGuard(user32=win)
        self.assertTrue(guard.has_focus(root, widget))
        root.focused = object()
        self.assertFalse(guard.has_focus(root, widget))
        root.focused = widget
        win.foreground = 222
        self.assertFalse(guard.has_focus(root, widget))
        self.assertFalse(guard.ensure_focus(root, widget))
        self.assertEqual(win.foreground, 222)
        self.assertTrue(root.attributes_calls)

    def test_can_verify_successful_foreground_activation(self):
        widget = StubInput()
        root = StubRoot(widget)
        win = FakeUser32()
        win.foreground = 200
        win.set_success = True
        guard = ForegroundFocusGuard(user32=win)
        self.assertTrue(guard.ensure_focus(root, widget))
        self.assertTrue(guard.has_focus(root, widget))


if __name__ == "__main__":
    unittest.main()
