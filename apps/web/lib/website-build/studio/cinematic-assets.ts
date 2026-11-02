import {createHash} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import path from 'node:path'
import manifest from './cinematic-assets/manifest.json'
import {CINEMATIC_RUNTIME} from './cinematic-runtime'

type Integrity={bytes:number;sha256:string}
const runtime=Buffer.from(CINEMATIC_RUNTIME)
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex')
const names={
 poster:'hero.'+manifest.poster.sha256.slice(0,16)+'.webp',
 video:'showroom.'+manifest.video.sha256.slice(0,16)+'.mp4',
 runtime:'runtime.'+sha(runtime).slice(0,16)+'.js'
}
export function cinematicAssetNames(){return {...names}}
export function verifyCinematicBytes(bytes:Uint8Array,expected:Integrity){
 if(bytes.length!==expected.bytes||bytes.length>16*1024*1024||sha(bytes)!==expected.sha256)
  throw Error('CINEMATIC_INTEGRITY')
}
function readAsset(name:string):{bytes:Buffer;contentType:string}|null{
 if(name===names.runtime)return {bytes:runtime,contentType:'text/javascript; charset=utf-8'}
 const descriptor=name===names.poster?manifest.poster:name===names.video?manifest.video:null
 if(!descriptor)return null
 const cwd=process.cwd()
 const root=existsSync(path.join(cwd,'lib','website-build'))?cwd:path.join(cwd,'apps','web')
 const bytes=readFileSync(path.join(root,'lib','website-build','studio','cinematic-assets',descriptor.filename))
 verifyCinematicBytes(bytes,descriptor)
 return {bytes,contentType:descriptor.contentType}
}
/** Called only after the route's owner check. No URL fetch or arbitrary path. */
export function cinematicAssetResponse(request:Request,name:string):Response{
 let asset:ReturnType<typeof readAsset>
 try{asset=readAsset(name)}catch{return new Response(null,{status:503,headers:{'cache-control':'no-store'}})}
 if(!asset)return new Response(null,{status:404,headers:{'cache-control':'no-store'}})
 const {bytes,contentType}=asset,size=bytes.length
 const headers:Record<string,string>={
  'content-type':contentType,'cache-control':'private, no-store',
  'x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  'accept-ranges':'bytes','content-length':String(size)
 }
 const range=request.headers.get('range')
 if(!range)return new Response(Buffer.from(bytes),{headers})
 const invalid=()=>new Response(null,{status:416,headers:{
  ...headers,'content-range':'bytes */'+size,'content-length':'0'
 }})
 const match=/^bytes=(\d*)-(\d*)$/.exec(range)
 if(!match||(!match[1]&&!match[2]))return invalid()
 let start:number,end:number
 if(!match[1]){
  const count=Number(match[2])
  if(!Number.isSafeInteger(count)||count<=0)return invalid()
  start=Math.max(0,size-count);end=size-1
 }else{
  start=Number(match[1]);end=match[2]?Number(match[2]):size-1
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||
     start<0||start>=size||end<start)return invalid()
  end=Math.min(end,size-1)
 }
 headers['content-range']='bytes '+start+'-'+end+'/'+size
 headers['content-length']=String(end-start+1)
 return new Response(Buffer.from(bytes.subarray(start,end+1)),{status:206,headers})
}
