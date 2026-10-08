import { redirect } from 'next/navigation'
import { listClosedDays, listLog, listPeriods, listStaff, listYears } from '@/lib/data'
import { isAdmin } from '@/lib/session'
import { formatDate, formatDateTime, LMU_VORLESUNGSZEITEN_URL, PERIOD_LABELS, yearLabel } from '@/lib/dates'
import {
  addClosedDay, addYear, deleteStaff, deleteYear, removeClosedDay, saveStaff, saveYearDates,
} from '../actions'

export const dynamic = 'force-dynamic'

const input = 'rounded border border-neutral-300 px-2 py-1.5 text-sm focus:outline-2 focus:outline-lmu'
const btn = 'rounded bg-lmu px-3 py-1.5 text-sm font-medium text-white hover:bg-lmu-dark'
const btnGhost = 'rounded px-3 py-1.5 text-sm text-red-700 hover:bg-red-50'

export default async function Settings() {
  if (!(await isAdmin())) redirect('/login?kind=admin&next=/einstellungen')
  const [staff, years, log] = await Promise.all([listStaff(), listYears(), listLog(null, 15)])
  const yearData = await Promise.all(
    years.map(async (y) => ({ y, periods: await listPeriods(y.id), closed: await listClosedDays(y.id) })),
  )

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold text-lmu-darker">Einstellungen</h1>

      {/* Hilfskräfte */}
      <section>
        <h2 className="text-lg font-semibold text-lmu-darker">Studentische Hilfskräfte</h2>
        <p className="text-sm text-neutral-600">
          Nur aktive Hilfskräfte erscheinen in der Auswahl „Wer bist du?“. Die Wochenstunden bestimmen den Soll-Anteil;
          Beginn und Ende (optional) begrenzen die Werktage in der vorlesungsfreien Zeit.
        </p>
        <div className="mt-3 overflow-x-auto rounded-lg bg-white shadow-sm">
          <div className="min-w-[920px] divide-y divide-neutral-100">
            <div className="grid grid-cols-[1.2fr_1.8fr_0.6fr_1fr_1fr_0.4fr_auto] gap-2 bg-lmu px-3 py-2 text-sm font-semibold text-white">
              <span>Name</span><span>E-Mail</span><span>h/Woche</span><span>Beginn</span><span>Ende</span><span>Aktiv</span><span className="w-40" />
            </div>
            {staff.map((s) => (
              <div key={s.id} className="flex items-center gap-2 px-3 py-2">
                <form action={saveStaff} className="grid flex-1 grid-cols-[1.2fr_1.8fr_0.6fr_1fr_1fr_0.4fr_auto] items-center gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <input name="name" defaultValue={s.name} required className={input} />
                  <input type="email" name="email" defaultValue={s.email} placeholder="name@campus.lmu.de" className={input} />
                  <input name="hours" defaultValue={s.hours_per_week} inputMode="decimal" className={input} />
                  <input type="date" name="start" defaultValue={s.start_date ?? ''} className={input} />
                  <input type="date" name="end" defaultValue={s.end_date ?? ''} className={input} />
                  <input type="checkbox" name="active" defaultChecked={s.active} className="h-5 w-5 accent-lmu" />
                  <button className={btn}>Speichern</button>
                </form>
                <form action={deleteStaff}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className={btnGhost} title="Löscht auch alle Schichten dieser Person">Löschen</button>
                </form>
              </div>
            ))}
            <form action={saveStaff} className="grid grid-cols-[1.2fr_1.8fr_0.6fr_1fr_1fr_0.4fr_auto] items-center gap-2 bg-lmu-lighter px-3 py-2">
              <input name="name" placeholder="Neue Hilfskraft" required className={input} />
              <input type="email" name="email" placeholder="E-Mail" className={input} />
              <input name="hours" placeholder="h" inputMode="decimal" className={input} />
              <input type="date" name="start" className={input} />
              <input type="date" name="end" className={input} />
              <span />
              <button className={`${btn} w-40`}>Hinzufügen</button>
            </form>
          </div>
        </div>
      </section>

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
                    <div key={p.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 text-sm">
                      <span>{PERIOD_LABELS[p.kind]}</span>
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
