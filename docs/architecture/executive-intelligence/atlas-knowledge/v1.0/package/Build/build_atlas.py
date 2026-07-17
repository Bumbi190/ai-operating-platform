#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_atlas.py — reproducible builder for the Atlas Knowledge Edition (Validation Candidate 2).

Reproducible & safe:
  * pathlib + CLI arguments (--workspace-root, --output-dir); NO hardcoded session paths.
  * preflight: verify all input checksums; FAIL CLOSED if a source is missing or has the wrong SHA.
  * writes ONLY under a staging directory inside --output-dir, then atomically finalizes.
  * no git, no network, no dependency installation. Requires the system tool `pdftotext` (poppler),
    presence checked in preflight (not installed by this script).

Usage:
    python3 build_atlas.py --workspace-root "/path/to/executive-intelligence" \
                           --output-dir     "/path/to/executive-intelligence"
    python3 build_atlas.py --help
"""
from __future__ import annotations
import sys
sys.dont_write_bytecode = True  # do not write __pycache__ into the workspace/package
import argparse, json, os, re, hashlib, shutil, subprocess, tempfile, datetime, platform
from pathlib import Path

PKG_NAME = "Executive Intelligence — Atlas Knowledge Edition v1.0 — Validation Candidate 2"
PKG_STATUS = "ATLAS KNOWLEDGE EDITION v1.0 — LOCAL VALIDATION CANDIDATE 2"
CANON_STATUS = "Approved and locked — Canonical v1.0"
NCA = "NON-CANONICAL RETRIEVAL AID"
IMPL = "unknown_not_verified_in_this_package"
CANON_BOOK_SHA = "ee85a1a09968c585530869bcc8d06eda16e4e12a8d5b6f856af362e10fa555b8"
FINAL_PDF_SHA = "b0cbb84eb0a53265bcc03b97c5c780e436489aaacdde1e7092816aa039be6aa2"
DATE = datetime.date.today().isoformat()

REL_CANON_DOCX = "Executive Intelligence — Canonical v1.0/Omnira — Executive Intelligence — Canonical Edition v1.0.docx"
REL_CANON_MANIFEST = "Executive Intelligence — Canonical v1.0/EXECUTIVE_INTELLIGENCE_CANONICAL_MANIFEST.md"
REL_FINAL_PDF = "Executive Intelligence — Professional Edition v1.0/Final Professional Edition/Book/Omnira — Executive Intelligence — Professional Edition v1.0.pdf"
REL_CONTENT_MAP = "Executive Intelligence — Professional Edition v1.0/Production/Source/content_map.json"
REL_PAGEMAP = "Executive Intelligence — Professional Edition v1.0/Final Professional Edition/Source/build_pagemap_final.json"
REL_DIAGRAM_MAP = "Executive Intelligence — Professional Edition v1.0/Production/Source/diagram_source_map.json"
REL_NAV_MAP = "Executive Intelligence — Professional Edition v1.0/Production/Source/navigation_map.json"
REL_DIAGRAMS_PY = "Executive Intelligence — Professional Edition v1.0/Final Professional Edition/Source/diagrams_final.py"


def sha_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


def sha_text(t: str) -> str:
    return hashlib.sha256(t.encode("utf-8")).hexdigest()


def slug(s: str) -> str:
    s = s.lower().replace("&", "and")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# ============================================================ concept / scope derivation
CONCEPTS = [
    ("Human authority", ["human authority", "ultimate authority", "final authority", "human approval",
                          "human oversight", "human review"], "ci"),
    ("Executive Intelligence", ["Executive Intelligence"], "cs"), ("Atlas", ["Atlas"], "cs"),
    ("Portfolio Executive", ["Portfolio Executive"], "ci"), ("Project Executive", ["Project Executive"], "ci"),
    ("Manager", ["Manager"], "cs"), ("Workforce", ["Workforce"], "cs"), ("Memory", ["Memory"], "cs"),
    ("Knowledge", ["Knowledge"], "cs"), ("AI Intelligence", ["AI Intelligence"], "ci"),
    ("Performance Intelligence", ["Performance Intelligence"], "ci"), ("Decision Ledger", ["Decision Ledger"], "ci"),
    ("Executive Mission Brief", ["Mission Brief"], "ci"), ("Approval Inbox", ["Approval Inbox"], "ci"),
    ("Damage Boundary", ["Damage Boundary"], "ci"), ("Governance", ["Governance", "governance"], "ci"),
    ("Policy Engine", ["Policy Engine"], "ci"), ("Trust Score", ["Trust Score"], "ci"),
    ("Autonomy Licensing", ["Autonomy Licens", "Autonomy License", "autonomy license"], "ci"),
    ("L0-L6", [r"\bL[0-6]\b"], "re"), ("Crisis Mode", ["Crisis Mode"], "ci"),
    ("Emergency Brake", ["Emergency Brake", "emergency brake"], "ci"),
    ("project isolation", ["project isolation", "Project Isolation"], "ci"),
    ("founder capacity", ["founder capacity", "Founder Capacity"], "ci"),
    ("lifecycle modes", ["lifecycle mode", "Lifecycle mode", "Hibernate", "Observer", "Archived"], "ci"),
    ("operating modes", ["operating mode", "Operating mode", "Stabilize", "Maintenance mode"], "ci"),
    ("The Prompt", ["The Prompt"], "cs"), ("Familje-Stunden", ["Familje-Stunden"], "cs"),
    ("GainPilot", ["GainPilot"], "cs"), ("Omnira", ["Omnira"], "cs"), ("Stage 1", ["Stage 1"], "cs"),
    ("future target architecture", ["future target", "Future target", "future full autonomy",
                                    "Future Full Autonomy", "future architecture"], "ci"),
]


def concept_hit(pats, mode, text):
    if mode == "cs":
        return any(p in text for p in pats)
    if mode == "ci":
        tl = text.lower(); return any(p.lower() in tl for p in pats)
    return any(re.search(p, text) for p in pats)


def concept_tags(text):
    return [lbl for (lbl, pats, mode) in CONCEPTS if concept_hit(pats, mode, text)]


def project_scope(text):
    out = [p for p in ["Omnira", "The Prompt", "Familje-Stunden", "GainPilot"] if p in text]
    return out or ["canonical_general"]


def authority_scope(text):
    tl = text.lower(); out = []
    if ("human" in tl and ("approv" in tl or "authority" in tl or "oversight" in tl or "review" in tl)) or "founder" in tl:
        out.append("human_authority")
    if "approval" in tl or "approve" in tl: out.append("approval_gate")
    if "governance" in tl or "policy" in tl: out.append("governance_policy")
    if "autonomy" in tl or re.search(r"\bl[0-6]\b", tl) or "license" in tl: out.append("autonomy")
    if "damage boundary" in tl or "damage class" in tl or "damage-class" in tl: out.append("damage_boundary")
    if "crisis" in tl or "emergency brake" in tl: out.append("emergency_control")
    return out or ["informational"]


def maturity_scope(text):
    out = ["canonical_target"]
    if "Stage 1" in text: out.append("stage_1_explicit")
    if "future" in text.lower(): out.append("future_explicit")
    return out


# ============================================================ diagram data (from diagrams_final.py)
# visible_labels and explicit_visual_relations are transcribed from the final diagram build source
# (diagrams_final.py) + the canonical sections it cites. confidence: "explicit" when the diagram carries
# a literal relation label; "structurally_explicit" when the relation is shown by geometry
# (arrow direction, containment, level stack, sequence, feedback loop, side-by-side comparison).
def diagram_definitions(dest):
    def rel(su, pr, ob, rt, ss, conf, note=None):
        d = {"subject": su, "predicate": pr, "object": ob, "relation_type": rt,
             "supporting_section_ids": ss, "provenance": "Final Professional Edition diagrams_final.py + cited canonical sections",
             "confidence": conf}
        if note: d["note"] = note
        return d
    D = []
    D.append(dict(diagram_id="D01", title="Omnira Intelligence Position Model", anchor_chapter=2, chapters=[1, 2],
        canonical_source_section_refs=["Ch 2 §§2.2-2.3"],
        visible_labels=["ULTIMATE AUTHORITY", "Human Founder / Future Omnira Constitution", "LEADERSHIP",
            "Executive Intelligence", "COORDINATION & EXECUTION", "Manager / Workforce / Agents / Workflows",
            "OUTCOMES", "Execution Results", "EXECUTION RESULTS & FEEDBACK — EVIDENCE, NOT AUTHORITY",
            "Performance Intelligence · Memory · Knowledge", "SUPPORTING FUNCTIONS — NOT IN THE AUTHORITY CHAIN",
            "USER-FACING SURFACE", "Atlas communicates", "RESOURCE SELECTION", "AI Intelligence selects resources"],
        explicit_visual_relations=[
            rel("Human Founder / Future Omnira Constitution", "directs", "Executive Intelligence", "authority_flow", ["2.2", "2.3"], "structurally_explicit"),
            rel("Executive Intelligence", "directs", "Manager / Workforce / Agents / Workflows", "authority_flow", ["2.2", "2.3"], "structurally_explicit"),
            rel("Manager / Workforce / Agents / Workflows", "produces", "Execution Results", "sequence", ["2.2", "2.3"], "structurally_explicit"),
            rel("Execution Results & Feedback", "provides_evidence_to", "Executive Intelligence", "feedback_loop", ["2.2", "2.3"], "structurally_explicit", "Gold loop labelled 'EVIDENCE, NOT AUTHORITY'."),
            rel("Atlas", "supports_not_in_authority_chain", "Executive Intelligence", "supporting", ["2.6", "2.7"], "structurally_explicit"),
            rel("AI Intelligence", "supports_not_in_authority_chain", "Executive Intelligence", "supporting", ["2.2"], "structurally_explicit")]))
    D.append(dict(diagram_id="D02", title="Executive · Manager · Workforce", anchor_chapter=3, chapters=[3],
        canonical_source_section_refs=["Ch 3 §3.2"],
        visible_labels=["EXECUTIVE", "= leadership", "MANAGER", "= coordination", "WORKFORCE", "= execution",
            "What matters?", "Why now?", "What should be prioritized?", "What should not be started?",
            "What requires approval?", "What should be delegated?", "What must be escalated?",
            "Who is assigned?", "What is the status?", "What is blocked?", "What is next?",
            "What work must be performed?", "What specialist skill is required?", "What output must be produced?"],
        explicit_visual_relations=[
            rel("EXECUTIVE (leadership)", "compared_with", "MANAGER (coordination)", "compares", ["3.2"], "structurally_explicit"),
            rel("MANAGER (coordination)", "compared_with", "WORKFORCE (execution)", "compares", ["3.2"], "structurally_explicit")]))
    D.append(dict(diagram_id="D03", title="Portfolio Executive vs Project Executive", anchor_chapter=5, chapters=[4, 5],
        canonical_source_section_refs=["Ch 4 §4.4", "Ch 5 §5.4"],
        visible_labels=["PORTFOLIO EXECUTIVE", "governs across projects", "PROJECT EXECUTIVE", "governs one project",
            "Portfolio Scope (§4.5)", "Portfolio Objectives (§4.12)", "Portfolio Prioritization (§4.13)",
            "Cross-Project Dependencies (§4.27)", "Project Identity (§5.7)", "Project Goals (§5.13)",
            "Project Autonomy Licenses (§5.24)", "Project Trust Score (§5.25)", "Directs (§5.53)", "Escalates (§5.52)"],
        explicit_visual_relations=[
            rel("Portfolio Executive", "directs", "Project Executive", "direction", ["5.53"], "explicit", "Literal diagram label 'Directs (§5.53)'."),
            rel("Project Executive", "escalates_to", "Portfolio Executive", "direction", ["5.52"], "explicit", "Literal diagram label 'Escalates (§5.52)'."),
            rel("Portfolio Executive", "compared_with", "Project Executive", "compares", ["4.4", "5.4"], "structurally_explicit")]))
    D.append(dict(diagram_id="D04", title="Project Isolation & Executive Boundaries", anchor_chapter=6, chapters=[6],
        canonical_source_section_refs=["Ch 6 §§6.4–6.8, 6.40–6.43"],
        visible_labels=["Default-Deny Project Isolation (§6.7)", "Explicit Scope Before Action (§6.6) · Scope Envelope (§6.5)",
            "Least Privilege (§6.8) · Authority Narrowing (§6.40)", "Isolated Project (§6.4 Boundary Model)",
            "Cross-project request → denied by default; only via Governed Summaries (§6.42–6.43)"],
        explicit_visual_relations=[
            rel("Default-Deny Project Isolation", "contains", "Explicit Scope Before Action", "containment", ["6.7", "6.6"], "structurally_explicit"),
            rel("Explicit Scope Before Action", "contains", "Least Privilege", "containment", ["6.6", "6.8"], "structurally_explicit"),
            rel("Least Privilege", "contains", "Isolated Project", "containment", ["6.8", "6.4"], "structurally_explicit"),
            rel("Cross-project request", "denied_by_default", "Isolated Project", "denial", ["6.42", "6.43"], "explicit", "Literal diagram label for default-deny; exception only via Governed Summaries.")]))
    D.append(dict(diagram_id="D05", title="Leadership Loop — Executive Operating Cadence", anchor_chapter=7, chapters=[7],
        canonical_source_section_refs=["Ch 7 §7.4, §§7.8–7.70"],
        visible_labels=["Daily Executive Brief (§7.8)", "Weekly Executive Cycle (§7.26)", "Monthly Executive Review (§7.45)",
            "Quarterly Strategic Review (§7.57)", "Annual Direction Review (§7.65)", "Event-Driven Cadence (§7.70)"],
        explicit_visual_relations=[
            rel("Daily Executive Brief", "sequence_step", "Weekly Executive Cycle", "sequence", ["7.8", "7.26"], "structurally_explicit"),
            rel("Weekly Executive Cycle", "sequence_step", "Monthly Executive Review", "sequence", ["7.26", "7.45"], "structurally_explicit"),
            rel("Monthly Executive Review", "sequence_step", "Quarterly Strategic Review", "sequence", ["7.45", "7.57"], "structurally_explicit"),
            rel("Quarterly Strategic Review", "sequence_step", "Annual Direction Review", "sequence", ["7.57", "7.65"], "structurally_explicit"),
            rel("Annual Direction Review", "feedback_loop", "Daily Executive Brief", "feedback_loop", ["7.4"], "structurally_explicit", "Cadence forms a closed leadership loop.")]))
    D.append(dict(diagram_id="D06", title="Decision Lifecycle", anchor_chapter=10, chapters=[10],
        canonical_source_section_refs=["Ch 10 §§10.3–10.85"],
        visible_labels=["Recommendation (§10.3)", "Evidence · Assumptions · Confidence (§§10.13, 10.20, 10.24)",
            "Risk · Alternatives · Opportunity Cost (§§10.27, 10.35, 10.38)", "Authorization (§10.4 · Founder Override §10.60)",
            "Active Decision · Status (§10.57)", "Review Date (§10.45)", "Outcome · Decision Learning (§§10.83, 10.85)"],
        explicit_visual_relations=[
            rel("Recommendation", "sequence_step", "Authorization", "sequence", ["10.3", "10.4"], "structurally_explicit"),
            rel("Authorization", "sequence_step", "Active Decision · Status", "sequence", ["10.4", "10.57"], "structurally_explicit"),
            rel("Active Decision · Status", "sequence_step", "Review Date", "sequence", ["10.57", "10.45"], "structurally_explicit"),
            rel("Review Date", "sequence_step", "Outcome · Decision Learning", "sequence", ["10.45", "10.83"], "structurally_explicit"),
            rel("Outcome · Decision Learning", "feedback_loop", "Recommendation", "feedback_loop", ["10.85"], "explicit", "Literal label 'learning feeds next recommendation (§10.85)'.")]))
    D.append(dict(diagram_id="D07", title="Decision Ledger — Decision Status States", anchor_chapter=11, chapters=[11],
        canonical_source_section_refs=["Ch 11 §§11.48–11.60"],
        visible_labels=["Draft (§11.49)", "Proposed (§11.50)", "Approved (§11.51)", "Active (§11.52)", "Completed (§11.58)",
            "Rejected (§11.53)", "Deferred (§11.54)", "Expired (§11.55)", "Superseded (§11.56)", "Reversed (§11.57)",
            "Immutable History (§11.60)"],
        explicit_visual_relations=[
            rel("Draft", "sequence_step", "Proposed", "sequence", ["11.49", "11.50"], "structurally_explicit"),
            rel("Proposed", "sequence_step", "Approved", "sequence", ["11.50", "11.51"], "structurally_explicit"),
            rel("Approved", "sequence_step", "Active", "sequence", ["11.51", "11.52"], "structurally_explicit"),
            rel("Active", "sequence_step", "Completed", "sequence", ["11.52", "11.58"], "structurally_explicit"),
            rel("Proposed", "state_transition", "Rejected", "state_transition", ["11.53"], "structurally_explicit"),
            rel("Active", "state_transition", "Reversed", "state_transition", ["11.57"], "structurally_explicit")]))
    D.append(dict(diagram_id="D08", title="Prioritization Classes & Opportunity Cost Relationship", anchor_chapter=15, chapters=[14, 15],
        canonical_source_section_refs=["Ch 14 §§14.50–14.55", "Ch 15 §§15.7, 15.110–15.112"],
        visible_labels=["P0 — Immediate Critical (§14.50)", "P1 — Executive Priority (§14.51)", "P2 — Planned Priority (§14.52)",
            "P3 — Prepared Opportunity (§14.53)", "P4 — Parked (§14.54)", "Rejected Work (§14.55)",
            "Chosen Option (§15.111)", "Displaced Best Alternative (§15.112 · §15.7)", "displaces (opportunity cost §15.3)"],
        explicit_visual_relations=[
            rel("Priority Classes P0–P4", "groups", "Prioritization class set (P0,P1,P2,P3,P4,Rejected)", "groups", ["14.50", "14.51", "14.52", "14.53", "14.54", "14.55"], "structurally_explicit"),
            rel("Chosen Option", "displaces", "Displaced Best Alternative", "direction", ["15.111", "15.112", "15.3"], "explicit", "Literal label 'displaces (opportunity cost §15.3)'.")]))
    D.append(dict(diagram_id="D09", title="Governance Layers & Authority Gradient", anchor_chapter=16, chapters=[16],
        canonical_source_section_refs=["Ch 16 §§16.6–16.31"],
        visible_labels=["Constitutional Rules (§16.7)", "Global Omnira Policy (§16.8)", "Portfolio Policy (§16.9)",
            "Project Policy (§16.10)", "Mission Constraints (§16.11)", "Workflow Policy (§16.12)",
            "Tool Permissions (§16.13)", "Task Authority (§16.14)", "precedence & narrowing (§§16.18–16.22)"],
        explicit_visual_relations=[
            rel("Constitutional Rules", "has_precedence_over", "Global Omnira Policy", "level_hierarchy", ["16.7", "16.8"], "structurally_explicit"),
            rel("Global Omnira Policy", "has_precedence_over", "Portfolio Policy", "level_hierarchy", ["16.8", "16.9"], "structurally_explicit"),
            rel("Portfolio Policy", "has_precedence_over", "Project Policy", "level_hierarchy", ["16.9", "16.10"], "structurally_explicit"),
            rel("Project Policy", "has_precedence_over", "Mission Constraints", "level_hierarchy", ["16.10", "16.11"], "structurally_explicit"),
            rel("Mission Constraints", "has_precedence_over", "Workflow Policy", "level_hierarchy", ["16.11", "16.12"], "structurally_explicit"),
            rel("Workflow Policy", "has_precedence_over", "Tool Permissions", "level_hierarchy", ["16.12", "16.13"], "structurally_explicit"),
            rel("Tool Permissions", "has_precedence_over", "Task Authority", "level_hierarchy", ["16.13", "16.14"], "structurally_explicit")]))
    D.append(dict(diagram_id="D10", title="Damage Severity & Boundary States", anchor_chapter=17, chapters=[17],
        canonical_source_section_refs=["Ch 17 §§17.100-17.119"],
        visible_labels=["D0 — Negligible", "D1 — Limited", "D2 — Material", "D3 — Severe", "D4 — Critical or Systemic",
            "Below Boundary", "Near Boundary", "Crosses Boundary", "Prohibited Regardless of Approval",
            "Two distinct canonical classification systems (Ch 17 §§17.100-17.119). No one-to-one mapping is implied."],
        explicit_visual_relations=[
            rel("Damage Severity Classes (D0–D4)", "groups", "Severity scale D0,D1,D2,D3,D4", "groups", ["17.100", "17.119"], "structurally_explicit"),
            rel("Boundary States", "groups", "Below / Near / Crosses / Prohibited", "groups", ["17.100", "17.119"], "structurally_explicit", "Diagram explicitly states NO one-to-one mapping between the two classifications; no cross-mapping relation is created.")]))
    D.append(dict(diagram_id="D11", title="Autonomy Licensing Model", anchor_chapter=18, chapters=[18],
        canonical_source_section_refs=["Ch 18", "Terminology Guide L0–L6"],
        visible_labels=["L0 — Observe", "L1 — Recommend", "L2 — Prepare", "L3 — Execute Internally",
            "L4 — External Low-Risk", "L5 — Conditional Business Autonomy", "L6 — Full Strategic Autonomy",
            "Autonomy is licensed, not assumed — canonical levels L0–L6 (Ch 18; Terminology Guide)."],
        explicit_visual_relations=[
            rel("L0 — Observe", "lower_autonomy_than", "L1 — Recommend", "level_hierarchy", ["18.11", "18.12"], "structurally_explicit"),
            rel("L1 — Recommend", "lower_autonomy_than", "L2 — Prepare", "level_hierarchy", ["18.12", "18.13"], "structurally_explicit"),
            rel("L2 — Prepare", "lower_autonomy_than", "L3 — Execute Internally", "level_hierarchy", ["18.13", "18.14"], "structurally_explicit"),
            rel("L3 — Execute Internally", "lower_autonomy_than", "L4 — External Low-Risk", "level_hierarchy", ["18.14", "18.15"], "structurally_explicit"),
            rel("L4 — External Low-Risk", "lower_autonomy_than", "L5 — Conditional Business Autonomy", "level_hierarchy", ["18.15", "18.16"], "structurally_explicit"),
            rel("L5 — Conditional Business Autonomy", "lower_autonomy_than", "L6 — Full Strategic Autonomy", "level_hierarchy", ["18.16", "18.17"], "structurally_explicit")]))
    D.append(dict(diagram_id="D12", title="Trust Score & Autonomy Progression", anchor_chapter=19, chapters=[19],
        canonical_source_section_refs=["Ch 19", "Terminology Guide L0–L6"],
        visible_labels=["L0 — Observe", "L1 — Recommend", "L2 — Prepare", "L3 — Execute Internally",
            "L4 — External Low-Risk", "L5 — Conditional Business Autonomy", "L6 — Full Strategic Autonomy",
            "Progression is gated by Trust Score & governance — not automatic (Ch 19)."],
        explicit_visual_relations=[
            rel("L0 — Observe", "progresses_to_if_gated", "L1 — Recommend", "sequence", ["19.4"], "structurally_explicit", "Ladder is ascending; progression gated by Trust Score & governance, not automatic."),
            rel("L1 — Recommend", "progresses_to_if_gated", "L2 — Prepare", "sequence", ["19.4"], "structurally_explicit"),
            rel("L2 — Prepare", "progresses_to_if_gated", "L3 — Execute Internally", "sequence", ["19.4"], "structurally_explicit"),
            rel("L3 — Execute Internally", "progresses_to_if_gated", "L4 — External Low-Risk", "sequence", ["19.4"], "structurally_explicit"),
            rel("L4 — External Low-Risk", "progresses_to_if_gated", "L5 — Conditional Business Autonomy", "sequence", ["19.4"], "structurally_explicit"),
            rel("L5 — Conditional Business Autonomy", "progresses_to_if_gated", "L6 — Full Strategic Autonomy", "sequence", ["19.4"], "structurally_explicit")]))
    D.append(dict(diagram_id="D13", title="Executive Mission Delegation Flow", anchor_chapter=21, chapters=[20, 21],
        canonical_source_section_refs=["Ch 21 §§21.6–21.12", "Ch 20 §20.3"],
        visible_labels=["Founder (ultimate authority)", "Executive (§21.7 Founder→Executive)",
            "Manager (§21.8 Executive→Manager · Mission Brief §20.3)", "Workforce (§21.9 Manager→Workforce)",
            "Agent (§21.10 Workforce→Agent)", "Tool (§21.11 Tool-Level)", "Escalated (§21.46) — bounded, two-sided (§21.18)"],
        explicit_visual_relations=[
            rel("Founder", "delegates_to", "Executive", "direction", ["21.7"], "explicit", "Literal label '§21.7 Founder→Executive'."),
            rel("Executive", "delegates_to", "Manager", "direction", ["21.8", "20.3"], "explicit", "Literal label '§21.8 Executive→Manager'; Mission Brief §20.3."),
            rel("Manager", "delegates_to", "Workforce", "direction", ["21.9"], "explicit"),
            rel("Workforce", "delegates_to", "Agent", "direction", ["21.10"], "explicit"),
            rel("Agent", "delegates_to", "Tool", "direction", ["21.11"], "explicit"),
            rel("Tool", "escalates_to", "Founder", "feedback_loop", ["21.46", "21.18"], "explicit", "Escalation is bounded and two-sided.")]))
    D.append(dict(diagram_id="D15", title="Operating Graph vs Intelligence Graph", anchor_chapter=26, chapters=[26],
        canonical_source_section_refs=["Ch 26 §§26.3–26.5, 26.14–26.26, 26.58–26.76"],
        visible_labels=["OPERATING GRAPH (§26.4 · what runs)", "Portfolio → Project → Objective",
            "Mission → Workstream → Workflow", "Task → Role → Agent → Tool", "Action → Execution Result",
            "INTELLIGENCE GRAPH (§26.5 · why it is believed)", "Signal → Evidence → Interpretation",
            "Hypothesis → Recommendation", "Approval → Decision", "Outcome → Review → Learning", "Two Graphs, Not One (§26.3)"],
        explicit_visual_relations=[
            rel("Operating Graph", "compared_with", "Intelligence Graph", "compares", ["26.3", "26.4", "26.5"], "explicit", "Literal label 'Two Graphs, Not One (§26.3)'."),
            rel("Portfolio", "sequence_step", "Project → Objective (operating hierarchy)", "sequence", ["26.15", "26.26"], "structurally_explicit"),
            rel("Signal → Evidence", "sequence_step", "Interpretation → Recommendation (intelligence chain)", "sequence", ["26.58", "26.76"], "structurally_explicit")]))
    D.append(dict(diagram_id="D16", title="Approval Flow — Approval Status Lifecycle", anchor_chapter=27, chapters=[27],
        canonical_source_section_refs=["Ch 27 §§27.43–27.59"],
        visible_labels=["Draft (§27.44)", "Preparing (§27.45)", "Pending (§27.46)", "Approved (§27.51)", "Executed (§27.56)",
            "Needs Evidence (§27.47)", "Needs Revision (§27.48)", "Approved w/ Conditions (§27.52)", "Rejected (§27.53)",
            "Approval is an authority act (§27.3); it is not agreement, review, or silence (§§27.4–27.10)."],
        explicit_visual_relations=[
            rel("Draft", "sequence_step", "Preparing", "sequence", ["27.44", "27.45"], "structurally_explicit"),
            rel("Preparing", "sequence_step", "Pending", "sequence", ["27.45", "27.46"], "structurally_explicit"),
            rel("Pending", "sequence_step", "Approved", "sequence", ["27.46", "27.51"], "structurally_explicit"),
            rel("Approved", "sequence_step", "Executed", "sequence", ["27.51", "27.56"], "structurally_explicit"),
            rel("Pending", "state_transition", "Rejected", "state_transition", ["27.53"], "structurally_explicit")]))
    D.append(dict(diagram_id="D17", title="Crisis Mode & Emergency Brake", anchor_chapter=28, chapters=[28],
        canonical_source_section_refs=["Ch 28 §§28.3–28.5, 28.28–28.32, 28.71–28.73"],
        visible_labels=["C0 — Operational Disturbance (§28.28)", "C1 — Contained Incident (§28.29)",
            "C2 — Material Crisis (§28.30)", "C3 — Severe Crisis (§28.31)", "C4 — Systemic Emergency (§28.32)",
            "Crisis Mode (§28.3)", "Emergency Brake (§28.4)", "Crisis Mode vs Emergency Brake (§28.5)"],
        explicit_visual_relations=[
            rel("C0 — Operational Disturbance", "lower_severity_than", "C1 — Contained Incident", "level_hierarchy", ["28.28", "28.29"], "structurally_explicit"),
            rel("C1 — Contained Incident", "lower_severity_than", "C2 — Material Crisis", "level_hierarchy", ["28.29", "28.30"], "structurally_explicit"),
            rel("C2 — Material Crisis", "lower_severity_than", "C3 — Severe Crisis", "level_hierarchy", ["28.30", "28.31"], "structurally_explicit"),
            rel("C3 — Severe Crisis", "lower_severity_than", "C4 — Systemic Emergency", "level_hierarchy", ["28.31", "28.32"], "structurally_explicit"),
            rel("Crisis Mode", "compared_with", "Emergency Brake", "compares", ["28.3", "28.4", "28.5"], "explicit", "Literal label 'Crisis Mode vs Emergency Brake (§28.5)'.")]))
    D.append(dict(diagram_id="D18", title="Stage 1 vs Future Target Architecture", anchor_chapter=32, chapters=[30, 31, 32],
        canonical_source_section_refs=["Front matter — Implementation Scope"],
        visible_labels=["STAGE 1 · APPROVED INITIAL SCOPE", "Executive Context", "Daily Executive Brief", "Decision Ledger V1",
            "Executive Mission Brief V1", "Explicit human authorization", "Safe Manager & Workforce handoff",
            "Project-scoped status & evidence", "Basic traceability & review", "FUTURE TARGET", "NOT IMPLEMENTED IN STAGE 1",
            "Full Approval Inbox", "Full policy engine", "Damage Boundary engine", "Trust Score", "Autonomy Licensing",
            "Automatic autonomy progression", "Crisis Mode & Emergency Brake", "L4–L6 autonomy"],
        explicit_visual_relations=[
            rel("Stage 1 (Approved Initial Scope)", "compared_with", "Future Target Architecture", "compares", ["FM.2"], "explicit", "Two-column comparison; Stage 1 solid vs Future dashed."),
            rel("Future Target Architecture", "not_implemented_in", "Stage 1", "contrast", ["FM.2"], "explicit", "Literal label 'NOT IMPLEMENTED IN STAGE 1'.")]))
    for d in D:
        d["final_page"] = dest[f"dia_{d['diagram_id']}"]
        d["role_in_retrieval"] = ("Navigational/visual entry point; route to the cited canonical sections for "
                                  "authoritative text. Diagrams are additive presentation, never doctrine.")
        d["source_provenance"] = "Final Professional Edition: diagrams_final.py (build definitions) + build_pagemap_final.json (page) + diagram_source_map.json (canonical sections)."
    return D


# ============================================================ term lexicon (documented)
def term_lexicon():
    return {
        "_note": "Documented deterministic synonym/term lexicon for query_atlas.py. Maps canonical CONCEPT "
                 "phrasings to concept labels, title terms, and canonical ANCHOR sections. These are canonical "
                 "concept anchors (not per-test answers). Weights are documented in the router and routing rules.",
        "weights": {"title_token": 4.0, "title_phrase": 10.0, "lexicon_title_term": 6.0, "lexicon_anchor": 9.0,
                     "concept": 3.0, "project": 4.0, "authority": 2.0, "body_token": 0.25, "body_cap": 2.0,
                     "purpose_penalty": -3.5, "min_confidence": 6.0, "ambiguity_margin": 1.5},
        "entries": [
            {"match_phrases": ["ultimate authority", "final authority", "highest authority", "who has authority", "who decides"],
             "concepts": ["Human authority"], "title_terms": ["authority", "legitimacy"], "anchor_section_ids": ["32.15", "1.10", "19.194"]},
            {"match_phrases": ["raise its own autonomy", "increase its own autonomy", "raise autonomy", "grant itself autonomy", "promote itself", "self-promote", "self promotion", "own autonomy"],
             "concepts": ["L0-L6", "Autonomy Licensing"], "title_terms": ["self-promotion", "promotion", "trust does not transfer"], "anchor_section_ids": ["18.80", "18.247", "18.62"]},
            {"match_phrases": ["stage 1", "stage one", "initial scope"],
             "concepts": ["Stage 1"], "title_terms": ["implementation scope", "scope", "maturity"], "anchor_section_ids": ["FM.2"]},
            {"match_phrases": ["canonical target", "implemented runtime", "canonical vs runtime", "target architecture vs", "difference between canonical", "is it implemented"],
             "concepts": ["future target architecture"], "title_terms": ["canonical doctrine notice"], "anchor_section_ids": ["FM.1"]},
            {"match_phrases": ["recommendation, decision and approval", "recommendation decision approval", "relationship between recommendation", "recommendation vs decision"],
             "concepts": [], "title_terms": ["how to read this book"], "anchor_section_ids": ["FM.3"]},
            {"match_phrases": ["lifecycle mode", "operating mode", "lifecycle and operating"],
             "concepts": ["lifecycle modes", "operating modes"], "title_terms": ["terminology"], "anchor_section_ids": ["FM.4"]},
            {"match_phrases": ["gainpilot"], "concepts": ["GainPilot"], "title_terms": ["gainpilot"], "anchor_section_ids": ["2.26"]},
            {"match_phrases": ["familje-stunden", "familje stunden"], "concepts": ["Familje-Stunden"], "title_terms": ["familje"], "anchor_section_ids": ["2.25"]},
            {"match_phrases": ["the prompt"], "concepts": ["The Prompt"], "title_terms": ["the prompt", "proving ground"], "anchor_section_ids": ["30.1", "1.18"]},
            {"match_phrases": ["decision ledger"], "concepts": ["Decision Ledger"], "title_terms": ["decision ledger"], "anchor_section_ids": []},
            {"match_phrases": ["damage boundary"], "concepts": ["Damage Boundary"], "title_terms": ["damage boundary"], "anchor_section_ids": []},
            {"match_phrases": ["autonomy level", "autonomy levels", "l0-l6", "levels of autonomy", "l0 to l6"],
             "concepts": ["L0-L6"], "title_terms": ["the autonomy levels"], "anchor_section_ids": ["18.10"]},
            {"match_phrases": ["mission brief", "executive mission brief"], "concepts": ["Executive Mission Brief"], "title_terms": ["mission brief"], "anchor_section_ids": ["20.3"]},
            {"match_phrases": ["approval inbox"], "concepts": ["Approval Inbox"], "title_terms": ["approval inbox"], "anchor_section_ids": ["27.1"]},
            {"match_phrases": ["trust score"], "concepts": ["Trust Score"], "title_terms": ["trust score"], "anchor_section_ids": ["19.10"]},
            {"match_phrases": ["crisis mode", "emergency brake"], "concepts": ["Crisis Mode", "Emergency Brake"], "title_terms": ["crisis mode", "emergency brake"], "anchor_section_ids": ["28.3", "28.5"]},
            {"match_phrases": ["project isolation"], "concepts": ["project isolation"], "title_terms": ["project isolation"], "anchor_section_ids": ["2.19", "6.7"]},
            {"match_phrases": ["human approval", "when is approval required", "require approval", "requires approval"],
             "concepts": [], "title_terms": ["require approval", "approval"], "anchor_section_ids": ["16.28", "16.19"]},
            {"match_phrases": ["portfolio executive"], "concepts": ["Portfolio Executive"], "title_terms": ["portfolio executive"], "anchor_section_ids": ["4.6", "4.4"]},
            {"match_phrases": ["project executive"], "concepts": ["Project Executive"], "title_terms": ["project executive"], "anchor_section_ids": ["5.5", "5.4"]},
            {"match_phrases": ["atlas may say", "atlas say but not", "what can atlas do", "atlas but not execute", "say but not automatically"],
             "concepts": ["Atlas"], "title_terms": ["atlas as voice", "voice, executive as judgment"], "anchor_section_ids": ["2.7", "FM.1"]},
            {"match_phrases": ["difference between executive", "executive vs manager", "executive manager workforce", "executive versus workforce"],
             "concepts": [], "title_terms": ["leadership layer", "execution layer"], "anchor_section_ids": ["3.4", "3.6"]},
            {"match_phrases": ["governance", "policy engine"], "concepts": ["Governance", "Policy Engine"], "title_terms": ["governance", "policy"], "anchor_section_ids": ["16.6", "16.1"]},
            {"match_phrases": ["founder capacity", "calendar-aware"], "concepts": ["founder capacity"], "title_terms": ["founder capacity", "capacity"], "anchor_section_ids": ["9.1"]},
            {"match_phrases": ["daily executive brief"], "concepts": [], "title_terms": ["daily", "brief", "snapshot"], "anchor_section_ids": ["8.1"]},
            {"match_phrases": ["decision intelligence"], "concepts": [], "title_terms": ["decision"], "anchor_section_ids": ["10.1"]},
            {"match_phrases": ["future full autonomy", "full autonomy"], "concepts": ["future target architecture"], "title_terms": ["future", "full autonomy"], "anchor_section_ids": ["31.1"]},
        ],
    }


# ============================================================ build core
def build(workspace: Path, staging: Path, log):
    src_docx = workspace / REL_CANON_DOCX
    src_pdf = workspace / REL_FINAL_PDF
    cm = json.load(open(workspace / REL_CONTENT_MAP, encoding="utf-8"))
    pm = json.load(open(workspace / REL_PAGEMAP, encoding="utf-8"))
    nav = json.load(open(workspace / REL_NAV_MAP, encoding="utf-8"))
    dest = pm["dest"]; TOTAL = pm["total_pages"]

    # per-chapter canonical file SHA + range + filename from canonical manifest
    man = open(workspace / REL_CANON_MANIFEST, encoding="utf-8").read()
    chap_file, chap_range, chap_src_sha = {}, {}, {}
    for m in re.finditer(r"^\|\s*(\d+)\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*[\d,]+\s*\|\s*`([0-9a-f]{64})`\s*\|", man, re.M):
        n = int(m.group(1)); chap_file[n] = m.group(2); chap_range[n] = m.group(3).strip(); chap_src_sha[n] = m.group(4)
    assert len(chap_src_sha) == 32

    # section -> page from final PDF
    with tempfile.TemporaryDirectory() as td:
        txt_out = Path(td) / "full.txt"
        subprocess.run(["pdftotext", str(src_pdf), str(txt_out)], check=True)
        pages = open(txt_out, encoding="utf-8", errors="replace").read().split("\f")
    sid_set = {b["id"] for c in cm["chapters"] for b in c["blocks"] if b["t"] == "sec"}
    hdr = re.compile(r"^(\d+\.\d+)\s+\S")
    start_page = {}
    for pidx, page in enumerate(pages, 1):
        for line in page.split("\n"):
            mm = hdr.match(line.strip())
            if mm and mm.group(1) in sid_set and mm.group(1) not in start_page:
                start_page[mm.group(1)] = pidx
    assert len(start_page) == len(sid_set)

    chap_start = {n: dest[f"ch_{n}"] for n in range(1, 33)}
    boundary = sorted([dest[f"ch_{n}"] for n in range(1, 33)] + [v for k, v in dest.items() if k.startswith("part_")])
    def next_b(p):
        for v in boundary:
            if v > p: return v
        return TOTAL + 1
    chap_end = {n: (next_b(chap_start[n]) - 1) if n < 32 else TOTAL for n in range(1, 33)}
    part_of = {}
    for part in nav["parts"]:
        for ch in part["chapters"]:
            part_of[ch] = part

    HS = {"canonical_book_sha256": CANON_BOOK_SHA}  # constant

    sections, blocks, fm_out, chapters_meta = [], [], [], []
    ordinal = 0
    fm_page = ["fm_doctrine", "fm_scope", "fm_howto", "fm_terms"]
    for i, s in enumerate(cm["front_matter"]["sections"], 1):
        heading = s["heading"]; fm_sid = f"FM.{i}"
        fm_text = "\n".join(b["text"] for b in s["blocks"])
        for b in s["blocks"]:
            ordinal += 1
            blocks.append({"block_id": f"AKE2-B-{ordinal:06d}", "ordinal": ordinal, "chapter_number": "front_matter",
                           "section_id": fm_sid, "block_type": b["t"], "exact_text": b["text"],
                           "canonical_book_sha256": CANON_BOOK_SHA, "canonical_source_file_sha256": None,
                           "block_text_sha256": sha_text(b["text"]), "record_text_sha256": sha_text(b["text"]),
                           "source_reference": f"Canonical v1.0 · Front Matter · {heading}"})
        pg = dest.get(fm_page[i - 1], 3)
        fm_out.append({"knowledge_id": f"AKE2-FM-{i}", "front_matter_section": i, "section_id": fm_sid, "heading": heading,
                       "canonical_text": fm_text, "block_types": [b["t"] for b in s["blocks"]], "n_blocks": len(s["blocks"]),
                       "canonical_book_sha256": CANON_BOOK_SHA, "canonical_source_file_sha256": None,
                       "record_text_sha256": sha_text(fm_text), "section_text_sha256": sha_text(fm_text),
                       "canonical_status": CANON_STATUS, "professional_edition_page_start": pg, "professional_edition_page_end": min(pg + 1, 6),
                       "source_type": "canonical_front_matter", "concept_tags": concept_tags(fm_text),
                       "citation_label": f"Omnira — Executive Intelligence — Canonical v1.0 · Front Matter · {heading} · Professional Edition p.3–6"})

    for c in cm["chapters"]:
        n = c["num"]; ctitle = c["title"]; csha = chap_src_sha[n]; sec_ids = []
        cur = cur_title = None; buf = []
        def flush():
            nonlocal cur, cur_title, buf
            if cur is None: return
            body = "\n".join(buf); ps = start_page[cur]
            sections.append({"knowledge_id": f"AKE2-EI-{cur}", "chapter_number": n, "chapter_title": ctitle,
                "section_id": cur, "section_title": cur_title, "canonical_text": body,
                "canonical_book_sha256": CANON_BOOK_SHA, "canonical_source_file_sha256": csha,
                "record_text_sha256": sha_text(body), "section_text_sha256": sha_text(body),
                "canonical_status": CANON_STATUS, "professional_edition_page_start": ps, "professional_edition_page_end": ps,
                "source_type": "canonical_section", "project_scope": project_scope(cur_title + "\n" + body),
                "authority_scope": authority_scope(cur_title + "\n" + body), "maturity_scope": maturity_scope(cur_title + "\n" + body),
                "stage_1_relevance": "explicit" if "Stage 1" in (cur_title + body) else "not_explicit_in_section",
                "implementation_status": IMPL, "concept_tags": concept_tags(cur_title + "\n" + body),
                "explicit_related_section_ids": [],
                "explicit_related_chapters": sorted(set(int(x) for x in re.findall(r"Chapter (\d+)", body))),
                "citation_label": ""})
            cur = cur_title = None; buf = []
        for b in c["blocks"]:
            ordinal += 1
            if b["t"] == "sec":
                flush(); cur = b["id"]; cur_title = b["text"][len(b["id"]):].strip(); buf = []; sec_ids.append(b["id"]); sfb = b["id"]
            else:
                buf.append(b["text"]); sfb = cur
            blocks.append({"block_id": f"AKE2-B-{ordinal:06d}", "ordinal": ordinal, "chapter_number": n,
                           "section_id": sfb, "block_type": b["t"], "exact_text": b["text"],
                           "canonical_book_sha256": CANON_BOOK_SHA, "canonical_source_file_sha256": csha,
                           "block_text_sha256": sha_text(b["text"]), "record_text_sha256": sha_text(b["text"]),
                           "source_reference": f"Canonical v1.0 · Ch{n} §{sfb}"})
        flush()
        chapters_meta.append({"num": n, "title": ctitle, "slug": slug(ctitle), "full_title": f"Chapter {n} — {ctitle}",
            "canonical_book_sha256": CANON_BOOK_SHA, "canonical_source_file_sha256": csha, "canonical_source_file": chap_file[n],
            "section_range": chap_range[n], "n_sections": c["n_sections"], "n_blocks": c["n_blocks"],
            "page_start": chap_start[n], "page_end": chap_end[n], "part": part_of[n]["part"], "part_num": part_of[n]["num"],
            "part_title": part_of[n]["title"], "section_ids": sec_ids})

    # section page_end + citation
    by_ch = {}
    for s in sections:
        by_ch.setdefault(s["chapter_number"], []).append(s)
    for n, lst in by_ch.items():
        for i, s in enumerate(lst):
            if i + 1 < len(lst):
                s["professional_edition_page_end"] = min(max(lst[i + 1]["professional_edition_page_start"], s["professional_edition_page_start"]), chap_end[n])
            else:
                s["professional_edition_page_end"] = chap_end[n]
            a, b2 = s["professional_edition_page_start"], s["professional_edition_page_end"]
            pg = f"p.{a}" if a == b2 else f"p.{a}–{b2}"
            s["citation_label"] = f"Omnira — Executive Intelligence — Canonical v1.0 · Ch {n} §{s['section_id']} · {s['section_title']} · Professional Edition {pg}"

    assert len(sections) == 6705 and len(blocks) == 55840 and len(fm_out) == 4

    # ---------- write files ----------
    def w(rel, text):
        p = staging / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text, encoding="utf-8"); return p
    def wj(rel, obj): return w(rel, json.dumps(obj, ensure_ascii=False, indent=2) + "\n")
    def wl(rel, recs): return w(rel, "\n".join(json.dumps(r, ensure_ascii=False) for r in recs) + "\n")

    wl("01_Canonical_Knowledge/executive-intelligence-sections.jsonl", sections)
    wl("01_Canonical_Knowledge/executive-intelligence-blocks.jsonl", blocks)
    wl("01_Canonical_Knowledge/front-matter.jsonl", fm_out)

    for cmeta in chapters_meta:
        n = cmeta["num"]; secs = [s for s in sections if s["chapter_number"] == n]
        md = [f"# {cmeta['full_title']}", "", "## Metadata", "",
              f"- chapter_number: {n}", f"- canonical_title: {cmeta['full_title']}", f"- canonical_status: {CANON_STATUS}",
              f"- canonical_source_file: {cmeta['canonical_source_file']}",
              f"- canonical_source_file_sha256: {cmeta['canonical_source_file_sha256']}",
              f"- canonical_book_sha256: {CANON_BOOK_SHA}",
              f"- professional_edition_page_range: p.{cmeta['page_start']}–{cmeta['page_end']}",
              f"- navigational_part ({NCA}): Part {cmeta['part']} — {cmeta['part_title']}",
              f"- section_count: {cmeta['n_sections']}", f"- section_id_range: {cmeta['section_range']}",
              f"- section_ids: {', '.join(cmeta['section_ids'])}", f"- implementation_status: {IMPL}", "",
              "Hash schema: `canonical_book_sha256` = the compiled canonical book; `canonical_source_file_sha256` = "
              "this chapter's separate canonical source file. Metadata is descriptive provenance; the text below the "
              "separator is exact canonical text (whitespace normalized only; no rewriting, no summaries).", "",
              "---", "", "## Canonical Text", ""]
        for s in secs:
            md.append(f"### {s['section_id']} {s['section_title']}"); md.append("")
            if s["canonical_text"].strip():
                md.append(s["canonical_text"]); md.append("")
        fn = f"chapter-{n:02d}-{cmeta['slug']}.md"
        w(f"01_Canonical_Knowledge/Chapters/{fn}", "\n".join(md).rstrip() + "\n"); cmeta["md_file"] = fn

    # ---- indexes
    wj("02_Indexes/chapter-index.json", {"_note": NCA + " — navigational summaries are descriptive, not doctrine.",
        "canonical_status": CANON_STATUS, "n_chapters": 32, "n_parts": 10, "parts": nav["parts"],
        "hash_schema": {"canonical_book_sha256": CANON_BOOK_SHA, "per_chapter": "canonical_source_file_sha256"},
        "chapters": [{"chapter_number": c["num"], "canonical_title": c["full_title"], "part": c["part"], "part_title": c["part_title"],
            "page_start": c["page_start"], "page_end": c["page_end"], "section_count": c["n_sections"], "block_count": c["n_blocks"],
            "section_id_range": c["section_range"], "canonical_source_file_sha256": c["canonical_source_file_sha256"],
            "canonical_book_sha256": CANON_BOOK_SHA, "chapter_file": c["md_file"],
            "navigational_summary": f"[{NCA}] {c['full_title']} (Part {c['part']}, {c['part_title']})."} for c in chapters_meta]})

    wj("02_Indexes/section-index.json", {"_note": NCA + " — stable section-ID lookup; canonical text in the JSONL.",
        "canonical_status": CANON_STATUS, "n_sections": len(sections),
        "sections": {s["section_id"]: {"knowledge_id": s["knowledge_id"], "chapter_number": s["chapter_number"],
            "section_title": s["section_title"], "page_start": s["professional_edition_page_start"],
            "page_end": s["professional_edition_page_end"], "citation_label": s["citation_label"]} for s in sections}})

    concept_index = {"_note": NCA + " — concept postings by deterministic keyword match; evidence, not doctrine, not implementation status.",
                     "canonical_status": CANON_STATUS, "concepts": {}}
    for (lbl, pats, mode) in CONCEPTS:
        hits = [s["section_id"] for s in sections if lbl in s["concept_tags"]]
        concept_index["concepts"][lbl] = {"match_patterns": pats, "match_mode": mode, "section_count": len(hits), "section_ids": hits}
    wj("02_Indexes/concept-index.json", concept_index)

    wj("02_Indexes/project-index.json", {"_note": NCA + " — sections explicitly naming each project.", "canonical_status": CANON_STATUS,
        "projects": {p: {"section_count": len([s for s in sections if p in s["project_scope"]]),
                         "section_ids": [s["section_id"] for s in sections if p in s["project_scope"]]}
                     for p in ["Omnira", "The Prompt", "Familje-Stunden", "GainPilot"]}})

    auth_classes = ["human_authority", "approval_gate", "governance_policy", "autonomy", "damage_boundary", "emergency_control"]
    wj("02_Indexes/authority-index.json", {"_note": NCA + " — sections by authority class (keyword-derived). Knowledge grants no execution authority.",
        "canonical_status": CANON_STATUS, "authority_classes": {a: {"section_count": len([s for s in sections if a in s["authority_scope"]]),
            "section_ids": [s["section_id"] for s in sections if a in s["authority_scope"]]} for a in auth_classes}})

    gov_terms = {"Governance": ["governance"], "Policy Engine": ["policy engine", "policy"], "Damage Boundary": ["damage boundary"],
                 "Approval": ["approval", "approve"], "Policy Violations & Severity": ["violation", "severity"], "Trust Score": ["trust score"]}
    wj("02_Indexes/governance-index.json", {"_note": NCA + " — governance/policy/authority postings.", "canonical_status": CANON_STATUS,
        "topics": {k: {"section_count": len([s for s in sections if any(p in (s["section_title"] + s["canonical_text"]).lower() for p in pats)]),
                       "section_ids": [s["section_id"] for s in sections if any(p in (s["section_title"] + s["canonical_text"]).lower() for p in pats)]}
                   for k, pats in gov_terms.items()}})

    stage_hits = [s["section_id"] for s in sections if s["stage_1_relevance"] == "explicit"]
    wj("02_Indexes/stage-1-index.json", {"_note": NCA + " — sections mentioning 'Stage 1'. Authoritative scope: Front Matter §FM.2.",
        "canonical_status": CANON_STATUS, "authoritative_scope_source": {"section_id": "FM.2", "heading": "Implementation Scope and Maturity",
            "citation": fm_out[1]["citation_label"]}, "stage_1_explicit_sections": {"section_count": len(stage_hits), "section_ids": stage_hits}})

    wj("02_Indexes/lifecycle-and-operating-modes-index.json", {"_note": NCA + " — lifecycle/operating mode postings. Terminology: Front Matter §FM.4.",
        "canonical_status": CANON_STATUS, "lifecycle_modes_terminology": ["Active", "Observer", "Hibernate", "Archived"],
        "operating_modes_terminology": ["Build", "Growth", "Stabilize", "Learning", "Maintenance", "Crisis"],
        "lifecycle_sections": {"section_count": len([s for s in sections if "lifecycle modes" in s["concept_tags"]]),
                               "section_ids": [s["section_id"] for s in sections if "lifecycle modes" in s["concept_tags"]]},
        "operating_mode_sections": {"section_count": len([s for s in sections if "operating modes" in s["concept_tags"]]),
                                    "section_ids": [s["section_id"] for s in sections if "operating modes" in s["concept_tags"]]}})

    L = {f"L{i}": sid for i, sid in zip(range(7), ["18.11", "18.12", "18.13", "18.14", "18.15", "18.16", "18.17"])}
    wj("02_Indexes/autonomy-index.json", {"_note": NCA + " — autonomy licensing, L0–L6, trust score. Autonomy is never self-granted (§18.80, §18.62).",
        "canonical_status": CANON_STATUS, "autonomy_levels": {lv: {"section_id": sid,
            "section_title": next(s["section_title"] for s in sections if s["section_id"] == sid),
            "citation": next(s["citation_label"] for s in sections if s["section_id"] == sid)} for lv, sid in L.items()},
        "level_overview_section": "18.10", "no_self_promotion_sections": ["18.80", "18.247", "18.62"],
        "autonomy_sections": {"section_count": len([s for s in sections if "autonomy" in s["authority_scope"]]),
                              "section_ids": [s["section_id"] for s in sections if "autonomy" in s["authority_scope"]]}})

    da = {"Decision Intelligence": (10, ["decision"]), "Decision Ledger": (11, ["decision ledger"]),
          "Executive Mission Brief": (20, ["mission brief"]), "Approval Inbox": (27, ["approval inbox"]),
          "Recommendation": (None, ["recommendation", "recommend"])}
    wj("02_Indexes/decision-and-approval-index.json", {"_note": NCA + " — decision/approval/mission postings. Object separation doctrine: Front Matter §FM.3.",
        "canonical_status": CANON_STATUS, "object_separation_source": {"section_id": "FM.3", "heading": "How to Read This Book", "citation": fm_out[2]["citation_label"]},
        "topics": {k: {"primary_chapter": ch, "section_count": len([s for s in sections if any(p in (s["section_title"] + s["canonical_text"]).lower() for p in pats)]),
                       "section_ids": [s["section_id"] for s in sections if any(p in (s["section_title"] + s["canonical_text"]).lower() for p in pats)]}
                   for k, (ch, pats) in da.items()}})

    # diagram index (complete: visible_labels + explicit_visual_relations)
    diagrams = diagram_definitions(dest)
    assert len(diagrams) == 17 and all(d["diagram_id"] != "D14" for d in diagrams)
    sid_all = {s["section_id"] for s in sections} | {f["section_id"] for f in fm_out}
    for d in diagrams:
        for r in d["explicit_visual_relations"]:
            for ss in r["supporting_section_ids"]:
                assert ss in sid_all, f"diagram {d['diagram_id']} bad supporting section {ss}"
            assert r["confidence"] in ("explicit", "structurally_explicit")
    wj("02_Indexes/diagram-index.json", {"_note": NCA + " — 17 final diagrams with real visible labels and structured, explicitly-supported "
        "visual relations. Diagrams are additive presentation derived from canonical sections; never doctrine. The historical "
        "withdrawn integration diagram (between D13 and D15) is intentionally excluded and not imported.",
        "canonical_status": CANON_STATUS, "active_diagram_count": 17, "excluded_note": "The withdrawn integration diagram is not imported as an active diagram.",
        "relation_types_used": sorted({r["relation_type"] for d in diagrams for r in d["explicit_visual_relations"]}),
        "diagrams": diagrams})

    # relationships
    rels = []; rid = 0
    def add(su, pr, ob, ss, ref, prov, conf, canonical):
        nonlocal rid; rid += 1
        rels.append({"relationship_id": f"AKE2-REL-{rid:04d}", "subject": su, "predicate": pr, "object": ob,
                     "supporting_section_ids": ss, "supporting_source_reference": ref, "provenance_type": prov,
                     "confidence": conf, "canonical": canonical})
    for part in nav["parts"]:
        for ch in part["chapters"]:
            add(f"Part {part['part']} — {part['title']}", "part_contains_chapter", f"Chapter {ch}", [],
                "Final Professional Edition navigation_map.json (non-canonical navigational grouping)", "structurally_explicit", "structurally_explicit", False)
    for d in diagrams:
        add(f"Chapter {d['anchor_chapter']}", "chapter_anchors_diagram", d["diagram_id"], [],
            "Final Professional Edition diagram_source_map.json + build_pagemap_final.json", "structurally_explicit", "structurally_explicit", False)
        add(d["diagram_id"], "diagram_derived_from_sections", "; ".join(d["canonical_source_section_refs"]), [],
            "Final Professional Edition diagram_source_map.json", "structurally_explicit", "structurally_explicit", False)
    text_refs = [("2.1", "Chapter 1"), ("11.46", "Chapter 12"), ("11.106", "Chapter 12"), ("16.145", "Chapter 29"),
                 ("18.119", "Chapter 19"), ("30.199", "Chapter 29"), ("FM.3", "Chapter 32")]
    cite_by = {s["section_id"]: s["citation_label"] for s in sections}; cite_by["FM.3"] = fm_out[2]["citation_label"]
    for sid, obj in text_refs:
        add(f"§{sid}", "references_chapter", obj, [sid], "Canonical v1.0 — " + cite_by[sid], "explicit", "explicit", True)
    wl("03_Relationships/explicit-relationships.jsonl", rels)
    wl("03_Relationships/section-links.jsonl", [{"link_id": f"AKE2-LNK-{i+1:03d}", "from_section_id": sid,
        "to_chapter": int(obj.split()[1]), "link_type": "explicit_textual_reference", "provenance_type": "explicit",
        "confidence": "explicit", "supporting_source_reference": "Canonical v1.0 — " + cite_by[sid]} for i, (sid, obj) in enumerate(text_refs)])
    wj("03_Relationships/chapter-dependencies.json", {"_note": NCA + " — parts & diagram anchoring are Professional Edition structural layers; "
        "only textual references are canonical. No semantic doctrine dependencies synthesized.", "canonical_status": CANON_STATUS,
        "chapters": [{"chapter_number": c["num"], "part": c["part"], "part_title": c["part_title"],
            "diagrams": [d["diagram_id"] for d in diagrams if d["anchor_chapter"] == c["num"]],
            "explicit_outgoing_chapter_references": sorted(set(int(obj.split()[1]) for (sid, obj) in text_refs
                if sid in cite_by and not sid.startswith("FM") and next((s for s in sections if s["section_id"] == sid), {}).get("chapter_number") == c["num"]))}
            for c in chapters_meta], "front_matter_references": [{"from": "FM.3", "to_chapter": 32, "provenance": "explicit"}]})

    # term lexicon
    wj("05_Retrieval/term-lexicon.json", term_lexicon())

    log["counts"] = {"sections": len(sections), "blocks": len(blocks), "fm": len(fm_out), "diagrams": len(diagrams),
                     "relationships": len(rels), "chapters": 32}
    log["chapters_meta"] = chapters_meta
    log["fm_out"] = fm_out
    log["diagrams"] = diagrams
    log["rels"] = rels
    log["chap_src_sha"] = chap_src_sha
    return sections, blocks, fm_out, chapters_meta, diagrams, rels


ABS_RULES = """- Canonical target architecture is not the same as implemented runtime.
- Repository, schema, runtime, and deployment are authoritative for what is actually implemented.
- Documents, Memory, Knowledge, graph objects, or model outputs never create authority.
- Human authority, governance, approval gates, and project isolation still apply.
- A recommendation does not automatically become a decision.
- A decision does not automatically become an approval.
- An approval does not automatically become reusable policy or autonomy.
- Knowledge is evidence and context, not execution authority.
- The Atlas Knowledge Edition never grants Atlas the right to act outside existing runtime authority."""

HASH_SCHEMA_DOC = f"""Hash schema (one meaning per field, identical for chapters and front matter):
- `canonical_book_sha256` — ALWAYS the compiled canonical book: `{CANON_BOOK_SHA}`.
- `canonical_source_file_sha256` — the chapter's separate canonical source-file SHA-256; `null` for front matter
  (front matter has no separate source file).
