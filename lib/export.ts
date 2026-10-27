import 'server-only'
import {
  calcDaily, calcWeekly, coverageIssues, isHiwi, lectureRoster, DUTY_LABELS, getPeriod, getYear, listAvailability, listClosedDays, listDaily,
  listDuties, listExceptions, listExtras, listLectures, listLog, listRecurringTakes, listSpecialTasks, listStaff, occurrences, repeatText, type AvailabilityStatus, type CalcResult,
} from './data'
import {
  addDays, eachDay, formatDate, groupClosedDays, formatDateTime, isLecture, PERIOD_LABELS, PERIOD_SHORT, semesterLabel, WEEKDAYS, weekday,
} from './dates'

const NL = String.fromCharCode(10)

const isoWeek = (iso: string) => {
  const d = new Date(addDays(iso, 4 - weekday(iso)) + 'T00:00:00Z') // Donnerstag der Woche
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1)
  return Math.floor((+d - jan1) / 86400000 / 7) + 1
}

/** Kalender KW × Mo–Fr; text(d) liefert den Zellinhalt unter dem Datum */
function calendarGrid(start: string, end: string, text: (d: string) => string): string[][] {
  const mondays = [...new Set(eachDay(start, end).map((d) => addDays(d, 1 - weekday(d))))]
  return [
    ['KW', ...WEEKDAYS],
    ...mondays
      .map((mon) => [
        String(isoWeek(mon)),
        ...[0, 1, 2, 3, 4].map((i) => {
          const d = addDays(mon, i)
          if (d < start || d > end) return ''
          return `${formatDate(d).slice(0, 6)}${NL}${text(d)}`
        }),
      ])
      .filter((row) => row.slice(1).some(Boolean)),
  ]
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
  /** Verfügbarkeit je Zelle (gleiche Form wie grid), für die Farben */
  gridStatus?: (AvailabilityStatus | null)[][]
  /** weitere Tabellen (Vorlesungen), erste Zeile = Kopf */
  extra: { title: string; grid: string[][] }[]
  calc: CalcResult
  /** Werktage, Wochen, Feiertage als Text */
  facts: string[]
  /** Name -> E-Mail (nur wenn hinterlegt), für mailto-Links */
  emails: Record<string, string>
}

