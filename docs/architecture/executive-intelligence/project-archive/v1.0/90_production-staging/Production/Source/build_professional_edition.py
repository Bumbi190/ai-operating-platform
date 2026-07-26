# -*- coding: utf-8 -*-
"""
Omnira — Executive Intelligence — Professional Edition
PHASE 3.3 — Production Candidate v1 builder (deterministic, reproducible).

Text source: content_map.json (produced by parse_canonical.py from the LOCKED Canonical v1.0
DOCX via python-docx). No canonical text is summarised, rewritten, shortened, merged, replaced
by a diagram/callout/table, or reordered. Every canonical body block is emitted exactly once,
in order. Diagrams, callouts and tables are additive presentation layers.

Modes (env BUILD_MODE):
  measure                      -> lay out whole book, write build_pagemap.json, print totals
  render PAGE_FROM PAGE_TO OUT -> lay out, draw pages [FROM,TO) into segment PDF OUT
  merge                        -> concat segments + outline + TOC links + metadata -> candidate

Design baseline = approved Proof v2. Fonts: DejaVu Serif/Sans/Mono (installed; embedded).
"""
import os, sys, json, math
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor

W, H = letter
HERE = os.path.dirname(os.path.abspath(__file__))
CONTENT = json.load(open(os.path.join(HERE, "content_map.json")))
NAV = json.load(open(os.path.join(HERE, "navigation_map.json")))
DIAG = json.load(open(os.path.join(HERE, "diagram_source_map.json")))

# ---------- fonts ----------
FD = "/usr/share/fonts/truetype/dejavu/"
for nm, fn in [("Serif","DejaVuSerif.ttf"),("Serif-B","DejaVuSerif-Bold.ttf"),
               ("Serif-I","DejaVuSerif-Italic.ttf"),("Sans","DejaVuSans.ttf"),
               ("Sans-B","DejaVuSans-Bold.ttf"),("Mono","DejaVuSansMono.ttf"),
               ("Mono-B","DejaVuSansMono-Bold.ttf")]:
    pdfmetrics.registerFont(TTFont(nm, FD+fn))

# ---------- palette (locked Executive Gold) ----------
DARK="#0E1A26"; PAPER="#FFFFFF"; INK="#14202B"; WARM="#F4F1EA"; SLATE="#5A6672"
GOLD="#C8A24B"; NAVY="#1F3B57"; PETROL="#183850"; RED="#B4442E"; GHOST="#8A939D"
def col(x): return HexColor(x)

# ---------- geometry ----------
ML=1.15*72; MR=1.0*72; MT=1.25*72; MB=1.0*72
TOPY=H-MT; BOTY=MB; MEAS=W-ML-MR
HEADY=H-0.5*72; FOOTY=0.55*72

# ---------- type scale (locked, proof v2) ----------
BODY_F, BODY_S, BODY_L, BODY_SA = "Serif", 10.5, 14.5, 3.5

# ---------- wrap ----------
_wc={}
def sw(s,f,z): return pdfmetrics.stringWidth(s,f,z)
def wrap(text,f,z,maxw):
    out=[]; cur=""
    for w in text.split():
        t=w if not cur else cur+" "+w
        if sw(t,f,z)<=maxw: cur=t
        else:
            if cur: out.append(cur)
            if sw(w,f,z)>maxw:  # hard-break very long token
                s=""
                for ch in w:
                    if sw(s+ch,f,z)<=maxw: s+=ch
                    else: out.append(s); s=ch
                cur=s
            else: cur=w
    if cur: out.append(cur)
    return out or [""]

# ---------- callout triggers (verbatim canonical paragraph -> callout type) ----------
CALLOUTS={
 "It must not be able to act broadly without authority.":("EXECUTIVE DECISION",GOLD),
 "The purpose is to prevent meaningful harm from being created without appropriate human authority and control.":("DAMAGE BOUNDARY",RED),
 "Autonomy may exist only below a defined Damage Boundary or within a licensed controlled zone.":("AUTONOMY LICENSE",GOLD),
 "If Executive Intelligence performs specialist work directly, it becomes a bottleneck.":("ANTI-PRINCIPLE",RED),
 "Therefore, Executive Intelligence must be designed as one layer inside a coordinated architecture, not as a universal replacement for the rest of Omnira.":("CANONICAL DOCTRINE",NAVY),
 "A metric may improve while the business becomes weaker.":("EXAMPLE",SLATE),
 "Implementation should occur incrementally. Stage 1 should be recommendation-first and human-authorized, establishing a usable Executive foundation without pretending full autonomy exists.":("STAGE 1 BOUNDARY",PETROL),
 "Future systems remain architectural contracts until separately designed, approved, implemented, validated, and governed.":("FUTURE TARGET ARCHITECTURE",GHOST),
}

ROMAN={1:"I",2:"II",3:"III",4:"IV",5:"V",6:"VI",7:"VII",8:"VIII",9:"IX",10:"X"}
# diagram anchor -> list of diagram dicts
DIA_BY_ANCHOR={}
for dd in DIAG["diagrams"]:
    DIA_BY_ANCHOR.setdefault(dd["anchor_chapter"],[]).append(dd)
DARK_DIAGRAMS={"D01","D14"}  # dark full-page system models
CHAP_OF_PART={}
for pt in NAV["parts"]:
    for ch in pt["chapters"]: CHAP_OF_PART[ch]=pt

def sec_titles(cnum, k=6, skip_generic=True):
    """canonical section heading texts for a chapter (node labels are verbatim canonical)."""
    ch=next(c for c in CONTENT["chapters"] if c["num"]==cnum)
    out=[]
    for b in ch["blocks"]:
        if b["t"]=="sec":
            txt=b["text"]
            # strip leading id
            parts=txt.split(None,1)
            label=parts[1] if len(parts)>1 else txt
            out.append((b["id"],label))
    return out[:k]

AUTONOMY=["L0 — Observe","L1 — Recommend","L2 — Prepare","L3 — Execute Internally",
          "L4 — External Low-Risk","L5 — Conditional Business Autonomy","L6 — Full Strategic Autonomy"]

