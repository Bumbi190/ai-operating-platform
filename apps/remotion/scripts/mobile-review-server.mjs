/**
 * Read-only, token-limited, local-LAN mobile review. No publishing or editing.
 *
 * Run from Remotion workspace with:
 * THE_PROMPT_PREVIEW_HOST=<own RFC1918 IPv4> node scripts/mobile-review-server.mjs
 * All audio/images MUST exist locally in ignored public/the-prompt-qa.
 */
import {createServer} from 'node:http'
import {randomBytes} from 'node:crypto'
import {createReadStream,readFileSync,statSync} from 'node:fs'
import {resolve,dirname,join} from 'node:path'
import {fileURLToPath} from 'node:url'
import net from 'node:net'

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const DATA=join(ROOT,'src','compositions','data')
const MEDIA=join(ROOT,'public','the-prompt-qa')
function privateIpv4(host){
  if(net.isIP(host)!==4)return false
  const [a,b]=host.split('.').map(Number)
  return a===10 || a===192&&b===168 || a===172&&b>=16&&b<=31
}
function captionGroups(words){
  const groups=[]
  let current=[]
  const finish=()=>{
    if(!current.length)return
    const begin=current[0].startMs
    groups.push({startMs:begin,endMs:Math.max(begin+270,current.at(-1).endMs+90),words:current})
    current=[]
  }
  for(let i=0;i<words.length;i++){
    const w=words[i],last=current.at(-1)
    if(last&&(w.startMs<last.startMs||w.startMs-last.endMs>310))finish()
    current.push(w)
    const next=words[i+1]
    if(current.length>=6||/[.!?]$/.test(w.text)||/[,;:]$/.test(w.text)&&current.length>=3||
       next&&next.startMs-w.endMs>310)finish()
  }
  finish()
  for(let i=0;i<groups.length-1;i++)groups[i].endMs=Math.min(groups[i].endMs,groups[i+1].startMs)
  return groups
}
const scenes={
  codex:{
    label:'AI / CODING',kicker:'THE CODEX EXPERIMENT',
    starts:[0,5329,10089,17519],
    beats:[
      ['01 / THE SIGNAL','AN AI THAT NEVER SLEEPS?'],
      ['02 / THE IDEA','CODEX COULD KEEP WORKING.'],
      ['03 / THE FACTS','A TEST. NOT A LAUNCH.'],
      ['04 / YOUR TAKE','WOULD YOU TRUST IT?'],
    ],
  },
  recruiter:{
    label:'AI / WORK',kicker:'THE AI-TO-AI INTERVIEW',
    starts:[0,3541,10716,17206],
    beats:[
      ['01 / THE SETUP','AI INTERVIEWED ANOTHER AI.'],
      ['02 / THE CALL','TWO BOTS. TEN MINUTES.'],
      ['03 / THE OUTCOME','NO HUMAN FOLLOW-UP.'],
      ['04 / THE QUESTION','WHO IS REALLY HIRING?'],
    ],
  },
}
// A new, private, genuinely dated article – not a replay of old demos.
if(process.env.THE_PROMPT_REPLIT_REVIEW_ENABLED==='true'){
const replit=JSON.parse(readFileSync(join(MEDIA,'replit-timing.json'),'utf8'))
if(replit.voiceId!=='qSeXEcewz7tA0Q0qk9fH'||replit.modelId!=='eleven_turbo_v2_5' ||
   replit.sourcePublishedAt!=='2026-10-16T12:55:00Z' ||
   !Array.isArray(replit.words)||replit.words.length<30)
   throw Error('Unverified Replit preview metadata')
scenes.replit={
  label:'AI / WORK',kicker:'REPLIT / OCT 16',
  starts:[0,5846,13328,17050],
  beats:[
    ['01 / THE HOOK','A SELF-DRIVING COMPANY?'],
    ['02 / THE AGENTS','AGENTS DO THE GROUNDWORK.'],
    ['03 / THE LIMIT','HUMANS STILL DECIDE.'],
    ['04 / YOUR TAKE','YOUR WORKPLACE NEXT?'],
  ],
  duration:replit.durationMs/1000,
  captions:captionGroups(replit.words.map(w=>({text:w.word,startMs:w.startMs,endMs:w.endMs}))),
}
}
// Explicitly optional archived episode: never treated as today's fresh news.
// Earlier published narration contains an overstatement of rollout reach.
if(process.env.THE_PROMPT_ITAU_COMPARISON_ENABLED==='true'){
  const itau=JSON.parse(readFileSync(join(MEDIA,'itau-timing.json'),'utf8'))
  if(!Array.isArray(itau.words)||itau.words.length<30||
     itau.durationMs!==22059||itau.words[0]?.word!=='Itaú')
    throw Error('Archived Itaú media integrity mismatch')
  scenes.itau={
    label:'AI / BANKING',kicker:'ITAU / OCT 16 • ARCHIVED',
    starts:[0,4679,11367,19424],
    beats:[
      ['01 / SCOPE','AI BANKING: 300K IN PHASE ONE.'],
      ['02 / APPLICATION','ASSISTANTS FOR CUSTOMERS AND STAFF.'],
      ['03 / GOVERNANCE','IARA CONTROLS AI AT SCALE.'],
      ['04 / WHAT NEXT','FULL ROLLOUT IS STILL A GOAL.'],
    ],
    duration:itau.durationMs/1000,
    captions:captionGroups(itau.words.map(w=>({
      text:w.word,startMs:w.startMs,endMs:w.endMs,
    }))),
    reviewWarning:'ARCHIVED VOICE: FIRST LINE OVERSTATES REACH. DO NOT POST.',
  }
}
for(const name of ['codex','recruiter']){
  const m=JSON.parse(readFileSync(join(DATA,name+'-captions.json'),'utf8'))
  if(m.voiceId!=='qSeXEcewz7tA0Q0qk9fH'||m.modelId!=='eleven_turbo_v2_5')
    throw Error('Non-canonical The Prompt voice: '+name)
  if(!m.words?.length||!Number.isFinite(m.durationSecs))throw Error('Missing captions: '+name)
  scenes[name].duration=m.durationSecs
  scenes[name].captions=captionGroups(m.words)
}
const files=new Set(['codex.mp3','recruiter.mp3',
  ...(scenes.replit?['replit.mp3',...[0,1,2].map(n=>'replit-'+n+'.svg')]:[]),
  ...(scenes.itau?['itau.mp3',...[0,1,2].map(n=>'itau-'+n+'.png')]:[]),
  ...['codex','recruiter'].flatMap(x=>[0,1,2].map(n=>x+'-'+n+'.png'))])
