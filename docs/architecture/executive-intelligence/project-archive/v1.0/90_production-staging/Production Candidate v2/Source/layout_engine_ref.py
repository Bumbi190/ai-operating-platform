# -*- coding: utf-8 -*-
"""
Phase 3.3.1 — pagination layout engine (A/B/C).
Reproduces the Candidate v1 body layout (Layout A) faithfully from the SAME geometry
and type scale as build_professional_edition.py, then adds two controlled variants
(B controlled-compact, C reference-optimized) with keep-with-next + widow/orphan control.
No canonical text is altered; blocks are consumed verbatim and in order.
Writes nothing outside the paths passed on the command line.
"""
import os, sys, json, math
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor

W, H = letter
FD = "/usr/share/fonts/truetype/dejavu/"
for nm, fn in [("Serif","DejaVuSerif.ttf"),("Serif-B","DejaVuSerif-Bold.ttf"),
               ("Serif-I","DejaVuSerif-Italic.ttf"),("Sans","DejaVuSans.ttf"),
               ("Sans-B","DejaVuSans-Bold.ttf"),("Mono","DejaVuSansMono.ttf")]:
    pdfmetrics.registerFont(TTFont(nm, FD+fn))

# locked Executive Gold palette (identical to production build)
DARK="#0E1A26"; PAPER="#FFFFFF"; INK="#14202B"; WARM="#F4F1EA"; SLATE="#5A6672"
GOLD="#C8A24B"; NAVY="#1F3B57"; PETROL="#183850"; RED="#B4442E"; GHOST="#8A939D"
def col(x): return HexColor(x)

ML=1.15*72; MR=1.0*72            # horizontal margins locked (design system)
MEAS=W-ML-MR
BODY_F, BODY_S = "Serif", 10.5   # locked type scale

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

# ---------- layout configurations ----------
CONFIGS={
 "A": dict(name="Layout A — Current Baseline",
     MT=1.25*72, MB=1.0*72, body_lead=14.5, para_sa=3.5, bullet_sa=2.5,
     h_top_z=12.5, h_top_lead=16, h_sub_z=10.5, h_sub_lead=14,
     h_before=12, h_after=5, keep=False, wo=False, kt_max=0),
 "B": dict(name="Layout B — Controlled Compact",
     MT=1.17*72, MB=0.94*72, body_lead=14.5, para_sa=1.6, bullet_sa=1.1,
     h_top_z=12.5, h_top_lead=16, h_sub_z=10.5, h_sub_lead=14,
     h_before=7, h_after=3, keep=True, wo=True, kt_max=3),
 "C": dict(name="Layout C — Reference Optimized",
     MT=1.19*72, MB=0.97*72, body_lead=14.0, para_sa=2.4, bullet_sa=1.5,
     h_top_z=12.5, h_top_lead=15.4, h_sub_z=10.5, h_sub_lead=13.6,
     h_before=9, h_after=4, keep=True, wo=True, kt_max=4),
}

def cfg_geom(cfg):
    TOPY=H-cfg["MT"]; BOTY=cfg["MB"]; return TOPY, BOTY

# ---------- block -> line atoms ----------
def block_lines(blk, cfg):
    """Return dict describing a block's rendered lines (verbatim wrap)."""
    t=blk["t"]; text=blk["text"]
    if t=="sec":
        sid=blk.get("id","") or text.split(None,1)[0]
        depth=sid.count(".")
        z=cfg["h_top_z"] if depth<=1 else cfg["h_sub_z"]
        lead=cfg["h_top_lead"] if depth<=1 else cfg["h_sub_lead"]
        lines=wrap(text,"Sans-B",z,MEAS)
        return dict(kind="heading", depth=depth, font="Sans-B", z=z, lead=lead,
                    color=(NAVY if depth<=1 else PETROL), x=ML,
                    lines=lines, before=cfg["h_before"], after=cfg["h_after"],
                    underline=(depth<=1))
    if t=="bullet":
        lines=wrap(text,BODY_F,BODY_S,MEAS-16)
        return dict(kind="bullet", font=BODY_F, z=BODY_S, lead=cfg["body_lead"],
                    color=INK, x=ML+16, lines=lines, before=0, after=cfg["bullet_sa"],
                    underline=False)
    lines=wrap(text,BODY_F,BODY_S,MEAS)
    return dict(kind="para", font=BODY_F, z=BODY_S, lead=cfg["body_lead"],
                color=INK, x=ML, lines=lines, before=0, after=cfg["para_sa"],
                underline=False)