export async function loadExport(periodId: number): Promise<ExportData | null> {
  const period = await getPeriod(periodId)
  if (!period) return null
  const year = await getYear(period.year_id)
  const [staff, closed, log] = await Promise.all([listStaff(), listClosedDays(period.year_id), listLog(period.id, 1)])
  const names = Object.fromEntries(staff.map((s) => [s.id, s.name]))
  const active = staff.filter((s) => s.active && isHiwi(s))
  const lecture = isLecture(period.kind)

  let grid: string[][]
  let calc: CalcResult
  let gridStatus: ExportData['gridStatus']
  const extra: ExportData['extra'] = []
  if (lecture) {
    const [duties, availability, lectures, exceptions, extras] = await Promise.all([
      listDuties(period.id), listAvailability(period.id), listLectures(period.id),
      listExceptions(period.id), listExtras(period.id),
    ])
    calc = calcWeekly(period, active, closed, duties, exceptions, extras)
    const people = calc.rows.map((r) => r.staff)
    const days = [1, 2, 3, 4, 5]
    const status = (sid: number, d: number) => availability.find((a) => a.staff_id === sid && a.weekday === d)?.status ?? null
    const coverage = days.map((d) =>
      [
        ...duties.filter((x) => x.weekday === d).map((x) => `${names[x.staff_id]} (${DUTY_LABELS[x.kind]})`),
        ...coverageIssues(d, duties, availability, names).map((i) => `! ${i}`),
      ].join('\n'),
    )
    grid = [
      ['', ...WEEKDAYS],
      ...people.map((s) => [
        s.name,
        ...days.map((d) => {
          const x = duties.find((y) => y.staff_id === s.id && y.weekday === d)
          return x ? DUTY_LABELS[x.kind] : ''
        }),
      ]),
      ['Besetzung', ...coverage],
    ]
    gridStatus = [[], ...people.map((s) => [null, ...days.map((d) => status(s.id, d))]), []]
    // Kalender: Wochenplan je Datum mit Ausfällen, Vertretungen und Zusatzdiensten
    const byClosedL = new Map(closed.map((c) => [c.date, c.name]))
    extra.push({
      title: 'Kalender',
      grid: calendarGrid(period.start_date, period.end_date, (d) => {
        const holiday = byClosedL.get(d)
        if (holiday) return holiday
        const lines = lectureRoster(d, duties, exceptions, extras, names).map((r) =>
          r.problem ? `! ${names[r.staff_id]} ${r.label}` : `${names[r.staff_id]} (${r.label})`,
        )
        return lines.length ? lines.join(NL) : 'unbesetzt'
      }),
    })

    // Abweichungen an einzelnen Tagen
    const closedSet = new Set(closed.map((c) => c.date))
    const changes = [
      ...exceptions
        .filter((e) => duties.some((x) => x.staff_id === e.staff_id && x.weekday === weekday(e.date)))
        .map((e) => ({ date: e.date, text: [names[e.staff_id], e.substitute_id ? `${names[e.substitute_id]} (Vertretung)` : 'Vertretung offen'] })),
      ...extras.map((e) => ({ date: e.date, text: ['', `${names[e.staff_id]} (zusätzlich)`] })),
    ]
      .filter((c) => !closedSet.has(c.date) && c.date >= period.start_date && c.date <= period.end_date)
      .sort((a, b) => a.date.localeCompare(b.date))
    if (changes.length) {
      extra.push({
        title: 'Abweichungen an einzelnen Tagen',
        grid: [
          ['Datum', 'Fällt aus', 'Vertretung / zusätzlich'],
          ...changes.map((c) => [`${WEEKDAYS[weekday(c.date) - 1].slice(0, 2)}, ${formatDate(c.date)}`, ...c.text]),
        ],
      })
    }

    const lectureNames = [...new Set(lectures.map((l) => l.name))]
    if (lectureNames.length) {
      extra.push({
        title: 'Vorlesungen Prof. Gsell und weitere Aufgaben',
        grid: [
          ['', ...WEEKDAYS],
          ...lectureNames.map((n) => [
            n,
            ...days.map((d) => {
              const l = lectures.find((x) => x.name === n && x.weekday === d)
              if (!l) return ''
              return [l.staff_id ? names[l.staff_id] : 'offen', l.time].filter(Boolean).join('\n')
            }),
          ]),
        ],
      })
    }
  } else {
    const slots = await listDaily(period.id)
    const bySlot = new Map(slots.map((s) => [s.date, names[s.staff_id]]))
    const byClosed = new Map(closed.map((c) => [c.date, c.name]))
    grid = calendarGrid(period.start_date, period.end_date, (d) => byClosed.get(d) ?? bySlot.get(d) ?? '-')
    calc = calcDaily(period, active, closed, slots)
  }

  const [all, takes] = await Promise.all([listSpecialTasks(period.id), listRecurringTakes(period.id)])
  const recurring = all.filter((t) => t.repeat !== 'none')
  if (recurring.length) {
    extra.push({
      title: 'Wiederkehrende Aufgaben',
      grid: [
        ['Aufgabe', 'Wann', 'Termine'],
        ...recurring.map((t) => [
          t.name,
          repeatText(t),
          occurrences(t, period, closed)
            .map((d) => {
              const take = takes.find((x) => x.task_id === t.id && x.date === d)
              return `${formatDate(d).slice(0, 6)} ${take ? names[take.staff_id] ?? '?' : 'offen'}`
            })
            .join(', '),
        ]),
      ],
    })
  }
  const tasks = all.filter((t) => t.repeat === 'none')
  if (tasks.length) {
    extra.push({
      title: 'Sonderaufgaben',
      grid: [['Aufgabe', 'Zuständig', 'Notiz'], ...tasks.map((t) => [t.name, t.staff_id ? names[t.staff_id] : 'offen', t.note])],
    })
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
    gridStatus,
    extra,
    calc,
    emails: Object.fromEntries(staff.filter((s) => s.email && isHiwi(s)).map((s) => [s.name, s.email])),
    facts: [
      `Werktage im Zeitraum: ${calc.totalWorkdays} (Mo-Fr ohne Feier- und Schließtage), ${calc.weeks.toLocaleString('de-DE')} Wochen`,
      `Feier- und Schließtage im Zeitraum: ${
        calc.holidays.length
          ? groupClosedDays(calc.holidays)
              .map((h) =>
                h.from === h.to
                  ? `${formatDate(h.from)} ${h.name}${weekday(h.from) > 5 ? ' (Wochenende)' : ''}`
                  : `${formatDate(h.from)}-${formatDate(h.to)} ${h.name}`,
              )
              .join(', ')
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
