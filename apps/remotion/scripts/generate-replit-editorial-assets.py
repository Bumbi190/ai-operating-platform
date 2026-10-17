"""Create original, private editorial illustrations for a factual Replit news pilot.
No external images, no trademark imitation, no fake UI screenshots, no AI API.
The generated SVG files are local ignored review assets only.
"""
from pathlib import Path
import random, math, html

BASE=Path(__file__).resolve().parents[1]/"public"/"the-prompt-qa"
BASE.mkdir(exist_ok=True)
W,H=1080,1920
TEAL="#53F2CE"
CYAN="#83CFFF"
SILVER="#BCE7F5"
YELLOW="#F4CA86"

def lines(seed, quantity, cx=540,cy=950, r=470):
    rng=random.Random(seed)
    tags=[]
    for i in range(quantity):
        a=rng.uniform(0,6.283)
        dist=rng.uniform(r*.35,r*2.3)
        x=cx+math.cos(a)*dist
        y=cy+math.sin(a)*dist
        x2=x+math.cos(a+.8)*rng.randint(100,360)
        y2=y-math.sin(a+.2)*rng.randint(100,430)
        opacity=rng.uniform(.11,.42)
        tags.append(f'<line x1="{x:.0f}" y1="{y:.0f}" x2="{x2:.0f}" y2="{y2:.0f}" stroke="{CYAN if i%3 else TEAL}" stroke-width="{rng.randint(1,3)}" opacity="{opacity:.2f}"/>')
    return ''.join(tags)

