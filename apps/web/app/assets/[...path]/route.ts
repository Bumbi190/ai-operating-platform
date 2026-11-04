// Small public allowlist of immutable fictional demo assets. NEVER private media.
import {NextResponse} from 'next/server'
import {readPublicWebsitePreviewAsset} from '@/lib/website-build/public-preview-assets'

export const runtime='nodejs'

// Explicit chunks also keep full/ranged films below buffered response limits.
function stream(bytes:Uint8Array){
 let offset=0
 return new ReadableStream<Uint8Array>({pull(controller){if(offset===bytes.length){controller.close();return}const end=Math.min(offset+65536,bytes.length);controller.enqueue(bytes.subarray(offset,end));offset=end}})
}
function respond(parts:unknown,head:boolean,request?:Request){
 let asset:ReturnType<typeof readPublicWebsitePreviewAsset>
 try{asset=readPublicWebsitePreviewAsset(parts)}catch{
  return new NextResponse(null,{status:500,headers:{'Cache-Control':'no-store'}})
 }
 if(!asset)return new NextResponse(null,{status:404,headers:{'Cache-Control':'no-store'}})
 const headers:Record<string,string>={
  'Accept-Ranges':'bytes',
  'Content-Length':String(asset.bytes.length),
  'Content-Type':asset.contentType,
  'Cache-Control':'public, max-age=31536000, immutable',
  'Access-Control-Allow-Origin':'*',
  'Cross-Origin-Resource-Policy':'cross-origin',
  'X-Content-Type-Options':'nosniff'
 }
 const range=request?.headers.get('range')
 if(range&&!head){
  const match=/^bytes=(\d*)-(\d*)$/.exec(range),suffix=match?.[1]===''?Number(match?.[2]):null
  const start=suffix!==null?Math.max(0,asset.bytes.length-suffix):Number(match?.[1]),end=suffix!==null?asset.bytes.length-1:match?.[2]?Math.min(Number(match[2]),asset.bytes.length-1):asset.bytes.length-1
  if(!match||(!match[1]&&!match[2])||(suffix!==null&&(!Number.isSafeInteger(suffix)||suffix<=0))||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=asset.bytes.length)return new NextResponse(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+asset.bytes.length,'Content-Length':'0'}})
  return new NextResponse(stream(asset.bytes.subarray(start,end+1)),{status:206,headers:{...headers,'Content-Length':String(end-start+1),'Content-Range':'bytes '+start+'-'+end+'/'+asset.bytes.length}})
 }
 return new NextResponse(head?null:stream(asset.bytes),{status:200,headers})
}
export async function GET(_request:Request,{params}:{params:{path:string[]}}){
 return respond(params.path,false,_request)
}
export async function HEAD(_request:Request,{params}:{params:{path:string[]}}){
 return respond(params.path,true)
}
