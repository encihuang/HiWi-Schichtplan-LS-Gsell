import { headers } from 'next/headers'
import { CopyField } from '@/components/copy-field'
import { calendarToken, type Staff } from '@/lib/data'

async function origin() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

function Feed({ title, text, url }: { title: string; text: string; url: string }) {
  const webcal = url.replace(/^https?:/, 'webcal:')
  return (
    <section className="rounded-lg border border-neutral-200 p-4">
      <h3 className="font-semibold text-lmu-darker">{title}</h3>
      <p className="mt-1 text-sm text-neutral-600">{text}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <a href={webcal} className="rounded bg-lmu px-3 py-1.5 font-medium text-white hover:bg-lmu-dark">
          In Kalender-App abonnieren
        </a>
        <a
          href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-lmu px-3 py-1.5 text-lmu-darker hover:bg-lmu-light"
        >
          Google Kalender
        </a>
      </div>
      <div className="mt-3">
        <CopyField value={url} label={`Adresse: ${title}`} />
      </div>
    </section>
  )
}

/** Kalender-Abo (in den eigenen Einstellungen): geheime Adressen für die eigenen Dienste und den ganzen Plan */
export async function CalendarFeeds({ me }: { me: Staff }) {
  const token = await calendarToken(me.id)
  const base = `${await origin()}/ical/${token}`
  return (
    <div className="space-y-4">
      <Feed
        title="Meine Dienste"
        text={`Dienste und Vorlesungsbetreuungen von ${me.name} (mit den Kolleg:innen am selben Tag), eigene Abwesenheiten und Termine für alle.`}
        url={`${base}/meine.ics`}
      />
      <Feed
        title="Ganzer Schichtplan"
        text="Alle Dienste, Vorlesungsbetreuungen, Termine und Abwesenheiten des Lehrstuhls."
        url={`${base}/alle.ics`}
      />
      <div className="rounded-lg bg-neutral-50 p-4 text-sm text-neutral-700">
        <h3 className="font-semibold text-lmu-darker">So geht’s</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>iPhone / Mac:</strong> „In Kalender-App abonnieren“ antippen und bestätigen.</li>
          <li><strong>Outlook:</strong> Kalender hinzufügen → „Aus dem Internet“ → Adresse einfügen.</li>
          <li><strong>Google Kalender:</strong> Knopf oben oder „Weitere Kalender“ → „Per URL“ → Adresse einfügen.</li>
        </ul>
        <p className="mt-2 text-neutral-500">
          Kalender-Apps fragen meist nur alle paar Stunden nach Änderungen (Google bis zu einmal am Tag).
        </p>
      </div>
      <p className="text-xs text-neutral-500">
        Wer die Adresse kennt, sieht die Dienste ohne Anmeldung – bitte nicht weitergeben. Falls doch, kann die Verwaltung sie
        zurücksetzen.
      </p>
    </div>
  )
}
