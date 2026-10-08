import type { CalcResult, Period } from '@/lib/data'
import { formatDate, isWeekend, WEEKDAYS_SHORT, weekday } from '@/lib/dates'

const n = (v: number, digits = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-white p-3 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="text-xl font-bold text-lmu-darker tabular-nums">{value}</div>
      {sub && <div className="text-xs text-neutral-500">{sub}</div>}
    </div>
  )
}

export function CalcTable({ calc, period, lecture, meId }: { calc: CalcResult; period: Period; lecture: boolean; meId?: number }) {
  const { rows } = calc
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((a, r) => a + f(r), 0)
  const partial = (r: (typeof rows)[number]) => r.from !== period.start_date || r.to !== period.end_date

  return (
    <div className="mt-2 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Zeitraum" value={`${formatDate(period.start_date).slice(0, 6)}–${formatDate(period.end_date)}`} sub={`${n(calc.weeks)} Wochen`} />
        <Stat label="Werktage" value={calc.totalWorkdays} sub="Mo–Fr ohne Feiertage" />
        <Stat label="Feiertage an Werktagen" value={calc.closedWorkdays} />
        <Stat label="Wochenstunden gesamt" value={n(sum((r) => r.staff.hours_per_week), 0)} sub={`${rows.length} Hilfskräfte`} />
      </div>

      <div className="rounded-lg bg-white p-3 text-sm shadow-sm">
        <span className="font-semibold text-lmu-darker">Feiertage im Zeitraum: </span>
        {calc.holidays.length === 0 ? (
          <span className="text-neutral-500">keine</span>
        ) : (
          <ul className="mt-1 flex flex-wrap gap-2">
            {calc.holidays.map((h) => (
              <li
                key={h.date}
                className={`rounded px-2 py-0.5 ${isWeekend(h.date) ? 'bg-neutral-100 text-neutral-500' : 'bg-lmu-light text-lmu-darker'}`}
                title={isWeekend(h.date) ? 'fällt auf ein Wochenende' : undefined}
              >
                {WEEKDAYS_SHORT[weekday(h.date) - 1]}, {formatDate(h.date)} – {h.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!rows.length ? (
        <p className="text-sm text-neutral-500">Keine aktiven Hilfskräfte in diesem Zeitraum.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
          <table className="w-full text-sm tabular-nums whitespace-nowrap">
            <thead className="bg-lmu text-white">
              <tr className="text-right [&>th]:px-2 [&>th]:py-2 [&>th]:font-semibold">
                <th className="text-left">Name</th>
                <th>h/Woche</th>
                <th>Beginn</th>
                <th>Ende</th>
                <th>Werktage</th>
                <th title="Werktage × h/Woche ÷ 5">Tage gewichtet</th>
                <th>Anteil</th>
                <th title="Anteil × Werktage im Zeitraum">Soll Tage</th>
                <th>Soll gerundet</th>
                {lecture && <th>Soll/Woche</th>}
                {lecture && <th>Ist/Woche</th>}
                <th>Eingeteilt</th>
                <th>Δ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.staff.id}
                  className={`text-right border-t border-neutral-100 [&>td]:px-2 [&>td]:py-1.5 ${r.staff.id === meId ? 'bg-lmu-lighter font-semibold' : ''}`}
                >
                  <td className="text-left">{r.staff.name}</td>
                  <td>{n(r.staff.hours_per_week, 0)}</td>
                  <td className={partial(r) && r.from !== period.start_date ? 'text-amber-700' : ''}>{formatDate(r.from)}</td>
                  <td className={partial(r) && r.to !== period.end_date ? 'text-amber-700' : ''}>{formatDate(r.to)}</td>
                  <td>{r.workdays}</td>
                  <td>{n(r.weighted)}</td>
                  <td>{n(r.share * 100)} %</td>
                  <td>{n(r.target)}</td>
                  <td>{r.targetRounded}</td>
                  {lecture && <td>{n(r.perWeekTarget ?? 0)}</td>}
                  {lecture && <td>{r.perWeekAssigned}</td>}
                  <td>{r.assigned}</td>
                  <td className={r.delta < -0.5 ? 'text-red-700' : r.delta > 0.5 ? 'text-amber-700' : 'text-lmu-dark'}>
                    {r.delta > 0 ? '+' : ''}
                    {n(r.delta)}
                  </td>
                </tr>
              ))}
              <tr className="text-right border-t-2 border-neutral-300 font-semibold [&>td]:px-2 [&>td]:py-1.5">
                <td className="text-left">Summe</td>
                <td>{n(sum((r) => r.staff.hours_per_week), 0)}</td>
                <td />
                <td />
                <td>{sum((r) => r.workdays)}</td>
                <td>{n(sum((r) => r.weighted))}</td>
                <td>100 %</td>
                <td>{n(sum((r) => r.target))}</td>
                <td>{sum((r) => r.targetRounded)}</td>
                {lecture && <td>{n(sum((r) => r.perWeekTarget ?? 0))}</td>}
                {lecture && <td>{sum((r) => r.perWeekAssigned ?? 0)}</td>}
                <td>{sum((r) => r.assigned)}</td>
                <td>{n(sum((r) => r.delta))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
