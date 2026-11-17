// Local-only, public-website observation report. Not an SCB identity or contact receipt.
import {readFileSync,writeFileSync} from 'node:fs'
import {isAbsolute} from 'node:path'
import {createHash} from 'node:crypto'
import {suggestProspectImprovements} from '../lib/website-build/prospects/improvements'
import type {ProspectCapture} from '../lib/website-build/prospects/types'

const args=process.argv.slice(2),at=(name:string)=>{const index=args.indexOf(name);return index>=0?args[index+1]:null}
if(!args.includes('--public-site-only'))throw Error('EXPLICIT_PUBLIC_READONLY_REQUIRED')
const source=at('--source'),destination=at('--output')
if(!source||!destination||!isAbsolute(source)||!isAbsolute(destination))throw Error('ABSOLUTE_SOURCE_AND_OUTPUT_REQUIRED')
const raw=JSON.parse(readFileSync(source,'utf8'))
if(raw.kind!=='public-website-only-not-scb-verified'||!Array.isArray(raw.observations)||raw.observations.length<10||!Array.isArray(raw.images)||raw.images.length!==2||!Array.isArray(raw.pages)||raw.pages.length!==2)throw Error('PUBLIC_SITE_EVIDENCE_REQUIRED')
const hostname=new URL(raw.finalUrl).hostname
if(hostname!==new URL(raw.sourceUrl).hostname||hostname!== 'www.edforsbil.se')throw Error('UNEXPECTED_SITE_IDENTITY')
const capture:ProspectCapture={id:'public-observation-only',sourceUrl:raw.sourceUrl,finalUrl:raw.finalUrl,capturedAt:raw.capturedAt,engine:'playwright',images:[],observations:raw.observations,warnings:raw.warnings}
const improvements=suggestProspectImprovements(capture)
if(improvements.length!==3||improvements.some(item=>item.observationIds.some(id=>!capture.observations.some(obs=>obs.id===id))))throw Error('THREE_GROUNDED_IMPROVEMENTS_REQUIRED')
const images=raw.images.map((image:any)=>{const data=Buffer.from(image.png,'base64'),sha256=createHash('sha256').update(data).digest('hex');if(sha256!==image.sha256)throw Error('SCREENSHOT_CHECKSUM_MISMATCH');return {viewport:image.viewport,width:image.width,height:image.height,sha256,bytes:data.length}})
const report={dataKind:'public-website-capture-only',scbVerified:false,contactAuthorized:false,humanReviewed:false,publicationAuthorized:false,sourceUrl:raw.sourceUrl,finalUrl:raw.finalUrl,capturedAt:raw.capturedAt,images,pages:raw.pages,warnings:raw.warnings,improvements:improvements.map(item=>({...item,observations:item.observationIds.map(id=>capture.observations.find(obs=>obs.id===id))}))}
writeFileSync(destination,JSON.stringify(report,null,2)+'\n',{flag:'w',mode:0o600})
console.log(JSON.stringify({dataKind:report.dataKind,scbVerified:false,website:hostname,improvements:report.improvements.map(x=>({id:x.id,title:x.title,evidenceIds:x.observationIds})),imageChecksumsVerified:images.length,pages:report.pages.map((p:any)=>({viewport:p.viewport,width:p.width,overflow:p.overflow,imagesLoaded:p.imagesLoaded})),publicationAuthorized:false}))
