import type { ProjectLocation, ProjectRoot } from './types'
import { WebsiteBuildError, validateBuildUuid } from '../store'
const kinds={source:'src',image:'assets/images',media:'assets/media',plan:'plans',preview:'previews'} as const
function fail(code='INVALID_PROJECT_ROOT'):never{throw new WebsiteBuildError(code)}
export function validateProjectRoot(input:unknown):ProjectRoot{
 if(!input||typeof input!=='object'||Array.isArray(input))fail()
 const o=input as Record<string,unknown>
 if(Object.keys(o).some(k=>!['os','root','targetId'].includes(k))||!['windows','macos','linux'].includes(String(o.os))||typeof o.root!=='string'||o.root.length>1024||/[\u0000-\u001f]/.test(o.root))fail()
 if(o.targetId!==null)validateBuildUuid(o.targetId)
 const windows=o.os==='windows',sep=windows?'\\':'/'
 let root=o.root.trim().replace(windows?/[\\/]+$/g:/\/+$/g,'')
 if(windows){
  if(!/^[a-z]:[\\/]/i.test(root)||root.includes('/')||/[<>|"?*]/.test(root)||root.slice(2).includes(':'))fail()
  root=root[0].toUpperCase()+root.slice(1)
  const parts=root.slice(3).split('\\')
  if(!parts.length||parts.some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))fail()
  if(/^.[\\:]\\(?:windows|program files(?: \(x86\))?|programdata)(?:\\|$)/i.test(root))fail()
 }else{
  if(!root.startsWith('/')||root.includes('\\')||root.split('/').slice(1).some(p=>!p||p==='.'||p==='..')||/^\/(?:etc|proc|sys|dev|boot|bin|sbin|usr|run)(?:\/|$)/.test(root))fail()
 }
 if(root===sep||/^[A-Z]:$/.test(root))fail()
 return {os:o.os as ProjectRoot['os'],root,targetId:o.targetId as string|null}
}
export function bindProjectLocation(base:ProjectRoot,name:string,projectId:string,existing?:ProjectLocation|null):ProjectLocation{
 validateBuildUuid(projectId)
 if(existing){if(existing.projectId!==projectId)fail();return {...existing,...validateProjectRoot({os:existing.os,root:existing.root,targetId:existing.targetId})}}
 const selected=validateProjectRoot(base)
 const slug=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'projekt'
 const folderName=slug+'-'+projectId.toLowerCase()
 return {...selected,projectId,folderName,root:selected.root+(selected.os==='windows'?'\\':'/')+folderName,status:'pending_runner'}
}
export function projectArtifactPath(kind:keyof typeof kinds,name:string):string{
 if(!kinds[kind]||typeof name!=='string'||!name||name.length>240||name.startsWith('/')||name.includes('\\')||/[:\u0000-\u001f]/.test(name)||name.split('/').some(x=>!x||x==='.'||x==='..'||/[. ]$/.test(x)))fail('INVALID_ARTIFACT_PATH')
 return kinds[kind]+'/'+name
}
