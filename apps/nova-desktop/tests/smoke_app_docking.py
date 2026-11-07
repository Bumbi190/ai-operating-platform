"""Nova GUI must dock in the user's active app on a 5120px display."""
import os
os.environ["NOVA_NO_PLACEMENT_SAVE"] = "1"  # never change the real user layout
import sys
from unittest.mock import patch
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from nova_overlay import NovaOverlay, PANEL_W, PANEL_H, BUBBLE_W, BUBBLE_H

monitor = (0, 0, 5120, 1392)
browser = (62, 45, 1914, 1267)
pointer = (4122, 1023)  # from actual Windows diagnostics

with patch("nova_overlay.work_area", return_value=monitor), \
     patch("nova_overlay.cursor_position", return_value=pointer), \
     patch("nova_overlay.foreground_window_rectangle", return_value=browser):
    ui = NovaOverlay()
    ui.expand(False)
    ui.root.update_idletasks()

    def assert_in_app(w, h):
        x, y = ui.root.winfo_x(), ui.root.winfo_y()
        assert browser[0] <= x and x + w <= browser[2], (x, y, browser)
        assert browser[1] <= y and y + h <= browser[3], (x, y, browser)
        assert x < 1500, (x, y, browser)
        print("NOVA_IN_APP", x, y, w, h, flush=True)

    def check():
        try:
            assert_in_app(PANEL_W, PANEL_H)
            ui.collapse()
            ui.root.update_idletasks()
            assert_in_app(BUBBLE_W, BUBBLE_H)
            ui._redock_near_pointer()
            assert_in_app(BUBBLE_W, BUBBLE_H)
            print("ACTIVE_APP_DOCKING_5120px_PASS", flush=True)
        finally:
            ui.quit()

    ui.root.after(370, check)
    ui.root.after(3500, lambda: ui.quit() if not ui.closed else None)
    ui.root.mainloop()
