// Offline-only verification/staging of a reviewed synthetic project export.
// Does not call Vercel, GitHub or any provider. NEVER publishes anything.
import JSZip from 'jszip'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs'
import {resolve,join,isAbsolute,relative,sep} from 'node:path'

const args=process.argv.slice(2)
const opt=k=>{const i=args.indexOf(k);return i===-1?null:args[i+1]}
if(!args.includes('--offline-synthetic-only'))throw Error('EXPLICIT_OFFLINE_SYNTHETIC_MODE_REQUIRED')
const zipPath=opt('--zip'),destination=opt('--destination'),expected=opt('--expected-sha256')
if(!zipPath||!destination||!isAbsolute(zipPath)||!isAbsolute(destination)||!/^[a-f0-9]{64}$/.test(expected??''))throw Error('ABSOLUTE_PATHS_AND_SHA256_REQUIRED')
const bytes=readFileSync(zipPath)
const sha=hash(bytes)
if(sha!==expected||bytes.length>50*1024*1024)throw Error('ARCHIVE_INTEGRITY_ERROR')
const zip=await JSZip.loadAsync(bytes,{checkCRC32:true})
const names=Object.keys(zip.files)
const indexFiles=names.filter(n=>/^[a-z0-9][a-z0-9_-]{0,99}\/dist\/index\.html$/.test(n))
if(indexFiles.length!==1)throw Error('SINGLE_ROOT_INDEX_REQUIRED')
const prefix=indexFiles[0].slice(0,-'dist/index.html'.length)
const manifest=JSON.parse(await zip.file(prefix+'project.json')?.async('string')??'null')
if(!manifest||manifest.folderName+'/'!==prefix||manifest.format!=='atlas-project.v1'||!Array.isArray(manifest.files))throw Error('EXPORT_MANIFEST_REQUIRED')
const entries=names.filter(n=>n.startsWith(prefix+'dist/')&&!zip.files[n].dir)
const selected=new Map();let total=0
for(const name of entries){
 const path=name.slice((prefix+'dist/').length)
 if(!path||path.startsWith('/')||path.includes('\\')||path.split('/').some(p=>p===''||p==='.'||p==='..')||path.includes('\0'))throw Error('UNSAFE_ARCHIVE_PATH')
 const data=await zip.files[name].async('nodebuffer');total+=data.length
 if(total>60*1024*1024)throw Error('ARCHIVE_UNCOMPRESSED_TOO_LARGE')
 const matching=manifest.files.filter(f=>f.path==='dist/'+path)
 if(matching.length!==1||matching[0].sha256!==hash(data)||matching[0].bytes!==data.length)throw Error('EXPORT_FILE_HASH_MISMATCH')
 selected.set(path,data)
}
if(!selected.has('index.html')||!selected.get('index.html').toString('utf8').includes('SYNTETISKT TEST')||!selected.get('index.html').toString('utf8').includes('noindex'))throw Error('SYNTHETIC_NOINDEX_ONLY')
const directory=resolve(destination),output=join(directory,'dist')
if(existsSync(directory))throw Error('REFUSE_OVERWRITE_STAGING')
mkdirSync(output,{recursive:true})
for(const [path,data] of selected){
 const dest=resolve(output,path)
 if(!dest.startsWith(output+sep))throw Error('UNSAFE_OUTPUT_PATH')
 mkdirSync(resolve(dest,'..'),{recursive:true});writeFileSync(dest,data,{flag:'wx'})
}
writeFileSync(join(output,'robots.txt'),'User-agent: *\nDisallow: /\n',{flag:'wx'})
writeFileSync(join(directory,'vercel.json'),JSON.stringify({$schema:'https://openapi.vercel.sh/vercel.json',outputDirectory:'dist',headers:[{source:'/(.*)',headers:[{key:'X-Robots-Tag',value:'noindex, nofollow, noarchive'}]}]},null,2)+'\n',{flag:'wx'})
writeFileSync(join(directory,'README.md'),`# Lokalt Vercel-paket – SYNTHETISKT TEST\n\nDetta är en testfixture, inte en riktig bilhandlare. **Ej publicerat, ej kundmaterial.**\nExport-SHA256: ${sha}\nOriginal-artefakt SHA256: ${manifest.preview?.artifactSha256??'saknas'}\n\nRätt mapp för eventuell senare separat godkänd Vercel-publicering är mappen som innehåller vercel.json och dist/. Den äldre demon svarade 404; denna mappstruktur är till för att undvika en extra src/.vercel/output-nivå.\n`,{flag:'wx'})
// The offline browser check must verify staged bytes, not merely trust the
// archive hash recorded when this folder was originally generated.
const paths=[...selected.keys()].map(path=>'dist/'+path).concat(['dist/robots.txt','vercel.json','README.md'])
const fileHashes=paths.map(path=>{const bytes=readFileSync(join(directory,path));return {path,sha256:hash(bytes),bytes:bytes.length}}).sort((a,b)=>a.path.localeCompare(b.path))
const report={mode:'offline-synthetic-only',published:false,sourceArchiveSha256:sha,artifactSha256:manifest.preview?.artifactSha256??null,fileCount:selected.size,outputDirectory:directory,totalBytes:total,entryPoint:'dist/index.html',vercelConfig:'vercel.json',noindex:true,fileHashes}
writeFileSync(join(directory,'staging-receipt.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify(report))
function hash(data){return createHash('sha256').update(data).digest('hex')}
