# -*- coding: utf-8 -*-
"""
Candidate v2 diagram set (17 diagrams; D14 excluded).
 - Kept unchanged (ported verbatim from the Candidate v1 builder): D01, D02, D10, D11, D18.
 - Corrected / rebuilt (from Phase 3.3.1, canonically grounded): D03, D04*, D05, D06, D07, D08,
   D09, D12, D13, D15, D16, D17.  (*D04 = contrast fix only.)
Every node/label/relation is traceable to Canonical v1.0; no new doctrine.
"""
import math
import diagrams_toolkit as DB
from reportlab.pdfbase import pdfmetrics
from reportlab.lib.colors import HexColor

# ---- palette / geometry for KEPT v1 renderers (identical to Candidate v1 builder) ----
W,H = DB.W, DB.H
DARK="#0E1A26"; PAPER="#FFFFFF"; INK="#14202B"; WARM="#F4F1EA"; SLATE="#5A6672"
GOLD="#C8A24B"; NAVY="#1F3B57"; PETROL="#183850"; RED="#B4442E"; GHOST="#8A939D"
def col(x): return HexColor(x)
ML=1.15*72; MR=1.0*72; MT=1.25*72; MB=1.0*72
TOPY=H-MT; BOTY=MB; MEAS=W-ML-MR
def sw(s,f,z): return pdfmetrics.stringWidth(s,f,z)
def wrap(t,f,z,mw): return DB.wrap(t,f,z,mw)
AUTONOMY=["L0 — Observe","L1 — Recommend","L2 — Prepare","L3 — Execute Internally",
          "L4 — External Low-Risk","L5 — Conditional Business Autonomy","L6 — Full Strategic Autonomy"]

def _dia_head(c, dd, dark):
    tc = WARM if dark else INK
    c.setFillColor(col(GHOST if dark else SLATE)); c.setFont("Mono",8)
    _did=dd.get("id","").strip()
    _label=("DIAGRAM %s · %s"%(_did," · ".join(dd["canonical_sections"]))) if _did else ("DIAGRAM · %s"%(" · ".join(dd["canonical_sections"])))
    c.drawString(ML,H-1.35*72,_label)
    c.setFillColor(col(tc)); c.setFont("Sans-B",17)
    yy=H-1.7*72
    for ln in wrap(dd["title"],"Sans-B",17,MEAS): c.drawString(ML,yy,ln); yy-=21
    return yy
def _dia_note(c, dd, dark, extra=""):
    c.setFillColor(col(GHOST if dark else SLATE)); c.setFont("Mono",7)
    txt="Additive presentation layer · labels canonical (%s) · no new doctrine introduced. %s"%(", ".join(dd["canonical_sections"]),extra)
    y=BOTY-2
    for ln in wrap(txt,"Mono",7,MEAS): c.drawString(ML,y,ln); y-=9
def _box(c,x,y,w,h,fill,stroke,lw=1,dash=None):
    if dash: c.setDash(*dash)
    else: c.setDash()
    if fill: c.setFillColor(col(fill))
    if stroke: c.setStrokeColor(col(stroke)); c.setLineWidth(lw)
    c.roundRect(x,y,w,h,5,fill=1 if fill else 0,stroke=1 if stroke else 0); c.setDash()
def _legend(c, items):
    x=ML; y=BOTY+16; c.setFont("Mono",7.5)
    for lab,cc in items:
        c.setFillColor(col(cc)); c.rect(x,y-1,16,7,fill=1,stroke=0)
        c.setFillColor(col(SLATE)); c.drawString(x+22,y,lab)
        x+=sw(lab,"Mono",7.5)+46
        if x>W-MR-120: x=ML; y-=13
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
    _legend(c,[("Executive leadership (gold)",GOLD),("Manager coordination (navy)",NAVY),("Workforce execution (grey)",SLATE)])