# ============================================================
# LAYOUT ENGINE
# ============================================================
class Book:
    def __init__(self):
        self.pages=[]           # dicts: kind, ctx, ops, extra
        self.dest={}            # key -> page index (0-based)
        self.bmarks=[]          # (level, title, key)
        self.toc=[]             # (level, label, key)  parts/chapters/diagrams
        self.toc_links=[]       # (src_page_index, rect, dest_key)
        self._cur=None
    # ---- page management ----
    def _start(self, kind, ctx=None, extra=None):
        pg={"kind":kind,"ctx":ctx,"extra":extra or {},"ops":[]}
        self.pages.append(pg); self._cur=pg
        self.y=TOPY
        return len(self.pages)-1
    def mark(self, key, title=None, level=None, toc=False):
        self.dest[key]=len(self.pages)-1
        if title is not None and level is not None:
            self.bmarks.append((level,title,key))
            if toc: self.toc.append((level,title,key))
    def op(self,*a): self._cur["ops"].append(a)
    # ---- body primitives ----
    def _ensure(self, need):
        if self.y-need < BOTY+6:
            self._start("body", ctx=self._cur["ctx"])
    def body_ctx(self, cnum, title):
        # set context used by subsequent body pages' headers
        self._chapter_ctx=(cnum,title)
    def para(self, text, f=BODY_F,z=BODY_S,lead=BODY_L,sa=BODY_SA,color=INK,indent=0):
        lines=wrap(text,f,z,MEAS-indent)
        for i,ln in enumerate(lines):
            self._ensure(lead)
            self.op("t",ML+indent,self.y-lead+3,f,z,color,ln)
            self.y-=lead
        self.y-=sa
    def bullet(self, text):
        lines=wrap(text,BODY_F,BODY_S,MEAS-16)
        for i,ln in enumerate(lines):
            self._ensure(BODY_L)
            if i==0:
                self.op("dot",ML+3,self.y-BODY_L+6,GOLD)
            self.op("t",ML+16,self.y-BODY_L+3,BODY_F,BODY_S,INK,ln)
            self.y-=BODY_L
        self.y-=2.5
    def heading(self, sid, text):
        depth=sid.count(".")
        z=12.5 if depth<=1 else 10.5
        lead=16 if depth<=1 else 14
        self._ensure(lead+16)
        self.y-=12  # space before
        # keep heading with a couple of lines: if near bottom, ensure already broke
        label=text
        for i,ln in enumerate(wrap(label,"Sans-B",z,MEAS)):
            self._ensure(lead)
            self.op("t",ML,self.y-lead+3,"Sans-B",z,NAVY if depth<=1 else PETROL,ln)
            self.y-=lead
        if depth<=1:
            self.op("line",ML,self.y+2,ML+46,self.y+2,GOLD,0.8)
        self.y-=5
    def callout(self, label, color, text):
        lines=wrap(text,"Serif",10,MEAS-24)
        bh=16+len(lines)*13+12
        self._ensure(bh+6)
        top=self.y
        self.op("crect",ML,top-bh,MEAS,bh,"#FAFBFB",color,1)
        self.op("crect",ML,top-bh,4,bh,color,color,0)
        self.op("t",ML+12,top-14,"Mono-B",8,color,label)
        yy=top-30
        for ln in lines:
            self.op("t",ML+12,yy,"Serif",10,INK,ln); yy-=13
        self.y=top-bh-8
    # ---- dark feature pages ----
    def cover(self):
        self._start("cover"); self.mark("cover","Cover",0)
    def title(self):
        self._start("title"); self.mark("title","Title Page",0)
    def part_divider(self, part):
        self._start("part", extra=part)
        self.mark("part_%d"%part["num"], "PART %s — %s"%(part["part"],part["title"]), 0, toc=True)
    def chapter_open(self, cnum, title):
        self._start("chapopen", extra={"num":cnum,"title":title})
        self.mark("ch_%d"%cnum, "Chapter %d — %s"%(cnum,title), 1, toc=True)
    def diagram_page(self, dd):
        dark = dd["id"] in DARK_DIAGRAMS
        self._start("diagram", extra=dd)
        self.mark("dia_%s"%dd["id"], "Diagram — %s"%dd["title"], 2, toc=True)
    # ---- front matter ----
    def fm_section(self, heading, blocks, key):
        # heading on light page
        self._ensure(40)
        self.mark(key, heading, 1, toc=False)
        self.y-=6
        for ln in wrap(heading,"Sans-B",16,MEAS):
            self._ensure(20); self.op("t",ML,self.y-18,"Sans-B",16,NAVY,ln); self.y-=20
        self.op("line",ML,self.y+2,ML+46,self.y+2,GOLD,0.8); self.y-=10
        for b in blocks:
            t=b["text"]
            if t in CALLOUTS:
                lab,c=CALLOUTS[t]; self.callout(lab,c,t)
            elif b["t"]=="bullet":
                self.bullet(t)
            else:
                self.para(t)

# ---------- TOC pagination (deterministic) ----------
def toc_line_h(level): return 20 if level==0 else (16 if level==1 else 14)
def toc_pages_needed(entries):
    pages=1; y=TOPY-46
    for level,_lab,_key in entries:
        h=toc_line_h(level)
        if y-h<BOTY+18: pages+=1; y=TOPY-24
        y-=h
    return pages

