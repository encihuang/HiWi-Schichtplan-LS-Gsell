import { ABSENCE_LABELS, type Absence } from './data'
import { formatDate, WEEKDAYS_SHORT, weekday } from './dates'

const day = (d: string) => `${WEEKDAYS_SHORT[weekday(d) - 1]}, ${formatDate(d)}`

/** „Mo, 02.11.2026 – Fr, 06.11.2026“ bzw. ein einzelner Tag */
export const absenceRange = (a: Pick<Absence, 'from_date' | 'to_date'>) =>
  a.from_date === a.to_date ? day(a.from_date) : `${day(a.from_date)} – ${day(a.to_date)}`

/** mailto-Link ans Sekretariat mit den Abwesenheiten einer Person */
export function absenceMailto(to: string, person: string, sender: string, items: Absence[]) {
  const lines = items.map((a) => `- ${ABSENCE_LABELS[a.kind]}: ${absenceRange(a)}${a.note ? ` (${a.note})` : ''}`)
  const self = person === sender
  const kinds = [...new Set(items.map((a) => ABSENCE_LABELS[a.kind]))].join(' / ')
  const subject = `Abwesenheit ${person}: ${kinds}${items.length === 1 ? ` ${absenceRange(items[0])}` : ''}`
  const body = [
    'Guten Tag,',
    '',
    self ? 'ich bin zu folgenden Zeiten abwesend:' : `${person} ist zu folgenden Zeiten abwesend:`,
    '',
    ...lines,
    '',
    'Viele Grüße',
    sender,
  ].join('\n')
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