def dia_sev_bound(c, dd, dark):
    y0=_dia_head(c,dd,dark)-16
    gut=18; cw=(MEAS-gut)/2; top=y0
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
    ymin=min(yA,yB); c.setFillColor(col(SLATE))
    for i,cap in enumerate(["Two distinct canonical classification systems (Ch 17 §§17.100-17.119). No one-to-one mapping between severity and boundary state is implied.",
                            '"Prohibited Regardless of Approval" is a separate boundary state, not a severity class. D4 renders: Crisis Mode should activate.']):
        yy=ymin-6-i*20
        for ln in wrap(cap,"Mono",7,MEAS): c.setFont("Mono",7); c.drawString(ML,yy,ln); yy-=10
    _legend(c,[("Autonomous / low (D0–D1)",GHOST),("Approval / added controls",GOLD),
               ("D4 Critical — Crisis Mode",RED),("Prohibited (separate boundary state)",PETROL)])

def _stacked(c, dd, dark, nodes, accents=None):
    y0=_dia_head(c,dd,dark)-30
    x=ML+30; w=MEAS-60; bh=min(46, (y0-BOTY-40)/max(1,len(nodes))-8); gap=8
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

def dia_autonomy(c, dd, dark):
    _stacked(c,dd,dark,AUTONOMY, accents=[GHOST,GHOST,PETROL,NAVY,GOLD,GOLD,RED])

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

# ---- KEPT diagram metadata (title + canonical sections), from diagram_source_map ----
KEPT_META={
 "D01":dict(id="D01", title="Omnira Intelligence Position Model", canonical_sections=["Ch 2 §§2.2-2.3"]),
 "D02":dict(title="Executive · Manager · Workforce", canonical_sections=["Ch 3 §3.2"]),
 "D10":dict(title="Damage Severity & Boundary States", canonical_sections=["Ch 17 §§17.100-17.119"]),
 "D11":dict(title="Autonomy Licensing Model", canonical_sections=["Ch 18"]),
 "D18":dict(title="Stage 1 vs Future Target Architecture", canonical_sections=["Front matter — Implementation Scope"]),
}
KEPT_FUNCS={"D01":dia_position}   # D01 stays as its approved dark plate
KEPT_DARK={"D01"}

# ---- Candidate v3 (Blocker D): D02, D10, D11, D18 rebuilt in the dark Executive Gold family.
#      Exact same content / labels / levels / categories / colours. No new nodes, relations, doctrine.
def _c_d02(c):
    dd={"id":"D02","title":"Executive · Manager · Workforce","src":["Ch 3 §3.2"]}
    y0=DB.header(c,dd)-24
    cols=[("EXECUTIVE","= leadership",
           ["What matters?","Why now?","What should be prioritized?","What should not be started?",
            "What requires approval?","What should be delegated?","What must be escalated?"],DB.GOLD),
          ("MANAGER","= coordination",
           ["Who is assigned?","What is the status?","What is blocked?","What is next?",
            "Which workflow step should run?","Which task needs routing?","Which report needs to be returned?"],DB.NAVY),
          ("WORKFORCE","= execution",
           ["What work must be performed?","What specialist skill is required?","What output must be produced?",
            "What tool should be used?","What constraints apply?","What quality standard must be met?"],DB.SLATE)]
    n=3; gut=16; cw=(DB.MEAS-(n-1)*gut)/n; ch=y0-1.45*72
    for i,(hd,role,items,ac) in enumerate(cols):
        x=DB.ML+i*(cw+gut)
        DB.box(c,x,y0-ch,cw,ch,DB.PANEL,ac,1.3)
        c.setFillColor(DB.col(ac));c.rect(x,y0-24,cw,24,fill=1,stroke=0)
        c.setFillColor(DB.col(DB.WARM));c.setFont("Sans-B",11);c.drawCentredString(x+cw/2,y0-16,hd)
        c.setFillColor(DB.col(DB.GOLD));c.setFont("Serif-I",9);c.drawCentredString(x+cw/2,y0-40,role)
        yy=y0-58;c.setFont("Serif",8.8)
        for it in items:
            for ln in DB.wrap(it,"Serif",8.8,cw-18):
                if yy<1.55*72: break
                c.setFillColor(DB.col(DB.WARM));c.drawString(x+10,yy,ln);yy-=13
            yy-=3.5
    DB.legend(c,[("Executive leadership (gold)",DB.GOLD),("Manager coordination (navy)",DB.NAVY),
                 ("Workforce execution (grey)",DB.SLATE)])

