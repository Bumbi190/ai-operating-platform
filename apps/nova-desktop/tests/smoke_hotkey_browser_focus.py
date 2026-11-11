"""Exercise both hotkey entry points and local work inside a real Windows panel."""
import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from nova_overlay import NovaOverlay

# Avoid capturing global keyboard shortcuts or attaching to a user's bridge.
with patch("nova_overlay.HotkeyListener"), patch("nova_overlay.HostEventListener"), \
        patch.dict(os.environ, NOVA_START_EXPANDED="0", NOVA_NO_PLACEMENT_SAVE="1"):
    app = NovaOverlay()
try:
    with TemporaryDirectory() as directory, \
            patch("nova_overlay.local_model_ready", return_value=True), \
            patch.object(app, "start_native_mic_pilot") as mic, \
            patch("nova_overlay.webbrowser.open") as browser, \
            patch("nova_native_tasks.NOTES_DIR", Path(directory)), \
            patch("nova_overlay.NOTES_DIR", Path(directory)):
        app.bridge.state.switch_origin("https://ai-operating-platform-2vteosw04-bumbi190s-projects.vercel.app")
        assert not app.expanded
        app._open_from_hotkey()  # cold launch after the guardian received the shortcut
        assert app.expanded and mic.call_count == 1
        app.collapse()
        app.events.put("toggle")  # existing process
        app._process_events()
        assert app.expanded and mic.call_count == 2
        browser.assert_not_called()
        app._received_native_transcript("Nova, kolla ledigt diskutrymme")
        assert any("GB av" in text for _, text in app.history), app.history
        app.command.insert("1.0", "Utkast som ska ligga kvar")
        phrase = "Nova, skapa en anteckning med texten Ring Oscar om mobilversionen."
        app._received_native_transcript(phrase)
        assert not list(Path(directory).iterdir())
        assert app.pending_choices[0][0] == "Spara anteckning"
        assert app.review_bar.winfo_children()
        app.pending_choices[0][1]()
        app._approve_native_plan()
        files = list(Path(directory).iterdir())
        assert len(files) == 1 and files[0].read_text(encoding="utf-8").strip() == "Ring Oscar om mobilversionen."
        assert app.command.get("1.0", "end-1c") == "Utkast som ska ligga kvar"
        app._received_native_transcript(phrase)
        app.stop()
        app._approve_native_plan()
        assert len(list(Path(directory).iterdir())) == 1
        app.native_mic_hotkey.set(False)
        app._open_from_hotkey()
        assert app.expanded and mic.call_count == 2
        browser.assert_not_called()
        order = "Nova, lägg till ett möte i kalendern i morgon klockan tio"
        app._received_native_transcript(order)
        assert app.pending_choices[0][0] == "Anslut Atlas för uppdraget"
        assert app.bridge.state.task is None
        app.bridge.state.connect()
        app.bridge.state.authorize_voice(mode="native")
        app._show_bridge_status()
        assert app.pending_choices[0][0] == "Kör i Atlas (med verktyg)"
        assert app.bridge.state.task is None
        app.pending_choices[0][1]()
        request = app.bridge.state.next()
        assert request["mode"] == "atlas_operator" and request["text"] == order
        browser.assert_not_called()
        print("WINDOWS_PANEL_NO_BROWSER_LOCAL_WORK_NOTE_AND_OPERATOR_APPROVAL_PASS", flush=True)
finally:
    app.quit()
