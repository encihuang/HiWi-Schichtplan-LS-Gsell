import { listAbsences, listAppointments, listStaff, loadDays, staffByCalendarToken } from '@/lib/data'
import { addDays, todayIso } from '@/lib/dates'
import { query } from '@/lib/db'
import { buildCalendar } from '@/lib/ical'

export const dynamic = 'force-dynamic'

// Kalender-Abo: /ical/<token>/meine.ics (eigene Dienste) bzw. /ical/<token>/alle.ics (ganzer Plan).
// Ohne Anmeldung erreichbar (Kalender-Apps senden keine Cookies); der geheime Schlüssel schützt die Adresse.
export async function GET(request: Request, ctx: RouteContext<'/ical/[token]/[file]'>) {
  const { token, file } = await ctx.params
  const all = file === 'alle.ics'
  if (!all && file !== 'meine.ics') return new Response('Nicht gefunden', { status: 404 })
  const me = await staffByCalendarToken(token)
  if (!me?.active) return new Response('Kalender-Adresse ungültig oder zurückgesetzt.', { status: 404 })

  const from = addDays(todayIso(), -90)
  const [last] = await query<{ end_date: string | null }>('select max(end_date) as end_date from periods')
  const to = last?.end_date && last.end_date > from ? last.end_date : from
  const [days, appointments, absences, staff] = await Promise.all([
    loadDays(from, to), listAppointments(from, '9999-12-31'), listAbsences(from, '9999-12-31'), listStaff(),
  ])
  const names = Object.fromEntries(staff.map((s) => [s.id, s.name]))
  const origin = new URL(request.url).origin
  const body = buildCalendar(days, appointments, absences, names, all ? null : me.id, origin)

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${all ? 'schichtplan' : 'meine-dienste'}.ics"`,
      'Cache-Control': 'no-store',
    },
  })
}
