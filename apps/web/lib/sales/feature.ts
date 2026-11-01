import {UUID} from './validate'
// An explicit allowlist takes precedence. Invalid/empty configuration never falls back.
export function salesProjectIds():string[]{
 const configured=process.env.ATLAS_SALES_PROJECT_IDS
 const values=configured===undefined?[process.env.ATLAS_SALES_PROJECT_ID??'']:configured.split(',')
 if(values.length<1||values.length>20)return []
 const ids=values.map(value=>value.trim().toLowerCase())
 if(ids.some(value=>!UUID.test(value))||new Set(ids).size!==ids.length)return []
 return ids
}
export function salesEnabled(projectId?:string):boolean{
 if(process.env.ATLAS_SALES_ENABLED!=='true')return false
 const ids=salesProjectIds()
 return ids.length>0&&(projectId===undefined||(UUID.test(projectId)&&ids.includes(projectId.toLowerCase())))
}
