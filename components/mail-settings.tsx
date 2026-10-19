import { saveMailSettings, sendTestDigest } from '@/app/actions'
import { DEFAULT_TEXTS, FREQUENCY_LABELS, type DigestConfig, type MailTexts, type SmtpConfig } from '@/lib/mail'
import { WEEKDAYS } from '@/lib/dates'
import { SubmitButton } from './slot-button'

const input = 'w-full min-w-0 rounded border border-neutral-300 px-2 py-1.5 text-sm focus:outline-2 focus:outline-lmu'
const label = 'grid min-w-0 gap-1 text-sm'
const hint = 'text-xs text-neutral-500'

/** Einstellungen: SMTP-Zugang (LMU-Konto) und regelmäßige E-Mail-Zusammenfassung. Das Passwort verlässt nie den Server. */
export function MailSettings({ smtp, digest, texts, canStoreSecrets, passwordReadable }: {
  smtp: SmtpConfig
  digest: DigestConfig
  texts: MailTexts
  canStoreSecrets: boolean
  passwordReadable: boolean
}) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-lmu-darker">E-Mail-Versand</h2>
      <p className="text-sm text-neutral-600">
        Regelmäßige Zusammenfassung (z. B. für das Sekretariat und Prof. Gsell) mit Abwesenheiten und Urlauben, Terminen und
        auf Wunsch den Diensten der Hilfskräfte. Versand über dein LMU-Mailkonto (SMTP). Die Zusammenfassung wird morgens
        gegen 7 Uhr verschickt.
      </p>

      <form action={saveMailSettings} className="mt-3 space-y-4 rounded-lg bg-white p-4 shadow-sm">
        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="mb-2 font-semibold text-lmu-darker">Absender-Konto (SMTP)</legend>
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
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="mb-2 font-semibold text-lmu-darker">Zusammenfassung</legend>
          <label className={`${label} sm:col-span-2 lg:col-span-3`}>
            Empfänger
            <textarea
              name="recipients"
              rows={2}
              defaultValue={digest.recipients.join(', ')}
              placeholder="eine oder mehrere E-Mail-Adressen, durch Komma getrennt"
              className={input}
            />
          </label>
          <label className={label}>
            Wie oft
            <select name="frequency" defaultValue={digest.frequency} className={input}>
              {Object.entries(FREQUENCY_LABELS).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Wochentag (bei wöchentlich)
            <select name="weekday" defaultValue={digest.weekday} className={input}>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i + 1}>{d}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Vorschau (Wochen)
            <input name="weeks" defaultValue={digest.weeks} inputMode="numeric" className={input} />
          </label>
          <div className="grid gap-1.5 text-sm sm:col-span-2 lg:col-span-3">
            <span>Inhalt</span>
            {(
              [
                ['absences', 'Abwesenheiten und Urlaube (neue hervorgehoben)', digest.absences],
                ['appointments', 'Termine für alle', digest.appointments],
                ['duties', 'Dienste der Hilfskräfte (nächste 7 Tage)', digest.duties],
                ['onlyNew', 'nur senden, wenn seit der letzten E-Mail neue Abwesenheiten eingetragen wurden', digest.onlyNew],
                [
                  'updates',
                  'Aktualisierung sofort senden, wenn nach der letzten Zusammenfassung Abwesenheiten oder Termine eingetragen oder gelöscht werden',
                  digest.updates,
                ],
              ] as const
            ).map(([name, text, on]) => (
              <label key={name} className="flex items-center gap-2">
                <input type="checkbox" name={name} defaultChecked={on} className="accent-lmu" /> {text}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1 font-semibold text-lmu-darker">E-Mail-Texte</legend>
          <p className={`${hint} sm:col-span-2`}>
            Platzhalter: <code>{'{titel}'}</code> App-Name, <code>{'{datum}'}</code> heutiges Datum,{' '}
            <code>{'{neu}'}</code> Anzahl neuer Abwesenheiten, <code>{'{aenderung}'}</code> die Änderung (nur bei
            Aktualisierungen). Leerer Betreff = Standard.
          </p>
          <label className={label}>
            Betreff der Zusammenfassung
            <input name="text_subject" defaultValue={texts.subject} placeholder={DEFAULT_TEXTS.subject} className={input} />
          </label>
          <label className={label}>
            Betreff der Aktualisierung
            <input name="text_updateSubject" defaultValue={texts.updateSubject} placeholder={DEFAULT_TEXTS.updateSubject} className={input} />
          </label>
          <label className={label}>
            Einleitung (vor der Übersicht)
            <textarea name="text_intro" rows={4} defaultValue={texts.intro} placeholder="z. B. Liebe Frau Kersting, anbei die aktuelle Übersicht." className={input} />
          </label>
          <label className={label}>
            Schluss (nach der Übersicht)
            <textarea name="text_closing" rows={4} defaultValue={texts.closing} placeholder="z. B. Viele Grüße" className={input} />
          </label>
          <p className={`${hint} sm:col-span-2`}>
            E-Mail, die Personen nach dem Eintragen einer Abwesenheit ans Sekretariat schicken (Name des Absenders wird
            automatisch angehängt):
          </p>
          <label className={label}>
            Anrede
            <input name="text_absenceGreeting" defaultValue={texts.absenceGreeting} className={input} />
          </label>
          <label className={label}>
            Einleitung
            <input name="text_absenceIntro" defaultValue={texts.absenceIntro} className={input} />
          </label>
          <label className={label}>
            Gruß
            <input name="text_absenceClosing" defaultValue={texts.absenceClosing} className={input} />
          </label>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3">
          <SubmitButton className="rounded bg-lmu px-3 py-1.5 text-sm font-medium text-white hover:bg-lmu-dark">Speichern</SubmitButton>
        </div>
      </form>

      <form action={sendTestDigest} className="mt-3 flex flex-wrap items-center gap-3">
        <SubmitButton className="rounded border border-lmu bg-white px-3 py-1.5 text-sm text-lmu-darker hover:bg-lmu-light">
          Gespeicherte Einstellungen jetzt testen (E-Mail senden)
        </SubmitButton>
        {digest.lastResult && (
          <span className={`text-sm ${digest.lastResult.includes('Fehler') ? 'font-semibold text-red-700' : 'text-neutral-600'}`}>
            Zuletzt: {digest.lastResult}
          </span>
        )}
      </form>
    </section>
  )
}
