# -*- coding: utf-8 -*-
"""
Phase 3.3.1 — corrected diagram assets.
Every node label and relationship is drawn strictly from Canonical v1.0 section text
(cited per diagram in the correction report). No new doctrine, no invented relationships.
Root-cause fixes vs Candidate v1:
  * headers/labels always WRAP — never .upper()[:N] truncation (fixes D03 p117, D08 p667, D15).
  * D12 uses horizontal full-length labels — no rotated/[:22] truncation (fixes p934 L3–L6).
Outputs: one vector PDF + one PNG preview per diagram, written only under Correction Proof/Diagrams/.
"""
import os, sys, math
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor

W,H=letter
FD="/usr/share/fonts/truetype/dejavu/"
for nm,fn in [("Serif","DejaVuSerif.ttf"),("Serif-I","DejaVuSerif-Italic.ttf"),
              ("Sans","DejaVuSans.ttf"),("Sans-B","DejaVuSans-Bold.ttf"),("Mono","DejaVuSansMono.ttf")]:
    pdfmetrics.registerFont(TTFont(nm,FD+fn))

DARK="#0E1A26"; PAPER="#FFFFFF"; INK="#14202B"; WARM="#F4F1EA"; SLATE="#5A6672"
GOLD="#C8A24B"; NAVY="#1F3B57"; PETROL="#183850"; RED="#B4442E"; GHOST="#8A939D"
PANEL="#16232F"; PANEL2="#1B2C3A"
def col(x): return HexColor(x)
ML=1.0*72; MR=1.0*72; MEAS=W-ML-MR
def sw(s,f,z): return pdfmetrics.stringWidth(s,f,z)
def wrap(t,f,z,maxw):
    out=[];cur=""
    for w in t.split():
        s=w if not cur else cur+" "+w
        if sw(s,f,z)<=maxw:cur=s
        else:
            if cur:out.append(cur)
            cur=w
    if cur:out.append(cur)
    return out or [""]

def header(c,dd):
    c.setFillColor(col(GHOST));c.setFont("Mono",8)
    c.drawString(ML,H-0.95*72,"DIAGRAM %s · %s"%(dd["id"]," · ".join(dd["src"])))
    c.setFillColor(col(WARM));c.setFont("Sans-B",18)
    y=H-1.28*72
    for ln in wrap(dd["title"],"Sans-B",18,MEAS):   # WRAP — no truncation
        c.drawString(ML,y,ln);y-=22
    c.setStrokeColor(col(GOLD));c.setLineWidth(1.2);c.line(ML,y+8,ML+54,y+8)
    return y-6

def footnote(c,dd):
    c.setFillColor(col(GHOST));c.setFont("Mono",7)
    y=0.62*72
    txt="Additive presentation layer · every node & relation is verbatim canonical (%s) · no new doctrine introduced."%(", ".join(dd["src"]))
    for ln in wrap(txt,"Mono",7,MEAS): c.drawString(ML,y,ln);y-=9

def box(c,x,y,w,h,fill,stroke=None,lw=1.2,dash=None,r=6):
    if dash:c.setDash(*dash)
    else:c.setDash()
    if fill:c.setFillColor(col(fill))
    if stroke:c.setStrokeColor(col(stroke));c.setLineWidth(lw)
    c.roundRect(x,y,w,h,r,fill=1 if fill else 0,stroke=1 if stroke else 0);c.setDash()

def boxlabel(c,x,y,w,h,title,sub=None,fill=NAVY,tcol=WARM,tz=11,accent=None):
    box(c,x,y,w,h,fill,accent or fill,1.2)
    if accent: c.setFillColor(col(accent));c.rect(x,y,4,h,fill=1,stroke=0)
    lines=wrap(title,"Sans-B",tz,w-20)
    th=len(lines)*(tz+2)+(11 if sub else 0)
    yy=y+h/2+th/2-tz
    c.setFillColor(col(tcol));c.setFont("Sans-B",tz)
    for ln in lines: c.drawString(x+12,yy,ln);yy-=tz+2
    if sub:
        c.setFillColor(col(GOLD));c.setFont("Serif-I",8.5);c.drawString(x+12,yy-1,sub)

