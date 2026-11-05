import {test} from 'node:test'
import assert from 'node:assert/strict'
import * as target from './website-test-target.mjs'

test('runner mode is SQL by default and permits only explicit Studio mode',()=>{
 assert.equal(typeof target.resolveWebsiteTestMode,'function')
 assert.equal(target.resolveWebsiteTestMode([]),'sql')
 assert.equal(target.resolveWebsiteTestMode(['--studio']),'studio')
})
test('unknown or mixed runner arguments fail closed instead of being ignored',()=>{
 assert.equal(typeof target.resolveWebsiteTestMode,'function')
 for(const args of [['--studio','--other'],['--config','evil.js'],['--studio','--studio'],['--STUDIO'],['--sql'],['../x']])assert.throws(()=>target.resolveWebsiteTestMode(args))
})
test('focused Studio replays are accepted only as the single flag after --studio',()=>{
 assert.equal(target.resolveWebsiteTestMode(['--studio','--studio-focus-first-send']),'studio')
 assert.equal(target.resolveWebsiteTestMode(['--studio','--studio-focus-showroom']),'studio')
 for(const args of [['--studio-focus-showroom'],['--studio-focus-showroom','--studio'],['--studio','--studio-focus-showroom','--studio-focus-first-send'],['--studio','--studio-focus-showroom=1'],['--studio','--STUDIO-FOCUS-SHOWROOM'],['--studio','--studio-focus-showroom','--grep']])assert.throws(()=>target.resolveWebsiteTestMode(args))
})
test('the showroom focus grep still selects the showroom spec titles',async()=>{
 const {readFileSync}=await import('node:fs')
 const runner=readFileSync(new URL('./run-website-sql-roundtrip.mjs',import.meta.url),'utf8')
 const spec=readFileSync(new URL('../e2e/atlas-builder-showroom.spec.ts',import.meta.url),'utf8')
 const grep=runner.match(/'--studio-focus-showroom'\)\?\['--grep','([^']+)'\]/)?.[1]
 assert.equal(grep,'showroom Studio journey')
 assert.ok(spec.includes("test('"+grep),'focus grep must match a showroom test title')
})
