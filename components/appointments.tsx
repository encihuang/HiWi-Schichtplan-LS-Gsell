import { addAppointment, deleteAppointment } from '@/app/actions'
import type { Appointment, Period } from '@/lib/data'
import { formatDate, todayIso, WEEKDAYS_SHORT, weekday } from '@/lib/dates'
import { SubmitButton } from './slot-button'

/** Termine für alle Hilfskräfte (z. B. Teamsitzung). Anlegen und Löschen nur im Planungsmodus. */
export function Appointments({ period, appointments, planning }: {
  period: Period
  appointments: Appointment[]
  planning: boolean
}) {
  if (!planning && !appointments.length) return null
  const today = todayIso()
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-lmu-darker">Termine für alle</h2>
      <p className="text-sm text-neutral-600">
        Z. B. Klausurtermine, Teamsitzung oder Einführung – gilt für alle Hilfskräfte und erscheint auch in der Übersicht und im Kalender-Abo.
      </p>

      {appointments.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100">
          {appointments.map((a) => (
            <li key={a.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 ${a.date < today ? 'opacity-50' : ''}`}>
              <span className="w-32 shrink-0 text-sm font-semibold tabular-nums text-lmu-darker">
                {WEEKDAYS_SHORT[weekday(a.date) - 1]}, {formatDate(a.date)}
                {a.time && <span className="block text-xs font-normal text-neutral-500">{a.time}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{a.title}</span>
                {a.note && <span className="block text-sm text-neutral-600">{a.note}</span>}
              </span>
              {planning && (
                <form action={deleteAppointment}>
                  <input type="hidden" name="appointment" value={a.id} />
                  <SubmitButton className="px-2 text-xs text-red-700 hover:underline" title={`„${a.title}“ löschen`}>
                    löschen
                  </SubmitButton>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {planning && (
        <form action={addAppointment} className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-amber-50 p-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs text-neutral-600">Datum</span>
            <input
              type="date"
              name="date"
              required
              min={period.start_date}
              max={period.end_date}
              defaultValue={today >= period.start_date && today <= period.end_date ? today : period.start_date}
              className="rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-neutral-600">Uhrzeit (optional)</span>
            <input name="time" placeholder="z. B. 14–15 Uhr" className="w-32 rounded border border-neutral-300 px-2 py-1.5" />
          </label>
          <label className="grid min-w-0 flex-1 basis-48 gap-1">
            <span className="text-xs text-neutral-600">Termin</span>
            <input name="title" required placeholder="z. B. Klausur Zivilrecht II" className="rounded border border-neutral-300 px-2 py-1.5" />
          </label>
          <label className="grid min-w-0 flex-[2] basis-56 gap-1">
            <span className="text-xs text-neutral-600">Notiz (optional)</span>
            <input name="note" placeholder="z. B. Aufsicht, Raum A 120" className="rounded border border-neutral-300 px-2 py-1.5" />
          </label>
          <SubmitButton className="rounded bg-lmu px-3 py-1.5 font-medium text-white hover:bg-lmu-dark">Hinzufügen</SubmitButton>
        </form>
      )}
    </div>
  )
}
