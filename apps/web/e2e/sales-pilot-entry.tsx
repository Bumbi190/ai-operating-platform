import React from 'react'
import { ReviewQueue } from '../components/platform/vnext/ReviewQueue'
import { createRoot } from 'react-dom/client'
import { SalesWorkspace } from '../components/platform/vnext/sales/SalesWorkspace'
import { NovaReplyReviewReminder } from '../components/platform/vnext/NovaReplyReviewReminder'

const params = new URLSearchParams(location.search)
const service = params.get('project') === 'service'
const projectId = service ? '10000000-0000-4000-8000-000000000002' : '10000000-0000-4000-8000-000000000001'
const projectName = service ? 'WebBuilder' : 'Handlarbörsen'
if (params.has('nova')) createRoot(document.getElementById('root')!).render(<NovaReplyReviewReminder />)
else if (params.has('review')) fetch('/fixture-review').then(r => r.json()).then(model => createRoot(document.getElementById('root')!).render(<ReviewQueue model={model} />))
else fetch('/api/sales?projectId=' + projectId).then(r => r.json()).then(initial => createRoot(document.getElementById('root')!).render(<SalesWorkspace initial={initial} projectName={projectName} />))
