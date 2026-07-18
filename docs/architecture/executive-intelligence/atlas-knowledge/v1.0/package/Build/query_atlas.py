#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
query_atlas.py — deterministic, local retrieval router for the Atlas Knowledge Edition.

NO embeddings. NO vector database. NO model/LLM. Pure deterministic token/phrase scoring over the
generated indexes, chapter titles, section records, and the documented term lexicon. The router reads
ONLY the package; it never reads test fixtures or expected outputs.

CLI:
    python3 query_atlas.py --package-root "<pkg>" "What is the Decision Ledger?"
    python3 query_atlas.py --package-root "<pkg>" --json "Who has ultimate authority?"
"""
from __future__ import annotations
import sys
sys.dont_write_bytecode = True  # keep the package clean (no __pycache__ / *.pyc artifacts)
import argparse, json, re
from pathlib import Path

STOPWORDS = {
    "the", "a", "an", "of", "to", "in", "on", "for", "and", "or", "is", "are", "be", "as", "at", "by", "it",
    "its", "what", "which", "who", "whom", "how", "does", "do", "did", "can", "could", "should", "would",
    "may", "will", "that", "this", "these", "those", "with", "about", "into", "from", "have", "has", "not",
    "but", "if", "then", "there", "their", "between", "me", "show", "look", "up", "work", "works",
}
# concepts that are too generic to be useful ranking signals (navigational only)
GENERIC_CONCEPTS = {"Executive Intelligence", "Omnira", "Manager", "Workforce", "Knowledge", "Memory",
                    "Atlas", "Governance", "AI Intelligence", "Performance Intelligence"}
GEN_TITLE_TOK = {"executive", "intelligence", "vs"}

# documented scoring weights (mirrored in 05_Retrieval/query-routing-rules.md and term-lexicon.json)
W_TITLE_TOKEN = 4.0
W_TITLE_PHRASE = 10.0
W_LEXICON_TITLE = 6.0
W_LEXICON_ANCHOR = 14.0
W_CONCEPT = 3.0
W_PROJECT = 4.0
W_AUTHORITY = 2.0
W_BODY_TOKEN = 0.25
W_BODY_CAP = 2.0
W_CHAPTER_TITLE_FULL = 10.0    # query covers >= 2 distinctive chapter-title tokens
W_CHAPTER_TITLE_SINGLE = 4.0   # chapter has 1 distinctive token and query covers it
W_CHAPTER_EXPLICIT = 8.0       # explicit "Chapter N"
PURPOSE_PENALTY = -6.0
MIN_CONFIDENCE = 6.0
AMBIGUITY_MARGIN = 1.5


def norm_tokens(text: str):
    out = []
    for t in re.sub(r"[^a-z0-9\- ]", " ", text.lower()).split():
        if not t or t in STOPWORDS:
            continue
        if len(t) > 3 and t.endswith("s"):
            t = t[:-1]
        out.append(t)
    return out


class AtlasRouter:
    def __init__(self, package_root):
        self.root = Path(package_root)
        self.sections = {}
        self.order = []
        self._load()

    def _read_jsonl(self, rel):
        with open(self.root / rel, encoding="utf-8") as f:
            return [json.loads(l) for l in f if l.strip()]

    def _load(self):
        for s in self._read_jsonl("01_Canonical_Knowledge/executive-intelligence-sections.jsonl"):
            self.sections[s["section_id"]] = {"section_id": s["section_id"], "chapter_number": s["chapter_number"],
                "title": s["section_title"], "text": s["canonical_text"], "citation": s["citation_label"],
                "concept_tags": s.get("concept_tags", []), "authority_scope": s.get("authority_scope", []),
                "project_scope": s.get("project_scope", []), "kind": "section"}
            self.order.append(s["section_id"])
        for f in self._read_jsonl("01_Canonical_Knowledge/front-matter.jsonl"):
            self.sections[f["section_id"]] = {"section_id": f["section_id"], "chapter_number": "front_matter",
                "title": f["heading"], "text": f["canonical_text"], "citation": f["citation_label"],
                "concept_tags": f.get("concept_tags", []), "authority_scope": [], "project_scope": [], "kind": "front_matter"}
            self.order.append(f["section_id"])
        self.concept_index = json.load(open(self.root / "02_Indexes/concept-index.json", encoding="utf-8"))
        self.project_index = json.load(open(self.root / "02_Indexes/project-index.json", encoding="utf-8"))
        self.chapter_index = json.load(open(self.root / "02_Indexes/chapter-index.json", encoding="utf-8"))
        self.lexicon = json.load(open(self.root / "05_Retrieval/term-lexicon.json", encoding="utf-8"))
        self._title_l = {sid: s["title"].lower() for sid, s in self.sections.items()}
        self._text_l = {sid: s["text"].lower() for sid, s in self.sections.items()}
        self._title_tokens = {sid: set(norm_tokens(s["title"])) for sid, s in self.sections.items()}
        self._order_rank = {sid: i for i, sid in enumerate(self.order)}
        self.concept_phrases = {lbl.lower(): lbl for lbl in self.concept_index["concepts"].keys()
                                if lbl not in GENERIC_CONCEPTS}
        self.chap_distinctive = {}
        for c in self.chapter_index["chapters"]:
            full = c["canonical_title"]
            title = full.split("—", 1)[1].strip() if "—" in full else full
            self.chap_distinctive[c["chapter_number"]] = set(norm_tokens(title)) - GEN_TITLE_TOK

    # ---------- deterministic query tag derivation ----------
    @staticmethod
    def derive_tags(query):
        q = query.lower(); tags = set()
        if any(w in q for w in ["authority", "authorize", "authoriz", "permission", "who decides", "final say",
                                "ultimate", "approv", "govern", "founder", "legitimacy"]):
            tags.add("authority")
        if any(w in q for w in ["execute", "perform", "carry out", "external", "payment", "send", "publish", "take action"]):
            tags.add("external_action")
        if "atlas" in q and any(w in q for w in ["say", "execute", "do ", "automatically", "not "]):
            tags.add("authority")
        if any(w in q for w in ["automatically", "on its own", "by itself"]):
            tags.add("external_action")
        if any(w in q for w in ["autonomy", "autonomous", "self-promot", "self promot", "raise its own",
                                "increase its own", "license", "l0", "l1", "l2", "l3", "l4", "l5", "l6"]):
            tags.add("autonomy")
        if "approv" in q:
            tags.add("approval")
        if any(w in q for w in ["implement", "runtime", "deployed", "status", "maturity", "target architecture", "future"]):
            tags.add("maturity")
        if re.search(r"stage\s*1|stage one|future target", q):
            tags.add("stage_scope"); tags.add("maturity")
        if any(w in q for w in ["crisis", "emergency", "brake"]):
            tags.add("emergency")
        if any(w in q for w in ["memory", "knowledge", "ai intelligence", "performance intelligence", "graph"]):
            tags.add("knowledge_evidence")
        return tags

    @staticmethod
    def warn_flags(tags):
        f = ["IMPLEMENTATION_STATUS_UNVERIFIED"]
        if "authority" in tags: f.append("AUTHORITY_QUERY_HUMAN_OVERSIGHT_REQUIRED")
        if "external_action" in tags: f.append("EXTERNAL_ACTION_NOT_EXECUTION_AUTHORITY")
        if "autonomy" in tags: f.append("AUTONOMY_NOT_SELF_GRANTED")
        if "approval" in tags: f.append("APPROVAL_GATE_APPLIES")
        if "maturity" in tags: f.append("CANONICAL_TARGET_NOT_CONFIRMED_IMPLEMENTED")
        if "stage_scope" in tags: f.append("STAGE_SCOPE_IS_ARCHITECTURAL_TARGET")
        if "emergency" in tags: f.append("EMERGENCY_CONTROL_HUMAN_GOVERNED")
        if "knowledge_evidence" in tags: f.append("KNOWLEDGE_IS_EVIDENCE_NOT_EXECUTION_AUTHORITY")
        return f

    def route(self, query, k=5):
        q_raw = query.strip(); ql = q_raw.lower()
        qtokens = norm_tokens(q_raw); qtset = set(qtokens)
        tags = self.derive_tags(q_raw)

        # (0) exact section-ID
        exact_id = None
        m = re.search(r"\b(\d{1,2}\.\d{1,3})\b", q_raw)
        if m and m.group(1) in self.sections:
            exact_id = m.group(1)
        fm = re.search(r"\bFM\.?([1-4])\b", q_raw, re.I)
        if fm and f"FM.{fm.group(1)}" in self.sections:
            exact_id = f"FM.{fm.group(1)}"
        if exact_id:
            return self._package([(exact_id, 1000.0)], q_raw, tags, k, "exact_id")

        # (1) explicit chapter lookup
        chap_target = None
        mc = re.search(r"\bchapter\s+(\d{1,2})\b", ql)
        if mc and 1 <= int(mc.group(1)) <= 32:
            chap_target = int(mc.group(1))

        # (2) lexicon expansion
        lex_concepts, lex_title_terms, lex_anchor = set(), set(), set()
        for e in self.lexicon["entries"]:
            if any(p in ql for p in e["match_phrases"]):
                lex_concepts.update(e.get("concepts", []))
                lex_title_terms.update(t.lower() for t in e.get("title_terms", []))
                lex_anchor.update(e.get("anchor_section_ids", []))

        present_concepts = set(c for c in lex_concepts if c not in GENERIC_CONCEPTS)
        for phrase, lbl in self.concept_phrases.items():
            if len(phrase) >= 4 and phrase in ql:
                present_concepts.add(lbl)
        concept_members = {lbl: set(self.concept_index["concepts"].get(lbl, {}).get("section_ids", [])) for lbl in present_concepts}

        named_projects = {p for p in self.project_index["projects"] if p.lower() in ql}
        project_members = {p: set(self.project_index["projects"][p]["section_ids"]) for p in named_projects}

        # (3) chapter-title match boosts
        chap_boost = {}
        for n, dist in self.chap_distinctive.items():
            cov = qtset & dist
            if len(cov) >= 2:
                chap_boost[n] = W_CHAPTER_TITLE_FULL
            elif dist and len(dist) == 1 and cov == dist:
                chap_boost[n] = W_CHAPTER_TITLE_SINGLE
        if chap_target is not None:
            chap_boost[chap_target] = max(chap_boost.get(chap_target, 0), W_CHAPTER_EXPLICIT)

        want_purpose = bool(re.search(r"\b(purpose|overview|introduction)\b", ql))
        scores = {}
        for sid, s in self.sections.items():
            sc = 0.0
            title_l = self._title_l[sid]; ttok = self._title_tokens[sid]
            sc += W_TITLE_TOKEN * len(qtset & ttok)
            for phrase in present_concepts:
                if phrase.lower() in title_l:
                    sc += W_TITLE_PHRASE
            for t in lex_title_terms:
                if t in title_l:
                    sc += W_LEXICON_TITLE
            if sid in lex_anchor:
                sc += W_LEXICON_ANCHOR
            for members in concept_members.values():
                if sid in members:
                    sc += W_CONCEPT
            for members in project_members.values():
                if sid in members:
                    sc += W_PROJECT
            if "authority" in tags and any(a in ("human_authority", "approval_gate", "governance_policy") for a in s["authority_scope"]):
                sc += W_AUTHORITY
            if qtokens:
                body = self._text_l[sid]; bt = 0.0
                for t in qtset:
                    if len(t) >= 4 and t in body:
                        bt += W_BODY_TOKEN
                sc += min(bt, W_BODY_CAP)
            cb = chap_boost.get(s["chapter_number"])
            if cb:
                sc += cb
            if s["title"].strip().lower() == "purpose of this chapter" and not want_purpose:
                sc += PURPOSE_PENALTY
            if sc > 0:
                scores[sid] = sc
        ranked = sorted(scores.items(), key=lambda kv: (-kv[1], self._order_rank[kv[0]]))[:max(k, 5)]
        return self._package(ranked, q_raw, tags, k, "scored")

    def _package(self, ranked, query, tags, k, mode):
        flags = self.warn_flags(tags); confidence = "confident"
        if not ranked:
            confidence = "no_confident_match"; flags = flags + ["NO_CONFIDENT_MATCH"]
        elif mode != "exact_id":
            top = ranked[0][1]
            if top < MIN_CONFIDENCE:
                confidence = "no_confident_match"; flags = flags + ["NO_CONFIDENT_MATCH"]
            elif len(ranked) >= 2:
                (s0, v0), (s1, v1) = ranked[0], ranked[1]
                if abs(v0 - v1) <= AMBIGUITY_MARGIN and self.sections[s0]["chapter_number"] != self.sections[s1]["chapter_number"]:
                    confidence = "ambiguous"; flags = flags + ["AMBIGUOUS_MULTIPLE_CANDIDATES"]
        results = []
        for sid, sc in ranked[:k]:
            s = self.sections[sid]
            results.append({"section_id": sid, "chapter_number": s["chapter_number"], "section_title": s["title"],
                "score": round(sc, 3), "citation": s["citation"],
                "canonical_text_preview": s["text"][:240] + ("…" if len(s["text"]) > 240 else ""),
                "concept_tags": s["concept_tags"]})
        return {"query": query, "mode": mode, "confidence": confidence, "query_tags": sorted(tags),
                "warning_flags": flags, "implementation_status": "unknown_not_verified_in_this_package",
                "results": results, "primary": results[0] if results else None}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Deterministic local retrieval router for the Atlas Knowledge Edition (no embeddings, no vector DB, no model).")
    ap.add_argument("--package-root", required=True)
    ap.add_argument("--top-k", type=int, default=5)
    ap.add_argument("--json", action="store_true")
    ap.add_argument("query", nargs="+")
    args = ap.parse_args(argv)
    out = AtlasRouter(args.package_root).route(" ".join(args.query), k=args.top_k)
    if args.json:
        print(json.dumps(out, ensure_ascii=False, indent=2)); return 0
    p = out["primary"]
    print(f"Q: {out['query']}\nconfidence: {out['confidence']}  tags: {out['query_tags']}\nflags: {out['warning_flags']}")
    if p:
        print(f"→ §{p['section_id']} (ch {p['chapter_number']}) {p['section_title']}  [score {p['score']}]\n  cite: {p['citation']}")
    else:
        print("→ no confident match")
    return 0


if __name__ == "__main__":
    sys.exit(main())
