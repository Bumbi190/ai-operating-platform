'use client'

import {useEffect,useState,type CSSProperties,type ReactNode} from 'react'
import {usePathname} from 'next/navigation'
import {PanelLeftClose,PanelLeftOpen} from 'lucide-react'
import {isVNext,type OmniraUiGeneration} from '@/lib/ui/generation'
import styles from './PlatformWorkspace.module.css'

const SIDEBAR_PREFERENCE='omnira-sidebar-collapsed'

/** Presentation only: the server layout still owns authentication and scope. */
export function PlatformWorkspace({children,className,style,uiGeneration}:{children:ReactNode;className?:string;style?:CSSProperties;uiGeneration:OmniraUiGeneration}){
 const pathname=usePathname()
 const [collapsed,setCollapsed]=useState(false)
 useEffect(()=>{try{setCollapsed(localStorage.getItem(SIDEBAR_PREFERENCE)==='true')}catch{}},[])
 function toggleSidebar(){
  const next=!collapsed
  setCollapsed(next)
  try{localStorage.setItem(SIDEBAR_PREFERENCE,String(next))}catch{}
 }
 return <div className={[className,styles.shell].filter(Boolean).join(' ')} style={style} data-shell-generation={uiGeneration} data-sidebar-collapsed={collapsed} data-workspace={pathname==='/build'?'studio':undefined}>
  {isVNext(uiGeneration)&&<button type="button" className={styles.toggle} onClick={toggleSidebar} aria-label={collapsed?'Visa meny':'Dölj meny'} title={collapsed?'Visa meny':'Dölj meny'} aria-expanded={!collapsed} aria-controls="omnira-sidebar">{collapsed?<PanelLeftOpen size={19} aria-hidden/>:<PanelLeftClose size={19} aria-hidden/>}</button>}
  {children}
 </div>
}
