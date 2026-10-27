import type { Metadata } from 'next'
import Link from 'next/link'
import { Roboto } from 'next/font/google'
import { Logo } from '@/components/logo'
import { LinkPending } from '@/components/link-pending'
import { currentStaff, setupAccess } from '@/lib/session'
import { canSeePlan, isHiwi } from '@/lib/data'
import { logout } from './auth-actions'
import { SubmitButton } from '@/components/slot-button'
import { APP_TITLE, CHAIR } from '@/lib/brand'
import './globals.css'

const navLink = 'px-3 py-2 rounded hover:bg-lmu-light text-lmu-darker font-medium'

const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-roboto' })

export const metadata: Metadata = {
  title: `${APP_TITLE} – LS Gsell`,
  description: CHAIR,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentStaff()
  const setup = !me && (await setupAccess())
  return (
    <html lang="de" className={roboto.variable}>
      <body className="min-h-screen font-sans antialiased">
        <header className="bg-white border-b-4 border-lmu no-print">
          <div className="mx-auto max-w-6xl px-4 py-3 sm:py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/" className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1 basis-full md:basis-0">
              <Logo />
              <div className="min-w-0">
                <div className="text-base sm:text-xl font-bold text-lmu-dark leading-tight">{APP_TITLE}</div>
                <div className="text-[11px] sm:text-sm text-neutral-600 leading-snug">{CHAIR}</div>
              </div>
            </Link>
            {me ? (
              <nav className="flex w-full flex-wrap items-center gap-x-1 gap-y-1 text-sm md:w-auto">
                {canSeePlan(me) && (
                  <Link href="/plan" title="Studentische Hilfskräfte: Schichtplan und Abwesenheiten" className={navLink}>
                    <LinkPending>HiWis</LinkPending>
                  </Link>
                )}
                {!isHiwi(me) && (
                  <Link href="/abwesenheiten" title="Abwesenheiten eintragen" className={navLink}>
                    <LinkPending>Abwesenheiten</LinkPending>
                  </Link>
                )}
                <Link href="/uebersicht" className={navLink}>
                  <LinkPending>Übersicht</LinkPending>
                </Link>
                <Link href="/einstellungen" title="Meine Daten, Erinnerungen, Anmeldung, Kalender-Abo" className={navLink}>
                  <LinkPending>Einstellungen</LinkPending>
                </Link>
                {me.is_admin && (
                  <Link href="/verwaltung" className={navLink}>
                    <LinkPending>Verwaltung</LinkPending>
                  </Link>
                )}
                <form action={logout} className="ml-auto flex items-center gap-2 pl-3 md:ml-2 md:border-l md:border-neutral-200">
                  <span className="text-neutral-600">
                    <span className="hidden sm:inline">Angemeldet als </span>
                    <strong className="text-lmu-darker">{me.name}</strong>
                  </span>
                  <SubmitButton className="text-lmu underline underline-offset-2 hover:text-lmu-darker">Abmelden</SubmitButton>
                </form>
              </nav>
            ) : setup ? (
              <nav className="flex items-center gap-2 text-sm">
                <Link href="/verwaltung" className={navLink}>Verwaltung (Einrichtung)</Link>
                <form action={logout}>
                  <SubmitButton className="text-lmu underline underline-offset-2 hover:text-lmu-darker">Beenden</SubmitButton>
                </form>
              </nav>
            ) : null}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
