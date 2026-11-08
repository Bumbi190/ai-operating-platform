import {test} from 'node:test'
import assert from 'node:assert/strict'
import {chromium} from '@playwright/test'
import {existsSync} from 'node:fs'
import {captureDocumentRegion} from './website-prospect-screenshot.mjs'

const chrome=process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':undefined
const opts={headless:true,...(chrome&&existsSync(chrome)?{executablePath:chrome}:{})}
test('pixel metadata matches PNG IHDR even when screenshot is taller than the viewport',async()=>{
 const browser=await chromium.launch(opts)
 try{
  for(const [width,viewportHeight,captureHeight] of [[390,844,2400],[1440,900,2600]]){
   const context=await browser.newContext({viewport:{width,height:viewportHeight}})
   const page=await context.newPage()
   await page.setContent('<!doctype html><html><body style="margin:0"><main style="height:4000px;background:linear-gradient(#fff,#abc)"><h1>Riktigt innehåll</h1></main></body></html>')
   const bytes=await captureDocumentRegion(page,context,width,captureHeight)
   assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a')
   assert.equal(bytes.readUInt32BE(16),width)
   assert.equal(bytes.readUInt32BE(20),captureHeight)
   assert.ok(captureHeight>viewportHeight)
   await context.close()
  }
 }finally{await browser.close()}
})
test('all attempted WebSockets are blocked before any browser network connection',async()=>{
 const browser=await chromium.launch(opts)
 try{
  const context=await browser.newContext()
  let denied=0
  await context.routeWebSocket('**/*',route=>{denied++;route.close()})
  const page=await context.newPage()
  await page.setContent('<!doctype html><title>Read-only WS gate</title>')
  const result=await page.evaluate(()=>new Promise(resolve=>{
   let done=false
   try{
    const ws=new WebSocket('wss://read-only-fixture.invalid/probe')
    ws.addEventListener('close',()=>{if(!done){done=true;resolve('closed')}},{once:true})
    ws.addEventListener('error',()=>{if(!done){done=true;resolve('blocked')}},{once:true})
   }catch{resolve('blocked')}
   setTimeout(()=>{if(!done)resolve('timeout')},1000)
  }))
  assert.ok(['closed','blocked'].includes(result),String(result))
  assert.equal(denied,1)
  await context.close()
 }finally{await browser.close()}
})
