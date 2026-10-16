import {describe,it,expect,vi,afterEach} from 'vitest'
import {parseSocialContent,stockholmToUtc} from './validate'
const payload=()=>({channel:'facebook',format:'text',title:'Helg med familjen',text:'Tre enkla aktiviteter tillsammans.',linkUrl:null,mediaIds:[],mediaBrief:'',scheduledAt:null})
afterEach(()=>vi.useRealTimers())
describe('social content input',()=>{
 it('accepts prepared text without an account or paid generation',()=>{expect(parseSocialContent(payload())).toEqual(payload())})
 it.each([{publish:true},{approved:true},{sha256:'a'.repeat(64)},{bindingId:'x'},{mediaUrls:['https://example.org/a.png']},{token:'secret'}])('rejects model supplied authority or unmanaged media %j',extra=>{expect(()=>parseSocialContent({...payload(),...extra})).toThrow('INVALID_BODY')})
 it.each(['javascript:alert(1)','http://example.org','https://name:password@example.org','file:///tmp/a'])('rejects unsafe link %s',linkUrl=>{expect(()=>parseSocialContent({...payload(),format:'link',linkUrl})).toThrow('INVALID_BODY')})
 it('requires a link for link format and rejects duplicate or malformed media IDs',()=>{expect(()=>parseSocialContent({...payload(),format:'link'})).toThrow();expect(()=>parseSocialContent({...payload(),mediaIds:['not-id']})).toThrow();const id='10000000-0000-4000-8000-000000000001';expect(()=>parseSocialContent({...payload(),mediaIds:[id,id]})).toThrow()})
 it('keeps a missing image as an explicit media brief instead of inventing a URL',()=>{expect(parseSocialContent({...payload(),channel:'pinterest',format:'image',mediaBrief:'Barn skapar en raket'}).mediaIds).toEqual([])})
 it.each([{channel:'tiktok'},{channel:'youtube',format:'text'},{channel:'instagram',format:'link'},{text:' '},{text:'a'.repeat(5001)},{title:'a'.repeat(151)},{mediaBrief:'a'.repeat(1001)}])('rejects unsupported or overlong content %j',extra=>{expect(()=>parseSocialContent({...payload(),...extra})).toThrow('INVALID_BODY')})
 it('requires an explicit UTC instant in the future within 366 days',()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-16T10:00:00Z'));for(const scheduledAt of ['2026-10-16T09:59:00.000Z','2027-11-17T10:00:00.000Z','2026-10-17T12:00','bad'])expect(()=>parseSocialContent({...payload(),scheduledAt})).toThrow();expect(parseSocialContent({...payload(),scheduledAt:'2026-10-17T10:00:00.000Z'}).scheduledAt).toBe('2026-10-17T10:00:00.000Z')})
})
describe('Stockholm calendar input',()=>{
 it.each([['2026-10-17T12:30','2026-10-17T10:30:00.000Z'],['2026-12-17T12:30','2026-12-17T11:30:00.000Z']])('converts %s to %s independently of browser timezone',(local,want)=>{expect(stockholmToUtc(local)).toBe(want)})
 it.each(['2026-03-29T02:30','2026-10-25T02:30','2026-02-30T12:00','2026-17-01T12:00','tomorrow'])('refuses impossible or ambiguous local time %s',local=>{expect(()=>stockholmToUtc(local)).toThrow('INVALID_TIME')})
})
