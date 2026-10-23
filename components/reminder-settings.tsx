import { saveReminderTexts, testReminder } from '@/app/actions'
import type { Staff } from '@/lib/data'
import { REMINDER_OPTIONS, REMINDER_PLACEHOLDERS, type ReminderTexts } from '@/lib/reminder-shared'
import { SubmitButton } from './slot-button'

const input = 'w-full min-w-0 rounded border border-neutral-300 px-2 py-1.5 text-sm focus:outline-2 focus:outline-lmu'

/** Einstellungen: Erinnerung an Hilfskräfte vor ihrem Dienst (ein/aus je Person in der Personenliste) */
export function ReminderSettings({ texts, hiwis, status, defaultTo }: {
  texts: ReminderTexts
  hiwis: Staff[]
  status: string | null
  defaultTo: string
}) {
  const on = hiwis.filter((s) => s.reminder_days !== null)
  const label = (d: number | null) => REMINDER_OPTIONS.find(([v]) => v === d)?.[1] ?? ''
  return (
    <section>
      <h2 className="text-lg font-semibold text-lmu-darker">Erinnerung an Hilfskräfte vor dem Dienst</h2>
      <p className="text-sm text-neutral-600">
        Hilfskräfte bekommen vor ihrem Dienst eine E-Mail mit Dienst, Vorlesungen und Aufgaben des Tages – auch, wenn sie
        eine Vertretung übernommen haben. Ein- und ausschalten je Person oben in der Personenliste („Erinnerung“). Versand
        morgens gegen 7 Uhr über das Absender-Konto der automatischen E-Mails.
      </p>
      <div className="mt-3 space-y-4 rounded-lg bg-white p-4 shadow-sm">
        <div className="text-sm">
          <span className="font-semibold text-lmu-darker">Eingeschaltet: </span>
          {on.length ? (
            on.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ', '}
                {s.name} <span className="text-neutral-500">({label(s.reminder_days)})</span>
                {!s.email && <span className="font-semibold text-red-700"> – keine E-Mail hinterlegt</span>}
              </span>
            ))
          ) : (
            <span className="text-neutral-500">für niemanden</span>
          )}
        </div>

        <form action={saveReminderTexts} className="grid gap-3">
          <label className="grid gap-1 text-sm">
            Betreff
            <input name="subject" defaultValue={texts.subject} className={input} />
          </label>
          <label className="grid gap-1 text-sm">
            Text
            <textarea name="body" rows={10} defaultValue={texts.body} className={`${input} font-mono`} />
          </label>
          <p className="text-xs text-neutral-500">
            Platzhalter:{' '}
            {Object.entries(REMINDER_PLACEHOLDERS).map(([k, v], i) => (
              <span key={k}>
                {i > 0 && ' · '}
                <code>{`{${k}}`}</code> {v}
              </span>
            ))}
            . Leeres Feld = Standardtext.
          </p>
          <div>
            <SubmitButton className="rounded bg-lmu px-3 py-1.5 text-sm font-medium text-white hover:bg-lmu-dark">Text speichern</SubmitButton>
          </div>
        </form>

        <form action={testReminder} className="flex flex-wrap items-end gap-2 border-t border-neutral-100 pt-3 text-sm">
          <label className="grid gap-1">
            Test: nächste Erinnerung für
            <select name="staff" className={input}>
              {hiwis.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <label className="grid min-w-56 flex-1 gap-1">
            senden an
            <input type="email" name="to" required defaultValue={defaultTo} className={input} />
          </label>
          <SubmitButton className="rounded border border-lmu bg-white px-3 py-1.5 text-lmu-darker hover:bg-lmu-light">Test senden</SubmitButton>
        </form>
        {status && (
          <p className={`text-sm ${status.includes('Fehler') ? 'font-semibold text-red-700' : 'text-neutral-600'}`}>Zuletzt: {status}</p>
        )}
      </div>
    </section>
  )
}
