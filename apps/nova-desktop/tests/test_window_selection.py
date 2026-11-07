import unittest

from nova_windows import WindowRef, choose_focus_target


class WindowSelectionTests(unittest.TestCase):
    def test_single_window_is_unambiguous(self):
        window = WindowRef(123, "vscode", "VS Code")
        self.assertEqual(choose_focus_target([window], 999), window)

    def test_multi_window_requires_active_match(self):
        a = WindowRef(123, "outlook", "Outlook")
        b = WindowRef(456, "outlook", "Outlook")
        self.assertIsNone(choose_focus_target([a, b], 999))
        self.assertEqual(choose_focus_target([a, b], 456), b)

    def test_no_windows(self):
        self.assertIsNone(choose_focus_target([], 0))


if __name__ == "__main__":
    unittest.main()
