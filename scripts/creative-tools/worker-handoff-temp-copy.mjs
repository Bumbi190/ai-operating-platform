/**
 * Disk-backed SYNTHETIC fixture transfer test, never a privileged bootstrap.
 * Confinement: direct child of OS temp dir with fixed prefix + marker;
 * only 12 approved <=64 KiB fixture files. No CLI, no ProgramData, no ACL,
 * no account operations and no real editor payload.
 */
import {readFile,writeFile,lstat,realpath,mkdtemp,mkdir,rename,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {basename,dirname,isAbsolute,join,relative,resolve,sep} from 'node:path';
import {assertReviewedHandoffManifest,verifyProposedHandoffCopy} from './worker-handoff-verify.mjs';
import {plannedEntries} from './worker-handoff-manifest.mjs';

export const SYNTHETIC_FIXTURE_MARKER='OMNIRA_CREATIVE_HANDOFF_TEST_ONLY_v1\n';
const PREFIX='omnira-creative-dryrun-';
const LIMIT=64*1024;
const sha=b=>createHash('sha256').update(b).digest('hex');
const inside=(p,root)=>{const r=relative(root,p);return r!==''&&!r.startsWith('..'+sep)&&r!=='..'&&!isAbsolute(r)};
async function mustRegular(path,type){
 const st=await lstat(path);
 if(st.isSymbolicLink()||(type==='file'&&!st.isFile())||(type==='dir'&&!st.isDirectory())){
  throw Error('synthetic_reparse_or_type_rejected');
 }
 return st;
}
async function missing(path){
 try{await lstat(path);return false}catch(e){if(e.code==='ENOENT')return true;throw e}
}
async function assertFixtureRoot(root){
 if(typeof root!=='string'||!isAbsolute(root))throw Error('synthetic_absolute_temp_root_required');
 const temp=await realpath(tmpdir());
 const actual=await realpath(root);
 if(!basename(actual).startsWith(PREFIX)||dirname(actual).toLowerCase()!==temp.toLowerCase()){
  throw Error('outside_synthetic_temp_fixture');
 }
 await mustRegular(actual,'dir');
 const marker=join(actual,'.synthetic-test-only');
 await mustRegular(marker,'file');
 if((await readFile(marker,'utf8'))!==SYNTHETIC_FIXTURE_MARKER)throw Error('missing_fixture_marker');
 return actual;
}
async function fixtureFile(root,rel){
 if(typeof rel!=='string'||!rel||rel.includes('\\')||rel.includes(':')||
  rel.split('/').some(x=>!x||x==='.'||x==='..'))throw Error('synthetic_invalid_relative_path');
 let current=root;
 const parts=rel.split('/');
 for(let i=0;i<parts.length;i++){
  current=join(current,parts[i]);
  await mustRegular(current,i===parts.length-1?'file':'dir');
 }
 if(!inside(current,root))throw Error('synthetic_path_escape');
 return current;
}
function expectedPlan(manifest,lock){
 const plan=plannedEntries(lock);
 if(plan.length!==12||manifest.entries.length!==12)throw Error('synthetic_unexpected_plan');
 for(const row of manifest.entries){
  const match=plan.find(p=>p.destination===row.destination);
  if(!match||row.sourceRole!==match.sourceRoot||row.sourceRelative!==match.sourceRelative||
   row.releasePinned!==(match.expectedSha256!==null)||
   (match.expectedSha256!==null&&row.sha256!==match.expectedSha256)){
   throw Error('synthetic_scope_mismatch');
  }
 }
 return plan;
}
async function readPinnedFixture(file,row){
 const st=await mustRegular(file,'file');
 if(st.size<1||st.size>LIMIT||st.size!==row.bytes)throw Error('synthetic_file_size_rejected');
 // Small bounded fixtures only; never copy a real release ZIP or executable.
 const data=await readFile(file);
 const after=await mustRegular(file,'file');
 if(after.size!==st.size||after.mtimeMs!==st.mtimeMs||sha(data)!==row.sha256){
  throw Error('synthetic_source_modified_or_unpinned');
 }
 return data;
}
/**
 * This function genuinely writes only tiny test fixtures UNDER OS TEMP.
 * Its result NEVER grants authority for real Windows ProgramData copying.
 */
export async function testSyntheticCopyOnDisk({
 fixtureRoot,manifest,reviewedManifestSha256,afterPreflight,afterStage,
}){
 assertReviewedHandoffManifest(manifest,reviewedManifestSha256);
 const root=await assertFixtureRoot(fixtureRoot);
 if(afterPreflight!==undefined&&typeof afterPreflight!=='function')throw Error('invalid_fixture_test_hook');
 if(afterStage!==undefined&&typeof afterStage!=='function')throw Error('invalid_fixture_test_hook');
 const src=join(root,'src'),target=join(root,'candidate');
 await mustRegular(src,'dir');
 if(!await missing(target))throw Error('synthetic_target_already_exists');
 const lockFile=await fixtureFile(src,'control/artcraft-lock.json');
 const lock=JSON.parse((await readFile(lockFile)).toString('utf8'));
 expectedPlan(manifest,lock);
 const sourceRows=[];
 let total=0;
 for(const row of manifest.entries){
  const source=await fixtureFile(src,row.sourceRole+'/'+row.sourceRelative);
  const data=await readPinnedFixture(source,row);
  total+=data.length;
  if(total>512*1024)throw Error('synthetic_total_budget_exceeded');
  sourceRows.push({row,source});
 }
 await afterPreflight?.({root,src,target});
 if(!await missing(target))throw Error('synthetic_target_race');
 // All destination work stays inside the per-test temporary fixture.
 const stage=await mkdtemp(join(root,'.candidate-stage-'));
 try{
  for(const {row,source} of sourceRows){
   const data=await readPinnedFixture(source,row);
   const dest=join(stage,...row.destination.split('/'));
   if(!inside(dest,stage))throw Error('synthetic_destination_escape');
   await mkdir(dirname(dest),{recursive:true});
   await writeFile(dest,data,{flag:'wx'});
  }
  await afterStage?.({root,src,target,stage});
  await verifyProposedHandoffCopy({root:stage,manifest,reviewedManifestSha256});
  if(!await missing(target))throw Error('synthetic_target_race');
  await rename(stage,target);
  return Object.freeze({
   schema:'omnira.creative.temp_fixture_copy_v1',
   status:'synthetic_temp_copy_verified_no_authority',
   syntheticFilesCopied:12,productionFilesCopied:0,syntheticBytes:total,
   rootClass:'operating_system_temp_fixture',
   aclVerified:false,reviewerApproved:false,signerVerified:false,
   executionEnabled:false,productionReady:false,
  });
 }finally{
  // When staging is rejected it is removed. Never delete a promoted target:
  // real deployment rollback and durability remain explicitly out of scope.
  if(!await missing(stage))await rm(stage,{recursive:true,force:true});
 }
}
