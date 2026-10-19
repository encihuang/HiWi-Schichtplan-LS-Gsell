import { redirect } from 'next/navigation'
import { listClosedDays, listLog, listPeriods, listStaff, listYears, ROLE_LABELS, type Role } from '@/lib/data'
import { isAdmin } from '@/lib/session'
import { loadMailConfig } from '@/lib/mail'
import { canStoreSecrets } from '@/lib/settings'
import { MailSettings } from '@/components/mail-settings'
import { formatDate, formatDateTime, LMU_VORLESUNGSZEITEN_URL, PERIOD_LABELS, yearLabel } from '@/lib/dates'
import {
  addClosedDay, addYear, deleteStaff, deleteYear, removeClosedDay, saveStaff, saveYearDates,
} from '../actions'

export const dynamic = 'force-dynamic'

const input = 'w-full min-w-0 rounded border border-neutral-300 px-2 py-1.5 text-sm focus:outline-2 focus:outline-lmu'
const btn = 'rounded bg-lmu px-3 py-1.5 text-sm font-medium text-white hover:bg-lmu-dark'
const cols = 'lg:grid-cols-[1.2fr_1.6fr_1.1fr_0.5fr_1fr_1fr_0.4fr_auto]'

/** Eingabefeld mit Beschriftung, die nur auf schmalen Bildschirmen sichtbar ist (sonst Tabellenkopf) */
function Field({ label, wide, className = '', children }: {
  label: string; wide?: boolean; className?: string; children: React.ReactNode
}) {
  return (
    <label className={`grid min-w-0 gap-0.5 ${wide ? 'col-span-2 lg:col-span-1' : ''} ${className}`}>
      <span className="text-xs text-neutral-500 lg:hidden">{label}</span>
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

const btnGhost = 'rounded px-3 py-1.5 text-sm text-red-700 hover:bg-red-50'

export default async function Settings() {
  if (!(await isAdmin())) redirect('/login?kind=admin&next=/einstellungen')
  const [staff, years, log, mail] = await Promise.all([listStaff(), listYears(), listLog(null, 15), loadMailConfig()])
  const yearData = await Promise.all(
    years.map(async (y) => ({ y, periods: await listPeriods(y.id), closed: await listClosedDays(y.id) })),
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
        <div className="mt-3 rounded-lg bg-white shadow-sm">
          <div className="divide-y divide-neutral-100">
            <div className={`hidden ${cols} gap-2 rounded-t-lg bg-lmu px-3 py-2 text-sm font-semibold text-white lg:grid`}>
              <span>Name</span><span>E-Mail</span><span>Bereich</span><span>h/Woche</span><span>Beginn</span><span>Ende</span><span>Aktiv</span><span className="w-28" />
            </div>
            {staff.map((s) => (
              <div key={s.id} className="flex flex-col gap-2 px-3 py-3 lg:flex-row lg:items-center lg:py-2">
                <form action={saveStaff} className={`grid flex-1 grid-cols-2 gap-2 ${cols} lg:items-center`}>
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
                    <input type="checkbox" name="active" defaultChecked={s.active} className="h-5 w-5 accent-lmu" />
                  </Field>
                  <Field label="Beginn">
                    <input type="date" name="start" defaultValue={s.start_date ?? ''} className={input} />
                  </Field>
                  <Field label="Ende">
                    <input type="date" name="end" defaultValue={s.end_date ?? ''} className={input} />
                  </Field>
                  <button className={`${btn} col-span-2 lg:order-7 lg:col-span-1`}>Speichern</button>
                </form>
                <form action={deleteStaff} className="text-right">
                  <input type="hidden" name="id" value={s.id} />
                  <button className={btnGhost} title="Löscht auch alle Schichten dieser Person">Löschen</button>
                </form>
              </div>
            ))}
            <form action={saveStaff} className={`grid grid-cols-2 gap-2 rounded-b-lg bg-lmu-lighter px-3 py-3 ${cols} lg:items-center lg:py-2`}>
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
              <button className={`${btn} col-span-2 lg:order-7 lg:col-span-1 lg:mr-[7.5rem]`}>Hinzufügen</button>
            </form>
          </div>
        </div>
      </section>

      <MailSettings
        smtp={mail.smtp}
        digest={mail.digest}
        texts={mail.texts}
        canStoreSecrets={canStoreSecrets()}
        passwordReadable={mail.password !== null}
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
          {yearData.reverse().map(({ y, periods, closed }) => (
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
