import React from 'react'
import {createRoot} from 'react-dom/client'
import {CompanyDirectory} from '../components/platform/vnext/sales/CompanyDirectory'
fetch('/fixture-companies').then(r=>r.json()).then(initial=>createRoot(document.getElementById('root')!).render(<CompanyDirectory initial={initial} />))
