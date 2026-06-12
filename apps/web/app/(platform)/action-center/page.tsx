/**
 * P0: denna yta är konsoliderad (action-center → /atlas).
 * Routen behålls som permanent redirect så att gamla länkar/bokmärken fungerar.
 */
import { redirect } from 'next/navigation'

export default function ConsolidatedRedirect() {
  redirect('/atlas')
}
