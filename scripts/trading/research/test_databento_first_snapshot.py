"""OFFLINE safety tests for FIRST real Databento DBN snapshot staging.

No real SDK, creds, billable endpoints, service, or private account access.
"""
import copy
from datetime import datetime, timezone
from decimal import Decimal
import json
from pathlib import Path
import tempfile
import unittest

from databento_first_snapshot import (
    parse_quote, download, CONFIRMATION, MAX_ESTIMATE, CONTRACTS,
    blocked,
)

NOW = datetime(2026, 10, 19, 14, 50, tzinfo=timezone.utc)
QUOTE = {
    "observedAt": "2026-10-19T14:20:34.8041245Z",
    "kind": "DATABENTO_HISTORICAL_FREE_METADATA_QUOTE",
    "status": "FREE_METADATA_ONLY_COMPLETE", "reason": None,
    "downloadedRecords": 0, "billableEndpointsCalled": 0,
    "downloadAuthorized": False,
    "dataset": "GLBX.MDP3", "schema": "ohlcv-1m",
    "start": "2026-10-15T00:00:00Z",
    "end": "2026-10-16T00:00:00Z",
    "instruments": [
        {"root": "NQ", "rawSymbol": "NQZ6", "instrumentId": "261401",
         "mappingStart": "2026-10-15", "mappingEnd": "2026-10-16"},
        {"root": "ES", "rawSymbol": "ESZ6", "instrumentId": "10252",
         "mappingStart": "2026-10-15", "mappingEnd": "2026-10-16"},
    ],
    "quotes": [
        {"root": "NQ", "rawSymbol": "NQZ6", "estimateUSD": 0.0050380826},
        {"root": "ES", "rawSymbol": "ESZ6", "estimateUSD": 0.0050380826},
    ],
    "combinedEstimatedUSD": 0.010076165,
    "estimateOnly": True,
}