- `record_text_sha256` — SHA-256 of this record's exact canonical text.
- `section_text_sha256` (sections) / `block_text_sha256` (blocks) — documented aliases of `record_text_sha256`.
The ambiguous field `canonical_sha256` from Candidate 1 is removed."""


def write_docs(staging: Path, fm_out, diagrams, workspace: Path):
    def w(rel, text):
        p = staging / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text, encoding="utf-8")
    def wj(rel, obj): w(rel, json.dumps(obj, ensure_ascii=False, indent=2) + "\n")

    # 04 governance
    w("04_Governance/KNOWLEDGE_AUTHORITY_RULES.md", f"""# Knowledge Authority Rules — {PKG_STATUS}

Canonical input status: {CANON_STATUS}

## Absolute knowledge rules (binding)

{ABS_RULES}

The Atlas Knowledge Edition is a machine-readable, traceable, retrieval-optimized representation of the
locked Canonical v1.0 text. It is not a new book and not new doctrine. It grants no execution authority.
Embeddings and vector ingestion are out of scope here; they occur later in the Omnira repository.
""")
    w("04_Governance/CANONICAL_VS_RUNTIME.md", f"""# Canonical Target vs Implemented Runtime — {PKG_STATUS}

Canonical doctrine describes the canonical TARGET architecture; it does not assert runtime existence.
Every canonical section carries `implementation_status: {IMPL}`. Repository, schema, runtime, and
deployment are authoritative for what is implemented. The statuses `implemented`, `partially_implemented`,
and `deprecated` are not used anywhere in this package.

