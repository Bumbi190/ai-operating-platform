# -*- coding: utf-8 -*-
"""
Omnira — Executive Intelligence — Professional Edition — PRODUCTION CANDIDATE v2 builder.
Phase 3.3.2. Deterministic, reproducible.

Locked design decisions (HUMAN_DESIGN_DECISION.md):
  * Layout C — Reference Optimized: DejaVu Serif 10.5 / 14.0 leading; para-after 2.4; list-after 1.5;
    heading before/after 9/4; top/bottom margin 1.19"/0.97"; keep-with-next ON; widow/orphan ON;
    keep-together <= 4 lines.
  * Opening Option B — Canonical Excerpt for every chapter (number, exact canonical title, verbatim
    beginning of the chapter's first canonical section; NO boilerplate line).
  * Diagrams: 17 included (D14 removed — REDUNDANT WITH D01); D04 contrast-fixed; others per approved assets.

Text source: content_map.json (parsed from LOCKED Canonical v1.0 DOCX). No canonical text is summarised,
rewritten, shortened, merged, replaced by a diagram/callout/table, or reordered. Every canonical body
block is emitted exactly once, in order.

Modes (env BUILD_MODE): measure | render (PAGE_FROM PAGE_TO SEG_OUT) | candidate (OUT)
"""
import os, sys, json
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
import diagrams_final as DV

W,H=letter
HERE=os.path.dirname(os.path.abspath(__file__))
# read-only source inputs live in the Candidate v1 Source (unchanged); reference them directly.
V1SRC=os.path.normpath(os.path.join(HERE,"..","..","Production","Source"))
CONTENT=json.load(open(os.path.join(V1SRC,"content_map.json")))
NAV=json.load(open(os.path.join(V1SRC,"navigation_map.json")))
DIAG_ALL=json.load(open(os.path.join(V1SRC,"diagram_source_map.json")))

# fonts
FD="/usr/share/fonts/truetype/dejavu/"
for nm,fn in [("Serif","DejaVuSerif.ttf"),("Serif-B","DejaVuSerif-Bold.ttf"),
              ("Serif-I","DejaVuSerif-Italic.ttf"),("Sans","DejaVuSans.ttf"),
              ("Sans-B","DejaVuSans-Bold.ttf"),("Mono","DejaVuSansMono.ttf"),
              ("Mono-B","DejaVuSansMono-Bold.ttf")]:
    pdfmetrics.registerFont(TTFont(nm,FD+fn))

# palette
DARK="#0E1A26"; PAPER="#FFFFFF"; INK="#14202B"; WARM="#F4F1EA"; SLATE="#5A6672"
GOLD="#C8A24B"; NAVY="#1F3B57"; PETROL="#183850"; RED="#B4442E"; GHOST="#8A939D"
def col(x): return HexColor(x)

# ---- geometry: horizontal margins locked; vertical per Layout C ----
ML=1.15*72; MR=1.0*72; MT=1.19*72; MB=0.97*72
TOPY=H-MT; BOTY=MB; MEAS=W-ML-MR
HEADY=H-0.5*72; FOOTY=0.55*72

# ---- Layout C type scale (locked) ----
BODY_F, BODY_S, BODY_L, BODY_SA = "Serif", 10.5, 14.0, 2.4
BULLET_SA=1.5
H_BEFORE, H_AFTER = 9, 4
KT_MAX=4   # keep-together for blocks up to 4 lines
BOTTOM=BOTY+6

def sw(s,f,z): return pdfmetrics.stringWidth(s,f,z)
def wrap(text,f,z,maxw):
    out=[]; cur=""
    for w in text.split():
        t=w if not cur else cur+" "+w
        if sw(t,f,z)<=maxw: cur=t
        else:
            if cur: out.append(cur)
            if sw(w,f,z)>maxw:
                s=""
                for ch in w:
                    if sw(s+ch,f,z)<=maxw: s+=ch
                    else: out.append(s); s=ch
                cur=s
            else: cur=w
    if cur: out.append(cur)
    return out or [""]

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

# diagrams: exclude D14; build anchor map from remaining
DIAG=[d for d in DIAG_ALL["diagrams"] if d["id"] not in DV.EXCLUDED]
DIA_BY_ANCHOR={}
for dd in DIAG: DIA_BY_ANCHOR.setdefault(dd["anchor_chapter"],[]).append(dd)
DIAGRAM_COUNT=len(DIAG)  # 17

