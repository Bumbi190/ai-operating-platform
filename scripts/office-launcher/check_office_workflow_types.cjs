// Strict typecheck of the pure Office policy/HTTP graph; not a whole-app check.
const ts=require('typescript'),path=require('node:path')
const root=path.resolve(__dirname,'../..'),deps=path.dirname(path.dirname(require.resolve('typescript/package.json')))
const files=['workflow-state.ts','workflow-visits.ts','visits.ts','activity.ts'].map(f=>path.join(root,'apps/web/lib/atlas/office',f))
const program=ts.createProgram(files,{strict:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,types:['node'],typeRoots:[path.join(deps,'@types')],lib:['lib.es2022.d.ts','lib.dom.d.ts','lib.dom.iterable.d.ts']})
const diagnostics=ts.getPreEmitDiagnostics(program)
for(const d of diagnostics)console.log(ts.flattenDiagnosticMessageText(d.messageText,'\n')+(d.file?': '+d.file.fileName+':'+(d.file.getLineAndCharacterOfPosition(d.start).line+1):''))
console.log('strict_pure_office_diagnostics='+diagnostics.length)
process.exitCode=diagnostics.length?1:0
