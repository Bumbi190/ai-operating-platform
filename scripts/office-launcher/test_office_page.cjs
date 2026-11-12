const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { parse } = require('parse5')
const root = path.resolve(__dirname, '../..')
const filename = path.join(root, 'apps/web/app/(platform)/atlas/office/page.tsx')
const { outputText, diagnostics } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  fileName: filename, reportDiagnostics: true,
})
assert.equal(diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0)
const compiled = new Module(filename, module)
compiled.filename = filename
compiled.paths = Module._nodeModulePaths(path.dirname(filename))
compiled._compile(outputText, filename)
const html = renderToStaticMarkup(React.createElement(compiled.exports.default))
const nodes = []
function walk(n) { nodes.push(n); for (const child of n.childNodes || []) walk(child) }
walk(parse(html))
const links = nodes.filter(n => n.tagName === 'a')
const href = n => n.attrs.find(a => a.name === 'href')?.value
const opening = links.filter(n => href(n) === 'omnira-office://open')
assert.equal(opening.length, 1, 'Office needs one explicit local protocol launch action')
assert(links.some(n => href(n) === 'http://127.0.0.1:4180/atlas/campus-preview'))
assert(links.some(n => href(n) === '/atlas'))
assert(!html.includes('javascript:') && !html.includes('file://'))
const preview = path.join(root, '.superpowers/office-launcher-20261112')
fs.mkdirSync(preview, { recursive: true })
fs.writeFileSync(path.join(preview, 'page-render.html'), '<!doctype html><html lang="sv"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Omnira Office – lokal granskning</title><link rel="stylesheet" href="/page.css"><body style="margin:0;background:#07111e;color:#fff;min-height:100vh">' + html + '</body></html>')
console.log('PASS: actual Office TSX renders with one native launch link, classic HQ and Atlas return.')
