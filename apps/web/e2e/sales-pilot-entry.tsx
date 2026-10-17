import React from 'react'
import {createRoot} from 'react-dom/client'
import {SalesWorkspace} from '../components/platform/vnext/sales/SalesWorkspace'
fetch('/api/sales?projectId=10000000-0000-4000-8000-000000000001').then(r=>r.json()).then(initial=>createRoot(document.getElementById('root')!).render(<SalesWorkspace initial={initial} projectName="Handlarbörsen"/>))
