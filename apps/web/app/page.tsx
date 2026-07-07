import { redirect } from 'next/navigation'

// Root redirects to Atlas — the primary entry point (middleware handles auth)
export default function RootPage() {
  redirect('/atlas')
}
