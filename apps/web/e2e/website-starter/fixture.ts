// Actual plan/compiler/media pipeline with authored model replies. No Auth or paid inference.
import {validatePlanContent} from '../../lib/website-build/planning/validation'
import {createWebsiteMockups} from '../../lib/website-build/planning/mockups'
import {compileWebsiteArtifact,makePreviewDocument} from '../../lib/website-build/artifact'
import {websiteUserMessage} from '../../lib/website-build/prompt'
import {resolveWebsiteModelRasters} from '../../lib/website-build/model-rasters'
import type {BuildSnapshot} from '../../lib/website-build/types'
export const plan=validatePlanContent({title:'Handlarbörsen',purpose:'Fiktiv bilhandlardemo',audience:'Bilhandlare',pages:[{key:'home',title:'Hem',purpose:'Showroom och exempelbilar'}],design:{style:'Mörk premium',reference:null,starter:'premium-dealer-demo-v1'},features:[],architecture:'Statisk demonstration',steps:['Granska','Bygg'],domain:{registrar:'strato',requestedName:null}})
const choice=createWebsiteMockups(plan)[1]
const snapshot:BuildSnapshot={writer:{projectId:'fixture',sessionId:'fixture',runId:'fixture',claimId:'fixture',generation:1},brief:'Bevara godkänd showroomdesign och bilder.',agentId:'fixture',previousArtifact:null,feedback:[],candidate:null,interpretation:null,controlRequested:null,designReference:{mockupId:'fixture',sha256:choice.sha256,canonicalDraft:choice.canonicalDraft,approvedPages:plan.pages}}
const firstMessage=websiteUserMessage(snapshot,null)
const initial=JSON.parse(firstMessage).designReference.draft
export const original=compileWebsiteArtifact(resolveWebsiteModelRasters(initial,snapshot))
const nextSnapshot={...snapshot,previousArtifact:original}
const nextMessage=websiteUserMessage(nextSnapshot,null)
const revised={...initial,css:initial.css.replaceAll('#efb563','#71d7ba')}
export const edited=compileWebsiteArtifact(resolveWebsiteModelRasters(revised,nextSnapshot))
export const isolated=makePreviewDocument(original,'index','starter-fixture')
export const metrics={scope:'Actual template/plan/compiler/resolver; model output and identity are fixtures',mockupBytes:Buffer.byteLength(choice.canonicalDraft),modelInputBytes:Buffer.byteLength(firstMessage),editInputBytes:Buffer.byteLength(nextMessage),renderedHtmlBytes:Buffer.byteLength(original.pages[0].html),assets:JSON.parse(firstMessage).assets.length,hasRawBase64InModelInput:firstMessage.includes('base64,')||nextMessage.includes('base64,'),originalSha256:original.sha256,editedSha256:edited.sha256}
