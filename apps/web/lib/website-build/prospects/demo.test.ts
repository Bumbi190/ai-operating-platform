import {beforeEach,describe,expect,it,vi} from 'vitest'
import JSZip from 'jszip'
import {createHash} from 'node:crypto'
const mocks=vi.hoisted(()=>({export:vi.fn(),read:vi.fn(),plan:vi.fn(),update:vi.fn(),capture:vi.fn()}))
vi.mock('../project-export',()=>({exportWebsiteProject:mocks.export}))
vi.mock('../store',async original=>({...await original<any>(),readBuildArtifact:mocks.read}))
vi.mock('./actions',()=>({prospectPlan:mocks.plan,updateProspect:mocks.update}))
vi.mock('./capture',()=>({runProspectCapture:mocks.capture}))
import {verifyProspectDemo} from './demo'

const html='<!doctype html><html><body><h1>Explicit test fixture</h1></body></html>'
const sha=createHash('sha256').update(html).digest('hex'),artifactSha='a'.repeat(64)
const current={projectId:'project',prospectId:'prospect',content:{build:{sessionId:'session',revisionId:'revision',sha256:artifactSha}}} as any
const principal={userId:'owner',allowedProjectIds:['project']}
beforeEach(async()=>{
  vi.clearAllMocks()
  const zip=new JSZip();zip.file('fixture/dist/index.html',html)
  mocks.export.mockResolvedValue(await zip.generateAsync({type:'uint8array'}))
  mocks.read.mockResolvedValue({sha256:artifactSha})
  mocks.plan.mockResolvedValue({})
  mocks.update.mockImplementation((_db,_p,current,content)=>({...current,content}))
  mocks.capture.mockResolvedValue({finalUrl:'https://fixture.vercel.app/',pages:[1440,390].map(width=>({width,htmlSha256:sha,overflow:false,imagesLoaded:true,scriptsOk:true}))})
})
describe('demo verification binds the published page to the canonical export',()=>{
  it('records a demo only after both viewports match and assets render',async()=>{
    const result=await verifyProspectDemo({} as any,principal,current,'https://fixture.vercel.app/','test')
    expect(result.content.demo?.artifactSha256).toBe(artifactSha)
    expect(result.content.demo?.mobileWidth).toBe(390)
    expect(mocks.update).toHaveBeenCalledOnce()
  })
  it.each([
    {htmlSha256:'b'.repeat(64)},
    {overflow:true},
    {imagesLoaded:false},
    {scriptsOk:false},
    {width:400},
  ])('refuses an inconsistent or broken mobile result: %j',async patch=>{
    mocks.capture.mockResolvedValue({finalUrl:'https://fixture.vercel.app/',pages:[{width:1440,htmlSha256:sha,overflow:false,imagesLoaded:true,scriptsOk:true},{width:390,htmlSha256:sha,overflow:false,imagesLoaded:true,scriptsOk:true,...patch}]})
    await expect(verifyProspectDemo({} as any,principal,current,'https://fixture.vercel.app/','test')).rejects.toThrow('DEMO_VERIFICATION_FAILED')
    expect(mocks.update).not.toHaveBeenCalled()
  })
  it('refuses redirects to another deployment',async()=>{
    mocks.capture.mockResolvedValue({finalUrl:'https://other.vercel.app/',pages:[]})
    await expect(verifyProspectDemo({} as any,principal,current,'https://fixture.vercel.app/','test')).rejects.toThrow('DEMO_VERIFICATION_FAILED')
  })
})
