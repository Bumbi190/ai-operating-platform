import {describe,it,expect} from 'vitest'
import {parseSocialProfile} from './validate'
const good=()=>({description:'Sagor och aktiviteter för familjer.',audience:'Vuxna med små barn',tone:'Varm, lekfull och tydlig',websiteUrl:'https://example.test/aktiviteter',callToAction:'Upptäck nästa aktivitet',factualBoundaries:'Lova inte ett visst läranderesultat.',preferredMediaIds:[]})
describe('project social working context',()=>{
 it('preserves exact reviewed text and accepts optional blank fields',()=>{expect(parseSocialProfile(good())).toEqual(good());expect(parseSocialProfile({...good(),websiteUrl:null,callToAction:'',factualBoundaries:''})).toMatchObject({websiteUrl:null,callToAction:''})})
 it.each(['description','audience','tone','websiteUrl','callToAction','factualBoundaries','preferredMediaIds'])('refuses a missing %s',key=>{const v:any=good();delete v[key];expect(()=>parseSocialProfile(v)).toThrow()})
 it.each([{...good(),publish:true},{...good(),token:'secret'},null,[],{...good(),description:''},{...good(),audience:' '},{...good(),tone:'\u0007'},{...good(),websiteUrl:'http://example.test'},{...good(),websiteUrl:'https://a:b@example.test'},{...good(),websiteUrl:'javascript:alert(1)'},{...good(),preferredMediaIds:['other']},{...good(),preferredMediaIds:['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001']}])('refuses invalid profile %j',value=>expect(()=>parseSocialProfile(value)).toThrow())
 it.each([['description',1201],['audience',601],['tone',301],['callToAction',301],['factualBoundaries',1001]])('bounds %s', (field,size)=>expect(()=>parseSocialProfile({...good(),[field]:'a'.repeat(Number(size))})).toThrow())
 it('accepts at most five distinct canonical asset IDs',()=>{const ids=Array.from({length:6},(_,i)=>'10000000-0000-4000-8000-00000000000'+i);expect(parseSocialProfile({...good(),preferredMediaIds:ids.slice(0,5)}).preferredMediaIds).toHaveLength(5);expect(()=>parseSocialProfile({...good(),preferredMediaIds:ids})).toThrow()})
})