# ============================================================
# BUILD LAYOUT
# ============================================================
def build_layout():
    b=Book()
    # 1 cover, 2 title
    b.cover(); b.title()
    # front matter notices (light)
    b._start("body", ctx=("FM","Front Matter"))
    b._chapter_ctx=("FM","Front Matter")
    b.mark("frontmatter","Front Matter",0)
    b.bmarks_fm=True
    keymap={"Canonical Doctrine Notice":"fm_doctrine","Implementation Scope and Maturity":"fm_scope",
            "How to Read This Book":"fm_howto","Terminology Guide":"fm_terms"}
    for sec in CONTENT["front_matter"]["sections"]:
        b.fm_section(sec["heading"], sec["blocks"], keymap.get(sec["heading"],"fm_"+sec["heading"][:6]))
    # reserve TOC pages
    # entries: Front matter + parts + chapters + diagrams (built after; but count is fixed)
    entries=[(0,"Front Matter","frontmatter")]
    for pt in NAV["parts"]:
        entries.append((0,"PART %s — %s"%(pt["part"],pt["title"]),"part_%d"%pt["num"]))
        for ch in pt["chapters"]:
            title=next(c["title"] for c in CONTENT["chapters"] if c["num"]==ch)
            entries.append((1,"Chapter %d — %s"%(ch,title),"ch_%d"%ch))
            for dd in DIA_BY_ANCHOR.get(ch,[]):
                entries.append((2,"Diagram — %s"%dd["title"],"dia_%s"%dd["id"]))
    ntoc=toc_pages_needed(entries)
    toc_start=len(b.pages)
    for _ in range(ntoc): b._start("toc")
    b.dest["toc"]=toc_start
    # body: parts -> chapters
    for pt in NAV["parts"]:
        b.part_divider(pt)
        for cnum in pt["chapters"]:
            ch=next(c for c in CONTENT["chapters"] if c["num"]==cnum)
            b.chapter_open(cnum, ch["title"])
            # diagrams for this chapter (additive), placed after opening
            for dd in DIA_BY_ANCHOR.get(cnum,[]):
                b.diagram_page(dd)
            # start body page
            b._start("body", ctx=(cnum,ch["title"]))
            b._chapter_ctx=(cnum,ch["title"])
            b._cur["ctx"]=(cnum,ch["title"])
            # Ch17 additive canonical table before body flow
            if cnum==17:
                draw_damage_table_layout(b)
            for blk in ch["blocks"]:
                t=blk["text"]
                if blk["t"]=="sec":
                    b.heading(blk["id"], t)
                elif t in CALLOUTS:
                    lab,c=CALLOUTS[t]; b.callout(lab,c,t)
                elif blk["t"]=="bullet":
                    b.bullet(t)
                else:
                    b.para(t)
    # propagate chapter ctx to each body page for headers (fill missing)
    last=("FM","Front Matter")
    for pg in b.pages:
        if pg["kind"]=="body":
            if pg["ctx"]: last=pg["ctx"]
            else: pg["ctx"]=last
    # fill TOC now that dests known
    fill_toc(b, entries, toc_start, ntoc)
    return b

def draw_damage_table_layout(b):
    """Additive canonical Damage Severity table (Ch17 §§17.101-17.105). Body text remains in flow."""
    rows=[("D0","Negligible","Normal autonomous handling may be appropriate."),
          ("D1","Limited","Logging and local correction may be sufficient."),
          ("D2","Material","Human review or explicit bounded authority is generally required."),
          ("D3","Severe","Immediate containment and senior approval are required."),
          ("D4","Critical or Systemic","Crisis Mode should activate.")]
    # heading
    b._ensure(30)
    b.op("t",ML,b.y-14,"Sans-B",11,NAVY,"Damage Severity — canonical response (additive table)")
    b.y-=22
    c1=0.7*72; c2=1.7*72; c3=MEAS-c1-c2
    hh=18
    b._ensure(hh+10)
    b.op("crect",ML,b.y-hh,MEAS,hh,PETROL,PETROL,0)
    b.op("t",ML+8,b.y-13,"Sans-B",9,WARM,"Class"); b.op("t",ML+c1+6,b.y-13,"Sans-B",9,WARM,"Level")
    b.op("t",ML+c1+c2+6,b.y-13,"Sans-B",9,WARM,"Canonical response")
    b.y-=hh
    for i,(a,bb,cc) in enumerate(rows):
        rl=wrap(cc,"Serif",9.5,c3-12); rh=max(22,8+len(rl)*12+6)
        b._ensure(rh)
        b.op("crect",ML,b.y-rh,MEAS,rh,("#F4F6F7" if i%2 else PAPER),None,0)
        b.op("t",ML+8,b.y-15,"Sans-B",10,GOLD,a)
        b.op("t",ML+c1+6,b.y-15,"Serif",9.5,INK,bb)
        yy=b.y-15
        for ln in rl: b.op("t",ML+c1+c2+6,yy,"Serif",9.5,INK,ln); yy-=12
        b.y-=rh
    b.op("box",ML,b.y,MEAS,(hh+ sum(max(22,8+len(wrap(r[2],"Serif",9.5,c3-12))*12+6) for r in rows)),PETROL)
    b.y-=6
    b.op("t",ML,b.y-9,"Mono",7.5,SLATE,"Additive table · Ch 17 §§17.101-17.105 (verbatim). Full canonical text continues below.")
    b.y-=16

def fill_toc(b, entries, toc_start, ntoc):
    pi=toc_start; y=TOPY
    # title on first toc page
    pg=b.pages[pi]
    pg["ops"].append(("t",ML,y-24,"Sans-B",18,INK,"Table of Contents"))
    pg["ops"].append(("t",ML,y-38,"Mono",7.5,SLATE,"Live navigation · clickable internal links · non-canonical navigational grouping"))
    y=y-52
    for level,label,key in entries:
        h=toc_line_h(level)
        if y-h<BOTY+18:
            pi+=1; pg=b.pages[pi]; y=TOPY-6
        destpage=b.dest.get(key,0)+1
        if level==0:
            pg["ops"].append(("t",ML,y-h+6,"Sans-B",10.5,NAVY,label))
            pg["ops"].append(("line",ML,y-h+1,W-MR,y-h+1,GOLD,0.7))
            pg["ops"].append(("tr",W-MR,y-h+6,"Sans-B",10.5,NAVY,str(destpage)))
        else:
            indent=16 if level==1 else 30
            fnt="Serif" if level==1 else "Serif-I"
            pg["ops"].append(("t",ML+indent,y-h+5,fnt,9.8 if level==1 else 9,INK,label))
            pg["ops"].append(("tr",W-MR,y-h+5,"Sans-B",9.8,GOLD,str(destpage)))
        b.toc_links.append((pi,(ML,y-h+2,W-MR,y+2),key))
        y-=h

# ============================================================
# RENDER
# ============================================================
def draw_header(c, ctx):
    c.setFont("Sans",7); c.setFillColor(col(SLATE))
    c.drawString(ML,HEADY,"OMNIRA · EXECUTIVE INTELLIGENCE")
    if ctx and ctx[0] not in ("FM",):
        right="Chapter %d · %s"%(ctx[0],ctx[1])
    else:
        right=ctx[1] if ctx else ""
    left_w=sw("OMNIRA · EXECUTIVE INTELLIGENCE","Sans",7)
    avail=MEAS-left_w-24
    while sw(right,"Sans",7)>avail and len(right)>6: right=right[:-2]
    c.drawRightString(W-MR,HEADY,right)
    c.setStrokeColor(col(PETROL)); c.setLineWidth(0.6); c.line(ML,HEADY-6,W-MR,HEADY-6)
