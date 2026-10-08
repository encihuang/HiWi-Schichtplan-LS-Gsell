'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { query } from '@/lib/db'
import {
  addLog, AVAILABILITY_LABELS, createYear, DUTY_LABELS, getPeriod, getStaff, listClosedDays, listYears, workdaysOf,
  type AvailabilityStatus, type DutyKind,
} from '@/lib/data'
import { formatDate, PERIOD_KINDS, todayIso, WEEKDAYS, weekday, wsLecture, yearLabel, isLecture } from '@/lib/dates'
import {
  ACCESS_COOKIE, ADMIN_COOKIE, canEditOthers, currentStaff, requireAdmin, requireStaff, sha256, STAFF_COOKIE,
} from '@/lib/session'

const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 24 * 365 }

const num = (fd: FormData, k: string) => Number(fd.get(k))
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()
const isoOrNull = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

async function actorName() {
  return (await currentStaff())?.name ?? 'Verwaltung'
}

// --- Anmeldung ---------------------------------------------------------------

export async function selectStaff(fd: FormData) {
  const s = await getStaff(num(fd, 'id'))
  if (!s?.active) redirect('/')
  ;(await cookies()).set(STAFF_COOKIE, String(s.id), COOKIE_OPTS)
  redirect('/plan')
}

export async function switchStaff() {
  ;(await cookies()).delete(STAFF_COOKIE)
  redirect('/')
}

export async function login(_: string | null, fd: FormData) {
  const kind = str(fd, 'kind') === 'admin' ? 'admin' : 'access'
  const expected = kind === 'admin' ? process.env.ADMIN_PASSWORD : process.env.APP_PASSWORD
  const next = str(fd, 'next')
  if (!expected || str(fd, 'password') !== expected) return 'Falsches Passwort.'
  ;(await cookies()).set(kind === 'admin' ? ADMIN_COOKIE : ACCESS_COOKIE, await sha256(expected), COOKIE_OPTS)
  redirect(next.startsWith('/') ? next : '/')
}

// --- Jahre -------------------------------------------------------------------

export async function addYear() {
  const years = await listYears()
  const today = todayIso()
  // Erstes Jahr = das laufende (beginnt mit der WiSe-Vorlesungszeit).
  const y0 = Number(today.slice(0, 4))
  const current = today >= wsLecture(y0)[0] ? y0 : y0 - 1
  const next = years.length ? years[years.length - 1].start_year + 1 : current
  const y = await createYear(next)
  if (y) await addLog(null, await actorName(), `Studienjahr ${yearLabel(next)} angelegt`)
  revalidatePath('/', 'layout')
  redirect(y ? `/plan/${y.id}` : '/plan')
}

// --- Schichten ---------------------------------------------------------------

/** Zeile einer anderen Person nur mit Einstellungs-Anmeldung (ADMIN_PASSWORD). */
async function targetStaff(fd: FormData) {
  const me = await requireStaff()
  const id = num(fd, 'staff') || me.id
  if (id !== me.id && !(await canEditOthers())) return null
  const s = id === me.id ? me : await getStaff(id)
  return s ? { me, target: s } : null
}

async function lecturePeriod(fd: FormData) {
  const period = await getPeriod(num(fd, 'period'))
  return period && isLecture(period.kind) ? period : null
}

const dayOk = (d: number) => d >= 1 && d <= 5
const forWhom = (me: { id: number }, t: { id: number; name: string }) => (t.id === me.id ? '' : ` für ${t.name}`)

