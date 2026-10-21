import {describe,expect,it} from 'vitest'
import {familyNovemberSuggestions,FAMILY_NOVEMBER_PROJECT,FAMILY_NOVEMBER_PLAN_REVISION} from './family-november-suggestions'
import {parseSocialContent} from './validate'
const valid={
 projectId:FAMILY_NOVEMBER_PROJECT,projectSlug:'familje-stunden',projectName:'Familje-Stunden',
 planApproved:true,planRevisionId:FAMILY_NOVEMBER_PLAN_REVISION,
 plannedChannels:[
  {channel:'facebook' as const,format:'text' as const,cadence:'manual' as const,purpose:'Vardagstips'},
  {channel:'instagram' as const,format:'image' as const,cadence:'manual' as const,purpose:'Bilder'}
 ]
}
describe('Familje-Stunden November – local preset for existing social review',()=>{
 it('produces strict unscheduled text/image drafts only for exactly approved owner plan',()=>{
  const choices=familyNovemberSuggestions(valid)
  expect(choices.map(s=>[s.id,s.draft.channel,s.draft.format])).toEqual([
   ['facebook','facebook','text'],['instagram','instagram','image']])
  for(const choice of choices){
   expect(parseSocialContent(choice.draft)).toEqual(choice.draft)
   expect(choice.draft.mediaIds).toEqual([])
   expect(choice.draft.scheduledAt).toBeNull()
   expect(choice.draft.linkUrl).toBeNull()
   expect(choice.draft.text).toContain('Nova och Pling')
   expect(choice.draft.title.length).toBeLessThanOrEqual(150)
   expect(Object.keys(choice.draft).sort()).toEqual(
    ['channel','format','title','text','linkUrl','mediaIds','mediaBrief','scheduledAt'].sort())
  }
  expect(choices[1].draft.mediaBrief).toContain('registreras')
 })
 it.each([
  {projectId:'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'},
  {projectSlug:'the-prompt'},
  {projectName:'Handlarbörsen'},
  {planApproved:false},
  {planRevisionId:'30000000-0000-4000-8000-000000000001'},
  {plannedChannels:[{channel:'instagram' as const,format:'video' as const,cadence:'manual' as const,purpose:'Bild'}]},
  {plannedChannels:[{channel:'facebook' as const,format:'text' as const,cadence:'daily' as const,purpose:'Text'},
   valid.plannedChannels[1]]},
  {plannedChannels:[valid.plannedChannels[0],valid.plannedChannels[0]]},
  {plannedChannels:[valid.plannedChannels[0],valid.plannedChannels[1],{
   channel:'youtube' as const,format:'video' as const,cadence:'manual' as const,purpose:'News'}]}
 ])('fails closed on changed tenant or plan %#',change=>{
  expect(familyNovemberSuggestions({...valid,...change})).toEqual([])
 })
})