def _c_d10(c):
    dd={"id":"D10","title":"Damage Severity & Boundary States","src":["Ch 17 §§17.100-17.119"]}
    y0=DB.header(c,dd)-16
    gut=18; cw=(DB.MEAS-gut)/2; top=y0
    A=[("D0","Negligible","Normal autonomous handling may be appropriate.",DB.GHOST),
       ("D1","Limited","Logging and local correction may be sufficient.",DB.GHOST),
       ("D2","Material","Human review or explicit bounded authority is generally required.",DB.GOLD),
       ("D3","Severe","Immediate containment and senior approval are required.",DB.GOLD),
       ("D4","Critical or Systemic","Crisis Mode should activate.",DB.RED)]
    B=[("Below Boundary","The action may proceed within valid authority.",DB.GHOST),
       ("Near Boundary","The action may proceed only with additional controls.",DB.GOLD),
       ("Crosses Boundary","The action requires explicit human authority or a valid high-confidence mandate.",DB.GOLD),
       ("Prohibited Regardless of Approval","Some actions may remain prohibited because they violate: Law, Customer ownership, Constitutional rules, Security requirements, Non-negotiable safety boundaries.",DB.RED)]
    def panel(x,title,rows,codefmt):
        c.setFillColor(DB.col(DB.PANEL2));c.rect(x,top-24,cw,24,fill=1,stroke=0)
        c.setStrokeColor(DB.col(DB.GOLD));c.setLineWidth(0.8);c.rect(x,top-24,cw,24,fill=0,stroke=1)
        c.setFillColor(DB.col(DB.WARM));c.setFont("Sans-B",9);c.drawString(x+12,top-16,title)
        y=top-32
        for row in rows:
            if codefmt: code,name,resp,cc=row; head="%s — %s"%(code,name)
            else: name,resp,cc=row[0],row[1],row[2]; head=name
            hl=DB.wrap(head,"Sans-B",8.6,cw-24); rl=DB.wrap(resp,"Serif",8.4,cw-24)
            rh=8+len(hl)*11+2+len(rl)*11+8
            DB.box(c,x,y-rh,cw,rh,DB.PANEL,cc,1.1)
            c.setFillColor(DB.col(cc));c.rect(x,y-rh,3,rh,fill=1,stroke=0)
            yy=y-13;c.setFillColor(DB.col(DB.WARM));c.setFont("Sans-B",8.6)
            for ln in hl: c.drawString(x+12,yy,ln);yy-=11
            yy-=2;c.setFillColor(DB.col("#C9D2DA"));c.setFont("Serif",8.4)
            for ln in rl: c.drawString(x+12,yy,ln);yy-=11
            y-=rh+6
        return y
    yA=panel(DB.ML,"PANEL A — DAMAGE SEVERITY",A,True)
    yB=panel(DB.ML+cw+gut,"PANEL B — BOUNDARY STATES",B,False)
    ymin=min(yA,yB)
    c.setFillColor(DB.col(DB.GHOST))
    for i,cap in enumerate(["Two distinct canonical classification systems (Ch 17 §§17.100-17.119). No one-to-one mapping between severity and boundary state is implied.",
                            '"Prohibited Regardless of Approval" is a separate boundary state, not a severity class. D4 renders: Crisis Mode should activate.']):
        yy=ymin-8-i*20
        for ln in DB.wrap(cap,"Mono",7,DB.MEAS): c.setFont("Mono",7);c.drawString(DB.ML,yy,ln);yy-=10
    DB.legend(c,[("Autonomous / low (D0–D1)",DB.GHOST),("Approval / added controls",DB.GOLD),
                 ("D4 Critical — Crisis Mode",DB.RED),("Prohibited (separate boundary state)",DB.PETROL)])

