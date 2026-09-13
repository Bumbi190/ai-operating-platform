import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Omnira — AI Operating System',
  description: 'The operating system behind autonomous AI companies. Mission control for intelligence infrastructure.',
  icons: {
    icon: '/omnira-favicon.svg',
    shortcut: '/omnira-favicon.svg',
    apple: '/omnira-favicon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // The font variables live on <html>: Tailwind's preflight sets
    // `font-family: var(--font-geist-sans), …` on html, and a variable declared
    // only on <body> is undefined there — the declaration was invalid, the UA
    // serif won, and every surface without its own font inherited it.
    <html lang="sv" className={`dark ${inter.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
