import {describe, it} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root,rel),'utf8')
const component = read('src/compositions/FamilyNovemberTeaser.tsx')
const config = read('src/Root.tsx')
const stage = read('scripts/stage-family-november-preview.mjs')

describe('Family November teaser: offline project boundary',()=>{
  it('registers the correct 15s portrait preview, not an automatic publisher',()=>{
    assert.match(config,/id="FamiljeStundenNovemberTeaser"/)
    assert.match(config,/durationInFrames=\{450\}/)
    assert.match(component,/EJ PUBLICERAD/)
    assert.match(component,/NOVEMBER 2026/)
    assert.match(component,/#F652A0/)
    assert.doesNotMatch(component,/THE PROMPT|VICTORIA|fetch\(/i)
  })
  it('fails closed on asset paths; stages only owner content',()=>{
    assert.match(component,/FAMILY_TEASER_ASSET_NOT_APPROVED/)
    assert.match(component,/music-bed/)
    assert.doesNotMatch(component,/ElevenLabs|textToSpeech|publishTo/i)
    assert.match(stage,/SOURCE_HASH_CHANGED/)
    assert.match(stage,/COPY_HASH_MISMATCH/)
    assert.match(read('.gitignore'),/public\/content-studio-local\//)
  })
  it('verifies owner project audio and artwork fingerprints',()=>{
    for(const hash of [
      '5789a09f28ad95334d5d1a3a08af3cc3d3201468d28f66f310da860db0815a76',
      'ffd12c414aba2b71e2c39965c22e5c71f1028905eb5ed64217c054893604b31b',
      '595fc8ea398d92bc0d2c6b0664fd9447da6e645a742a2116f90339bc6de21908',
    ]) assert.ok(stage.includes(hash))
    assert.ok(stage.includes('content-studio-nova-pling-20261017'))
    assert.ok(stage.includes('publishingEnabled:false'))
  })
})