def _c_d11(c):
    dd={"id":"D11","title":"Autonomy Licensing Model","src":["Ch 18","Terminology Guide L0–L6"]}
    y0=DB.header(c,dd)-26
    levels=["L0 — Observe","L1 — Recommend","L2 — Prepare","L3 — Execute Internally",
            "L4 — External Low-Risk","L5 — Conditional Business Autonomy","L6 — Full Strategic Autonomy"]
    acc=[DB.GHOST,DB.GHOST,DB.PETROL,DB.NAVY,DB.GOLD,DB.GOLD,DB.RED]
    x=DB.ML+30; w=DB.MEAS-60; n=len(levels); gap=9; bh=min(48,(y0-1.7*72)/n-gap); y=y0
    for i,lab in enumerate(levels):
        DB.boxlabel(c,x,y-bh,w,bh,lab,None,fill=DB.PANEL,accent=acc[i],tz=11)
        y-=bh+gap
    c.setFillColor(DB.col(DB.GHOST));c.setFont("Mono",7.5)
    c.drawString(x,y+2,"Autonomy is licensed, not assumed — canonical levels L0–L6 (Ch 18; Terminology Guide).")
    DB.legend(c,[("Observe / recommend (L0–L1)",DB.GHOST),("Prepare / internal (L2–L3)",DB.NAVY),
                 ("External / conditional (L4–L5)",DB.GOLD),("Full strategic (L6)",DB.RED)])

def _c_d18(c):
    dd={"id":"D18","title":"Stage 1 vs Future Target Architecture","src":["Front matter — Implementation Scope"]}
    y0=DB.header(c,dd)-18
    gut=20; cw=(DB.MEAS-gut)/2; top=y0; ch=top-1.7*72
    stage1=["Executive Context","Daily Executive Brief","Decision Ledger V1","Executive Mission Brief V1",
            "Explicit human authorization","Safe Manager & Workforce handoff","Project-scoped status & evidence","Basic traceability & review"]
    future=["Full Approval Inbox","Full policy engine","Damage Boundary engine","Trust Score",
            "Autonomy Licensing","Automatic autonomy progression","Crisis Mode & Emergency Brake","L4–L6 autonomy"]
    # Stage 1 (solid, navy/gold)
    DB.box(c,DB.ML,top-ch,cw,ch,DB.PANEL,DB.NAVY,1.4)
    c.setFillColor(DB.col(DB.NAVY));c.rect(DB.ML,top-26,cw,26,fill=1,stroke=0)
    c.setFillColor(DB.col(DB.WARM));c.setFont("Sans-B",9);c.drawString(DB.ML+12,top-17,"STAGE 1 · APPROVED INITIAL SCOPE")
    yy=top-46
    for s in stage1:
        c.setFillColor(DB.col(DB.GOLD));c.circle(DB.ML+16,yy+3,2.4,fill=1,stroke=0)
        c.setFillColor(DB.col(DB.WARM));c.setFont("Serif",9.4);c.drawString(DB.ML+26,yy,s);yy-=18
    # Future target (dashed, ghost)
    x1=DB.ML+cw+gut
    DB.box(c,x1,top-ch,cw,ch,DB.PANEL2,DB.GHOST,1.4,dash=(4,3))
    c.setFillColor(DB.col(DB.PANEL));c.rect(x1,top-26,cw,26,fill=1,stroke=0)
    c.setStrokeColor(DB.col(DB.GHOST));c.setLineWidth(1.0);c.setDash(4,3);c.rect(x1,top-26,cw,26,fill=0,stroke=1);c.setDash()
    c.setFillColor(DB.col(DB.WARM));c.setFont("Sans-B",9);c.drawString(x1+12,top-13,"FUTURE TARGET")
    c.setFillColor(DB.col(DB.GHOST));c.setFont("Mono",6);c.drawString(x1+12,top-22,"NOT IMPLEMENTED IN STAGE 1")
    yy=top-46
    for s in future:
        c.setStrokeColor(DB.col(DB.GHOST));c.setLineWidth(1);c.setDash(2,2);c.line(x1+12,yy+3,x1+20,yy+3);c.setDash()
        c.setFillColor(DB.col("#C9D2DA"));c.setFont("Serif",9.4);c.drawString(x1+26,yy,s);yy-=18
    c.setFillColor(DB.col(DB.GHOST));c.setFont("Mono",7.5)
    c.drawString(DB.ML,top-ch-14,"Stage 1 = approved initial scope (not a claim of implementation).")
    DB.legend(c,[("Stage 1 scope (solid)",DB.NAVY),("Future target (dashed)",DB.GHOST)])

