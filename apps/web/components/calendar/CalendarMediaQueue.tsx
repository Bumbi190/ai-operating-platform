'use client';
import type {CalendarMediaQueue as Queue} from '@/lib/calendar/media-queue-types';
import {PROMPT_QUEUE_HREF} from '@/lib/calendar/media-queue-types';
import styles from './Calendar.module.css';
const labels={facebook:'Facebook',instagram:'Instagram',youtube:'YouTube'};
export function CalendarMediaQueue({queue,projectFilter,loading}:{queue:Queue|undefined;projectFilter:string;loading:boolean}){
 if(!queue||projectFilter!=='all'&&projectFilter!==queue.projectId||queue.available&&queue.projectId===null)return null;
 return <section className={styles.mediaQueue} aria-label="The Prompts publiceringskö" aria-busy={loading}>
  <div className={styles.mediaQueueHeader}><h2>The Prompt · aktuell publiceringskö</h2><a className={styles.sourceLink} href={PROMPT_QUEUE_HREF}>Öppna nyhetsfilmerna ↗</a></div>
  <p>Ingen fast publiceringstid. Kön visar nuläget, oavsett vilken kalendervecka du tittar på. Nyheterna fortsätter genom det dagliga publiceringsflödet.</p>
  {loading?<p role="status">Läser aktuell publiceringskö…</p>:<>
   {!queue.available&&<p role="status">Kön kunde inte läsas fullständigt. Kontrollera nyhetsfilmerna för aktuellt läge.</p>}
   {queue.truncated&&<p role="status">Alla poster ryms inte i den här hämtningen. Öppna nyhetsfilmerna för hela listan.</p>}
   {queue.available&&queue.items.length===0&&<p>Inga godkända filmer väntar i den hämtade kön.</p>}
   {queue.items.length>0&&<ul className={styles.mediaQueueItems}>{queue.items.map(item=><li key={item.scriptId}>
    <div className={styles.mediaQueueTitle}><span className={styles.statusDot} data-tone={item.tone} aria-hidden="true"/><div><strong>{item.title}</strong><span>{item.label}</span></div></div>
    <ul className={styles.mediaQueueChannels}>{item.channels.map(channel=><li key={channel.channel}><span className={styles.statusDot} data-tone={channel.tone} aria-hidden="true"/><span><b>{labels[channel.channel]}</b> · {channel.label}{channel.bindingWarning&&channel.bindingWarning!==channel.label&&<small>{channel.bindingWarning}</small>}</span></li>)}</ul>
   </li>)}</ul>}
  </>}
 </section>;
}
