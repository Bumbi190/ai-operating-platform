// Local syntactic verification; uses any already installed TypeScript copy.
// This is not a full Next.js build or an authenticated browser integration test.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', '..', '..');
const candidates = [
  process.env.NOVA_TYPESCRIPT_PATH,
  'C:/Users/Andre/Projects/Handlarborsen/node_modules/typescript/lib/typescript.js',
].filter(Boolean);
let ts;
for (const item of candidates) {
  try { ts = require(item); break; } catch {}
}
if (!ts) {
  console.error('SKIP: no existing TypeScript compiler available');
  process.exit(2);
}
const files = [
  ['apps/web/app/(platform)/nova-bridge/page.tsx', ts.ScriptKind.TSX],
  ['apps/web/app/api/chat/route.ts', ts.ScriptKind.TS],
  ['apps/web/lib/atlas/nova-readonly.ts', ts.ScriptKind.TS],
];
let errors = 0;
for (const [filename] of files) {
  const source = fs.readFileSync(path.join(root, filename), 'utf8');
  const result = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  });
  const failures = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  console.log(filename + ': ' + (failures.length ? 'ERROR' : 'syntax OK'));
  for (const f of failures) {
    console.error(ts.flattenDiagnosticMessageText(f.messageText, '\n'));
    errors++;
  }
}
if (errors) process.exit(1);

const helperPath = path.join(root, 'apps/web/lib/atlas/nova-readonly.ts');
const helperSource = fs.readFileSync(helperPath, 'utf8');
const transpiled = ts.transpileModule(helperSource, {
  fileName: 'nova-readonly.ts',
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const common = { exports: {} };
const check = new Function('module', 'exports', transpiled);
check(common, common.exports);
const api = common.exports;
assert.equal(api.shouldExposeAtlasTools('nova_readonly', {
  fastPath: false, staticConversation: false,
}), false, 'Nova read-only must never expose tools');
assert.equal(api.shouldExposeAtlasTools('nova_readonly', {
  fastPath: true, staticConversation: false,
}), false, 'Even content fast-path must expose no tools');
assert.equal(api.shouldExposeAtlasTools(undefined, {
  fastPath: false, staticConversation: false,
}), true, 'Ordinary Atlas must retain current tools');
assert.equal(api.shouldExposeAtlasTools(undefined, {
  fastPath: true, staticConversation: false,
}), false, 'Existing no-tools fast-path preserved');
const rendered = api.renderNovaReadOnlyMemory({
  items: [{ content: 'Befintligt projektminne' }],
  constraints: ['Prioritera säkerhet'],
});
assert.ok(rendered.includes('Befintligt projektminne'));
assert.ok(rendered.includes('Prioritera säkerhet'));
assert.equal(api.renderNovaReadOnlyMemory({ items: [], constraints: [] }), '');
const route = fs.readFileSync(path.join(root, 'apps/web/app/api/chat/route.ts'), 'utf8');
assert.ok(route.includes('shouldExposeAtlasTools(mode, { fastPath, staticConversation })'));
assert.ok(route.includes("send('error', { code: 'NOVA_READONLY_TOOL_BLOCKED' })"));
console.log('nova-readonly: tool gate and memory rendering OK');
