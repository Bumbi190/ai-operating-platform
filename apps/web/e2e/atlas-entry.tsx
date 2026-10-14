import React from 'react'
import { createRoot } from 'react-dom/client'
import { AtlasRuntimeProvider } from '../lib/atlas/runtime'
import { AtlasHomeVNext } from '../components/platform/vnext/AtlasHomeVNext'
import { AtlasVoiceHome } from '../app/(platform)/atlas/AtlasVoiceHome'
import {ProjectWebsiteBuilderSettings} from '../components/platform/vnext/ProjectWebsiteBuilderSettings'
const projects = [{ id: 'project-a', name: 'Testprojekt', slug: 'test-project', color: '#69c', href: '/projects/test-project', runningRuns: 0, pendingApprovals: 0 }]
const model = { projects, activity: [], generatedAt: new Date().toISOString(), totals: { projects: 1, runningRuns: 0, pendingApprovals: 0, failedRuns24h: 0 }, availability: { projects: true, runs: true, approvals: true } }
const params = new URL(location.href).searchParams
const settingsModel={root:null,rootReadable:true,projectsReadable:!params.has('unreadable-projects'),projects:[{id:'10000000-0000-4000-8000-000000000001',name:'Testprojekt',agents:[{id:'40000000-0000-4000-8000-000000000001',name:'News Hunter'},{id:'40000000-0000-4000-8000-000000000002',name:'Webbbyggare'}],setting:{projectId:'10000000-0000-4000-8000-000000000001',builderAgentId:null,domainRegistrar:'strato' as const,location:null},readable:!params.has('unreadable')}]}
createRoot(document.getElementById('root')!).render(params.has('settings')?<ProjectWebsiteBuilderSettings model={settingsModel}/>:<AtlasRuntimeProvider projects={projects}>{params.get('ui') === 'legacy' ? <AtlasVoiceHome operatorName="Testoperatör" /> : <AtlasHomeVNext model={model} collaboratorReadOnly={params.get('role') === 'collaborator'} />}</AtlasRuntimeProvider>)