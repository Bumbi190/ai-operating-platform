"""After a browser action, Ctrl+Alt+Space reopens listening, not hides Nova."""
import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from nova_overlay import NovaOverlay

a = NovaOverlay()
a.expand(False)


def check():
    try:
        called = []
        a._manual_anchor = (1200, 800)  # no redocking in test
        a._focus_guard.has_focus = lambda _root, _text: False
        a.expand = lambda listen=False: called.append(("expand", listen))
        a.events.put("toggle")
        a._process_events()
        assert called == [("expand", True)], called
        print("HOTKEY_RELISTENS_WHEN_BROWSER_FOREGROUND_PASS", flush=True)

        a._focus_guard.has_focus = lambda _root, _text: True
        a.collapse = lambda: called.append(("collapse",))
        a.events.put("toggle")
        a._process_events()
        assert called[-1] == ("collapse",), called
        print("HOTKEY_COLLAPSES_WHEN_NOVA_FOREGROUND_PASS", flush=True)
    finally:
        a.quit()


a.root.after(410, check)
a.root.after(4000, lambda: a.quit() if not a.closed else None)
a.root.mainloop()
