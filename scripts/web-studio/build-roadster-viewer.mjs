import {build} from 'esbuild'
import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import path from 'node:path'

const root=fileURLToPath(new URL('../../',import.meta.url))
const studio=path.join(root,'apps/web/lib/website-build/studio')
await build({entryPoints:[path.join(studio,'roadster-viewer.ts')],bundle:true,minify:true,
 format:'esm',platform:'browser',target:'es2022',
 outfile:path.join(studio,'cinematic-assets/roadster-v2-viewerRuntime.bin')})
const manifestPath=path.join(studio,'cinematic-assets/roadster-v1.json')
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'))
let template=readFileSync(path.join(studio,'roadster-templates.ts'),'utf8')
for(const [key,filename,extension] of [
 ['model','roadster-v3-model.glb','.glb'],
 ['viewerRuntime','roadster-v2-viewerRuntime.bin','.js']
]){
 const bytes=readFileSync(path.join(studio,'cinematic-assets',filename))
 const sha256=createHash('sha256').update(bytes).digest('hex')
 const previous=manifest.files[key].sha256
 manifest.files[key]={...manifest.files[key],filename,sha256,name:sha256+extension,bytes:bytes.length}
 template=template.replaceAll(previous,sha256)
}
manifest.sourceVersion.model='showroom-v10-recessed-thrusters'
manifest.sourceVersion.viewer='showroom-v10-evening-demand-render'
writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n')
writeFileSync(path.join(studio,'roadster-templates.ts'),template)
console.log(JSON.stringify({model:manifest.files.model.sha256,viewer:manifest.files.viewerRuntime.sha256}))
