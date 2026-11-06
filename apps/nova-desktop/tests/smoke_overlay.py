"""Interactive short-lived UI smoke test; does not navigate or send messages."""
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from nova_overlay import NovaOverlay, work_area, PANEL_W, PANEL_H, BUBBLE_W, BUBBLE_H

a = NovaOverlay()
a.root.after(100, lambda: print("COLLAPSED", a.root.winfo_width(),
                                 a.root.winfo_height(), a.root.winfo_geometry(), flush=True))


def check_expanded():
    a.expand(False)
    a.root.update_idletasks()
    assert a.expanded
    assert a.root.winfo_width() == PANEL_W, a.root.winfo_width()
    assert a.root.winfo_height() == PANEL_H, a.root.winfo_height()
    assert hasattr(a, "command") and hasattr(a, "chat")
    a.show_projects()
    print("EXPANDED", a.root.winfo_geometry(), "MIN_FONT", a.h,
          "HOTKEY_ERROR", a.listener.error, flush=True)
    a.root.after(100, check_collapsed)


def check_collapsed():
    a.collapse()
    a.root.update_idletasks()
    assert not a.expanded
    assert a.root.winfo_width() == BUBBLE_W
    assert a.root.winfo_height() == BUBBLE_H
    left, top, right, bottom = work_area()
    assert a.root.winfo_rootx() >= left
    assert a.root.winfo_rooty() >= top
    assert a.root.winfo_rootx() + BUBBLE_W <= right
    assert a.root.winfo_rooty() + BUBBLE_H <= bottom
    print("COLLAPSED_AGAIN", a.root.winfo_geometry(), "PASS", flush=True)
    a.quit()


a.root.after(300, check_expanded)
a.root.after(3500, lambda: a.quit() if not a.closed else None)
a.root.mainloop()
