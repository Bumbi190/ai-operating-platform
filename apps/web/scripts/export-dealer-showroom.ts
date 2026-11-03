/**
 * Export the public, fictional dealer pilot as a standalone Vercel static output.
 * From apps/web: tsx --tsconfig e2e/website-cinematic/tsconfig.json scripts/export-dealer-showroom.ts <fresh-directory>
 * Only the explicitly named read-only documents and bundled media are exported.
 */
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {GET} from '../app/bilhandlare/[[...path]]/route'
import {MODEL3D_RUNTIME_ASSET} from '../lib/website-build/model3d-runtime-asset'
import {cinematicAssetNames} from '../lib/website-build/studio/cinematic-assets'
import {nordFilmName} from '../lib/website-build/studio/cinematic-listing'
import {reelFiles} from '../lib/website-build/studio/cinematic-reel'
import listing from '../lib/website-build/studio/cinematic-assets/nord-r.json'

type Match = {type:'query'; key:string; value?:string}
type StaticRoute = {
  src:string; methods?:string[]; dest?:string; headers?:Record<string,string>
  has?:Match[]; missing?:Match[]; status?:number
}

async function main() {
  assert(process.argv[2], 'Supply a fresh output directory')
  const root = path.resolve(process.argv[2], '.vercel')
  await mkdir(root, {recursive:true})
  const output = path.join(root,'output')
  await mkdir(output) // Fail closed on an existing output so stale files cannot be released.
  const content = path.join(output,'static','content')
  await mkdir(content,{recursive:true})
  const routes:StaticRoute[] = []
  const blobs = new Set<string>()
  const receipt:{url:string;bytes:number;sha256:string}[] = []
  async function capture(relative:string, match:Pick<StaticRoute,'has'|'missing'> = {}) {
    const url = new URL('/bilhandlare'+relative,'https://omniraos.se')
    const parts = url.pathname.split('/').slice(2)
    const response = await GET(new Request(url),{params:{path:parts}})
    assert.equal(response.status,200,url.pathname)
    const bytes = Buffer.from(await response.arrayBuffer())
    const sha = createHash('sha256').update(bytes).digest('hex')
    const type = response.headers.get('content-type')!
    const isHtml = type.startsWith('text/html')
    if (isHtml) {
      assert(bytes.includes(Buffer.from('<html')), 'Invalid HTML payload')
      assert(!bytes.includes(Buffer.from('/build/demo-motors')), 'Document still references the private preview')
    } else {
      const digest = path.basename(url.pathname).match(/(?:^|\.)([a-f0-9]{16}|[a-f0-9]{64})(?=\.)/)?.[1]
      assert(digest && sha.startsWith(digest),'Filename does not match the asset contents: '+url.pathname)
    }
    const filename = sha+(isHtml?'.html':path.extname(url.pathname))
    if(!blobs.has(filename)) {
      await writeFile(path.join(content,filename), bytes, {flag:'wx'})
      blobs.add(filename)
    }
    const headers:Record<string,string> = {
      'Content-Type':type, 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
      'Cache-Control':isHtml?'public, max-age=0, must-revalidate':'public, max-age=31536000, immutable',
    }
    for(const key of ['content-security-policy','x-frame-options']) {
      const value = response.headers.get(key)
      if(value) headers[key] = value
    }
    // All released path segments consist exclusively of literals, lowercase letters, hyphens, digits and dots.
    assert(/^\/[a-z0-9./-]+$/.test(url.pathname))
    routes.push({src:'^'+url.pathname.replaceAll('.','\\.')+'$',methods:['GET','HEAD'],...match,dest:'/content/'+filename,headers})
    receipt.push({url:url.pathname+url.search,bytes:bytes.length,sha256:sha})
  }

  await capture('')
  await capture('/bilhall?view=nord-r',{has:[{type:'query',key:'view',value:'nord-r'}]})
  await capture('/bilhall?view=visning',{has:[{type:'query',key:'view',value:'visning'}]})
  await capture('/bilhall',{missing:[{type:'query',key:'view'}]})
  const photos = [listing.front,listing.rear,listing.cabin,listing.studio,listing.orbit]
  for(const name of [...Object.values(cinematicAssetNames()),...reelFiles.keys(),nordFilmName(),...photos.map(p=>p.sha256+'.webp')]) {
    await capture('/bilhall/assets/'+name)
  }
  for(const name of [MODEL3D_RUNTIME_ASSET.path,'assets/3d/'+listing.front.sha256+'.webp','assets/3d/'+listing.model.sha256+'.glb']) {
    await capture('/'+name)
  }
  routes.push({src:'/.*',status:404})
  await writeFile(path.join(output,'config.json'),JSON.stringify({version:3,routes},null,2)+'\n')
  console.log(JSON.stringify({files:blobs.size,entries:receipt},null,2))
}

main().catch(error => {console.error(error);process.exitCode=1})
