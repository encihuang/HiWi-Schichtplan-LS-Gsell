// Datumslogik: alle Daten als ISO-Strings "YYYY-MM-DD" (ohne Zeitzone).

export type PeriodKind = 'ws' | 'vfz_ws' | 'ss' | 'vfz_ss'

export const PERIOD_KINDS: PeriodKind[] = ['ws', 'vfz_ws', 'ss', 'vfz_ss']

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  ws: 'Wintersemester',
  vfz_ws: 'Vorlesungsfreie Zeit Wintersemester',
  ss: 'Sommersemester',
  vfz_ss: 'Vorlesungsfreie Zeit Sommersemester',
}

export const PERIOD_SHORT: Record<PeriodKind, string> = {
  ws: 'WiSe',
  vfz_ws: 'VFZ WiSe',
  ss: 'SoSe',
  vfz_ss: 'VFZ SoSe',
}

export const isLecture = (k: PeriodKind) => k === 'ws' || k === 'ss'

export const LMU_VORLESUNGSZEITEN_URL =
  'https://www.lmu.de/de/workspace-fuer-studierende/1x1-des-studiums/vorlesungszeiten/'

const toDate = (iso: string) => new Date(iso + 'T00:00:00Z')
const toIso = (d: Date) => d.toISOString().slice(0, 10)

export const addDays = (iso: string, n: number) => {
  const d = toDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return toIso(d)
}

/** 1 = Montag … 7 = Sonntag */
export const weekday = (iso: string) => ((toDate(iso).getUTCDay() + 6) % 7) + 1

export const isWeekend = (iso: string) => weekday(iso) > 5

export function eachDay(start: string, end: string): string[] {
  const out: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d)
  return out
}

export const todayIso = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date())

export const formatDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export const formatDateTime = (ts: string | Date) =>
  new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(ts))

export const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']
export const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
export const MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

// --- Vorlesungszeiten der LMU ---------------------------------------------
// Offizielle Daten von LMU_VORLESUNGSZEITEN_URL; spätere Jahre nach der Satzung:
// Beginn am Montag der vorletzten vollen Kalenderwoche im Oktober (WiSe, 17 Wochen)
// bzw. April (SoSe, 14 Wochen), Ende am Freitag der letzten Woche.

const KNOWN_WS: Record<number, [string, string]> = {
  2024: ['2024-10-14', '2025-02-07'],
  2025: ['2025-10-13', '2026-02-06'],
  2026: ['2026-10-12', '2027-02-05'],
  2027: ['2027-10-18', '2028-02-11'],
}
const KNOWN_SS: Record<number, [string, string]> = {
  2025: ['2025-04-23', '2025-07-25'],
  2026: ['2026-04-13', '2026-07-17'],
  2027: ['2027-04-12', '2027-07-16'],
}

function secondToLastFullWeekMonday(year: number, month: number) {
  // letzter Tag des Monats, dann zurück zum letzten Sonntag
  const last = new Date(Date.UTC(year, month, 0))
  const back = last.getUTCDay() // 0 = Sonntag
  last.setUTCDate(last.getUTCDate() - back)
  return addDays(toIso(last), -6 - 7)
}

function lecture(year: number, month: number, weeks: number): [string, string] {
  const start = secondToLastFullWeekMonday(year, month)
  return [start, addDays(start, (weeks - 1) * 7 + 4)]
}

export const wsLecture = (y: number) => KNOWN_WS[y] ?? lecture(y, 10, 17)
export const ssLecture = (y: number) => KNOWN_SS[y] ?? lecture(y, 4, 14)

/** Studienjahr y = WiSe y/y+1 mit anschließendem SoSe y+1 und den vorlesungsfreien Zeiten. */
export function academicYearPeriods(y: number): Record<PeriodKind, [string, string]> {
  const ws = wsLecture(y)
  const ss = ssLecture(y + 1)
  const nextWs = wsLecture(y + 1)
  return {
    ws,
    vfz_ws: [addDays(ws[1], 1), addDays(ss[0], -1)],
    ss,
    vfz_ss: [addDays(ss[1], 1), addDays(nextWs[0], -1)],
  }
}

export const yearLabel = (y: number) => `${y}/${String((y + 1) % 100).padStart(2, '0')}`

/** z. B. „WiSe 2025/26“ bzw. „SoSe 2026“ für einen Zeitraum des Studienjahrs y */
export const semesterLabel = (kind: PeriodKind, y: number) =>
  kind === 'ws' || kind === 'vfz_ws' ? `WiSe ${yearLabel(y)}` : `SoSe ${y + 1}`

// --- Feiertage in Bayern (München) ------------------------------------------

function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return toIso(new Date(Date.UTC(y, month - 1, day)))
}

export function bavarianHolidays(y: number): { date: string; name: string }[] {
  const e = easter(y)
  const p = (m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  return [
    { date: p(1, 1), name: 'Neujahr' },
    { date: p(1, 6), name: 'Heilige Drei Könige' },
    { date: addDays(e, -2), name: 'Karfreitag' },
    { date: addDays(e, 1), name: 'Ostermontag' },
    { date: p(5, 1), name: 'Tag der Arbeit' },
    { date: addDays(e, 39), name: 'Christi Himmelfahrt' },
    { date: addDays(e, 50), name: 'Pfingstmontag' },
    { date: addDays(e, 60), name: 'Fronleichnam' },
    { date: p(8, 15), name: 'Mariä Himmelfahrt' },
    { date: p(10, 3), name: 'Tag der Deutschen Einheit' },
    { date: p(11, 1), name: 'Allerheiligen' },
    { date: p(12, 25), name: '1. Weihnachtstag' },
    { date: p(12, 26), name: '2. Weihnachtstag' },
  ]
}

export function holidaysBetween(start: string, end: string) {
  const years = new Set([Number(start.slice(0, 4)), Number(end.slice(0, 4))])
  for (let y = Number(start.slice(0, 4)); y <= Number(end.slice(0, 4)); y++) years.add(y)
  return [...years]
    .flatMap(bavarianHolidays)
    .filter((h) => h.date >= start && h.date <= end)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Weihnachtspause der LMU (24.12.–06.01.): Werktage im Zeitraum, die kein Feiertag sind. */
export function christmasBreakBetween(start: string, end: string) {
  const holidays = new Set(holidaysBetween(start, end).map((h) => h.date))
  const out: { date: string; name: string }[] = []
  for (let y = Number(start.slice(0, 4)) - 1; y <= Number(end.slice(0, 4)); y++) {
    for (const d of eachDay(`${y}-12-24`, `${y + 1}-01-06`)) {
      if (d >= start && d <= end && !isWeekend(d) && !holidays.has(d)) out.push({ date: d, name: 'Weihnachtspause' })
    }
  }
  return out
}

/**
 * Tage mit gleichem Namen zu Zeiträumen zusammenfassen, wenn dazwischen nur Wochenenden
 * oder andere freie Tage liegen (z. B. Weihnachtspause mit den Feiertagen darin).
 */
export function groupClosedDays(days: { date: string; name: string }[]) {
  const all = new Set(days.map((d) => d.date))
  const groups: { from: string; to: string; name: string }[] = []
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    const prev = groups.findLast((g) => g.name === d.name)
    const bridged =
      prev && eachDay(addDays(prev.to, 1), addDays(d.date, -1)).every((x) => isWeekend(x) || all.has(x))
    if (prev && bridged) prev.to = d.date
    else groups.push({ from: d.date, to: d.date, name: d.name })
  }
  return groups.sort((a, b) => a.from.localeCompare(b.from))
}
