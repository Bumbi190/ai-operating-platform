// Node-only by construction (crypto/Buffer); also used by the offline artifact compiler.
import {createHash} from 'node:crypto'
import sources from './demo-rasters-v1.json'

export const RASTER_HANDLE=/^atlas-asset:[a-f0-9]{64}$/
export function rasterHandle(src:string):string{
 if(typeof src!=='string'||src.length>1048576||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src))throw Error('INVALID_RASTER')
 const encoded=src.slice(src.indexOf(',')+1),bytes=Buffer.from(encoded,'base64')
 if(bytes.toString('base64')!==encoded)throw Error('INVALID_RASTER')
 return 'atlas-asset:'+createHash('sha256').update(bytes).digest('hex')
}
// Public fictional demo illustrations only. Never register user uploads here.
const bundled=sources.map(source=>{
 const id=rasterHandle(source.src)
 if(id!=='atlas-asset:'+source.sha256)throw Error('BUNDLED_RASTER_HASH_MISMATCH')
 return Object.freeze({...source,id})
})
export const BUNDLED_DEMO_RASTERS=Object.freeze(bundled)
export function bundledRaster(id:string){return RASTER_HANDLE.test(id)?bundled.find(item=>item.id===id):undefined}
