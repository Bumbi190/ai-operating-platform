'use client'
import type {StudioProject} from '@/lib/website-build/studio/types'
export function StudioProjectPicker({id,projects,selected,onChange}:{id?:string;projects:StudioProject[];selected:StudioProject|null;onChange:(id:string|null)=>void}){
 const choices=selected&&!projects.some(p=>p.id===selected.id)?[selected,...projects]:projects
 return <label id={id}>Projekt<select aria-label="Projekt i byggstudion" value={selected?.id??''} onChange={e=>onChange(e.target.value||null)}><option value="">Nytt projekt</option>{choices.map(p=><option key={p.id} value={p.id}>{p.name}{p.lifecycle.state==='archived'?' · Arkiverat':p.lifecycle.state==='trashed'?' · Papperskorg':''}</option>)}</select></label>
}
