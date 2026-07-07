/**
 * P0: denna yta är konsoliderad (atlas/activity → /agent-activity).
 * Routen behålls som permanent redirect så att gamla länkar/bokmärken fungerar.
 */
import { redirect } from 'next/navigation'

export default function ConsolidatedRedirect() {
  redirect('/agent-activity')
}
