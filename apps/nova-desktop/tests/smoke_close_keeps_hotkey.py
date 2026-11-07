"""Close button must collapse, never terminate Nova or its hotkey listener."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from nova_overlay import NovaOverlay
from nova_theme import PremiumButton

app = NovaOverlay()
app.expand(False)


def descendants(widget):
    for child in widget.winfo_children():
        yield child
        yield from descendants(child)


def run():
    try:
        app.root.update_idletasks()
        buttons = [w for w in descendants(app.root) if isinstance(w, PremiumButton)]
        close = next(w for w in buttons if w.label == "×")
        assert app.expanded
        # Another live Nova may own the hotkey during this isolated UI test.
        # The independent guardian/listener path is tested separately.
        app.listener.ready.wait(1.0)
        if not app.listener.error:
            assert app.listener.is_alive(), "Hotkey listener unexpectedly exited"
        close.command()
        app.root.update_idletasks()
        assert not app.expanded, "× should collapse chat"
        assert not app.closed, "× must not terminate Nova"
        if not app.listener.error:
            assert app.listener.is_alive(), "Hotkey listener died when closing chat"
        assert app.root.winfo_exists(), "Root was destroyed by close"

        # Send the same queue message the registered Win32 shortcut supplies.
        app.events.put("toggle")
        app._process_events()
        app.root.update_idletasks()
        assert app.expanded, "Hotkey queue must reopen collapsed chat"
        if not app.listener.error:
            assert app.listener.is_alive()
        print("CLOSE_COLLAPSE_HOTKEY_REOPEN_PASS", flush=True)
    finally:
        app.quit()


app.root.after(400, run)
app.root.after(4000, lambda: app.quit() if not app.closed else None)
app.root.mainloop()
