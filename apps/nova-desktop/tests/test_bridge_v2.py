import json
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from nova_bridge import NovaBridge, PROD_ORIGIN, validate_pairing_origin, read_saved_preview_origin


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.bridge = NovaBridge()
        self.bridge.start()
        self.base = "http://127.0.0.1:" + str(self.bridge.port)
        self.good = {"Origin": PROD_ORIGIN, "X-Nova-Token": self.bridge.state.key}

    def tearDown(self):
        self.bridge.stop()

    def request(self, path, method="GET", headers=None, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = Request(self.base + path, data=data, method=method,
                      headers=(headers or {}))
        try:
            with urlopen(req, timeout=2) as response:
                value = response.read()
                payload = json.loads(value) if value else {}
                if path == "/connect" and response.status == 200 and (
                    (headers or {}).get("Origin") == self.good.get("Origin")
                ):
                    self.good["X-Nova-Session"] = payload["session"]
                return response.status, payload, dict(response.headers)
        except HTTPError as e:
            value = e.read()
            return e.code, json.loads(value) if value else {}, dict(e.headers)

    def test_deny_origin_and_missing_token(self):
        self.assertEqual(self.request("/next")[0], 403)
        self.assertEqual(self.request("/next", headers={
            "Origin": "https://attacker.invalid",
            "X-Nova-Token": self.bridge.state.key
        })[0], 403)
        self.assertEqual(self.request("/next", headers={
            "Origin": PROD_ORIGIN,
            "X-Nova-Token": "wrong-secret"
        })[0], 403)
        self.assertEqual(self.request("/connect", method="OPTIONS",
                                      headers={"Origin": "https://attacker.invalid"})[0], 403)

    def test_allowed_cors_and_explicit_pairing(self):
        status, _, hdr = self.request("/connect", method="OPTIONS",
                                      headers={"Origin": PROD_ORIGIN})
        self.assertEqual(status, 204)
        self.assertEqual(hdr["Access-Control-Allow-Origin"], PROD_ORIGIN)
        url = self.bridge.pairing_url()
        self.assertTrue(url.startswith(PROD_ORIGIN + "/nova-bridge#port="))
        self.assertNotIn("key=", url.split("#")[0])
        with self.assertRaises(ValueError):
            self.bridge.pairing_url("https://attacker.invalid")

    def test_exact_preview_origin_and_token_rotation(self):
        preview = "https://ai-operating-platform-35zto91g0-bumbi190s-projects.vercel.app"
        self.assertEqual(validate_pairing_origin(preview), preview)
        self.assertEqual(validate_pairing_origin(PROD_ORIGIN), PROD_ORIGIN)
        for invalid in (
            "http://ai-operating-platform-35zto91g0-bumbi190s-projects.vercel.app",
            "https://ai-operating-platform-35zto91g0-bumbi190s-projects.vercel.app.attacker.test",
            "https://attacker.invalid",
            "https://omniraos.se.attacker.test",
            "https://omniraos.se@attacker.invalid",
            "https://omniraos.se/path",
            "https://ai-operating-platform-35zto91g0-bumbi190s-projects.vercel.app/#key=steal",
            "https://ai-operating-platform-35zto91g0-bumbi190s-projects.vercel.app:443",
        ):
            with self.subTest(origin=invalid):
                with self.assertRaises(ValueError):
                    validate_pairing_origin(invalid)
        previous = self.bridge.state.key
        self.assertEqual(self.bridge.state.switch_origin(preview), preview)
        self.assertNotEqual(self.bridge.state.key, previous)
        self.assertFalse(self.bridge.state.online())
        self.assertEqual(self.request("/next", headers=self.good)[0], 403)
        rotated = {"Origin": preview, "X-Nova-Token": self.bridge.state.key}
        response = self.request("/connect", "POST", rotated, {"protocol": 1})
        self.assertEqual(response[0], 200)
        rotated["X-Nova-Session"] = response[1]["session"]
        self.assertEqual(self.request("/next", headers=rotated)[0], 200)
        self.assertTrue(self.bridge.pairing_url().startswith(preview + "/nova-bridge#"))
        with self.assertRaises(ValueError):
            self.bridge.pairing_url(PROD_ORIGIN)

    def test_persisted_preview_origin_is_only_allowlisted_host(self):
        preview = "https://ai-operating-platform-2vteosw04-bumbi190s-projects.vercel.app"
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "preview-origin.txt"
            self.assertIsNone(read_saved_preview_origin(str(path)))
            path.write_text(preview + "\n", encoding="utf-8")
            self.assertEqual(read_saved_preview_origin(str(path)), preview)
            for invalid in (
                PROD_ORIGIN,
                "https://attacker.invalid",
                preview + "/login",
                "https://omniraos.se@attacker.invalid",
                "A" * 600,
            ):
                with self.subTest(value=invalid[:30]):
                    path.write_text(invalid, encoding="utf-8")
                    self.assertIsNone(read_saved_preview_origin(str(path)))

    def test_readonly_task_lifecycle(self):
        self.assertFalse(self.bridge.state.online())
        self.assertIsNone(self.bridge.state.enqueue("Hjälp mig")[0])
        self.assertEqual(self.request("/connect", "POST", self.good,
                                      {"protocol": 1})[0], 200)
        self.assertTrue(self.bridge.state.online())
        task_id, _ = self.bridge.state.enqueue("Hur går det för Omnira?")
        self.assertIsNotNone(task_id)
        status, payload, _ = self.request("/next", headers=self.good)
        self.assertEqual(status, 200)
        self.assertEqual(payload["task"]["mode"], "nova_readonly")
        self.assertEqual(payload["task"]["id"], task_id)
        self.assertEqual(self.request("/next", headers=self.good)[1]["task"], {})
        self.assertIsNone(self.bridge.state.enqueue("En annan fråga")[0])
        self.assertEqual(self.request("/event", "POST", self.good,
                                      {"id": task_id, "kind": "text", "text": "Hej!"})[0], 200)
        self.assertEqual(self.request("/event", "POST", self.good,
                                      {"id": task_id, "kind": "done"})[0], 200)
        self.assertEqual(self.request("/status?" + task_id, headers=self.good)[1]["state"], "done")
        self.assertEqual(self.request("/event", "POST", self.good,
                                      {"id": task_id, "kind": "text", "text": "fel"})[0], 409)
        events = []
        while not self.bridge.state.events.empty():
            events.append(self.bridge.state.events.get_nowait()["kind"])
        self.assertIn("text", events)
        self.assertIn("done", events)

    def test_cancel_rejects_late_results(self):
        self.request("/connect", "POST", self.good, {"protocol": 1})
        task_id, _ = self.bridge.state.enqueue("Prov")
        self.request("/next", headers=self.good)
        self.bridge.state.cancel()
        self.assertEqual(self.request("/status?" + task_id, headers=self.good)[1]["state"], "canceled")
        self.assertEqual(self.request("/event", "POST", self.good,
                                      {"id": task_id, "kind": "done"})[0], 409)

    def test_rate_limit_blocks_excess_model_cost(self):
        self.request("/connect", "POST", self.good, {"protocol": 1})
        for _ in range(10):
            task_id, _ = self.bridge.state.enqueue("Vad ska prioriteras?")
            self.assertIsNotNone(task_id)
            _ = self.bridge.state.next()
            self.assertTrue(self.bridge.state.add_event({"id": task_id, "kind": "done"})[0])
        blocked, reason = self.bridge.state.enqueue("Ytterligare fråga")
        self.assertIsNone(blocked)
        self.assertIn("10 Atlas-frågor", reason)

    def test_stale_session_finishes_orphan_and_unblocks_after_reconnect(self):
        from nova_bridge import BridgeState, STALE_AFTER
        fake_time = [100.0]
        with patch("nova_bridge.time.monotonic", side_effect=lambda: fake_time[0]):
            state = BridgeState()
            state.connect()
            task_id, _ = state.enqueue("Fråga som webbläsaren överger")
            self.assertIsNotNone(task_id)
            self.assertEqual(state.next()["id"], task_id)
            fake_time[0] += STALE_AFTER + 1.0
            self.assertFalse(state.online())
            self.assertEqual(state.task.state, "failed")
            self.assertTrue(any(
                event.get("kind") == "error" and event.get("id") == task_id
                for event in list(state.events.queue)
            ))
            state.connect()
            replacement, reason = state.enqueue("Ny fråga efter återanslutning")
            self.assertIsNotNone(replacement, reason)
            self.assertNotEqual(replacement, task_id)
            self.assertFalse(state.add_event({"id": task_id, "kind": "done"})[0])

    def test_second_browser_pairing_cancels_previous_active_task(self):
        from nova_bridge import BridgeState
        state = BridgeState()
        state.connect()
        old_id, _ = state.enqueue("Gammal aktiv fråga")
        self.assertEqual(state.next()["id"], old_id)
        state.connect()
        self.assertEqual(state.task.state, "canceled")
        new_id, reason = state.enqueue("Ny flik, nytt uppdrag")
        self.assertIsNotNone(new_id, reason)
        self.assertNotEqual(new_id, old_id)
        self.assertFalse(state.add_event({"id": old_id, "kind": "text", "text": "sent"})[0])

    def test_only_newest_browser_session_can_pull_tasks_and_post_results(self):
        first_resp = self.request("/connect", "POST", self.good, {"protocol": 1})
        self.assertEqual(first_resp[0], 200)
        first = dict(self.good)
        first_id = first["X-Nova-Session"]
        self.assertGreater(len(first_id), 30)
        self.assertEqual(self.request("/next", headers=first)[0], 200)

        first_task, _ = self.bridge.state.enqueue("Fråga i första fliken")
        self.assertEqual(self.request("/next", headers=first)[1]["task"]["id"], first_task)

        # An explicit second browser pairing must revoke first tab's session.
        next_response = self.request("/connect", "POST", self.good, {"protocol": 1})
        self.assertEqual(next_response[0], 200)
        second = dict(self.good)
        self.assertNotEqual(first_id, second["X-Nova-Session"])

        for action in (
            lambda: self.request("/next", headers=first),
            lambda: self.request("/status?" + first_task, headers=first),
            lambda: self.request("/event", "POST", first, {
                "id": first_task, "kind": "text", "text": "SENT_TEXT",
            }),
        ):
            self.assertEqual(action()[0], 403)

        # Possessing the shared fragment key alone is not sufficient anymore.
        fragment_only = {
            "Origin": PROD_ORIGIN,
            "X-Nova-Token": self.bridge.state.key,
        }
        self.assertEqual(self.request("/next", headers=fragment_only)[0], 403)
        self.assertEqual(self.request("/next", headers=second)[0], 200)
        self.assertEqual(self.bridge.state.task.state, "canceled")

        new_id, msg = self.bridge.state.enqueue("Ny fråga i andra fliken")
        self.assertIsNotNone(new_id, msg)
        self.assertEqual(self.request("/next", headers=second)[1]["task"]["id"], new_id)
        self.assertEqual(self.request("/event", "POST", second, {
            "id": new_id, "kind": "done",
        })[0], 200)

    def test_stale_session_cannot_revive_on_heartbeat(self):
        from nova_bridge import BridgeState, STALE_AFTER
        now = [100.]
        with patch("nova_bridge.time.monotonic", side_effect=lambda: now[0]):
            state = BridgeState()
            token = state.connect()
            self.assertTrue(state.valid_session(token))
            now[0] += STALE_AFTER + 1
            self.assertFalse(state.valid_session(token))
            self.assertFalse(state.online())
            second = state.connect()
            self.assertNotEqual(token, second)
            self.assertFalse(state.valid_session(token))
            self.assertTrue(state.valid_session(second))

    def test_limits(self):
        self.request("/connect", "POST", self.good, {"protocol": 1})
        self.assertIsNone(self.bridge.state.enqueue("x" * 3001)[0])
        self.assertEqual(self.request("/connect", "POST", self.good,
                                      {"protocol": 77})[0], 400)
        self.assertEqual(self.request("/event", "POST", self.good,
                                     {"id": "bad", "kind": "execute_shell"})[0], 409)
        self.assertEqual(self.request("/event", "POST", self.good,
                                     {"irrelevant": "y" * 9000})[0], 400)


if __name__ == "__main__":
    unittest.main()
