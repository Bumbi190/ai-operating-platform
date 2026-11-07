"""Isolated Tk real-focus checks; never actually sends Win+H or records speech."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from nova_overlay import NovaOverlay

a = NovaOverlay()
a.expand(False)


def run():
    try:
        a.root.update_idletasks()
        # This process may be allowed to focus itself, depending on Windows.
        can_focus = a._focus_guard.ensure_focus(a.root, a.command)
        print("FOCUS_GUARD_CAN_FOCUS=" + str(can_focus), flush=True)

        # Simulate a second app owning the foreground: MUST fail closed.
        a._focus_guard.has_focus = lambda root, widget: False
        a._send_windows_voice_typing_shortcut()
        assert a.phase == "godkannande", a.phase
        assert any("Röststart avbruten" in msg for _, msg in a.history)
        print("UNFOCUSED_WIN_H_PREVENTED_PASS", flush=True)

        # If a user sends a command while Win+H is still scheduled, that
        # stale callback must be discarded before even checking input focus.
        a._voice_request_id = 50
        a._focus_guard.has_focus = lambda *_: (
            (_ for _ in ()).throw(AssertionError("Focus check must not run"))
        )
        a._send_windows_voice_typing_shortcut(request_id=49)
        print("STALE_WIN_H_REQUEST_DROPPED_PASS", flush=True)

        # Automatic shortcut launch must not fall through to dictation if
        # Windows denies Nova's foreground request.
        a._focus_guard.ensure_focus = lambda root, widget: False
        a._voice_request_id += 1
        seq = a._voice_request_id
        a._voice_after_hotkey(seq, attempts=0, focus_attempts=4)
        assert a.phase == "godkannande"
        assert any("tangentbordsfokus" in msg for _, msg in a.history)
        print("AUTO_VOICE_FAIL_CLOSED_PASS", flush=True)
    finally:
        a.quit()


a.root.after(440, run)
a.root.after(3500, lambda: a.quit() if not a.closed else None)
a.root.mainloop()
