import {readFileSync} from 'node:fs'

export const MODEL3D_RUNTIME_ASSET=Object.freeze({
 id:'runtime:model3d-v1',
 kind:'model3d-runtime' as const,
 path:'assets/runtime/653da4edf27bd493853dc724767544ecb9f3932e874f4a96a3ee57d90ea32595.js',
 sha256:'653da4edf27bd493853dc724767544ecb9f3932e874f4a96a3ee57d90ea32595',
 bytes:646228
})

export function readModel3DRuntimeBytes():Uint8Array{
 return readFileSync(new URL('./runtime/model3d-v1.bin',import.meta.url))
}
