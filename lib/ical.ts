// Kalender-Abo (iCalendar, RFC 5545): Dienste und Vorlesungsbetreuung als Termine.

import { APP_TITLE } from './brand'
import { addDays, PERIOD_LABELS } from './dates'
import { ABSENCE_LABEL, type Absence, type Appointment, type DayInfo, type Lecture, type RosterEntry } from './data'

const CRLF = '\r\n'
const TZ = 'Europe/Berlin'

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZ}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
]

const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Zeilen nach 75 Bytes umbrechen (ohne UTF-8-Zeichen zu zerteilen). */
function fold(line: string) {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = Buffer.byteLength(ch)
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join(CRLF + ' ')
}

const compact = (iso: string) => iso.replaceAll('-', '')

/** „10–12 Uhr“, „10:15-11:45“, „14 bis 16 Uhr“ → ['1000','1200']; sonst null */
export function parseTimeRange(text: string): [string, string] | null {
  const m = text.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(?:Uhr)?\s*(?:-|–|—|bis)\s*(\d{1,2})(?:[:.](\d{2}))?/i)
  if (!m) return null
  const t = (h: string, min = '00') => (Number(h) <= 23 && Number(min) <= 59 ? h.padStart(2, '0') + min : null)
  const [a, b] = [t(m[1], m[2]), t(m[3], m[4])]
  return a && b && a < b ? [a, b] : null
}

/** end: letzter Tag eines mehrtägigen ganztägigen Termins */
type Event = { uid: string; date: string; end?: string; summary: string; description?: string; time?: [string, string] }

function vevent(e: Event, stamp: string) {
  const when = e.time
    ? [`DTSTART;TZID=${TZ}:${compact(e.date)}T${e.time[0]}00`, `DTEND;TZID=${TZ}:${compact(e.date)}T${e.time[1]}00`]
    : [`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(addDays(e.end ?? e.date, 1))}`]
  return [
    'BEGIN:VEVENT',
    `UID:${e.uid}@hiwi-schichtplan`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${escape(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${escape(e.description)}`] : []),
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ]
}

const dutyText = (e: RosterEntry, names: Record<number, string>) => `${names[e.staff_id] ?? '?'} (${e.label})`

function timedEvent(uid: string, date: string, timeText: string, summary: string, description: string): Event {
  const time = parseTimeRange(timeText) ?? undefined
  return {
    uid,
    date,
    summary: time || !timeText ? summary : `${summary} (${timeText})`,
    description: [timeText && `Uhrzeit: ${timeText}`, description].filter(Boolean).join('\n'),
    time,
  }
}

const lectureEvent = (l: Lecture, date: string, summary: string, description: string) =>
  // negative id: wiederkehrende Sonderaufgabe
  timedEvent(l.id < 0 ? `sa-${-l.id}-${date}` : `vl-${l.id}-${date}`, date, l.time, summary, description)

/**
 * Termine für eine Person (staffId) oder den ganzen Plan (staffId = null).
 * Ganztägig: Dienste; mit Uhrzeit, falls angegeben: Vorlesungsbetreuung und Termine für alle.
 */
export function buildCalendar(
  days: DayInfo[], appointments: Appointment[], absences: Absence[], names: Record<number, string>, staffId: number | null,
  url: string,
) {
  // Termine für alle stehen in beiden Feeds, auch an Wochenenden und Schließtagen.
  const events: Event[] = appointments.map((a) =>
    timedEvent(`termin-${a.id}`, a.date, a.time, a.title, [a.note, 'Termin für alle Hilfskräfte'].filter(Boolean).join('\n')),
  )
  // Abwesenheiten: im eigenen Feed die eigenen, im Gesamtplan alle
  for (const a of absences) {
    if (staffId !== null && a.staff_id !== staffId) continue
    events.push({
      uid: `abwesend-${a.id}`,
      date: a.from_date,
      end: a.to_date,
      summary: staffId === null ? `${ABSENCE_LABEL}: ${names[a.staff_id] ?? '?'}` : ABSENCE_LABEL,
      description: a.note || undefined,
    })
  }
  for (const d of days) {
    if (!d.period || d.closed) continue
    const period = PERIOD_LABELS[d.period.kind]
    const all = d.entries.map((e) => dutyText(e, names)).join('\n')
    if (staffId === null) {
      if (d.entries.length) {
        events.push({
          uid: `tag-${d.date}`,
          date: d.date,
          summary: `Dienst: ${d.entries.map((e) => names[e.staff_id] ?? '?').join(', ')}`,
          description: `${period}\n\n${all}`,
        })
      }
      for (const l of d.lectures) {
        const who = l.staff_id
          ? `${names[l.staff_id] ?? '?'}${l.absent ? ` (Vertretung für ${names[l.regular_id!] ?? '?'})` : ''}`
          : l.absent ? `Vertretung für ${names[l.regular_id!] ?? '?'} offen` : 'noch offen'
        events.push(lectureEvent(l, d.date, `${l.name}: ${who}`, period))
      }
      continue
    }
    d.entries.forEach((e, i) => {
      if (e.staff_id !== staffId || e.problem) return
      const others = d.entries.filter((x, j) => j !== i && !x.problem).map((x) => dutyText(x, names))
      events.push({
        uid: `dienst-${staffId}-${d.date}-${i}`,
        date: d.date,
        summary: e.label === 'Dienst' ? 'Hiwi-Dienst' : `Hiwi-Dienst (${e.label})`,
        description: [period, others.length ? `Ebenfalls im Dienst:\n${others.join('\n')}` : 'Sonst niemand im Dienst.'].join('\n\n'),
      })
    })
    for (const l of d.lectures.filter((x) => x.staff_id === staffId)) {
      const title = l.absent ? `${l.name} (Vertretung für ${names[l.regular_id!] ?? '?'})` : l.name
      events.push(lectureEvent(l, d.date, title, period))
    }
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const name = staffId === null ? `Hiwi-Schichtplan LS Gsell` : `Hiwi-Dienste ${names[staffId] ?? ''}`.trim()
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LS Gsell//Hiwi-Schichtplan//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`,
    `X-WR-CALDESC:${escape(`${APP_TITLE} – ${url}`)}`,
    `X-WR-TIMEZONE:${TZ}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...VTIMEZONE,
    ...events.flatMap((e) => vevent(e, stamp)),
    'END:VCALENDAR',
  ]
  return lines.map(fold).join(CRLF) + CRLF
}
