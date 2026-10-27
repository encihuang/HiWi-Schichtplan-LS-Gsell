import { addSpecialTask, assignSpecialTask, deleteSpecialTask, setSpecialTaskRepeat, toggleSpecialTask } from '@/app/actions'
import { repeatText, type Period, type SpecialTask } from '@/lib/data'
import { formatDateTime } from '@/lib/dates'
import { SlotButton, SubmitButton, type SlotState } from './slot-button'
import { StaffSelect, type Person } from './staff-select'
import { RepeatFields } from './repeat-fields'

/**
 * Sonderaufgaben ohne festes Datum (z. B. Vorlesungspodcast) oder wiederkehrend (z. B. jeden Montag Post holen).
 * Wiederkehrende erscheinen an ihren Tagen in Übersicht, Kalender-Abo und Erinnerungen. Zählen nicht in die Berechnung.
 */
export function SpecialTasks({
  period, tasks, names, meId, canEditOthers, people,
}: {
  period: Period
  tasks: SpecialTask[]
  names: Record<number, string>
  meId: number
  canEditOthers: boolean
  people: Person[]
}) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-lmu-darker">Sonderaufgaben</h2>
      <p className="text-sm text-neutral-600">
        Aufgaben ohne festen Tag (z. B. Vorlesungspodcast) oder regelmäßig wiederkehrend (z. B. jeden Montag Post holen,
        jeden Monat am 1. Bestellung). Wiederkehrende erscheinen an ihren Tagen in der Übersicht, im Kalender-Abo und in
        den Erinnerungen. Sonderaufgaben fließen nicht in die Berechnung ein.
      </p>

      {tasks.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100">
          {tasks.map((t) => {
            const state: SlotState = !t.staff_id
              ? 'free'
              : t.staff_id === meId
                ? 'mine'
                : canEditOthers
                  ? 'taken-editable'
                  : 'taken'
            return (
              <li key={t.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t.name}</span>
                    {t.repeat !== 'none' && (
                      <span className="rounded bg-lmu-light px-1.5 py-0.5 text-xs text-lmu-darker">↻ {repeatText(t)}</span>
                    )}
                  </div>
                  {t.note && <div className="text-sm text-neutral-600">{t.note}</div>}
                  <details className="mt-1 text-sm">
                    <summary className="cursor-pointer text-xs text-lmu hover:underline">Wiederholung ändern</summary>
                    <form action={setSpecialTaskRepeat} className="mt-2 flex flex-wrap items-end gap-3 rounded bg-neutral-50 p-2">
                      <input type="hidden" name="task" value={t.id} />
                      <RepeatFields value={t.repeat} weekday={t.weekday} dayOfMonth={t.day_of_month} start={t.start_date} time={t.time} />
                      <SubmitButton className="rounded bg-lmu px-3 py-1.5 font-medium text-white hover:bg-lmu-dark">Speichern</SubmitButton>
                    </form>
                  </details>
                  {t.updated_by && t.updated_at && (
                    <div className="text-xs text-neutral-400">
                      zuletzt geändert von {t.updated_by} am {formatDateTime(t.updated_at)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {canEditOthers ? (
                    <StaffSelect
                      action={assignSpecialTask}
                      fields={{ task: t.id }}
                      value={t.staff_id}
                      people={people}
                      names={names}
                      label={`Sonderaufgabe „${t.name}“`}
                      className="w-44"
                    />
                  ) : (
                    <form action={toggleSpecialTask} className="w-44">
                      <input type="hidden" name="task" value={t.id} />
                      <SlotButton state={state} className="py-2 font-semibold">
                        {t.staff_id ? names[t.staff_id] : '+ übernehmen'}
                      </SlotButton>
                    </form>
                  )}
                  <form action={deleteSpecialTask}>
                    <input type="hidden" name="task" value={t.id} />
                    <SubmitButton className="px-2 text-xs text-red-700 hover:underline" title={`„${t.name}“ löschen`}>
                      löschen
                    </SubmitButton>
                  </form>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form action={addSpecialTask} className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-lmu-lighter p-3 text-sm">
        <input type="hidden" name="period" value={period.id} />
        <label className="grid min-w-0 flex-1 basis-48 gap-1">
          <span className="text-xs text-neutral-600">Sonderaufgabe</span>
          <input name="name" required placeholder="z. B. Vorlesungspodcast" className="rounded border border-neutral-300 px-2 py-1.5" />
        </label>
        <label className="grid min-w-0 flex-[2] basis-56 gap-1">
          <span className="text-xs text-neutral-600">Notiz (optional)</span>
          <input name="note" placeholder="z. B. Schnitt und Upload bis Freitag" className="rounded border border-neutral-300 px-2 py-1.5" />
        </label>
        <RepeatFields />
        <label className="flex items-center gap-1.5 py-1.5">
          <input type="checkbox" name="take" className="accent-lmu" /> selbst übernehmen
        </label>
        <SubmitButton className="rounded bg-lmu px-3 py-1.5 font-medium text-white hover:bg-lmu-dark">Hinzufügen</SubmitButton>
      </form>
    </div>
  )
}
