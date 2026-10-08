import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listPeriods, listYears } from '@/lib/data'
import { currentStaff } from '@/lib/session'
import { formatDate, PERIOD_LABELS, todayIso, yearLabel } from '@/lib/dates'
import { addYear } from '../actions'

export const dynamic = 'force-dynamic'

export default async function YearPicker() {
  const me = await currentStaff()
  if (!me) redirect('/')
  const years = await listYears()
  const periods = await Promise.all(years.map((y) => listPeriods(y.id)))
  const today = todayIso()
  const next = years.length ? years[years.length - 1].start_year + 1 : null

  return (
    <div>
      <h1 className="text-2xl font-bold text-lmu-darker">Hallo {me.name}, welches Studienjahr?</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {years
          .map((y, i) => ({ y, ps: periods[i] }))
          .reverse()
          .map(({ y, ps }) => {
            const current = ps.some((p) => p.start_date <= today && p.end_date >= today)
            return (
              <Link
                key={y.id}
                href={`/plan/${y.id}`}
                className={`block rounded-lg bg-white p-5 shadow-sm border-2 hover:border-lmu transition ${
                  current ? 'border-lmu' : 'border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl font-bold text-lmu-darker">Studienjahr {yearLabel(y.start_year)}</span>
                  {current && <span className="text-xs rounded bg-lmu px-2 py-0.5 text-white">aktuell</span>}
                </div>
                <ul className="mt-3 space-y-1 text-sm text-neutral-600">
                  {ps.map((p) => (
                    <li key={p.id} className="flex justify-between gap-2">
                      <span>{PERIOD_LABELS[p.kind]}</span>
                      <span className="tabular-nums whitespace-nowrap">
                        {formatDate(p.start_date).slice(0, 6)}–{formatDate(p.end_date)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Link>
            )
          })}
        <form action={addYear}>
          <button className="h-full min-h-40 w-full rounded-lg border-2 border-dashed border-lmu bg-lmu-lighter p-5 text-lmu-darker hover:bg-lmu-light">
            <span className="block text-3xl leading-none">+</span>
            <span className="mt-2 block font-semibold">
              {next ? `Studienjahr ${yearLabel(next)} hinzufügen` : 'Aktuelles Studienjahr anlegen'}
            </span>
            <span className="mt-1 block text-sm text-neutral-600">
              Wintersemester, Sommersemester und vorlesungsfreie Zeiten werden automatisch nach den
              LMU-Vorlesungszeiten angelegt.
            </span>
          </button>
        </form>
      </div>
    </div>
  )
}
