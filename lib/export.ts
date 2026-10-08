import 'server-only'
import {
  calcDaily, calcWeekly, getPeriod, getYear, listClosedDays, listDaily, listLog, listStaff, listWeekly,
  ROLE_LABELS, type CalcResult,
} from './data'
import {
  addDays, eachDay, formatDate, formatDateTime, isLecture, PERIOD_LABELS, PERIOD_SHORT, semesterLabel, WEEKDAYS, weekday,
} from './dates'

const isoWeek = (iso: string) => {
  const d = new Date(addDays(iso, 4 - weekday(iso)) + 'T00:00:00Z') // Donnerstag der Woche
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1)
  return Math.floor((+d - jan1) / 86400000 / 7) + 1
}

export type ExportData = {
  title: string
  subtitle: string
  fileName: string
  stand: string
  lastChange: string
  lecture: boolean
  /** Tabelle für den Plan: erste Zeile = Kopf */
  grid: string[][]
  calc: CalcResult
  /** Werktage, Wochen, Feiertage als Text */
  facts: string[]
}

export async function loadExport(periodId: number): Promise<ExportData | null> {
  const period = await getPeriod(periodId)
  if (!period) return null
  const year = await getYear(period.year_id)
  const [staff, closed, log] = await Promise.all([listStaff(), listClosedDays(period.year_id), listLog(period.id, 1)])
  const names = Object.fromEntries(staff.map((s) => [s.id, s.name]))
  const active = staff.filter((s) => s.active)
  const lecture = isLecture(period.kind)

  let grid: string[][]
  let calc: CalcResult
  if (lecture) {
    const slots = await listWeekly(period.id)
    grid = [
      ['', ...WEEKDAYS],
      ...(['ap', 'support'] as const).map((role) => [
        ROLE_LABELS[role],
        ...WEEKDAYS.map((_, i) => {
          const s = slots.find((x) => x.weekday === i + 1 && x.role === role)
          return s ? names[s.staff_id] : ''
        }),
      ]),
    ]
    calc = calcWeekly(period, active, closed, slots)
  } else {
    const slots = await listDaily(period.id)
    const bySlot = new Map(slots.map((s) => [s.date, names[s.staff_id]]))
    const byClosed = new Map(closed.map((c) => [c.date, c.name]))
    const mondays = [...new Set(eachDay(period.start_date, period.end_date).map((d) => addDays(d, 1 - weekday(d))))]
    grid = [
      ['KW', ...WEEKDAYS],
      ...mondays
        .map((mon) => [
          String(isoWeek(mon)),
          ...[0, 1, 2, 3, 4].map((i) => {
            const d = addDays(mon, i)
            if (d < period.start_date || d > period.end_date) return ''
            const who = byClosed.get(d) ?? bySlot.get(d) ?? '-'
            return `${formatDate(d).slice(0, 6)}\n${who}`
          }),
        ])
        .filter((row) => row.slice(1).some(Boolean)),
    ]
    calc = calcDaily(period, active, closed, slots)
  }

  const sem = year ? semesterLabel(period.kind, year.start_year) : ''
  const last = log[0]
  return {
    title: `${PERIOD_LABELS[period.kind]} ${sem.replace(/^\S+ /, '')}`,
    subtitle: `${formatDate(period.start_date)} bis ${formatDate(period.end_date)}`,
    fileName: `Schichtplan ${PERIOD_SHORT[period.kind]} ${sem.replace(/^\S+ /, '').replace('/', '-')}`,
    stand: `Stand: ${formatDateTime(new Date())} Uhr`,
    lastChange: last ? `Zuletzt geändert von ${last.actor} am ${formatDateTime(last.at)} Uhr` : 'Noch keine Änderungen',
    lecture,
    grid,
    calc,
    facts: [
      `Werktage im Zeitraum: ${calc.totalWorkdays} (Mo-Fr ohne Feiertage), ${calc.weeks.toLocaleString('de-DE')} Wochen`,
      `Feiertage im Zeitraum: ${
        calc.holidays.length
          ? calc.holidays.map((h) => `${formatDate(h.date)} ${h.name}${weekday(h.date) > 5 ? ' (Wochenende)' : ''}`).join(', ')
          : 'keine'
      }`,
    ],
  }
}

export const calcHeader = (lecture: boolean) => [
  'Name', 'h/Woche', 'Beginn', 'Ende', 'Werktage', 'Tage gewichtet', 'Anteil', 'Soll Tage', 'Soll gerundet',
  ...(lecture ? ['Soll/Woche', 'Ist/Woche'] : []), 'Eingeteilt', 'Differenz',
]

const de = (v: number, digits = 1) => v.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })

export const calcRowsText = (rows: CalcResult['rows'], lecture: boolean) =>
  rows.map((r) => [
    r.staff.name,
    de(r.staff.hours_per_week, 0),
    formatDate(r.from),
    formatDate(r.to),
    String(r.workdays),
    de(r.weighted),
    `${de(r.share * 100)} %`,
    de(r.target),
    String(r.targetRounded),
    ...(lecture ? [de(r.perWeekTarget ?? 0), String(r.perWeekAssigned ?? 0)] : []),
    String(r.assigned),
    `${r.delta > 0 ? '+' : ''}${de(r.delta)}`,
  ])

export const contentDisposition = (name: string, ext: string) => {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_')
  return `attachment; filename="${ascii}.${ext}"; filename*=UTF-8''${encodeURIComponent(`${name}.${ext}`)}`
}
