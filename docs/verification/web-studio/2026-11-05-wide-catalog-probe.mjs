import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const repo='C:/Users/Andre/Projects/Omnira/.worktrees/atlas-builder-references-20261017';
const temp='C:/Users/Andre/Projects/Omnira/Temp';
const mod=p=>import(pathToFileURL(repo+'/'+p).href);
const {runBootstrapReplay}=await mod('apps/web/scripts/migration-bootstrap-replay-local.mjs');
const {readProvenanceInputs}=await mod('apps/web/scripts/migration-baseline-provenance.mjs');
const {planCanonicalBootstrap}=await mod('apps/web/scripts/migration-bootstrap-plan.mjs');
const {CATALOG_SQL}=await mod('apps/web/scripts/migration-bootstrap-catalog-local.mjs');
const query=readFileSync(temp+'/webbuilder-wide-catalog-20261105.sql','utf8');
let catalog=null;
const receipt=await runBootstrapReplay({
 plan:planCanonicalBootstrap(readProvenanceInputs(repo)),read:p=>readFileSync(repo+'/'+p,'utf8'),env:{DOCKER_HOST:process.env.DOCKER_HOST},
 catalogCompare:temp+'/webbuilder-production-catalog-security-20261105.json',
 docker:(args,input)=>{
  const opts={encoding:'utf8',maxBuffer:16*1024*1024,timeout:600000};
  if(input===CATALOG_SQL){
   const wide=spawnSync('docker',args,{...opts,input:query});
   if(wide.status!==0)throw Error('Wide local catalog unavailable');
   catalog=JSON.parse(wide.stdout);
  }
  return spawnSync('docker',args,{...opts,input});
 }
});
writeFileSync(temp+'/webbuilder-local-wide-catalog-20261105.json',JSON.stringify({receipt,catalog},null,2)+'\n');
console.log(JSON.stringify({completed:receipt.completed,applied:receipt.coverage.applied,cleanup:receipt.cleanup,cronRuns:receipt.environment.cronJobRuns,searchPath:catalog?.search_path,objects:catalog?.objects?.length,failure:receipt.failure}));
process.exitCode=receipt.completed&&catalog?0:1;