def arrow_down(c,x,y1,y2,cc=GOLD,lw=1.4):
    c.setStrokeColor(col(cc));c.setLineWidth(lw);c.setDash();c.line(x,y1,x,y2)
    c.line(x,y2,x-3.5,y2+6);c.line(x,y2,x+3.5,y2+6)
def arrow_right(c,x1,x2,y,cc=GOLD,lw=1.4):
    c.setStrokeColor(col(cc));c.setLineWidth(lw);c.setDash();c.line(x1,y,x2,y)
    c.line(x2,y,x2-6,y-3.5);c.line(x2,y,x2-6,y+3.5)
def arrow_up(c,x,y1,y2,cc=SLATE,lw=1.1,dash=(2,2)):
    c.setStrokeColor(col(cc));c.setLineWidth(lw);c.setDash(*dash);c.line(x,y1,x,y2)
    c.line(x,y2,x-3,y2-5);c.line(x,y2,x+3,y2-5);c.setDash()

def legend(c,items):
    x=ML;y=0.9*72;c.setFont("Mono",7.5)
    for lab,cc in items:
        c.setFillColor(col(cc));c.rect(x,y-1,14,7,fill=1,stroke=0)
        c.setFillColor(col(GHOST));c.drawString(x+20,y,lab)
        x+=sw(lab,"Mono",7.5)+42
        if x>W-MR-140:x=ML;y-=13

def page(c): c.setFillColor(col(DARK));c.rect(0,0,W,H,fill=1,stroke=0)

# ---- vertical stacked flow with down + optional escalate-up ----
def flow_vertical(c,dd,nodes,accents=None,escalate=False,escalate_label="escalate"):
    y0=header(c,dd)-26
    x=ML+40;w=MEAS-80
    n=len(nodes);gap=13
    bh=min(44,(y0-1.3*72)/n-gap)
    y=y0
    ys=[]
    for i,nd in enumerate(nodes):
        ac=accents[i] if accents else (GOLD if i==0 else NAVY)
        title=nd[0] if isinstance(nd,tuple) else nd
        sub=nd[1] if isinstance(nd,tuple) and len(nd)>1 else None
        boxlabel(c,x,y-bh,w,bh,title,sub,fill=PANEL,accent=ac,tz=10.5)
        ys.append(y-bh/2)
        if i<n-1: arrow_down(c,x+w/2,y-bh,y-bh-gap,GOLD)
        y-=bh+gap
    if escalate:
        ex=x+w+14
        c.setStrokeColor(col(SLATE));c.setLineWidth(1.1);c.setDash(2,2)
        c.line(x+w,ys[-1],ex,ys[-1]);c.line(ex,ys[-1],ex,ys[0]);c.line(ex,ys[0],x+w,ys[0])
        c.line(x+w,ys[0],x+w+6,ys[0]-4);c.line(x+w,ys[0],x+w+6,ys[0]+4);c.setDash()
        c.saveState();c.translate(ex+9,(ys[0]+ys[-1])/2);c.rotate(90)
        c.setFillColor(col(SLATE));c.setFont("Mono",7);c.drawCentredString(0,0,escalate_label);c.restoreState()
    footnote(c,dd)

