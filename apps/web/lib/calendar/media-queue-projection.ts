import {PROMPT_QUEUE_HREF,type CalendarMediaChannel,type CalendarMediaChannelState,type CalendarMediaQueueItem,type PromptQueueScript,type PromptQueueBinding} from './media-queue-types';
const channels:CalendarMediaChannel[]=['facebook','instagram','youtube'];
const receiptColumns={facebook:'facebook_post_id',instagram:'instagram_media_id',youtube:'youtube_video_id'} as const;
const object=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
export function projectPromptQueue(scripts:PromptQueueScript[],bindings:PromptQueueBinding[]|null,now:string):CalendarMediaQueueItem[]{
 const at=Date.parse(now),seen=new Set<string>(),items:CalendarMediaQueueItem[]=[];
 for(const script of scripts){
  if(!['approved','publishing','published'].includes(script.status)||seen.has(script.id))continue;
  seen.add(script.id);
  const age=at-Date.parse(script.generated_at??''),validAge=Number.isFinite(age)&&age>=0;
  const observations=object(script.publish_channel_state);
  const states:CalendarMediaChannelState[]=channels.map(channel=>{
   const binding=bindings?.find(b=>b.platform===channel),receipt=script[receiptColumns[channel]],obs=object(observations[channel]);
   const bindingWarning=bindings===null?'Kontokoppling behöver kontrolleras':!binding?'Kontokoppling saknas':binding.blocked_at?'Kontokopplingen är spärrad':binding.verification!=='provider_attested'?'Kontokopplingen behöver verifieras':null;
   const state=(tone:CalendarMediaChannelState['tone'],label:string):CalendarMediaChannelState=>({channel,tone,label,bindingWarning});
   if(typeof receipt==='string'&&receipt.trim())return state('success','Publicerat · sparat kvitto');
   if(binding?.blocked_at)return state('error','Kontokopplingen är spärrad');
   if(bindingWarning)return state('review',bindingWarning);
   if(script.video_status==='failed')return state('error','Videoproduktionen misslyckades');
   if(obs.ok===false&&obs.permanent===true)return state('error','Publiceringen är spärrad');
   if(obs.needsVerification===true||obs.ok===true)return state('review','Publicering behöver bekräftas');
   // Meta only picks approved rows; published can still be picked by YouTube.
   if(channel!=='youtube'&&script.status==='published')return state('review','Kanalutfallet behöver kontrolleras');
   if(!validAge)return state('review','Nyhetens tid behöver kontrolleras');
   if(script.video_status==='archived'||age>(channel==='youtube'?48:96)*3600000)return state('review','Nyheten är för gammal för automatisk publicering');
   if(obs.ok===false||obs.stopped===true)return state('review','Publiceringen behöver kontrolleras');
   if(script.status==='publishing')return state('waiting','Publicering pågår');
   if(script.video_status==='ready')return state('waiting','Godkänd · väntar på publicering');
   if(['none','generating','rendering'].includes(script.video_status??''))return state('waiting','Godkänd · video förbereds');
   return state('review','Videons status behöver kontrolleras');
  });
  // A shared published status/time does not settle each channel; warnings remain actionable.
  if(states.every(s=>s.tone==='success'&&!s.bindingWarning))continue;
  const tone=states.some(s=>s.tone==='error'||s.bindingWarning==='Kontokopplingen är spärrad')?'error':states.some(s=>s.tone==='review'||s.bindingWarning)?'review':'waiting';
  const waiting=states.find(s=>s.tone==='waiting')?.label;
  items.push({scriptId:script.id,title:(script.hook??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,150)||'Godkänd nyhetsfilm',channels:states,tone,label:tone==='error'?'Publiceringen behöver åtgärdas':tone==='review'?'Publiceringen behöver kontrolleras':waiting??'Väntar på återstående kanaler',href:PROMPT_QUEUE_HREF});
 }
 return items;
}
