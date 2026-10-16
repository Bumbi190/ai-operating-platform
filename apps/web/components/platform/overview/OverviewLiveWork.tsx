'use client'
import Link from 'next/link'
import {useEffect,useRef} from 'react'
import {useRouter} from 'next/navigation'
import {useAtlasConversation} from '@/lib/atlas/conversation/provider'
import type {GrowthProject,OverviewWork} from '@/lib/overview/growth-types'
import type {ReadResult} from '@/lib/overview/types'
import styles from './growth.module.css'
export function OverviewLiveWork({work,projects}:{work:ReadResult<OverviewWork>;projects:GrowthProject[]}){
  const {snapshot}=useAtlasConversation()
  const project=projects.find(p=>p.id===snapshot.plan?.ref.projectId&&p.id===snapshot.projectId)
  const plan=project?snapshot.plan:null
  const active=work.rows.filter(r=>r.active),shown=(active.length?active:work.rows).slice(0,4)
  const router=useRouter(),refresh=useRef(router.refresh),lastRefresh=useRef(0)
  refresh.current=router.refresh
  const receipt=[snapshot.id,snapshot.plan?.currentRevision.revisionId,snapshot.session?.sessionId,
    snapshot.entries.filter(e=>e.kind==='tool'&&e.resolved).length].join(':')
  const previousReceipt=useRef(receipt)
  const following=active.length>0||snapshot.pending
  useEffect(()=>{
    const hasReceipt=()=>!snapshot.pending&&previousReceipt.current!==receipt
    if(!following&&!hasReceipt())return
    let retry:ReturnType<typeof setTimeout>|undefined
    const refreshNow=()=>{
      if(!following&&!hasReceipt())return
      if(document.visibilityState!=='visible'||navigator.onLine===false)return
      const delay=5000-(Date.now()-lastRefresh.current)
      if(delay>0){
        clearTimeout(retry)
        retry=setTimeout(refreshNow,delay)
        return
      }
      // A hidden/offline/throttled receipt stays pending until a refresh
      // can actually request the authoritative server status.
      lastRefresh.current=Date.now()
      if(hasReceipt())previousReceipt.current=receipt
      refresh.current()
    }
    if(hasReceipt())refreshNow()
    const timer=following?window.setInterval(refreshNow,30_000):undefined
    const visible=()=>{if(document.visibilityState==='visible')refreshNow()}
    document.addEventListener('visibilitychange',visible)
    window.addEventListener('online',refreshNow)
    return ()=>{
      clearTimeout(retry)
      clearInterval(timer)
      document.removeEventListener('visibilitychange',visible)
      window.removeEventListener('online',refreshNow)
    }
  },[following,receipt,snapshot.pending])

  return <section className={styles.workPanel} aria-label="Atlas arbete" data-overview-work>
    <div className={styles.panelHeading}><h2>Atlas arbete</h2><span className={active.length?styles.liveDot:styles.quietDot} aria-hidden="true"/></div>
    <p className={styles.workIntro}>Fortsätt prata medan godkända jobb körs.</p>
    {plan&&snapshot.id&&<Link className={styles.planReceipt} href={'/chat/'+encodeURIComponent(snapshot.id)+'?build=1'}>
      <span>Plan sparad · {project!.name}</span>
      <strong>{plan.currentRevision.content.title}</strong>
      <small>Öppna planen för granskning ↗</small>
    </Link>}
    {work.state!=='complete'&&<p role="status" className={styles.sourceNote}>{work.state==='partial'?'Ofullständig arbetsstatus – visar kända jobb.':'Arbetsstatus kunde inte hämtas.'}</p>}
    {!!shown.length&&<ul className={styles.workList}>{shown.map(r=><li key={r.id}>
      <span className={styles.workStatus} data-status={r.status}>{r.statusLabel}</span>
      <Link href={r.href}><strong>{r.title}</strong><small>{r.projectName}</small></Link>
    </li>)}</ul>}
    {!shown.length&&work.state==='complete'&&<p className={styles.quiet}>Inga pågående jobb i senaste avläsningen.</p>}
    <p className={styles.workFoot}>{following?'Arbetsstatus uppdateras automatiskt medan arbetet pågår.':'Sparad plan, köat jobb och färdigt resultat visas var för sig.'}</p>
  </section>
}
