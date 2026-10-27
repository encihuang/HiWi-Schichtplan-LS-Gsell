import { ABSENCE_LABEL, type Absence } from './data'
import { formatDate, WEEKDAYS_SHORT, weekday } from './dates'

const day = (d: string) => `${WEEKDAYS_SHORT[weekday(d) - 1]}, ${formatDate(d)}`

/** „Mo, 02.11.2026 – Fr, 06.11.2026“ bzw. ein einzelner Tag */
export const absenceRange = (a: Pick<Absence, 'from_date' | 'to_date'>) =>
  a.from_date === a.to_date ? day(a.from_date) : `${day(a.from_date)} – ${day(a.to_date)}`

export type AbsenceTexts = { absenceGreeting: string; absenceIntro: string; absenceClosing: string }

/** mailto-Link ans Sekretariat mit den Abwesenheiten einer Person (Texte aus den Einstellungen) */
export function absenceMailto(to: string, person: string, sender: string, items: Absence[], texts: AbsenceTexts) {
  const lines = items.map((a) => `- ${ABSENCE_LABEL}: ${absenceRange(a)}${a.note ? ` (${a.note})` : ''}`)
  const self = person === sender
  const subject = `Abwesenheit ${person}${items.length === 1 ? `: ${absenceRange(items[0])}` : ''}`
  const intro = self ? texts.absenceIntro : `${person} ist zu folgenden Zeiten abwesend:`
  const body = absenceBody(texts, intro, lines, sender)
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/** Text der Abwesenheitsmeldung: Anrede, Einleitung, Liste, Gruß, Name */
export function absenceBody(texts: AbsenceTexts, intro: string, lines: string[], sender: string) {
  return [
    ...(texts.absenceGreeting.trim() ? [texts.absenceGreeting.trim(), ''] : []),
    intro.trim(),
    '',
    ...lines,
    '',
    ...(texts.absenceClosing.trim() ? [texts.absenceClosing.trim()] : []),
    sender,
  ].join('\n')
}