# ---- CORRECTED drawers (dark full-page), from Phase 3.3.1 (D14 excluded; D04 contrast-fixed) ----
def _c_d03(c):
    dd={"id":"D03","title":"Portfolio Executive vs Project Executive","src":["Ch 4 §4.4","Ch 5 §5.4"]}
    left=("PORTFOLIO EXECUTIVE","governs across projects",
        ["Portfolio Scope (§4.5)","Portfolio Objectives (§4.12)","Portfolio Prioritization (§4.13)",
         "Portfolio Resource Allocation (§4.23)","Cross-Project Dependencies (§4.27)",
         "Portfolio Approval View (§4.33)","Portfolio Autonomy View (§4.32)"],DB.NAVY)
    right=("PROJECT EXECUTIVE","governs one project",
        ["Project Identity (§5.7)","Project Goals (§5.13)","Project Priorities (§5.14)",
         "Project Strategy (§5.16)","Project Roadmap (§5.17)","Project Autonomy Licenses (§5.24)",
         "Project Trust Score (§5.25)"],DB.PETROL)
    DB.two_columns(c,dd,left,right,relation="Directs (§5.53)  /  Escalates (§5.52)")
def _c_d04(c):  # CONTRAST FIX: bright frame colours + WARM labels (handled in toolkit)
    dd={"id":"D04","title":"Project Isolation & Executive Boundaries","src":["Ch 6 §§6.4–6.8, 6.40–6.43"]}
    layers=[("Default-Deny Project Isolation (§6.7)",DB.RED),
            ("Explicit Scope Before Action (§6.6) · Scope Envelope (§6.5)",DB.GOLD),
            ("Least Privilege (§6.8) · Authority Narrowing (§6.40)",DB.GHOST),
            ("Isolated Project (§6.4 Boundary Model)",DB.GOLD)]
    DB.boundary_model(c,dd,layers,denied="Cross-project request → denied by default; only via Governed Summaries (§6.42–6.43)")
def _c_d05(c):
    dd={"id":"D05","title":"Leadership Loop — Executive Operating Cadence","src":["Ch 7 §7.4, §§7.8–7.70"]}
    nodes=[("Daily Executive Brief","§7.8"),("Weekly Executive Cycle","§7.26"),
           ("Monthly Executive Review","§7.45"),("Quarterly Strategic Review","§7.57"),
           ("Annual Direction Review","§7.65")]
    DB.cycle(c,dd,nodes,override="Event-Driven Cadence (§7.70)")
def _c_d06(c):
    dd={"id":"D06","title":"Decision Lifecycle","src":["Ch 10 §§10.3–10.85"]}
    nodes=[("Recommendation","§10.3 (recommendation vs decision)"),
           ("Evidence · Assumptions · Confidence","§§10.13, 10.20, 10.24"),
           ("Risk · Alternatives · Opportunity Cost","§§10.27, 10.35, 10.38"),
           ("Authorization","§10.4 · Founder Override §10.60"),
           ("Active Decision · Status","§10.57"),("Review Date","§10.45"),
           ("Outcome · Decision Learning","§§10.83, 10.85")]
    DB.flow_vertical(c,dd,nodes,accents=[DB.SLATE,DB.NAVY,DB.NAVY,DB.GOLD,DB.PETROL,DB.NAVY,DB.GHOST],
                    escalate=True,escalate_label="learning feeds next recommendation (§10.85)")
