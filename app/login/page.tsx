import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { PASSWORD_MIN, pendingPurpose, verifiedResetStaff } from '@/lib/auth'
import { currentStaff, loginReady } from '@/lib/session'
import {
  passwordLogin, requestLoginCode, setupLogin, submitLoginCode, submitNewPassword,
} from '../auth-actions'

export const dynamic = 'force-dynamic'

const input = 'w-full rounded border border-neutral-300 px-3 py-2 focus:outline-2 focus:outline-lmu'
const label = 'grid gap-1 text-sm'

function Card({ title, text, children }: { title: string; text?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="max-w-sm mx-auto mt-10 bg-white rounded-lg shadow-sm p-6 border-t-4 border-lmu">
      <h1 className="text-xl font-bold text-lmu-darker">{title}</h1>
      {text && <p className="text-sm text-neutral-600 mt-1">{text}</p>}
      <div className="mt-4">{children}</div>
    </div>
  )
}

function Email({ autoFocus = true }: { autoFocus?: boolean }) {
  return (
    <label className={label}>
      <span className="text-neutral-600">Dienstliche E-Mail-Adresse</span>
      <input type="email" name="email" autoComplete="username" autoFocus={autoFocus} required placeholder="name@jura.uni-muenchen.de" className={input} />
    </label>
  )
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; schritt?: string; mit?: string; an?: string }>
}) {
  const { next = '/', schritt, mit, an } = await searchParams
  if (await currentStaff()) redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/')
  const hidden = <input type="hidden" name="next" value={next} />
  const link = (o: Record<string, string>) => `/login?${new URLSearchParams({ ...o, ...(next !== '/' && { next }) })}`

  if (schritt === 'code') {
    const purpose = await pendingPurpose()
    if (!purpose) redirect(link({}))
    return (
      <Card
        title={purpose === 'reset' ? 'Passwort vergessen' : 'Code eingeben'}
        text={<>Falls {an ? <strong>{an}</strong> : 'die Adresse'} bei uns hinterlegt ist, haben wir dorthin einen 6-stelligen Code geschickt. Er gilt 10 Minuten.</>}
      >
        <ActionForm action={submitLoginCode} submit={purpose === 'reset' ? 'Weiter' : 'Anmelden'}>
          {hidden}
          <label className={label}>
            <span className="text-neutral-600">Code aus der E-Mail</span>
            <input
              name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} autoFocus required
              className={`${input} text-center text-2xl tracking-[0.4em] tabular-nums`}
            />
          </label>
        </ActionForm>
        <p className="mt-4 text-sm text-neutral-600">
          Keine E-Mail bekommen? Spam-Ordner prüfen oder{' '}
          <Link href={link(purpose === 'reset' ? { schritt: 'vergessen' } : {})} className="text-lmu underline">neuen Code anfordern</Link>.
        </p>
      </Card>
    )
  }

  if (schritt === 'neues-passwort') {
    if (!(await verifiedResetStaff())) redirect(link({ schritt: 'vergessen' }))
    return (
      <Card title="Neues Passwort" text={`Mindestens ${PASSWORD_MIN} Zeichen. Danach kannst du dich wahlweise mit Passwort oder weiterhin mit Code anmelden.`}>
        <ActionForm action={submitNewPassword} submit="Passwort speichern und anmelden">
          {hidden}
          <label className={label}>
            <span className="text-neutral-600">Neues Passwort</span>
            <input type="password" name="password" autoComplete="new-password" minLength={PASSWORD_MIN} autoFocus required className={input} />
          </label>
          <label className={label}>
            <span className="text-neutral-600">Noch einmal</span>
            <input type="password" name="repeat" autoComplete="new-password" minLength={PASSWORD_MIN} required className={input} />
          </label>
        </ActionForm>
      </Card>
    )
  }

  if (schritt === 'vergessen') {
    return (
      <Card title="Passwort vergessen" text="Wir schicken dir einen Code an deine dienstliche E-Mail-Adresse. Danach legst du ein neues Passwort fest.">
        <ActionForm action={requestLoginCode} submit="Code senden">
          {hidden}
          <input type="hidden" name="purpose" value="reset" />
          <Email />
        </ActionForm>
        <p className="mt-4 text-sm">
          <Link href={link({})} className="text-lmu underline">← zurück zur Anmeldung</Link>
        </p>
      </Card>
    )
  }

  if (schritt === 'einrichtung') {
    if (await loginReady()) redirect(link({}))
    return (
      <Card
        title="Einrichtung"
        text="Solange der E-Mail-Versand nicht eingerichtet ist oder niemand Verwaltungsrechte hat, öffnet das Einrichtungs-Passwort (ADMIN_PASSWORD) die Verwaltung. Danach ist dieser Zugang gesperrt."
      >
        <ActionForm action={setupLogin} submit="Verwaltung öffnen">
          <input type="password" name="password" autoFocus required className={input} aria-label="Einrichtungs-Passwort" />
        </ActionForm>
      </Card>
    )
  }

  const password = mit === 'passwort'
  const tab = (active: boolean) =>
    `flex-1 rounded px-3 py-1.5 text-center text-sm font-medium ${active ? 'bg-white text-lmu-darker shadow-sm' : 'text-neutral-600 hover:text-lmu-darker'}`
  const ready = await loginReady()
  return (
    <Card title="Anmelden" text="Der Schichtplan enthält vertrauliche Daten und ist nur nach Anmeldung sichtbar.">
      <div className="mb-4 flex gap-1 rounded-lg bg-neutral-100 p-1" role="tablist">
        <Link href={link({})} role="tab" aria-selected={!password} className={tab(!password)}>Code per E-Mail</Link>
        <Link href={link({ mit: 'passwort' })} role="tab" aria-selected={password} className={tab(password)}>Mit Passwort</Link>
      </div>
      {password ? (
        <>
          <ActionForm action={passwordLogin} submit="Anmelden">
            {hidden}
            <Email />
            <label className={label}>
              <span className="text-neutral-600">Passwort</span>
              <input type="password" name="password" autoComplete="current-password" required className={input} />
            </label>
          </ActionForm>
          <p className="mt-4 text-sm text-neutral-600">
            Noch kein Passwort?{' '}
            <Link href={link({ schritt: 'vergessen' })} className="text-lmu underline">Passwort vergessen / festlegen</Link>
          </p>
        </>
      ) : (
        <>
          <ActionForm action={requestLoginCode} submit="Code senden">
            {hidden}
            <input type="hidden" name="purpose" value="login" />
            <Email />
          </ActionForm>
          <p className="mt-4 text-sm text-neutral-600">
            Du bekommst einen 6-stelligen Code an deine dienstliche Adresse.{' '}
            <Link href={link({ schritt: 'vergessen' })} className="text-lmu underline">Passwort vergessen?</Link>
          </p>
        </>
      )}
      {!ready && (
        <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          Noch nicht eingerichtet? <Link href="/login?schritt=einrichtung" className="underline">Einrichtung</Link>
        </p>
      )}
    </Card>
  )
}
