import { toggleDaily } from '@/app/actions'
import type { ClosedDay, DailySlot, Period } from '@/lib/data'
import { addDays, eachDay, formatDate, formatDateTime, MONTHS, WEEKDAYS_SHORT, weekday } from '@/lib/dates'
import { SlotButton, type SlotState } from './slot-button'

/** Kalender Mo–Fr je Monat; jeder Werktag hat eine Person. */
export function DailyPlan({
  period, slots, closed, names, meId, canEditOthers,
}: {
  period: Period
  slots: DailySlot[]
  closed: ClosedDay[]
  names: Record<number, string>
  meId: number
  canEditOthers: boolean
}) {
  const bySlot = new Map(slots.map((s) => [s.date, s]))
  const byClosed = new Map(closed.map((c) => [c.date, c.name]))
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
            <div className="grid grid-cols-5 gap-1.5">
              {WEEKDAYS_SHORT.slice(0, 5).map((d) => (
                <div key={d} className="rounded bg-lmu py-1 text-center text-xs font-semibold uppercase text-white">
                  {d}
                </div>
              ))}
              {mondays.flatMap((mon) =>
                [0, 1, 2, 3, 4].map((i) => {
                  const d = addDays(mon, i)
                  const inside = d.startsWith(m) && d >= period.start_date && d <= period.end_date
                  if (!inside) return <div key={d} />
                  const holiday = byClosed.get(d)
                  const label = <span className="text-xs tabular-nums opacity-70">{formatDate(d).slice(0, 6)}</span>
                  if (holiday) {
                    return (
                      <div key={d} className="flex h-16 flex-col items-center justify-center rounded border-2 border-transparent bg-neutral-50 px-1 text-center text-neutral-400">
                        {label}
                        <span className="text-[11px] leading-tight">{holiday}</span>
                      </div>
                    )
                  }
                  const slot = bySlot.get(d)
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
                      <SlotButton state={state} className="flex h-16 flex-col items-center justify-center leading-tight">
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
