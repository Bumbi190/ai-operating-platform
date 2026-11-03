// Decode catalog photos to safe display pixels. Photo validation does not attest
// the identity of a real vehicle or confer rights to produce 3D/film assets.
import {createHash} from 'node:crypto'
import sharp from 'sharp'

const allowed = new Map([['jpeg','image/jpeg'],['png','image/png'],['webp','image/webp']])
const decoded = new Map<string,Buffer>()
function remember(hash:string,bytes:Buffer){
  if(decoded.size>=16)decoded.delete(decoded.keys().next().value!)
  decoded.set(hash,bytes)
}

async function normalize(input:Buffer, declaredType:string) {
  const options={limitInputPixels:12_000_000,limitInputChannels:4,failOn:'warning' as const,sequentialRead:true}
  const meta=await sharp(input,{...options,animated:true}).metadata()
  const mime=allowed.get(meta.format||'')
  if(!mime||(declaredType&&declaredType!==mime)||(meta.pages??1)!==1||
     !meta.width||!meta.height||Math.max(meta.width,meta.height)>8192)throw Error('PHOTO_TYPE')
  async function encode(width:number,height:number,quality:number){
    return sharp(input,options).rotate().resize({width,height,fit:'inside',withoutEnlargement:true})
      .webp({quality,effort:3}).toBuffer()
  }
  let bytes=await encode(1280,960,78)
  if(bytes.length>180000)bytes=await encode(800,600,65)
  if(bytes.length>180000)throw Error('PHOTO_SIZE')
  return bytes
}
export async function displayPhoto(file:File):Promise<{hash:string;bytes:string}> {
  if(!file.size||file.size>3*1024*1024)throw Error('PHOTO_SIZE')
  const bytes=await normalize(Buffer.from(await file.arrayBuffer()),file.type)
  const hash=createHash('sha256').update(bytes).digest('hex')
  return {hash,bytes:bytes.toString('base64')}
}

/** Authorization and current publication are checked by the photo RPC before
 * every call, including cache hits. A direct REST writer cannot bypass decode. */
export async function galleryPhoto(hash:string,source:Buffer):Promise<Buffer> {
  if(!source.length||source.length>180000||createHash('sha256').update(source).digest('hex')!==hash)throw Error('PHOTO_DIGEST')
  const cached=decoded.get(hash)
  if(cached)return cached
  const safe=await normalize(source,'image/webp')
  remember(hash,safe)
  return safe
}
