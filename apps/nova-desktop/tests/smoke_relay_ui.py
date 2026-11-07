"""Local end-to-end GUI + relay smoke. Synthetic response; no Atlas account call."""
import json
import os
import sys
import threading
import time
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from nova_overlay import NovaOverlay

ui = NovaOverlay()
ui.expand(False)
events = []
failure = []


def request(path, method='GET', body=None):
    url = 'http://127.0.0.1:' + str(ui.bridge.port) + path
    # Simulate the exact currently approved browser origin; the pilot may
    # already be paired with the SSO-protected preview rather than production.
    headers = {
        'Origin': next(iter(ui.bridge.state.origins)),
        'X-Nova-Token': ui.bridge.state.key,
        'Content-Type': 'application/json',
    }
    data = json.dumps(body).encode('utf-8') if body is not None else None
    with urlopen(Request(url, method=method, headers=headers, data=data), timeout=2) as r:
        return json.loads(r.read())


def fake_browser():
    try:
        result = request('/connect', 'POST', {'protocol': 1})
        assert result['connected'] is True
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            task = request('/next')['task']
            if task:
                assert task['mode'] == 'nova_readonly'
                assert 'status' in task['text']
                assert request('/event', 'POST', {
                    'id': task['id'], 'kind': 'text',
                    'text': 'Simulerat Atlas-svar utan verktyg.'
                })['ok']
                assert request('/event', 'POST', {
                    'id': task['id'], 'kind': 'done'
                })['ok']
                events.append('mock_done')
                return
            time.sleep(0.09)
        failure.append('timeout waiting for desktop task')
    except Exception as exc:
        failure.append(str(exc))


worker = threading.Thread(target=fake_browser, daemon=True)
worker.start()


def submit():
    ui.command.insert('1.0', 'Ge en kort status om projektet')
    ui.send()


def check():
    try:
        assert not failure, failure
        assert events == ['mock_done'], events
        assert any('Simulerat Atlas-svar utan verktyg.' in msg
                   for _kind, msg in ui.history), ui.history
        ui.collapse()
        ui.expand(False)
        assert any('Simulerat Atlas-svar utan verktyg.' in msg
                   for _kind, msg in ui.history)
        print('LOCAL_RELAY_UI_PASS: paired / queued / text / done / history', flush=True)
    finally:
        ui.quit()


ui.root.after(500, submit)
ui.root.after(1500, check)
ui.root.after(3500, lambda: ui.quit() if not ui.closed else None)
ui.root.mainloop()
worker.join(timeout=1)