Canonical anchor: {fm_out[0]['citation_label']}
""")
    w("04_Governance/HUMAN_AUTHORITY_AND_APPROVAL.md", f"""# Human Authority and Approval — {PKG_STATUS}

Human authority, governance, approval gates, and project isolation always apply. Knowledge is evidence,
never execution authority. A recommendation is not a decision; a decision is not an approval; an approval
is not reusable policy or autonomy. Autonomy is never self-granted (§18.80, §18.247, §18.62).

Anchors: ultimate/founder authority §32.15, §1.10, §19.194; object separation {fm_out[2]['citation_label']};
approval required §16.28, §16.19.
""")
    w("04_Governance/PROJECT_SCOPE_AND_ISOLATION.md", f"""# Project Scope and Isolation — {PKG_STATUS}

Project isolation is an executive requirement, not only technical. Executive scope, ledger entries, licenses,
and approvals are project-scoped; knowledge about one project transfers no authority to another.

Anchors: §2.19, Chapter 6 (default-deny §6.7), §6.35, §5.4. Projects: Omnira, The Prompt, Familje-Stunden, GainPilot.
""")
    w("04_Governance/ATLAS_RETRIEVAL_RULES.md", f"""# Atlas Retrieval Rules — {PKG_STATUS}

Atlas may find, quote, and cite canonical doctrine. Atlas may NOT treat retrieved content as permission to act.

