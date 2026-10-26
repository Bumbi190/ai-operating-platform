'use client';
import {useState} from 'react';
import type {ReviewContent,ReviewMedia} from '@/lib/review-content/types';
import styles from './ReviewContentPreview.module.css';
function Media({media}:{media:ReviewMedia}){const [failed,setFailed]=useState(false);if(failed)return <p className={styles.notice} role="status">Förhandsvisningen kunde inte laddas. Läs om innehållet för att försöka igen.</p>;return media.kind==='image'?<img className={styles.image} src={media.src} alt={media.alt} loading="lazy" onError={()=>setFailed(true)}/>:<video className={styles.video} src={media.src} aria-label={media.alt} controls preload="none" playsInline onError={()=>setFailed(true)}/>;}
export function ReviewContentPreview({content}:{content:ReviewContent}){
 if(content.kind==='unavailable')return <p className={styles.notice} role="status">{content.reason}</p>;
 if(content.kind==='text')return <div className={styles.text}>{content.text||'Inget lagrat innehåll.'}</div>;
 if(content.kind==='media')return <div className={styles.preview}>
  {content.notice&&<p className={styles.notice} role="status">{content.notice}</p>}
  {content.media.map(media=><Media key={media.id+':'+media.src} media={media}/>)}
  {content.text&&<div className={styles.text}>{content.text}</div>}
 </div>;
 return <section className={styles.preview} aria-label="Mejlutkast">
  <dl className={styles.headers}><dt>Till</dt><dd>{content.to.join(', ')}</dd>{content.cc.length>0&&<><dt>Kopia</dt><dd>{content.cc.join(', ')}</dd></>}{content.bcc.length>0&&<><dt>Hemlig kopia</dt><dd>{content.bcc.join(', ')}</dd></>}<dt>Ämne</dt><dd>{content.subject||'Inget ämne'}</dd></dl>
  <div className={styles.text}>{content.bodyText}</div>
  {content.attachments.length>0&&<section aria-label="Bilagor"><h3>Bilagor</h3><ul className={styles.attachments}>{content.attachments.map(a=><li key={a.id}><strong>{a.name}</strong>{a.preview?<Media key={a.preview.id+':'+a.preview.src} media={a.preview}/>:<span>Ingen tillgänglig förhandsvisning{a.mimeType?' · '+a.mimeType:''}</span>}</li>)}</ul></section>}
 </section>;
}