# ---------- paginator ----------
def paginate(blocks, cfg):
    """Flow blocks into pages. Returns (pages, stats).
    pages: list of list of draw items. Applies keep-with-next + widow/orphan when cfg says so."""
    TOPY, BOTY = cfg_geom(cfg)
    bottom=BOTY+6
    pages=[]; page=[]; y=TOPY
    stats=dict(widows=0, orphans=0, heading_bottom=0, heading_short_follow=0, split_lt3=0,
               near_empty_tail=0, pages=0)
    L=[block_lines(b,cfg) for b in blocks]

    def newpage():
        nonlocal page,y
        pages.append(page); page=[]; y=TOPY

    n=len(L)
    for bi,bl in enumerate(L):
        lines=bl["lines"]; lead=bl["lead"]; nlines=len(lines)
        # space before (heading)
        before=bl["before"]
        # ---- keep-with-next: heading needs >=2 following body lines on same page ----
        if bl["kind"]=="heading" and cfg["keep"]:
            if bi+1<n:
                follow=min(2, len(L[bi+1]["lines"]))
                need=before + nlines*lead + bl["after"] + follow*L[bi+1]["lead"]
            else:
                need=before + nlines*lead
            if y-need < bottom and page:
                newpage()
        # ---- orphan control: don't strand a paragraph's first line as page's last line ----
        if bl["kind"] in ("para","bullet") and cfg["wo"] and nlines>=2:
            if y-(before+2*lead) < bottom and page:
                newpage()
        # ---- keep-together small blocks ----
        if cfg["keep"] and cfg["kt_max"] and nlines<=cfg["kt_max"] and bl["kind"]!="heading":
            if y-(before+nlines*lead+bl["after"]) < bottom and page:
                newpage()

        # place before-space
        y-=before
        placed_this=0
        i=0
        while i<len(lines):
            ln=lines[i]
            if y-lead < bottom and page:
                # would break here; widow control: avoid leaving exactly 1 line for next page
                remaining=len(lines)-i
                if cfg["wo"] and bl["kind"] in ("para","bullet") and remaining==1 and placed_this>=1:
                    # pull the previous line down: remove last placed line from this page
                    # (re-add it to remaining by stepping back)
                    # find and pop last item of this block on the page
                    for k in range(len(page)-1,-1,-1):
                        if page[k].get("blk")==bi:
                            popped=page.pop(k); i-=1; placed_this-=1; break
                # measurement: widow (single trailing line moved) / orphan
                if placed_this==0:
                    stats["orphans"]+=1  # whole block bumped (its first line was going to be alone)
                elif len(lines)-i==1:
                    stats["widows"]+=1
                newpage()
                continue
            # draw
            item=dict(x=bl["x"], y=y-lead+3, font=bl["font"], z=bl["z"],
                      color=bl["color"], text=ln, blk=bi, kind=bl["kind"])
            if bl["kind"]=="bullet" and i==0:
                item["dot"]=(ML+3, y-lead+6)
            page.append(item)
            if bl["kind"]=="heading" and bl["underline"] and i==len(lines)-1:
                item["underline"]=(ML, y-lead+1, ML+46)
            y-=lead; i+=1; placed_this+=1
        # after-space
        y-=bl["after"]
        # heading-at-bottom measurement (baseline): heading placed but no body line after on page
        if bl["kind"]=="heading":
            # is there a following body line on this same page?
            if bi+1<n:
                # crude: if remaining space < one body line -> heading bottom
                if y-L[bi+1]["lead"] < bottom:
                    stats["heading_bottom"]+=1
    if page: pages.append(page)
    stats["pages"]=len(pages)
    return pages, stats

# ---------- rendering helpers ----------
def draw_header(c, cfg, ctx):
    c.setFont("Sans",7); c.setFillColor(col(SLATE))
    c.drawString(ML,H-0.5*72,"OMNIRA · EXECUTIVE INTELLIGENCE")
    right=ctx or ""
    c.drawRightString(W-MR,H-0.5*72,right)
    c.setStrokeColor(col(PETROL)); c.setLineWidth(0.6); c.line(ML,H-0.5*72-6,W-MR,H-0.5*72-6)

def draw_footer(c, cfg, label):
    c.setFont("Sans",8.5); c.setFillColor(col(SLATE))
    c.drawCentredString(W/2,0.55*72,label)

def render_page(c, items, cfg, header, footer):
    c.setFillColor(col(PAPER)); c.rect(0,0,W,H,fill=1,stroke=0)
    draw_header(c,cfg,header); draw_footer(c,cfg,footer)
    for it in items:
        if "dot" in it:
            c.setFillColor(col(GOLD)); c.circle(it["dot"][0],it["dot"][1],1.8,fill=1,stroke=0)
        c.setFont(it["font"],it["z"]); c.setFillColor(col(it["color"])); c.drawString(it["x"],it["y"],it["text"])
        if "underline" in it:
            x1,yy,x2=it["underline"]; c.setStrokeColor(col(GOLD)); c.setLineWidth(0.8); c.setDash(); c.line(x1,yy,x2,yy)

# ---------- chapter-opening options (dark) ----------
def draw_chapter_open(c, num, title, variant, first_section_lines=None):
    c.setFillColor(col(DARK)); c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(col(GHOST)); c.setFont("Mono",9); c.drawString(1.2*72,H-2.0*72,"C H A P T E R")
    c.setFillColor(col(GOLD)); c.setFont("Sans-B",44); c.drawString(1.2*72,H-2.9*72,str(num))
    c.setFillColor(col(WARM)); c.setFont("Sans-B",23)
    ty=H-3.5*72
    for ln in wrap(title,"Sans-B",23,W-2.4*72):
        c.drawString(1.2*72,ty,ln); ty-=27
    c.setStrokeColor(col(GOLD)); c.setLineWidth(1.4); c.line(1.2*72,ty+6,4.2*72,ty+6)
    if variant=="A":
        c.setFillColor(col(GHOST)); c.setFont("Serif-I",10)
        c.drawString(1.2*72,1.0*72,"Executive Intelligence · Professional Edition")
    else:
        # Option B: begin the chapter's actual first canonical section (verbatim, dark panel)
        yy=ty-34
        c.setFillColor(col(GOLD)); c.setFont("Mono",8)
        if first_section_lines:
            c.drawString(1.2*72,yy,first_section_lines[0]["label"]); yy-=20
            c.setFillColor(col(WARM)); c.setFont("Serif",11)
            for ln in first_section_lines[1:]:
                if yy<1.2*72: break
                c.drawString(1.2*72,yy,ln); yy-=15
        c.setFillColor(col(GHOST)); c.setFont("Mono",7.5)
        c.drawString(1.2*72,0.9*72,"Opening excerpt is verbatim canonical text — no boilerplate, no rewrite.")
