import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('./contracts.mjs').catch(() => ({}));
const job = {version:1,jobId:'e4c307d1-56cf-4d52-8592-c0dfbb149837',taskType:'classify',text:'En bil',labels:['bil','annat']};
test('accepts bounded Unicode and preserves input',()=> {
  assert.equal(typeof mod.validateJob,'function');
  assert.deepEqual(mod.validateJob(job),job);
  assert.equal(mod.validateJob({...job,text:'😀'.repeat(3000)}).text.length,6000);
});
for(const [name,patch] of Object.entries({unknown:{model:'remote'},version:{version:2},blank:{text:'  '},long:{text:'å'.repeat(3001)},task:{taskType:'shell'},duplicates:{labels:['bil','bil']},few:{labels:['bil']},many:{labels:['1','2','3','4','5','6','7','8','9']},emptyLabel:{labels:['bil',' ']},longLabel:{labels:['a'.repeat(65),'b']},badId:{jobId:'../../x'}})) {
  test('rejects job '+name,()=>assert.throws(()=>mod.validateJob({...job,...patch}),/INVALID_JOB/));
}
test('non-classification forbids labels',()=>assert.throws(()=>mod.validateJob({...job,taskType:'extract'}),/INVALID_JOB/));
test('extract requires all fields and forbids additional fields',()=>{
  assert.deepEqual(mod.validateResult('extract',{company:'AB',city:null,registrationNumber:null}),{company:'AB',city:null,registrationNumber:null});
  assert.throws(()=>mod.validateResult('extract',{company:null}),/INVALID_RESULT/);
  assert.throws(()=>mod.validateResult('extract',{company:'AB',city:null,registrationNumber:null,extra:1}),/INVALID_RESULT/);
});
test('classification is restricted to caller labels',()=>{
  assert.deepEqual(mod.validateResult('classify',{label:'bil'},job.labels),{label:'bil'});
  assert.throws(()=>mod.validateResult('classify',{label:'secret'},job.labels),/INVALID_RESULT/);
});
test('summary is one to three nonblank bounded bullets',()=>{
  assert.deepEqual(mod.validateResult('summarize',{bullets:['Hej']}),{bullets:['Hej']});
  for(const bullets of [[],['1','2','3','4'],[' '],['å'.repeat(301)]]) assert.throws(()=>mod.validateResult('summarize',{bullets}),/INVALID_RESULT/);
});
