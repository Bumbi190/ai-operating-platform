import {createHash} from 'node:crypto'
export function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}'
 return JSON.stringify(value)
}
export function artifactHash(value:unknown):string{return createHash('sha256').update(canonical(value),'utf8').digest('hex')}
