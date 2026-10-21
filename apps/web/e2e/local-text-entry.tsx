import React from 'react'
import {createRoot} from 'react-dom/client'
import {LocalTextJobReceipt} from '../components/platform/vnext/LocalTextJobReceipt'
import {LocalTextApprovalCard} from '../components/platform/vnext/LocalTextApprovalCard'
const id='11111111-1111-4111-8111-111111111111'
createRoot(document.getElementById('root')!).render(location.pathname==='/review'?<LocalTextApprovalCard approvalId={id} kind="local_text_review" status="pending"/>:<LocalTextJobReceipt link={{id,projectId:id,conversationId:id}}/>);
