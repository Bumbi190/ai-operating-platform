/**
 * P0: Cost Intelligence är konsoliderad in i /revenue (en pengayta).
 * Routen behålls som permanent redirect så att gamla länkar/bokmärken fungerar.
 */
import { redirect } from 'next/navigation'

export default function CostsRedirect() {
  redirect('/revenue')
}
