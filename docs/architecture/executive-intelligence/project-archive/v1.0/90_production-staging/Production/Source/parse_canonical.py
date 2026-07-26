# -*- coding: utf-8 -*-
"""Phase 3.3 — deterministic parser for the locked Canonical v1.0 DOCX.
Produces content_map.json, navigation_map.json, diagram_source_map.json.
Text is read ONLY from the canonical DOCX via python-docx. Nothing is summarised,
rewritten, shortened, merged, or reordered. Every non-empty paragraph is preserved."""
import json, re, os, hashlib, docx

CANON = os.environ.get("CANON",
    "/sessions/elegant-youthful-bell/mnt/executive-intelligence/"
    "Executive Intelligence — Canonical v1.0/"
    "Omnira — Executive Intelligence — Canonical Edition v1.0.docx")
OUT = os.path.dirname(os.path.abspath(__file__))

def sha(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for c in iter(lambda:f.read(65536),b''): h.update(c)
    return h.hexdigest()

d = docx.Document(CANON)
P = d.paragraphs
styles = [p.style.name for p in P]
T = [p.text.strip() for p in P]

# ---- chapter boundaries ----
chap_re = re.compile(r'^Chapter (\d+) — (.+)$')
starts=[]
for i,t in enumerate(T):
    m=chap_re.match(t)
    if m and i+1<len(T) and T[i+1].upper().startswith("CANONICAL"):
        starts.append((int(m.group(1)), i, m.group(2)))
assert len(starts)==32, "expected 32 chapters, got %d"%len(starts)
bounds=[s[1] for s in starts]+[len(T)]

# ---- front matter ----
meta={}
for i in range(5,12):
    if ":" in T[i]:
        k,v=T[i].split(":",1); meta[k.strip().lower().replace(" ","_")]=v.strip()
fm_sections=[]
cur=None
for i in range(12, 33):  # 12..32 : the four notice sections (33 = 'Table of Contents')
    if styles[i]=="Heading 1":
        if cur: fm_sections.append(cur)
        cur={"heading":T[i],"blocks":[]}
    elif T[i] and cur is not None:
        cur["blocks"].append({"t":"bullet" if styles[i]=="List Bullet" else "para","text":T[i]})
if cur: fm_sections.append(cur)

# ---- chapters ----
def sec_re(n): return re.compile(r'^%d\.(\d+)(?:\.\d+)?\s+\S' % n)
chapters=[]
all_section_ids=[]
for k,(num,idx,title) in enumerate(starts):
    seg_lo, seg_hi = idx, bounds[k+1]
    sr=sec_re(num)
    blocks=[]
    # skip idx (title) and idx+1 (CANONICAL v1.0)
    j=idx+2
    while j<seg_hi and not T[j]: j+=1
    for i in range(j, seg_hi):
        t=T[i]
        if not t: continue
        if t.upper()=="CANONICAL V1.0": continue
        mm=sr.match(t)
        if mm:
            sid=t.split()[0]
            blocks.append({"t":"sec","id":sid,"text":t})
            all_section_ids.append(sid)
        else:
            blocks.append({"t":"bullet" if styles[i]=="List Bullet" else "para","text":t})
    chapters.append({"num":num,"title":title,"blocks":blocks,
                     "n_blocks":len(blocks),
                     "n_sections":sum(1 for b in blocks if b["t"]=="sec")})

# ---- navigation (approved non-canonical grouping) ----
parts=[
 (1,"FOUNDATIONS & ROLES",[1,2,3]),
 (2,"PORTFOLIO, PROJECTS & ISOLATION",[4,5,6]),
 (3,"EXECUTIVE CADENCE & FOUNDER CAPACITY",[7,8,9]),
 (4,"DECISIONS, PLANNING & PRIORITIZATION",[10,11,12,13,14,15]),
 (5,"GOVERNANCE, DAMAGE & AUTONOMY",[16,17,18,19]),
 (6,"MISSIONS, DELEGATION & MEMORY",[20,21,22]),
 (7,"KNOWLEDGE, AI & PERFORMANCE",[23,24,25]),
 (8,"GRAPHS, APPROVALS & TRANSPARENCY",[26,27]),
 (9,"CRISIS, VIOLATIONS & CONTROL",[28,29]),
 (10,"AUTONOMY PROVING GROUND & FUTURE",[30,31,32]),
]
roman={1:"I",2:"II",3:"III",4:"IV",5:"V",6:"VI",7:"VII",8:"VIII",9:"IX",10:"X"}
nav={"note":"Non-canonical navigational grouping added only in the Professional Edition.",
     "parts":[{"part":roman[p],"num":p,"title":t,"chapters":ch} for p,t,ch in parts]}

# ---- diagrams (18) : placed at the opening of an anchor chapter ----
diagrams=[
 ("D01","Omnira Intelligence Position Model",[1,2],["Ch 2 §§2.2-2.3"],2),
 ("D02","Executive · Manager · Workforce",[3],["Ch 3 §3.2"],3),
 ("D03","Portfolio Executive vs Project Executive",[4,5],["Ch 4","Ch 5"],5),
 ("D04","Project Isolation & Executive Boundaries",[6],["Ch 6"],6),
 ("D05","Leadership Loop / Executive Cadence",[7],["Ch 7"],7),
 ("D06","Decision Lifecycle",[10],["Ch 10"],10),
 ("D07","Decision Ledger",[11],["Ch 11"],11),
 ("D08","Prioritization / Opportunity Cost Relationship",[14,15],["Ch 14","Ch 15"],15),
 ("D09","Governance & Authority Gradient",[16],["Ch 16 §16.1"],16),
 ("D10","Damage Severity & Boundary States",[17],["Ch 17 §§17.100-17.119"],17),
 ("D11","Autonomy Licensing Model",[18],["Ch 18"],18),
 ("D12","Trust Score & Autonomy Progression",[19],["Ch 19"],19),
 ("D13","Executive Mission Delegation Flow",[20,21],["Ch 20","Ch 21"],21),
 ("D14","Memory · Knowledge · AI · Performance Integration",[22,23,24,25],["Ch 22-25"],25),
 ("D15","Operating Graph vs Intelligence Graph",[26],["Ch 26"],26),
 ("D16","Approval Flow",[27],["Ch 27"],27),
 ("D17","Crisis Mode & Emergency Brake",[28],["Ch 28"],28),
 ("D18","Stage 1 vs Future Target Architecture",[30,31,32],["Front matter — Implementation Scope"],32),
]
dmap={"note":"Diagrams are additive presentation layers; they never replace canonical text. Labels are derived from canonical sections; no new doctrine is introduced.",
      "diagrams":[{"id":i,"title":t,"chapters":ch,"canonical_sections":cs,"anchor_chapter":anchor,
                   "placement":"full-page (dark for system models) or large half-page"}
                  for i,t,ch,cs,anchor in diagrams]}

# ---- write ----
content={"source":{"file":os.path.basename(CANON),"sha256":sha(CANON)},
         "front_matter":{"meta":meta,"cover":{"omnira":T[0],"ei":T[1],"sub":T[2],
              "edition":T[3],"ver":T[4]},"sections":fm_sections},
         "chapters":chapters,
         "stats":{"n_chapters":len(chapters),
                  "n_section_ids":len(all_section_ids),
                  "n_unique_section_ids":len(set(all_section_ids)),
                  "n_body_blocks":sum(c["n_blocks"] for c in chapters)}}
json.dump(content, open(os.path.join(OUT,"content_map.json"),"w"), ensure_ascii=False)
json.dump(nav, open(os.path.join(OUT,"navigation_map.json"),"w"), ensure_ascii=False, indent=1)
json.dump(dmap, open(os.path.join(OUT,"diagram_source_map.json"),"w"), ensure_ascii=False, indent=1)

# duplicate-section-id check
from collections import Counter
dupes={k:v for k,v in Counter(all_section_ids).items() if v>1}
print("chapters:",len(chapters))
print("section ids:",len(all_section_ids)," unique:",len(set(all_section_ids)))
print("duplicate section ids:",len(dupes))
print("front matter sections:",[s["heading"] for s in fm_sections])
print("total body blocks:",content["stats"]["n_body_blocks"])
print("canonical sha:",content["source"]["sha256"][:16],"...")
