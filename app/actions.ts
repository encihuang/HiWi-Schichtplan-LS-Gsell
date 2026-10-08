'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { query } from '@/lib/db'
import {
  addLog, createYear, getPeriod, getStaff, listClosedDays, listYears, ROLE_LABELS, workdaysOf,
} from '@/lib/data'
import { formatDate, PERIOD_KINDS, todayIso, WEEKDAYS, wsLecture, yearLabel, isLecture } from '@/lib/dates'
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

export async function toggleWeekly(fd: FormData) {
  const me = await requireStaff()
  const period = await getPeriod(num(fd, 'period'))
  const day = num(fd, 'weekday')
  const role = str(fd, 'role') as 'ap' | 'support'
  if (!period || !isLecture(period.kind) || !(day >= 1 && day <= 5) || !(role in ROLE_LABELS)) return
  const label = `${WEEKDAYS[day - 1]} · ${ROLE_LABELS[role]}`
  const [slot] = await query<{ staff_id: number }>(
    'select staff_id from weekly_slots where period_id = $1 and weekday = $2 and role = $3',
    [period.id, day, role],
  )
  if (slot) {
    if (slot.staff_id !== me.id && !(await canEditOthers())) return
    await query('delete from weekly_slots where period_id = $1 and weekday = $2 and role = $3', [period.id, day, role])
    const who = slot.staff_id === me.id ? '' : ` (${(await getStaff(slot.staff_id))?.name})`
    await addLog(period.id, me.name, `${label} freigegeben${who}`)
  } else {
    // Niemand übernimmt am selben Tag beide Rollen.
    const [dup] = await query('select 1 from weekly_slots where period_id = $1 and weekday = $2 and staff_id = $3', [
      period.id, day, me.id,
    ])
    if (dup) return
    const done = await query(
      `insert into weekly_slots (period_id, weekday, role, staff_id, updated_by) values ($1, $2, $3, $4, $5)
       on conflict do nothing returning 1`,
      [period.id, day, role, me.id, me.name],
    )
    if (done.length) await addLog(period.id, me.name, `${label} übernommen`)
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
  if (!name) return
  if (id) {
    await query(
      'update staff set name = $2, hours_per_week = $3, start_date = $4, end_date = $5, active = $6 where id = $1',
      [id, name, hours, start, end, active],
    )
    await addLog(null, await actorName(), `Hilfskraft ${name} geändert`)
  } else {
    await query(
      `insert into staff (name, hours_per_week, start_date, end_date, active) values ($1, $2, $3, $4, true)
       on conflict (name) do nothing`,
      [name, hours, start, end],
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