def _c_d07(c):
    dd={"id":"D07","title":"Decision Ledger — Decision Status States","src":["Ch 11 §§11.48–11.60"]}
    main=["Draft (§11.49)","Proposed (§11.50)","Approved (§11.51)","Active (§11.52)","Completed (§11.58)"]
    branches=[("Rejected (§11.53)",DB.RED),("Deferred (§11.54)",DB.SLATE),("Expired (§11.55)",DB.SLATE),
              ("Superseded (§11.56)",DB.NAVY),("Reversed (§11.57)",DB.RED)]
    DB.state_flow(c,dd,main,branches,note="Immutable History (§11.60): status transitions are appended, never overwritten.")
def _c_d08(c):
    dd={"id":"D08","title":"Prioritization Classes & Opportunity Cost Relationship","src":["Ch 14 §§14.50–14.55","Ch 15 §§15.7, 15.110–15.112"]}
    y0=DB.header(c,dd)-24
    lx=DB.ML; lw=DB.MEAS*0.52
    classes=[("P0 — Immediate Critical","§14.50",DB.RED),("P1 — Executive Priority","§14.51",DB.GOLD),
             ("P2 — Planned Priority","§14.52",DB.NAVY),("P3 — Prepared Opportunity","§14.53",DB.PETROL),
             ("P4 — Parked","§14.54",DB.SLATE),("Rejected Work","§14.55",DB.GHOST)]
    n=len(classes);gap=10;bh=min(40,(y0-1.5*72)/n-gap);y=y0
    for lab,src,ac in classes:
        DB.boxlabel(c,lx,y-bh,lw,bh,lab,src,fill=DB.PANEL,accent=ac,tz=10); y-=bh+gap
    c.setFillColor(DB.col(DB.GHOST));c.setFont("Mono",7)
    c.drawString(lx,y+2,"Priority classes are canonical (§§14.49–14.55).")
    rx=DB.ML+lw+22; rw=DB.MEAS-lw-22; cy=(y0+1.7*72)/2
    DB.boxlabel(c,rx,cy+20,rw,42,"Chosen Option","§15.111",fill=DB.PANEL,accent=DB.GOLD,tz=10)
    DB.boxlabel(c,rx,cy-72,rw,42,"Displaced Best Alternative","§15.112 · §15.7",fill=DB.PANEL2,accent=DB.SLATE,tz=10)
    c.setStrokeColor(DB.col(DB.RED));c.setLineWidth(1.5);c.setDash(3,2)
    c.line(rx+rw/2,cy+20,rx+rw/2,cy-30)
    c.line(rx+rw/2,cy-30,rx+rw/2-4,cy-24);c.line(rx+rw/2,cy-30,rx+rw/2+4,cy-24);c.setDash()
    c.setFillColor(DB.col(DB.RED));c.setFont("Mono",7)
    c.drawCentredString(rx+rw/2,cy-6,"displaces (opportunity cost §15.3)")
    c.setFillColor(DB.col(DB.GHOST));c.setFont("Serif-I",8.5)
    for i,ln in enumerate(DB.wrap("Opportunity Cost Object (§15.110): choosing one option displaces the best alternative.","Serif-I",8.5,rw)):
        c.drawString(rx,cy-96-i*11,ln)
    DB.footnote(c,dd)
