"""Visible monitor containment and drag persistence test (no external I/O)."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from nova_overlay import (
    NovaOverlay, BUBBLE_W, BUBBLE_H, PANEL_W, PANEL_H,
    work_area, cursor_position, visible_dock_area,
)

app = NovaOverlay()


class Event:
    def __init__(self, x_root, y_root):
        self.x_root = x_root
        self.y_root = y_root


def assert_within_monitor(width, height):
    app.root.update_idletasks()
    x, y = app.root.winfo_x(), app.root.winfo_y()
    left, top, right, bottom = work_area((x + 10, y + 10))
    assert left <= x and top <= y, (x, y, left, top)
    assert x + width <= right and y + height <= bottom, (
        x, y, width, height, right, bottom
    )


def run_check():
    try:
        app.root.update_idletasks()
        assert not app.expanded
        assert_within_monitor(BUBBLE_W, BUBBLE_H)
        orig_x, orig_y = app.root.winfo_x(), app.root.winfo_y()

        app._begin_drag(Event(orig_x + 45, orig_y + 45))
        app._move_drag(Event(orig_x - 155, orig_y - 155))
        app._end_bubble_drag(None)
        app.root.update_idletasks()
        assert not app.expanded, 'Dragging the bubble must not open chat'
        assert app._manual_anchor is not None
        assert_within_monitor(BUBBLE_W, BUBBLE_H)
        dragged_x, dragged_y = app.root.winfo_x(), app.root.winfo_y()
        assert dragged_x != orig_x or dragged_y != orig_y

        right = dragged_x + BUBBLE_W
        bottom = dragged_y + BUBBLE_H
        app.expand(False)
        app.root.update_idletasks()
        assert_within_monitor(PANEL_W, PANEL_H)
        panel_right = app.root.winfo_x() + PANEL_W
        panel_bottom = app.root.winfo_y() + PANEL_H
        assert panel_right == right or abs(panel_right - right) <= PANEL_W
        assert panel_bottom == bottom or abs(panel_bottom - bottom) <= PANEL_H

        app.collapse()
        app.root.update_idletasks()
        assert_within_monitor(BUBBLE_W, BUBBLE_H)
        app._redock_near_pointer()
        assert app._manual_anchor is None
        assert_within_monitor(BUBBLE_W, BUBBLE_H)
        print("NOVA_CURSOR_DOCK_AND_DRAG_PASS", app.root.winfo_geometry(), flush=True)
    finally:
        app.quit()


app.root.after(400, run_check)
app.root.after(3500, lambda: app.quit() if not app.closed else None)
app.root.mainloop()
