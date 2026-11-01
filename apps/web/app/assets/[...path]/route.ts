// Small public allowlist of immutable fictional demo assets. NEVER private media.
import {NextResponse} from 'next/server'
import {readPublicWebsitePreviewAsset} from '@/lib/website-build/public-preview-assets'

export const runtime='nodejs'

function respond(parts:unknown,head:boolean){
 let asset:ReturnType<typeof readPublicWebsitePreviewAsset>
 try{asset=readPublicWebsitePreviewAsset(parts)}catch{
  return new NextResponse(null,{status:500,headers:{'Cache-Control':'no-store'}})
 }
 if(!asset)return new NextResponse(null,{status:404,headers:{'Cache-Control':'no-store'}})
 const headers={
  'Content-Type':asset.contentType,
  'Cache-Control':'public, max-age=31536000, immutable',
  'Access-Control-Allow-Origin':'*',
  'Cross-Origin-Resource-Policy':'cross-origin',
  'X-Content-Type-Options':'nosniff'
 }
 return new NextResponse(head?null:Buffer.from(asset.bytes),{status:200,headers})
}
export async function GET(_request:Request,{params}:{params:{path:string[]}}){
 return respond(params.path,false)
}
export async function HEAD(_request:Request,{params}:{params:{path:string[]}}){
 return respond(params.path,true)
}