CHAP_OF_PART={}
for pt in NAV["parts"]:
    for ch in pt["chapters"]: CHAP_OF_PART[ch]=pt

def chapter_first_excerpt(cnum, max_paras=3):
    """First canonical section heading + first paragraphs (verbatim) for Opening Option B."""
    ch=next(c for c in CONTENT["chapters"] if c["num"]==cnum)
    blocks=ch["blocks"]
    label=None; paras=[]
    for i,b in enumerate(blocks):
        if b["t"]=="sec":
            label=b["text"]
            for b2 in blocks[i+1:]:
                if b2["t"]=="sec": break
                if b2["t"] in ("para","bullet"):
                    paras.append(b2["text"])
                if len(paras)>=max_paras: break
            break
    return label, paras

# ============================================================
class Book:
    def __init__(self):
        self.pages=[]; self.dest={}; self.bmarks=[]; self.toc=[]; self.toc_links=[]; self._cur=None
        self._blk=0; self._after_heading=False
    def _start(self, kind, ctx=None, extra=None):
        pg={"kind":kind,"ctx":ctx,"extra":extra or {},"ops":[]}
        self.pages.append(pg); self._cur=pg; self.y=TOPY
        return len(self.pages)-1
    def mark(self, key, title=None, level=None, toc=False):
        self.dest[key]=len(self.pages)-1
        if title is not None and level is not None:
            self.bmarks.append((level,title,key))
            if toc: self.toc.append((level,title,key))
    def op(self,*a): self._cur["ops"].append(a)
    def _newpage(self): self._start("body", ctx=self._cur["ctx"])
    # ---- body primitives with keep-with-next + widow/orphan + keep-together ----
    def para(self, text, f=BODY_F,z=BODY_S,lead=BODY_L,sa=BODY_SA,color=INK,indent=0,bullet=False):
        lines=wrap(text,f,z,MEAS-(16 if bullet else 0)-indent)
        n=len(lines); bid=self._blk; self._blk+=1
        x=ML+(16 if bullet else 0)+indent
        ah=self._after_heading; self._after_heading=False
        # orphan: >=2 lines and <2 fit -> break first (skip right after a heading; keep-with-next
        # already reserved room for >=2 lines, so we must not strand the heading).
        if not ah and n>=2 and self.y-2*lead < BOTTOM and self._cur["kind"]=="body" and self._cur["ops"]:
            self._newpage()
        # keep-together small block (skip right after a heading, for the same reason)
        if not ah and n<=KT_MAX and self.y-(n*lead+sa) < BOTTOM and self._cur["kind"]=="body" and self._cur["ops"]:
            self._newpage()
        i=0; placed=0
        while i<n:
            if self.y-lead < BOTTOM and self._cur["ops"]:
                # widow: avoid leaving exactly 1 line for next page
                if placed>=1 and (n-i)==1:
                    for k in range(len(self._cur["ops"])-1,-1,-1):
                        o=self._cur["ops"][k]
                        if len(o)>=8 and o[7]=="BODYLINE":
                            self._cur["ops"].pop(k); i-=1; placed-=1; self.y+=lead; break
                self._newpage()
                continue
            ln=lines[i]
            if bullet and i==0:
                self.op("dot",ML+3,self.y-lead+6,GOLD)
            self.op("t",x,self.y-lead+3,f,z,color,ln,"BODYLINE",bid,i,n,("bullet" if bullet else "para"))
            self.y-=lead; i+=1; placed+=1
        self.y-=sa
    def bullet(self, text):
        self.para(text, sa=BULLET_SA, bullet=True)
    def heading(self, sid, text):
        depth=sid.count(".")
        z=12.5 if depth<=1 else 10.5
        lead=16 if depth<=1 else 14
        # keep-with-next: heading + 2 body lines must fit
        need=H_BEFORE + len(wrap(text,"Sans-B",z,MEAS))*lead + H_AFTER + 2*BODY_L
        if self.y-need < BOTTOM and self._cur["ops"]:
            self._newpage()
        bid=self._blk; self._blk+=1
        self.y-=H_BEFORE
        for ln in wrap(text,"Sans-B",z,MEAS):
            if self.y-lead < BOTTOM and self._cur["ops"]:
                self._newpage()
            self.op("t",ML,self.y-lead+3,"Sans-B",z,NAVY if depth<=1 else PETROL,ln,"HEAD",bid,0,1,"heading")
            self.y-=lead
            if depth<=1:
                self.op("line",ML,self.y+lead-2,ML+46,self.y+lead-2,GOLD,0.8)
        self.y-=H_AFTER
        self._after_heading=True
    def callout(self, label, color, text):
        self._after_heading=False
        lines=wrap(text,"Serif",10,MEAS-24)
        bh=16+len(lines)*13+12
        if self.y-(bh+6) < BOTTOM and self._cur["ops"]:
            self._newpage()
        top=self.y
        self.op("crect",ML,top-bh,MEAS,bh,"#FAFBFB",color,1)
        self.op("crect",ML,top-bh,4,bh,color,color,0)
        self.op("t",ML+12,top-14,"Mono-B",8,color,label,"CO")
        yy=top-30
        for ln in lines:
            self.op("t",ML+12,yy,"Serif",10,INK,ln,"CO"); yy-=13
        self.y=top-bh-8
    def ensure_tail_fits(self, group_height):
        # Blocker A: if the chapter's closing group would not fit in the remaining space, break now so
        # it flows together onto the final page (never leaving a stray closing sentence alone).
        if group_height<=0: return
        usable=TOPY-BOTTOM
        if group_height>usable: return   # group larger than a page: leave normal flow
        if self.y-group_height < BOTTOM and self._cur["kind"]=="body" and self._cur["ops"]:
            self._newpage()
        self._after_heading=False
    def cover(self): self._start("cover"); self.mark("cover","Cover",0)
    def title(self): self._start("title"); self.mark("title","Title Page",0)
    def part_divider(self, part):
        self._start("part", extra=part)
        self.mark("part_%d"%part["num"], "PART %s — %s"%(part["part"],part["title"]), 0, toc=True)
    def chapter_open(self, cnum, title):
        label,paras=chapter_first_excerpt(cnum)
        self._start("chapopen", extra={"num":cnum,"title":title,"label":label,"paras":paras})
        self.mark("ch_%d"%cnum, "Chapter %d — %s"%(cnum,title), 1, toc=True)
    def diagram_page(self, dd):
        self._start("diagram", extra=dd)
        self.mark("dia_%s"%dd["id"], "Diagram — %s"%dd["title"], 2, toc=True)
    def fm_section(self, heading, blocks, key):
        if self.y-40 < BOTTOM: self._newpage()
        self.mark(key, heading, 1, toc=False)
        self.y-=6
        for ln in wrap(heading,"Sans-B",16,MEAS):
            if self.y-20<BOTTOM: self._newpage()
            self.op("t",ML,self.y-18,"Sans-B",16,NAVY,ln,"HEAD"); self.y-=20
        self.op("line",ML,self.y+2,ML+46,self.y+2,GOLD,0.8); self.y-=10
        for b in blocks:
            t=b["text"]
            if t in CALLOUTS: lab,c=CALLOUTS[t]; self.callout(lab,c,t)
            elif b["t"]=="bullet": self.bullet(t)
            else: self.para(t)

