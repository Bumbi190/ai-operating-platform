import React from 'react'
import { createRoot } from 'react-dom/client'
import { AtlasRuntimeProvider } from '../lib/atlas/runtime'
import { AtlasHomeVNext } from '../components/platform/vnext/AtlasHomeVNext'
import { AtlasVoiceHome } from '../app/(platform)/atlas/AtlasVoiceHome'
const projects = [{ id: 'project-a', name: 'Testprojekt', slug: 'test-project', color: '#69c', href: '/projects/test-project', runningRuns: 0, pendingApprovals: 0 }]
const model = { projects, activity: [], generatedAt: new Date().toISOString(), totals: { projects: 1, runningRuns: 0, pendingApprovals: 0, failedRuns24h: 0 }, availability: { projects: true, runs: true, approvals: true } }
const params = new URL(location.href).searchParams
createRoot(document.getElementById('root')!).render(<AtlasRuntimeProvider projects={projects}>{params.get('ui') === 'legacy' ? <AtlasVoiceHome operatorName="Testoperatör" /> : <AtlasHomeVNext model={model} collaboratorReadOnly={params.get('role') === 'collaborator'} />}</AtlasRuntimeProvider>)