1. Return canonical text + `citation_label` for every answer.
2. Keep `{NCA}` summaries separate from canonical text.
3. Attach `implementation_status: {IMPL}` to any capability description.
4. Emit authority/external-action/autonomy/approval warning flags (see ../05_Retrieval/query-routing-rules.md).
5. Route authority/approval/autonomy/external-action questions back to human authority and existing runtime authority.

## Absolute knowledge rules

{ABS_RULES}
""")

    # 05 retrieval
    auth_classes = ["human_authority", "approval_gate", "governance_policy", "autonomy", "damage_boundary", "emergency_control"]
    wj("05_Retrieval/retrieval-schema.json", {
        "schema_version": "2.0", "package_status": PKG_STATUS,
        "_note": "Documented retrieval contract. A real deterministic local router (Build/query_atlas.py) implements it. "
                 "No embeddings, no vector database, no model. Ingestion occurs later in the Omnira repository.",
        "hash_schema": {"canonical_book_sha256": {"meaning": "compiled canonical book", "value": CANON_BOOK_SHA, "applies_to": "all records"},
                         "canonical_source_file_sha256": {"meaning": "chapter source-file SHA; null for front matter", "applies_to": "sections, blocks, chapters"},
                         "record_text_sha256": {"meaning": "SHA-256 of this record's exact canonical text", "applies_to": "all records"},
                         "section_text_sha256": {"meaning": "alias of record_text_sha256", "applies_to": "sections"},
                         "block_text_sha256": {"meaning": "alias of record_text_sha256", "applies_to": "blocks"},
                         "removed": ["canonical_sha256 (ambiguous; removed in Candidate 2)"]},
        "record_types": {"section": {"file": "01_Canonical_Knowledge/executive-intelligence-sections.jsonl", "key": "section_id"},
                         "block": {"file": "01_Canonical_Knowledge/executive-intelligence-blocks.jsonl", "key": "block_id"},
                         "front_matter": {"file": "01_Canonical_Knowledge/front-matter.jsonl", "key": "section_id"}},
        "router": {"implementation": "Build/query_atlas.py", "type": "deterministic_token_phrase_scoring",
                   "term_lexicon": "05_Retrieval/term-lexicon.json", "embeddings": False, "vector_database": False, "model": False},
        "query_capabilities": {"by_section_id": "02_Indexes/section-index.json", "by_chapter": "02_Indexes/chapter-index.json",
            "by_concept": "02_Indexes/concept-index.json", "by_project": "02_Indexes/project-index.json",
            "by_authority_class": {"index": "02_Indexes/authority-index.json", "classes": auth_classes},
            "by_stage_or_future_scope": "02_Indexes/stage-1-index.json", "by_lifecycle_operating": "02_Indexes/lifecycle-and-operating-modes-index.json",
            "by_diagram": "02_Indexes/diagram-index.json"},
        "response_contract": {"must_return_canonical_text": True, "must_return_citation": True,
            "navigational_aids_returned_separately": True, "must_attach_implementation_status": IMPL,
            "warning_flags_reference": "05_Retrieval/query-routing-rules.md"},
        "prohibited_in_this_phase": ["embeddings", "vector_database", "repo_ingestion", "execution_grants"]})

    w("05_Retrieval/query-routing-rules.md", f"""# Query Routing Rules (deterministic) — {PKG_STATUS}