def draw_footer(c, n, total):
    c.setFont("Sans",8.5); c.setFillColor(col(SLATE))
    c.drawCentredString(W/2,FOOTY,"Page %d of %d"%(n,total))

def render_ops(c, ops):
    for o in ops:
        k=o[0]
        if k=="t":
            _,x,y,f,z,cc,s=o; c.setFont(f,z); c.setFillColor(col(cc)); c.drawString(x,y,s)
        elif k=="tr":
            _,x,y,f,z,cc,s=o; c.setFont(f,z); c.setFillColor(col(cc)); c.drawRightString(x,y,s)
        elif k=="dot":
            _,x,y,cc=o; c.setFillColor(col(cc)); c.circle(x,y,1.8,fill=1,stroke=0)
        elif k=="line":
            _,x1,y1,x2,y2,cc,lw=o; c.setStrokeColor(col(cc)); c.setLineWidth(lw); c.setDash(); c.line(x1,y1,x2,y2)
        elif k=="crect":
            _,x,y,w,h,fillc,strokec,lw=o
            if fillc: c.setFillColor(col(fillc))
            if strokec: c.setStrokeColor(col(strokec)); c.setLineWidth(lw)
            c.rect(x,y,w,h,fill=1 if fillc else 0,stroke=1 if strokec else 0)
        elif k=="box":
            _,x,y,w,h,cc=o; c.setStrokeColor(col(cc)); c.setLineWidth(0.6); c.rect(x,y,w,h,fill=0,stroke=1)

def draw_page(c, pg, n, total):
    kind=pg["kind"]
    if kind=="cover": from_cover(c)
    elif kind=="title": from_title(c)
    elif kind=="part": from_part(c,pg["extra"])
    elif kind=="chapopen": from_chapopen(c,pg["extra"])
    elif kind=="diagram":
        dd=pg["extra"]; dark=dd["id"] in DARK_DIAGRAMS
        if dark: c.setFillColor(col(DARK)); c.rect(0,0,W,H,fill=1,stroke=0)
        DIAGRAMS[dd["id"]](c, dd, dark)
        if not dark: draw_footer(c,n,total)
    else:  # body / toc
        c.setFillColor(col(PAPER)); c.rect(0,0,W,H,fill=1,stroke=0)
        draw_header(c, pg["ctx"] if kind=="body" else ("FM","Front Matter"))
        draw_footer(c,n,total)
        render_ops(c, pg["ops"])

# ---- dark feature pages ----
def from_cover(c):
    c.setFillColor(col(DARK)); c.rect(0,0,W,H,fill=1,stroke=0)
    c.setStrokeColor(col(GOLD)); c.setLineWidth(1.2); c.rect(0.6*72,0.6*72,W-1.2*72,H-1.2*72,fill=0,stroke=1)
    c.setFillColor(col(GOLD)); c.setFont("Mono",9)
    c.drawCentredString(W/2,H-1.7*72,"O M N I R A   A R C H I T E C T U R E   S E R I E S")
    c.setStrokeColor(col(GOLD)); c.setLineWidth(0.7); c.line(W/2-60,H-1.85*72,W/2+60,H-1.85*72)
    c.setFillColor(col(WARM)); c.setFont("Sans-B",30)
    c.drawCentredString(W/2,H/2+70,"EXECUTIVE"); c.drawCentredString(W/2,H/2+30,"INTELLIGENCE")
    c.setFillColor(col(GOLD)); c.setFont("Serif-I",14)
    c.drawCentredString(W/2,H/2-10,"Canonical Architecture and Operating Doctrine")
    c.setStrokeColor(col(NAVY)); c.setLineWidth(2); c.line(W/2-140,H/2-40,W/2+140,H/2-40)
    c.setFillColor(col(WARM)); c.setFont("Sans",11)
    c.drawCentredString(W/2,1.5*72,"PROFESSIONAL EDITION · VERSION 1.0")
def from_title(c):
    c.setFillColor(col(DARK)); c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(col(WARM)); c.setFont("Sans-B",22); c.drawString(1.2*72,H-2.2*72,"Omnira — Executive Intelligence")
    c.setFillColor(col(GOLD)); c.setFont("Serif-I",13); c.drawString(1.2*72,H-2.5*72,"Canonical Architecture and Operating Doctrine")
    c.setStrokeColor(col(NAVY)); c.setLineWidth(1.4); c.line(1.2*72,H-2.7*72,W-1.2*72,H-2.7*72)
    m=CONTENT["front_matter"]["meta"]
    rows=[("Title","Omnira — Executive Intelligence"),
          ("Subtitle","Canonical Architecture and Operating Doctrine"),
          ("Edition","Professional Edition v1.0"),
          ("Build status","PRODUCTION CANDIDATE v1 — not yet final professional release"),
          ("Version",m.get("version","1.0")),
          ("Canonical status",m.get("canonical_status","Approved and locked")),
          ("Approval date",m.get("approval_date","2026-07-08")),
          ("Document owner",m.get("document_owner","André Hultgren")),
          ("Source lineage",m.get("source_lineage","Phase 1.2 Editorial Review Draft")),
          ("Canonical SHA-256","ee85a1a0…0fa555b8")]
    y=H-3.3*72
    for k,v in rows:
        c.setFillColor(col(GOLD)); c.setFont("Mono",8.5); c.drawString(1.2*72,y,k.upper())
        c.setFillColor(col(WARM)); c.setFont("Serif",10.5); c.drawString(3.3*72,y,v); y-=23
    c.setFillColor(col(GHOST)); c.setFont("Serif-I",9)
    c.drawString(1.2*72,1.4*72,"Production candidate for review. Canonical text reproduced verbatim and remains authoritative.")