def _c_d09(c):
    dd={"id":"D09","title":"Governance Layers & Authority Gradient","src":["Ch 16 §§16.6–16.31"]}
    nodes=[("Constitutional Rules","§16.7"),("Global Omnira Policy","§16.8"),("Portfolio Policy","§16.9"),
           ("Project Policy","§16.10"),("Mission Constraints","§16.11"),("Workflow Policy","§16.12"),
           ("Tool Permissions","§16.13"),("Task Authority","§16.14")]
    DB.flow_vertical(c,dd,nodes,accents=[DB.RED,DB.GOLD,DB.NAVY,DB.NAVY,DB.PETROL,DB.PETROL,DB.SLATE,DB.GHOST],
                    escalate=True,escalate_label="precedence & narrowing (§§16.18–16.22)")
    DB.legend(c,[("Allow / Allow w/ Conditions (§16.26–27)",DB.NAVY),("Require Approval / Evidence (§16.28–29)",DB.GOLD),
                ("Deny / Escalate (§16.30–31)",DB.RED)])
def _c_d12(c):
    dd={"id":"D12","title":"Trust Score & Autonomy Progression","src":["Ch 19","Terminology Guide L0–L6"]}
    steps=[("L0 — Observe",None),("L1 — Recommend",None),("L2 — Prepare",None),
           ("L3 — Execute Internally",None),("L4 — External Low-Risk",None),
           ("L5 — Conditional Business Autonomy",None),("L6 — Full Strategic Autonomy",None)]
    acc=[DB.GHOST,DB.GHOST,DB.PETROL,DB.NAVY,DB.NAVY,DB.GOLD,DB.RED]
    DB.ladder_horizontal(c,dd,steps,acc,rising_label="Progression is gated by Trust Score & governance — not automatic (Ch 19).")
def _c_d13(c):
    dd={"id":"D13","title":"Executive Mission Delegation Flow","src":["Ch 21 §§21.6–21.12","Ch 20 §20.3"]}
    nodes=[("Founder","ultimate authority"),("Executive","§21.7 Founder→Executive"),
           ("Manager","§21.8 Executive→Manager · Mission Brief §20.3"),
           ("Workforce","§21.9 Manager→Workforce"),("Agent","§21.10 Workforce→Agent"),("Tool","§21.11 Tool-Level")]
    DB.flow_vertical(c,dd,nodes,accents=[DB.GOLD,DB.GOLD,DB.NAVY,DB.PETROL,DB.SLATE,DB.GHOST],
                    escalate=True,escalate_label="Escalated (§21.46) — bounded, two-sided (§21.18)")
def _c_d15(c):
    dd={"id":"D15","title":"Operating Graph vs Intelligence Graph","src":["Ch 26 §§26.3–26.5, 26.14–26.26, 26.58–26.76"]}
    left=("OPERATING GRAPH","§26.4 · what runs",
        ["Portfolio → Project → Objective","Mission → Workstream → Workflow",
         "Task → Role → Agent → Tool","Action → Execution Result","(canonical hierarchy §§26.15–26.26)"],DB.NAVY)
    right=("INTELLIGENCE GRAPH","§26.5 · why it is believed",
        ["Signal → Evidence → Interpretation","Hypothesis → Recommendation","Approval → Decision",
         "Outcome → Review → Learning","(canonical chain §§26.58–26.76)"],DB.PETROL)
    DB.two_columns(c,dd,left,right,relation="Two Graphs, Not One (§26.3)")
def _c_d16(c):
    dd={"id":"D16","title":"Approval Flow — Approval Status Lifecycle","src":["Ch 27 §§27.43–27.59"]}
    main=["Draft (§27.44)","Preparing (§27.45)","Pending (§27.46)","Approved (§27.51)","Executed (§27.56)"]
    branches=[("Needs Evidence (§27.47)",DB.GOLD),("Needs Revision (§27.48)",DB.GOLD),("Deferred (§27.49)",DB.SLATE),
              ("Escalated (§27.50)",DB.NAVY),("Approved w/ Conditions (§27.52)",DB.GOLD),("Rejected (§27.53)",DB.RED),
              ("Withdrawn (§27.54)",DB.SLATE),("Expired (§27.55)",DB.SLATE),("Failed (§27.57)",DB.RED),
              ("Superseded (§27.58)",DB.NAVY),("Cancelled (§27.59)",DB.SLATE)]
    DB.state_flow(c,dd,main,branches,note="Approval is an authority act (§27.3); it is not agreement, review, or silence (§§27.4–27.10).")
