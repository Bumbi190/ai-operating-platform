'use client'
import {useState} from 'react'
import {useAtlasConversation} from '@/lib/atlas/conversation/provider'
import type {GrowthRecommendation} from '@/lib/overview/growth-types'
import styles from './growth.module.css'
export function DiscussSuggestion({suggestion}:{suggestion:GrowthRecommendation}){
  const {controller}=useAtlasConversation(),[notice,setNotice]=useState('')
  function discuss(){
    const lines=[
      'Jag vill diskutera ett förslag för '+suggestion.projectName+'.',
      'Förslag: '+suggestion.title,
      'Motivering: '+suggestion.reason,
      ...(suggestion.counterfactual?['Om vi avstår: '+suggestion.counterfactual]:[]),
      ...(suggestion.defeater?['Det som kan ändra bedömningen: '+suggestion.defeater]:[]),
      'Underlag: '+suggestion.projectHref,
      'Detta är en diskussion om underlaget, inte ett godkännande att utföra förslaget.'
    ]
    const accepted=controller.requestDiscussion(lines.join('\n'))
    setNotice(accepted?'Förslaget finns som oskickat textutkast hos Atlas.':'Öppna Atlas för att diskutera förslaget.')
  }
  return <div className={styles.discuss}>
    <button type="button" onClick={discuss}>Diskutera med Atlas <span aria-hidden="true">↗</span></button>
    {notice&&<span role="status">{notice}</span>}
  </div>
}
