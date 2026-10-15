import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { CopyField } from '@/components/copy-field'
import { SubmitButton } from '@/components/slot-button'
import { calendarToken } from '@/lib/data'
import { currentStaff } from '@/lib/session'
import { renewCalendarToken } from '../actions'

export const dynamic = 'force-dynamic'

async function origin() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

function Feed({ title, text, url }: { title: string; text: string; url: string }) {
  const webcal = url.replace(/^https?:/, 'webcal:')
  return (
    <section className="rounded-lg bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-lmu-darker">{title}</h2>
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

export default async function CalendarPage() {
  const me = await currentStaff()
  if (!me) redirect('/')
  const token = await calendarToken(me.id)
  const base = `${await origin()}/ical/${token}`

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-lmu-darker">Kalender abonnieren</h1>
        <p className="mt-1 text-neutral-600">
          Deine Dienste erscheinen automatisch in deinem Kalender (iPhone, Outlook, Google, Thunderbird …) und
          werden bei Änderungen im Schichtplan aktualisiert. Ausfälle, Vertretungen und Zusatzdienste sind berücksichtigt,
          Feier- und Schließtage ausgelassen.
        </p>
      </div>

      <Feed
        title="Meine Dienste"
        text={`Nur die Dienste und Vorlesungsbetreuungen von ${me.name}, mit den Kolleg:innen, die am selben Tag Dienst haben.`}
        url={`${base}/meine.ics`}
      />
      <Feed
        title="Ganzer Schichtplan"
        text="Alle Dienste und Vorlesungsbetreuungen des Lehrstuhls – wer wann im Dienst ist."
        url={`${base}/alle.ics`}
      />

      <section className="rounded-lg border border-neutral-200 bg-white/60 p-5 text-sm text-neutral-700">
        <h2 className="font-semibold text-lmu-darker">So geht’s</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>iPhone / Mac:</strong> „In Kalender-App abonnieren“ antippen und bestätigen.</li>
          <li><strong>Outlook:</strong> Kalender hinzufügen → „Aus dem Internet“ → Adresse einfügen.</li>
          <li><strong>Google Kalender:</strong> Knopf oben oder „Weitere Kalender“ → „Per URL“ → Adresse einfügen.</li>
        </ul>
        <p className="mt-2 text-neutral-500">
          Kalender-Apps fragen meist nur alle paar Stunden nach Änderungen (Google bis zu einmal am Tag).
        </p>
      </section>

      <section className="rounded-lg border border-red-200 bg-white p-5 text-sm">
        <h2 className="font-semibold text-lmu-darker">Adresse geheim halten</h2>
        <p className="mt-1 text-neutral-600">
          Wer die Adresse kennt, sieht den Schichtplan – auch ohne Passwort. Falls sie in falsche Hände geraten ist,
          setze sie zurück; bestehende Abos funktionieren dann nicht mehr und müssen neu eingerichtet werden.
        </p>
        <form action={renewCalendarToken} className="mt-3">
          <SubmitButton className="rounded border border-red-300 px-3 py-1.5 text-red-700 hover:bg-red-50">
            Adresse zurücksetzen
          </SubmitButton>
        </form>
      </section>
    </div>
  )
}