class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "Quote_Result_Public.json"

    def prepare(self, change=None, now=NOW):
        src = copy.deepcopy(QUOTE)
        if change:
            change(src)
        self.path.write_text(json.dumps(src), encoding="utf8")
        return parse_quote(self.path, now=now)

    def rejects(self, change):
        with self.assertRaisesRegex(ValueError, "PRECHECK_BLOCKED_"):
            self.prepare(change)

    def test_01_valid_actual_sanitized_vendor_quote_prepares_no_trade(self):
        plan = self.prepare()
        self.assertEqual(plan["status"], "PREPARED_PENDING_EXPLICIT_DOWNLOAD_APPROVAL")
        self.assertEqual(plan["combinedEstimatedUSD"], "0.010076165")
        self.assertEqual(Decimal(plan["combinedEstimatedUSD"]) < MAX_ESTIMATE, True)
        self.assertEqual([i["rawSymbol"] for i in plan["contracts"]], ["NQZ6","ESZ6"])
        self.assertEqual([i["vendorInstrumentId"] for i in plan["contracts"]], ["261401","10252"])
        self.assertEqual(plan["dataDownloaded"], False)
        self.assertEqual(plan["readyForBacktest"], False)
        self.assertEqual(plan["approvedForTrading"], False)

    def test_02_key_absent_from_quote_and_plan(self):
        self.prepare()
        text = json.dumps(parse_quote(self.path, now=NOW))
        self.assertNotIn("DATABENTO_API_KEY",text)
        self.assertNotIn("db-",text)

    def test_03_any_unknown_date_dataset_or_schema_blocks(self):
        self.rejects(lambda q:q.update(start="2026-10-14T00:00:00Z"))
        self.rejects(lambda q:q.update(dataset="GLBX.OTHER"))
        self.rejects(lambda q:q.update(schema="mbo"))

    def test_04_must_be_completed_free_metadata_report(self):
        self.rejects(lambda q:q.update(status="BLOCKED"))
        self.rejects(lambda q:q.update(downloadAuthorized=True))
        self.rejects(lambda q:q.update(downloadedRecords=1))
        self.rejects(lambda q:q.update(billableEndpointsCalled=1))

    def test_05_contract_ids_pinned_to_vendor_verified_quote(self):
        self.rejects(lambda q:q["instruments"][0].update(instrumentId="123"))
        self.rejects(lambda q:q["instruments"][1].update(rawSymbol="ESU6"))
        self.rejects(lambda q:q["instruments"][0].update(mappingEnd="2026-10-15"))

    def test_06_duplicate_or_missing_contract_blocks(self):
        self.rejects(lambda q:q["instruments"].append(q["instruments"][0]))
        self.rejects(lambda q:q["instruments"][1].update(root="NQ"))
        self.rejects(lambda q:q["quotes"][1].update(root="NQ"))

    def test_07_quote_price_and_total_must_be_bounded_and_agree(self):
        self.rejects(lambda q:q.update(combinedEstimatedUSD=0.06))
        self.rejects(lambda q:q["quotes"][0].update(estimateUSD=0.5))
        self.rejects(lambda q:q["quotes"][0].update(estimateUSD="-1"))
        self.rejects(lambda q:q["quotes"][0].update(estimateUSD=float('nan')))
        self.rejects(lambda q:q.update(combinedEstimatedUSD=0.0))

    def test_08_old_or_future_quote_needs_requote_before_billing(self):
        with self.assertRaisesRegex(ValueError, "QUOTE_STALE"):
            self.prepare(now=datetime(2026,11,1,tzinfo=timezone.utc))
        with self.assertRaisesRegex(ValueError, "QUOTE_STALE"):
            self.prepare(now=datetime(2026,10,19,12,0,tzinfo=timezone.utc))

    def test_09_invalid_or_missing_input_quote_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "QUOTE_MISSING"):
            parse_quote(self.path)
        self.path.write_text("{NOT JSON")
        with self.assertRaisesRegex(ValueError, "QUOTE_INVALID_JSON"):
            parse_quote(self.path)

    def test_10_download_requires_exact_operator_approval_before_sdk_key_or_network(self):
        plan=self.prepare()
        did_call=[]
        def prompt(msg):
            did_call.append(msg)
            return "NO"
        with self.assertRaisesRegex(ValueError, "HUMAN_DOWNLOAD_APPROVAL_MISSING"):
            download(plan,Path(self.temp.name)/"dataset",prompt_fn=prompt,
                     client_factory=lambda key: self.fail("unauthorized client"))
        self.assertFalse((Path(self.temp.name)/"dataset").exists())
        self.assertEqual(len(did_call),1)

    def test_11_review_terms_and_spending_controls_before_client_creation(self):
        plan=self.prepare()
        answers=iter([CONFIRMATION,"NEJ"])
        with self.assertRaisesRegex(ValueError, "VENDOR_TERMS_OR_ACCOUNT_SPEND_CAP_UNCONFIRMED"):
            download(plan,Path(self.temp.name)/"dataset",
                     prompt_fn=lambda msg:next(answers),
                     client_factory=lambda key:self.fail("unauthorized client"))
        self.assertFalse((Path(self.temp.name)/"dataset").exists())

    def test_12_no_redownload_if_any_output_dir_exists(self):
        plan=self.prepare()
        out=Path(self.temp.name)/"existing"
        out.mkdir()
        with self.assertRaisesRegex(ValueError, "OUTPUT_ALREADY_EXISTS"):
            download(plan,out,prompt_fn=lambda msg:self.fail("no prompt allowed"),
                     client_factory=lambda key:self.fail("no client allowed"))

    def test_13_human_confirmation_and_license_do_not_override_invalid_key(self):
        plan=self.prepare()
        answers=iter([CONFIRMATION,"JA"])
        with self.assertRaisesRegex(ValueError, "INVALID_KEY_FORMAT"):
            download(plan,Path(self.temp.name)/"dataset",
                     prompt_fn=lambda msg:next(answers),
                     key_fn=lambda msg:"NOT_A_VALID_KEY",
                     client_factory=lambda key:self.fail("unauthorized client"))
        self.assertFalse((Path(self.temp.name)/"dataset").exists())

if __name__=="__main__":
    unittest.main(verbosity=2)
