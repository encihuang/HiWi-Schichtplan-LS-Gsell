import { SubmitButton } from '@/components/slot-button'
import { OpenMailDraft } from '@/components/open-mail-draft'
import { absenceMailto, absenceRange } from '@/lib/absence-mail'
import {
  ABSENCE_LABEL, getAbsence, listAbsences, listStaff, ROLE_LABELS, secretary, type Absence, type Staff,
} from '@/lib/data'
import { addDays, todayIso } from '@/lib/dates'
import { isAdmin } from '@/lib/session'
import { absenceDigestActive, loadAbsenceTexts } from '@/lib/mail'
import { addAbsence, deleteAbsence } from '@/app/actions'

const input = 'rounded border border-neutral-300 px-2 py-1.5'
const mailBtn = 'inline-block rounded bg-lmu px-3 py-1.5 text-sm font-medium text-white hover:bg-lmu-dark'

/**
 * Abwesenheiten eintragen, eigene und die des Teams. Eigene Seite für das Team, für Hilfskräfte im Schichtplan.
 * back = Seite, auf die nach dem Eintragen zurückgeleitet wird (mit ?neu=…)
 */
export async function AbsencesPanel({ me, neu, back }: { me: Staff; neu?: string; back: string }) {
  const today = todayIso()
  const [admin, sec, staff, mine, team, fresh, digestOn, texts] = await Promise.all([
    isAdmin(),
    secretary(),
    listStaff(),
    listAbsences(addDays(today, -30), '9999-12-31', me.id),
    listAbsences(today, addDays(today, 7 * 12)),
    neu ? getAbsence(Number(neu)) : Promise.resolve(undefined),
    absenceDigestActive(),
    loadAbsenceTexts(),
  ])
  const byId = new Map(staff.map((s) => [s.id, s]))
  const name = (id: number) => byId.get(id)?.name ?? '?'
  const upcoming = mine.filter((a) => a.to_date >= today)
  const mail = (items: Absence[]) =>
    sec ? absenceMailto(sec.email, name(items[0].staff_id), me.name, items, texts) : null
  // gerade eingetragen: eigene oder (mit Passwort) für andere
  const justAdded = fresh && (fresh.staff_id === me.id || admin) ? fresh : undefined

  return (
    <div id="abwesenheiten" className="space-y-6 scroll-mt-4">
      <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="note">
        <strong>Bitte rechtzeitig melden:</strong> Abwesenheiten müssen rechtzeitig vorher an{' '}
        {sec ? <strong>{sec.name}</strong> : 'das Sekretariat'} geschickt werden. Nach dem Eintragen öffnet sich dafür automatisch ein E-Mail-Entwurf an {sec ? sec.name : 'das Sekretariat'}.
        {digestOn && ' Zusätzlich erhält das Sekretariat regelmäßig eine Zusammenfassung per E-Mail.'}
      </div>

      {justAdded && (
        <section className="rounded-lg border-2 border-lmu bg-lmu-lighter p-4" role="status">
          <div className="font-semibold text-lmu-darker">
            Eingetragen: {ABSENCE_LABEL} {absenceRange(justAdded)}
            {justAdded.staff_id !== me.id && ` für ${name(justAdded.staff_id)}`}
          </div>
          {sec ? (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              <OpenMailDraft href={mail([justAdded])!} id={String(justAdded.id)} />
              <span className="text-neutral-700">Der E-Mail-Entwurf an {sec.name} (Sekretariat) hat sich nicht geöffnet?</span>
              <a href={mail([justAdded])!} className={mailBtn}>E-Mail an {sec.name}</a>
              {justAdded.staff_id === me.id && upcoming.length > 1 && (
                <a href={mail(upcoming)!} className="text-lmu underline hover:text-lmu-darker">
                  alle {upcoming.length} kommenden Abwesenheiten melden
                </a>
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-neutral-600">
              Für die E-Mail ans Sekretariat bitte in der Verwaltung eine Person mit Bereich „Sekretariat“ und E-Mail
              hinterlegen.
            </p>
          )}
          <p className="mt-2 text-xs text-neutral-500">Die E-Mail öffnet sich in deinem Mailprogramm und kann vor dem Senden geändert werden.</p>
        </section>
      )}

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-lmu-darker">Abwesenheit eintragen</h2>
        <form action={addAbsence} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
          <input type="hidden" name="back" value={back} />
          {admin && (
            <label className="grid gap-1">
              <span className="text-xs text-neutral-600">Für</span>
              <select name="person" defaultValue={me.id} className={input}>
                {staff.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1">
            <span className="text-xs text-neutral-600">Von</span>
            <input type="date" name="from" required defaultValue={today} className={input} />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-neutral-600">Bis (leer = ein Tag)</span>
            <input type="date" name="to" className={input} />
          </label>
          <label className="grid min-w-0 flex-1 basis-48 gap-1">
            <span className="text-xs text-neutral-600">Notiz (optional)</span>
            <input name="note" placeholder="z. B. Vertretung: …, nur vormittags – bitte keine Gründe" className={input} />
          </label>
          <SubmitButton className="rounded bg-lmu px-3 py-1.5 font-medium text-white hover:bg-lmu-dark">Eintragen</SubmitButton>
        </form>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-lmu-darker">Meine Abwesenheiten</h2>
          {sec && upcoming.length > 0 && (
            <a href={mail(upcoming)!} className="text-sm text-lmu underline hover:text-lmu-darker">
              Alle kommenden an {sec.name} schicken
            </a>
          )}
        </div>
        {mine.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Keine eingetragen.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100">
            {mine.map((a) => (
              <li key={a.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-2 ${a.to_date < today ? 'opacity-50' : ''}`}>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{ABSENCE_LABEL}</span>{' '}
                  <span className="tabular-nums">{absenceRange(a)}</span>
                  {a.note && <span className="block text-sm text-neutral-600">{a.note}</span>}
                </span>
                {sec && a.to_date >= today && (
                  <a href={mail([a])!} className="text-xs text-lmu underline hover:text-lmu-darker">per E-Mail melden</a>
                )}
                <form action={deleteAbsence}>
                  <input type="hidden" name="absence" value={a.id} />
                  <SubmitButton className="px-2 text-xs text-red-700 hover:underline">löschen</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-lmu-darker">Abwesenheiten im Team (nächste 12 Wochen)</h2>
        {team.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Niemand abwesend.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100">
            {team.map((a) => {
              const s = byId.get(a.staff_id)
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="w-48 shrink-0">
                    <span className="font-semibold">{s?.name}</span>
                    {s && <span className="block text-xs text-neutral-500">{ROLE_LABELS[s.role]}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    {ABSENCE_LABEL} <span className="tabular-nums">{absenceRange(a)}</span>
                    {a.note && <span className="block text-neutral-600">{a.note}</span>}
                  </span>
                  {admin && a.staff_id !== me.id && (
                    <form action={deleteAbsence}>
                      <input type="hidden" name="absence" value={a.id} />
                      <SubmitButton className="px-2 text-xs text-red-700 hover:underline">löschen</SubmitButton>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
