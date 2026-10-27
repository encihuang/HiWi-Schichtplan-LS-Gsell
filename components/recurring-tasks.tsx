import { addRecurringTask, assignRecurring, deleteSpecialTask, setSpecialTaskRepeat, toggleRecurring } from '@/app/actions'
import { occurrences, repeatText, type ClosedDay, type Period, type RecurringTake, type SpecialTask } from '@/lib/data'
import { addDays, formatDate, todayIso, weekday, WEEKDAYS_SHORT } from '@/lib/dates'
import { RepeatFields } from './repeat-fields'
import { SlotButton, SubmitButton, type SlotState } from './slot-button'
import { StaffSelect, type Person } from './staff-select'

const input = 'rounded border border-neutral-300 px-2 py-1.5'

/** Ein Termin: übernehmen/abgeben bzw. im Planungsmodus Person auswählen */
function Occurrence({ task, date, take, names, meId, canEditOthers, people, today }: {
  task: SpecialTask
  date: string
  take?: RecurringTake
  names: Record<number, string>
  meId: number
  canEditOthers: boolean
  people: Person[]
  today: string
}) {
  const label = `${WEEKDAYS_SHORT[weekday(date) - 1]} ${formatDate(date).slice(0, 6)}`
  const state: SlotState = !take ? 'free' : take.staff_id === meId ? 'mine' : canEditOthers ? 'taken-editable' : 'taken'
  return (
    <li className={`grid gap-1 ${date < today ? 'opacity-50' : ''}`}>
      <span className={`text-xs tabular-nums ${date === today ? 'font-semibold text-lmu-darker' : 'text-neutral-500'}`}>{label}</span>
      {canEditOthers ? (
        <StaffSelect
          action={assignRecurring}
          fields={{ task: task.id, date }}
          value={take?.staff_id ?? null}
          people={people}
          names={names}
          label={`„${task.name}“ am ${formatDate(date)}`}
        />
      ) : (
        <form action={toggleRecurring}>
          <input type="hidden" name="task" value={task.id} />
          <input type="hidden" name="date" value={date} />
          <SlotButton state={state} className="truncate py-1.5 text-xs font-semibold">
            {take ? names[take.staff_id] ?? '?' : '+ übernehmen'}
          </SlotButton>
        </form>
      )}
    </li>
  )
}

/**
 * Wiederkehrende Aufgaben (z. B. jeden Montag Post holen): jeder Termin wird einzeln übernommen – jede Woche kann
 * jemand anderes. Erscheinen an ihren Tagen in Übersicht, Kalender-Abo und Erinnerungen; zählen nicht in die Berechnung.
 */
export function RecurringTasks({ period, tasks, takes, closed, names, meId, canEditOthers, people }: {
  period: Period
  tasks: SpecialTask[]
  takes: RecurringTake[]
  closed: ClosedDay[]
  names: Record<number, string>
  meId: number
  canEditOthers: boolean
  people: Person[]
}) {
  const today = todayIso()
  // vergangene Termine nur auf Wunsch (ab Montag dieser Woche anzeigen)
  const from = addDays(today, 1 - Math.min(weekday(today), 5))
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-lmu-darker">Wiederkehrende Aufgaben</h2>
      <p className="text-sm text-neutral-600">
        Regelmäßige Aufgaben, z. B. jeden Montag Post holen oder jeden Monat am 1. eine Bestellung. Jeder Termin wird
        einzeln übernommen – jede Woche kann jemand anderes. Sie erscheinen an ihren Tagen in der Übersicht, im
        Kalender-Abo und in den Erinnerungen und fließen nicht in die Berechnung ein.
      </p>

      {tasks.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100">
          {tasks.map((t) => {
            const dates = occurrences(t, period, closed)
            const upcoming = dates.filter((d) => d >= from)
            const past = dates.filter((d) => d < from)
            const byDate = new Map(takes.filter((x) => x.task_id === t.id).map((x) => [x.date, x]))
            const open = upcoming.filter((d) => !byDate.has(d)).length
            const props = { task: t, names, meId, canEditOthers, people, today }
            const grid = 'mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'
            return (
              <li key={t.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{t.name}</span>
                  <span className="rounded bg-lmu-light px-1.5 py-0.5 text-xs text-lmu-darker">↻ {repeatText(t)}</span>
                  {upcoming.length > 0 && (
                    <span className={`text-xs ${open ? 'font-semibold text-amber-700' : 'text-neutral-500'}`}>
                      {open ? `${open} von ${upcoming.length} Terminen noch offen` : 'alle kommenden Termine übernommen'}
                    </span>
                  )}
                  <form action={deleteSpecialTask} className="ml-auto">
                    <input type="hidden" name="task" value={t.id} />
                    <SubmitButton className="px-2 text-xs text-red-700 hover:underline" title={`„${t.name}“ mit allen Terminen löschen`}>
                      löschen
                    </SubmitButton>
                  </form>
                </div>
                {t.note && <div className="text-sm text-neutral-600">{t.note}</div>}
                {upcoming.length === 0 ? (
                  <p className="mt-2 text-sm text-neutral-500">Keine kommenden Termine in diesem Zeitraum.</p>
                ) : (
                  <ul className={grid}>
                    {upcoming.map((d) => <Occurrence key={d} date={d} take={byDate.get(d)} {...props} />)}
                  </ul>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 text-xs">
                  {past.length > 0 && (
                    <details className="w-full">
                      <summary className="cursor-pointer text-lmu hover:underline">Frühere Termine ({past.length})</summary>
                      <ul className={grid}>
                        {past.map((d) => <Occurrence key={d} date={d} take={byDate.get(d)} {...props} />)}
                      </ul>
                    </details>
                  )}
                  <details className="w-full">
                    <summary className="cursor-pointer text-lmu hover:underline">Wiederholung ändern</summary>
                    <form action={setSpecialTaskRepeat} className="mt-2 flex flex-wrap items-end gap-3 rounded bg-neutral-50 p-2 text-sm">
                      <input type="hidden" name="task" value={t.id} />
                      <RepeatFields value={t.repeat} weekday={t.weekday} dayOfMonth={t.day_of_month} start={t.start_date} time={t.time} />
                      <SubmitButton className="rounded bg-lmu px-3 py-1.5 font-medium text-white hover:bg-lmu-dark">Speichern</SubmitButton>
                    </form>
                    <p className="mt-1 text-neutral-500">Übernahmen an Tagen, die dadurch wegfallen, werden gelöscht.</p>
                  </details>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form action={addRecurringTask} className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-lmu-lighter p-3 text-sm">
        <input type="hidden" name="period" value={period.id} />
        <label className="grid min-w-0 flex-1 basis-48 gap-1">
          <span className="text-xs text-neutral-600">Wiederkehrende Aufgabe</span>
          <input name="name" required placeholder="z. B. Post holen" className={input} />
        </label>
        <label className="grid min-w-0 flex-[2] basis-56 gap-1">
          <span className="text-xs text-neutral-600">Notiz (optional)</span>
          <input name="note" placeholder="z. B. Postfach im Erdgeschoss" className={input} />
        </label>
        <RepeatFields />
        <SubmitButton className="rounded bg-lmu px-3 py-1.5 font-medium text-white hover:bg-lmu-dark">Hinzufügen</SubmitButton>
      </form>
    </div>
  )
}
