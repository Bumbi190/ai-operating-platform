import json
import tempfile
from pathlib import Path
import unittest
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
                return response.status, json.loads(value) if value else {}, dict(response.headers)
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
        self.assertEqual(self.request("/connect", "POST", rotated, {"protocol": 1})[0], 200)
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

    def test_limits(self):
        self.request("/connect", "POST", self.good, {"protocol": 1})
        self.assertIsNone(self.bridge.state.enqueue("x" * 3001)[0])
        self.assertEqual(self.request("/connect", "POST", self.good,
                                      {"protocol": 77})[0], 400)
        self.assertEqual(self.request("/event", "POST", self.good,
                                     {"id": "bad", "kind": "execute_shell"})[0], 409)
        self.assertEqual(self.request("/event", "POST", self.good,
                                     {"irrelevant": "y" * 9000})[0], 400)


    def test_voice_controls_require_browser_consent_and_are_acknowledged(self):
        self.request("/connect", "POST", self.good, {"protocol": 1})
        allowed, reason = self.bridge.state.request_voice_control("voice_toggle")
        self.assertFalse(allowed)
        self.assertIn("godk", reason)
        self.assertEqual(self.bridge.state.next_voice_control(), {})

        status, payload, _ = self.request(
            "/voice/authorize", "POST", self.good, {"protocol": 1})
        self.assertEqual(status, 200)
        self.assertTrue(payload["authorized"])
        self.assertEqual(self.bridge.state.voice_snapshot(),
                         {"authorized": True, "status": "starting"})

        self.assertTrue(self.bridge.state.update_voice_status("listening"))
        self.assertEqual(self.bridge.state.voice_snapshot()["status"], "listening")
        accepted, _ = self.bridge.state.request_voice_control("voice_toggle")
        self.assertTrue(accepted)
        first = self.bridge.state.next_voice_control()
        self.assertEqual(first["kind"], "voice_toggle")
        self.assertEqual(self.bridge.state.next_voice_control(), first)
        self.assertFalse(self.bridge.state.acknowledge_voice_control("wrong-id"))
        self.assertEqual(self.request(
            "/control/ack", "POST", self.good, {"id": "wrong-id"})[0], 409)
        self.assertEqual(self.request(
            "/control/ack", "POST", self.good, {"id": first["id"]})[0], 200)
        self.assertEqual(self.bridge.state.next_voice_control(), {})

    def test_voice_interrupt_supersedes_toggle_and_revoke_clears_pending(self):
        self.request("/connect", "POST", self.good, {"protocol": 1})
        self.request("/voice/authorize", "POST", self.good, {"protocol": 1})
        self.assertTrue(self.bridge.state.request_voice_control("voice_toggle")[0])
        self.assertTrue(self.bridge.state.request_voice_control("voice_interrupt")[0])
        command = self.bridge.state.next_voice_control()
        self.assertEqual(command["kind"], "voice_interrupt")
        self.assertFalse(self.bridge.state.acknowledge_voice_control("stale-toggle"))
        self.bridge.state.revoke_voice()
        self.assertEqual(self.bridge.state.next_voice_control(), {})
        self.assertFalse(self.bridge.state.voice_snapshot()["authorized"])
        self.assertFalse(self.bridge.state.update_voice_status("speaking"))

    def test_voice_routes_reject_extra_fields_and_invalid_status(self):
        self.request("/connect", "POST", self.good, {"protocol": 1})
        self.assertEqual(self.request(
            "/voice/authorize", "POST", self.good,
            {"protocol": 1, "token": "not-allowed"})[0], 400)
        self.assertEqual(self.request(
            "/voice/status", "POST", self.good, {"status": "run_shell"})[0], 409)
        self.assertEqual(self.request(
            "/voice/status", "POST", self.good, {"status": "listening", "extra": True})[0], 400)
        self.assertEqual(self.request(
            "/voice/revoke", "POST", self.good, {"protocol": 1})[0], 200)

    def test_voice_control_http_round_trip_through_next_poll(self):
        self.request("/connect", "POST", self.good, {"protocol": 1})
        self.request("/voice/authorize", "POST", self.good, {"protocol": 1})
        self.assertTrue(self.bridge.state.request_voice_control("voice_toggle")[0])
        status, payload, _ = self.request("/next", headers=self.good)
        self.assertEqual(status, 200)
        self.assertEqual(payload["command"]["kind"], "voice_toggle")
        control_id = payload["command"]["id"]
        status, payload, _ = self.request(
            "/control/ack", "POST", self.good, {"id": control_id})
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        self.assertEqual(self.request("/next", headers=self.good)[1]["command"], {})
    def test_tool_enabled_operator_task_requires_separate_consent(self):
        self.assertIsNone(self.bridge.state.enqueue_operator("Planera morgondagens inl?gg")[0])
        self.assertEqual(self.request("/connect", "POST", self.good, {"protocol": 1})[0], 200)
        self.assertIsNone(self.bridge.state.enqueue_operator("Planera morgondagens inl?gg")[0])
        self.assertEqual(self.request("/voice/authorize", "POST", self.good, {"protocol": 1})[0], 200)
        task_id, _ = self.bridge.state.enqueue_operator("Planera morgondagens inl?gg")
        self.assertIsNotNone(task_id)
        payload = self.request("/next", headers=self.good)[1]
        self.assertEqual(payload["task"]["mode"], "atlas_operator")
        self.assertEqual(payload["task"]["id"], task_id)
        self.assertEqual(payload["task"]["text"], "Planera morgondagens inl?gg")
        self.assertTrue(self.bridge.state.add_event({"id": task_id, "kind": "text", "text": "Utkast skapat."})[0])
        self.assertTrue(self.bridge.state.add_event({"id": task_id, "kind": "done"})[0])
        self.assertEqual(self.bridge.state.task_state(task_id), "done")

    def test_operator_task_fails_closed_when_pairing_replaced(self):
        self.request("/connect", "POST", self.good, {"protocol": 1})
        self.request("/voice/authorize", "POST", self.good, {"protocol": 1})
        task_id, _ = self.bridge.state.enqueue_operator("?ppna kalender")
        self.assertIsNotNone(task_id)
        self.bridge.state.switch_origin("https://ai-operating-platform-test123-bumbi190s-projects.vercel.app")
        self.assertEqual(self.bridge.state.next(), {})
        self.assertFalse(self.bridge.state.voice_authorized)
        self.assertIsNone(self.bridge.state.enqueue_operator("?ppna kalender")[0])


if __name__ == "__main__":
    unittest.main()
