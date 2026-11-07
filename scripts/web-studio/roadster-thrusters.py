"""Offline Roadster revision: surface-fitted, recessed rear thrusters.
Original texture/binary data and windshield stay intact. Only rear triangles
inside four nozzle apertures are clipped; UVs/normals interpolate at cuts.
"""
from pathlib import Path
from functools import lru_cache
import hashlib, json, math, struct

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'apps/web/lib/website-build/studio/cinematic-assets'
base = (ASSETS / 'roadster-v1-model.glb').read_bytes()
assert hashlib.sha256(base).hexdigest() == '41ea20c154977eeeb5fc3b8aca8e3548a7809b1ba961ba5c0663ae76f9e01b03'
json_length = struct.unpack_from('<I', base, 12)[0]
model = json.loads(base[20:20+json_length])
binary = bytearray(base[28+json_length:28+json_length+model['buffers'][0]['byteLength']])
CENTERS = [-.158, -.093, .093, .158]
Y, HOLE, SEGMENTS = -.048, .0225, 32

def read(index):
    a=model['accessors'][index]; v=model['bufferViews'][a['bufferView']]
    width={'SCALAR':1,'VEC2':2,'VEC3':3}[a['type']]
    code={5126:'f',5125:'I',5123:'H'}[a['componentType']]
    size=struct.calcsize(code)*width; start=v.get('byteOffset',0)+a.get('byteOffset',0)
    return [struct.unpack_from('<'+code*width,binary,start+j*v.get('byteStride',size)) for j in range(a['count'])]