def from_part(c, pt):
    c.setFillColor(col(DARK)); c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(col(GOLD)); c.setFont("Mono",10); c.drawCentredString(W/2,H/2+80,"P A R T   %s"%pt["part"])
    c.setStrokeColor(col(GOLD)); c.setLineWidth(0.8); c.line(W/2-40,H/2+66,W/2+40,H/2+66)
    c.setFillColor(col(WARM)); c.setFont("Sans-B",26)
    lines=wrap(pt["title"],"Sans-B",26,W-2.4*72); yy=H/2+24
    for ln in lines: c.drawCentredString(W/2,yy,ln); yy-=32
    chs=pt["chapters"]; rng="Chapters %d–%d"%(chs[0],chs[-1])
    c.setFillColor(col(GHOST)); c.setFont("Serif-I",12); c.drawCentredString(W/2,yy-6,rng)
    c.setFillColor(col(GHOST)); c.setFont("Mono",7.5)
    c.drawCentredString(W/2,1.2*72,"Non-canonical navigational grouping added only in the Professional Edition.")
def from_chapopen(c, ex):
    c.setFillColor(col(DARK)); c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(col(GHOST)); c.setFont("Mono",9); c.drawString(1.2*72,H-2.0*72,"C H A P T E R")
    c.setFillColor(col(GOLD)); c.setFont("Sans-B",44); c.drawString(1.2*72,H-2.9*72,str(ex["num"]))
    c.setFillColor(col(WARM)); c.setFont("Sans-B",23)
    ty=H-3.5*72
    for ln in wrap(ex["title"],"Sans-B",23,W-2.4*72):
        c.drawString(1.2*72,ty,ln); ty-=27
    c.setStrokeColor(col(GOLD)); c.setLineWidth(1.4); c.line(1.2*72,ty+6,4.2*72,ty+6)
    c.setFillColor(col(GHOST)); c.setFont("Mono",7.5)
    c.drawString(1.2*72,1.0*72,"The chapter continues with its actual first section on the following page.")

# ============================================================
# DIAGRAMS (additive; labels canonical; no new doctrine)
# ============================================================
def _dia_head(c, dd, dark):
    tc = WARM if dark else INK
    c.setFillColor(col(GHOST if dark else SLATE)); c.setFont("Mono",8)
    c.drawString(ML,H-1.35*72,"DIAGRAM · %s"%(" · ".join(dd["canonical_sections"])))
    c.setFillColor(col(tc)); c.setFont("Sans-B",17)
    yy=H-1.7*72
    for ln in wrap(dd["title"],"Sans-B",17,MEAS): c.drawString(ML,yy,ln); yy-=21
    return yy
def _dia_note(c, dd, dark, extra=""):
    c.setFillColor(col(GHOST if dark else SLATE)); c.setFont("Mono",7)
    txt="Additive presentation layer · labels canonical (%s) · no new doctrine introduced. %s"%(", ".join(dd["canonical_sections"]),extra)
    lines=wrap(txt,"Mono",7,MEAS)
    y=BOTY-2
    for ln in lines:
        c.drawString(ML,y,ln); y-=9
def _box(c,x,y,w,h,fill,stroke,lw=1,dash=None):
    if dash: c.setDash(*dash)
    else: c.setDash()
    if fill: c.setFillColor(col(fill))
    if stroke: c.setStrokeColor(col(stroke)); c.setLineWidth(lw)
    c.roundRect(x,y,w,h,5,fill=1 if fill else 0,stroke=1 if stroke else 0); c.setDash()
def _label(c,x,y,s,f="Sans-B",z=10,cc=INK,center=False,w=None):
    c.setFillColor(col(cc)); c.setFont(f,z)
    (c.drawCentredString(x+w/2,y,s) if center else c.drawString(x,y,s))

def _stacked(c, dd, dark, nodes, accents=None):
    y0=_dia_head(c,dd,dark)-30
    x=ML+30; w=MEAS-60; bh=min(46, (y0-BOTY-40)/max(1,len(nodes))-8); gap=8
    tc=WARM if dark else INK
    y=y0
    for i,n in enumerate(nodes):
        ac=(accents[i] if accents else (GOLD if i==0 else NAVY))
        _box(c,x,y-bh,w,bh,ac,ac,1)
        c.setFillColor(col(WARM)); c.setFont("Sans-B",10.5)
        for j,ln in enumerate(wrap(n,"Sans-B",10.5,w-24)[:2]):
            c.drawString(x+14,y-bh/2-3+(6 if len(wrap(n,'Sans-B',10.5,w-24))>1 and j==0 else 0)-j*11,ln)
        if i<len(nodes)-1:
            c.setStrokeColor(col(GHOST if dark else SLATE)); c.setLineWidth(1.3); c.setDash()
            cx=x+w/2; c.line(cx,y-bh,cx,y-bh-gap)
            c.line(cx,y-bh-gap,cx-3,y-bh-gap+5); c.line(cx,y-bh-gap,cx+3,y-bh-gap+5)
        y-=bh+gap
    _dia_note(c,dd,dark)

def _columns(c, dd, dark, cols):
    y0=_dia_head(c,dd,dark)-24
    n=len(cols); gut=16; x0=ML; cw=(MEAS-(n-1)*gut)/n; ch=y0-BOTY-40
    for i,(title,role,items,ac) in enumerate(cols):
        x=x0+i*(cw+gut)
        _box(c,x,y0-ch,cw,ch,PAPER,ac,1.3,dash=(2,2))
        c.setFillColor(col(ac)); c.rect(x,y0-24,cw,24,fill=1,stroke=0)
        c.setFillColor(col(WARM)); c.setFont("Sans-B",11); c.drawCentredString(x+cw/2,y0-16,title)
        if role:
            c.setFillColor(col(ac)); c.setFont("Serif-I",9.5); c.drawCentredString(x+cw/2,y0-40,role)
        yy=y0-58; c.setFont("Serif",8.6)
        for it in items:
            for ln in wrap(it,"Serif",8.6,cw-18):
                if yy<BOTY+30: break
                c.setFillColor(col(INK)); c.drawString(x+10,yy,ln); yy-=11.5
            yy-=3
    _dia_note(c,dd,dark)

