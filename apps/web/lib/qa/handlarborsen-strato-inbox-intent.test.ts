import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {isHandlarborsenInboxReadIntent as match} from '@/lib/handlarborsen/distribution/strato-inbox-intent'

describe('Explicit Atlas Strato inbox READ request routing',()=>{
 it.each([
  'Visa de senaste mejlen i Handlarbörsens Strato-inkorg. Läs bara mejltexter jag godkänt. Skicka ingenting.',
  'Sammanfatta senaste mejlen i Strato-inkorgen',
  'Kan du läsa Handlarbörsens e-post och kolla om något är nytt?',
  'Hur många svar finns i Handlarbörsens inkorg?',
  'Show me recent email in the Strato inbox',
  'Read Strato mail messages from today',
  'Har det kommit nya mejl till Handlarbörsen?',
  'Summarize the Handlarborsen inbox messages',
 ])('recognises live read and preserves tool path: %s',input=>{
  expect(match(input)).toBe(true)
 })
 it.each([
  'Skriv ett mejl till Strato',
  'Skicka mejlen från Handlarbörsen',
  'Radera de gamla mejlen i Strato-inkorgen',
  'Skapa en LinkedIn-post för Handlarbörsen',
  'Publicera dagens Instagram-inlägg för Familje-Stunden',
  'Sammanfatta PDF:en jag skickade tidigare',
  'Visa Handlarbörsens startsida',
  'Öppna Handlarbörsens sociala medier',
  'Vad är Strato?',
  'Hej',
  '',
  'Summarize my unread Gmail',
 ])('never forces a read for unrelated/write-only request: %s',input=>{
  expect(match(input)).toBe(false)
 })
 it('does not overmatch a long or non-text instruction',()=>{
  expect(match('Strato inkorg '.repeat(140))).toBe(false)
  expect(match({text:'Läs Handlarbörsens inkorg'})).toBe(false)
  expect(match(null)).toBe(false)
 })
 it('wires real inbox requests ahead of fast path and navigation',()=>{
  const source=readFileSync(resolve(__dirname,'../../app/api/chat/route.ts'),'utf8')
  expect(source).toContain('const stratoInboxReadIntent = !studioContext && hbStratoInboxReadEnabled() && isHandlarborsenInboxReadIntent(lastUserText)')
  expect(source).toContain('const fastPath = !stratoInboxReadIntent &&')
  expect(source).toContain('const navIntent = !stratoInboxReadIntent &&')
  expect(source).toContain('const forceStratoReadFirstTurn = stratoInboxReadIntent && activeTools.some')
  expect(source).toContain("tool_choice: { type: 'tool' as const, name: HB_STRATO_INBOX_TOOL_NAMES[0] }")
  expect(source).toContain('...(hbStratoInboxReadEnabled()?HB_STRATO_INBOX_TOOLS:[])')
  // LinkedIn/Strato sales-specific instructions should not inflate the
  // short website-studio system prompt.
  expect(source).toContain('studioSystemPrompt(studioContext)+SOCIAL_LAUNCH_GUIDE+SOCIAL_CONTENT_GUIDE')
  expect(source).toContain('SOCIAL_CONTENT_GUIDE + HB_DISTRIBUTION_GUIDE + WEEKLY_MARKETING_GUIDE')
 })
})