def _c_d17(c):
    dd={"id":"D17","title":"Crisis Mode & Emergency Brake","src":["Ch 28 §§28.3–28.5, 28.28–28.32, 28.71–28.73"]}
    y0=DB.header(c,dd)-24
    sev=[("C0 — Operational Disturbance","§28.28",DB.GHOST),("C1 — Contained Incident","§28.29",DB.SLATE),
         ("C2 — Material Crisis","§28.30",DB.GOLD),("C3 — Severe Crisis","§28.31",DB.RED),
         ("C4 — Systemic Emergency","§28.32",DB.RED)]
    n=len(sev);gap=8;bw=(DB.MEAS-(n-1)*gap)/n;base=y0-96
    for i,(lab,src,ac) in enumerate(sev):
        h=52+i*10;x=DB.ML+i*(bw+gap)
        DB.box(c,x,base,bw,h,DB.PANEL,ac,1.3);c.setFillColor(DB.col(ac));c.rect(x,base,bw,4,fill=1,stroke=0)
        c.setFillColor(DB.col(DB.WARM));c.setFont("Sans-B",8);yy=base+h-12
        for ln in DB.wrap(lab,"Sans-B",8,bw-8):c.drawCentredString(x+bw/2,yy,ln);yy-=9
        c.setFillColor(DB.col(DB.GOLD));c.setFont("Mono",6.5);c.drawCentredString(x+bw/2,base+6,src)
    c.setFillColor(DB.col(DB.GHOST));c.setFont("Mono",7);c.drawString(DB.ML,base-12,"Crisis Severity Model (§28.27) — increasing impact / blast radius / velocity (§§28.34–28.36)")
    by=base-34
    DB.boxlabel(c,DB.ML,by-40,(DB.MEAS-16)/2,40,"Crisis Mode (§28.3)","coordinated elevated-control state",fill=DB.PANEL2,accent=DB.GOLD,tz=9.5)
    DB.boxlabel(c,DB.ML+(DB.MEAS-16)/2+16,by-40,(DB.MEAS-16)/2,40,"Emergency Brake (§28.4)","immediate narrowest-effective stop (§28.73)",fill=DB.PANEL2,accent=DB.RED,tz=9.5)
    c.setFillColor(DB.col(DB.GHOST));c.setFont("Serif-I",8)
    c.drawString(DB.ML,by-56,"Crisis Mode vs Emergency Brake (§28.5). Brake scope ladder: Action→Workflow→Mission→Tool→Channel→Credential→Project→Provider→Portfolio (§§28.74–28.82).")
    DB.footnote(c,dd)

CORRECTED={"D02":_c_d02,"D03":_c_d03,"D04":_c_d04,"D05":_c_d05,"D06":_c_d06,"D07":_c_d07,"D08":_c_d08,
           "D09":_c_d09,"D10":_c_d10,"D11":_c_d11,"D12":_c_d12,"D13":_c_d13,"D15":_c_d15,"D16":_c_d16,
           "D17":_c_d17,"D18":_c_d18}

# D14 intentionally excluded (REMOVE FROM PROFESSIONAL EDITION — REDUNDANT WITH D01).
EXCLUDED={"D14"}

def is_dark(did):
    return (did in CORRECTED) or (did in KEPT_DARK)

def draw(c, did):
    """Draw diagram `did` onto the current page. Caller has already painted the background."""
    if did in CORRECTED:
        CORRECTED[did](c); return
    if did in KEPT_FUNCS:
        dd=KEPT_META[did]; KEPT_FUNCS[did](c, dd, did in KEPT_DARK); return
    raise KeyError("unknown or excluded diagram %s"%did)
