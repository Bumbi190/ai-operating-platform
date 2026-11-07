"""Nova UI browser control smoke – all browser/window actions are mocked.

Verifies one-shot voice command dispatch and that a failed browser focus
is reported instead of pretending success. Does not change the user's tabs.
"""
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from nova_overlay import NovaOverlay
from nova_browser_nav import BrowserResult, safe_browser_command

ui = NovaOverlay()
ui.expand(False)
calls = []
original = ui._browser.execute


def fake_execute(action):
    calls.append((action.kind, action.url))
    return BrowserResult(True, "Simulerat webbläsarkommando accepterat.")


ui._browser.execute = fake_execute


def arm():
    ui._auto_voice.quiet_seconds = 0.45
    ui._auto_voice.arm("")
    ui.command.insert("1.0", "Nova nästa flik")


def check():
    assert calls == [("browser_control", "tab_next")], calls
    assert ui.command.get("1.0", "end-1c").strip() == ""
    assert not ui._auto_voice.armed
    assert any("Simulerat webbläsarkommando accepterat." in s for _, s in ui.history)
    assert any("DU: Nova nästa flik" == s for _, s in ui.history)
    print("BROWSER_NAV_VOICE_UI_MOCK_PASS", flush=True)
    ui._browser.execute = lambda _a: BrowserResult(
        False, "Flera webbläsarfönster finns. Klicka på rätt fönster."
    )
    ui.command.insert("1.0", "Nova scrolla ner")
    ui.send()
    assert any("Flera webbläsarfönster" in s for _, s in ui.history)
    assert ui.phase == "godkannande"
    print("BROWSER_NAV_AMBIGUOUS_WINDOW_FAIL_CLOSED_PASS", flush=True)
    ui.root.after(50, done)


def done():
    ui._browser.execute = original
    ui.quit()


ui.root.after(400, arm)
ui.root.after(1400, check)
ui.root.after(4000, lambda: ui.quit() if not ui.closed else None)
ui.root.mainloop()
