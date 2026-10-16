// Self-host the pinned local VAD assets. Run from apps/web before dev/build/tests.
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { mkdir, copyFile } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const ort = dirname(require.resolve('onnxruntime-web/wasm'))
const vad = dirname(require.resolve('@ricky0123/vad-web'))
const target = resolve('public/atlas-vad')
await mkdir(target, { recursive: true })
for (const file of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) await copyFile(resolve(ort, file), resolve(target, file))
await copyFile(resolve(vad, 'silero_vad_v5.onnx'), resolve(target, 'silero_vad_v5.onnx'))
console.log('Local speech detector assets ready.')