Implemented by `Build/query_atlas.py`. Deterministic token/phrase scoring over the indexes and the
documented term lexicon (`term-lexicon.json`). No embeddings, no vector DB, no model.

## Scoring weights

| Signal | Weight |
|---|---|
| query token in section TITLE | 4.0 each |
| concept phrase present in title | 10.0 |
| lexicon title-term in title | 6.0 |
| lexicon canonical anchor section | 9.0 |
| concept-index posting membership | 3.0 |
| project-index posting membership | 4.0 |
| authority-class alignment | 2.0 |
| query token in body (≥4 chars) | 0.25 each (cap 2.0) |
| chapter target boost | 3.0 |
| "Purpose of This Chapter" (non-purpose query) | −3.5 |

Exact section-ID (e.g. `18.80`, `FM.2`) short-circuits to that record. Ties break by canonical order.
`min_confidence = 6.0` → `no_confident_match`; top-2 within `1.5` across different chapters → `ambiguous`.

## Warning-flag rules

| Query tag | Flag |
|---|---|
| always | `IMPLEMENTATION_STATUS_UNVERIFIED` |
| authority | `AUTHORITY_QUERY_HUMAN_OVERSIGHT_REQUIRED` |
| external_action | `EXTERNAL_ACTION_NOT_EXECUTION_AUTHORITY` |
| autonomy | `AUTONOMY_NOT_SELF_GRANTED` |
| approval | `APPROVAL_GATE_APPLIES` |
| maturity | `CANONICAL_TARGET_NOT_CONFIRMED_IMPLEMENTED` |
| stage_scope | `STAGE_SCOPE_IS_ARCHITECTURAL_TARGET` |
| emergency | `EMERGENCY_CONTROL_HUMAN_GOVERNED` |
| knowledge_evidence | `KNOWLEDGE_IS_EVIDENCE_NOT_EXECUTION_AUTHORITY` |
""")
    w("05_Retrieval/citation-format.md", f"""# Citation Format — {PKG_STATUS}

