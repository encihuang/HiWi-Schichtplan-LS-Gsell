import { addSpecialTask, deleteSpecialTask, toggleSpecialTask } from '@/app/actions'
import type { Period, SpecialTask } from '@/lib/data'
import { formatDateTime } from '@/lib/dates'
import { SlotButton, SubmitButton, type SlotState } from './slot-button'

/** Sonderaufgaben ohne festes Datum, z. B. Vorlesungspodcast. Zählen nicht in die Berechnung. */
export function SpecialTasks({
  period, tasks, names, meId, canEditOthers,
}: {
  period: Period
  tasks: SpecialTask[]
  names: Record<number, string>
  meId: number
  canEditOthers: boolean
}) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-lmu-darker">Sonderaufgaben</h2>
      <p className="text-sm text-neutral-600">
        Aufgaben ohne festen Tag, z. B. Vorlesungspodcast. Sie fließen nicht in die Berechnung ein.
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
                  <div className="font-semibold">{t.name}</div>
                  {t.note && <div className="text-sm text-neutral-600">{t.note}</div>}
                  {t.updated_by && t.updated_at && (
                    <div className="text-xs text-neutral-400">
                      zuletzt geändert von {t.updated_by} am {formatDateTime(t.updated_at)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <form action={toggleSpecialTask} className="w-44">
                    <input type="hidden" name="task" value={t.id} />
                    <SlotButton state={state} className="py-2 font-semibold">
                      {t.staff_id ? names[t.staff_id] : '+ übernehmen'}
                    </SlotButton>
                  </form>
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
        <label className="flex items-center gap-1.5 py-1.5">
          <input type="checkbox" name="take" className="accent-lmu" /> selbst übernehmen
        </label>
        <SubmitButton className="rounded bg-lmu px-3 py-1.5 font-medium text-white hover:bg-lmu-dark">Hinzufügen</SubmitButton>
      </form>
    </div>
  )
}
