/**
 * Real Supabase Storage contract smoke test, isolated LOCAL instances only.
 *
 * Prerequisites: private atlas-reference-staging bucket created by the proposed
 * SQL schema in a disposable Supabase CLI project. No production calls, no
 * service key in source, no enduring data. Never use CI secrets here.
 *
 * ATLAS_REFERENCE_TEST_MODE=isolated-local
 * ATLAS_REFERENCE_TEST_URL=http://127.0.0.1:<local-port>
 * ATLAS_REFERENCE_TEST_ANON=<local-only anon key>
 * ATLAS_REFERENCE_TEST_SERVICE=<local-only service role key>
 */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import sharp from 'sharp'

const endpoint=process.env.ATLAS_REFERENCE_TEST_URL
const anonKey=process.env.ATLAS_REFERENCE_TEST_ANON
const serviceKey=process.env.ATLAS_REFERENCE_TEST_SERVICE

if(process.env.ATLAS_REFERENCE_TEST_MODE!=='isolated-local')
  throw Error('Refusing Storage test without explicit isolated-local opt-in')
if(!endpoint || !anonKey || !serviceKey)throw Error('Missing isolated-local Storage connection')
const url=new URL(endpoint)
if(url.protocol!=='http:' || !['127.0.0.1','localhost'].includes(url.hostname) || !url.port)
  throw Error('Refusing non-local Supabase endpoint')
const opts={auth:{persistSession:false,autoRefreshToken:false}}
const server=createClient(endpoint,serviceKey,opts)
const client=createClient(endpoint,anonKey,opts)
const bucket='atlas-reference-staging'
const prefix=()=>`incoming/${randomUUID()}/${randomUUID()}/${randomUUID()}.png`
const good=prefix(),wrong=prefix(),tooLarge=prefix()
const verified=[]

async function smoke(){
  try {
    const {data:buckets,error:listError}=await server.storage.listBuckets()
    assert.equal(listError,null)
    assert.equal(buckets?.find(x=>x.id===bucket)?.public,false)
    verified.push('private bucket')

    const {data:ticket,error:issueError}=await server.storage.from(bucket).createSignedUploadUrl(good)
    assert.equal(issueError,null)
    assert.ok(ticket?.token)
    const image=Uint8Array.from(await sharp({create:{width:73,height:47,channels:3,background:'#276e9b'}}).png().toBuffer())

    const unexpected=await client.storage.from(bucket).uploadToSignedUrl(wrong,ticket.token,new Blob([image],{type:'image/png'}),{contentType:'image/png',upsert:false})
    assert.ok(unexpected.error,'signed ticket may not be used for another path')
    verified.push('ticket path')

    const upload=await client.storage.from(bucket).uploadToSignedUrl(good,ticket.token,new Blob([image],{type:'image/png'}),{contentType:'image/png',upsert:false})
    assert.equal(upload.error,null,upload.error?.message)
    verified.push('real signed upload')

    const repeated=await client.storage.from(bucket).uploadToSignedUrl(good,ticket.token,new Blob([image],{type:'image/png'}),{contentType:'image/png',upsert:false})
    assert.ok(repeated.error,'upsert/replay must fail')
    verified.push('overwrite refusal')

    const anonRead=await client.storage.from(bucket).download(good)
    assert.ok(anonRead.error,'anonymous private read must fail')
    verified.push('anonymous read denied')

    const urlToPrivate=server.storage.from(bucket).getPublicUrl(good).data.publicUrl
    const response=await fetch(urlToPrivate)
    assert.equal(response.ok,false,'public URL for private bucket must fail')
    verified.push('public URL denied')

    const own=await server.storage.from(bucket).download(good)
    assert.equal(own.error,null,own.error?.message)
    assert.ok(own.data)
    assert.ok(Buffer.from(await own.data.arrayBuffer()).equals(Buffer.from(image)))
    verified.push('server read integrity')

    const oversizeTicket=await server.storage.from(bucket).createSignedUploadUrl(tooLarge)
    assert.equal(oversizeTicket.error,null)
    assert.ok(oversizeTicket.data?.token)
    const bytes=new Uint8Array(10*1024*1024+1)
    bytes.set(image.subarray(0,12))
    const oversized=await client.storage.from(bucket).uploadToSignedUrl(tooLarge,oversizeTicket.data.token,
      new Blob([bytes],{type:'image/png'}),{contentType:'image/png',upsert:false})
    assert.ok(oversized.error,'private bucket must enforce <=10MiB per file')
    verified.push('10 MiB limit')
    console.log('PASS: '+verified.join(', '))
  } finally {
    const {error:clean}=await server.storage.from(bucket).remove([good,wrong,tooLarge])
    if(clean)throw Error('Sandbox cleanup failure: '+clean.message)
    console.log('PASS: sandbox object cleanup')
  }
}
smoke().catch(err=>{console.error('FAIL: '+String(err?.message??err).slice(0,550));process.exitCode=1})
