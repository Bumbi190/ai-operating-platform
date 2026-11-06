import json
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from nova_bridge import NovaBridge, PROD_ORIGIN


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


if __name__ == "__main__":
    unittest.main()
