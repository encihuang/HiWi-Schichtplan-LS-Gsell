import { redirect } from 'next/navigation'
import {
  hiwisWithDuties, listAppointments, listClosedDays, listLog, listPeriods, listStaff, listYears, ROLE_LABELS, ROLES, type Role,
} from '@/lib/data'
import { currentStaff, isAdmin, loginReady, SESSION_DAYS } from '@/lib/session'
import { loadAbsenceTexts, loadMailConfig, loadMails, loadMailStates } from '@/lib/mail'
import { canStoreSecrets } from '@/lib/settings'
import { query } from '@/lib/db'
import { MailSettings } from '@/components/mail-settings'
import { formatDate, formatDateTime, LMU_VORLESUNGSZEITEN_URL, PERIOD_LABELS, yearLabel } from '@/lib/dates'
import {
  addAppointment, addClosedDay, addStaff, addStaffEmail, addYear, deleteAppointment, deleteStaff, deleteYear, endStaffSessions,
  removeClosedDay, removeStaff, resetCalendarToken, restoreStaff, saveYearDates, setStaffAdmin,
} from '../actions'

export const dynamic = 'force-dynamic'

const input = 'w-full min-w-0 rounded border border-neutral-300 px-2 py-1.5 text-sm focus:outline-2 focus:outline-lmu'
const btn = 'rounded bg-lmu px-3 py-1.5 text-sm font-medium text-white hover:bg-lmu-dark'
const btnGhost = 'rounded px-3 py-1.5 text-sm text-red-700 hover:bg-red-50'
const btnSmall = 'rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50'
const h2 = 'text-lg font-semibold text-lmu-darker'

const SECTIONS = [
  ['ueberblick', 'Überblick'],
  ['personen', 'Personen'],
  ['zugang', 'Zugang und Sicherheit'],
  ['email', 'E-Mails'],
  ['studienjahre', 'Studienjahre und Termine'],
  ['verlauf', 'Verlauf'],
] as const

/** Eingabefeld mit Beschriftung */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-0.5">
      <span className="text-xs text-neutral-500">{label}</span>
      {children}
    </label>
  )
}

function RoleSelect({ value = 'hiwi' }: { value?: Role }) {
  return (
    <select name="role" defaultValue={value} className={input}>
      {Object.entries(ROLE_LABELS).map(([k, l]) => (
        <option key={k} value={k}>{l}</option>
      ))}
    </select>
  )
}

function Check({ name, label }: { name: string; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-sm lg:flex-col lg:items-start lg:gap-0.5">
      <span className="order-2 text-xs text-neutral-500 lg:order-1">{label}</span>
      <input type="checkbox" name={name} className="order-1 h-5 w-5 accent-lmu lg:order-2 lg:my-1.5" />
    </label>
  )
}

function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'green' | 'amber' | 'red'; children: React.ReactNode }) {
  const c = {
    neutral: 'bg-neutral-100 text-neutral-600',
    green: 'bg-lmu-light text-lmu-darker',
    amber: 'bg-amber-100 text-amber-900',
    red: 'bg-red-100 text-red-800',
  }[tone]
  return <span className={`rounded px-1.5 py-0.5 text-xs ${c}`}>{children}</span>
}

function Stat({ label, value, ok, hint }: { label: string; value: React.ReactNode; ok: boolean; hint?: string }) {
  return (
    <div className={`rounded-lg border-l-4 bg-white p-4 shadow-sm ${ok ? 'border-lmu' : 'border-amber-500'}`}>
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-lmu-darker">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-neutral-500">{hint}</div>}
    </div>
  )
}

type Access = { id: number; has_password: boolean; sessions: number; last_login: string | null; locked: boolean }

