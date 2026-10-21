/**
 * P25: creative schema prototypes must NEVER accidentally enter the
 * canonical Supabase migration corpus while still unreviewed/unapplied.
 * This is additive to Migration Guard v2, not a bypass of its count tripwire.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {inspectCanonicalMigrationFiles} from
 '../../apps/web/scripts/migration-guard-policy.mjs';

const cwd=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const production=join(cwd,'apps','web','supabase','migrations');
const drafts=join(cwd,'apps','web','supabase','creative-drafts');
const frozen=Object.freeze({
 '20261020230500_atlas_creative_queue_staging_p7.sql':
  '97262b90bf2e3d72ed6a6e7e99a8b451f5e42ef148a93ec319e3d2771158fb6c',
 '20261020235500_atlas_creative_worker_identity_p10.sql':
  'cd58d1fb20accd4711e71cb8e95b4fb2ed457f12c2a3c1460d78062bf432dc27',
 '20261021080000_atlas_creative_worker_enrollment_staging_p13.sql':
  '362dbc4846f1e6a9a73a974bb5313e0f5c3e371cfa8f76a1c957ce190276403c',
 '20261021100000_atlas_creative_enrollment_review_p15.sql':
  '596531d831805b5b9be78119a318a8a230f300d16c1d7546ced7661af5523547',
 '20261021120000_atlas_creative_review_owner_guard_p18.sql':
  '72f24c68c69178837d34bd651a93f900f4c1e230e3a1bfff9c132d97a205b29d',
});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
test('canonical production SQL corpus retains unchanged Guard v2 expected membership',()=>{
 const files=readdirSync(production).filter(x=>x.endsWith('.sql'));
 const result=inspectCanonicalMigrationFiles(files);
 assert.equal(result.sqlFiles.length,101);
 assert.equal(result.enforcedNames.length,87);
 for(const name of Object.keys(frozen))
  assert.equal(files.includes(name),false,'draft migration leaked into canonical Supabase corpus');
});
test('all five staged prototypes retain the exact pre-move bytes',()=>{
 assert.deepEqual(readdirSync(drafts).filter(f=>f.endsWith('.sql')).sort(),
  Object.keys(frozen).sort());
 for(const [name,expectedHash] of Object.entries(frozen)) {
  const candidate=join(drafts,name);
  const st=lstatSync(candidate);
  assert.equal(st.isFile(),true,name);
  assert.equal(st.isSymbolicLink(),false,name);
  assert.equal(digest(readFileSync(candidate)),expectedHash,name);
 }
});
test('migration tests and tools no longer load creative drafts from production path',()=>{
 const src=resolve(cwd,'scripts','creative-tools');
 let count=0;
 const visit=root=>{
  for(const d of readdirSync(root,{withFileTypes:true})){
   if(d.name==='node_modules')continue;
   const file=join(root,d.name);
   if(d.isDirectory()){visit(file);continue}
   if(!/\.(mjs|ts)$/.test(d.name))continue;
   const text=readFileSync(file,'utf8');
   if(/apps\/web\/supabase\/migrations\/202610(?:20230500|20235500|21080000|21100000|21120000)/.test(text))
    assert.fail('creative migration still read from canonical path: '+file);
   if(text.includes('creative-drafts/'))count++;
  }
 };
 visit(src);
 assert.ok(count>=10,'real PG17 and PGlite tests must keep loading quarantined SQL');
});
