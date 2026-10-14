import { describe, expect, it } from 'vitest'
import { compileStaticBrief, hashPlanContent, validatePlanContent } from './validation'
const draft = () => ({ title:'Bokning', purpose:'Boka en aktivitet', audience:'Familjer', pages:[{key:'index',title:'Start',purpose:'Välj aktivitet'}], design:{style:'Mörk blå, som referensen',reference:null}, features:[{name:'Bokningsformulär',mode:'live_required',provider:'supabase'}], architecture:'HTML/CSS preview; databas behövs för riktig bokning', steps:['Bygg start','Testa mobil'], domain:{registrar:'strato',requestedName:'exempel.se'} })
describe('website plan contract', () => {
 it('preserves a valid architecture and domain',()=>expect(validatePlanContent(draft())).toEqual(draft()))
 it('hashes semantically equal content deterministically',()=>{const p=validatePlanContent(draft()); expect(hashPlanContent(p)).toMatch(/^[a-f0-9]{64}$/); expect(hashPlanContent(validatePlanContent({...draft(),title:'Bokning'}))).toBe(hashPlanContent(p))})
 it.each(['design','domain'])('binds changed %s to a new revision',field=>{const a=draft(),b=draft(); if(field==='design')b.design.style='Vit';else b.domain.requestedName='annat.se'; expect(hashPlanContent(validatePlanContent(a))).not.toBe(hashPlanContent(validatePlanContent(b)))})
 it('compiles every page and unmet integration as a demo',()=>{const s=compileStaticBrief(validatePlanContent(draft())); expect(s).toContain('Välj aktivitet');expect(s).toContain('Bokningsformulär');expect(s).toContain('DEMO');expect(s).toContain('supabase');expect(s).toContain('exempel.se')})
 it('rejects more than eight pages',()=>expect(()=>validatePlanContent({...draft(),pages:Array.from({length:9},(_,i)=>({key:'p'+i,title:'Sida',purpose:'Visa'}))})).toThrow('INVALID_PLAN'))
 it('rejects unknown authority fields',()=>expect(()=>validatePlanContent({...draft(),approve:true})).toThrow('INVALID_PLAN'))
 it('rejects mixed invalid feature modes',()=>expect(()=>validatePlanContent({...draft(),features:[{name:'Boka',mode:'connected',provider:'supabase'}]})).toThrow('INVALID_PLAN'))
 it('rejects a key pasted into plan content',()=>expect(()=>validatePlanContent({...draft(),architecture:'sb_secret_1234567890abcdefghijklmnop'})).toThrow('PLAN_CONTAINS_SECRET'))
 it('rejects oversized UTF-8 content before storing',()=>expect(()=>validatePlanContent({...draft(),purpose:'å'.repeat(17000)})).toThrow('PLAN_TOO_LARGE'))
 it('rejects a brief that cannot fit the existing worker limit',()=>expect(()=>validatePlanContent({...draft(),purpose:'a'.repeat(7900),audience:'b'.repeat(1000)})).toThrow('PLAN_TOO_LARGE'))
 it('rejects duplicate page keys',()=>expect(()=>validatePlanContent({...draft(),pages:[draft().pages[0],draft().pages[0]]})).toThrow('INVALID_PLAN'))
 it('rejects URL-shaped domain input and other registrars',()=>{expect(()=>validatePlanContent({...draft(),domain:{registrar:'strato',requestedName:'https://a.se/x'}})).toThrow('INVALID_PLAN');expect(()=>validatePlanContent({...draft(),domain:{registrar:'vercel',requestedName:null}})).toThrow('INVALID_PLAN')})
})