export async function setDuty(fd: FormData) {
  const who = await targetStaff(fd)
  const period = await lecturePeriod(fd)
  const day = num(fd, 'weekday')
  const kind = str(fd, 'kind')
  if (!who || !period || !dayOk(day)) return
  const label = WEEKDAYS[day - 1]
  if (!kind) {
    const done = await query(
      'delete from weekly_duties where period_id = $1 and staff_id = $2 and weekday = $3 returning 1',
      [period.id, who.target.id, day],
    )
    if (done.length) await addLog(period.id, who.me.name, `${label}: Dienst entfernt${forWhom(who.me, who.target)}`)
  } else if (kind in DUTY_LABELS) {
    await query(
      `insert into weekly_duties (period_id, staff_id, weekday, kind, updated_by) values ($1, $2, $3, $4, $5)
       on conflict (period_id, staff_id, weekday) do update set kind = $4, updated_by = $5, updated_at = now()`,
      [period.id, who.target.id, day, kind, who.me.name],
    )
    await addLog(
      period.id,
      who.me.name,
      `${label}: ${DUTY_LABELS[kind as DutyKind]}${forWhom(who.me, who.target)}`,
    )
  }
  revalidatePath('/plan', 'layout')
}

export async function setAvailability(fd: FormData) {
  const who = await targetStaff(fd)
  const period = await lecturePeriod(fd)
  const day = num(fd, 'weekday')
  const status = str(fd, 'status')
  if (!who || !period || !dayOk(day)) return
  if (!status) {
    await query('delete from availability where period_id = $1 and staff_id = $2 and weekday = $3', [
      period.id, who.target.id, day,
    ])
  } else if (status in AVAILABILITY_LABELS) {
    await query(
      `insert into availability (period_id, staff_id, weekday, status) values ($1, $2, $3, $4)
       on conflict (period_id, staff_id, weekday) do update set status = $4, updated_at = now()`,
      [period.id, who.target.id, day, status],
    )
  }
  await addLog(
    period.id,
    who.me.name,
    `${WEEKDAYS[day - 1]}: Verfügbarkeit ${status ? `„${AVAILABILITY_LABELS[status as AvailabilityStatus]}“` : 'zurückgesetzt'}${forWhom(who.me, who.target)}`,
  )
  revalidatePath('/plan', 'layout')
}

/** Vorlesung oder weitere Aufgabe an einem oder mehreren Wochentagen anlegen. */
export async function addLecture(fd: FormData) {
  const me = await requireStaff()
  const period = await lecturePeriod(fd)
  const name = str(fd, 'name')
  const time = str(fd, 'time')
  const days = fd.getAll('weekday').map(Number).filter(dayOk)
  if (!period || !name || !days.length) return
  for (const d of days) {
    await query(
      `insert into lectures (period_id, name, weekday, time) values ($1, $2, $3, $4)
       on conflict (period_id, name, weekday) do update set time = $4`,
      [period.id, name, d, time],
    )
  }
  await addLog(period.id, me.name, `„${name}“ angelegt (${days.map((d) => WEEKDAYS[d - 1].slice(0, 2)).join(', ')})`)
  revalidatePath('/plan', 'layout')
}

export async function deleteLecture(fd: FormData) {
  const me = await requireStaff()
  const period = await lecturePeriod(fd)
  const name = str(fd, 'name')
  if (!period || !name) return
  await query('delete from lectures where period_id = $1 and name = $2', [period.id, name])
  await addLog(period.id, me.name, `„${name}“ gelöscht`)
  revalidatePath('/plan', 'layout')
}

/** Betreuung einer Vorlesung an einem Tag übernehmen bzw. freigeben. */
export async function toggleLecture(fd: FormData) {
  const me = await requireStaff()
  const [l] = await query<{ id: number; period_id: number; name: string; weekday: number; staff_id: number | null }>(
    'select id, period_id, name, weekday, staff_id from lectures where id = $1',
    [num(fd, 'lecture')],
  )
  if (!l) return
  const label = `„${l.name}“ ${WEEKDAYS[l.weekday - 1]}`
  if (l.staff_id) {
    if (l.staff_id !== me.id && !(await canEditOthers())) return
    await query('update lectures set staff_id = null, updated_by = $2, updated_at = now() where id = $1', [l.id, me.name])
    const who = l.staff_id === me.id ? '' : ` (${(await getStaff(l.staff_id))?.name})`
    await addLog(l.period_id, me.name, `${label} freigegeben${who}`)
  } else {
    const done = await query(
      'update lectures set staff_id = $2, updated_by = $3, updated_at = now() where id = $1 and staff_id is null returning 1',
      [l.id, me.id, me.name],
    )
    if (done.length) await addLog(l.period_id, me.name, `${label} übernommen`)
  }
  revalidatePath('/plan', 'layout')
}

