/** Local, isolated customer rehearsal. All database calls use anon or the customer's
 * actual GoTrue token. The privileged fixture key never enters this module. */
import {randomBytes} from 'node:crypto'
import {displayPhoto, galleryPhoto} from './photo'
import {adminView,loginView,showroomView,type Catalog,type VehicleContent,type Workspace} from './views'

type Config = {origin:string; url:string; anonKey:string}
type Session = {token:string; expires:number; origin:string}
const sessions = new Map<string,Session>()
const cookieName = 'ws_customer_'+randomBytes(12).toString('hex')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const hashPattern = /^[a-f0-9]{64}$/
const safeHeaders = {
  'cache-control':'private, no-store',
  'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'x-content-type-options':'nosniff','referrer-policy':'same-origin','x-frame-options':'DENY',
  'vary':'Cookie',
}
class Failure extends Error {
  constructor(readonly status:number, message:string) { super(message) }
}
const invalid = () => new Failure(422,'Kontrollera uppgifterna och försök igen.')
const forbidden = () => new Failure(403,'Du har inte behörighet till den här åtgärden.')
const missing = () => new Failure(404,'Sidan eller bilden finns inte här.')
const stale = () => new Failure(409,'En nyare version har sparats. Öppna den aktuella versionen innan du gör ändringen igen.')
const offline = () => new Failure(503,'Provhallen är tillfälligt otillgänglig.')
function html(content:string,status=200){
  return new Response(content,{status,headers:{...safeHeaders,'content-type':'text/html; charset=utf-8'}})
}
function redirect(path:string,cookie?:string) {
  const headers=new Headers(safeHeaders)
  headers.set('location',path)
  if (cookie) headers.set('set-cookie',cookie)
  return new Response(null,{status:303,headers})
}
function errorResponse(err:unknown,base:string,selectedId?:string) {
  const e=err instanceof Failure ? err : offline()
  // Messages are fixed Swedish copy. Neither SQL/Auth errors nor input are reflected.
  const links=base?'<p><a href="'+base+'/admin'+(selectedId?'?bil='+selectedId:'')+'">Till redigeraren</a> · <a href="'+base+'">Till bilhallen</a></p>':''
  return html('<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Provbilhallen</title><main><h1>'+e.message+'</h1>'+links+'</main></html>',e.status)
}
function loopbackOrigin(value:string) {
  const u=new URL(value)
  return u.protocol==='http:' && u.hostname==='127.0.0.1' && !!u.port && u.origin===value
}
function cookieValue(id:string,age:number) {
  return cookieName+'='+id+'; Path=/hall/; HttpOnly; SameSite=Strict; Max-Age='+age
}
function loginSession(req:Request,config:Config) {
  const parts=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(cookieName+'='))
  if(parts.length!==1) return
  const id=parts[0].slice(cookieName.length+1), value=sessions.get(id)
  if(value && value.expires<=Date.now()){ sessions.delete(id); return }
  if(value && value.origin===config.origin) return {id,token:value.token}
}
async function gateway(config:Config,path:string,data:unknown,token?:string) {
  return fetch(config.url+path,{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000),
    headers:{'content-type':'application/json',apikey:config.anonKey,authorization:'Bearer '+(token||config.anonKey)},
    body:JSON.stringify(data)})
}
async function rpc<T>(config:Config,name:string,data:Record<string,unknown>,token?:string):Promise<T> {
  const response=await gateway(config,'/rest/v1/rpc/dealer_pilot_'+name,data,token)
  if(response.ok)return await response.json() as T
  const problem=await response.json().catch(()=>({})) as {code?:string}
  if(problem.code==='42501')throw forbidden()
  if(problem.code==='40001'||problem.code==='23505')throw stale()
  if(problem.code==='P0002'||response.status===404)throw missing()
  if(response.status===401)throw new Failure(401,'Logga in igen för att fortsätta.')
  if(['22023','22001','22P02','23514','54000'].includes(problem.code||''))throw invalid()
  throw offline()
}
async function formBody(req:Request,limit:number) {
  const type=req.headers.get('content-type')||''
  if(!/^(application\/x-www-form-urlencoded|multipart\/form-data)(?:;|$)/i.test(type))throw invalid()
  if(Number(req.headers.get('content-length'))>limit)throw new Failure(413,'Filerna eller formuläret är för stora.')
  const reader=req.body?.getReader()
  if(!reader)throw invalid()
  let total=0
  const chunks:Uint8Array[]=[]
  for(;;){
    const {done,value}=await reader.read()
    if(done)break
    total+=value.byteLength
    if(total>limit){await reader.cancel();throw new Failure(413,'Filerna eller formuläret är för stora.')}
    chunks.push(value)
  }
  try{return await new Response(Buffer.concat(chunks),{headers:{'content-type':type}}).formData()}catch{throw invalid()}
}
function field(form:FormData,key:string) {
  const values=form.getAll(key)
  if(values.length!==1||typeof values[0]!=='string')throw invalid()
  return values[0]
}
function integer(form:FormData,key:string,min:number,max:number) {
  const s=field(form,key)
  if(!/^\d{1,10}$/.test(s))throw invalid()
  const n=Number(s)
  if(n<min||n>max)throw invalid()
  return n
}
const fuels=['El','Hybrid','Bensin','Diesel'] as const
async function saveDraft(config:Config,slug:string,id:string,version:number,form:FormData,token:string) {
  const name=field(form,'name').trim(),fuel=field(form,'fuel') as VehicleContent['fuel']
  if(!name||Array.from(name).length>80||/[\u0000-\u001f\u007f]/.test(name)||!fuels.includes(fuel))throw invalid()
  const sold=form.getAll('sold')
  if(sold.length>1||(sold.length===1&&sold[0]!=='on'))throw invalid()
  const content:VehicleContent={name,fuel,price:integer(form,'price',0,99999999),year:integer(form,'year',1886,2100),
    mileage:integer(form,'mileage',0,9999999),sold:sold.length===1,photos:[]}
  const kept=form.getAll('keepPhoto')
  for(const hash of kept){if(typeof hash!=='string'||!hashPattern.test(hash))throw invalid();content.photos.push(hash)}
  const files=form.getAll('photos').filter((f):f is File=>typeof f!=='string' && (f.size>0||f.name!==''))
  if(form.getAll('photos').some(f=>typeof f==='string')||files.length+kept.length<1||files.length+kept.length>3)throw invalid()
  const uploads:string[]=[]
  for(const f of files){
    let photo
    try{photo=await displayPhoto(f)}catch{throw new Failure(422,'Välj en giltig JPEG-, PNG- eller WebP-bild, högst 3 MB per foto.')}
    content.photos.push(photo.hash);uploads.push(photo.bytes)
  }
  if(new Set(content.photos).size!==content.photos.length)throw new Failure(422,'Varje bild får bara väljas en gång.')
  await rpc(config,'save',{p_slug:slug,p_vehicle:id,p_version:version,p_content:content,p_uploads:uploads},token)
}