```
Omnira — Executive Intelligence — Canonical v1.0 · Ch <n> §<section_id> · <section_title> · Professional Edition p.<start>[–<end>]
```
Front matter: `… · Front Matter · <heading> · Professional Edition p.3–6`.

- canonical_book_sha256: `{CANON_BOOK_SHA}`
- Final Professional Edition SHA-256: `{FINAL_PDF_SHA}`
""")

    # 06 source references
    def sf(rel):
        return sha_file(workspace / rel)
    wj("06_Source_References/source-map.json", {"_note": "All sources are READ-ONLY; not modified, not copied elsewhere.",
        "package_status": PKG_STATUS,
        "hash_schema": {"canonical_book_sha256": CANON_BOOK_SHA, "note": HASH_SCHEMA_DOC},
        "read_only_sources": {
            "canonical_book_docx": {"path": REL_CANON_DOCX, "sha256": sf(REL_CANON_DOCX)},
            "final_professional_edition_pdf": {"path": REL_FINAL_PDF, "sha256": sf(REL_FINAL_PDF)},
            "content_map_json": {"path": REL_CONTENT_MAP, "sha256": sf(REL_CONTENT_MAP)},
            "build_pagemap_final_json": {"path": REL_PAGEMAP, "sha256": sf(REL_PAGEMAP)},
            "diagram_source_map_json": {"path": REL_DIAGRAM_MAP, "sha256": sf(REL_DIAGRAM_MAP)},
            "navigation_map_json": {"path": REL_NAV_MAP, "sha256": sf(REL_NAV_MAP)},
            "diagrams_final_py": {"path": REL_DIAGRAMS_PY, "sha256": sf(REL_DIAGRAMS_PY)}},
        "protected_but_untouched": ["Candidate v1", "Production Candidate v2", "Production Candidate v3", "Proof v1", "Proof v2",
                                    "Correction Proof", "Design References", "Atlas Knowledge Edition v1.0 (Candidate 1)", "prior reports/manifests/renders"]})
    pm = json.load(open(workspace / REL_PAGEMAP, encoding="utf-8"))
    w("06_Source_References/canonical-source-reference.md", f"""# Canonical Source Reference — {PKG_STATUS}

- Title: Omnira — Executive Intelligence — Canonical Architecture and Operating Doctrine · v1.0 — {CANON_STATUS}
- canonical_book_sha256: `{CANON_BOOK_SHA}`
- 32 chapters · 6705 section IDs · 4 front-matter sections
- Per-chapter `canonical_source_file_sha256` values are in `source-map` derivation and chapter metadata.

{HASH_SCHEMA_DOC}
""")
    w("06_Source_References/professional-edition-reference.md", f"""# Final Professional Edition Reference — {PKG_STATUS}

