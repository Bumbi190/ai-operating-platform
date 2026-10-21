'use client'
import {useRef,type ReactNode} from 'react'
import {Settings2,X} from 'lucide-react'
import styles from './AtlasBuilderStudio.module.css'

export function StudioSettings({children}:{children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null)
 return <>
  <button type="button" onClick={()=>dialog.current?.showModal()}><Settings2 size={16} aria-hidden/><span>Inställningar</span></button>
  <dialog ref={dialog} className={styles.settingsDialog} aria-label="Projektinställningar">
   <div className={styles.settingsHeading}><h2>Projektinställningar</h2><button type="button" aria-label="Stäng inställningar" onClick={()=>dialog.current?.close()}><X size={18} aria-hidden/></button></div>
   {children}
  </dialog>
 </>
}
