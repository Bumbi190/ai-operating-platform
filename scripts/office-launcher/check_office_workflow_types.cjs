// Strict check of Office policy, HTTP, browser controller and connect panel; not the whole app.
const ts=require('typescript'),path=require('node:path')
const root=path.resolve(__dirname,'../..'),deps=path.dirname(path.dirname(require.resolve('typescript/package.json')))
const files=['workflow-state.ts','workflow-visits.ts','visits.ts','activity.ts','visit-connection.ts','connection.ts'].map(f=>path.join(root,'apps/web/lib/atlas/office',f))
files.push(path.join(root,'apps/web/app/(office-private)/atlas/office/connect/OfficeConnectionPanel.tsx'))
const program=ts.createProgram(files,{strict:true,noEmit:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,jsx:ts.JsxEmit.ReactJSX,baseUrl:path.join(root,'apps/web'),paths:{'@/*':[path.join(root,'apps/web/*')],'react':[path.join(deps,'@types/react/index.d.ts')],'react/jsx-runtime':[path.join(deps,'@types/react/jsx-runtime.d.ts')]},types:['node','react'],typeRoots:[path.join(deps,'@types')],lib:['lib.es2022.d.ts','lib.dom.d.ts','lib.dom.iterable.d.ts']})
const diagnostics=ts.getPreEmitDiagnostics(program)
for(const d of diagnostics)console.log(ts.flattenDiagnosticMessageText(d.messageText,'\n')+(d.file?': '+d.file.fileName+':'+(d.file.getLineAndCharacterOfPosition(d.start).line+1):''))
console.log('strict_office_diagnostics='+diagnostics.length)
process.exitCode=diagnostics.length?1:0