def accessor(values, width, indices=False):
    while len(binary)%4: binary.append(0)
    start=len(binary); code='I' if indices else 'f'
    for row in values: binary.extend(struct.pack('<'+code*width,*row))
    view=len(model['bufferViews'])
    model['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(binary)-start,'target':34963 if indices else 34962})
    index=len(model['accessors'])
    model['accessors'].append({'bufferView':view,'componentType':5125 if indices else 5126,'count':len(values),'type':'SCALAR' if indices else 'VEC'+str(width),
        'min':[min(r[i] for r in values) for i in range(width)],'max':[max(r[i] for r in values) for i in range(width)]})
    return index

body=model['meshes'][0]['primitives'][0]
positions=read(body['attributes']['POSITION']); normals=read(body['attributes']['NORMAL']); uvs=read(body['attributes']['TEXCOORD_0'])
indices=[r[0] for r in read(body['indices'])]
rear=[]
for i in range(0,len(indices),3):
    tri=[positions[j] for j in indices[i:i+3]]
    if max(v[0] for v in tri)<-.38:
        rear.append((tri,min(v[1] for v in tri),max(v[1] for v in tri),min(v[2] for v in tri),max(v[2] for v in tri)))

@lru_cache(maxsize=None)
def surface(y,z):
    hits=[]
    for (a,b,c),y0,y1,z0,z1 in rear:
        if not y0-1e-9<=y<=y1+1e-9 or not z0-1e-9<=z<=z1+1e-9: continue
        den=(b[1]-a[1])*(c[2]-a[2])-(c[1]-a[1])*(b[2]-a[2])
        if abs(den)<1e-12: continue
        u=((y-a[1])*(c[2]-a[2])-(z-a[2])*(c[1]-a[1]))/den
        v=((z-a[2])*(b[1]-a[1])-(y-a[1])*(b[2]-a[2]))/den
        if u>=-1e-8 and v>=-1e-8 and u+v<=1+1e-8: hits.append(a[0]+u*(b[0]-a[0])+v*(c[0]-a[0]))
    if not hits: raise ValueError(('no rear surface',y,z))
    return min(hits)

def half(poly,cy,cz,limit,inside):
    out=[]
    for a,b in zip(poly,poly[1:]+poly[:1]):
        da=a[1]*cy+a[2]*cz-limit; db=b[1]*cy+b[2]*cz-limit
        keep_a=da<=0 if inside else da>=0; keep_b=db<=0 if inside else db>=0
        if keep_a: out.append(a)
        if keep_a!=keep_b:
            t=da/(da-db); out.append(tuple(x+(y-x)*t for x,y in zip(a,b)))
    return out

# Convex-cylinder subtraction. All untouched triangles keep their original
# indices/attributes. New vertices carry interpolated position, normal and UV.
kept=[]; clipped=[]
for i in range(0,len(indices),3):
    ids=indices[i:i+3]; tri=[positions[j] for j in ids]
    candidates=[z for z in CENTERS if max(v[0] for v in tri)<-.38 and
        min(v[1] for v in tri)<Y+HOLE and max(v[1] for v in tri)>Y-HOLE and
        min(v[2] for v in tri)<z+HOLE and max(v[2] for v in tri)>z-HOLE]
    if not candidates: kept.extend(ids); continue
    polygons=[[positions[j]+normals[j]+uvs[j] for j in ids]]
    for z in candidates:
        result=[]
        for poly in polygons:
            remainder=poly
            for n in range(SEGMENTS):
                t=2*math.pi*(n+.5)/SEGMENTS; cy,cz=math.cos(t),math.sin(t)
                limit=Y*cy+z*cz+HOLE*math.cos(math.pi/SEGMENTS)
                outside=half(remainder,cy,cz,limit,False)
                if len(outside)>=3: result.append(outside)
                remainder=half(remainder,cy,cz,limit,True)
                if len(remainder)<3: break
        polygons=result
    for poly in polygons:
        for k in range(1,len(poly)-1): clipped.extend([poly[0],poly[k],poly[k+1]])
body['indices']=accessor([(j,) for j in kept],1,True)
model['meshes'][0]['primitives'].append({'attributes':{
    'POSITION':accessor([v[:3] for v in clipped],3),
    'NORMAL':accessor([v[3:6] for v in clipped],3),
    'TEXCOORD_0':accessor([v[6:] for v in clipped],2)},'material':body['material'],'mode':4})

def material(name,color,metal,rough,emissive=None):
    m={'name':name,'pbrMetallicRoughness':{'baseColorFactor':[*color,1],'metallicFactor':metal,'roughnessFactor':rough},'doubleSided':True}
    if emissive: m['emissiveFactor']=emissive
    model['materials'].append(m); return len(model['materials'])-1
rim=material('Thruster satin titanium',[.065,.075,.085],.78,.36)
inside=material('Thruster recessed chamber',[.006,.01,.016],.22,.56)
idle=material('Thruster idle blue ring',[.01,.065,.10],.35,.38,[.012,.12,.22])

def lathe(profile,mat,z):
    pts=[]; norms=[]
    for (x1,r1),(x2,r2) in zip(profile,profile[1:]):
        dx=x2-x1; dr=r2-r1; length=math.hypot(dx,dr)
        for i in range(SEGMENTS):
            a=2*math.pi*i/SEGMENTS; b=2*math.pi*(i+1)/SEGMENTS
            for x,r,t in [(x1,r1,a),(x2,r2,a),(x2,r2,b),(x1,r1,a),(x2,r2,b),(x1,r1,b)]:
                y0=Y+r*math.cos(t); z0=z+r*math.sin(t)
                sx=surface(y0,z0)
                pts.append((sx+x,y0,z0))
                # Normal transformed for the curved rear surface.
                h=.0001; dy=(surface(y0+h,z0)-surface(y0-h,z0))/(2*h); dz=(surface(y0,z0+h)-surface(y0,z0-h))/(2*h)
                nx=-dr/length; ny=dx/length*math.cos(t)-nx*dy; nz=dx/length*math.sin(t)-nx*dz
                norm=math.sqrt(nx*nx+ny*ny+nz*nz); norms.append((nx/norm,ny/norm,nz/norm))
    return {'attributes':{'POSITION':accessor(pts,3),'NORMAL':accessor(norms,3)},'material':mat,'mode':4}

for number,z in enumerate(CENTERS,1):
    primitives=[
        lathe([(.001,.026),(-.002,.025),(-.003,.023),(-.002,.0215),(.002,.0215)],rim,z),
        lathe([(-.001,.0215),(.017,.015),(.019,0)],inside,z),
        lathe([(.009,.015),(.009,.017),(.011,.017),(.011,.015),(.009,.015)],idle,z)]
    mesh=len(model['meshes']); model['meshes'].append({'name':f'Recessed rear thruster {number}','primitives':primitives})
    node=len(model['nodes'])
    model['nodes'].append({'name':f'Roadster rear thruster {number}','mesh':mesh,'extras':{'purpose':'fictional rear thruster','direction':[-1,0,0],'center':[surface(Y,z),Y,z],'maxProtrusion':.003,'recessDepth':.019}})
    model['scenes'][model.get('scene',0)]['nodes'].append(node)
model.setdefault('extras',{})['roadsterThrusters']={'count':4,'sourceModelSha256':hashlib.sha256(base).hexdigest(),'version':2,'paidGeneration':False,'fit':'rear-surface apertures','maxProtrusion':.003}
model['buffers'][0]['byteLength']=len(binary)
while len(binary)%4: binary.append(0)
encoded=json.dumps(model,separators=(',',':'),ensure_ascii=False).encode(); encoded+=b' '*((-len(encoded))%4)
output=struct.pack('<III',0x46546c67,2,28+len(encoded)+len(binary))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+struct.pack('<II',len(binary),0x004e4942)+binary
target=ASSETS/'roadster-v3-model.glb'; target.write_bytes(output)
print(json.dumps({'file':target.name,'bytes':len(output),'sha256':hashlib.sha256(output).hexdigest(),'thrusters':4,'clippedVertices':len(clipped)}))