def _cycle(c, dd, dark, nodes):
    y0=_dia_head(c,dd,dark)
    cx,cy=W/2,(y0+BOTY)/2-10; R=min(150,(y0-BOTY)/2-40)
    import math as _m
    pts=[]
    for i,n in enumerate(nodes):
        a=_m.pi/2 - i*2*_m.pi/len(nodes)
        px,py=cx+R*_m.cos(a),cy+R*_m.sin(a); pts.append((px,py))
    # arrows
    c.setStrokeColor(col(GOLD)); c.setLineWidth(1.2); c.setDash()
    for i in range(len(nodes)):
        x1,y1=pts[i]; x2,y2=pts[(i+1)%len(nodes)]
        c.line(x1,y1,x2,y2)
    for i,(px,py) in enumerate(pts):
        _box(c,px-58,py-16,116,32,NAVY,NAVY,1)
        c.setFillColor(col(WARM)); c.setFont("Sans-B",8.2)
        for j,ln in enumerate(wrap(nodes[i],"Sans-B",8.2,104)[:2]):
            c.drawCentredString(px,py-2-j*9+(4 if len(wrap(nodes[i],'Sans-B',8.2,104))>1 else 0),ln)
    _dia_note(c,dd,dark)

# specific diagram implementations
def dia_position(c, dd, dark):
    tc=WARM if dark else INK; sub=GHOST if dark else SLATE
    _dia_head(c,dd,dark)
    cxc=W/2; spine=[("Human Founder / Future Omnira Constitution","ULTIMATE AUTHORITY",GOLD),
        ("Executive Intelligence","LEADERSHIP",GOLD),
        ("Manager / Workforce / Agents / Workflows","COORDINATION & EXECUTION",NAVY),
        ("Execution Results","OUTCOMES",PETROL)]
    bw=3.5*72; bh=38; gap=20; top=H-2.15*72; xs=cxc-bw/2; ys=[]; y=top
    for label,tag,ac in spine:
        ys.append(y); _box(c,xs,y-bh,bw,bh,ac,ac,1)
        c.setFillColor(col(WARM)); c.setFont("Mono",6.2); c.drawString(xs+12,y-13,tag)
        c.setFont("Sans-B",10.5); c.drawString(xs+12,y-29,label); y-=bh+gap
    c.setStrokeColor(col(tc)); c.setLineWidth(1.4); c.setDash()
    for i in range(3):
        c.line(cxc,ys[i]-bh,cxc,ys[i+1]); c.line(cxc,ys[i+1],cxc-3,ys[i+1]+6); c.line(cxc,ys[i+1],cxc+3,ys[i+1]+6)
    fy=ys[3]-bh-gap
    _box(c,xs,fy-bh,bw,bh,("#20303C" if dark else "#EEF1F3"),sub,1,dash=(3,2))
    c.setFillColor(col(sub)); c.setFont("Mono",6.2); c.drawString(xs+12,fy-13,"EXECUTION RESULTS & FEEDBACK — EVIDENCE, NOT AUTHORITY")
    c.setFillColor(col(tc)); c.setFont("Sans-B",9.5); c.drawString(xs+12,fy-29,"Performance Intelligence · Memory · Knowledge")
    rx=xs+bw+30; c.setStrokeColor(col(GOLD)); c.setLineWidth(1.2); c.setDash(2,2)
    c.line(xs+bw,fy-bh/2,rx,fy-bh/2); c.line(rx,fy-bh/2,rx,ys[1]-bh/2); c.line(rx,ys[1]-bh/2,xs+bw,ys[1]-bh/2)
    c.line(xs+bw,ys[1]-bh/2,xs+bw+6,ys[1]-bh/2-4); c.line(xs+bw,ys[1]-bh/2,xs+bw+6,ys[1]-bh/2+4); c.setDash()
    sy=fy-bh-28
    c.setFillColor(col(sub)); c.setFont("Mono",6.4); c.drawString(xs,sy+8,"SUPPORTING FUNCTIONS — NOT IN THE AUTHORITY CHAIN")
    hw=(bw-14)/2; sbh=36
    _box(c,xs,sy-sbh,hw,sbh,("#20303C" if dark else "#F2F4F5"),NAVY,1,dash=(2,2))
    c.setFillColor(col(sub)); c.setFont("Mono",6); c.drawString(xs+8,sy-12,"USER-FACING SURFACE")
    c.setFillColor(col(tc)); c.setFont("Sans-B",8.5); c.drawString(xs+8,sy-26,"Atlas communicates")
    gx=xs+hw+14; _box(c,gx,sy-sbh,hw,sbh,("#20303C" if dark else "#F2F4F5"),GHOST,1,dash=(2,2))
    c.setFillColor(col(sub)); c.setFont("Mono",6); c.drawString(gx+8,sy-12,"RESOURCE SELECTION")
    c.setFillColor(col(tc)); c.setFont("Sans-B",8.5); c.drawString(gx+8,sy-22,"AI Intelligence")
    c.drawString(gx+8,sy-31,"selects resources")
    c.setFillColor(col(sub)); c.setFont("Mono",6.4)
    c.drawCentredString(cxc,sy-sbh-16,"Canonical position model — Chapter 2 §§2.2–2.3.  Solid = authority & direction; dashed = communication / resource selection; gold loop = evidence feedback.")

def dia_emw(c, dd, dark):
    _columns(c,dd,dark,[
     ("EXECUTIVE","= leadership",["What matters?","Why now?","What should be prioritized?","What should not be started?","What requires approval?","What should be delegated?","What must be escalated?"],GOLD),
     ("MANAGER","= coordination",["Who is assigned?","What is the status?","What is blocked?","What is next?","Which workflow step should run?","Which task needs routing?","Which report needs to be returned?"],NAVY),
     ("WORKFORCE","= execution",["What work must be performed?","What specialist skill is required?","What output must be produced?","What tool should be used?","What constraints apply?","What quality standard must be met?"],SLATE)])
    # legend (separate entries; no merged label)
    _legend(c,[("Executive leadership (gold)",GOLD),("Manager coordination (navy)",NAVY),("Workforce execution (grey)",SLATE)])