/**
 * Ausnahmen in der Vorlesungszeit:
 * absent = ich kann an diesem Datum nicht, present = doch da,
 * cover = Vertretung für "staff" übernehmen, uncover = Vertretung abgeben,
 * extra / unextra = an diesem Datum zusätzlich Dienst.
 */
export async function dateException(fd: FormData) {
  const me = await requireStaff()
  const period = await lecturePeriod(fd)
  const date = isoOrNull(str(fd, 'date'))
  const op = str(fd, 'op')
  if (!period || !date) return
  if (!workdaysOf(period, await listClosedDays(period.year_id)).includes(date)) return
  const day = formatDate(date)

  if (op === 'absent' || op === 'present') {
    const [duty] = await query('select 1 from weekly_duties where period_id = $1 and staff_id = $2 and weekday = $3', [
      period.id, me.id, weekday(date),
    ])
    if (!duty) return
    if (op === 'absent') {
      await query(
        `insert into date_exceptions (period_id, date, staff_id, updated_by) values ($1, $2, $3, $4)
         on conflict do nothing`,
        [period.id, date, me.id, me.name],
      )
      await addLog(period.id, me.name, `${day}: kann nicht (Vertretung gesucht)`)
    } else {
      await query('delete from date_exceptions where period_id = $1 and date = $2 and staff_id = $3', [period.id, date, me.id])
      await addLog(period.id, me.name, `${day}: doch da`)
    }
  } else if (op === 'extra') {
    const done = await query(
      'insert into date_extras (period_id, date, staff_id, updated_by) values ($1, $2, $3, $4) on conflict do nothing returning 1',
      [period.id, date, me.id, me.name],
    )
    if (done.length) await addLog(period.id, me.name, `${day}: zusätzlich Dienst`)
  } else if (op === 'unextra') {
    const done = await query('delete from date_extras where period_id = $1 and date = $2 and staff_id = $3 returning 1', [
      period.id, date, me.id,
    ])
    if (done.length) await addLog(period.id, me.name, `${day}: zusätzlicher Dienst entfernt`)
  } else if (op === 'cover' || op === 'uncover') {
    const absentId = num(fd, 'staff')
    const absent = await getStaff(absentId)
    if (!absent) return
    if (op === 'cover') {
      const done = await query(
        `update date_exceptions set substitute_id = $4, updated_by = $5, updated_at = now()
         where period_id = $1 and date = $2 and staff_id = $3 and substitute_id is null returning 1`,
        [period.id, date, absentId, me.id, me.name],
      )
      if (done.length) await addLog(period.id, me.name, `${day}: Vertretung für ${absent.name} übernommen`)
    } else {
      const done = await query(
        `update date_exceptions set substitute_id = null, updated_by = $5, updated_at = now()
         where period_id = $1 and date = $2 and staff_id = $3 and substitute_id = $4 returning 1`,
        [period.id, date, absentId, me.id, me.name],
      )
      if (done.length) await addLog(period.id, me.name, `${day}: Vertretung für ${absent.name} abgegeben`)
    }
  }
  revalidatePath('/plan', 'layout')
}

export async function toggleDaily(fd: FormData) {
  const me = await requireStaff()
  const period = await getPeriod(num(fd, 'period'))
  const date = isoOrNull(str(fd, 'date'))
  if (!period || isLecture(period.kind) || !date) return
  const [slot] = await query<{ staff_id: number }>(
    'select staff_id from daily_slots where period_id = $1 and date = $2',
    [period.id, date],
  )
  if (slot) {
    if (slot.staff_id !== me.id && !(await canEditOthers())) return
    await query('delete from daily_slots where period_id = $1 and date = $2', [period.id, date])
    const who = slot.staff_id === me.id ? '' : ` (${(await getStaff(slot.staff_id))?.name})`
    await addLog(period.id, me.name, `${formatDate(date)} freigegeben${who}`)
  } else {
    const workdays = workdaysOf(period, await listClosedDays(period.year_id))
    if (!workdays.includes(date)) return
    const done = await query(
      `insert into daily_slots (period_id, date, staff_id, updated_by) values ($1, $2, $3, $4)
       on conflict do nothing returning 1`,
      [period.id, date, me.id, me.name],
    )
    if (done.length) await addLog(period.id, me.name, `${formatDate(date)} übernommen`)
  }
  revalidatePath('/plan', 'layout')
}

