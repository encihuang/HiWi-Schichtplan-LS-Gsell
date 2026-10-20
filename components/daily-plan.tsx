import { assignDaily, toggleDaily } from '@/app/actions'
import type { Appointment, ClosedDay, DailySlot, Period } from '@/lib/data'
import { addDays, eachDay, formatDate, formatDateTime, MONTHS, WEEKDAYS_SHORT, weekday } from '@/lib/dates'
import { SlotButton, type SlotState } from './slot-button'
import { StaffSelect, type Person } from './staff-select'
import { appointmentsByDate, DayAppointments } from './day-appointments'

/** Kalender Mo–Fr je Monat; jeder Werktag hat eine Person. */
export function DailyPlan({
  period, slots, closed, appointments, names, meId, canEditOthers, people,
}: {
  period: Period
  slots: DailySlot[]
  closed: ClosedDay[]
  appointments: Appointment[]
  names: Record<number, string>
  meId: number
  canEditOthers: boolean
  people: Person[]
}) {
  const bySlot = new Map(slots.map((s) => [s.date, s]))
  const byClosed = new Map(closed.map((c) => [c.date, c.name]))
  const byDate = appointmentsByDate(appointments)
  const days = eachDay(period.start_date, period.end_date)
  const months = [...new Set(days.map((d) => d.slice(0, 7)))]

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-600">
        Ein Dienst pro Werktag in der vorlesungsfreien Zeit. Freien Tag anklicken zum Übernehmen, eigenen Tag zum Freigeben.
      </p>
      {months.map((m) => {
        const inMonth = days.filter((d) => d.startsWith(m) && weekday(d) <= 5)
        if (!inMonth.length) return null
        // Wochen (Montage), die in diesem Monat Werktage haben
        const mondays = [...new Set(inMonth.map((d) => addDays(d, 1 - weekday(d))))]
        const [y, mo] = m.split('-').map(Number)
        return (
          <div key={m} className="rounded-lg bg-white p-3 shadow-sm">
            <h3 className="px-1 pb-2 font-semibold text-lmu-darker">
              {MONTHS[mo - 1]} {y}
            </h3>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
              {WEEKDAYS_SHORT.slice(0, 5).map((d) => (
                <div key={d} className="hidden rounded bg-lmu py-1 text-center text-xs font-semibold uppercase text-white sm:block">
                  {d}
                </div>
              ))}
              {mondays.flatMap((mon) =>
                [0, 1, 2, 3, 4].map((i) => {
                  const d = addDays(mon, i)
                  const inside = d.startsWith(m) && d >= period.start_date && d <= period.end_date
                  if (!inside) return <div key={d} className="hidden sm:block" />
                  const holiday = byClosed.get(d)
                  const label = (
                    <span className="flex min-w-0 flex-col items-start sm:items-stretch">
                      <span className="text-xs tabular-nums opacity-70">
                        <span className="sm:hidden">{WEEKDAYS_SHORT[i]}, </span>
                        {formatDate(d).slice(0, 6)}
                      </span>
                      <DayAppointments items={byDate.get(d) ?? []} />
                    </span>
                  )
                  if (holiday) {
                    return (
                      <div key={d} className="flex min-h-12 items-center justify-between rounded border-2 border-transparent bg-neutral-50 px-3 py-1 text-neutral-400 sm:min-h-16 sm:flex-col sm:justify-center sm:px-1 sm:text-center">
                        {label}
                        <span className="text-[11px] leading-tight">{holiday}</span>
                      </div>
                    )
                  }
                  const slot = bySlot.get(d)
                  if (canEditOthers) {
                    return (
                      <div key={d} className="flex min-h-12 items-center justify-between gap-2 rounded border border-neutral-200 px-2 py-1 sm:min-h-16 sm:flex-col sm:items-stretch sm:justify-center sm:gap-1">
                        {label}
                        <StaffSelect
                          action={assignDaily}
                          fields={{ period: period.id, date: d }}
                          value={slot?.staff_id ?? null}
                          people={people}
                          names={names}
                          label={`Dienst am ${formatDate(d)}`}
                          className="min-w-0 flex-1 sm:flex-none"
                        />
                      </div>
                    )
                  }
                  const state: SlotState = !slot
                    ? 'free'
                    : slot.staff_id === meId
                      ? 'mine'
                      : canEditOthers
                        ? 'taken-editable'
                        : 'taken'
                  return (
                    <form key={d} action={toggleDaily}>
                      <input type="hidden" name="period" value={period.id} />
                      <input type="hidden" name="date" value={d} />
                      <SlotButton
                        state={state}
                        className="flex min-h-12 items-center justify-between px-3 py-1 leading-tight sm:min-h-16 sm:flex-col sm:justify-center sm:px-2"
                      >
                        {label}
                        <span
                          className="font-semibold truncate max-w-full"
                          title={slot ? `${slot.updated_by}, ${formatDateTime(slot.updated_at)}` : undefined}
                        >
                          {slot ? names[slot.staff_id] : '+'}
                        </span>
                      </SlotButton>
                    </form>
                  )
                }),
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
