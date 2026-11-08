// Real, DISPOSABLE Supabase GoTrue/PostgREST/Storage RLS verification.
// Explicit Linux CI opt-in; never reads real remote endpoints, credentials or images.
// Reuses native isolated reference-auth stack with randomized per-run identities,
// internal Docker network, bounded containers and owned cleanup.
import assert from 'node:assert/strict'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {createClient} from '@supabase/supabase-js'
import sharp from 'sharp'
import {startReferenceStack} from './reference-local-stack.mjs'

if(process.env.ATLAS_REFERENCE_TEST_MODE!=='isolated-local'||process.platform!=='linux')
 throw Error('Vehicle Storage proof requires isolated-local mode on CI Linux only')

let stack
const quote=s=>"'"+String(s).replaceAll("'","''")+"'"
const bucket='vehicle-originals-private'
function client(url,key){return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}})}
function expectDenied(result,stage){
 assert(result.error||result.data===null,stage+': access was unexpectedly allowed')
}
try{
 stack=await startReferenceStack()
 const admin=client(stack.url,stack.serviceKey)
 const principalIds=[],emails=[],password='Local-'+randomUUID()+'!9'
 for(let i=0;i<2;i++){
  const email='vehicle-owner-'+randomUUID()+'@example.test'
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true})
  assert.ifError(created.error)
  principalIds.push(created.data.user.id);emails.push(email)
 }
 const ownerA=client(stack.url,stack.anonKey),ownerB=client(stack.url,stack.anonKey)
 for(const [i,c] of [ownerA,ownerB].entries()){
  const result=await c.auth.signInWithPassword({email:emails[i],password})
  assert.ifError(result.error)
  assert.equal(result.data.user.id,principalIds[i])
 }
 const [a,b]=principalIds
 const projectA=randomUUID(),projectB=randomUUID()
 const listingA=randomUUID(),listingB=randomUUID(),revokedA=randomUUID()
 const captureA=randomUUID(),captureB=randomUUID(),captureRevoked=randomUUID()
 // Bootstrap is ALREADY a synthetic app schema, with real GoTrue and Storage.
 // Apply the unchanged SQL PROPOSAL to the disposable DB, never to production.
 stack.sql(readFileSync(new URL('../../../docs/sql/atlas-studio-real-vehicle-captures-p1b-proposed.sql',import.meta.url),'utf8'))
 const settings=await admin.storage.createBucket(bucket,{
  public:false,fileSizeLimit:10*1024*1024,
  allowedMimeTypes:['image/png','image/jpeg','image/webp']
 })
 assert.ifError(settings.error)
 stack.sql(`insert into public.projects(id,owner_id) values
  (${quote(projectA)},${quote(a)}),(${quote(projectB)},${quote(b)});
  insert into public.website_vehicle_capture_listings(id,project_id,owner_id,state) values
  (${quote(listingA)},${quote(projectA)},${quote(a)},'evidence_only'),
  (${quote(listingB)},${quote(projectB)},${quote(b)},'evidence_only'),
  (${quote(revokedA)},${quote(projectA)},${quote(a)},'revoked');`)
 const source=[],rows=[]
 for(const [i,[owner,project,listing,capture]] of [
  [a,projectA,listingA,captureA],[b,projectB,listingB,captureB],
  [a,projectA,revokedA,captureRevoked]
 ].entries()){
  // Entirely synthetic pixel noise, never a real vehicle or customer photo.
  const pixels=randomBytes(480*480*3)
  const png=await sharp(pixels,{raw:{width:480,height:480,channels:3}})
    .png({compressionLevel:0}).toBuffer()
  assert(png.length>=20_000&&png.length<10_000_000)
  const hash=createHash('sha256').update(png).digest('hex')
  const path='vehicle-captures/'+project+'/'+listing+'/'+capture+'/front_three_quarter/'+hash+'.png'
  const row={owner,project,listing,capture,hash,path,bytes:png}
  source.push(row)
  // Use the real Storage API with a service-role fixture ONLY for seeding.
  const uploaded=await admin.storage.from(bucket).upload(path,png,{
   contentType:'image/png',upsert:false
  })
  assert.ifError(uploaded.error)
  rows.push(`(${quote(listing)},${quote(project)},${quote(owner)},${quote(capture)},
   'front_three_quarter',${quote(hash)},'png',${quote(path)},${png.length})`)
 }
 stack.sql(`insert into public.website_vehicle_capture_photos
  (listing_id,project_id,owner_id,capture_id,view_kind,sha256,file_format,object_path,recorded_bytes)
  values ${rows.join(',')};notify pgrst,'reload schema';`)
 const [owned,foreign,revoked]=source
 const ownDownload=await ownerA.storage.from(bucket).download(owned.path)
 assert.ifError(ownDownload.error)
 const body=Buffer.from(await ownDownload.data.arrayBuffer())
 assert.equal(createHash('sha256').update(body).digest('hex'),owned.hash)
 expectDenied(await ownerA.storage.from(bucket).download(foreign.path),'owner A cross-project')
 expectDenied(await ownerB.storage.from(bucket).download(owned.path),'owner B cross-project')
 expectDenied(await ownerA.storage.from(bucket).download(revoked.path),'revoked listing')
 const anonymous=client(stack.url,stack.anonKey)
 expectDenied(await anonymous.storage.from(bucket).download(owned.path),'anonymous read')
 const list=await ownerA.storage.from(bucket).list('vehicle-captures')
 assert.ifError(list.error)
 assert.equal(list.data?.length,0,'object listing must be denied, not leaked')
 const write=await ownerA.storage.from(bucket).upload(
  'vehicle-captures/unknown.png',Buffer.from('fixture'),{contentType:'image/png'}
 )
 assert(write.error,'an authenticated user must not upload')
 const mutate=await ownerA.storage.from(bucket).update(owned.path,Buffer.from('tamper'),{contentType:'image/png'})
 assert(mutate.error,'an authenticated user must not overwrite')
 const remove=await ownerA.storage.from(bucket).remove([owned.path])
 assert(remove.error||remove.data?.length===0,'an authenticated user must not delete')
 assert.equal((await admin.storage.from(bucket).download(owned.path)).error,null,
  'failed user writes cannot remove owned file')
 console.log('PASS: actual isolated GoTrue login + private Storage API cross-owner, revoked, anon, list and write denials.')
} finally {
 if(stack)await stack.close()
}