# ---- Candidate v3 (Blocker A): chapter-tail cohesion ----
TAIL_TARGET_H = 200.0    # keep enough closing content together so the final page is not sparse
TAIL_CAP_H    = 460.0    # never group more than this (well under one page)

def measure_block_height(blk):
    t=blk["t"]; text=blk["text"]
    if t=="sec":
        sid=blk.get("id","") or text.split(None,1)[0]
        depth=sid.count("."); z=12.5 if depth<=1 else 10.5; lead=16 if depth<=1 else 14
        n=len(wrap(text,"Sans-B",z,MEAS))
        return H_BEFORE + n*lead + H_AFTER
    if t=="bullet":
        n=len(wrap(text,BODY_F,BODY_S,MEAS-16)); return n*BODY_L + BULLET_SA
    if text in CALLOUTS:
        n=len(wrap(text,"Serif",10,MEAS-24)); return 16+n*13+12+8
    n=len(wrap(text,BODY_F,BODY_S,MEAS)); return n*BODY_L + BODY_SA

def chapter_tail_start(blocks):
    """Smallest suffix of the chapter whose total height >= TAIL_TARGET_H (capped), so the closing
    section stays with a meaningful part of the preceding content and never lands alone."""
    total=0.0; i=len(blocks)
    while i>0:
        h=measure_block_height(blocks[i-1])
        if total+h>TAIL_CAP_H and total>=TAIL_TARGET_H*0.5: break
        i-=1; total+=h
        if total>=TAIL_TARGET_H: break
    return i, total