export async function handleDealerPilot(req:Request,config:Config):Promise<Response> {
  let base='',selectedId:string|undefined
  try{
    if(!loopbackOrigin(config.origin)||!loopbackOrigin(config.url)||!config.anonKey)throw offline()
    const url=new URL(req.url)
    if(url.origin!==config.origin||req.headers.get('host')!==new URL(config.origin).host)throw forbidden()
    if(!['GET','HEAD','POST'].includes(req.method))return new Response(null,{status:405,headers:{...safeHeaders,allow:'GET, HEAD, POST'}})
    const match=/^\/hall\/([a-z][a-z0-9-]{0,62})(?:\/(login|logout|admin|preview|foto\/([a-f0-9]{64})))?$/.exec(url.pathname)
    if(!match)throw missing()
    const [,slug,view='',hash]=match
    base='/hall/'+slug
    if(req.method==='POST'&&req.headers.get('origin')!==config.origin)throw forbidden()
    const isPost=req.method==='POST'
    if(isPost&&!['login','logout','admin'].includes(view)||!isPost&&view==='logout')return new Response(null,{status:405,headers:{...safeHeaders,allow:view==='logout'?'POST':'GET, HEAD'}})
    const session=loginSession(req,config)
    if(view==='login'&&isPost){
      const fields=await formBody(req,8192),email=field(fields,'email').trim(),password=field(fields,'password')
      if(!email||email.length>254||!password||password.length>256)throw invalid()
      const response=await gateway(config,'/auth/v1/token?grant_type=password',{email,password})
      if(!response.ok){
        if(response.status>=500)throw offline()
        return html(loginView(slug,'Inloggningen misslyckades. Kontrollera e-postadress och lösenord.'),response.status===429?429:401)
      }
      const access=await response.json() as {access_token:string;expires_in:number}
      if(!access.access_token||!Number.isFinite(access.expires_in)||access.expires_in<=0)throw offline()
      await rpc(config,'workspace',{p_slug:slug},access.access_token)
      const now=Date.now(), age=Math.min(Math.floor(access.expires_in),3600)
      for(const [key,value] of sessions)if(value.expires<=now)sessions.delete(key)
      if(session)sessions.delete(session.id)
      if(sessions.size>=128)throw new Failure(429,'För många aktiva provsessioner. Försök senare.')
      const key=randomBytes(32).toString('hex')
      sessions.set(key,{token:access.access_token,origin:config.origin,expires:now+age*1000})
      return redirect(base+'/admin',cookieValue(key,age))
    }
    if(view==='logout'){
      if(session){
        sessions.delete(session.id)
        await gateway(config,'/auth/v1/logout?scope=local',{},session.token).catch(()=>{})
      }
      return redirect(base+'/login',cookieValue('',0))
    }
    if(view==='login')return html(loginView(slug))
    if(!view)return html(showroomView(await rpc<Catalog>(config,'catalog',{p_slug:slug})))
    const privatePhoto=view.startsWith('foto/')&&url.searchParams.has('utkast')
    if(privatePhoto&&url.searchParams.get('utkast')!=='1')throw invalid()
    if(view.startsWith('foto/')){
      if(privatePhoto&&!session)throw new Failure(401,'Logga in för att se utkastets bild.')
      const encoded=await rpc<string>(config,'photo',{p_slug:slug,p_hash:hash,p_preview:privatePhoto},privatePhoto?session?.token:undefined)
      if(typeof encoded!=='string'||encoded.length>250000)throw missing()
      let bytes:Buffer
      try{bytes=await galleryPhoto(hash,Buffer.from(encoded,'base64'))}catch{throw missing()}
      return new Response(req.method==='HEAD'?null:Uint8Array.from(bytes).buffer,{headers:{...safeHeaders,'content-type':'image/webp','content-length':String(bytes.length)}})
    }
    if(!session){
      if(!isPost)return redirect(base+'/login')
      throw new Failure(401,'Logga in för att ändra annonsen.')
    }
    const workspace=await rpc<Workspace>(config,'workspace',{p_slug:slug},session.token)
    if(isPost){
      const form=await formBody(req,10*1024*1024),intent=field(form,'intent'),id=field(form,'vehicleId')
      if(!uuid.test(id))throw invalid()
      selectedId=id
      const version=integer(form,'version',0,2147483647)
      const current=workspace.vehicles.find(v=>v.id===id)
      if((current?.version??0)!==version)throw stale()
      if(intent==='save')await saveDraft(config,slug,id,version,form,session.token)
      else if(intent==='publish'||intent==='restore'){
        const revision=intent==='restore'?integer(form,'revision',0,2147483647):null
        await rpc(config,'edit',{p_slug:slug,p_vehicle:id,p_version:version,p_action:intent,p_content:null,p_revision:revision},session.token)
      }else throw invalid()
      return redirect(base+'/admin?bil='+id+'&klart='+intent)
    }
    const id=url.searchParams.get('bil')||undefined
    const selected=workspace.vehicles.find(v=>v.id===id)
    if(id&&id!=='ny'&&!selected)throw missing()
    if(view==='preview'){
      if(!selected)throw missing()
      const vehicles=workspace.vehicles.flatMap(v=>{
        const content=v.id===selected.id?v.draft:v.published
        return content?[{id:v.id,content}]:[]
      })
      return html(showroomView({slug,brand:workspace.brand,vehicles},true,selected.id))
    }
    const notices:Record<string,string>={save:'Utkastet är sparat.',publish:'Annonsen är publicerad.',restore:'Den valda versionen har återställts.'}
    const done=url.searchParams.get('klart')||''
    return html(adminView(workspace,id,Object.hasOwn(notices,done)?notices[done]:undefined))
  }catch(err){return errorResponse(err,base,selectedId)}
}
