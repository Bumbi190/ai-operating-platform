"""Omnira iFVG: controlled first REAL historical snapshot staging.

DEFAULT MODE: prepare-only, NO NETWORK/NO API KEY/NO PURCHASE.
An explicit --download run additionally requires:
  * exact same-day vendor metadata quote for two contract symbols,
  * estimate below configured local cap,
  * interactive contract/budget approval and vendor-terms confirmation,
  * Databento Python SDK installed; password-style local getpass entry,
  * immutable single-run original DBN files + SHA256 audit.

Do not import output into the canonical trading runtime. Vendor DBN is stored
unaltered, with audit metadata; real historical backtest requires later gates.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import sys

DAY = "2026-10-15"
START = DAY + "T00:00:00Z"
END = "2026-10-16T00:00:00Z"
DATASET = "GLBX.MDP3"
SCHEMA = "ohlcv-1m"
CONTRACTS = {"NQ": ("NQZ6", "261401"), "ES": ("ESZ6", "10252")}
MAX_ESTIMATE = Decimal("0.05")
QUOTE_MAX_AGE = timedelta(hours=48)
CONFIRMATION = "GODKANN NQZ6 ESZ6 2026-10-15 MAX 0.05 USD"
QUOTE_NAME = "Quote_Result_Public.json"

def blocked(message: str) -> ValueError:
    return ValueError("PRECHECK_BLOCKED_" + message)

def parse_quote(path: Path, now: datetime | None = None) -> dict:
    """Validate the VENDOR-VERIFIED PUBLIC QUOTE, not a synthetic fixture."""
    if not path.is_file() or path.stat().st_size > 25000:
        raise blocked("QUOTE_MISSING_OR_TOO_LARGE")
    try:
        data = json.loads(path.read_text(encoding="utf-8-sig"))
    except (ValueError, UnicodeError, OSError) as exc:
        raise blocked("QUOTE_INVALID_JSON") from exc
    if not isinstance(data, dict) or data.get("kind") != "DATABENTO_HISTORICAL_FREE_METADATA_QUOTE":
        raise blocked("QUOTE_KIND")
    if data.get("status") != "FREE_METADATA_ONLY_COMPLETE" or data.get("reason") is not None:
        raise blocked("QUOTE_NOT_VERIFIED")
    if data.get("downloadAuthorized") is not False or data.get("downloadedRecords") != 0 or data.get("billableEndpointsCalled") != 0:
        raise blocked("QUOTE_SHOULD_BE_METADATA_ONLY")
    if (data.get("dataset"), data.get("schema"), data.get("start"), data.get("end")) != (DATASET, SCHEMA, START, END):
        raise blocked("DATASET_SCHEMA_DATE_MISMATCH")
    try:
        observed = datetime.fromisoformat(data["observedAt"].replace("Z", "+00:00"))
    except (ValueError, TypeError, KeyError) as exc:
        raise blocked("QUOTE_TIME_INVALID") from exc
    if observed.tzinfo is None:
        raise blocked("QUOTE_TIME_NOT_UTC")
    now = now or datetime.now(timezone.utc)
    if observed > now + timedelta(minutes=5) or now - observed > QUOTE_MAX_AGE:
        raise blocked("QUOTE_STALE")
    mapping = data.get("instruments")
    quotes = data.get("quotes")
    if not isinstance(mapping, list) or not isinstance(quotes, list) or len(mapping) != 2 or len(quotes) != 2:
        raise blocked("TWO_CONTRACTS_REQUIRED")
    amounts = {}
    seen = set()
    for record in mapping:
        if not isinstance(record, dict) or record.get("root") not in CONTRACTS:
            raise blocked("UNKNOWN_CONTRACT")
        root = record["root"]
        if root in seen:
            raise blocked("DUPLICATE_CONTRACT")
        seen.add(root)
        sym, instrument_id = CONTRACTS[root]
        if record.get("rawSymbol") != sym or str(record.get("instrumentId")) != instrument_id:
            raise blocked("VENDOR_CONTRACT_MAPPING_CHANGED")
        mapping_start, mapping_end = record.get("mappingStart"), record.get("mappingEnd")
        if not isinstance(mapping_start, str) or not isinstance(mapping_end, str) or (
            mapping_start > DAY or mapping_end < END[:10]
        ):
            raise blocked("MAPPING_NOT_DAY_VALID")
    if seen != set(CONTRACTS):
        raise blocked("MISSING_CONTRACT")
    seen = set()
    for record in quotes:
        if not isinstance(record, dict) or record.get("root") not in CONTRACTS:
            raise blocked("UNKNOWN_QUOTE_CONTRACT")
        root = record["root"]
        if root in seen or record.get("rawSymbol") != CONTRACTS[root][0]:
            raise blocked("DUPLICATE_OR_WRONG_QUOTE")
        seen.add(root)
        try:
            # JSON numeric-only; reject bool, NaN, negative and string estimates.
            if isinstance(record.get("estimateUSD"), (str, bool)) or record.get("estimateUSD") is None:
                raise ValueError("not numeric")
            usd = Decimal(str(record["estimateUSD"]))
            if not usd.is_finite() or usd < 0:
                raise ValueError("negative or nonfinite")
        except (InvalidOperation, ValueError, TypeError) as exc:
            raise blocked("BAD_COST_ESTIMATE") from exc
        amounts[root] = usd
    if seen != set(CONTRACTS):
        raise blocked("MISSING_QUOTE")
    try:
        total = Decimal(str(data["combinedEstimatedUSD"]))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise blocked("TOTAL_INVALID") from exc
    if not total.is_finite() or total < 0 or abs(total - sum(amounts.values())) > Decimal("0.000000002"):
        raise blocked("TOTAL_DOES_NOT_MATCH")
    if total > MAX_ESTIMATE:
        raise blocked("TOTAL_OVER_LOCAL_ESTIMATE_CAP")
    return {
        "status": "PREPARED_PENDING_EXPLICIT_DOWNLOAD_APPROVAL",
        "quoteObservedUtc": observed.isoformat(),
        "dataset": DATASET, "schema": SCHEMA, "start": START, "end": END,
        "contracts": [{"root": root, "rawSymbol": CONTRACTS[root][0],
                       "vendorInstrumentId": CONTRACTS[root][1],
                       "quotedUSD": str(amounts[root])} for root in ("NQ", "ES")],
        "combinedEstimatedUSD": str(total),
        "localEstimateCapUSD": str(MAX_ESTIMATE),
        "vendorHardSpendCapVerified": False,
        "actualInvoiceAmountKnown": False,
        "billingMayDifferFromEstimate": True,
        "dataDownloaded": False,
        "approvedForTrading": False,
        "readyForBacktest": False,
        "requiresLicensedPrivateUse": True,
    }

def hash_file(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda: f.read(1 << 20), b""):
            sha.update(part)
    return sha.hexdigest()

def verify_dbn_store(path: Path, sym: str, expected_id: int, start: str, end: str) -> dict:
    """Read a saved original DBN using the vendor SDK; never infer SETTLED."""
    import databento as db
    store = db.DBNStore.from_file(path)
    df = store.to_df()
    needed = {"open", "high", "low", "close", "volume", "instrument_id"}
    if not needed.issubset(df.columns):
        raise blocked("DBN_MISSING_REQUIRED_COLUMNS")
    if len(df) == 0:
        raise blocked("DBN_EMPTY")
    if len(df) > 2000:
        raise blocked("DBN_UNEXPECTED_TOO_MANY_1M_BARS")
    if int(df["instrument_id"].nunique()) != 1 or int(df["instrument_id"].iloc[0]) != expected_id:
        raise blocked("DBN_CONTRACT_ID_MISMATCH")
    # Price representation from official SDK is display-scaled; preserve raw DBN
    # and do not normalize floats into canonical exact tick/price data yet.
    if bool(df[list(("open", "high", "low", "close", "volume"))].isnull().any().any()):
        raise blocked("DBN_NAN_OR_NULL")
    if not bool(((df["high"] >= df["low"]) &
       (df["high"] >= df["open"]) & (df["high"] >= df["close"]) &
       (df["low"] <= df["open"]) & (df["low"] <= df["close"]) &
       (df["volume"] >= 0)).all()):
        raise blocked("DBN_INVALID_OHLCV")
    ix = df.index
    if not hasattr(ix, "tz") or ix.tz is None or not ix.is_monotonic_increasing or ix.has_duplicates:
        raise blocked("DBN_BAD_TIMESTAMPS")
    # Index must contain finished minute bucket starts; preserve exchange gaps
    # rather than interpolating missing intervals.
    if any(t.second != 0 or t.microsecond != 0 for t in ix):
        raise blocked("DBN_NOT_MINUTE_ALIGNED")
    if ix[0].isoformat() < start.replace("Z", "+00:00") or ix[-1].isoformat() >= end.replace("Z", "+00:00"):
        raise blocked("DBN_OUT_OF_REQUEST_WINDOW")
    missing_intervals = sum(max(0, int((ix[i] - ix[i - 1]).total_seconds() // 60) - 1)
                            for i in range(1, len(ix)))
    return {
        "rootSymbol": sym,
        "vendorInstrumentId": expected_id,
        "recordCount": int(len(df)),
        "firstBarUtc": ix[0].isoformat(),
        "lastBarUtc": ix[-1].isoformat(),
        "missingOneMinuteIntervals": missing_intervals,
        "noInterpolationPerformed": True,
        "sourceSettled": False,
        "canonicalBacktestReady": False,
    }

def download(plan: dict, output: Path, *, prompt_fn=input, key_fn=getpass.getpass, client_factory=None):
    if output.exists():
        raise blocked("OUTPUT_ALREADY_EXISTS_NO_REDOWNLOAD")
    print("PAYING DATA ENDPOINT AHEAD. Local estimate is only an estimate, not a vendor hard cap.")
    print("Confirm usage license/private research terms and billing limit in your Databento portal first.")
    print("Type exactly: " + CONFIRMATION)
    if prompt_fn("Approval: ").strip() != CONFIRMATION:
        raise blocked("HUMAN_DOWNLOAD_APPROVAL_MISSING")
    if prompt_fn("Have you reviewed use terms and account spending controls? Type JA: ").strip() != "JA":
        raise blocked("VENDOR_TERMS_OR_ACCOUNT_SPEND_CAP_UNCONFIRMED")
    if client_factory is None:
        import databento as db
        client_factory = db.Historical
    key = key_fn("Databento historical API key (hidden input): ")
    if not isinstance(key, str) or not re.fullmatch(r"db-[A-Za-z0-9_-]{20,}", key):
        raise blocked("INVALID_KEY_FORMAT")
    # Construct client, keep key only in ephemeral process memory.
    client = client_factory(key)
    key = None
    # Do not execute more than two timeseries.get_range calls (NQ + ES).
    output.mkdir(parents=True, exist_ok=False)
    outputs = []
    try:
        for contract in plan["contracts"]:
            symbol = contract["rawSymbol"]
            root = contract["root"]
            target = output / (root + "Z6-20261015.ohlcv-1m.dbn.zst")
            if target.exists():
                raise blocked("OUTPUT_FILE_ALREADY_EXISTS")
            store = client.timeseries.get_range(
                dataset=DATASET, symbols=[symbol], schema=SCHEMA,
                stype_in="raw_symbol", start=START, end=END, path=str(target))
            # May create a file only when supplier stream completed successfully.
            if not target.is_file() or target.stat().st_size < 100:
                raise blocked("DATA_FILE_MISSING_OR_TOO_SMALL")
            audit = verify_dbn_store(target, symbol, int(contract["vendorInstrumentId"]), START, END)
            audit["filename"] = target.name
            audit["sourceRawDbnSha256"] = hash_file(target)
            audit["sourceRawDbnBytes"] = target.stat().st_size
            outputs.append(audit)
        manifest = {
            "schema": "research.databento_original_dbn_intake.v0.1",
            "source": "DATABENTO_HISTORICAL",
            "status": "RAW_DATA_QUARANTINE_REQUIRES_REVIEW",
            "query": {"dataset": DATASET, "schema": SCHEMA, "start": START,
                      "end": END, "stype_in": "raw_symbol"},
            "quoteEstimateUSD": plan["combinedEstimatedUSD"],
            "maxLocalEstimateUSD": str(MAX_ESTIMATE),
            "actualVendorBillUSD": None,
            "vendorHardCapVerifiedByApp": False,
            "licensedRedistributionAllowed": False,
            "canAuthorizeTrading": False,
            "readyForCanonicalBacktest": False,
            "records": outputs,
        }
        (output / "manifest.json").write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return manifest
    except BaseException:
        # Preserve any charged original bytes in quarantine; don't re-download
        # automatically. Require manual audit before another billable attempt.
        (output / "INCOMPLETE_REQUIRES_MANUAL_REVIEW.txt").write_text(
            "Potential billable historical request occurred. DO NOT retry or delete "
            "without auditing Databento usage/billing and existing DBN files.\n",
            encoding="utf-8")
        raise

def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="First NQ/ES historical snapshot: defaults to prepare-only (NO paid calls).")
    p.add_argument("--quote", type=Path, default=Path(__file__).resolve().parent / QUOTE_NAME)
    p.add_argument("--output", type=Path, default=Path.home() / "Projects" / "Omnira" / "Data" /
                   "Historical" / "Databento-20261015")
    p.add_argument("--download", action="store_true",
                   help="DANGEROUS: only with explicit human approval; may consume Databento credits.")
    args = p.parse_args(argv)
    try:
        plan = parse_quote(args.quote)
        if not args.download:
            print(json.dumps(plan, indent=2, ensure_ascii=False))
            print("No historical data request made. Run --download ONLY after explicit budget approval.")
            return 0
        manifest = download(plan, args.output)
        print(json.dumps({"status":manifest["status"],"records":manifest["records"]},indent=2))
        return 0
    except (ValueError, OSError, ImportError) as exc:
        print("BLOCKED: " + str(exc), file=sys.stderr)
        return 2

if __name__ == "__main__":
    sys.exit(main())