def dia_sev_bound(c, dd, dark):
    y0=_dia_head(c,dd,dark)-16
    gut=18; cw=(MEAS-gut)/2; top=y0; chh=top-BOTY-52
    A=[("D0","Negligible","Normal autonomous handling may be appropriate.",GHOST),
       ("D1","Limited","Logging and local correction may be sufficient.",GHOST),
       ("D2","Material","Human review or explicit bounded authority is generally required.",GOLD),
       ("D3","Severe","Immediate containment and senior approval are required.",GOLD),
       ("D4","Critical or Systemic","Crisis Mode should activate.",RED)]
    B=[("Below Boundary","The action may proceed within valid authority.",GHOST),
       ("Near Boundary","The action may proceed only with additional controls.",GOLD),
       ("Crosses Boundary","The action requires explicit human authority or a valid high-confidence mandate.",GOLD),
       ("Prohibited Regardless of Approval","Some actions may remain prohibited because they violate: Law, Customer ownership, Constitutional rules, Security requirements, Non-negotiable safety boundaries.",RED)]
    def panel(x,title,rows,codefmt):
        c.setFillColor(col(NAVY)); c.rect(x,top-24,cw,24,fill=1,stroke=0)
        c.setFillColor(col(WARM)); c.setFont("Sans-B",9); c.drawString(x+12,top-16,title)
        y=top-32
        for row in rows:
            if codefmt: code,name,resp,cc=row; head="%s — %s"%(code,name)
            else: name,resp,cc=row[0],row[1],row[2]; head=name
            hl=wrap(head,"Sans-B",8.6,cw-24); rl=wrap(resp,"Serif",8.4,cw-24)
            rh=8+len(hl)*11+2+len(rl)*11+8
            _box(c,x,y-rh,cw,rh,PAPER,cc,1)
            c.setFillColor(col(cc)); c.rect(x,y-rh,3,rh,fill=1,stroke=0)
            yy=y-13; c.setFillColor(col(INK)); c.setFont("Sans-B",8.6)
            for ln in hl: c.drawString(x+12,yy,ln); yy-=11
            yy-=2; c.setFillColor(col("#33404A")); c.setFont("Serif",8.4)
            for ln in rl: c.drawString(x+12,yy,ln); yy-=11
            y-=rh+6
        return y
    yA=panel(ML,"PANEL A — DAMAGE SEVERITY",A,True)
    yB=panel(ML+cw+gut,"PANEL B — BOUNDARY STATES",B,False)
    ymin=min(yA,yB)
    c.setFillColor(col(SLATE));
    for i,cap in enumerate(["Two distinct canonical classification systems (Ch 17 §§17.100-17.119). No one-to-one mapping between severity and boundary state is implied.",
                            '"Prohibited Regardless of Approval" is a separate boundary state, not a severity class. D4 renders: Crisis Mode should activate.']):
        yy=ymin-6-i*20
        for ln in wrap(cap,"Mono",7,MEAS): c.setFont("Mono",7); c.drawString(ML,yy,ln); yy-=10
    # separate legend entries (refinement 13): crisis and prohibited NOT merged
    _legend(c,[("Autonomous / low (D0–D1)",GHOST),("Approval / added controls",GOLD),
               ("D4 Critical — Crisis Mode",RED),("Prohibited (separate boundary state)",PETROL)])

def dia_stage(c, dd, dark):
    y0=_dia_head(c,dd,dark)-16
    gut=20; cw=(MEAS-gut)/2; top=y0; chh=top-BOTY-60
    stage1=["Executive Context","Daily Executive Brief","Decision Ledger V1","Executive Mission Brief V1",
            "Explicit human authorization","Safe Manager & Workforce handoff","Project-scoped status & evidence","Basic traceability & review"]
    future=["Full Approval Inbox","Full policy engine","Damage Boundary engine","Trust Score",
            "Autonomy Licensing","Automatic autonomy progression","Crisis Mode & Emergency Brake","L4–L6 autonomy"]
    _box(c,ML,top-chh,cw,chh,PAPER,NAVY,1.4,dash=(2,2))
    c.setFillColor(col(NAVY)); c.rect(ML,top-26,cw,26,fill=1,stroke=0)
    c.setFillColor(col(WARM)); c.setFont("Sans-B",9); c.drawString(ML+12,top-17,"STAGE 1 · APPROVED INITIAL SCOPE")
    yy=top-46
    for s in stage1:
        c.setFillColor(col(GOLD)); c.circle(ML+16,yy+3,2.2,fill=1,stroke=0)
        c.setFillColor(col(INK)); c.setFont("Serif",9.3); c.drawString(ML+26,yy,s); yy-=17
    x1=ML+cw+gut
    _box(c,x1,top-chh,cw,chh,"#F2F3F4",GHOST,1.4,dash=(4,3))
    c.setFillColor(col(GHOST)); c.rect(x1,top-26,cw,26,fill=1,stroke=0)
    c.setFillColor(col(WARM)); c.setFont("Sans-B",9); c.drawString(x1+12,top-13,"FUTURE TARGET")
    c.setFillColor(col("#E8EAEC")); c.setFont("Mono",6); c.drawString(x1+12,top-22,"NOT IMPLEMENTED IN STAGE 1")
    yy=top-46
    for s in future:
        c.setStrokeColor(col(GHOST)); c.setLineWidth(1); c.setDash(2,2); c.line(x1+12,yy+3,x1+20,yy+3); c.setDash()
        c.setFillColor(col(SLATE)); c.setFont("Serif",9.3); c.drawString(x1+26,yy,s); yy-=17
    _dia_note(c,dd,dark,"Stage 1 = approved initial scope (not a claim of implementation).")
    _legend(c,[("Stage 1 scope (solid)",NAVY),("Future target (dashed)",GHOST)])

def _legend(c, items):
    x=ML; y=BOTY+16
    c.setFont("Mono",7.5)
    for lab,cc in items:
        c.setFillColor(col(cc)); c.rect(x,y-1,16,7,fill=1,stroke=0)
        c.setFillColor(col(SLATE)); c.drawString(x+22,y,lab)
        x+=sw(lab,"Mono",7.5)+46
        if x>W-MR-120: x=ML; y-=13

def _ctitle(cn): return next(x["title"] for x in CONTENT["chapters"] if x["num"]==cn)
def _chap_nodes(cn, k=10):
    out=[]
    for sid,lab in sec_titles(cn, k):
        if lab.lower().startswith("purpose of this chapter"): continue
        out.append(lab)
    # dedupe preserve order
    seen=set(); return [n for n in out if not (n in seen or seen.add(n))]

