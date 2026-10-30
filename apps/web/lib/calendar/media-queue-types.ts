export type CalendarMediaChannel='facebook'|'instagram'|'youtube';
export type CalendarMediaChannelState={channel:CalendarMediaChannel;tone:'waiting'|'review'|'success'|'error'|'neutral';label:string;bindingWarning:string|null};
export type CalendarMediaQueueItem={scriptId:string;title:string;channels:CalendarMediaChannelState[];tone:'waiting'|'review'|'error';label:string;href:string};
export type CalendarMediaQueue={projectId:string|null;available:boolean;truncated:boolean;readAt:string|null;items:CalendarMediaQueueItem[]};
export type PromptQueueScript={id:string;project_id:string;hook:string|null;status:string;video_status:string|null;generated_at:string|null;reviewed_at?:string|null;published_at?:string|null;instagram_media_id:string|null;facebook_post_id:string|null;youtube_video_id:string|null;publish_channel_state:unknown};
export type PromptQueueBinding={platform:CalendarMediaChannel;verification:string;blocked_at:string|null};
export const PROMPT_QUEUE_HREF='/projects/ai-media-automation/scripts';
export const emptyMediaQueue=(available=true,projectId:string|null=null):CalendarMediaQueue=>({projectId,available,truncated:false,readAt:null,items:[]});
