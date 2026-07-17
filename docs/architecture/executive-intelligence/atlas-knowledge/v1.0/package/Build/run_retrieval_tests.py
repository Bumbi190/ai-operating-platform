#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
run_retrieval_tests.py — independent test runner for the Atlas Knowledge Edition retrieval router.

Loads Build/test_fixtures.jsonl from the package, calls the REAL router (query_atlas.AtlasRouter)
with ONLY the query string, compares the actual ranked output against the expected fixtures, verifies
citation + warning flags, prints a summary, and EXITS NON-ZERO if any test fails. Expected section IDs
are never passed to the router.

Usage:
    python3 run_retrieval_tests.py --package-root "<path>/Executive Intelligence — Atlas Knowledge Edition v1.0 — Validation Candidate 2"
"""
from __future__ import annotations
import sys
sys.dont_write_bytecode = True  # keep the package clean (no __pycache__ artifacts)
import argparse, json
from pathlib import Path


def evaluate(router, fixtures, section_cites):
    results = []; npass = 0
    for fx in fixtures:
        out = router.route(fx["query"])           # ONLY the query is passed to the router
        prim = out["primary"]; flags = out["warning_flags"]; conf = out["confidence"]
        ck = {}
        ck["citation_resolves"] = (prim is None) or (prim["citation"] == section_cites.get(prim["section_id"]))
        ck["must_flags_present"] = all(f in flags for f in fx.get("must_flags", []))
        ck["forbid_flags_absent"] = all(f not in flags for f in fx.get("forbid_flags", []))
        tt = fx["test_type"]
        if tt in ("unknown", "no_safe_result"):
            ck["confidence_ok"] = conf == "no_confident_match"; ck["primary_ok"] = True
        elif tt == "ambiguous":
            ck["confidence_ok"] = conf != "no_confident_match"; ck["primary_ok"] = bool(prim)
        elif tt == "external_action":
            ck["confidence_ok"] = True; ck["primary_ok"] = bool(prim)
        elif tt == "exact_id":
            ck["confidence_ok"] = True; ck["primary_ok"] = bool(prim) and prim["section_id"] in (fx["acceptable_primary_ids"] or [])
        elif tt == "chapter":
            ck["confidence_ok"] = True; ck["primary_ok"] = bool(prim) and prim["chapter_number"] == fx["expected_chapter"]
        elif tt == "chapter_topic":
            ck["confidence_ok"] = conf != "no_confident_match"
            ck["primary_ok"] = bool(prim) and prim["chapter_number"] == fx["expected_chapter"] and prim["section_title"].strip().lower() != "purpose of this chapter"
        else:
            ck["confidence_ok"] = conf != "no_confident_match"
            acc = fx["acceptable_primary_ids"] or []
            ok = bool(prim) and prim["section_id"] in acc
            if fx["expected_chapter"] is not None and prim:
                ok = ok and prim["chapter_number"] == fx["expected_chapter"]
            ck["primary_ok"] = ok
        p = all(ck.values()); npass += 1 if p else 0
        results.append((fx["test_id"], fx["test_type"], prim["section_id"] if prim else None, conf, p, ck))
    return results, npass


def main(argv=None):
    ap = argparse.ArgumentParser(description="Independent retrieval-router test runner (query-only; exits non-zero on any failure).")
    ap.add_argument("--package-root", required=True)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args(argv)
    root = Path(args.package_root).resolve()
    sys.path.insert(0, str(root / "Build"))
    import query_atlas
    router = query_atlas.AtlasRouter(root)
    fixtures = [json.loads(l) for l in open(root / "Build/test_fixtures.jsonl", encoding="utf-8") if l.strip()]
    section_cites = {}
    for l in open(root / "01_Canonical_Knowledge/executive-intelligence-sections.jsonl", encoding="utf-8"):
        s = json.loads(l); section_cites[s["section_id"]] = s["citation_label"]
    for l in open(root / "01_Canonical_Knowledge/front-matter.jsonl", encoding="utf-8"):
        f = json.loads(l); section_cites[f["section_id"]] = f["citation_label"]
    results, npass = evaluate(router, fixtures, section_cites)
    for tid, tt, prim, conf, p, ck in results:
        if args.verbose or not p:
            print(f"{'PASS' if p else 'FAIL'} {tid} [{tt}] -> {prim} ({conf}) {'' if p else [k for k,v in ck.items() if not v]}")
    print(f"\n{npass}/{len(results)} passed")
    return 0 if npass == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
