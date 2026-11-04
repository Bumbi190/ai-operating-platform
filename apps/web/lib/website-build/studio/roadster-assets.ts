import {createHash} from 'node:crypto'
import {existsSync,readFileSync} from 'node:fs'
import path from 'node:path'
import manifest from './cinematic-assets/roadster-v1.json'
import {ROADSTER_RUNTIME} from './roadster-runtime'

export const ROADSTER_PRESET=manifest
const controlBytes=Buffer.from(ROADSTER_RUNTIME)
const controlHash=createHash('sha256').update(controlBytes).digest('hex')
export const ROADSTER_CONTROLS={name:controlHash+'.js',sha256:controlHash,bytes:controlBytes.length}
const files=new Map(Object.values(manifest.files).map(file=>[file.name,file]))
export function isRoadsterViewerAsset(parts:string[]){
 return parts.length===2&&parts[0]==='3d'&&
  (parts[1]===manifest.files.model.name||parts[1]===manifest.files.cover.name)
}
/** Exact immutable approved files only. A request never becomes a filesystem path. */
export function readRoadsterAsset(name:string):{bytes:Buffer;contentType:string}|null{
 if(name===ROADSTER_CONTROLS.name)return {bytes:controlBytes,contentType:'text/javascript; charset=utf-8'}
 const file=files.get(name)
 if(!file)return null
 const cwd=process.cwd(),root=existsSync(path.join(cwd,'lib','website-build'))?cwd:path.join(cwd,'apps','web')
 const bytes=readFileSync(path.join(root,'lib','website-build','studio','cinematic-assets',file.filename))
 if(bytes.length!==file.bytes||bytes.length>16*1024*1024||
  createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw Error('ROADSTER_INTEGRITY')
 return {bytes,contentType:file.contentType}
}
