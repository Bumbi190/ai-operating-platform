import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import brief from '../../../../../docs/the-prompt-film-brief-20261019.json'
import {FilmPreparationError,parseFilmPreparationRef,prepareFilm} from './film-preparation'

const PILOT_PROJECT='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer'}
function privateResponse(response:Response){Object.entries(headers).forEach(([k,v])=>response.headers.set(k,v));return response}
async function readRef(request:Request){
 if(new URL(request.url).search)throw new FilmPreparationError('INVALID_BODY')
 if(!request.headers.get('content-type')?.split(';')[0].trim().match(/^application\/json$/i))throw new FilmPreparationError('INVALID_BODY')
 if(Number(request.headers.get('content-length'))>4096)throw new FilmPreparationError('INVALID_BODY')
 const reader=request.body?.getReader();if(!reader)throw new FilmPreparationError('INVALID_BODY')
 const chunks:Uint8Array[]=[];let length=0
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>4096){await reader.cancel();throw new FilmPreparationError('INVALID_BODY')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(length);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}
 try{return parseFilmPreparationRef(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)))}catch{throw new FilmPreparationError('INVALID_BODY')}
}
/** Read-only pilot: the session supplies identity, the server supplies the reviewed brief. */
export async function filmPreparationApi(request:Request):Promise<Response>{
 try{
  const access=await resolveProjectAccess();if(!access.ok)return privateResponse(access.response)
  if(request.method!=='POST')return Response.json({code:'INVALID_BODY'},{status:405,headers})
  const denied=assertSameOrigin(request);if(denied)return privateResponse(denied)
  const ref=await readRef(request)
  if(ref.projectId!==PILOT_PROJECT)throw new FilmPreparationError('NOT_FOUND')
  const result=await prepareFilm(createAdminClient(),{userId:access.userId,allowedProjectIds:access.allowedProjectIds},ref,brief)
  return Response.json(result,{headers})
 }catch(error){
  const code=error instanceof FilmPreparationError?error.code:'UNAVAILABLE'
  return Response.json({code},{status:code==='NOT_FOUND'?404:code==='INVALID_BODY'?400:code==='UNAVAILABLE'?503:code==='STOPPED'?423:409,headers})
 }
}