def toc_line_h(level): return 20 if level==0 else (16 if level==1 else 14)
def toc_pages_needed(entries):
    pages=1; y=TOPY-46
    for level,_lab,_key in entries:
        h=toc_line_h(level)
        if y-h<BOTY+18: pages+=1; y=TOPY-24
        y-=h
    return pages

def build_layout():
    b=Book()
    b.cover(); b.title()
    b._start("body", ctx=("FM","Front Matter")); b.mark("frontmatter","Front Matter",0)
    keymap={"Canonical Doctrine Notice":"fm_doctrine","Implementation Scope and Maturity":"fm_scope",
            "How to Read This Book":"fm_howto","Terminology Guide":"fm_terms"}
    for sec in CONTENT["front_matter"]["sections"]:
        b.fm_section(sec["heading"], sec["blocks"], keymap.get(sec["heading"],"fm_"+sec["heading"][:6]))
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
    for pt in NAV["parts"]:
        b.part_divider(pt)
        for cnum in pt["chapters"]:
            ch=next(c for c in CONTENT["chapters"] if c["num"]==cnum)
            b.chapter_open(cnum, ch["title"])
            for dd in DIA_BY_ANCHOR.get(cnum,[]):
                b.diagram_page(dd)
            b._start("body", ctx=(cnum,ch["title"]))
            if cnum==17: draw_damage_table_layout(b)
            _blocks=ch["blocks"]
            _tail_i,_tail_h=chapter_tail_start(_blocks)
            for _idx,blk in enumerate(_blocks):
                if _idx==_tail_i: b.ensure_tail_fits(_tail_h)
                t=blk["text"]
                if blk["t"]=="sec": b.heading(blk["id"], t)
                elif t in CALLOUTS: lab,c=CALLOUTS[t]; b.callout(lab,c,t)
                elif blk["t"]=="bullet": b.bullet(t)
                else: b.para(t)
    last=("FM","Front Matter")
    for pg in b.pages:
        if pg["kind"]=="body":
            if pg["ctx"]: last=pg["ctx"]
            else: pg["ctx"]=last
    fill_toc(b, entries, toc_start, ntoc)
    return b

def draw_damage_table_layout(b):
    rows=[("D0","Negligible","Normal autonomous handling may be appropriate."),
          ("D1","Limited","Logging and local correction may be sufficient."),
          ("D2","Material","Human review or explicit bounded authority is generally required."),
          ("D3","Severe","Immediate containment and senior approval are required."),
          ("D4","Critical or Systemic","Crisis Mode should activate.")]
    if b.y-30<BOTTOM: b._newpage()
    b.op("t",ML,b.y-14,"Sans-B",11,NAVY,"Damage Severity — canonical response (additive table)","HEAD")
    b.y-=22
    c1=0.7*72; c2=1.7*72; c3=MEAS-c1-c2; hh=18
    if b.y-(hh+10)<BOTTOM: b._newpage()
    b.op("crect",ML,b.y-hh,MEAS,hh,PETROL,PETROL,0)
    b.op("t",ML+8,b.y-13,"Sans-B",9,WARM,"Class","CO"); b.op("t",ML+c1+6,b.y-13,"Sans-B",9,WARM,"Level","CO")
    b.op("t",ML+c1+c2+6,b.y-13,"Sans-B",9,WARM,"Canonical response","CO")
    b.y-=hh
    for i,(a,bb,cc) in enumerate(rows):
        rl=wrap(cc,"Serif",9.5,c3-12); rh=max(22,8+len(rl)*12+6)
        if b.y-rh<BOTTOM: b._newpage()
        b.op("crect",ML,b.y-rh,MEAS,rh,("#F4F6F7" if i%2 else PAPER),None,0)
        b.op("t",ML+8,b.y-15,"Sans-B",10,GOLD,a,"CO")
        b.op("t",ML+c1+6,b.y-15,"Serif",9.5,INK,bb,"CO")
        yy=b.y-15
        for ln in rl: b.op("t",ML+c1+c2+6,yy,"Serif",9.5,INK,ln,"CO"); yy-=12
        b.y-=rh
    b.op("t",ML,b.y-9,"Mono",7.5,SLATE,"Additive table · Ch 17 §§17.101-17.105 (verbatim). Full canonical text continues below.","CO")
    b.y-=16

