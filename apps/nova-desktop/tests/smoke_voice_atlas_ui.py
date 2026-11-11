"""GUI smoke: shortcut auto-requests dictation, static status, two-stage Atlas pairing.

Runs isolated from the user's microphone and browser: sends NO Win+H and opens
NO real URLs. The Windows OS recognition itself is not asserted here.
"""
import os
import sys
from unittest.mock import patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from nova_overlay import NovaOverlay
from nova_bridge import PROD_ORIGIN

app = NovaOverlay()
app.expand(False)
voice_shortcuts = []
opened_urls = []


def browser_open(url, new=0):
    opened_urls.append(url)
    return True


def check_atlas():
    try:
        approved = next(iter(app.bridge.state.origins))
        if approved == PROD_ORIGIN:
            approved = app.bridge.state.switch_origin(
                "https://ai-operating-platform-2vteosw04-bumbi190s-projects.vercel.app"
            )
        app._atlas_login_opened = False
        with patch("nova_overlay.webbrowser.open", side_effect=browser_open):
            app.connect_atlas()
            assert app._atlas_login_opened
            assert len(opened_urls) == 1
            assert opened_urls[0] == approved + "/nova-bridge"
            assert "#" not in opened_urls[0]
            app.connect_atlas()
            assert len(opened_urls) == 2
            assert opened_urls[1].startswith(approved + "/nova-bridge#port=")
            assert "key=" in opened_urls[1]

        # Access is visible from the header without adding a toolbar button.
        assert app.bridge_status.bind("<Button-1>")
        app._show_bridge_status()
        assert "Anslut Sannas röst" in app.bridge_var.get()

        app._phase("lyssnar", "Försöker öppna Windows röstinmatning med en väldigt lång text")
        label = app.activity.itemcget(app.activity_text, "text")
        assert len(label) <= 45
        app._animate()
        assert not app.activity.find_withtag("pulse"), "No overlapping waveform"
        print("NOVA_ATLAS_VISIBLE_AND_STATUS_STATIC_PASS", flush=True)
    finally:
        app.quit()


def after_auto_voice():
    assert len(voice_shortcuts) == 1, voice_shortcuts
    assert app.expanded
    assert app.phase == "lyssnar"
    print("NOVA_SHORTCUT_AUTO_REQUESTS_MIC_PASS", flush=True)
    check_atlas()


# Simulate capture; the shortcut itself must never open the saved URL.
app.start_native_mic_pilot = lambda: (voice_shortcuts.append("local"), app._phase("lyssnar", "Lokal mikrofon"))
app.collapse()
app.events.put("toggle")
app._process_events()
app.root.after(1400, after_auto_voice)
app.root.after(4000, lambda: app.quit() if not app.closed else None)
app.root.mainloop()
