import { addMail, deleteMail, saveAbsenceTexts, saveMail, saveSmtp, sendTestMail } from '@/app/actions'
import { ROLE_LABELS, ROLES, type Staff } from '@/lib/data'
import type { AbsenceTexts, MailState, SmtpConfig } from '@/lib/mail'
import { daysBeforeKey, DAYS_BEFORE_OPTIONS, FREQUENCY_LABELS, TOPIC_LABELS, type AutoMail, type Topic } from '@/lib/mail-shared'
import { WEEKDAYS } from '@/lib/dates'
import { absenceBody } from '@/lib/absence-mail'
import { MailTemplate } from './mail-template'
import { SubmitButton } from './slot-button'

const input = 'w-full min-w-0 rounded border border-neutral-300 px-2 py-1.5 text-sm focus:outline-2 focus:outline-lmu'
const label = 'grid min-w-0 gap-1 text-sm'
const hint = 'text-xs text-neutral-500'
const btn = 'rounded bg-lmu px-3 py-1.5 text-sm font-medium text-white hover:bg-lmu-dark'
const legend = 'mb-2 font-semibold text-lmu-darker'

/** Empfänger aus der Lehrstuhl-Liste, nach Bereich gruppiert; Personen ohne E-Mail sind nicht wählbar. */
function Recipients({ mail, staff }: { mail: AutoMail; staff: Staff[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ROLES.map((role) => {
        const people = staff.filter((s) => s.role === role && s.active)
        if (!people.length) return null
        return (
          <div key={role} className="text-sm">
            <div className="font-medium text-neutral-700">{ROLE_LABELS[role]}</div>
            <ul className="mt-1 space-y-0.5">
              {people.map((s) => (
                <li key={s.id}>
                  <label className={`flex items-center gap-2 ${s.email ? '' : 'text-neutral-400'}`} title={s.email || 'keine E-Mail hinterlegt'}>
                    <input type="checkbox" name="staff" value={s.id} disabled={!s.email} defaultChecked={mail.staffIds.includes(s.id)} className="accent-lmu" />
                    <span className="truncate">{s.name}</span>
                    {!s.email && <span className="text-xs">(keine E-Mail)</span>}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

/** Erinnerung: nur Hilfskräfte mit eingeteiltem Dienst bzw. Aufgabe; ohne E-Mail nicht wählbar */
function ReminderRecipients({ mail, staff, withDuties }: { mail: AutoMail; staff: Staff[]; withDuties: number[] }) {
  const people = staff.filter((s) => s.active && s.role === 'hiwi' && withDuties.includes(s.id))
  const all = people.filter((s) => s.email)
  return (
    <div className="text-sm">
      <p className={hint}>
        Zur Auswahl stehen nur Hilfskräfte, die heute oder später einen Dienst, eine Vorlesung/Aufgabe oder eine Vertretung
        übernommen haben. Jede bekommt ihre eigene Erinnerung – nur an Tagen, an denen sie etwas zu tun hat.
      </p>
      {people.length === 0 ? (
        <p className="mt-2 text-neutral-500">Noch niemand mit eingeteiltem Dienst.</p>
      ) : (
        <ul className="mt-2 grid gap-x-4 gap-y-0.5 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((s) => (
            <li key={s.id}>
              <label className={`flex items-center gap-2 ${s.email ? '' : 'text-neutral-400'}`} title={s.email || 'keine E-Mail hinterlegt'}>
                <input type="checkbox" name="staff" value={s.id} disabled={!s.email} defaultChecked={mail.staffIds.includes(s.id)} className="accent-lmu" />
                <span className="truncate">{s.name}</span>
                {!s.email && <span className="text-xs">(keine E-Mail)</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      {all.length > 1 && <p className={`${hint} mt-1`}>{all.length} Hilfskräfte mit E-Mail-Adresse wählbar.</p>}
    </div>
  )
}

const TOPIC_SHORT: Record<Topic, string> = { absences: 'Abwesenheiten', appointments: 'Termine', shifts: 'Schichtplan' }

function schedule(m: AutoMail) {
  if (m.kind === 'reminder') {
    return m.staffIds.length ? `Erinnerung ${DAYS_BEFORE_OPTIONS.find(([d]) => d === daysBeforeKey(m))?.[1] ?? ''}` : 'aus'
  }
  if (m.kind === 'change') {
    if (!m.topics.length) return 'aus'
    return `bei Änderungen: ${m.topics.map((t) => TOPIC_SHORT[t]).join(', ')}`
  }
  if (m.frequency === 'off') return 'aus'
  return m.frequency === 'weekly' ? `wöchentlich, ${WEEKDAYS[m.weekday - 1]}` : FREQUENCY_LABELS.daily
}

function MailCard({ mail, state, staff, withDuties }: { mail: AutoMail; state?: MailState; staff: Staff[]; withDuties: number[] }) {
  const reminder = mail.kind === 'reminder'
  const count = reminder
    ? staff.filter((s) => s.active && s.email && mail.staffIds.includes(s.id) && withDuties.includes(s.id)).length
    : staff.filter((s) => s.active && s.email && mail.staffIds.includes(s.id)).length + mail.extra.length
  const result = state?.lastResult
  return (
    <details id={`mail-${mail.id}`} className="group rounded-lg bg-white shadow-sm" open={!mail.staffIds.length && !mail.extra.length}>
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-neutral-400 transition-transform group-open:rotate-90">▸</span>
        <span className="font-semibold text-lmu-darker">{mail.name}</span>
        <span className={`rounded px-1.5 text-xs ${schedule(mail) === 'aus' ? 'bg-neutral-100 text-neutral-600' : 'bg-lmu-light text-lmu-darker'}`}>
          {schedule(mail)}
        </span>
        <span className="text-sm text-neutral-500">{count} {reminder ? (count === 1 ? 'Hilfskraft' : 'Hilfskräfte') : 'Empfänger'}</span>
        {result && (
          <span className={`basis-full text-xs sm:basis-auto ${result.includes('Fehler') ? 'font-semibold text-red-700' : 'text-neutral-500'}`}>
            Zuletzt: {result}
          </span>
        )}
      </summary>
      <div className="space-y-4 border-t border-neutral-100 p-4">
        <form action={saveMail} className="space-y-5">
          <input type="hidden" name="id" value={mail.id} />
          <label className={`${label} max-w-md`}>
            Bezeichnung
            <input name="name" defaultValue={mail.name} required className={input} />
          </label>

          {reminder ? (
            <>
              <fieldset>
                <legend className={legend}>Welche Hilfskräfte?</legend>
                <ReminderRecipients mail={mail} staff={staff} withDuties={withDuties} />
              </fieldset>
              <fieldset className="grid gap-3 sm:grid-cols-3">
                <legend className={legend}>Wann?</legend>
                <label className={label}>
                  Erinnerung
                  <select name="daysBefore" defaultValue={daysBeforeKey(mail)} className={input}>
                    {DAYS_BEFORE_OPTIONS.map(([d, l]) => (
                      <option key={d} value={d}>{l}</option>
                    ))}
                  </select>
                </label>
                <span className={`${hint} self-end sm:col-span-2`}>
                  Versand morgens gegen 7 Uhr. „1 Werktag vorher“ für einen Montagsdienst kommt am Freitag, „1 Tag vorher“ am
                  Sonntag. Für mehrere Zeitpunkte einfach eine weitere Erinnerung anlegen.
                </span>
              </fieldset>
            </>
          ) : (
            <fieldset>
              <legend className={legend}>Empfänger</legend>
              <Recipients mail={mail} staff={staff} />
              <label className={`${label} mt-3`}>
                Weitere Adressen (optional)
                <input name="extra" defaultValue={mail.extra.join(', ')} placeholder="durch Komma getrennt" className={input} />
              </label>
            </fieldset>
          )}

          {reminder ? null : mail.kind === 'change' ? (
            <fieldset className="grid gap-3 sm:grid-cols-3">
              <legend className={legend}>Senden, sobald …</legend>
              <div className="grid gap-1.5 text-sm sm:col-span-2">
                {Object.entries(TOPIC_LABELS).map(([k, l]) => (
                  <label key={k} className="flex items-center gap-2">
                    <input type="checkbox" name="topics" value={k} defaultChecked={mail.topics.includes(k as never)} className="accent-lmu" />
                    {l}
                  </label>
                ))}
                <span className={hint}>Abwesenheiten und Termine zählen, wenn sie heute oder später liegen. Die Änderung steht in {'{aenderung}'}; den aktuellen Schichtplan zeigt {'{dienste}'}.</span>
              </div>
              <label className={label}>
                Vorschau (Wochen)
                <input name="weeks" defaultValue={mail.weeks} inputMode="numeric" className={input} />
              </label>
            </fieldset>
          ) : (
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className={legend}>Zeitplan</legend>
            <label className={label}>
              Wie oft
              <select name="frequency" defaultValue={mail.frequency} className={input}>
                {Object.entries(FREQUENCY_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>{l}</option>
                ))}
              </select>
            </label>
            <label className={label}>
              Wochentag (bei wöchentlich)
              <select name="weekday" defaultValue={mail.weekday} className={input}>
                {WEEKDAYS.map((d, i) => (
                  <option key={d} value={i + 1}>{d}</option>
                ))}
              </select>
            </label>
            <label className={label}>
              Vorschau (Wochen)
              <input name="weeks" defaultValue={mail.weeks} inputMode="numeric" className={input} />
            </label>
          </fieldset>
          )}

          <fieldset>
            <legend className={legend}>Text</legend>
            <MailTemplate kind={mail.kind} subject={mail.subject} body={mail.body} />
          </fieldset>

          <SubmitButton className={btn}>Speichern</SubmitButton>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-3">
          <form action={sendTestMail}>
            <input type="hidden" name="id" value={mail.id} />
            <SubmitButton className="rounded border border-lmu bg-white px-3 py-1.5 text-sm text-lmu-darker hover:bg-lmu-light">
              {reminder
                ? 'Gespeicherte Fassung testen (Beispiel an die Absender-Adresse)'
                : 'Gespeicherte Fassung jetzt testen (E-Mail senden)'}
            </SubmitButton>
          </form>
          <form action={deleteMail}>
            <input type="hidden" name="id" value={mail.id} />
            <SubmitButton className="rounded px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">„{mail.name}“ löschen</SubmitButton>
          </form>
        </div>
      </div>
    </details>
  )
}

/** Einstellungen: SMTP-Zugang, automatische E-Mails und Text der Abwesenheitsmeldung. Das Passwort verlässt nie den Server. */
export function MailSettings({ smtp, mails, states, staff, withDuties, absenceTexts, canStoreSecrets, passwordReadable }: {
  smtp: SmtpConfig
  mails: AutoMail[]
  states: Record<string, MailState>
  staff: Staff[]
  /** Hilfskräfte mit eingeteiltem Dienst (wählbar für Erinnerungen) */
  withDuties: number[]
  absenceTexts: AbsenceTexts
  canStoreSecrets: boolean
  passwordReadable: boolean
}) {
  return (
    <>
      <section>
        <h2 className="text-lg font-semibold text-lmu-darker">E-Mail-Versand</h2>
        <p className="text-sm text-neutral-600">Versand über dein LMU-Mailkonto (SMTP).</p>
        <details className="group mt-3 rounded-lg bg-white shadow-sm" open={!smtp.host}>
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="text-neutral-400 transition-transform group-open:rotate-90">▸</span>
            <span className="font-semibold text-lmu-darker">Absender-Konto (SMTP)</span>
            <span className="text-sm text-neutral-500">{smtp.host ? `${smtp.from || smtp.user} über ${smtp.host}` : 'noch nicht eingerichtet'}</span>
          </summary>
          <form action={saveSmtp} className="grid gap-3 border-t border-neutral-100 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className={label}>
              SMTP-Server
              <input name="host" defaultValue={smtp.host} placeholder="z. B. postout.lrz.de" className={input} />
            </label>
            <label className={label}>
              Port
              <input name="port" defaultValue={smtp.port} inputMode="numeric" className={input} />
            </label>
            <label className={label}>
              Verschlüsselung
              <select name="security" defaultValue={smtp.security} className={input}>
                <option value="starttls">STARTTLS (meist Port 587)</option>
                <option value="ssl">SSL/TLS (meist Port 465)</option>
              </select>
            </label>
            <label className={label}>
              Benutzername
              <input name="user" defaultValue={smtp.user} autoComplete="off" placeholder="LMU-Kennung bzw. E-Mail" className={input} />
            </label>
            <label className={label}>
              Passwort
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                disabled={!canStoreSecrets}
                placeholder={smtp.hasPassword ? '•••••••• gespeichert – leer lassen zum Behalten' : 'Passwort'}
                className={input}
              />
              <span className={hint}>
                {canStoreSecrets
                  ? 'Wird verschlüsselt gespeichert und nie wieder angezeigt.'
                  : 'Zum Speichern bitte zuerst SECRET_KEY (oder ADMIN_PASSWORD) in den Umgebungsvariablen setzen.'}
              </span>
              {smtp.hasPassword && !passwordReadable && (
                <span className="text-xs font-semibold text-red-700">
                  Gespeichertes Passwort ist nicht mehr entschlüsselbar (Schlüssel geändert) – bitte neu eingeben.
                </span>
              )}
              {smtp.hasPassword && (
                <span className="flex items-center gap-1.5 text-xs text-neutral-600">
                  <input type="checkbox" name="clearPassword" className="accent-lmu" /> gespeichertes Passwort löschen
                </span>
              )}
            </label>
            <label className={label}>
              Absender
              <input name="from" defaultValue={smtp.from} placeholder="Vorname Nachname <name@jura.uni-muenchen.de>" className={input} />
            </label>
            <div className="sm:col-span-2 lg:col-span-3">
              <SubmitButton className={btn}>Speichern</SubmitButton>
            </div>
          </form>
        </details>
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-lmu-darker">Automatische E-Mails</h2>
            <p className="text-sm text-neutral-600">
              <strong>Regelmäßig:</strong> z. B. eine wöchentliche Übersicht für das Sekretariat und Prof. Gsell, morgens gegen
              7 Uhr. <strong>Bei Änderungen:</strong> sofort, wenn jemand eine Abwesenheit oder einen Termin einträgt oder
              löscht. <strong>Erinnerung:</strong> an ausgewählte Hilfskräfte vor ihrem Dienst, mit Dienst, Vorlesungen und
              Aufgaben des Tages. Was drinsteht, bestimmen die Platzhalter im Text.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <form action={addMail}>
              <input type="hidden" name="kind" value="schedule" />
              <SubmitButton className={btn}>+ Regelmäßige E-Mail</SubmitButton>
            </form>
            <form action={addMail}>
              <input type="hidden" name="kind" value="change" />
              <SubmitButton className={btn}>+ E-Mail bei Änderungen</SubmitButton>
            </form>
            <form action={addMail}>
              <input type="hidden" name="kind" value="reminder" />
              <SubmitButton className={btn}>+ Erinnerung an Hilfskräfte</SubmitButton>
            </form>
          </div>
        </div>
        <div className="mt-3 space-y-3">
          {mails.length === 0 && <p className="text-sm text-neutral-500">Noch keine automatischen E-Mails.</p>}
          {mails.map((m) => (
            <MailCard key={m.id} mail={m} state={states[m.id]} staff={staff} withDuties={withDuties} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-lmu-darker">E-Mail bei Abwesenheiten</h2>
        <p className="text-sm text-neutral-600">
          Entwurf, der sich nach dem Eintragen einer Abwesenheit im Mailprogramm öffnet (an die Person im Bereich
          „Sekretariat“). Die Liste der Abwesenheiten und der Name des Absenders werden automatisch eingefügt.
        </p>
        <form action={saveAbsenceTexts} className="mt-3 grid gap-4 rounded-lg bg-white p-4 shadow-sm lg:grid-cols-2">
          <div className="grid content-start gap-3">
            <label className={label}>
              Anrede
              <textarea name="absenceGreeting" rows={2} defaultValue={absenceTexts.absenceGreeting} className={input} />
            </label>
            <label className={label}>
              Einleitung (vor der Liste der Abwesenheiten)
              <textarea name="absenceIntro" rows={4} defaultValue={absenceTexts.absenceIntro} className={input} />
            </label>
            <label className={label}>
              Gruß (vor dem Namen)
              <textarea name="absenceClosing" rows={3} defaultValue={absenceTexts.absenceClosing} className={input} />
            </label>
            <div>
              <SubmitButton className={btn}>Speichern</SubmitButton>
            </div>
          </div>
          <div className="grid content-start gap-1 text-sm">
            <span>Beispiel (gespeicherte Fassung)</span>
            <pre className="whitespace-pre-wrap rounded border border-neutral-200 bg-neutral-50 p-3 font-sans text-sm text-neutral-800">
              {absenceBody(absenceTexts, absenceTexts.absenceIntro, ['- Urlaub: Mo, 02.11.2026 – Fr, 06.11.2026'], 'Anna Muster')}
            </pre>
          </div>
        </form>
      </section>
    </>
  )
}
