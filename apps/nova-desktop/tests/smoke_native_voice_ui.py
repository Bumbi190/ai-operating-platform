"""Safe voice auto-submit acceptance (no mic or actual desktop side effects)."""
import os, sys
from unittest.mock import Mock, patch
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__),"..")))
from nova_overlay import NovaOverlay
from nova_native_tasks import TaskResult

app=NovaOverlay()
app.expand(False)
app._focus_guard.has_focus=lambda *_args: True
app._auto_voice.quiet_seconds=.37
executor=Mock(return_value=TaskResult(True,"Simulerad projektstatus"))
patcher=patch("nova_overlay.execute_native_step", executor)
patcher.start()

def stage_read():
    app._auto_voice.arm("")
    app.command.insert("1.0","Hej Nova, kolla projektstatus på Omnira")

def stage_preview():
    assert executor.call_count==1, executor.call_count
    assert any("Simulerad projektstatus" in msg for _,msg in app.history)
    assert app.command.get("1.0","end-1c").strip()==""
    print("AUTO_VOICE_LOCAL_READONLY_TASK_PASS",flush=True)
    app._auto_voice.arm("")
    app.command.insert("1.0","Hej Nova, öppna Handlarbörsen och Instagram")

def finish():
    try:
        assert executor.call_count==1
        assert app.pending_native_plan and app.pending_native_plan.requires_approval
        assert any(label.startswith("Godkänn") for label,_ in app.pending_choices)
        print("AUTO_VOICE_MULTISTEP_REQUIRES_APPROVAL_PASS",flush=True)
    finally:
        patcher.stop()
        app.quit()

app.root.after(350,stage_read)
app.root.after(1320,stage_preview)
app.root.after(2300,finish)
app.root.after(5000,lambda:app.quit() if not app.closed else None)
app.root.mainloop()
