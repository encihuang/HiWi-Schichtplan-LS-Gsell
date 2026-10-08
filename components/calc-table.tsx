import type { CalcRow } from '@/lib/data'

const n = (v: number, digits = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export function CalcTable({ rows, lecture, meId }: { rows: CalcRow[]; lecture: boolean; meId?: number }) {
  if (!rows.length) {
    return <p className="mt-2 text-sm text-neutral-500">Keine aktiven Hilfskräfte in diesem Zeitraum.</p>
  }
  const sum = (f: (r: CalcRow) => number) => rows.reduce((a, r) => a + f(r), 0)
  return (
    <div className="mt-2 overflow-x-auto rounded-lg bg-white shadow-sm">
      <table className="w-full text-sm tabular-nums">
        <thead className="bg-lmu text-white">
          <tr className="text-right [&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
            <th className="text-left">Name</th>
            <th>h/Woche</th>
            {!lecture && <th>Werktage</th>}
            <th>Anteil</th>
            <th>{lecture ? 'Soll Tage/Woche' : 'Soll Tage'}</th>
            <th>Eingeteilt</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.staff.id}
              className={`text-right border-t border-neutral-100 [&>td]:px-3 [&>td]:py-1.5 ${r.staff.id === meId ? 'bg-lmu-lighter font-semibold' : ''}`}
            >
              <td className="text-left">{r.staff.name}</td>
              <td>{n(r.staff.hours_per_week, 0)}</td>
              {!lecture && <td>{r.workdays}</td>}
              <td>{n(r.share * 100)} %</td>
              <td>{n(r.target)}</td>
              <td>{r.assigned}</td>
              <td className={r.delta < -0.5 ? 'text-red-700' : r.delta > 0.5 ? 'text-amber-700' : 'text-lmu-dark'}>
                {r.delta > 0 ? '+' : ''}
                {n(r.delta)}
              </td>
            </tr>
          ))}
          <tr className="text-right border-t-2 border-neutral-300 font-semibold [&>td]:px-3 [&>td]:py-1.5">
            <td className="text-left">Summe</td>
            <td>{n(sum((r) => r.staff.hours_per_week), 0)}</td>
            {!lecture && <td />}
            <td>100 %</td>
            <td>{n(sum((r) => r.target))}</td>
            <td>{sum((r) => r.assigned)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  )
}