# ---- horizontal ladder (ascending) with full horizontal labels ----
def ladder_horizontal(c,dd,steps,accents,rising_label):
    y0=header(c,dd)-30
    base=1.5*72
    n=len(steps);gap=8
    bw=(MEAS-(n-1)*gap)/n
    maxh=y0-base-40
    for i,(lab,sub) in enumerate(steps):
        ac=accents[i]
        h=maxh*(0.42+0.58*i/(n-1))
        x=ML+i*(bw+gap)
        box(c,x,base,bw,h,PANEL,ac,1.3)
        c.setFillColor(col(ac));c.rect(x,base,bw,4,fill=1,stroke=0)
        # horizontal wrapped label near top of bar
        c.setFillColor(col(WARM));c.setFont("Sans-B",8.5)
        yy=base+h-14
        for ln in wrap(lab,"Sans-B",8.5,bw-10):
            c.drawCentredString(x+bw/2,yy,ln);yy-=10
        if sub:
            c.setFillColor(col(GOLD));c.setFont("Mono",6.5)
            for ln in wrap(sub,"Mono",6.5,bw-8)[:2]:
                c.drawCentredString(x+bw/2,yy,ln);yy-=8
    # rising trust arrow
    c.setStrokeColor(col(GOLD));c.setLineWidth(1.6);c.setDash()
    c.line(ML,base-14,ML+MEAS,base-14)
    c.line(ML+MEAS,base-14,ML+MEAS-8,base-10);c.line(ML+MEAS,base-14,ML+MEAS-8,base-18)
    c.setFillColor(col(GHOST));c.setFont("Mono",7.5);c.drawString(ML,base-26,rising_label)
    footnote(c,dd)

# ---- two-column canonical compare ----
def two_columns(c,dd,left,right,relation=None):
    y0=header(c,dd)-24
    gut=22;cw=(MEAS-gut)/2;ch=y0-1.35*72
    for k,(hd,role,items,ac) in enumerate([left,right]):
        x=ML+k*(cw+gut)
        box(c,x,y0-ch,cw,ch,PANEL,ac,1.3,dash=(2,2))
        c.setFillColor(col(ac));c.rect(x,y0-26,cw,26,fill=1,stroke=0)
        c.setFillColor(col(WARM));c.setFont("Sans-B",11)
        hy=y0-16
        for ln in wrap(hd,"Sans-B",11,cw-16):   # WRAP header (fix)
            c.drawCentredString(x+cw/2,hy,ln);hy-=12
        if role:
            c.setFillColor(col(GOLD));c.setFont("Serif-I",9);c.drawCentredString(x+cw/2,y0-40,role)
        yy=y0-56;c.setFont("Serif",9)
        for it in items:
            for ln in wrap(it,"Serif",9,cw-20):
                if yy<1.4*72:break
                c.setFillColor(col(WARM));c.drawString(x+12,yy,ln);yy-=12.5
            yy-=2.5
    if relation:
        cx=ML+cw+gut/2
        c.setStrokeColor(col(GOLD));c.setLineWidth(1.3);c.setDash(3,2)
        my=y0-ch/2
        c.line(ML+cw,my,ML+cw+gut,my);c.setDash()
        c.setFillColor(col(GOLD));c.setFont("Mono",6.6)
        c.saveState();c.translate(cx,my+4);c.rotate(90)
        c.drawCentredString(0,0,relation);c.restoreState()
    footnote(c,dd)

# ---- cycle ----
def cycle(c,dd,nodes,override=None):
    y0=header(c,dd)
    cx,cy=W/2,(y0+1.5*72)/2-6;R=min(150,(y0-1.5*72)/2-30)
    pts=[]
    for i in range(len(nodes)):
        a=math.pi/2-i*2*math.pi/len(nodes)
        pts.append((cx+R*math.cos(a),cy+R*math.sin(a)))
    c.setStrokeColor(col(GOLD));c.setLineWidth(1.3);c.setDash()
    for i in range(len(nodes)):
        x1,y1=pts[i];x2,y2=pts[(i+1)%len(nodes)]
        mx,my=(x1+x2)/2,(y1+y2)/2
        c.line(x1,y1,x2,y2)
        # arrowhead near midpoint
        ang=math.atan2(y2-y1,x2-x1)
        c.line(mx,my,mx-7*math.cos(ang-0.4),my-7*math.sin(ang-0.4))
        c.line(mx,my,mx-7*math.cos(ang+0.4),my-7*math.sin(ang+0.4))
    for i,(px,py) in enumerate(pts):
        bw,bh=128,40
        boxlabel(c,px-bw/2,py-bh/2,bw,bh,nodes[i][0],nodes[i][1] if len(nodes[i])>1 else None,
                 fill=PANEL,accent=NAVY,tz=9)
    if override:
        box(c,cx-70,cy-20,140,40,PANEL2,RED,1.3,dash=(3,2))
        c.setFillColor(col(RED));c.setFont("Mono",7);c.drawCentredString(cx,cy+6,"EVENT-DRIVEN OVERRIDE")
        c.setFillColor(col(WARM));c.setFont("Sans-B",9);c.drawCentredString(cx,cy-8,override)
    footnote(c,dd)