def make_titlenode_diagram(kind):
    def fn(c, dd, dark):
        # gather canonical section titles across the diagram's chapters
        nodes=[]
        for ch in dd["chapters"]:
            nodes.extend(_chap_nodes(ch, 10))
        seen=set(); nodes=[n for n in nodes if not (n in seen or seen.add(n))]
        if not nodes: nodes=["(section)"]
        if kind=="stacked":
            _stacked(c,dd,dark,nodes[:8])
        elif kind=="cycle":
            _cycle(c,dd,dark,nodes[:7])
        elif kind=="columns2":
            chs=dd["chapters"]
            if len(chs)>=2:
                col1=_chap_nodes(chs[0],9)[:8]; col2=_chap_nodes(chs[1],9)[:8]
                _columns(c,dd,dark,[(_ctitle(chs[0]).upper()[:26],"",col1,NAVY),
                                    (_ctitle(chs[1]).upper()[:26],"",col2,PETROL)])
            else:
                nn=nodes[:12]; half=math.ceil(len(nn)/2)
                parts=dd["title"].split(" vs ")
                t1=parts[0]; t2=parts[1] if len(parts)>1 else "Related"
                _columns(c,dd,dark,[(t1.upper()[:26],"",nn[:half],NAVY),
                                    (t2.upper()[:26],"",nn[half:],PETROL)])
    return fn

def dia_autonomy(c, dd, dark):
    _stacked(c,dd,dark,AUTONOMY, accents=[GHOST,GHOST,PETROL,NAVY,GOLD,GOLD,RED])
def dia_trust(c, dd, dark):
    y0=_dia_head(c,dd,dark)-30
    x=ML; w=MEAS; steps=AUTONOMY
    bw=w/len(steps)
    for i,s in enumerate(steps):
        ac=[GHOST,GHOST,PETROL,NAVY,NAVY,GOLD,RED][i]
        h=40+i*14
        _box(c,x+i*bw+3,BOTY+70,bw-6,h,ac,ac,1)
        c.saveState(); c.translate(x+i*bw+bw/2,BOTY+78); c.rotate(90)
        c.setFillColor(col(WARM)); c.setFont("Sans-B",7.4); c.drawString(0,-3,s[:22]); c.restoreState()
    c.setFillColor(col(SLATE)); c.setFont("Mono",7)
    c.drawString(ML,BOTY+52,"Autonomy levels are canonical (Terminology Guide: L0–L6). Progression is gated by trust and governance; not automatic.")
    _dia_note(c,dd,dark)

DIAGRAMS={
 "D01":dia_position, "D02":dia_emw,
 "D03":make_titlenode_diagram("columns2"),
 "D04":make_titlenode_diagram("stacked"),
 "D05":make_titlenode_diagram("cycle"),
 "D06":make_titlenode_diagram("stacked"),
 "D07":make_titlenode_diagram("stacked"),
 "D08":make_titlenode_diagram("columns2"),
 "D09":make_titlenode_diagram("stacked"),
 "D10":dia_sev_bound,
 "D11":dia_autonomy,
 "D12":dia_trust,
 "D13":make_titlenode_diagram("stacked"),
 "D14":dia_position if False else make_titlenode_diagram("cycle"),
 "D15":make_titlenode_diagram("columns2"),
 "D16":make_titlenode_diagram("stacked"),
 "D17":make_titlenode_diagram("stacked"),
 "D18":dia_stage,
}

# ============================================================
# MAIN
# ============================================================
def set_meta(c):
    c.setTitle("Omnira — Executive Intelligence — Professional Edition Candidate v1 (PRODUCTION CANDIDATE — not final release)")
    c.setAuthor("André Hultgren")
    c.setSubject("Canonical Architecture and Operating Doctrine — Professional Edition PRODUCTION CANDIDATE v1")
    c.setKeywords("Omnira, Executive Intelligence, Professional Edition, PRODUCTION CANDIDATE v1, not final release, Canonical v1.0")
    c.setCreator("Omnira Publishing Systems — build_professional_edition.py (ReportLab)")

def main():
    mode=os.environ.get("BUILD_MODE","measure")
    b=build_layout()
    total=len(b.pages)
    if mode=="measure":
        pm={"total_pages":total,
            "dest":{k:v+1 for k,v in b.dest.items()},
            "bookmarks":[(lvl,title,b.dest.get(key,0)+1,key) for (lvl,title,key) in b.bmarks],
            "toc":[(lvl,label,b.dest.get(key,0)+1,key) for (lvl,label,key) in b.toc],
            "toc_links":[(sp+1,rect,b.dest.get(key,0)+1,key) for (sp,rect,key) in b.toc_links],
            "kinds":{}}
        from collections import Counter
        pm["kinds"]=dict(Counter(p["kind"] for p in b.pages))
        json.dump(pm, open(os.path.join(HERE,"build_pagemap.json"),"w"))
        print("TOTAL_PAGES",total)
        print("kinds",pm["kinds"])
        print("bookmarks",len(b.bmarks),"toc",len(b.toc),"toc_links",len(b.toc_links))
        return
    if mode in ("full","candidate"):
        out=os.environ.get("OUT")
        c=canvas.Canvas(out, pagesize=letter); set_meta(c)
        keys_by_page={}
        for k,pi in b.dest.items(): keys_by_page.setdefault(pi,[]).append(k)
        links_by_page={}
        for (sp,rect,key) in b.toc_links: links_by_page.setdefault(sp,[]).append((rect,key))
        for idx in range(total):
            for k in keys_by_page.get(idx,[]): c.bookmarkPage(k)
            draw_page(c, b.pages[idx], idx+1, total)
            for (rect,key) in links_by_page.get(idx,[]):
                c.linkAbsolute(key,key,(rect[0],rect[1],rect[2],rect[3]))
            c.showPage()
        added=set()
        for (lvl,title,key) in b.bmarks:
            if key in added: continue
            added.add(key)
            try: c.addOutlineEntry(title,key,min(lvl,2),0)
            except Exception: pass
        c.showOutline()
        try:
            from reportlab.pdfbase.pdfdoc import PDFString
            c._doc.Catalog.Lang=PDFString("en-US")
        except Exception: pass
        c.save()
        print("CANDIDATE",out,"pages",total)
        return
    if mode=="render":
        a=int(os.environ["PAGE_FROM"]); z=int(os.environ["PAGE_TO"]); out=os.environ["SEG_OUT"]
        c=canvas.Canvas(out, pagesize=letter)
        set_meta(c)
        for idx in range(a, min(z,total)):
            draw_page(c, b.pages[idx], idx+1, total)
            c.showPage()
        c.save()
        print("SEG",out,"pages",min(z,total)-a)
        return

if __name__=="__main__":
    main()
