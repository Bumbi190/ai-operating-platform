import React from 'react'
import {ReviewQueue} from '../components/platform/vnext/ReviewQueue'
import {createRoot} from 'react-dom/client'
import {SalesWorkspace} from '../components/platform/vnext/sales/SalesWorkspace'
import {NovaReplyReviewReminder} from '../components/platform/vnext/NovaReplyReviewReminder'
if(new URLSearchParams(location.search).has('nova'))createRoot(document.getElementById('root')!).render(<NovaReplyReviewReminder/>)
else if(new URLSearchParams(location.search).has('review'))fetch('/fixture-review').then(r=>r.json()).then(model=>createRoot(document.getElementById('root')!).render(<ReviewQueue model={model}/>))
else fetch('/api/sales?projectId=10000000-0000-4000-8000-000000000001').then(r=>r.json()).then(initial=>createRoot(document.getElementById('root')!).render(<SalesWorkspace initial={initial} projectName="Handlarbörsen"/>))
