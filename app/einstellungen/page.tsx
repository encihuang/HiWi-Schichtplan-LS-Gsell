import { redirect } from 'next/navigation'
import {
  isHiwi, listAppointments, listClosedDays, listLog, listPeriods, listStaff, listYears, ROLE_LABELS, type Role,
} from '@/lib/data'
import { ToggleAll } from '@/components/toggle-all'
import { isAdmin } from '@/lib/session'
import { loadAbsenceTexts, loadMailConfig, loadMails, loadMailStates } from '@/lib/mail'
import { canStoreSecrets } from '@/lib/settings'
import { MailSettings } from '@/components/mail-settings'
import { ReminderSettings } from '@/components/reminder-settings'
import { loadReminderTexts, reminderStatus } from '@/lib/reminders'
import { REMINDER_OPTIONS } from '@/lib/reminder-shared'
import { formatDate, formatDateTime, LMU_VORLESUNGSZEITEN_URL, PERIOD_LABELS, yearLabel } from '@/lib/dates'
import {
  addAppointment, addClosedDay, resetCalendarToken, addYear, deleteAppointment, deleteStaff, deleteYear, removeClosedDay, saveStaff, saveYearDates,
} from '../actions'

export const dynamic = 'force-dynamic'

const input = 'w-full min-w-0 rounded border border-neutral-300 px-2 py-1.5 text-sm focus:outline-2 focus:outline-lmu'
const btn = 'rounded bg-lmu px-3 py-1.5 text-sm font-medium text-white hover:bg-lmu-dark'
const cols = 'lg:grid-cols-[1.2fr_1.6fr_1.1fr_0.5fr_1fr_1fr_1.3fr_0.4fr_auto]'

