import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  calcDaily, calcWeekly, getYear, listAppointments, listAvailability, listClosedDays, listDaily, listDuties, listLectures, listLog,
  listExceptions, listExtras, listPeriods, listSpecialTasks, listStaff,
} from '@/lib/data'
import { canEditOthers, currentStaff } from '@/lib/session'
import { formatDate, formatDateTime, isLecture, PERIOD_LABELS, todayIso, yearLabel } from '@/lib/dates'
import { WeeklyPlan } from '@/components/weekly-plan'
import { DateExceptions } from '@/components/date-exceptions'
import { SpecialTasks } from '@/components/special-tasks'
import { Appointments } from '@/components/appointments'
import { DailyPlan } from '@/components/daily-plan'
import { CalcTable } from '@/components/calc-table'
import { LinkPending } from '@/components/link-pending'
import { SubmitButton } from '@/components/slot-button'
import { setPlanningMode } from '@/app/actions'

export const dynamic = 'force-dynamic'

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ yearId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const [{ yearId }, { tab }] = await Promise.all([params, searchParams])
  // Parallel laden: jede Abfrage ist ein eigener Roundtrip zur Datenbank.
  const [me, year, periods] = await Promise.all([
    currentStaff(), getYear(Number(yearId)), listPeriods(Number(yearId)),
  ])
  if (!me) redirect('/')
  if (!year) notFound()

  const today = todayIso()
  const period =
    periods.find((p) => p.kind === tab) ??
    periods.find((p) => p.start_date <= today && p.end_date >= today) ??
    periods.find((p) => p.end_date >= today) ??
    periods[0]
  if (!period) notFound()

  const lecture = isLecture(period.kind)
  const none = Promise.resolve([])
  const [staff, closed, log, others, specialTasks, appointments, weekly, availability, lectures, exceptions, extras, daily] =
    await Promise.all([
      listStaff(),
      listClosedDays(year.id),
      listLog(period.id, 10),
      canEditOthers(),
      listSpecialTasks(period.id),
      listAppointments(period.start_date, period.end_date),
      lecture ? listDuties(period.id) : none,
      lecture ? listAvailability(period.id) : none,
      lecture ? listLectures(period.id) : none,
      lecture ? listExceptions(period.id) : none,
      lecture ? listExtras(period.id) : none,
      lecture ? none : listDaily(period.id),
    ])
  const active = staff.filter((s) => s.active)
  const calc = lecture ? calcWeekly(period, active, closed, weekly, exceptions, extras) : calcDaily(period, active, closed, daily)
  const names = Object.fromEntries(staff.map((s) => [s.id, s.name]))
  const people = active.map((s) => ({ id: s.id, name: s.name }))
  const here = `/plan/${year.id}?tab=${period.kind}`
  const last = log[0]

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-lmu-darker">
          <Link href="/plan" className="text-neutral-400 hover:text-lmu font-normal">Studienjahre</Link>
          <span className="text-neutral-300 mx-2">/</span>
          {yearLabel(year.start_year)}
        </h1>
        <div className="flex flex-wrap gap-2 text-sm no-print">
          <form action={setPlanningMode}>
            <input type="hidden" name="on" value={others ? '' : '1'} />
            <input type="hidden" name="back" value={here} />
            <SubmitButton
              className={`rounded border px-3 py-1.5 font-medium ${
                others ? 'border-amber-500 bg-amber-400 text-amber-950 hover:bg-amber-300' : 'border-lmu text-lmu-darker hover:bg-lmu-light'
              }`}
            >
              {others ? 'Planungsmodus beenden' : 'Planungsmodus'}
            </SubmitButton>
          </form>
          <a href={`/export/${period.id}/pdf`} className="rounded border border-lmu px-3 py-1.5 text-lmu-darker hover:bg-lmu-light">
            PDF herunterladen
          </a>
          <a href={`/export/${period.id}/xlsx`} className="rounded border border-lmu px-3 py-1.5 text-lmu-darker hover:bg-lmu-light">
            Excel herunterladen
          </a>
          <Link href="/kalender" className="rounded border border-lmu px-3 py-1.5 text-lmu-darker hover:bg-lmu-light">
            Kalender abonnieren
          </Link>
        </div>
      </div>

      <nav className="mt-4 grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:gap-1 sm:border-b sm:border-neutral-200">
        {periods.map((p) => (
          <Link
            key={p.id}
            href={`/plan/${year.id}?tab=${p.kind}`}
            className={`rounded px-3 py-2 text-xs font-medium border-2 sm:-mb-px sm:rounded-b-none sm:border-0 sm:border-b-4 sm:px-4 sm:text-sm ${
              p.id === period.id
                ? 'border-lmu text-lmu-darker bg-white'
                : 'border-transparent bg-white/60 text-neutral-600 hover:text-lmu-darker sm:bg-transparent sm:hover:bg-white/60'
            }`}
          >
            <LinkPending>
              {PERIOD_LABELS[p.kind]}
              <span className="block text-[11px] sm:text-xs font-normal text-neutral-500 tabular-nums">
                {formatDate(p.start_date)} – {formatDate(p.end_date)}
              </span>
            </LinkPending>
          </Link>
        ))}
      </nav>

      {others && (
        <div className="mt-3 rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-2.5 text-sm text-amber-950" role="status">
          <strong>Planungsmodus aktiv:</strong> Du kannst Verfügbarkeiten und Schichten aller Hilfskräfte bearbeiten.
          Änderungen werden mit deinem Namen im Verlauf gespeichert.
        </div>
      )}

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
          <WeeklyPlan
            period={period}
            staff={calc.rows.map((r) => r.staff)}
            duties={weekly}
            availability={availability}
            lectures={lectures}
            calendar={
              <DateExceptions
                period={period}
                duties={weekly}
                exceptions={exceptions}
                extras={extras}
                closed={closed}
                names={names}
                meId={me.id}
                planning={others}
                people={people}
              />
            }
            names={names}
            meId={me.id}
            canEditOthers={others}
            people={people}
          />
        ) : (
          <DailyPlan period={period} slots={daily} closed={closed} names={names} meId={me.id} canEditOthers={others} people={people} />
        )}
      </section>

      <section className="mt-6 empty:hidden">
        <Appointments period={period} appointments={appointments} planning={others} />
      </section>

      <section className="mt-6">
        <SpecialTasks period={period} tasks={specialTasks} names={names} meId={me.id} canEditOthers={others} people={people} />
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
