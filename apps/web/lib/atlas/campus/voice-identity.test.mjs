import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {
  PLING_APPROVED_VOICE,
  NOVA_APPROVED_REFERENCE,
  EXISTING_ATLAS_RUNTIME,
  VOICE_IDENTITY_SOURCE,
  approvedCharacterVoice,
  characterVoiceReadiness,
} from './voice-identity.ts'

const source = readFileSync(new URL('./voice-identity.ts',import.meta.url),'utf8')
const atlasTts = readFileSync(new URL('../../../app/api/chat/tts/route.ts',import.meta.url),'utf8')

test('Pling Alternative B is pinned exactly to previously approved ElevenLabs identity and full effect chain',()=>{
  assert.equal(VOICE_IDENTITY_SOURCE,'OMNIRA_AGENT_OFFICE_PINNED_CHARACTER_V035')
  assert.equal(PLING_APPROVED_VOICE.label,'Pling · Alternativ B')
  assert.equal(PLING_APPROVED_VOICE.voiceId,'vhPZICLLz0UIRNLnUe0u')
  assert.equal(PLING_APPROVED_VOICE.model,'eleven_v4')
  assert.equal(PLING_APPROVED_VOICE.provider,'elevenlabs')
  assert.match(PLING_APPROVED_VOICE.processing,/rubberband=tempo=1:pitch=1\.122462048/)
  assert.match(PLING_APPROVED_VOICE.processing,/highshelf=f=3000:g=1/)
  assert.match(PLING_APPROVED_VOICE.processing,/alimiter=limit=0\.92/)
  assert.match(PLING_APPROVED_VOICE.evidence,/CALENDAR_INSTRUCTIONS_V3_AUDIO\.json/)
  assert.equal(PLING_APPROVED_VOICE.fullRecipeRequired,true)
  assert.equal(PLING_APPROVED_VOICE.synthesisConnected,false)
  assert(Object.isFrozen(PLING_APPROVED_VOICE))
})
test('EVERY Pling in any project and both patrol routes gets the same speaker object, never a default or per-project variant',()=>{
  const scenarios=[
    'familje-stunden','the-prompt','handlarborsen','trading','omnira-core',
    'central-lounge','upper-gallery','lower-hall',
  ]
  for(const location of scenarios){
    assert.equal(approvedCharacterVoice('pling',location),PLING_APPROVED_VOICE)
    const state=characterVoiceReadiness('pling',location)
    assert.equal(state.identity,'pling')
    assert.equal(state.profileApproved,true)
    assert.equal(state.speechReady,false)
    assert.equal(state.agentConversationReady,false)
    assert.equal(state.fallbackAllowed,false)
  }
})
test('Nova retains her prior approved reference, no made-up live ElevenLabs voice ID',()=>{
  assert.equal(NOVA_APPROVED_REFERENCE.referenceName,'nova_final.wav')
  assert.equal(NOVA_APPROVED_REFERENCE.originatingVoiceId,null)
  assert.equal(NOVA_APPROVED_REFERENCE.synthesisConnected,false)
  assert.equal(approvedCharacterVoice('nova'),NOVA_APPROVED_REFERENCE)
  assert.notEqual(approvedCharacterVoice('nova'),approvedCharacterVoice('pling'))
  const state=characterVoiceReadiness('nova')
  assert.equal(state.speechReady,false)
  assert.equal(state.fallbackAllowed,false)
  assert.match(state.reason,/live-TTS-identitet är inte verifierad/)
})
test('Atlas OpenAI onyx path is unchanged, does not overwrite Nova approved WAV or Pling voice',()=>{
  assert.equal(EXISTING_ATLAS_RUNTIME.model,'tts-1')
  assert.equal(EXISTING_ATLAS_RUNTIME.voice,'onyx')
  assert.equal(EXISTING_ATLAS_RUNTIME.chatRoute,'/chat')
  assert.equal(EXISTING_ATLAS_RUNTIME.voiceRoute,'/atlas')
  assert.equal(EXISTING_ATLAS_RUNTIME.mustRemainUnchanged,true)
  assert.match(atlasTts,/const ATLAS_TTS_MODEL = 'tts-1'/)
  assert.match(atlasTts,/voice = 'onyx'/)
  assert.doesNotMatch(atlasTts,/vhPZICLLz0UIRNLnUe0u|nova_final\.wav/)
})
test('cannot synthesize speech or fall back silently from any profile without authenticated, approved cost-governed implementation',()=>{
  assert.throws(()=>approvedCharacterVoice('other'),TypeError)
  assert.throws(()=>approvedCharacterVoice('victoria'),TypeError)
  assert.doesNotMatch(source,/fetch\(|openAISpeech\(|generateVoiceover\(|withGovernedSpend\(|xi-api-key|ELEVENLABS_API_KEY/)
  assert.doesNotMatch(source,/service_role|apiKey:|POST|window\.|localStorage/)
  assert(!PLING_APPROVED_VOICE.perAgentSessionConnected)
  assert(!NOVA_APPROVED_REFERENCE.perAgentSessionConnected)
})