/** Eingabefeld mit Beschriftung */
function Field({ label, wide, className = '', children }: {
  label: string; wide?: boolean; className?: string; children: React.ReactNode
}) {
  return (
    <label className={`grid min-w-0 gap-0.5 ${wide ? 'col-span-2 lg:col-span-1' : ''} ${className}`}>
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

/** Erinnerung vor dem Dienst (nur für Hilfskräfte wirksam) */
function ReminderSelect({ value = null }: { value?: number | null }) {
  return (
    <select name="reminder" defaultValue={value ?? ''} className={input}>
      {REMINDER_OPTIONS.map(([v, l]) => (
        <option key={l} value={v ?? ''}>{l}</option>
      ))}
    </select>
  )
}

const btnGhost = 'rounded px-3 py-1.5 text-sm text-red-700 hover:bg-red-50'

export default async function Settings() {
  if (!(await isAdmin())) redirect('/login?kind=admin&next=/einstellungen')
  const [staff, years, log, mail, mails, mailStates, absenceTexts, reminderTexts, reminderLast] = await Promise.all([
    listStaff(), listYears(), listLog(null, 15), loadMailConfig(), loadMails(), loadMailStates(), loadAbsenceTexts(),
    loadReminderTexts(), reminderStatus(),
  ])
  const yearData = await Promise.all(
    years.map(async (y) => {
      const [periods, closed] = await Promise.all([listPeriods(y.id), listClosedDays(y.id)])
      const from = periods[0]?.start_date ?? `${y.start_year}-10-01`
      const to = periods.at(-1)?.end_date ?? `${y.start_year + 1}-09-30`
      return { y, periods, closed, from, to, appointments: await listAppointments(from, to) }
    }),
  )

  return (
    <div className="space-y-10">
      <h1 className="text-xl sm:text-2xl font-bold text-lmu-darker">Einstellungen</h1>

      {/* Hilfskräfte */}
      <section>
        <h2 className="text-lg font-semibold text-lmu-darker">Personen</h2>
        <p className="text-sm text-neutral-600">
          Nur aktive Personen erscheinen in der Auswahl „Wer bist du?“ ihres Bereichs. Den Schichtplan haben nur studentische
          Hilfskräfte; ihre Wochenstunden bestimmen den Soll-Anteil, Beginn und Ende (optional) begrenzen die Werktage.
          Abwesenheitsmeldungen gehen an die Person im Bereich „Sekretariat“.
        </p>
        <ToggleAll group="staff" className="mt-3" />
        <div className="mt-2 rounded-lg bg-white shadow-sm">
          <div className="divide-y divide-neutral-100">
            {staff.map((s) => (
              <details key={s.id} data-group="staff" className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2.5 hover:bg-neutral-50 [&::-webkit-details-marker]:hidden">
                  <span className="text-neutral-400 transition-transform group-open:rotate-90">▸</span>
                  <span className={`font-medium ${s.active ? '' : 'text-neutral-400'}`}>{s.name}</span>
                  <span className="text-sm text-neutral-500">{ROLE_LABELS[s.role]}</span>
                  {isHiwi(s) && <span className="text-sm text-neutral-500">{s.hours_per_week} h/Woche</span>}
                  {s.email && <span className="hidden text-sm text-neutral-500 sm:inline">{s.email}</span>}
                  {isHiwi(s) && s.reminder_days !== null && (
                    <span className="rounded bg-lmu-light px-1.5 text-xs text-lmu-darker">
                      Erinnerung: {REMINDER_OPTIONS.find(([v]) => v === s.reminder_days)?.[1]}
                    </span>
                  )}
                  {!s.active && <span className="rounded bg-neutral-100 px-1.5 text-xs text-neutral-600">inaktiv</span>}
                </summary>
                <div className="flex flex-col gap-2 border-t border-neutral-100 bg-neutral-50/60 px-3 py-3 lg:flex-row lg:items-end">
                  <form action={saveStaff} className={`grid flex-1 grid-cols-2 gap-2 ${cols} lg:items-end`}>
                    <input type="hidden" name="id" value={s.id} />
                    <Field label="Name" wide>
                      <input name="name" defaultValue={s.name} required className={input} />
                    </Field>
                    <Field label="E-Mail" wide>
                      <input type="email" name="email" defaultValue={s.email} placeholder="name@campus.lmu.de" className={input} />
                    </Field>
                    <Field label="Bereich" wide>
                      <RoleSelect value={s.role} />
                    </Field>
                    <Field label="h/Woche">
                      <input name="hours" defaultValue={s.hours_per_week} inputMode="decimal" className={input} />
                    </Field>
                    <Field label="Aktiv" className="lg:order-6">
                      <input type="checkbox" name="active" defaultChecked={s.active} className="h-5 w-5 accent-lmu lg:my-1.5" />
                    </Field>
                    <Field label="Beginn">
                      <input type="date" name="start" defaultValue={s.start_date ?? ''} className={input} />
                    </Field>
                    <Field label="Ende">
                      <input type="date" name="end" defaultValue={s.end_date ?? ''} className={input} />
                    </Field>
                    <Field label="Erinnerung vor dem Dienst" wide>
                      <ReminderSelect value={s.reminder_days} />
                    </Field>
                    <button className={`${btn} col-span-2 lg:order-7 lg:col-span-1`}>Speichern</button>
                  </form>
                  <form action={deleteStaff} className="text-right">
                    <input type="hidden" name="id" value={s.id} />
                    <button className={btnGhost} title="Löscht auch alle Schichten dieser Person">Löschen</button>
                  </form>
                </div>
              </details>
            ))}
            <form action={saveStaff} className={`grid grid-cols-2 gap-2 rounded-b-lg bg-lmu-lighter px-3 py-3 ${cols} lg:items-end`}>
              <Field label="Name" wide>
                <input name="name" placeholder="Neue Person" required className={input} />
              </Field>
              <Field label="E-Mail" wide>
                <input type="email" name="email" placeholder="E-Mail" className={input} />
              </Field>
              <Field label="Bereich" wide>
                <RoleSelect />
              </Field>
              <Field label="h/Woche">
                <input name="hours" placeholder="h" inputMode="decimal" className={input} />
              </Field>
              <span className="lg:order-6" />
              <Field label="Beginn">
                <input type="date" name="start" className={input} />
              </Field>
              <Field label="Ende">
                <input type="date" name="end" className={input} />
              </Field>
              <Field label="Erinnerung vor dem Dienst" wide>
                <ReminderSelect />
              </Field>
              <button className={`${btn} col-span-2 lg:order-7 lg:col-span-1 lg:mr-[7.5rem]`}>Hinzufügen</button>
            </form>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-lmu-darker">Kalender-Abos: Adresse geheim halten</h2>
        <p className="text-sm text-neutral-600">
          Wer die Adresse kennt, sieht den Schichtplan – auch ohne Passwort. Falls sie in falsche Hände geraten ist,
          setze sie zurück; bestehende Abos funktionieren dann nicht mehr und müssen neu eingerichtet werden. Die Person
          bekommt beim nächsten Öffnen von „Kalender“ eine neue Adresse.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {staff.filter((s) => s.active).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow-sm">
              <span className="min-w-0 truncate font-medium">{s.name}</span>
              <form action={resetCalendarToken}>
                <input type="hidden" name="id" value={s.id} />
                <button className="rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50">
                  Adresse zurücksetzen
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <MailSettings
        smtp={mail.smtp}
        mails={mails}
        states={mailStates}
        staff={staff}
        absenceTexts={absenceTexts}
        canStoreSecrets={canStoreSecrets()}
        passwordReadable={mail.password !== null}
      />

      <ReminderSettings
        texts={reminderTexts}
        hiwis={staff.filter((s) => s.active && isHiwi(s))}
        status={reminderLast}
        defaultTo={mail.smtp.from.match(/[^\s<>]+@[^\s<>]+/)?.[0] ?? ''}
      />

      {/* Studienjahre */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-lmu-darker">Vorlesungszeiten und vorlesungsfreie Zeiten</h2>
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

      <section>
        <h2 className="text-lg font-semibold text-lmu-darker">Änderungen an den Einstellungen</h2>
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
  )
}