export default async function Admin() {
  if (!(await isAdmin())) redirect('/einstellungen')
  const [me, staff, years, log, mail, mails, mailStates, absenceTexts, withDuties, ready, access] = await Promise.all([
    currentStaff(), listStaff(), listYears(), listLog(null, 30), loadMailConfig(), loadMails(), loadMailStates(), loadAbsenceTexts(),
    hiwisWithDuties(), loginReady(),
    query<Access>(
      `select s.id, s.password_hash is not null as has_password, coalesce(locked_until > now(), false) as locked,
         (select count(*)::int from sessions x where x.staff_id = s.id and x.expires_at > now()) as sessions,
         (select max(created_at) from sessions x where x.staff_id = s.id) as last_login
       from staff s`,
    ),
  ])
  const acc = new Map(access.map((a) => [a.id, a]))
  const yearData = await Promise.all(
    years.map(async (y) => {
      const [periods, closed] = await Promise.all([listPeriods(y.id), listClosedDays(y.id)])
      const from = periods[0]?.start_date ?? `${y.start_year}-10-01`
      const to = periods.at(-1)?.end_date ?? `${y.start_year + 1}-09-30`
      return { y, periods, closed, from, to, appointments: await listAppointments(from, to) }
    }),
  )
  const active = staff.filter((s) => s.active)
  const admins = active.filter((s) => s.is_admin && s.email)
  const noEmail = active.filter((s) => !s.email)
  const smtpOk = !!(mail.smtp.host && mail.smtp.user && mail.smtp.from && mail.password)
  const sessions = access.reduce((n, a) => n + a.sessions, 0)

  return (
    <div className="lg:grid lg:grid-cols-[12rem_1fr] lg:gap-8">
      <aside className="no-print mb-6 lg:mb-0">
        <nav className="flex gap-1 overflow-x-auto rounded-lg bg-white p-1 text-sm shadow-sm lg:sticky lg:top-4 lg:flex-col lg:overflow-visible lg:p-2">
          <div className="hidden px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 lg:block">Verwaltung</div>
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="shrink-0 rounded px-2 py-1.5 text-lmu-darker hover:bg-lmu-light">
              {label}
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-10">
        <section id="ueberblick" className="scroll-mt-4">
          <h1 className="text-xl sm:text-2xl font-bold text-lmu-darker">Verwaltung</h1>
          <p className="text-sm text-neutral-600">
            Personen und Rechte, Anmeldung, automatische E-Mails und Studienjahre. Eigene Daten (Wochenstunden, Passwort,
            Erinnerungen) trägt jede Person selbst unter „Einstellungen“ ein.
          </p>
          {!me && (
            <p className="mt-3 rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="note">
              <strong>Einrichtung:</strong> Richte den E-Mail-Versand ein und gib mindestens einer Person mit dienstlicher
              E-Mail-Adresse Verwaltungsrechte. Danach ist der Zugang mit dem Einrichtungs-Passwort gesperrt und alle melden
              sich per Code oder Passwort an.
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Anmeldung" value={ready ? 'eingerichtet' : 'noch nicht möglich'} ok={ready}
              hint={ready ? 'Code per E-Mail oder Passwort' : !smtpOk ? 'E-Mail-Versand fehlt' : 'niemand mit Verwaltungsrechten'} />
            <Stat label="E-Mail-Versand" value={smtpOk ? 'bereit' : 'fehlt'} ok={smtpOk} hint={mail.smtp.host || 'SMTP-Konto eintragen'} />
            <Stat label="Personen" value={`${active.length} aktiv`} ok={!noEmail.length}
              hint={noEmail.length ? `${noEmail.length} ohne E-Mail – können sich nicht anmelden` : `${admins.length} mit Verwaltungsrechten`} />
            <Stat label="Verschlüsselung" value={canStoreSecrets() ? 'aktiv' : 'kein Schlüssel'} ok={canStoreSecrets()}
              hint={canStoreSecrets() ? `AES-256-GCM, SHA-256; ${sessions} Sitzung(en) offen` : 'SECRET_KEY setzen'} />
          </div>
        </section>

        <section id="personen" className="scroll-mt-4">
          <h2 className={h2}>Personen</h2>
          <p className="text-sm text-neutral-600">
            Hier werden Personen nur aufgenommen und entfernt. Name, Wochenstunden und Beschäftigungszeitraum trägt jede Person
            selbst unter „Einstellungen“ ein. Die dienstliche E-Mail-Adresse ist die Anmeldung und muss eindeutig sein.
            Entfernte Personen können sich nicht mehr anmelden; ihre Schichten und Abwesenheiten bleiben erhalten.
          </p>

          <form action={addStaff} className="mt-3 grid gap-2 rounded-lg bg-lmu-lighter p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-[1.2fr_1.6fr_1.2fr_auto_auto] lg:items-end">
            <Field label="Name">
              <input name="name" placeholder="Vorname Nachname" required className={input} />
            </Field>
            <Field label="Dienstliche E-Mail (Anmeldung)">
              <input type="email" name="email" required placeholder="name@jura.uni-muenchen.de" className={input} />
            </Field>
            <Field label="Bereich">
              <RoleSelect />
            </Field>
            <Check name="admin" label="Verwaltung" />
            <button className={btn}>Aufnehmen</button>
          </form>

          {ROLES.map((role) => {
            const people = active.filter((s) => s.role === role)
            if (!people.length) return null
            return (
              <div key={role} className="mt-4">
                <h3 className="text-sm font-semibold text-neutral-700">{ROLE_LABELS[role]} <span className="font-normal text-neutral-500">({people.length})</span></h3>
                <ul className="mt-1.5 divide-y divide-neutral-100 rounded-lg bg-white shadow-sm">
                  {people.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{s.name}</span>
                        {s.id === me?.id && <span className="ml-2"><Badge>du</Badge></span>}
                        {s.is_admin && <span className="ml-2"><Badge tone="green">Verwaltung</Badge></span>}
                        {s.email && <span className="block truncate text-xs text-neutral-500">{s.email}</span>}
                      </span>
                      {!s.email && (
                        <form action={addStaffEmail} className="flex gap-1.5">
                          <input type="hidden" name="id" value={s.id} />
                          <input type="email" name="email" required placeholder="E-Mail nachtragen" aria-label={`E-Mail von ${s.name}`} className={`${input} w-56`} />
                          <button className={btn}>Speichern</button>
                        </form>
                      )}
                      {s.id !== me?.id && (
                        <form action={removeStaff}>
                          <input type="hidden" name="id" value={s.id} />
                          <button className={btnSmall}>Entfernen</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}

          {staff.some((s) => !s.active) && (
            <details className="group mt-4 rounded-lg bg-white shadow-sm">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
                <span className="text-neutral-400 transition-transform group-open:rotate-90">▸</span>
                <span className="font-medium text-neutral-700">Entfernte Personen ({staff.filter((s) => !s.active).length})</span>
              </summary>
              <ul className="divide-y divide-neutral-100 border-t border-neutral-100">
                {staff.filter((s) => !s.active).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 text-neutral-500">
                      {s.name} <span className="text-xs">· {ROLE_LABELS[s.role]}</span>
                    </span>
                    <form action={restoreStaff}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className="rounded border border-lmu px-2 py-1 text-xs text-lmu-darker hover:bg-lmu-light">Wieder aufnehmen</button>
                    </form>
                    <form action={deleteStaff}>
                      <input type="hidden" name="id" value={s.id} />
                      <button className={btnGhost} title="Löscht auch alle Schichten und Abwesenheiten dieser Person">Endgültig löschen</button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section id="zugang" className="scroll-mt-4">
          <h2 className={h2}>Zugang und Sicherheit</h2>
          <p className="text-sm text-neutral-600">
            Anmeldung per Code an die dienstliche Adresse (Standard) oder mit selbst festgelegtem Passwort. Eine Anmeldung gilt{' '}
            {SESSION_DAYS} Tage. Gespeichert werden nur SHA-256-Werte der Sitzungs-, Code- und Kalender-Schlüssel,
            Passwörter mit scrypt; Notizen zu Abwesenheiten und das SMTP-Passwort verschlüsselt (AES-256-GCM).
            Kalender-Abos funktionieren über eine geheime Adresse ohne Anmeldung – falls sie in falsche Hände geraten ist,
            zurücksetzen; die Person bekommt beim nächsten Öffnen von „Kalender“ eine neue.
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-left text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Person</th>
                  <th className="px-3 py-2 font-medium">Anmeldung</th>
                  <th className="px-3 py-2 font-medium">Zuletzt angemeldet</th>
                  <th className="px-3 py-2 font-medium">Geräte</th>
                  <th className="px-3 py-2 font-medium">Verwaltungsrechte</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {active.map((s) => {
                  const a = acc.get(s.id)
                  return (
                    <tr key={s.id}>
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          {!s.email ? <Badge tone="amber">keine E-Mail</Badge> : <Badge tone="green">Code</Badge>}
                          {a?.has_password && <Badge tone="green">Passwort</Badge>}
                          {a?.locked && <Badge tone="red">Passwort gesperrt</Badge>}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-neutral-600 tabular-nums">{a?.last_login ? formatDateTime(a.last_login) : '–'}</td>
                      <td className="px-3 py-2 tabular-nums">{a?.sessions ?? 0}</td>
                      <td className="px-3 py-2">
                        {s.id === me?.id ? (
                          <Badge tone="green">ja (du)</Badge>
                        ) : (
                          <form action={setStaffAdmin}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="on" value={s.is_admin ? '' : '1'} />
                            <button
                              className={`rounded border px-2 py-1 text-xs ${s.is_admin ? 'border-lmu bg-lmu-light text-lmu-darker hover:bg-white' : 'border-neutral-300 text-neutral-600 hover:border-lmu hover:text-lmu-darker'}`}
                              title={s.is_admin ? 'Verwaltungsrechte entziehen' : 'Verwaltungsrechte geben'}
                            >
                              {s.is_admin ? 'ja – entziehen' : 'nein – geben'}
                            </button>
                          </form>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          {!!a?.sessions && s.id !== me?.id && (
                            <form action={endStaffSessions}>
                              <input type="hidden" name="id" value={s.id} />
                              <button className={btnSmall}>Abmelden</button>
                            </form>
                          )}
                          <form action={resetCalendarToken}>
                            <input type="hidden" name="id" value={s.id} />
                            <button className={btnSmall}>Kalender-Adresse zurücksetzen</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div id="email" className="scroll-mt-4 space-y-10">
          <MailSettings
            smtp={mail.smtp}
            mails={mails}
            states={mailStates}
            staff={staff}
            withDuties={withDuties.map((x) => x.id)}
            absenceTexts={absenceTexts}
            canStoreSecrets={canStoreSecrets()}
            passwordReadable={mail.password !== null}
          />
        </div>

        {/* Studienjahre */}
        <section id="studienjahre" className="scroll-mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className={h2}>Studienjahre und Termine</h2>
              <p className="text-sm text-neutral-600">
                Neue Studienjahre werden automatisch nach den{' '}
                <a href={LMU_VORLESUNGSZEITEN_URL} target="_blank" rel="noreferrer" className="text-lmu underline">
                  Vorlesungszeiten der LMU
                </a>{' '}
                angelegt (inkl. gesetzlicher Feiertage in Bayern). Hier lassen sich die Daten anpassen.
              </p>
            </div>
            <form action={addYear}>
              <button className={btn}>+ Studienjahr hinzufügen</button>
            </form>
          </div>

          <div className="mt-4 space-y-4">
            {yearData.reverse().map(({ y, periods, closed, from, to, appointments }) => (
              <details key={y.id} className="rounded-lg bg-white shadow-sm" open={yearData.length === 1}>
                <summary className="cursor-pointer px-4 py-3 font-semibold text-lmu-darker">
                  Studienjahr {yearLabel(y.start_year)}
                </summary>
                <div className="grid gap-6 border-t border-neutral-100 p-4 lg:grid-cols-2">
                  <form action={saveYearDates} className="space-y-2">
                    <input type="hidden" name="year" value={y.id} />
                    {periods.map((p) => (
                      <div key={p.id} className="grid grid-cols-2 items-center gap-2 text-sm sm:grid-cols-[1fr_auto_auto]">
                        <span className="col-span-2 font-medium sm:col-span-1 sm:font-normal">{PERIOD_LABELS[p.kind]}</span>
                        <input type="date" name={`${p.kind}_start`} defaultValue={p.start_date} className={input} />
                        <input type="date" name={`${p.kind}_end`} defaultValue={p.end_date} className={input} />
                      </div>
                    ))}
                    <button className={btn}>Zeiträume speichern</button>
                  </form>
                  <div>
                    <h3 className="text-sm font-semibold">Feiertage und Schließtage (kein Dienst)</h3>
                    <ul className="mt-2 max-h-56 overflow-y-auto divide-y divide-neutral-100 text-sm">
                      {closed.map((c) => (
                        <li key={c.date} className="flex items-center justify-between py-1">
                          <span>
                            <span className="tabular-nums">{formatDate(c.date)}</span> – {c.name}
                          </span>
                          <form action={removeClosedDay}>
                            <input type="hidden" name="year" value={y.id} />
                            <input type="hidden" name="date" value={c.date} />
                            <button className="px-2 text-red-700 hover:underline">entfernen</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                    <form action={addClosedDay} className="mt-2 flex flex-wrap gap-2">
                      <input type="hidden" name="year" value={y.id} />
                      <input type="date" name="date" required className={input} />
                      <input name="name" placeholder="z. B. Betriebsausflug" className={`${input} flex-1`} />
                      <button className={btn}>Eintragen</button>
                    </form>
                  </div>
                  <div className="lg:col-span-2">
                    <h3 className="text-sm font-semibold">Termine im Kalender (z. B. Klausuren – der Dienst findet statt)</h3>
                    <p className="text-xs text-neutral-500">Erscheinen im Schichtplan, in der Übersicht und im Kalender-Abo.</p>
                    {appointments.length === 0 ? (
                      <p className="mt-2 text-sm text-neutral-500">Noch keine Termine.</p>
                    ) : (
                      <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-neutral-100 text-sm">
                        {appointments.map((a) => (
                          <li key={a.id} className="flex items-center justify-between gap-3 py-1">
                            <span className="min-w-0">
                              <span className="tabular-nums">{formatDate(a.date)}</span>
                              {a.time && <span className="text-neutral-500"> {a.time}</span>} – <strong className="font-medium">{a.title}</strong>
                              {a.note && <span className="text-neutral-500"> ({a.note})</span>}
                            </span>
                            <form action={deleteAppointment}>
                              <input type="hidden" name="appointment" value={a.id} />
                              <button className="px-2 text-red-700 hover:underline">entfernen</button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    )}
                    <form action={addAppointment} className="mt-2 grid gap-2 sm:grid-cols-[auto_8rem_1fr_1fr_auto]">
                      <input type="date" name="date" required min={from} max={to} className={input} aria-label="Datum" />
                      <input name="time" placeholder="Uhrzeit (optional)" className={input} aria-label="Uhrzeit" />
                      <input name="title" required placeholder="z. B. Klausur Zivilrecht II" className={input} aria-label="Termin" />
                      <input name="note" placeholder="Notiz (optional)" className={input} aria-label="Notiz" />
                      <button className={btn}>Eintragen</button>
                    </form>
                    <form action={deleteYear} className="mt-6 text-right">
                      <input type="hidden" name="year" value={y.id} />
                      <button className={btnGhost}>Studienjahr {yearLabel(y.start_year)} mit allen Schichten löschen</button>
                    </form>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>

        <section id="verlauf" className="scroll-mt-4">
          <h2 className={h2}>Verlauf</h2>
          <p className="text-sm text-neutral-600">Änderungen an Personen, Anmeldung und Einstellungen (ohne Schichtplan).</p>
          <ul className="mt-2 divide-y divide-neutral-200 rounded-lg bg-white text-sm shadow-sm">
            {log.length === 0 && <li className="p-3 text-neutral-500">Noch keine.</li>}
            {log.map((l, i) => (
              <li key={i} className="p-3">
                <span className="font-medium">{l.actor}</span>: {l.message}
                <span className="ml-2 text-xs text-neutral-500">{formatDateTime(l.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
