import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  calcDaily, calcWeekly, getYear, listClosedDays, listDaily, listLog, listPeriods, listStaff, listWeekly,
} from '@/lib/data'
import { canEditOthers, currentStaff } from '@/lib/session'
import { formatDate, formatDateTime, isLecture, PERIOD_LABELS, todayIso, yearLabel } from '@/lib/dates'
import { WeeklyPlan } from '@/components/weekly-plan'
import { DailyPlan } from '@/components/daily-plan'
import { CalcTable } from '@/components/calc-table'

export const dynamic = 'force-dynamic'

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ yearId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const me = await currentStaff()
  if (!me) redirect('/')
  const { yearId } = await params
  const { tab } = await searchParams
  const year = await getYear(Number(yearId))
  if (!year) notFound()

  const periods = await listPeriods(year.id)
  const today = todayIso()
  const period =
    periods.find((p) => p.kind === tab) ??
    periods.find((p) => p.start_date <= today && p.end_date >= today) ??
    periods.find((p) => p.end_date >= today) ??
    periods[0]
  if (!period) notFound()

  const [staff, closed, log, others] = await Promise.all([
    listStaff(),
    listClosedDays(year.id),
    listLog(period.id, 10),
    canEditOthers(),
  ])
  const lecture = isLecture(period.kind)
  const weekly = lecture ? await listWeekly(period.id) : []
  const daily = lecture ? [] : await listDaily(period.id)
  const active = staff.filter((s) => s.active)
  const calc = lecture ? calcWeekly(period, active, closed, weekly) : calcDaily(period, active, closed, daily)
  const names = Object.fromEntries(staff.map((s) => [s.id, s.name]))
  const last = log[0]

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold text-lmu-darker">
          <Link href="/plan" className="text-neutral-400 hover:text-lmu font-normal">Studienjahre</Link>
          <span className="text-neutral-300 mx-2">/</span>
          {yearLabel(year.start_year)}
        </h1>
        <div className="flex gap-2 text-sm no-print">
          <a href={`/export/${period.id}/pdf`} className="rounded border border-lmu px-3 py-1.5 text-lmu-darker hover:bg-lmu-light">
            PDF herunterladen
          </a>
          <a href={`/export/${period.id}/xlsx`} className="rounded border border-lmu px-3 py-1.5 text-lmu-darker hover:bg-lmu-light">
            Excel herunterladen
          </a>
        </div>
      </div>

      <nav className="mt-4 flex flex-wrap gap-1 border-b border-neutral-200">
        {periods.map((p) => (
          <Link
            key={p.id}
            href={`/plan/${year.id}?tab=${p.kind}`}
            className={`-mb-px rounded-t px-4 py-2 text-sm font-medium border-b-4 ${
              p.id === period.id
                ? 'border-lmu text-lmu-darker bg-white'
                : 'border-transparent text-neutral-600 hover:text-lmu-darker hover:bg-white/60'
            }`}
          >
            {PERIOD_LABELS[p.kind]}
            <span className="block text-xs font-normal text-neutral-500 tabular-nums">
              {formatDate(p.start_date)} – {formatDate(p.end_date)}
            </span>
          </Link>
        ))}
      </nav>

      <p className="mt-3 text-sm text-neutral-600">
        {last ? (
          <>
            Zuletzt geändert von <strong>{last.actor}</strong> am {formatDateTime(last.at)}
          </>
        ) : (
          'Noch keine Änderungen.'
        )}
      </p>

      <section className="mt-4">
        {lecture ? (
          <WeeklyPlan period={period} slots={weekly} names={names} meId={me.id} canEditOthers={others} />
        ) : (
          <DailyPlan period={period} slots={daily} closed={closed} names={names} meId={me.id} canEditOthers={others} />
        )}
      </section>

      <div className="mt-8 space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-lmu-darker">Berechnung</h2>
          <CalcTable calc={calc} period={period} lecture={lecture} meId={me.id} />
        </section>
        <section>
          <h2 className="text-lg font-semibold text-lmu-darker">Letzte Änderungen</h2>
          <ul className="mt-2 max-w-2xl divide-y divide-neutral-200 rounded-lg bg-white text-sm shadow-sm">
            {log.length === 0 && <li className="p-3 text-neutral-500">Noch keine.</li>}
            {log.map((l, i) => (
              <li key={i} className="p-3">
                <span className="font-medium">{l.actor}</span>: {l.message}
                <span className="block text-xs text-neutral-500">{formatDateTime(l.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
