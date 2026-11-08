import {describe,it,expect} from 'vitest'
import {isCalendarIntent} from '@/lib/calendar/atlas-tools'
describe('calendar intent ordered week questions',()=>{
 it.each([
  ['Vad har jag nästa vecka?',true],
  ['VAD\nhar JAG\npå MÅNDAG?',true],
  ['vad vad jag jag på söndag',true],
  ['vadjagvecka',true],
  ['Vad gör jag på ſöndag?',true],
  ['Boka ett möte',true],
  ['Avboka mötet',true],
  ['Min kalendern',true],
  ['jag nästa vecka vad',false],
  ['vad nästa vecka jag',false],
  ['Vad har jag?',false],
  ['vad vad utan subjekt och vecka',false],
  ['förboka och omflytta',false],
  ['abcmeetingdef',false],
  ['',false],
 ] as const)('%s → %s',(text,want)=>expect(isCalendarIntent(text)).toBe(want))
})