def fill_toc(b, entries, toc_start, ntoc):
    pi=toc_start; y=TOPY
    pg=b.pages[pi]
    pg["ops"].append(("t",ML,y-24,"Sans-B",18,INK,"Table of Contents","CO"))
    pg["ops"].append(("t",ML,y-38,"Mono",7.5,SLATE,"Live navigation · clickable internal links · non-canonical navigational grouping","CO"))
    y=y-52
    for level,label,key in entries:
        h=toc_line_h(level)
        if y-h<BOTY+18:
            pi+=1; pg=b.pages[pi]; y=TOPY-6
        destpage=b.dest.get(key,0)+1
        if level==0:
            pg["ops"].append(("t",ML,y-h+6,"Sans-B",10.5,NAVY,label,"CO"))
            pg["ops"].append(("line",ML,y-h+1,W-MR,y-h+1,GOLD,0.7))
            pg["ops"].append(("tr",W-MR,y-h+6,"Sans-B",10.5,NAVY,str(destpage)))
        else:
            indent=16 if level==1 else 30
            fnt="Serif" if level==1 else "Serif-I"
            pg["ops"].append(("t",ML+indent,y-h+5,fnt,9.8 if level==1 else 9,INK,label,"CO"))
            pg["ops"].append(("tr",W-MR,y-h+5,"Sans-B",9.8,GOLD,str(destpage)))
        b.toc_links.append((pi,(ML,y-h+2,W-MR,y+2),key))
        y-=h

# ============================================================
def draw_header(c, ctx):
    c.setFont("Sans",7); c.setFillColor(col(SLATE))
    c.drawString(ML,HEADY,"OMNIRA · EXECUTIVE INTELLIGENCE")
    if ctx and ctx[0] not in ("FM",): right="Chapter %d · %s"%(ctx[0],ctx[1])
    else: right=ctx[1] if ctx else ""
    left_w=sw("OMNIRA · EXECUTIVE INTELLIGENCE","Sans",7); avail=MEAS-left_w-24
    while sw(right,"Sans",7)>avail and len(right)>6: right=right[:-2]
    c.drawRightString(W-MR,HEADY,right)
    c.setStrokeColor(col(PETROL)); c.setLineWidth(0.6); c.line(ML,HEADY-6,W-MR,HEADY-6)
def draw_footer(c, n, total):
    c.setFont("Sans",8.5); c.setFillColor(col(SLATE))
    c.drawCentredString(W/2,FOOTY,"Page %d of %d"%(n,total))
def render_ops(c, ops):
    for o in ops:
        k=o[0]
        if k=="t": _,x,y,f,z,cc,s,*_=o; c.setFont(f,z); c.setFillColor(col(cc)); c.drawString(x,y,s)
        elif k=="tr": _,x,y,f,z,cc,s=o; c.setFont(f,z); c.setFillColor(col(cc)); c.drawRightString(x,y,s)
        elif k=="dot": _,x,y,cc=o; c.setFillColor(col(cc)); c.circle(x,y,1.8,fill=1,stroke=0)
        elif k=="line": _,x1,y1,x2,y2,cc,lw=o; c.setStrokeColor(col(cc)); c.setLineWidth(lw); c.setDash(); c.line(x1,y1,x2,y2)
        elif k=="crect":
            _,x,y,w,h,fillc,strokec,lw=o
            if fillc: c.setFillColor(col(fillc))
            if strokec: c.setStrokeColor(col(strokec)); c.setLineWidth(lw)
            c.rect(x,y,w,h,fill=1 if fillc else 0,stroke=1 if strokec else 0)

