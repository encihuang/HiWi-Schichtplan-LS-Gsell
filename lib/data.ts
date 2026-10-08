import 'server-only'
import { query } from './db'
import {
  academicYearPeriods, eachDay, holidaysBetween, isWeekend, PERIOD_KINDS, todayIso,
  type PeriodKind,
} from './dates'

export type Staff = {
  id: number
  name: string
  hours_per_week: number
  start_date: string | null
  end_date: string | null
  active: boolean
}
export type Year = { id: number; start_year: number }
export type Period = { id: number; year_id: number; kind: PeriodKind; start_date: string; end_date: string }
export type ClosedDay = { date: string; name: string }
export type WeeklySlot = { weekday: number; role: 'ap' | 'support'; staff_id: number; updated_by: string; updated_at: string }
export type DailySlot = { date: string; staff_id: number; updated_by: string; updated_at: string }
export type LogEntry = { actor: string; message: string; at: string }

export const ROLE_LABELS = { ap: 'Ansprechpartner', support: 'Support' } as const

export async function listStaff(onlyActive = false) {
  const rows = await query<Staff>(
    `select id, name, hours_per_week::float as hours_per_week, start_date, end_date, active
     from staff ${onlyActive ? 'where active' : ''} order by name`,
  )
  return rows
}

export async function getStaff(id: number) {
  const [s] = await query<Staff>(
    'select id, name, hours_per_week::float as hours_per_week, start_date, end_date, active from staff where id = $1',
    [id],
  )
  return s
}

export const listYears = () => query<Year>('select id, start_year from years order by start_year')

export async function getYear(id: number) {
  const [y] = await query<Year>('select id, start_year from years where id = $1', [id])
  return y
}

export async function listPeriods(yearId: number) {
  const rows = await query<Period>('select * from periods where year_id = $1', [yearId])
  return PERIOD_KINDS.map((k) => rows.find((r) => r.kind === k)).filter(Boolean) as Period[]
}

export async function getPeriod(id: number) {
  const [p] = await query<Period>('select * from periods where id = $1', [id])
  return p
}

export const listClosedDays = (yearId: number) =>
  query<ClosedDay>('select date, name from closed_days where year_id = $1 order by date', [yearId])

export const listWeekly = (periodId: number) =>
  query<WeeklySlot>(
    'select weekday, role, staff_id, updated_by, updated_at from weekly_slots where period_id = $1',
    [periodId],
  )

export const listDaily = (periodId: number) =>
  query<DailySlot>(
    'select date, staff_id, updated_by, updated_at from daily_slots where period_id = $1 order by date',
    [periodId],
  )

export const listLog = (periodId: number | null, limit = 8) =>
  query<LogEntry>(
    `select actor, message, at from changelog where period_id ${periodId === null ? 'is null' : '= $2'}
     order by at desc, id desc limit $1`,
    periodId === null ? [limit] : [limit, periodId],
  )

export async function addLog(periodId: number | null, actor: string, message: string) {
  await query('insert into changelog (period_id, actor, message) values ($1, $2, $3)', [periodId, actor, message])
}

/** Legt ein Studienjahr mit den vier Zeiträumen und den Feiertagen an. */
export async function createYear(startYear: number) {
  const [y] = await query<Year>(
    'insert into years (start_year) values ($1) on conflict (start_year) do nothing returning id, start_year',
    [startYear],
  )
  if (!y) return null
  const periods = academicYearPeriods(startYear)
  for (const k of PERIOD_KINDS) {
    await query('insert into periods (year_id, kind, start_date, end_date) values ($1, $2, $3, $4)', [
      y.id, k, periods[k][0], periods[k][1],
    ])
  }
  for (const h of holidaysBetween(periods.ws[0], periods.vfz_ss[1])) {
    await query('insert into closed_days (year_id, date, name) values ($1, $2, $3) on conflict do nothing', [
      y.id, h.date, h.name,
    ])
  }
  return y
}

/** Jahr, das heute enthält; sonst das späteste. */
export async function currentYearAndPeriod() {
  const today = todayIso()
  const [p] = await query<Period>(
    'select * from periods where start_date <= $1 and end_date >= $1 order by start_date limit 1',
    [today],
  )
  return p
}

// --- Berechnung --------------------------------------------------------------

export type CalcRow = {
  staff: Staff
  workdays: number
  weighted: number
  share: number
  target: number
  assigned: number
  delta: number
}

const overlap = (s: Staff, start: string, end: string): [string, string] | null => {
  const a = s.start_date && s.start_date > start ? s.start_date : start
  const b = s.end_date && s.end_date < end ? s.end_date : end
  return a <= b ? [a, b] : null
}

export function workdaysOf(period: Period, closed: ClosedDay[]) {
  const closedSet = new Set(closed.map((c) => c.date))
  return eachDay(period.start_date, period.end_date).filter((d) => !isWeekend(d) && !closedSet.has(d))
}

/** Vorlesungsfreie Zeit: wie im Excel-Blatt „Berechnung" (Werktage × h/5, Anteil an allen Arbeitstagen). */
export function calcDaily(period: Period, staff: Staff[], closed: ClosedDay[], slots: DailySlot[]): CalcRow[] {
  const days = workdaysOf(period, closed)
  const rows = staff
    .map((s) => {
      const range = overlap(s, period.start_date, period.end_date)
      const workdays = range ? days.filter((d) => d >= range[0] && d <= range[1]).length : 0
      return { staff: s, workdays, weighted: (workdays * s.hours_per_week) / 5 }
    })
    .filter((r) => r.workdays > 0)
  const total = rows.reduce((a, r) => a + r.weighted, 0)
  return rows.map((r) => {
    const share = total ? r.weighted / total : 0
    const target = share * days.length
    const assigned = slots.filter((x) => x.staff_id === r.staff.id).length
    return { ...r, share, target, assigned, delta: assigned - target }
  })
}

/** Vorlesungszeit: Soll-Tage pro Woche = Anteil an den Wochenstunden × 5. */
export function calcWeekly(period: Period, staff: Staff[], slots: WeeklySlot[]): CalcRow[] {
  const rows = staff.filter((s) => overlap(s, period.start_date, period.end_date))
  const total = rows.reduce((a, s) => a + s.hours_per_week, 0)
  return rows.map((s) => {
    const share = total ? s.hours_per_week / total : 0
    const target = share * 5
    const assigned = new Set(slots.filter((x) => x.staff_id === s.id).map((x) => x.weekday)).size
    return { staff: s, workdays: 0, weighted: s.hours_per_week, share, target, assigned, delta: assigned - target }
  })
}

