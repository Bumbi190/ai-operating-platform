"""Read-only local bridge fixture for Nova's isolated browser QA.

No account access, no cookies, no real Atlas API, no emails or workflows.
Input/output are JSON lines on this temporary test subprocess's stdio.
"""
from __future__ import annotations
import json
import os
import sys

# A baseline browser test may load its matching immutable bridge source
# from a temporary folder. QA tests otherwise use the local worktree module.
module_root = (
    os.path.abspath(sys.argv[2])
    if len(sys.argv) >= 3
    else os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
)
sys.path.insert(0, module_root)
from nova_bridge import NovaBridge

if __name__ == '__main__':
    # Windows stdio can default to a legacy code page. Force UTF-8 so our
    # synthetic Swedish test questions match the browser's Unicode text.
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8')
    if len(sys.argv) not in (2, 3) or not sys.argv[1].startswith("http://127.0.0.1:"):
        raise SystemExit("Test origin is required")
    bridge = NovaBridge(origins=(sys.argv[1],))
    bridge.start()
    # Test runner consumes this directly. Never include it in logs/artifacts.
    print(json.dumps({"port": bridge.port, "key": bridge.state.key}), flush=True)
    try:
        for line in sys.stdin:
            try:
                command = json.loads(line)
                action = command.get("cmd")
                if action == "enqueue":
                    task_id, message = bridge.state.enqueue(command["text"])
                    result = {"ok": bool(task_id), "id": task_id, "message": message}
                elif action == "task":
                    task = bridge.state.task
                    result = {
                        "state": task.state if task else "none",
                        "chars": task.result_chars if task else 0,
                    }
                elif action == "cancel":
                    bridge.state.cancel()
                    result = {"ok": True}
                elif action == "events":
                    result = {"events": []}
                    while not bridge.state.events.empty():
                        event = bridge.state.events.get_nowait()
                        result["events"].append({
                            "kind": event.get("kind"),
                            "id": event.get("id"),
                            "length": len(event.get("text", "")),
                        })
                elif action == "quit":
                    print(json.dumps({"ok": True}), flush=True)
                    break
                else:
                    result = {"ok": False, "error": "Unknown fixture command"}
                print(json.dumps(result, ensure_ascii=False), flush=True)
            except Exception as exc:
                print(json.dumps({"ok": False, "error": str(exc)[:120]}), flush=True)
    finally:
        bridge.stop()
