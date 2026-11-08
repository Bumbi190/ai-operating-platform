import 'server-only'
import {spawn} from 'node:child_process'
import {resolve} from 'node:path'
import {randomUUID, createHash} from 'node:crypto'
import {admitAssetBytes} from '@/lib/media/asset/admission'
import {normalizeReferenceImage} from '../assets/normalize-reference'
import {WebsiteBuildError} from '../store'
import {publicWebsiteUrl} from './validation'
import type {ProspectCapture} from './types'

export function localCaptureAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.WEBBUILDER_LOCAL_CAPTURE !== 'isolated-local' || env.VERCEL || env.VERCEL_ENV) return false
  try {const url=new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '');return url.protocol==='http:'&&url.hostname==='127.0.0.1'&&!!url.port} catch {return false}
}
export async function runProspectCapture(url: string, assetPaths: string[]=[]): Promise<any> {
  if (!localCaptureAvailable()) throw new WebsiteBuildError('LOCAL_CAPTURE_UNAVAILABLE',409)
  const target=publicWebsiteUrl(url)
  const env: NodeJS.ProcessEnv={NODE_ENV:'development',OMNIRA_PROSPECT_CAPTURE_MODE:'isolated-local'}
  // Fixed allowlist only. Dynamic process.env[key] would permit unreviewed
  // credential reads, and is forbidden by the platform's CI credential audit.
  const inherited: Record<string,string|undefined> = {
    PATH:process.env.PATH, Path:process.env.Path, SystemRoot:process.env.SystemRoot,
    WINDIR:process.env.WINDIR, TEMP:process.env.TEMP, TMP:process.env.TMP,
    USERPROFILE:process.env.USERPROFILE, HOME:process.env.HOME,
    LOCALAPPDATA:process.env.LOCALAPPDATA
  }
  for (const [key,value] of Object.entries(inherited)) if(value) env[key]=value
  return new Promise((resolveResult,reject)=>{
    const child=spawn(process.execPath,[resolve(process.cwd(),'scripts/website-prospect-capture.mjs')],{env,stdio:['pipe','pipe','pipe'],windowsHide:true})
    const chunks: Buffer[]=[];let bytes=0,finished=false
    const timer=setTimeout(()=>{child.kill();finish(new WebsiteBuildError('CAPTURE_TIMEOUT',504))},80000)
    function finish(error?: Error,value?: unknown){if(finished)return;finished=true;clearTimeout(timer);if(error)reject(error);else resolveResult(value)}
    child.stdout.on('data',(chunk: Buffer)=>{bytes+=chunk.length;if(bytes>20*1024*1024){child.kill();finish(new WebsiteBuildError('CAPTURE_TOO_LARGE',413))}else chunks.push(chunk)})
    child.stderr.resume() // Provider/browser details never reach clients or application logs.
    child.once('error',()=>finish(new WebsiteBuildError('CAPTURE_UNAVAILABLE',503)))
    child.once('close',code=>{if(code!==0)return finish(new WebsiteBuildError('CAPTURE_FAILED',503));try{finish(undefined,JSON.parse(Buffer.concat(chunks).toString('utf8')))}catch{finish(new WebsiteBuildError('CAPTURE_FAILED',503))}})
    child.stdin.end(JSON.stringify({url:target,assetPaths}))
  })
}
export async function captureProspectWebsite(projectId: string, prospectId: string, url: string, beforePersist: ()=>Promise<void>): Promise<ProspectCapture> {
  const raw=await runProspectCapture(url),id=randomUUID()
  if(raw.sourceUrl!==url||raw.engine!=='playwright'||!Array.isArray(raw.images)||raw.images.length!==2)throw new WebsiteBuildError('CAPTURE_FAILED',503)
  const images: ProspectCapture['images']=[]
  for(const image of raw.images){
    const png=Buffer.from(image.png,'base64')
    if(createHash('sha256').update(png).digest('hex')!==image.sha256)throw new WebsiteBuildError('CAPTURE_FAILED',503)
    const normalized=await normalizeReferenceImage(png,'image/png')
    await beforePersist()
    const admitted=await admitAssetBytes({projectId,kind:'image',visibility:'internal',storage:{path:`website/prospects/${projectId}/${prospectId}/${id}/${image.viewport}`},bytes:normalized.bytes,mimeType:normalized.mimeType,width:normalized.width,height:normalized.height,
      provenance:{source:'imported',simulated:false,adapterVersion:'prospect-capture-v1',providerMetadata:{purpose:'prospect-current-website',captureId:id,sourceUrl:url,finalUrl:raw.finalUrl,capturedAt:raw.capturedAt,viewport:image.viewport,originalPngSha256:image.sha256}}})
    images.push({viewport:image.viewport,width:normalized.width,height:normalized.height,assetId:admitted.asset.id,sha256:admitted.asset.checksumSha256})
  }
  return {id,sourceUrl:url,finalUrl:raw.finalUrl,capturedAt:raw.capturedAt,engine:'playwright',images,observations:raw.observations,warnings:raw.warnings}
}
