import {readFileSync} from 'node:fs'

export const MODEL3D_RUNTIME_ASSET=Object.freeze({
 id:'runtime:model3d-v1',
 kind:'model3d-runtime' as const,
 path:'assets/runtime/9501c3559f0bb8ac281e5c3e04a37f929f548ce278d92aff1701bb61d2a1692a.js',
 sha256:'9501c3559f0bb8ac281e5c3e04a37f929f548ce278d92aff1701bb61d2a1692a',
 bytes:646256
})

export function readModel3DRuntimeBytes():Uint8Array{
 return readFileSync(new URL('./runtime/model3d-v1.js',import.meta.url))
}