for(const file of files)if(statSync(join(MEDIA,file)).size===0)throw Error('Missing media: '+file)
const host=process.env.THE_PROMPT_PREVIEW_HOST
const port=Number(process.env.THE_PROMPT_PREVIEW_PORT||3136)
if(!host||!privateIpv4(host)||!Number.isInteger(port)||port<1024||port>65535)
  throw Error('Set THE_PROMPT_PREVIEW_HOST to the computer private LAN IPv4, and a valid port')
const token=process.env.THE_PROMPT_PREVIEW_TOKEN ?? randomBytes(24).toString('hex')
if(!/^[a-f0-9]{48}$/.test(token))throw Error('Invalid private preview token')
const prefix='/r/'+token
const rawHtml=readFileSync(join(ROOT,'scripts','mobile-review.html'),'utf8')
function viewer(){
  const nonce=randomBytes(16).toString('base64url')
  const payload=JSON.stringify({base:prefix,stories:scenes}).replaceAll('<','\\u003c')
  const html=rawHtml
    .replace('__PAYLOAD__',payload)
    .replace('__REPLIT_TAB__',scenes.replit?'<button class="tab" data-story="replit" aria-pressed="true">New: Replit</button>':'')
    .replace('__ITAU_TAB__',scenes.itau?'<button class="tab" data-story="itau" aria-pressed="false">Archive: Itaú</button>':'')
    .replace('__DEFAULT_STORY__',scenes.replit?'replit':'codex')
    .replace('<style>','<style nonce="'+nonce+'">')
    .replace('<script>\n(function','<script nonce="'+nonce+'">\n(function')
  return {html,nonce}
}
const responseHeaders={
  'cache-control':'private, no-store, max-age=0',
  'content-language':'en',
  'x-content-type-options':'nosniff',
  'referrer-policy':'no-referrer',
  'cross-origin-resource-policy':'same-origin',
}
const server=createServer((req,res)=>{
  try{
    if(req.headers.host!==host+':'+port){res.writeHead(403,responseHeaders).end();return}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,responseHeaders).end();return}
    const pathname=new URL(req.url,'http://localhost').pathname
    if(pathname===prefix||pathname===prefix+'/'){
      const {html,nonce}=viewer()
      res.writeHead(200,{...responseHeaders,'content-type':'text/html; charset=utf-8',
        'content-security-policy':"default-src 'none'; script-src 'nonce-"+nonce+
        "'; style-src 'nonce-"+nonce+
        "'; img-src 'self'; media-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'; connect-src 'none'"})
      res.end(req.method==='HEAD'?'':html)
      return
    }
    if(!pathname.startsWith(prefix+'/asset/')){res.writeHead(404,responseHeaders).end();return}
    const filename=pathname.slice((prefix+'/asset/').length)
    if(!files.has(filename)){res.writeHead(404,responseHeaders).end();return}
    const stat=statSync(join(MEDIA,filename))
    const mime=filename.endsWith('.mp3')?'audio/mpeg':filename.endsWith('.svg')?'image/svg+xml':'image/png'
    const headers={...responseHeaders,'content-type':mime,'accept-ranges':'bytes'}
    let start=0,end=stat.size-1,status=200
    if(req.headers.range){
      const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range)
      if(!match){res.writeHead(416,{...headers,'content-range':'bytes */'+stat.size}).end();return}
      start=Number(match[1])
      end=match[2]?Number(match[2]):end
      if(start>=stat.size||end<start||end>=stat.size){
        res.writeHead(416,{...headers,'content-range':'bytes */'+stat.size}).end();return
      }
      status=206
      headers['content-range']='bytes '+start+'-'+end+'/'+stat.size
    }
    headers['content-length']=String(end-start+1)
    res.writeHead(status,headers)
    if(req.method==='HEAD'){res.end();return}
    createReadStream(join(MEDIA,filename),{start,end}).pipe(res)
  }catch(e){if(!res.headersSent)res.writeHead(503,responseHeaders);res.end()}
})
server.listen(port,host,()=>console.log('PRIVATE_MOBILE_URL=http://'+host+':'+port+prefix+'/'))
