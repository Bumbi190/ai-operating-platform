"""Isolated UI acceptance: plan requires review; approved steps run once.

Never opens a real web page, app or folder. A local Git-status read is exercised
in the main unit tests separately. No account or AI calls are made here.
"""
import os
import sys
from unittest.mock import Mock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from nova_overlay import NovaOverlay
from nova_native_tasks import TaskResult

app = NovaOverlay()
app.expand(False)
executor = Mock(return_value=TaskResult(True, "Simulerat Windows-steg; inga sidor öppnade."))
guard = patch("nova_overlay.execute_native_step", executor)
guard.start()
passed = []


def preview():
    app.command.insert("1.0", "Hej Nova, öppna Handlarbörsen och Instagram")
    app.send()
    assert app.pending_native_plan is not None
    assert app.pending_native_plan.requires_approval
    assert len(app.pending_native_plan.steps) == 2
    assert executor.call_count == 0, "Plan must not run before human approval"
    assert any("Godkänn 2 öppningar" == label for label, _cb in app.pending_choices)
    print("UI_PLAN_PREVIEW_NO_SIDE_EFFECTS_PASS", flush=True)
    passed.append("preview")
    app._approve_native_plan()
    assert executor.call_count == 1
    app.root.after(660, after_approved)


def after_approved():
    assert executor.call_count == 2
    assert app.pending_native_plan is None
    assert app.phase == "klar"
    assert len([m for _kind, m in app.history if "Steg " in m]) == 2
    print("UI_APPROVED_TWO_STEPS_VISIBLE_PASS", flush=True)
    passed.append("approval")

    app.command.insert("1.0", "Nova öppna Facebook och Pinterest")
    app.send()
    assert app.pending_native_plan is not None
    previous = executor.call_count
    app._cancel_native_plan()
    assert app.pending_native_plan is None
    assert executor.call_count == previous
    print("UI_CANCEL_BEFORE_EXECUTION_PASS", flush=True)
    passed.append("cancel")

    # A confirmed plan may be stopped after the first step, before second.
    app.command.insert("1.0", "Nova öppna LinkedIn och Instagram")
    app.send()
    app._approve_native_plan()
    assert executor.call_count == previous + 1
    app.stop()
    app.root.after(650, check_stopped)


def check_stopped():
    assert executor.call_count == 3, "Stop must prevent not-yet-issued step"
    assert len(passed) == 3
    print("UI_STOP_CANCELED_NEXT_STEP_PASS", flush=True)
    guard.stop()
    app.quit()


app.root.after(390, preview)
app.root.after(6500, lambda: app.quit() if not app.closed else None)
app.root.mainloop()
if len(passed) != 3:
    raise SystemExit(1)
