"""Deterministic, offline additive GLB edit. Preserve approved body/glass/shadow."""
from pathlib import Path
import hashlib, json, math, struct

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'apps/web/lib/website-build/studio/cinematic-assets'
base = (ASSETS / 'roadster-v1-model.glb').read_bytes()
assert hashlib.sha256(base).hexdigest() == '41ea20c154977eeeb5fc3b8aca8e3548a7809b1ba961ba5c0663ae76f9e01b03'
json_length = struct.unpack_from('<I', base, 12)[0]
model = json.loads(base[20:20+json_length])
binary_start = 20+json_length+8
binary = bytearray(base[binary_start:binary_start+model['buffers'][0]['byteLength']])

def accessor(values, width):
    while len(binary) % 4: binary.append(0)
    start = len(binary)
    for row in values: binary.extend(struct.pack('<'+'f'*width, *row))
    view = len(model['bufferViews'])
    model['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(binary)-start,'target':34962})
    index = len(model['accessors'])
    model['accessors'].append({'bufferView':view,'componentType':5126,'count':len(values),'type':'VEC'+str(width),
        'min':[min(row[i] for row in values) for i in range(width)],'max':[max(row[i] for row in values) for i in range(width)]})
    return index

def material(name, color, metal, rough, emissive=None):
    m={'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*color,1],'metallicFactor':metal,'roughnessFactor':rough},'doubleSided':True}
    if emissive: m['emissiveFactor']=emissive
    model['materials'].append(m)
    return len(model['materials'])-1

shell=material('Thruster graphite titanium',[.075,.09,.105],.82,.29)
rim=material('Thruster brushed rim',[.13,.16,.19],.80,.32)
inside=material('Thruster recessed chamber',[.007,.012,.019],.35,.46)
idle=material('Thruster idle blue ring',[.015,.14,.22],.3,.3,[.015,.25,.5])

def lathe(profile, mat, segments=48):
    positions=[]; normals=[]
    for (x1,r1),(x2,r2) in zip(profile,profile[1:]):
        dx=x2-x1; dr=r2-r1; length=math.hypot(dx,dr)
        for i in range(segments):
            a=2*math.pi*i/segments; b=2*math.pi*(i+1)/segments
            points=[(x1,r1,a),(x2,r2,a),(x2,r2,b),(x1,r1,a),(x2,r2,b),(x1,r1,b)]
            for x,r,t in points:
                positions.append((x,r*math.cos(t),r*math.sin(t)))
                normals.append((-dr/length,dx/length*math.cos(t),dx/length*math.sin(t)))
    return {'attributes':{'POSITION':accessor(positions,3),'NORMAL':accessor(normals,3)},'material':mat,'mode':4}

primitives=[
 lathe([(-.011,.028),(.021,.028),(.045,.023)],shell),
 lathe([(-.011,.024),(-.011,.028),(-.008,.029),(-.004,.028),(-.004,.024),(-.011,.024)],rim),
 lathe([(-.011,.024),(.009,.018),(.009,0)],inside),
 lathe([(-.003,.017),(-.003,.019),(-.001,.019),(-.001,.017),(-.003,.017)],idle),
]
mesh_id=len(model['meshes'])
model['meshes'].append({'name':'Roadster rear thruster assembly','primitives':primitives})
for number,z in enumerate([-.158,-.093,.093,.158],1):
    node=len(model['nodes'])
    model['nodes'].append({'name':f'Roadster rear thruster {number}','mesh':mesh_id,'translation':[-.516,-.048,z],'scale':[.9,.9,.9],
        'extras':{'purpose':'fictional rear thruster','direction':[-1,0,0]}})
    model['scenes'][model.get('scene',0)]['nodes'].append(node)
model.setdefault('extras',{})['roadsterThrusters']={'count':4,'sourceModelSha256':hashlib.sha256(base).hexdigest(),'version':1,'paidGeneration':False}
model['buffers'][0]['byteLength']=len(binary)
while len(binary)%4: binary.append(0)
encoded=json.dumps(model,separators=(',',':'),ensure_ascii=False).encode()
encoded+=b' '*((-len(encoded))%4)
output=struct.pack('<III',0x46546c67,2,12+8+len(encoded)+8+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
target=ASSETS/'roadster-v2-model.glb'
target.write_bytes(output)
print(json.dumps({'file':target.name,'bytes':len(output),'sha256':hashlib.sha256(output).hexdigest(),'thrusters':4}))