def draw_page(c, pg, n, total):
    kind=pg["kind"]
    if kind=="cover": from_cover(c)
    elif kind=="title": from_title(c)
    elif kind=="part": from_part(c,pg["extra"])
    elif kind=="chapopen": from_chapopen(c,pg["extra"])
    elif kind=="diagram":
        dd=pg["extra"]; did=dd["id"]; dark=DV.is_dark(did)
        if dark: c.setFillColor(col(DARK)); c.rect(0,0,W,H,fill=1,stroke=0)
        else: c.setFillColor(col(PAPER)); c.rect(0,0,W,H,fill=1,stroke=0)
        DV.draw(c, did)
        if not dark: draw_footer(c,n,total)
    else:
        c.setFillColor(col(PAPER)); c.rect(0,0,W,H,fill=1,stroke=0)
        draw_header(c, pg["ctx"] if kind=="body" else ("FM","Front Matter"))
        draw_footer(c,n,total)
        render_ops(c, pg["ops"])

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
          ("Build status","FINAL PROFESSIONAL RELEASE"),
          ("Layout baseline","Layout C — Reference Optimized (locked)"),
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
    c.drawString(1.2*72,1.4*72,"Final professional release. Canonical text reproduced verbatim and remains authoritative.")
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
    # Opening Option B — Canonical Excerpt (locked). No boilerplate line.
    c.setFillColor(col(DARK)); c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(col(GHOST)); c.setFont("Mono",9); c.drawString(1.2*72,H-2.0*72,"C H A P T E R")
    c.setFillColor(col(GOLD)); c.setFont("Sans-B",44); c.drawString(1.2*72,H-2.9*72,str(ex["num"]))
    c.setFillColor(col(WARM)); c.setFont("Sans-B",23)
    ty=H-3.5*72
    for ln in wrap(ex["title"],"Sans-B",23,W-2.4*72):
        c.drawString(1.2*72,ty,ln); ty-=27
    c.setStrokeColor(col(GOLD)); c.setLineWidth(1.4); c.line(1.2*72,ty+6,4.2*72,ty+6)
    yy=ty-30
    if ex.get("label"):
        c.setFillColor(col(GOLD)); c.setFont("Mono",8.5); c.drawString(1.2*72,yy,ex["label"]); yy-=20
    c.setFillColor(col(WARM)); c.setFont("Serif",11)
    for p in ex.get("paras",[]):
        for ln in wrap(p,"Serif",11,W-2.4*72):
            if yy<1.0*72: break
            c.drawString(1.2*72,yy,ln); yy-=15
        yy-=6
        if yy<1.0*72: break
    # Candidate v3 (Blocker B): internal QA/proof comment removed from chapter openings.

def set_meta(c):
    c.setTitle("Omnira — Executive Intelligence — Professional Edition v1.0 (FINAL PROFESSIONAL RELEASE)")
    c.setAuthor("André Hultgren")
    c.setSubject("Canonical Architecture and Operating Doctrine — Professional Edition v1.0 (FINAL PROFESSIONAL RELEASE)")
    c.setKeywords("Omnira, Executive Intelligence, Professional Edition, v1.0, FINAL PROFESSIONAL RELEASE, Canonical v1.0, Layout C")
    c.setCreator("Omnira Publishing Systems — build_final_edition.py (ReportLab)")

def main():
    mode=os.environ.get("BUILD_MODE","measure")
    b=build_layout(); total=len(b.pages)
    if mode=="measure":
        from collections import Counter
        pm={"total_pages":total,"dest":{k:v+1 for k,v in b.dest.items()},
            "bookmarks":[(lvl,title,b.dest.get(key,0)+1,key) for (lvl,title,key) in b.bmarks],
            "toc":[(lvl,label,b.dest.get(key,0)+1,key) for (lvl,label,key) in b.toc],
            "toc_links":[(sp+1,rect,b.dest.get(key,0)+1,key) for (sp,rect,key) in b.toc_links],
            "kinds":dict(Counter(p["kind"] for p in b.pages)),"diagrams":DIAGRAM_COUNT}
        json.dump(pm, open(os.path.join(HERE,"build_pagemap_final.json"),"w"))
        print("TOTAL_PAGES",total); print("kinds",pm["kinds"]); print("diagrams",DIAGRAM_COUNT)
        print("bookmarks",len(b.bmarks),"toc",len(b.toc),"toc_links",len(b.toc_links))
        return
    if mode=="candidate":
        out=os.environ["OUT"]
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
        c.save(); print("CANDIDATE",out,"pages",total)
        return
    if mode=="render":
        a=int(os.environ["PAGE_FROM"]); z=int(os.environ["PAGE_TO"]); out=os.environ["SEG_OUT"]
        c=canvas.Canvas(out, pagesize=letter); set_meta(c)
        for idx in range(a, min(z,total)):
            draw_page(c, b.pages[idx], idx+1, total); c.showPage()
        c.save(); print("SEG",out,"pages",min(z,total)-a)
        return

if __name__=="__main__": main()