// --- Einstellungen -----------------------------------------------------------

export async function saveStaff(fd: FormData) {
  await requireAdmin()
  const id = num(fd, 'id')
  const name = str(fd, 'name')
  const hours = Math.max(0, Number(str(fd, 'hours').replace(',', '.')) || 0)
  const start = isoOrNull(str(fd, 'start'))
  const end = isoOrNull(str(fd, 'end'))
  const active = fd.get('active') === 'on'
  const email = str(fd, 'email')
  if (!name) return
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
  if (id) {
    await query(
      'update staff set name = $2, hours_per_week = $3, start_date = $4, end_date = $5, active = $6, email = $7 where id = $1',
      [id, name, hours, start, end, active, email],
    )
    await addLog(null, await actorName(), `Hilfskraft ${name} geändert`)
  } else {
    await query(
      `insert into staff (name, hours_per_week, start_date, end_date, active, email) values ($1, $2, $3, $4, true, $5)
       on conflict (name) do nothing`,
      [name, hours, start, end, email],
    )
    await addLog(null, await actorName(), `Hilfskraft ${name} hinzugefügt`)
  }
  revalidatePath('/', 'layout')
}

export async function deleteStaff(fd: FormData) {
  await requireAdmin()
  const s = await getStaff(num(fd, 'id'))
  if (!s) return
  await query('delete from staff where id = $1', [s.id])
  await addLog(null, await actorName(), `Hilfskraft ${s.name} gelöscht`)
  revalidatePath('/', 'layout')
}

export async function saveYearDates(fd: FormData) {
  await requireAdmin()
  const yearId = num(fd, 'year')
  for (const k of PERIOD_KINDS) {
    const start = isoOrNull(str(fd, `${k}_start`))
    const end = isoOrNull(str(fd, `${k}_end`))
    if (start && end && start <= end) {
      await query('update periods set start_date = $3, end_date = $4 where year_id = $1 and kind = $2', [
        yearId, k, start, end,
      ])
    }
  }
  const [y] = await query<{ start_year: number }>('select start_year from years where id = $1', [yearId])
  await addLog(null, await actorName(), `Zeiträume ${y ? yearLabel(y.start_year) : ''} geändert`)
  revalidatePath('/', 'layout')
}

export async function addClosedDay(fd: FormData) {
  await requireAdmin()
  const date = isoOrNull(str(fd, 'date'))
  const name = str(fd, 'name') || 'Geschlossen'
  if (!date) return
  await query(
    'insert into closed_days (year_id, date, name) values ($1, $2, $3) on conflict (year_id, date) do update set name = $3',
    [num(fd, 'year'), date, name],
  )
  await addLog(null, await actorName(), `Freier Tag ${formatDate(date)} (${name}) eingetragen`)
  revalidatePath('/', 'layout')
}

export async function removeClosedDay(fd: FormData) {
  await requireAdmin()
  const date = str(fd, 'date')
  await query('delete from closed_days where year_id = $1 and date = $2', [num(fd, 'year'), date])
  await addLog(null, await actorName(), `Freier Tag ${formatDate(date)} entfernt`)
  revalidatePath('/', 'layout')
}

export async function deleteYear(fd: FormData) {
  await requireAdmin()
  const [y] = await query<{ start_year: number }>('delete from years where id = $1 returning start_year', [num(fd, 'year')])
  if (y) await addLog(null, await actorName(), `Studienjahr ${yearLabel(y.start_year)} gelöscht`)
  revalidatePath('/', 'layout')
}