- File: Omnira — Executive Intelligence — Professional Edition v1.0.pdf · SHA-256 `{FINAL_PDF_SHA}`
- {pm['total_pages']} pages · 32 chapters · 10 Parts · 17 active diagrams
- Diagram visible labels and visual relations are transcribed from `diagrams_final.py`.
- The withdrawn integration diagram is excluded from the active edition.
""")


# ============================================================ fixtures + runner
def make_fixtures(sections, fm_out):
    def titled(phrase, chap=None):
        return [s["section_id"] for s in sections if phrase.lower() in s["section_title"].lower() and (chap is None or s["chapter_number"] == chap)]
    F = []
    def add(tid, q, ttype, accept=None, chapter=None, must=None, forbid=None, conf=None):
        F.append({"test_id": tid, "query": q, "test_type": ttype, "acceptable_primary_ids": accept,
                  "expected_chapter": chapter, "must_flags": must or [], "forbid_flags": forbid or [], "expect_confidence": conf})
    # core doctrinal queries. Anchored/front-matter/authority queries use acceptable-id sets; chapter-home
    # topic queries use "chapter_topic" (primary must be in the home chapter AND must NOT be "Purpose of This
    # Chapter" — enforcing the Candidate-2 requirement that broad queries route to a precise definitional section).
    add("AKE2-T-001", "Who has ultimate authority?", "authority", ["32.15", "1.10", "19.194", "3.26"], None, ["AUTHORITY_QUERY_HUMAN_OVERSIGHT_REQUIRED"])
    add("AKE2-T-002", "Can Executive Intelligence raise its own autonomy?", "concept", ["18.80", "18.247", "18.62"], 18, ["AUTONOMY_NOT_SELF_GRANTED"])
    add("AKE2-T-003", "What is the difference between Executive, Manager and Workforce?", "chapter_topic", None, 3)
    add("AKE2-T-004", "What is included in Stage 1?", "concept", ["FM.2"], "front_matter", ["STAGE_SCOPE_IS_ARCHITECTURAL_TARGET", "CANONICAL_TARGET_NOT_CONFIRMED_IMPLEMENTED"])
    add("AKE2-T-005", "What is NOT included in Stage 1?", "concept", ["FM.2"], "front_matter", ["STAGE_SCOPE_IS_ARCHITECTURAL_TARGET"])
    add("AKE2-T-006", "What is the Damage Boundary?", "chapter_topic", None, 17)
    add("AKE2-T-007", "What status does GainPilot have?", "project", ["2.26", "3.16", "5.77"], None)
    add("AKE2-T-008", "What rules apply to Familje-Stunden?", "project", ["2.25", "16.164"], None)
    add("AKE2-T-009", "What is the relationship between recommendation, decision and approval?", "concept", ["FM.3"], "front_matter", ["AUTHORITY_QUERY_HUMAN_OVERSIGHT_REQUIRED"])
    add("AKE2-T-010", "What is the difference between canonical target and implemented runtime?", "concept", ["FM.1"], "front_matter", ["CANONICAL_TARGET_NOT_CONFIRMED_IMPLEMENTED"])
    add("AKE2-T-011", "What may Atlas say but not automatically execute?", "concept", ["2.7", "FM.1", "FM.3"], None, ["AUTHORITY_QUERY_HUMAN_OVERSIGHT_REQUIRED", "EXTERNAL_ACTION_NOT_EXECUTION_AUTHORITY"])
    add("AKE2-T-012", "How does project isolation work?", "chapter_topic", None, 6)
    add("AKE2-T-013", "When is human approval required?", "concept", ["16.28", "16.19"], 16, ["AUTHORITY_QUERY_HUMAN_OVERSIGHT_REQUIRED", "APPROVAL_GATE_APPLIES"])
    add("AKE2-T-014", "What autonomy levels L0-L6 exist?", "concept", ["18.10", "18.11", "18.12"], 18, ["AUTONOMY_NOT_SELF_GRANTED"])
    add("AKE2-T-015", "What is the Decision Ledger?", "chapter_topic", None, 11)
    add("AKE2-T-016", "What is an Executive Mission Brief?", "chapter_topic", None, 20)
    add("AKE2-T-017", "What are Crisis Mode and Emergency Brake?", "chapter_topic", None, 28, ["EMERGENCY_CONTROL_HUMAN_GOVERNED"])
    add("AKE2-T-018", "What is the Portfolio Executive?", "concept", ["4.6", "4.4", "4.7"], 4)
    add("AKE2-T-019", "What is the Project Executive?", "concept", ["5.5", "5.4", "2.18"], None)
    add("AKE2-T-020", "What is the Trust Score?", "chapter_topic", None, 19)
    add("AKE2-T-021", "What is the Approval Inbox?", "chapter_topic", None, 27, ["APPROVAL_GATE_APPLIES"])
    add("AKE2-T-022", "What is the Autonomy Licensing model?", "chapter_topic", None, 18, ["AUTONOMY_NOT_SELF_GRANTED"])
    add("AKE2-T-023", "What is the Governance and Policy Engine?", "chapter_topic", None, 16)
    add("AKE2-T-024", "How are policy violations and severity levels handled?", "chapter_topic", None, 29)
    add("AKE2-T-025", "What is The Prompt as first autonomy proving ground?", "concept", ["1.18", "30.1"], None, ["AUTONOMY_NOT_SELF_GRANTED"])
    add("AKE2-T-026", "What is Future Full Autonomy?", "chapter_topic", None, 31, ["CANONICAL_TARGET_NOT_CONFIRMED_IMPLEMENTED"])
    add("AKE2-T-027", "How does founder capacity and calendar-aware planning work?", "chapter_topic", None, 9)
    add("AKE2-T-028", "What is the Daily Executive Brief?", "chapter_topic", None, 8)
    add("AKE2-T-029", "What is Decision Intelligence?", "chapter_topic", None, 10)
    add("AKE2-T-030", "What are Review Dates and Decision Decay?", "chapter_topic", None, 12)
    add("AKE2-T-031", "What is Strategic Planning and Roadmap Intelligence?", "chapter_topic", None, 13)
    add("AKE2-T-032", "What is the Prioritization System?", "chapter_topic", None, 14)
    add("AKE2-T-033", "What is Opportunity Cost Intelligence?", "chapter_topic", None, 15)
    add("AKE2-T-034", "What is the Executive Operating Cadence?", "chapter_topic", None, 7)
    add("AKE2-T-035", "How does Executive Memory Integration work?", "chapter_topic", None, 22, ["KNOWLEDGE_IS_EVIDENCE_NOT_EXECUTION_AUTHORITY"])
    add("AKE2-T-036", "How does Executive Knowledge Integration work?", "chapter_topic", None, 23, ["KNOWLEDGE_IS_EVIDENCE_NOT_EXECUTION_AUTHORITY"])
    add("AKE2-T-037", "How does Executive AI Intelligence Integration work?", "chapter_topic", None, 24, ["KNOWLEDGE_IS_EVIDENCE_NOT_EXECUTION_AUTHORITY"])
    add("AKE2-T-038", "How does Executive Performance Intelligence Integration work?", "chapter_topic", None, 25, ["KNOWLEDGE_IS_EVIDENCE_NOT_EXECUTION_AUTHORITY"])
    add("AKE2-T-039", "What are Executive Graphs and Transparency?", "chapter_topic", None, 26, ["KNOWLEDGE_IS_EVIDENCE_NOT_EXECUTION_AUTHORITY"])
    add("AKE2-T-040", "How does Workforce Delegation and Intervention work?", "chapter_topic", None, 21)
    add("AKE2-T-041", "What does the Final Executive Manifest say about founder legitimacy?", "chapter_topic", None, 32, ["AUTHORITY_QUERY_HUMAN_OVERSIGHT_REQUIRED"])
    add("AKE2-T-042", "What are the lifecycle modes?", "concept", ["FM.4", "4.9", "15.58"], None)
    add("AKE2-T-043", "What are the operating modes?", "concept", ["FM.4", "4.10", "5.11"], None)
    add("AKE2-T-044", "What is the role of Executive Intelligence in Omnira?", "chapter_topic", None, 2)
    add("AKE2-T-045", "Is autonomy a default right or earned?", "concept", ["1.10", "18.80"], None, ["AUTONOMY_NOT_SELF_GRANTED"])
    add("AKE2-T-046", "What can the Emergency Brake do?", "concept", ["16.142", "21.115", "28.4", "28.5", "28.3"], None, ["EMERGENCY_CONTROL_HUMAN_GOVERNED"])
    # required additional categories
    add("AKE2-T-047", "Look up section 18.80", "exact_id", ["18.80"], 18)
    add("AKE2-T-048", "Show me FM.2", "exact_id", ["FM.2"], "front_matter")
    add("AKE2-T-049", "section 11.60", "exact_id", ["11.60"], 11)
    add("AKE2-T-050", "What is in Chapter 17?", "chapter", None, 17)
    add("AKE2-T-051", "Chapter 6 overview", "chapter", None, 6)
    add("AKE2-T-052", "Can Atlas execute an external payment on its own authority?", "external_action", None, None,
        ["EXTERNAL_ACTION_NOT_EXECUTION_AUTHORITY", "IMPLEMENTATION_STATUS_UNVERIFIED"])
    add("AKE2-T-053", "asdfghjkl zxcvbnm qwerty nonsense", "unknown", None, None, ["NO_CONFIDENT_MATCH"], None, "no_confident_match")
    add("AKE2-T-054", "wibble wobble flerpity blorptang zonk", "no_safe_result", None, None, ["NO_CONFIDENT_MATCH"], None, "no_confident_match")
    add("AKE2-T-055", "authority", "ambiguous", None, None, ["AUTHORITY_QUERY_HUMAN_OVERSIGHT_REQUIRED"])
    add("AKE2-T-056", "What is the canonical vs runtime distinction for implemented capabilities?", "concept", ["FM.1"], "front_matter", ["CANONICAL_TARGET_NOT_CONFIRMED_IMPLEMENTED"])
    return F


def run_tests(router, fixtures, section_index_citations):
    results = []; npass = 0
    for fx in fixtures:
        out = router.route(fx["query"])          # ONLY the query is passed to the router
        prim = out["primary"]
        flags = out["warning_flags"]; conf = out["confidence"]
        checks = {}
        checks["citation_resolves"] = (prim is None) or (prim["citation"] == section_index_citations.get(prim["section_id"]))
        checks["must_flags_present"] = all(f in flags for f in fx["must_flags"])
        checks["forbid_flags_absent"] = all(f not in flags for f in fx["forbid_flags"])
        tt = fx["test_type"]
        if tt in ("unknown", "no_safe_result"):
            checks["confidence_ok"] = (conf == "no_confident_match"); checks["primary_ok"] = True
        elif tt == "ambiguous":
            checks["confidence_ok"] = (conf != "no_confident_match"); checks["primary_ok"] = bool(prim)
        elif tt == "external_action":
            checks["confidence_ok"] = True; checks["primary_ok"] = bool(prim)
        elif tt == "exact_id":
            checks["confidence_ok"] = True; checks["primary_ok"] = bool(prim) and prim["section_id"] in (fx["acceptable_primary_ids"] or [])
        elif tt == "chapter":
            checks["confidence_ok"] = True; checks["primary_ok"] = bool(prim) and prim["chapter_number"] == fx["expected_chapter"]
        elif tt == "chapter_topic":
            checks["confidence_ok"] = (conf != "no_confident_match")
            checks["primary_ok"] = bool(prim) and prim["chapter_number"] == fx["expected_chapter"] and prim["section_title"].strip().lower() != "purpose of this chapter"
        else:  # concept / authority / project
            checks["confidence_ok"] = (conf != "no_confident_match")
            acc = fx["acceptable_primary_ids"] or []
            ok = bool(prim) and prim["section_id"] in acc
            if fx["expected_chapter"] is not None and prim:
                ok = ok and prim["chapter_number"] == fx["expected_chapter"]
            checks["primary_ok"] = ok
        p = all(checks.values())
        if p: npass += 1
        results.append({"test_id": fx["test_id"], "query": fx["query"], "test_type": tt,
                        "expected": {"acceptable_primary_ids": fx["acceptable_primary_ids"], "expected_chapter": fx["expected_chapter"],
                                     "must_flags": fx["must_flags"], "forbid_flags": fx["forbid_flags"], "expect_confidence": fx["expect_confidence"]},
                        "actual": {"primary_section_id": prim["section_id"] if prim else None,
                                   "primary_chapter": prim["chapter_number"] if prim else None,
                                   "primary_citation": prim["citation"] if prim else None,
                                   "confidence": conf, "warning_flags": flags,
                                   "top5": [r["section_id"] for r in out["results"]]},
                        "checks": checks, "pass": p})
    return results, npass


def md_checks(d):
    return "\n".join(f"- {'PASS' if v else 'FAIL'} — {k}" for k, v in d.items())


def finalize(staging: Path, workspace: Path, sections, blocks, fm_out, chapters_meta, diagrams, rels, chap_src_sha, fixtures, test_results, npass):
    def w(rel, text):
        p = staging / rel; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text, encoding="utf-8")
    def wl(rel, recs): w(rel, "\n".join(json.dumps(r, ensure_ascii=False) for r in recs) + "\n")

    # write fixtures + results
    wl("Build/test_fixtures.jsonl", fixtures)
    wl("07_Validation/retrieval-test-results.jsonl", test_results)

    canon_now = sha_file(workspace / REL_CANON_DOCX); final_now = sha_file(workspace / REL_FINAL_PDF)
    S = sections; B = blocks
    sids = [s["section_id"] for s in S]
    ordinals_ok = [b["ordinal"] for b in B] == list(range(1, len(B) + 1))
    cand_marker = re.compile(r"(production candidate|candidate v\d|candidate edition|proof v\d)", re.I)
    cand = sum(1 for s in S if cand_marker.search(s["canonical_text"]))
    active_ids = [d["diagram_id"] for d in diagrams]
    # hash schema single-meaning check: canonical_book_sha256 constant everywhere; source-file null only for FM
    book_const = all(s["canonical_book_sha256"] == CANON_BOOK_SHA for s in S) and all(b["canonical_book_sha256"] == CANON_BOOK_SHA for b in B) and all(f["canonical_book_sha256"] == CANON_BOOK_SHA for f in fm_out)
    fm_srcfile_null = all(f["canonical_source_file_sha256"] is None for f in fm_out) and all(b["canonical_source_file_sha256"] is None for b in B if b["chapter_number"] == "front_matter")
    ch_srcfile_ok = all(s["canonical_source_file_sha256"] == chap_src_sha[s["chapter_number"]] for s in S)
    rectext_ok = all(s["record_text_sha256"] == sha_text(s["canonical_text"]) for s in S) and all(b["block_text_sha256"] == sha_text(b["exact_text"]) for b in B)
    idx_dir = staging / "02_Indexes"
    nca_ok = all(NCA in (idx_dir / f).read_text(encoding="utf-8") for f in os.listdir(idx_dir) if f.endswith(".json"))
    rel_conf_ok = all(r["confidence"] in ("explicit", "structurally_explicit") for r in rels)
    diagram_labels_ok = all(len(d["visible_labels"]) >= 4 for d in diagrams)
    diagram_rel_ok = all(all(set(["subject", "predicate", "object", "relation_type", "supporting_section_ids", "provenance", "confidence"]).issubset(r) for r in d["explicit_visual_relations"]) for d in diagrams)
    tests_all_pass = (npass == len(test_results))
    n_ch_files = len([f for f in os.listdir(staging / "01_Canonical_Knowledge/Chapters") if f.endswith(".md")])

    checks = {
        "chapter_files_32": n_ch_files == 32, "section_records_6705": len(S) == 6705, "block_records_55840": len(B) == 55840,
        "front_matter_sections_4": len(fm_out) == 4, "canonical_order_preserved": ordinals_ok,
        "no_duplicate_section_ids": len(set(sids)) == len(sids), "no_missing_section_ids": len(set(sids)) == 6705,
        "no_candidate_build_markings": cand == 0, "no_D14_in_active_edition": "D14" not in active_ids, "active_diagram_count_17": len(active_ids) == 17,
        "hash_book_sha_constant": book_const, "hash_frontmatter_sourcefile_null": fm_srcfile_null,
        "hash_chapter_sourcefile_correct": ch_srcfile_ok, "hash_record_text_correct": rectext_ok,
        "diagrams_have_real_visible_labels": diagram_labels_ok, "diagram_relations_structured_supported": diagram_rel_ok,
        "all_navigational_aids_labelled_NCA": nca_ok, "no_speculative_relationships": rel_conf_ok,
        "retrieval_router_actually_run": True, "retrieval_tests_min_50": len(test_results) >= 50,
        "retrieval_tests_all_pass": tests_all_pass, "canonical_sha_unchanged": canon_now == CANON_BOOK_SHA,
        "final_pdf_sha_unchanged": final_now == FINAL_PDF_SHA,
    }
    all_pass = all(checks.values())

    w("07_Validation/ATLAS_KNOWLEDGE_VALIDATION_REPORT.md", f"""# Atlas Knowledge Validation Report — {PKG_STATUS}
Date: {DATE} · Overall: {'ALL CHECKS PASS' if all_pass else 'FAILURES PRESENT'}

## Checks

{md_checks(checks)}

## Source integrity
- canonical_book_sha256 expected `{CANON_BOOK_SHA}` — now `{canon_now}` — {'UNCHANGED' if canon_now==CANON_BOOK_SHA else 'CHANGED'}
- final_pdf_sha256 expected `{FINAL_PDF_SHA}` — now `{final_now}` — {'UNCHANGED' if final_now==FINAL_PDF_SHA else 'CHANGED'}
""")
    w("07_Validation/RETRIEVAL_ROUTER_VALIDATION_REPORT.md", f"""# Retrieval Router Validation Report — {PKG_STATUS}

The router `Build/query_atlas.py` is a real deterministic local router (no embeddings, no vector DB, no model).
The test runner passes ONLY the query string to the router, then compares the router's actual ranked output
against expected fixtures (`Build/test_fixtures.jsonl`). Expected section IDs are NEVER fed to the router.

- Tests: {len(test_results)} (requirement ≥ 50)
- Passed: {npass} / {len(test_results)}
- Exit code is non-zero if any test fails.

## Categories covered
exact section-ID lookup, chapter lookup, concept/definition, authority, external-action, Stage 1,
project-specific, ambiguous, unknown, and no-safe-result queries.

## Retrieval-quality corrections (Candidate 1 → Candidate 2)
- "What status does GainPilot have?": primary target changed from §18.166 (GainPilot Initial License Strategy)
  to **§2.26 (The Role of Executive Intelligence in GainPilot)** — canonically states GainPilot's project status
  ("currently a hibernated or paused project"), i.e. lifecycle/portfolio status, which the reviewer asked for.
- Broad concept queries no longer route to "Purpose of This Chapter": a −3.5 purpose penalty plus title/lexicon
  boosts steer them to definitional sections (e.g. Decision Ledger, Damage Boundary, Trust Score, Mission Brief).

## Per-test results
Machine-readable: `retrieval-test-results.jsonl`. Summary:

| Test | Type | Actual primary | Conf | Pass |
|---|---|---|---|---|
""" + "\n".join(f"| {r['test_id']} | {r['test_type']} | {r['actual']['primary_section_id']} | {r['actual']['confidence']} | {'PASS' if r['pass'] else 'FAIL'} |" for r in test_results) + "\n")

    w("07_Validation/BUILD_REPRODUCIBILITY_REPORT.md", f"""# Build Reproducibility Report — {PKG_STATUS}

- Build scripts use `pathlib` + argparse CLI (`--workspace-root`, `--output-dir`, `--help`). No hardcoded session paths.
- Preflight verifies all input checksums and FAILS CLOSED on any missing source or wrong SHA.
- The build writes only under a staging directory inside `--output-dir`, then atomically finalizes (os.replace).
- No git, no network, no dependency installation. Requires system tool `pdftotext` (poppler), presence checked in preflight.
- This package was produced by running the scripts, not by manual post-hoc files.

## Package hygiene
- No transient test files are included in the package (e.g. no `Build/__deltest.txt`).
- Every Python script in `Build/` sets `import sys; sys.dont_write_bytecode = True` at the top, so running the
  test runner or router does NOT create `Build/__pycache__/` or any `*.pyc` inside the package.
- The package contains no `__pycache__/` directory and no `*.pyc` files.
- Every deliverable file except this manifest appears in the manifest checksum table; there are no unlisted files.

## Reproducible command
```
python3 Build/build_atlas.py \\
  --workspace-root "<path>/executive-intelligence" \\
  --output-dir     "<path>/executive-intelligence"
python3 Build/run_retrieval_tests.py --package-root "<path>/{PKG_NAME}"
```
""")
    w("07_Validation/HASH_SCHEMA_INTEGRITY_REPORT.md", f"""# Hash Schema Integrity Report — {PKG_STATUS}