def particles(seed, quantity, center=950):
    rng=random.Random(seed)
    p=[]
    for i in range(quantity):
        x=rng.randint(30,1050)
        y=rng.randint(100,1780)
        radius=rng.choice([1,2,2,3,4])
        fill=rng.choice([TEAL,CYAN,SILVER])
        p.append(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{fill}" opacity="{rng.uniform(.15,.75):.2f}"/>')
    return ''.join(p)

def wave(seed, offset, color):
    rng=random.Random(seed)
    pts=[]
    for i in range(38):
        x= -100+i*36
        y=offset+170*math.sin(i*.23+seed)+50*math.cos(i*.46+seed)
        pts.append(f'{x},{y:.0f}')
    return f'<polyline points="{" ".join(pts)}" fill="none" stroke="{color}" stroke-width="6" opacity=".34" filter="url(#neon)"/>'

def frame(scene, body):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 1080 1920">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2=".85" y2="1">
        <stop offset="0" stop-color="#050C1C"/><stop offset=".48" stop-color="#102B43"/>
        <stop offset="1" stop-color="#020B15"/>
      </linearGradient>
      <radialGradient id="aura"><stop offset="0" stop-color="#0BBDBA" stop-opacity=".48"/>
        <stop offset=".5" stop-color="#1C6E86" stop-opacity=".16"/>
        <stop offset="1" stop-color="#081323" stop-opacity="0"/></radialGradient>
      <radialGradient id="gold"><stop offset="0" stop-color="#F4CA86" stop-opacity=".3"/>
        <stop offset="1" stop-color="#071A24" stop-opacity="0"/></radialGradient>
      <linearGradient id="beam" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#88FFF3" stop-opacity=".03"/>
        <stop offset=".56" stop-color="#4AFDE0" stop-opacity=".65"/>
        <stop offset="1" stop-color="#4AFDE0" stop-opacity="0"/>
      </linearGradient>
      <filter id="neon" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="11"/>
      </filter>
      <filter id="soft" x="-100%" y="-100%" width="300%" height="300%">
        <feGaussianBlur stdDeviation="42"/>
      </filter>
      <pattern id="grid" width="64" height="64" patternUnits="userSpaceOnUse">
        <path d="M 64 0 L 0 0 0 64" fill="none" stroke="#78C6E9" stroke-width="1" opacity=".13"/>
      </pattern>
    </defs>
    <rect width="1080" height="1920" fill="url(#sky)"/>
    <rect width="1080" height="1920" fill="url(#grid)" opacity=".5"/>
    <ellipse cx="530" cy="920" rx="700" ry="800" fill="url(#aura)"/>
    {lines(scene+1,56)} {particles(scene+21,170)}
    {body}
    <rect x="0" y="0" width="1080" height="1920" fill="#000A11" opacity=".15"/>
    </svg>'''

# 1: network of autonomous trajectories, not a fabricated software dashboard.
roads=[]
for n in range(-7,8):
    off=n*57
    roads.append(f'<path d="M {540+off*2} 1700 C {540+off} 1390,{540-off} 1070, {540+off//3} 390" fill="none" stroke="{TEAL if n%2 else CYAN}" stroke-width="{4 if n%3 else 7}" opacity="{.4 if abs(n)<4 else .15}" />')
track='<g opacity=".65">'+''.join(roads)+'</g>'
hero=f'''
 <ellipse cx="530" cy="940" rx="390" ry="480" fill="#40FFE2" opacity=".08" filter="url(#soft)"/>
 <g transform="translate(540 835)">
   <ellipse rx="310" ry="310" fill="none" stroke="{TEAL}" stroke-width="5" opacity=".40"/>
   <ellipse rx="250" ry="250" fill="none" stroke="{CYAN}" stroke-width="3" opacity=".50"/>
   <ellipse rx="160" ry="160" fill="none" stroke="{TEAL}" stroke-width="9" opacity=".65"/>
   <circle r="86" fill="#1B4657" stroke="{TEAL}" stroke-width="8"/>
   <circle r="40" fill="{TEAL}" opacity=".95"/>
   <path d="M-90 -220 L220 -45 L100 220 L-160 130Z" stroke="{CYAN}" stroke-width="2" fill="none" opacity=".26"/>
   <path d="M-220 80 L95 -225 M-190 -140 L222 132" stroke="{CYAN}" stroke-width="4" opacity=".24"/>
 </g>
 {track}
 {wave(1,1300,TEAL)}
'''
(BASE/'replit-0.svg').write_text(frame(0,hero),encoding='utf-8')

# 2: diagonally flowing coding work — authored abstraction rather than actual app UI.
commands=['agent / triage','read_issue()','inspect_code()','check_history()','surface_context()','human_review()']
code_lines=[]
for i in range(24):
    label=commands[i%len(commands)]
    y=350+i*68
    x=115+(i%4)*35
    color=TEAL if i%4==0 else SILVER
    code_lines.append(f'<text x="{x}" y="{y}" fill="{color}" opacity="{.14+(i%6)*.04:.2f}" font-family="Consolas,monospace" font-size="35">{html.escape(label)}</text>')
scan=f'''
<g transform="rotate(-12 540 920)">
<rect x="20" y="200" width="1040" height="1400" rx="3" fill="#00212A" opacity=".15"/>
{''.join(code_lines)}
</g>
<g opacity=".65"><path d="M-40 1260 Q 470 880 1150 340" stroke="{TEAL}" stroke-width="12" fill="none" filter="url(#neon)"/>
<path d="M-40 1260 Q 470 880 1150 340" stroke="{TEAL}" stroke-width="5" fill="none"/>
<path d="M-100 1550 Q 510 1030 1300 600" stroke="{CYAN}" stroke-width="9" fill="none" opacity=".36"/></g>
<ellipse cx="810" cy="640" rx="260" ry="260" fill="url(#aura)"/>
'''
(BASE/'replit-1.svg').write_text(frame(1,scan),encoding='utf-8')

# 3: human judgment symbol. No real people, faces, logos or screenshots.
human=f'''
<ellipse cx="550" cy="975" rx="490" ry="620" fill="url(#gold)"/>
<path d="M 35 830 C 300 630 330 670 520 850 C 740 1060 770 1020 1100 770" stroke="{TEAL}" fill="none" stroke-width="8" opacity=".22" filter="url(#neon)"/>
<path d="M 35 830 C 300 630 330 670 520 850 C 740 1060 770 1020 1100 770" stroke="{TEAL}" fill="none" stroke-width="4" opacity=".55"/>
<g transform="translate(545 975)">
 <circle cy="-150" r="95" fill="#173F4C" stroke="{YELLOW}" stroke-width="5"/>
 <path d="M-195 220 Q-205 -65 -105 -45 L 105 -45 Q 205 -65 195 220Z" fill="#173D49" stroke="{YELLOW}" stroke-width="5"/>
 <path d="M -320 325 L 320 325" stroke="{YELLOW}" opacity=".5" stroke-width="5"/>
 <circle cx="0" cy="0" r="335" fill="none" stroke="{TEAL}" stroke-width="4" opacity=".4"/>
 <circle cx="0" cy="0" r="420" fill="none" stroke="{YELLOW}" stroke-width="3" opacity=".25"/>
</g>
{wave(4,1550,YELLOW)}
'''
(BASE/'replit-2.svg').write_text(frame(2,human),encoding='utf-8')
print('SVG_REVIEW_ASSETS_CREATED 3')
