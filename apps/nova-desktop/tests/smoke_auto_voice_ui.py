"""GUI integration: voice text auto-opens one allowlisted site without Send.

All browser openings are mocked. Nothing is dictated, posted, or actually
opened, and the test restores control without using the user's inbox.
"""
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from nova_overlay import NovaOverlay

app = NovaOverlay()
app.expand(False)
opened = []
guard = patch("nova_overlay.webbrowser.open", side_effect=lambda url, new=0: (opened.append(url), True)[1])
guard.start()


def arm_speech():
    app._auto_voice.quiet_seconds = 0.42
    app._auto_voice.arm("")
    app.command.insert("1.0", "Hej Nova vill du öppna Facebook")


def verify():
    try:
        assert opened == ["https://www.facebook.com/"], opened
        assert not app._auto_voice.armed
        assert app.command.get("1.0", "end-1c").strip() == ""
        assert any("Röstkommando klart" in msg for _, msg in app.history)
        assert any("Öppningen skickad" in msg for _, msg in app.history)
        print("AUTO_VOICE_ONE_SHOT_UI_PASS", flush=True)
        app._auto_voice.arm("")
        app.command.insert("1.0", "Öppna Facebook och publicera ett inlägg")
        app.root.after(900, verify_unsafe)
    except Exception as exc:
        print("AUTO_VOICE_ONE_SHOT_UI_FAIL", repr(exc), flush=True)
        guard.stop()
        app.quit()
        raise


def verify_unsafe():
    try:
        assert opened == ["https://www.facebook.com/"], opened
        assert app.command.get("1.0", "end-1c").strip()
        print("UNSAFE_VOICE_NEVER_AUTOSENT_PASS", flush=True)
    finally:
        guard.stop()
        app.quit()


app.root.after(450, arm_speech)
app.root.after(1450, verify)
app.root.after(6000, lambda: app.quit() if not app.closed else None)
app.root.mainloop()
