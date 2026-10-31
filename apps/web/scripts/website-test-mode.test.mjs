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
