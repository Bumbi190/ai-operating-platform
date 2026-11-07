/* Read-only TypeScript contract QA, no build secrets or database access. */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const repo=path.resolve(__dirname,'..','..','..','..');
const ts=require(require.resolve('typescript',{
  paths:['C:/Users/Andre/Projects/Handlarborsen']
}));
const files=[
  'apps/web/app/(platform)/nova-actions/marketing/page.tsx',
  'apps/web/app/(platform)/nova-actions/marketing/CampaignLaunch.tsx',
  'apps/web/app/api/marketing/plans/generate/route.ts',
];
const contents={};
for(const name of files){
  const source=fs.readFileSync(path.join(repo,name),'utf8');
  contents[name]=source;
  const js=ts.transpileModule(source,{
    fileName:name,
    reportDiagnostics:true,
    compilerOptions:{jsx:ts.JsxEmit.Preserve,module:ts.ModuleKind.ESNext,
      target:ts.ScriptTarget.ES2022},
  });
  assert.equal((js.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,
    0,name);
}
const page=contents[files[0]],client=contents[files[1]],api=contents[files[2]];
assert.ok(page.includes('supabase.auth.getUser()'));
assert.ok(page.includes("if (!user) redirect('/login')"));
assert.ok(client.includes("stage !== 'review'"));
assert.ok(client.includes("'/api/marketing/plans/generate'"));
assert.ok(client.includes("check.status !== 404"));
assert.ok(client.includes("response.status !== 202"));
assert.ok(!client.includes('/api/marketing/approvals'));
assert.ok(!client.includes('/api/social/publish'));
assert.ok(api.includes('resolveProjectAccess()'));
assert.ok(api.includes('assertProjectAllowed(projectId, access.allowedProjectIds)'));
assert.ok(api.includes("kind: 'marketing_campaign_planner'"));
assert.ok(api.includes("status: 'pending'"));
console.log('PASS protected marketing page + existing project-scoped API contract; no publish');
