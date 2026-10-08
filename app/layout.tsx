import type { Metadata } from 'next'
import Link from 'next/link'
import { Roboto } from 'next/font/google'
import { Logo } from '@/components/logo'
import { currentStaff } from '@/lib/session'
import { switchStaff } from './actions'
import { APP_TITLE, CHAIR } from '@/lib/brand'
import './globals.css'

const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-roboto' })

export const metadata: Metadata = {
  title: `${APP_TITLE} – LS Gsell`,
  description: CHAIR,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentStaff()
  return (
    <html lang="de" className={roboto.variable}>
      <body className="min-h-screen font-sans antialiased">
        <header className="bg-white border-b-4 border-lmu no-print">
          <div className="mx-auto max-w-6xl px-4 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/" className="flex items-center gap-4 min-w-0 flex-1">
              <Logo />
              <div className="min-w-0">
                <div className="text-lg sm:text-xl font-bold text-lmu-dark leading-tight">{APP_TITLE}</div>
                <div className="text-xs sm:text-sm text-neutral-600 leading-snug">{CHAIR}</div>
              </div>
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link href="/plan" className="px-3 py-2 rounded hover:bg-lmu-light text-lmu-darker font-medium">
                Plan
              </Link>
              <Link href="/uebersicht" className="px-3 py-2 rounded hover:bg-lmu-light text-lmu-darker font-medium">
                Übersicht
              </Link>
              <Link href="/einstellungen" className="px-3 py-2 rounded hover:bg-lmu-light text-lmu-darker font-medium">
                Einstellungen
              </Link>
              {me && (
                <form action={switchStaff} className="flex items-center gap-2 ml-2 pl-3 border-l border-neutral-200">
                  <span className="text-neutral-600">
                    Angemeldet als <strong className="text-lmu-darker">{me.name}</strong>
                  </span>
                  <button className="text-lmu underline underline-offset-2 hover:text-lmu-darker">wechseln</button>
                </form>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
