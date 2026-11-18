import 'server-only'
import { officeVisitOwner, officeVisitRpc } from './visit-server'
import { createWorkflowVisitHandlers } from './workflow-visits'

export const officeWorkflowHandlers = createWorkflowVisitHandlers({
  enabled: () => process.env.OMNIRA_OFFICE_WORKFLOW_STATUS_ENABLED === 'true',
  owner: officeVisitOwner,
  rpc: officeVisitRpc,
})