# ---- state machine: main path + branch states ----
def state_flow(c,dd,main,branches,note=None):
    y0=header(c,dd)-30
    # main path across top rows (wrap into rows of up to 4)
    x=ML;rowy=y0-20;bw=(MEAS-3*10)/4;bh=34
    positions=[]
    for i,st in enumerate(main):
        r=i//4;cidx=i%4
        yy=rowy-r*(bh+22)
        xx=ML+cidx*(bw+10)
        boxlabel(c,xx,yy-bh,bw,bh,st,None,fill=PANEL,accent=GOLD,tz=8.6)
        positions.append((xx+bw/2,yy-bh/2,xx,yy-bh))
        if cidx>0:
            px=ML+(cidx-1)*(bw+10)+bw
            arrow_right(c,px,xx,yy-bh/2,GOLD)
    # branches panel
    by=rowy-((len(main)-1)//4+1)*(bh+22)-6
    c.setFillColor(col(GHOST));c.setFont("Mono",8);c.drawString(ML,by,"BRANCH / TERMINAL STATES (canonical)")
    by-=16;bx=ML;bbw=(MEAS-2*10)/3;bbh=26
    for i,(st,cc) in enumerate(branches):
        r=i//3;cidx=i%3
        yy=by-r*(bbh+8)
        xx=ML+cidx*(bbw+10)
        boxlabel(c,xx,yy-bbh,bbw,bbh,st,None,fill=PANEL2,accent=cc,tz=8)
    if note:
        c.setFillColor(col(GOLD));c.setFont("Serif-I",8.5)
        c.drawString(ML,1.25*72,note)
    footnote(c,dd)

# ---- nested boundary model ----
def boundary_model(c,dd,layers,denied,fills=None):
    """Concentric boundary bands. Labels are always drawn in high-contrast WARM (D04 contrast fix);
    frame colours come from `layers`; optional per-band fills for extra separation."""
    y0=header(c,dd)-30
    cx=W/2;top=y0;bottom=1.5*72
    n=len(layers)
    fullw=MEAS;fullh=top-bottom
    stepx=(fullw*0.42)/n            # horizontal inset per band
    stepy=(fullh*0.42)/n            # vertical inset per band
    for i,(lab,cc) in enumerate(layers):
        x=cx-(fullw-2*i*stepx)/2
        w=fullw-2*i*stepx
        yb=bottom+i*stepy
        hh=(top-i*stepy)-yb
        fillc=(fills[i] if fills else (PANEL if i<n-1 else PANEL2))
        box(c,x,yb,w,hh,fillc,cc,1.6,dash=(2,2) if i==0 else None)
        # label band across the top of each ring, high-contrast WARM text
        c.setFillColor(col(cc));c.setFont("Sans-B",9.6)
        # colour accent chip then bright label for legibility on dark
        c.circle(x+12,yb+hh-13,3,fill=1,stroke=0)
        c.setFillColor(col(WARM));c.setFont("Sans-B",9.6)
        for j,ln in enumerate(wrap(lab,"Sans-B",9.6,w-34)[:2]):
            c.drawString(x+22,yb+hh-16-j*11,ln)
    # denied cross-project arrow from outside
    c.setStrokeColor(col(RED));c.setLineWidth(1.4);c.setDash(3,2)
    c.line(ML,top-42,cx-(fullw-0*stepx)/2+18,top-70)
    c.setDash()
    c.setFillColor(col(RED));c.setFont("Mono",7)
    for k,ln in enumerate(wrap(denied,"Mono",7,MEAS*0.6)):
        c.drawString(ML,top-34-k*9,ln)
    footnote(c,dd)
