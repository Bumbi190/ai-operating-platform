import React from 'react'
import {ThePromptNewsFrame,type DailyPilotProps} from './ThePromptDailyPilot'
import {planIllustratedNewsShots} from '../../../web/lib/media/illustrated-news-shots'

export const THE_PROMPT_ILLUSTRATED_VERSION='the-prompt-illustrated-smooth-v1' as const
export type IllustratedNewsProps=Omit<DailyPilotProps,'illustratedShots'|'creativeVersion'> & {
 creativeVersion:typeof THE_PROMPT_ILLUSTRATED_VERSION
}

/**
 * Production presentation of the approved illustrated style.
 * Input checks are structural, never source, rights, spend or release authority.
 * The server handoff remains closed until those authorities are installed.
 */
export function ThePromptIllustratedNews(props:IllustratedNewsProps){
 const invalid=():never=>{throw new Error('INVALID_ILLUSTRATED_NEWS_INPUT')}
 if(props.creativeVersion!==THE_PROMPT_ILLUSTRATED_VERSION||
    ![props.hook,props.audioUrl,props.sourceLabel,props.sourceUrl].every(v=>typeof v==='string'&&!!v.trim())||
    !Number.isFinite(Date.parse(props.sourcePublishedAt))||
    !Array.isArray(props.images)||props.images.length!==3||new Set(props.images).size!==3||
    !props.images.every(v=>typeof v==='string'&&!!v.trim()))invalid()
 let illustratedShots:ReturnType<typeof planIllustratedNewsShots>
 try{illustratedShots=planIllustratedNewsShots(props.words,props.durationMs,props.images.length)}
 catch{return invalid()}
 return <ThePromptNewsFrame {...props} illustratedShots={illustratedShots} presentation="production"/>
}
