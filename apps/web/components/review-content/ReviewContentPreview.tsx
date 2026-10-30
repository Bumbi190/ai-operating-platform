'use client';
import {useState} from 'react';
import type {ReviewContent,ReviewMedia} from '@/lib/review-content/types';
import styles from './ReviewContentPreview.module.css';

async function downloadMedia(src:string, filename:string){
 const response=await fetch(src,{credentials:'same-origin'});
 if(!response.ok)throw new Error('download_failed');
 const blob=await response.blob();
 const url=URL.createObjectURL(blob);
 const extension=blob.type==='image/jpeg'?'jpg':blob.type==='image/webp'?'webp':blob.type==='image/gif'?'gif':'png';
 try{const link=document.createElement('a');link.href=url;link.download=`${filename}.${extension}`;document.body.appendChild(link);link.click();link.remove();}
 finally{window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
function DownloadImage({src,id}:{src:string;id:string}){
 const [error,setError]=useState(false),[busy,setBusy]=useState(false);
 return <div><button type="button" disabled={busy} onClick={async()=>{setError(false);setBusy(true);try{await downloadMedia(src,`omnira-${id.replace(/[^a-z0-9_-]/gi,'-')}`);}catch{setError(true);}finally{setBusy(false);}}}>{busy?'Hämtar bild…':'Ladda ner bild'}</button>{error&&<p role="alert">Bilden kunde inte laddas ner. Försök igen.</p>}</div>;
}
function CopyText({text}:{text:string}){const [copied,setCopied]=useState(false);return <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopied(true);}catch{setCopied(false);}}}>{copied?'Text kopierad':'Kopiera text'}</button>;}
function Media({media}:{media:ReviewMedia}){const [failed,setFailed]=useState(false);if(failed)return <p className={styles.notice} role="status">Förhandsvisningen kunde inte laddas. Läs om innehållet för att försöka igen.</p>;return media.kind==='image'?<div><img className={styles.image} src={media.src} alt={media.alt} loading="lazy" onError={()=>setFailed(true)}/><DownloadImage src={media.src} id={media.id}/></div>:<video className={styles.video} src={media.src} aria-label={media.alt} controls preload="none" playsInline onError={()=>setFailed(true)}/>;}
export function ReviewContentPreview({content}:{content:ReviewContent}){
 if(content.kind==='unavailable')return <p className={styles.notice} role="status">{content.reason}</p>;
 if(content.kind==='text')return <div className={styles.text}>{content.text||'Inget lagrat innehåll.'}</div>;
 if(content.kind==='media')return <div className={styles.preview}>
  {content.notice&&<p className={styles.notice} role="status">{content.notice}</p>}
  {content.media.map(media=><Media key={media.id+':'+media.src} media={media}/>)}
  {content.text&&<div className={styles.text}>{content.text}<CopyText text={content.text}/></div>}
 </div>;
 return <section className={styles.preview} aria-label="Mejlutkast">
  <dl className={styles.headers}><dt>Till</dt><dd>{content.to.join(', ')}</dd>{content.cc.length>0&&<><dt>Kopia</dt><dd>{content.cc.join(', ')}</dd></>}{content.bcc.length>0&&<><dt>Hemlig kopia</dt><dd>{content.bcc.join(', ')}</dd></>}<dt>Ämne</dt><dd>{content.subject||'Inget ämne'}</dd></dl>
  <div className={styles.text}>{content.bodyText}</div>
  {content.attachments.length>0&&<section aria-label="Bilagor"><h3>Bilagor</h3><ul className={styles.attachments}>{content.attachments.map((a,index)=><li key={a.id+':'+index}><strong>{a.name}</strong>{a.preview?<Media key={a.preview.id+':'+a.preview.src} media={a.preview}/>:<span>Ingen tillgänglig förhandsvisning{a.mimeType?' · '+a.mimeType:''}</span>}</li>)}</ul></section>}
 </section>;
}
