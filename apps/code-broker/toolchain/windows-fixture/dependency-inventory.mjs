import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
const ROOT='/opt/omnira/deps',RECEIPT='/opt/omnira/dependency-inventory.json'
const sha=b=>createHash('sha256').update(b).digest('hex')
const workspaceTargets=new Set(['/workspace/repo/apps/web','/workspace/repo/packages/local-text-contract'])
export function validateInventoryRecords(entries){
 if(!Array.isArray(entries)||entries.length<1||entries.length>200000)throw Error('inventory shape')
 let bytes=0,last=''
 for(const e of entries){
  if(!e||typeof e.path!=='string'||e.path===last||e.path<last||e.path.includes('\\')||e.path.startsWith('/')||e.path.split('/').some(p=>p==='..')||e.uid!==0||e.gid!==0||!Number.isSafeInteger(e.mode))throw Error('inventory identity')
  last=e.path
  if(e.type==='link'){if(typeof e.target!=='string'||!e.target||e.target.includes('\0'))throw Error('inventory link')}
  else if((e.mode&0o222)!==0)throw Error('writable dependency')
  if(e.type==='file'){if(!Number.isSafeInteger(e.size)||e.size<0||!/^([a-f0-9]{64})$/.test(e.sha256))throw Error('inventory file');bytes+=e.size}
  else if(e.type!=='directory'&&e.type!=='link')throw Error('inventory type')
 }
 if(bytes>4294967296)throw Error('inventory bytes')
 return sha(Buffer.from(JSON.stringify(entries)))
}
function fileHash(p){const h=createHash('sha256'),fd=fs.openSync(p,'r'),buffer=Buffer.alloc(1048576);try{for(;;){const n=fs.readSync(fd,buffer,0,buffer.length,null);if(n===0)break;h.update(buffer.subarray(0,n))}}finally{fs.closeSync(fd)}return h.digest('hex')}
export function snapshotDependencyInventory(root=ROOT){
 const entries=[]
 function walk(relative){
  const p=path.join(root,relative),s=fs.lstatSync(p)
  const e={path:relative||'.',type:s.isSymbolicLink()?'link':s.isDirectory()?'directory':s.isFile()?'file':'other',mode:s.mode&0o777,uid:s.uid,gid:s.gid}
  if(e.type==='link'){
   e.target=fs.readlinkSync(p);const resolved=path.resolve(path.dirname(p),e.target)
   if(!workspaceTargets.has(resolved)&&resolved!==root&&!resolved.startsWith(root+'/'))throw Error('outside dependency link')
  }else if(e.type==='file'){if(s.nlink!==1)throw Error('dependency hardlink');e.size=s.size;e.sha256=fileHash(p)}
  entries.push(e);if(entries.length>200000)throw Error('inventory size')
  if(e.type==='directory')for(const child of fs.readdirSync(p).sort())walk(relative?relative+'/'+child:child)
 }
 walk('');entries.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);validateInventoryRecords(entries);return entries
}
export function verifyDependencyInventory(expected){
 if(!/^[a-f0-9]{64}$/.test(expected))throw Error('inventory pin')
 const receipt=fs.readFileSync(RECEIPT);if(receipt.length>67108864||sha(receipt)!==expected)throw Error('inventory receipt drift')
 const actual=snapshotDependencyInventory();if(validateInventoryRecords(actual)!==expected)throw Error('dependency drift')
 return expected
}
function freeze(p){const s=fs.lstatSync(p);if(s.isSymbolicLink()){fs.lchownSync(p,0,0);return}
 if(s.isDirectory())for(const child of fs.readdirSync(p))freeze(path.join(p,child))
 fs.chownSync(p,0,0);fs.chmodSync(p,s.isDirectory()||((s.mode&0o111)!==0)?0o555:0o444)
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='prepare'||process.getuid()!==0)throw Error('fixed inventory setup only')
 const lock=JSON.parse(fs.readFileSync(ROOT+'/package-lock.json','utf8'))
 for(const [relative,row] of Object.entries(lock.packages))if(row.link===true){
  if(!['apps/web','packages/local-text-contract'].includes(row.resolved)||!relative.startsWith('node_modules/')||relative.split('/').includes('..'))throw Error('workspace link')
  const p=path.join(ROOT,relative);if(!fs.lstatSync(p).isSymbolicLink())throw Error('workspace not link');fs.unlinkSync(p);fs.symlinkSync('/workspace/repo/'+row.resolved,p)
 }
 for(const [name,pin] of Object.entries({'package.json':'d04f1e73243bd9d023a352fdc42b1892474d76f8c0519acd08819b926d500fdd','package-lock.json':'17ba6aedc7139835f0de6c62fc13c727682b737fe142ee7e99d452673625de80','apps/web/package.json':'def6e3795da9eb4250e703446080ddb824d2128a6e6869949c09efd374944313','packages/local-text-contract/package.json':'662e5cee1fd9e5bb13002f31793f54b50ea0a1eb67ab34a2931977f583c27cb3'}))if(sha(fs.readFileSync(ROOT+'/'+name))!==pin)throw Error('descriptor changed during ci');
 freeze(ROOT);const entries=snapshotDependencyInventory(),bytes=Buffer.from(JSON.stringify(entries));fs.writeFileSync(RECEIPT,bytes,{mode:0o444})
 const versions={node:process.versions.node,npm:JSON.parse(fs.readFileSync('/usr/local/lib/node_modules/npm/package.json','utf8')).version,typescript:JSON.parse(fs.readFileSync(ROOT+'/node_modules/typescript/package.json','utf8')).version,vitest:JSON.parse(fs.readFileSync(ROOT+'/node_modules/vitest/package.json','utf8')).version}
 if(versions.node!=='22.23.3'||versions.typescript!=='5.9.3'||versions.vitest!=='2.1.9')throw Error('tool version mismatch')
 console.log('OMNIRA_TOOLCHAIN_RECEIPT='+JSON.stringify({schema:'sdf.node_toolchain_build.v1',inventorySha256:sha(bytes),entries:entries.length,versions,lifecycleSentinelAbsent:!fs.existsSync('/tmp/omnira-lifecycle-sentinel')}))
}
