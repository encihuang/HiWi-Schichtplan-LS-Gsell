import { toggleWeekly } from '@/app/actions'
import { ROLE_LABELS, type Period, type WeeklySlot } from '@/lib/data'
import { formatDateTime, WEEKDAYS } from '@/lib/dates'
import { SlotButton, type SlotState } from './slot-button'

const ROLES = ['ap', 'support'] as const

export function WeeklyPlan({
  period, slots, names, meId, canEditOthers,
}: {
  period: Period
  slots: WeeklySlot[]
  names: Record<number, string>
  meId: number
  canEditOthers: boolean
}) {
  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow-sm">
      <p className="px-4 pt-3 text-sm text-neutral-600">
        Wöchentlicher Dienst während der Vorlesungszeit. Freies Feld anklicken zum Übernehmen, eigenes Feld zum Freigeben.
      </p>
      <table className="w-full min-w-[640px] border-separate border-spacing-2">
        <thead>
          <tr>
            <th className="w-36" />
            {WEEKDAYS.map((d) => (
              <th key={d} className="rounded bg-lmu px-2 py-2 text-sm font-semibold uppercase tracking-wide text-white">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROLES.map((role) => (
            <tr key={role}>
              <th className="text-left text-sm font-semibold text-lmu-darker">{ROLE_LABELS[role]}</th>
              {WEEKDAYS.map((_, i) => {
                const day = i + 1
                const slot = slots.find((s) => s.weekday === day && s.role === role)
                const state: SlotState = !slot
                  ? 'free'
                  : slot.staff_id === meId
                    ? 'mine'
                    : canEditOthers
                      ? 'taken-editable'
                      : 'taken'
                return (
                  <td key={day}>
                    <form action={toggleWeekly}>
                      <input type="hidden" name="period" value={period.id} />
                      <input type="hidden" name="weekday" value={day} />
                      <input type="hidden" name="role" value={role} />
                      <SlotButton state={state} className="h-16">
                        {slot ? (
                          <>
                            <span className="block font-semibold">{names[slot.staff_id]}</span>
                            <span className="block text-[11px] opacity-75">
                              {slot.updated_by} · {formatDateTime(slot.updated_at)}
                            </span>
                          </>
                        ) : (
                          '+ übernehmen'
                        )}
                      </SlotButton>
                    </form>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