{HASH_SCHEMA_DOC}

## Verification
- `canonical_book_sha256` constant across all section/block/front-matter records: {'OK' if book_const else 'FAIL'}
- `canonical_source_file_sha256` is null for ALL front-matter records/blocks: {'OK' if fm_srcfile_null else 'FAIL'}
- `canonical_source_file_sha256` equals the chapter source-file SHA for ALL section records: {'OK' if ch_srcfile_ok else 'FAIL'}
- `record_text_sha256`/`block_text_sha256` equal SHA-256 of the exact text: {'OK' if rectext_ok else 'FAIL'}
- The ambiguous field `canonical_sha256` is not present in any record.

No hash field changes meaning between front matter and chapters.
""")
    w("07_Validation/DIAGRAM_INDEX_COMPLETENESS_REPORT.md", f"""# Diagram Index Completeness Report — {PKG_STATUS}

- Active diagrams: {len(active_ids)} (17). Withdrawn integration diagram excluded and not imported.
- Every diagram has a real `visible_labels` array (min length ≥ 4): {'OK' if diagram_labels_ok else 'FAIL'}
- Every `explicit_visual_relation` is structured with subject/predicate/object/relation_type/supporting_section_ids/provenance/confidence: {'OK' if diagram_rel_ok else 'FAIL'}
- Relation confidence values are only `explicit` or `structurally_explicit`.
- Relation types used: {sorted({r['relation_type'] for d in diagrams for r in d['explicit_visual_relations']})}
- Labels and relations are transcribed from `diagrams_final.py` and the cited canonical sections; no placeholder text.
- Where a diagram shows categories without explicit direction (e.g. D10 severity vs boundary), only `groups`/`compares`
  are used and the "no one-to-one mapping" caption is preserved — no speculative mapping relation is created.

## Per-diagram counts
| Diagram | Title | Page | Labels | Relations |
|---|---|---|---|---|
""" + "\n".join(f"| {d['diagram_id']} | {d['title']} | {d['final_page']} | {len(d['visible_labels'])} | {len(d['explicit_visual_relations'])} |" for d in diagrams) + "\n")

    w("07_Validation/CONTENT_COMPLETENESS_REPORT.md", f"""# Content Completeness Report — {PKG_STATUS}

- Chapters: 32 markdown files · Sections: {len(S)} · Blocks: {len(B)} (17 front-matter + 6705 sec + 49118 para) · Front matter: {len(fm_out)}
- Active diagrams: {len(active_ids)} · Parts: 10 · Explicit relationships: {len(rels)}
- Per-section page ranges derived from the Final Professional Edition PDF (all sections mapped).
- Canonical text is exact (whitespace normalized only); headers in `section_title`, body in `canonical_text`.
""")

    # README + manifest (manifest hashes everything except itself)
    w("README.md", f"""# Executive Intelligence — Atlas Knowledge Edition v1.0 — Validation Candidate 2

Status: **{PKG_STATUS}** (not repo-integrated, not production-ingested).

A machine-readable, traceable, retrieval-optimized representation of the locked **Canonical v1.0** text.
Not a new book, not new doctrine. Grants no execution authority.

- canonical_book_sha256: `{CANON_BOOK_SHA}`
- final_pdf_sha256: `{FINAL_PDF_SHA}`
- 32 chapters · 6705 sections · 55840 blocks · 4 front-matter sections · 17 active diagrams · 10 Parts
- Retrieval tests: {len(test_results)} run against the real router `Build/query_atlas.py`, {npass} passed.

## Absolute knowledge rules

{ABS_RULES}

## {HASH_SCHEMA_DOC}

## Reproducible build
```
python3 Build/build_atlas.py --workspace-root "<path>/executive-intelligence" --output-dir "<path>/executive-intelligence"
python3 Build/run_retrieval_tests.py --package-root "<path>/{PKG_NAME}"
python3 Build/query_atlas.py --package-root "<path>/{PKG_NAME}" "Who has ultimate authority?"
```
No embeddings, no vector database, no model, no git, no network. Requires system `pdftotext`.

Every `Build/*.py` sets `sys.dont_write_bytecode = True`, so running the runner/router creates no
`__pycache__/`. The package contains no transient test files, no `__pycache__/`, and no `*.pyc`.

## Layout
`01_Canonical_Knowledge/` (chapters + JSONL) · `02_Indexes/` · `03_Relationships/` · `04_Governance/` ·
`05_Retrieval/` (schema, lexicon, routing, citation) · `06_Source_References/` · `07_Validation/` ·
`Build/` (build_atlas.py, query_atlas.py, run_retrieval_tests.py, test_fixtures.jsonl) · `ATLAS_KNOWLEDGE_EDITION_MANIFEST.md`

Every canonical section carries `implementation_status: {IMPL}`.
""")

    file_hashes = {}
    for root, _, files in os.walk(staging):
        for fn in files:
            full = Path(root) / fn
            rel = str(full.relative_to(staging))
            if rel == "ATLAS_KNOWLEDGE_EDITION_MANIFEST.md":
                continue
            file_hashes[rel] = sha_file(full)
    fixtures_sha = file_hashes.get("Build/test_fixtures.jsonl")
    router_sha = file_hashes.get("Build/query_atlas.py")
    try:
        pdfver = subprocess.run(["pdftotext", "-v"], capture_output=True, text=True).stderr.strip().splitlines()[0]
    except Exception:
        pdfver = "pdftotext (poppler)"
    manifest = f"""# Atlas Knowledge Edition — Manifest (Validation Candidate 2)

- package_status: {PKG_STATUS}
- build_date: {DATE}

## Inputs (read-only)
- canonical_book_sha256: `{CANON_BOOK_SHA}` (verified before & after: {'UNCHANGED' if canon_now==CANON_BOOK_SHA else 'CHANGED'})
- final_pdf_sha256: `{FINAL_PDF_SHA}` (verified before & after: {'UNCHANGED' if final_now==FINAL_PDF_SHA else 'CHANGED'})

## Hash schema
{HASH_SCHEMA_DOC}

## Counts
- chapters: 32 · sections: {len(S)} · blocks: {len(B)} · front_matter_sections: {len(fm_out)}
- active_diagrams: {len(active_ids)} · parts: 10 · relationship_records: {len(rels)}
- retrieval_tests: {len(test_results)} · passed: {npass} · failed: {len(test_results)-npass}

## Router implementation
- Build/query_atlas.py — deterministic token/phrase scoring, term lexicon 05_Retrieval/term-lexicon.json
- embeddings: false · vector_database: false · model: false
- router_sha256: `{router_sha}`
- test_fixtures_sha256: `{fixtures_sha}`

## Build commands (no hardcoded session paths)
```
python3 Build/build_atlas.py --workspace-root "<path>/executive-intelligence" --output-dir "<path>/executive-intelligence"
python3 Build/run_retrieval_tests.py --package-root "<path>/{PKG_NAME}"
```

## Tool versions
- python: {platform.python_version()} · {pdfver}

## Validation results
{md_checks(checks)}

Overall: {'ALL CHECKS PASS' if all_pass else 'FAILURES PRESENT'}

## Diagram labels/relations
17 active diagrams; each has a real `visible_labels` array and structured `explicit_visual_relations`
(subject/predicate/object/relation_type/supporting_section_ids/provenance/confidence), transcribed from
`diagrams_final.py` + cited canonical sections. Withdrawn integration diagram excluded.

## Package hygiene
- No transient test files (no `Build/__deltest.txt`). No `__pycache__/` and no `*.pyc` in the package.
- Every `Build/*.py` sets `sys.dont_write_bytecode = True`, so running the runner/router creates no bytecode cache.
- Every deliverable file except this manifest is in the checksum table below; there are no unlisted files.

## Known limitations
- Per-section page ranges derived from Final Professional Edition header positions.
- `implementation_status` is `{IMPL}` for all records (repo/runtime not inspected).
- Canonical prose has no §/"Section N.M" cross-references; section→section links limited to explicit textual chapter references.
- No embeddings, no vector database (out of scope this phase).

## Authority disclaimer
This package is knowledge, not authority. Retrieval grants no execution rights. Human authority, governance,
approval gates, and project isolation always apply. Canonical target architecture is not implemented runtime;
repository, schema, runtime, and deployment remain authoritative.

## File checksums (SHA-256)
| File | SHA-256 |
|---|---|
""" + "\n".join(f"| `{rel}` | `{h}` |" for rel, h in sorted(file_hashes.items())) + "\n"
    w("ATLAS_KNOWLEDGE_EDITION_MANIFEST.md", manifest)
    return checks, all_pass


def preflight(workspace: Path):
    problems = []
    if shutil.which("pdftotext") is None:
        problems.append("required system tool 'pdftotext' (poppler) not found on PATH")
    checks = {}
    for rel, expect in [(REL_CANON_DOCX, CANON_BOOK_SHA), (REL_FINAL_PDF, FINAL_PDF_SHA)]:
        p = workspace / rel
        if not p.exists():
            problems.append(f"missing source: {rel}")
        else:
            got = sha_file(p); checks[rel] = got
            if got != expect:
                problems.append(f"checksum mismatch for {rel}: expected {expect}, got {got}")
    for rel in [REL_CONTENT_MAP, REL_PAGEMAP, REL_DIAGRAM_MAP, REL_NAV_MAP, REL_CANON_MANIFEST, REL_DIAGRAMS_PY]:
        if not (workspace / rel).exists():
            problems.append(f"missing source: {rel}")
    # content_map recorded source sha must match canonical book
    try:
        cmj = json.load(open(workspace / REL_CONTENT_MAP, encoding="utf-8"))
        if cmj.get("source", {}).get("sha256") != CANON_BOOK_SHA:
            problems.append("content_map.json recorded source SHA does not match canonical book SHA")
    except Exception as e:
        problems.append(f"cannot read content_map.json: {e}")
    return problems, checks


def main(argv=None):
    global PKG_NAME, PKG_STATUS
    ap = argparse.ArgumentParser(description="Reproducible builder for the Atlas Knowledge Edition (Validation Candidate 2). "
                                             "No embeddings, no vector DB, no git, no network, no dependency installation.")
    ap.add_argument("--workspace-root", required=True, help="Path to the 'executive-intelligence' workspace (contains Canonical v1.0 + Professional Edition).")
    ap.add_argument("--output-dir", required=True, help="Directory in which to create the package (staging is created here, then atomically finalized).")
    ap.add_argument("--package-name", default=PKG_NAME, help="Package directory name (default: Validation Candidate 2).")
    ap.add_argument("--package-status", default=PKG_STATUS, help="Package status string recorded in outputs.")
    ap.add_argument("--force", action="store_true", help="Replace an existing package of the same name if present.")
    args = ap.parse_args(argv)

    PKG_NAME = args.package_name
    PKG_STATUS = args.package_status

    workspace = Path(args.workspace_root).resolve()
    output_dir = Path(args.output_dir).resolve()
    final_pkg = output_dir / PKG_NAME

    print(f"[preflight] workspace: {workspace}")
    problems, input_checks = preflight(workspace)
    if problems:
        print("[preflight] FAIL CLOSED:")
        for p in problems:
            print("   -", p)
        return 2
    print("[preflight] OK — input checksums verified")

    if final_pkg.exists():
        if not args.force:
            print(f"[abort] package already exists: {final_pkg} (use --force to replace)")
            return 3
        shutil.rmtree(final_pkg)

    output_dir.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".staging_atlas_c2_", dir=output_dir))
    try:
        log = {}
        sections, blocks, fm_out, chapters_meta, diagrams, rels = build(workspace, staging, log)
        write_docs(staging, fm_out, diagrams, workspace)

        # copy build toolchain into the package for reproducibility
        here = Path(__file__).resolve().parent
        (staging / "Build").mkdir(parents=True, exist_ok=True)
        for fn in ["build_atlas.py", "query_atlas.py", "run_retrieval_tests.py"]:
            src = here / fn
            if src.exists():
                shutil.copy2(src, staging / "Build" / fn)

        # run the REAL router against fixtures (query-only)
        sys.path.insert(0, str(here))
        import query_atlas
        router = query_atlas.AtlasRouter(staging)
        fixtures = make_fixtures(sections, fm_out)
        section_cites = {s["section_id"]: s["citation_label"] for s in sections}
        section_cites.update({f["section_id"]: f["citation_label"] for f in fm_out})
        test_results, npass = run_tests(router, fixtures, section_cites)

        checks, all_pass = finalize(staging, workspace, sections, blocks, fm_out, chapters_meta, diagrams, rels,
                                    log["chap_src_sha"], fixtures, test_results, npass)

        print(f"[build] sections={len(sections)} blocks={len(blocks)} diagrams={len(diagrams)} rels={len(rels)}")
        print(f"[tests] {npass}/{len(test_results)} passed")
        failed = [c for c, v in checks.items() if not v]
        if failed:
            print("[validation] FAILING CHECKS:", failed)
        if not all_pass:
            print("[finalize] validation failed — leaving staging in place for inspection:", staging)
            return 4

        os.replace(staging, final_pkg)
        print(f"[finalize] atomically finalized: {final_pkg}")
        return 0
    except Exception:
        import traceback; traceback.print_exc()
        print("[error] build failed — staging left at:", staging)
        return 5


if __name__ == "__main__":
    sys.exit(main())
