'use client'

/**
 * Real OHLCV replay chart — visualization only, no order controls.
 * Trades, PnL, win rate and strategy signals remain UNAVAILABLE until
 * canonical gates & exit rules pass independent review.
 */
import {useEffect,useMemo,useRef,useState} from 'react'
import type {HistoricalAsset,HistoricalDay} from '@/lib/trading/historical/local-history'

const WICK_UP='#5ee8bf'
const WICK_DOWN='#fb8290'
const GRID='#243852'
const AXIS='#94aecb'
const pad={left:15,top:27,right:79,bottom:38}
const money=(n:number)=>n.toLocaleString('sv-SE',{maximumFractionDigits:2,minimumFractionDigits:2})
const clock=(iso:string)=>new Date(iso).toLocaleTimeString('sv-SE',{
 timeZone:'UTC',hour:'2-digit',minute:'2-digit'
})

export function HistoricalBacktestView({dataset}:{dataset:HistoricalDay}){
 const [root,setRoot]=useState<'NQ'|'ES'>('NQ')
 const [cursor,setCursor]=useState(0)
 const [playing,setPlaying]=useState(false)
 const [speed,setSpeed]=useState(5)
 const [windowBars,setWindowBars]=useState(130)
 const [hoverIndex,setHoverIndex]=useState<number|null>(null)
 const canvasRef=useRef<HTMLCanvasElement>(null)
 const wrapRef=useRef<HTMLDivElement>(null)
 const [width,setWidth]=useState(1050)
 const asset:HistoricalAsset=dataset.assets.find(x=>x.root===root)??dataset.assets[0]
 const candles=asset.bars
 const index=Math.min(cursor,candles.length-1)
 const viewed=candles.slice(0,index+1)  // NEVER USE FUTURE DATA
 const last=viewed.at(-1)??candles[0]
 const first=viewed[0]
 const range=useMemo(()=>{
  return {
   high:Math.max(...viewed.map(x=>x.high)),
   low:Math.min(...viewed.map(x=>x.low)),
   volume:viewed.reduce((s,x)=>s+x.volume,0),
   missingMinutes:viewed.slice(1).reduce((s,x,i)=>
      s+Math.max(0,Math.round((Date.parse(x.time)-Date.parse(viewed[i].time))/60000)-1),0),
  }
 },[viewed])
 const delta=last.close-first.open
 useEffect(()=>{
  setCursor(0);setPlaying(false);setHoverIndex(null)
 },[root])
 useEffect(()=>{
  if(!playing)return
  const timer=setInterval(()=>setCursor(pos=>{
   if(pos>=candles.length-1){setPlaying(false);return pos}
   return Math.min(candles.length-1,pos+1)
  }),Math.round(250/Math.max(1,speed)))
  return ()=>clearInterval(timer)
 },[playing,speed,candles.length])
 useEffect(()=>{
  const div=wrapRef.current
  if(!div)return
  const observer=new ResizeObserver(entries=>{
   setWidth(Math.max(320,Math.round(entries[0].contentRect.width)))
  })
  observer.observe(div)
  return ()=>observer.disconnect()
 },[])
 useEffect(()=>{
  const node=canvasRef.current
  if(!node)return
  const h=Math.min(680,Math.max(410,Math.round(window.innerHeight*0.64)))
  const dpr=Math.min(window.devicePixelRatio||1,2)
  node.width=Math.round(width*dpr)
  node.height=Math.round(h*dpr)
  node.style.width=width+'px'
  node.style.height=h+'px'
  const g=node.getContext('2d')
  if(!g)return
  g.setTransform(dpr,0,0,dpr,0,0)
  g.clearRect(0,0,width,h)
  g.fillStyle='#0a1323';g.fillRect(0,0,width,h)
  const chartWidth=width-pad.left-pad.right
  const chartHeight=h-pad.top-pad.bottom
  const priceHeight=chartHeight*.78
  const volumeBase=pad.top+chartHeight
  const count=Math.min(windowBars,index+1)
  const left=Math.max(0,index-count+1)
  const segment=candles.slice(left,index+1)
  const lows=segment.map(x=>x.low),highs=segment.map(x=>x.high)
  const rawLo=Math.min(...lows),rawHi=Math.max(...highs)
  const floor=rawLo-Math.max(0.5,(rawHi-rawLo)*.08)
  const ceil=rawHi+Math.max(0.5,(rawHi-rawLo)*.08)
  const y=(p:number)=>pad.top+(ceil-p)/(ceil-floor)*(priceHeight-10)
  const barStep=chartWidth/windowBars
  const x=(i:number)=>pad.left+(i+0.5)*barStep+(windowBars-count)*barStep
  g.strokeStyle=GRID;g.lineWidth=1;g.font='11px ui-monospace,monospace'
  g.textBaseline='middle'
  for(let j=0;j<=6;j++){
   const py=pad.top+j*priceHeight/6
   g.globalAlpha=.6;g.beginPath();g.moveTo(pad.left,py);
   g.lineTo(width-pad.right+7,py);g.stroke();g.globalAlpha=1
   const price=ceil-(ceil-floor)*j/6
   g.fillStyle=AXIS;g.fillText(money(price),width-pad.right+12,py)
  }
  g.strokeStyle='#2b4057';g.beginPath()
  g.moveTo(pad.left,pad.top+priceHeight+6)
  g.lineTo(width-pad.right,pad.top+priceHeight+6);g.stroke()
  const maxVol=Math.max(1,...segment.map(x=>x.volume))
  for(let i=0;i<segment.length;i++){
   const b=segment[i],xx=x(i),green=b.close>=b.open
   const color=green?WICK_UP:WICK_DOWN
   g.strokeStyle=color;g.fillStyle=color;g.lineWidth=1
   g.beginPath();g.moveTo(xx,y(b.high));g.lineTo(xx,y(b.low));g.stroke()
   const top=Math.min(y(b.open),y(b.close)),height=Math.max(1,Math.abs(y(b.close)-y(b.open)))
   const bw=Math.max(1.5,Math.min(12,barStep*.72))
   g.fillRect(xx-bw/2,top,bw,height)
   const vH=b.volume/maxVol*(chartHeight-priceHeight-17)
   g.globalAlpha=.55;g.fillRect(xx-bw/2,volumeBase-vH,bw,vH);g.globalAlpha=1
   if(i===0||i===segment.length-1||i%Math.max(1,Math.floor(windowBars/8))===0){
    g.fillStyle=AXIS;g.font='10px ui-monospace,monospace'
    g.textAlign='center';g.fillText(clock(b.time),xx,h-17);g.textAlign='left'
   }
  }
  if(segment.length){
   const priceY=y(last.close)
   g.strokeStyle='#f0da84';g.setLineDash([4,4])
   g.beginPath();g.moveTo(pad.left,priceY);g.lineTo(width-pad.right,priceY);g.stroke()
   g.setLineDash([])
   g.fillStyle='#f0da84';g.fillRect(width-pad.right,priceY-11,pad.right-3,22)
   g.font='bold 11px ui-monospace,monospace';g.fillStyle='#111c2a'
   g.fillText(money(last.close),width-pad.right+5,priceY)
  }
  if(hoverIndex!==null&&hoverIndex>=0&&hoverIndex<segment.length){
   const b=segment[hoverIndex],xx=x(hoverIndex)
   g.strokeStyle='#8daac9';g.globalAlpha=.6;g.setLineDash([3,5])
   g.beginPath();g.moveTo(xx,pad.top);g.lineTo(xx,volumeBase);g.stroke()
   g.setLineDash([]);g.globalAlpha=1
   g.fillStyle='#9bb2cd';g.font='10px ui-monospace,monospace'
   g.fillText(clock(b.time),Math.min(width-180,Math.max(15,xx+9)),pad.top+10)
  }
 },[candles,index,width,windowBars,hoverIndex,last.close])
 const onHover=(event:React.MouseEvent<HTMLCanvasElement>)=>{
  const bounds=event.currentTarget.getBoundingClientRect()
  const xpos=(event.clientX-bounds.left)*width/bounds.width
  const count=Math.min(windowBars,index+1)
  const slot=(width-pad.left-pad.right)/windowBars
  const startX=pad.left+(windowBars-count)*slot
  const i=Math.floor((xpos-startX)/slot)
  setHoverIndex(i>=0&&i<count?i:null)
 }
 return (
  <div className="flex flex-col gap-4 text-slate-100">
   <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-[#101d30] px-4 py-3">
    <div>
     <p className="text-xs font-semibold uppercase tracking-[.15em] text-teal-300">Omnira · Backtest / Historisk replay</p>
     <h1 className="mt-1 text-xl font-semibold">Riktiga NQ/ES-candles · 15 oktober 2026</h1>
     <p className="mt-1 text-xs text-slate-400">Databento GLBX.MDP3 · 1m OHLCV · Validerade råfiler · UTC</p>
    </div>
    <span className="rounded-full border border-amber-700/60 bg-amber-950/30 px-3 py-2 text-xs font-bold text-amber-200">
     VERKLIGA CANDLES · INGA VERIFIERADE STRATEGIAFFÄRER
    </span>
   </header>
   <div className="flex flex-wrap items-center gap-2">
    {(['NQ','ES'] as const).map(r=>
     <button key={r} type="button" onClick={()=>setRoot(r)} aria-pressed={r===root}
      className={'rounded-md px-4 py-2 text-sm font-semibold '+(r===root?'bg-teal-600 text-white':'bg-slate-800 text-slate-300 hover:bg-slate-700')}>
      {r} · {r==='NQ'?'Nasdaq 100':'S&P 500'}</button>)}
    <span className="ml-auto text-xs text-slate-400">{asset.symbol} · {index+1}/{candles.length} candles</span>
   </div>
   <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_270px]">
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-700 bg-[#0a1323]" aria-label="Historisk interaktiv candlestick-graf">
     <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-3 text-xs">
      <span className="font-bold text-slate-100">{asset.symbol} · 1m · UTC</span>
      <span className="text-slate-400">O {money(last.open)} H {money(last.high)} L {money(last.low)} C {money(last.close)}</span>
      <span className={delta>=0?'text-teal-300':'text-rose-300'}>{delta>=0?'+':''}{money(delta)} sedan visad start</span>
     </div>
     <div ref={wrapRef} className="w-full">
      <canvas ref={canvasRef} role="img" aria-label={'Historisk '+asset.symbol+' candlestickgraf, '+(index+1)+' av '+candles.length+' candles'}
       onMouseMove={onHover} onMouseLeave={()=>setHoverIndex(null)} className="block max-w-full" />
     </div>
     <div className="border-t border-slate-800 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
       <button type="button" onClick={()=>{setPlaying(false);setCursor(0)}} className="rounded bg-slate-800 px-3 py-2 text-xs">↺ Start</button>
       <button type="button" onClick={()=>{setPlaying(false);setCursor(Math.max(0,index-1))}} className="rounded bg-slate-800 px-3 py-2 text-xs">◀ 1m</button>
       <button type="button" onClick={()=>setPlaying(v=>!v)} className="rounded bg-teal-700 px-4 py-2 text-xs font-bold">{playing?'⏸ Pausa':'▶ Spela'}</button>
       <button type="button" onClick={()=>{setPlaying(false);setCursor(Math.min(candles.length-1,index+1))}} className="rounded bg-slate-800 px-3 py-2 text-xs">1m ▶</button>
       <label className="ml-auto text-xs text-slate-400">Hastighet{' '}
        <select value={speed} onChange={e=>setSpeed(Number(e.target.value))}
         className="rounded bg-slate-800 p-1 text-slate-100"><option value={1}>1×</option><option value={5}>5×</option><option value={25}>25×</option></select>
       </label>
       <label className="text-xs text-slate-400">Zoom{' '}
        <select value={windowBars} onChange={e=>setWindowBars(Number(e.target.value))}
         className="rounded bg-slate-800 p-1 text-slate-100"><option value={60}>60 candles</option><option value={130}>130 candles</option><option value={300}>300 candles</option></select>
       </label>
      </div>
      <input aria-label="Historisk replayposition" type="range" className="mt-3 w-full accent-teal-400"
       min={0} max={Math.max(0,candles.length-1)} value={index}
       onChange={e=>{setPlaying(false);setCursor(Number(e.target.value))}}/>
      <div className="flex justify-between text-xs text-slate-500"><span>{clock(first.time)} UTC</span><span>{clock(last.time)} UTC</span><span>{clock(candles.at(-1)?.time??first.time)} UTC</span></div>
     </div>
    </section>
    <aside className="flex flex-col gap-3">
     <div className="rounded-xl border border-slate-700 bg-[#112036] p-4">
      <h2 className="text-sm font-bold text-teal-300">Statistik · visad historik</h2>
      <p className="mt-1 text-xs text-slate-400">Beräknad endast från candles fram till replaypositionen.</p>
      <dl className="mt-4 space-y-3 text-sm">
       {[
        ['Candles',String(viewed.length)],
        ['Högsta',money(range.high)],
        ['Lägsta',money(range.low)],
        ['Volym',Math.round(range.volume).toLocaleString('sv-SE')],
        ['Minuter utan candle',String(range.missingMinutes)],
        ['Förändring',money(delta)],
       ].map(([label,value])=><div key={label} className="flex justify-between border-b border-slate-700/50 pb-2"><dt className="text-slate-400">{label}</dt><dd className="font-mono text-slate-100">{value}</dd></div>)}
      </dl>
     </div>
     <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4">
      <h2 className="text-sm font-bold text-amber-200">Strategi-backtest väntar</h2>
      <p className="mt-2 text-xs leading-5 text-amber-100/80">Entry, SL, TP, CISD och resterande GATE-01–04 är inte fullständigt godkända. Därför visar vi inga fiktiva affärer som om de vore riktiga.</p>
      <dl className="mt-3 space-y-2 text-xs">
       {['Affärer','Win rate','Expectancy (R)','Profit factor','Drawdown'].map(v=>
        <div key={v} className="flex justify-between"><dt className="text-slate-400">{v}</dt><dd className="font-semibold text-amber-200">Ej beräknat</dd></div>)}
      </dl>
     </div>
     <div className="rounded-xl border border-slate-700 bg-[#112036] p-4 text-xs text-slate-400">
      <p className="font-semibold text-slate-200">Källdokumentation</p>
      <p className="mt-2">{asset.symbol} · instrument-ID {asset.instrumentId}</p>
      <p className="mt-1">SHA-256: {asset.sha256.slice(0,18)}…</p>
      <p className="mt-2">Sessionskalender: ännu inte verifierad. Saknade candles kan motsvara minuter utan affärer.</p>
     </div>
    </aside>
   </div>
  </div>
 )
}
