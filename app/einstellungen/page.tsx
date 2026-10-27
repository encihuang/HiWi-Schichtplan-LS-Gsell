import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { CalendarFeeds } from '@/components/calendar-feeds'
import { SubmitButton } from '@/components/slot-button'
import { hasPassword, PASSWORD_MIN } from '@/lib/auth'
import { isHiwi, ROLE_LABELS } from '@/lib/data'
import { query } from '@/lib/db'
import { loadMails } from '@/lib/mail'
import { daysBeforeKey, DAYS_BEFORE_OPTIONS } from '@/lib/mail-shared'
import { requireUser, SESSION_DAYS } from '@/lib/session'
import {
  logoutOtherDevices, removeOwnPassword, saveOwnPassword, saveProfile, saveReminders,
} from '../auth-actions'

export const dynamic = 'force-dynamic'

const input = 'w-full min-w-0 rounded border border-neutral-300 px-2 py-1.5 text-sm focus:outline-2 focus:outline-lmu'
const label = 'grid min-w-0 gap-1 text-sm'
const hint = 'text-xs text-neutral-500'

function Card({ id, title, text, children }: { id: string; title: string; text?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4 rounded-lg bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-lmu-darker">{title}</h2>
      {text && <p className="mt-1 text-sm text-neutral-600">{text}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Eigene Einstellungen: Daten, Erinnerungen, Anmeldung */
export default async function MySettings() {
  const me = await requireUser('/einstellungen')
  const [withPassword, mails, [{ devices }]] = await Promise.all([
    hasPassword(me.id),
    loadMails(),
    query<{ devices: number }>('select count(*)::int as devices from sessions where staff_id = $1 and expires_at > now()', [me.id]),
  ])
  const reminders = mails.filter((m) => m.kind === 'reminder')
  const hiwi = isHiwi(me)

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-lmu-darker">Einstellungen</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Deine eigenen Daten – nur du kannst sie ändern. {ROLE_LABELS[me.role]}
          {me.is_admin && <> · <Link href="/verwaltung" className="text-lmu underline">Verwaltung</Link></>}
        </p>
      </div>

      <Card
        id="daten"
        title="Meine Daten"
        text={hiwi ? 'Deine Wochenstunden und dein Beschäftigungszeitraum bestimmen deinen Soll-Anteil im Schichtplan (Berechnung auf der Planseite).' : undefined}
      >
        <ActionForm action={saveProfile} submit="Speichern" done="Gespeichert." className="grid gap-3 sm:grid-cols-2">
          <label className={`${label} sm:col-span-2`}>
            Name
            <input name="name" defaultValue={me.name} required className={input} />
          </label>
          <label className={`${label} sm:col-span-2`}>
            Dienstliche E-Mail (Anmeldung)
            <input value={me.email} readOnly disabled className={`${input} bg-neutral-50 text-neutral-500`} />
            <span className={hint}>Änderung bitte über die Verwaltung (neu aufnehmen lassen).</span>
          </label>
          {hiwi && (
            <>
              <label className={label}>
                Arbeitszeit (Stunden pro Woche)
                <input name="hours" defaultValue={me.hours_per_week} inputMode="decimal" required className={input} />
              </label>
              <span />
              <label className={label}>
                Beginn des Vertrags (optional)
                <input type="date" name="start" defaultValue={me.start_date ?? ''} className={input} />
              </label>
              <label className={label}>
                Ende des Vertrags (optional)
                <input type="date" name="end" defaultValue={me.end_date ?? ''} className={input} />
              </label>
            </>
          )}
          <div className="sm:col-span-2" />
        </ActionForm>
      </Card>

      {hiwi && (
        <Card
          id="erinnerungen"
          title="Erinnerungen per E-Mail"
          text="Möchtest du vor deinem Dienst automatisch erinnert werden? Die E-Mail kommt nur an Tagen, an denen du einen Dienst, eine Vorlesung/Aufgabe oder eine Vertretung hast."
        >
          {reminders.length === 0 ? (
            <p className="text-sm text-neutral-500">Die Verwaltung hat noch keine Erinnerung eingerichtet.</p>
          ) : (
            <ActionForm action={saveReminders} submit="Speichern" done="Gespeichert.">
              <ul className="space-y-2">
                {reminders.map((m) => (
                  <li key={m.id}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="reminder" value={m.id} defaultChecked={m.staffIds.includes(me.id)} className="mt-0.5 h-4 w-4 accent-lmu" />
                      <span>
                        <span className="font-medium">{m.name}</span>
                        <span className="block text-neutral-500">
                          {DAYS_BEFORE_OPTIONS.find(([d]) => d === daysBeforeKey(m))?.[1]}, um {m.hour}:00 Uhr
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className={hint}>Ohne Häkchen bekommst du keine Erinnerungen.</p>
            </ActionForm>
          )}
        </Card>
      )}

      <Card
        id="anmeldung"
        title="Anmeldung"
        text={
          <>
            Standard ist die Anmeldung mit einem Code an <strong>{me.email}</strong>. Wenn du möchtest, kannst du zusätzlich
            ein Passwort festlegen und dich wahlweise damit anmelden. Eine Anmeldung gilt {SESSION_DAYS} Tage.
          </>
        }
      >
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold">{withPassword ? 'Passwort ändern' : 'Passwort festlegen (optional)'}</h3>
            <ActionForm action={saveOwnPassword} submit={withPassword ? 'Passwort ändern' : 'Passwort festlegen'} done="Gespeichert. Andere Geräte wurden abgemeldet." className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className={label}>
                Neues Passwort
                <input type="password" name="password" autoComplete="new-password" minLength={PASSWORD_MIN} required className={input} />
                <span className={hint}>mindestens {PASSWORD_MIN} Zeichen</span>
              </label>
              <label className={label}>
                Noch einmal
                <input type="password" name="repeat" autoComplete="new-password" minLength={PASSWORD_MIN} required className={input} />
              </label>
              <div className="sm:col-span-2" />
            </ActionForm>
          </div>
          {withPassword && (
            <form action={removeOwnPassword} className="flex flex-wrap items-center gap-3 text-sm">
              <SubmitButton className="rounded border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50">Passwort entfernen</SubmitButton>
              <span className="text-neutral-500">Danach nur noch Anmeldung per Code.</span>
            </form>
          )}
          <form action={logoutOtherDevices} className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-4 text-sm">
            <span className="text-neutral-600">Angemeldet auf {devices} {devices === 1 ? 'Gerät' : 'Geräten'}.</span>
            {devices > 1 && (
              <SubmitButton className="rounded border border-lmu px-3 py-1.5 text-lmu-darker hover:bg-lmu-light">Alle anderen Geräte abmelden</SubmitButton>
            )}
          </form>
        </div>
      </Card>

      <Card
        id="kalender"
        title="Kalender abonnieren"
        text="Deine Dienste erscheinen automatisch in deinem Kalender (iPhone, Outlook, Google, Thunderbird …) und werden bei Änderungen im Schichtplan aktualisiert. Ausfälle, Vertretungen und Zusatzdienste sind berücksichtigt, Feier- und Schließtage ausgelassen."
      >
        <CalendarFeeds me={me} />
      </Card>
    </div>
  )
}
