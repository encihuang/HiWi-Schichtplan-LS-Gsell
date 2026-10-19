'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { query } from '@/lib/db'
import {
  ABSENCE_LABELS, addLog, AVAILABILITY_LABELS, calendarToken, createYear, getAbsence, ROLES, DUTY_LABELS, getPeriod, getStaff, listClosedDays, listYears, workdaysOf,
  type AbsenceKind, type AvailabilityStatus, type DutyKind, type Role,
} from '@/lib/data'
import { formatDate, PERIOD_KINDS, todayIso, WEEKDAYS, weekday, wsLecture, yearLabel, isLecture } from '@/lib/dates'
import {
  ACCESS_COOKIE, ADMIN_COOKIE, canEditOthers, currentStaff, isAdmin, PLAN_COOKIE, requireAdmin, requireShiftActor, requireStaff,
  sha256, STAFF_COOKIE,
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
  redirect(s.role === 'hiwi' ? '/plan' : '/abwesenheiten')
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

/** Kalender-Abo: neue geheime Adresse; die alte funktioniert danach nicht mehr. */
export async function renewCalendarToken() {
  const me = await requireStaff()
  await calendarToken(me.id, true)
  revalidatePath('/kalender')
}

// --- Planungsmodus -------------------------------------------------------------

/** Planungsmodus ein/aus. Gilt bis zum Schließen des Browsers. */
export async function setPlanningMode(fd: FormData) {
  const on = str(fd, 'on') === '1'
  const back = str(fd, 'back')
  const next = back.startsWith('/') ? back : '/plan'
  if (on && !(await isAdmin())) redirect(`/login?kind=admin&next=${encodeURIComponent(next)}`)
  const jar = await cookies()
  if (on) jar.set(PLAN_COOKIE, '1', { httpOnly: true, sameSite: 'lax', path: '/' })
  else jar.delete(PLAN_COOKIE)
  revalidatePath('/', 'layout')
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

/** Zeile einer anderen Person nur im Planungsmodus. */
async function targetStaff(fd: FormData) {
  const me = await requireShiftActor()
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
  const [who, period] = await Promise.all([targetStaff(fd), lecturePeriod(fd)])
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
  const [who, period] = await Promise.all([targetStaff(fd), lecturePeriod(fd)])
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
  const [me, period] = await Promise.all([requireShiftActor(), lecturePeriod(fd)])
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
  const [me, period] = await Promise.all([requireShiftActor(), lecturePeriod(fd)])
  const name = str(fd, 'name')
  if (!period || !name) return
  await query('delete from lectures where period_id = $1 and name = $2', [period.id, name])
  await addLog(period.id, me.name, `„${name}“ gelöscht`)
  revalidatePath('/plan', 'layout')
}

/** Betreuung einer Vorlesung an einem Tag übernehmen bzw. freigeben. */
export async function toggleLecture(fd: FormData) {
  const me = await requireShiftActor()
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

/** Planungsmodus: Person (oder 0 = frei) für eine Schicht; null, wenn nicht erlaubt bzw. unbekannt. */
async function planningAssignee(fd: FormData) {
  const [me, ok] = await Promise.all([requireStaff(), canEditOthers()])
  if (!ok) return null
  const id = num(fd, 'assignee')
  if (!id) return { me, target: null }
  const target = await getStaff(id)
  return target ? { me, target } : null
}

/** Planungsmodus: Vorlesungsbetreuung einer beliebigen Person zuweisen oder freigeben. */
export async function assignLecture(fd: FormData) {
  const who = await planningAssignee(fd)
  if (!who) return
  const [l] = await query<{ period_id: number; name: string; weekday: number }>(
    `update lectures set staff_id = $2, updated_by = $3, updated_at = now() where id = $1
     returning period_id, name, weekday`,
    [num(fd, 'lecture'), who.target?.id ?? null, who.me.name],
  )
  if (l) {
    const label = `„${l.name}“ ${WEEKDAYS[l.weekday - 1]}`
    await addLog(l.period_id, who.me.name, who.target ? `${label}: ${who.target.name} eingeteilt` : `${label} freigegeben`)
  }
  revalidatePath('/plan', 'layout')
}

/** Planungsmodus: Sonderaufgabe einer beliebigen Person zuweisen oder freigeben. */
export async function assignSpecialTask(fd: FormData) {
  const who = await planningAssignee(fd)
  if (!who) return
  const [t] = await query<{ period_id: number; name: string }>(
    `update special_tasks set staff_id = $2, updated_by = $3, updated_at = now() where id = $1
     returning period_id, name`,
    [num(fd, 'task'), who.target?.id ?? null, who.me.name],
  )
  if (t) {
    const label = `Sonderaufgabe „${t.name}“`
    await addLog(t.period_id, who.me.name, who.target ? `${label}: ${who.target.name} eingeteilt` : `${label} freigegeben`)
  }
  revalidatePath('/', 'layout')
}

/** Planungsmodus: Tag der vorlesungsfreien Zeit einer beliebigen Person zuweisen oder freigeben. */
export async function assignDaily(fd: FormData) {
  const [who, period] = await Promise.all([planningAssignee(fd), getPeriod(num(fd, 'period'))])
  const date = isoOrNull(str(fd, 'date'))
  if (!who || !period || isLecture(period.kind) || !date) return
  if (!workdaysOf(period, await listClosedDays(period.year_id)).includes(date)) return
  if (who.target) {
    await query(
      `insert into daily_slots (period_id, date, staff_id, updated_by) values ($1, $2, $3, $4)
       on conflict (period_id, date) do update set staff_id = $3, updated_by = $4, updated_at = now()`,
      [period.id, date, who.target.id, who.me.name],
    )
    await addLog(period.id, who.me.name, `${formatDate(date)}: ${who.target.name} eingeteilt`)
  } else {
    await query('delete from daily_slots where period_id = $1 and date = $2', [period.id, date])
    await addLog(period.id, who.me.name, `${formatDate(date)} freigegeben`)
  }
  revalidatePath('/plan', 'layout')
}

/**
 * Ausnahmen in der Vorlesungszeit:
 * absent = ich kann an diesem Datum nicht, present = doch da,
 * cover = Vertretung für "staff" übernehmen, uncover = Vertretung abgeben,
 * extra / unextra = an diesem Datum zusätzlich Dienst.
 * Im Planungsmodus gelten absent/present/extra/unextra für "person" (sonst für mich), und
 * substitute setzt die Vertretung ("assignee", 0 = offen) für "staff".
 */
export async function dateException(fd: FormData) {
  const [self, period, planning] = await Promise.all([requireShiftActor(), lecturePeriod(fd), canEditOthers()])
  const date = isoOrNull(str(fd, 'date'))
  const op = str(fd, 'op')
  if (!period || !date) return
  if (!workdaysOf(period, await listClosedDays(period.year_id)).includes(date)) return
  const day = formatDate(date)
  // me = betroffene Person, self = wer die Änderung vornimmt
  // Planungsmodus: betroffene Person aus "person" bzw. aus der Auswahl ("assignee", bei extra)
  const personId = op === 'substitute' ? 0 : num(fd, 'person') || num(fd, 'assignee')
  const me = planning && personId && personId !== self.id ? await getStaff(personId) : self
  if (!me) return
  const forWho = me.id === self.id ? '' : ` (${me.name})`

  if (op === 'absent' || op === 'present') {
    const [duty] = await query('select 1 from weekly_duties where period_id = $1 and staff_id = $2 and weekday = $3', [
      period.id, me.id, weekday(date),
    ])
    if (!duty) return
    if (op === 'absent') {
      await query(
        `insert into date_exceptions (period_id, date, staff_id, updated_by) values ($1, $2, $3, $4)
         on conflict do nothing`,
        [period.id, date, me.id, self.name],
      )
      await addLog(period.id, self.name, `${day}: kann nicht (Vertretung gesucht)${forWho}`)
    } else {
      await query('delete from date_exceptions where period_id = $1 and date = $2 and staff_id = $3', [period.id, date, me.id])
      await addLog(period.id, self.name, `${day}: doch da${forWho}`)
    }
  } else if (op === 'extra') {
    const done = await query(
      'insert into date_extras (period_id, date, staff_id, updated_by) values ($1, $2, $3, $4) on conflict do nothing returning 1',
      [period.id, date, me.id, self.name],
    )
    if (done.length) await addLog(period.id, self.name, `${day}: zusätzlich Dienst${forWho}`)
  } else if (op === 'unextra') {
    const done = await query('delete from date_extras where period_id = $1 and date = $2 and staff_id = $3 returning 1', [
      period.id, date, me.id,
    ])
    if (done.length) await addLog(period.id, self.name, `${day}: zusätzlicher Dienst entfernt${forWho}`)
  } else if (op === 'cover' || op === 'uncover') {
    const absentId = num(fd, 'staff')
    const absent = await getStaff(absentId)
    if (!absent) return
    if (op === 'cover') {
      const done = await query(
        `update date_exceptions set substitute_id = $4, updated_by = $5, updated_at = now()
         where period_id = $1 and date = $2 and staff_id = $3 and substitute_id is null returning 1`,
        [period.id, date, absentId, me.id, self.name],
      )
      if (done.length) await addLog(period.id, self.name, `${day}: Vertretung für ${absent.name} übernommen${forWho}`)
    } else {
      const done = await query(
        `update date_exceptions set substitute_id = null, updated_by = $5, updated_at = now()
         where period_id = $1 and date = $2 and staff_id = $3 and substitute_id = $4 returning 1`,
        [period.id, date, absentId, me.id, self.name],
      )
      if (done.length) await addLog(period.id, self.name, `${day}: Vertretung für ${absent.name} abgegeben${forWho}`)
    }
  } else if (op === 'substitute' && planning) {
    const absent = await getStaff(num(fd, 'staff'))
    const subId = num(fd, 'assignee')
    const sub = subId ? await getStaff(subId) : null
    if (!absent || (subId && !sub) || subId === absent.id) return
    const done = await query(
      `update date_exceptions set substitute_id = $4, updated_by = $5, updated_at = now()
       where period_id = $1 and date = $2 and staff_id = $3 returning 1`,
      [period.id, date, absent.id, sub?.id ?? null, self.name],
    )
    if (done.length) {
      await addLog(period.id, self.name, sub ? `${day}: ${sub.name} vertritt ${absent.name}` : `${day}: Vertretung für ${absent.name} offen`)
    }
  }
  revalidatePath('/plan', 'layout')
}

// --- Sonderaufgaben (ohne Datum) ---------------------------------------------

export async function addSpecialTask(fd: FormData) {
  const me = await requireShiftActor()
  const period = await getPeriod(num(fd, 'period'))
  const name = str(fd, 'name')
  if (!period || !name) return
  const take = fd.get('take') === 'on'
  await query(
    'insert into special_tasks (period_id, name, note, staff_id, updated_by, updated_at) values ($1, $2, $3, $4, $5, now())',
    [period.id, name, str(fd, 'note'), take ? me.id : null, me.name],
  )
  await addLog(period.id, me.name, `Sonderaufgabe „${name}“ angelegt${take ? ' und übernommen' : ''}`)
  revalidatePath('/', 'layout')
}

export async function deleteSpecialTask(fd: FormData) {
  const me = await requireShiftActor()
  const [t] = await query<{ period_id: number; name: string }>(
    'delete from special_tasks where id = $1 returning period_id, name',
    [num(fd, 'task')],
  )
  if (t) await addLog(t.period_id, me.name, `Sonderaufgabe „${t.name}“ gelöscht`)
  revalidatePath('/', 'layout')
}

// --- Abwesenheiten und Urlaube -------------------------------------------------------

/** Eigene Abwesenheit eintragen; im Planungsmodus bzw. mit Einstellungs-Passwort auch für andere. */
export async function addAbsence(fd: FormData) {
  const me = await requireStaff()
  const from = isoOrNull(str(fd, 'from'))
  const to = isoOrNull(str(fd, 'to')) ?? from
  const kind = str(fd, 'kind')
  if (!from || !to || from > to || !(kind in ABSENCE_LABELS)) return
  const personId = num(fd, 'person')
  const person = personId && personId !== me.id && (await isAdmin()) ? await getStaff(personId) : me
  if (!person) return
  const [a] = await query<{ id: number }>(
    'insert into absences (staff_id, from_date, to_date, kind, note, created_by) values ($1, $2, $3, $4, $5, $6) returning id',
    [person.id, from, to, kind, str(fd, 'note'), me.name],
  )
  const range = from === to ? formatDate(from) : `${formatDate(from)}–${formatDate(to)}`
  const forWho = person.id === me.id ? '' : ` für ${person.name}`
  await addLog(null, me.name, `${ABSENCE_LABELS[kind as AbsenceKind]} ${range} eingetragen${forWho}`)
  revalidatePath('/', 'layout')
  redirect(`/abwesenheiten?neu=${a.id}`)
}

export async function deleteAbsence(fd: FormData) {
  const me = await requireStaff()
  const a = await getAbsence(num(fd, 'absence'))
  if (!a || (a.staff_id !== me.id && !(await isAdmin()))) return
  await query('delete from absences where id = $1', [a.id])
  const who = a.staff_id === me.id ? '' : ` (${(await getStaff(a.staff_id))?.name})`
  await addLog(null, me.name, `${ABSENCE_LABELS[a.kind]} ${formatDate(a.from_date)}–${formatDate(a.to_date)} gelöscht${who}`)
  revalidatePath('/', 'layout')
}

// --- Termine für alle (Planungsmodus) -------------------------------------------

/** Zeitraum, in dem ein Datum liegt (für den Änderungsverlauf), sonst null */
async function periodIdOn(date: string) {
  const [p] = await query<{ id: number }>('select id from periods where start_date <= $1 and end_date >= $1 limit 1', [date])
  return p?.id ?? null
}

export async function addAppointment(fd: FormData) {
  const me = await requireStaff()
  if (!(await canEditOthers())) return
  const date = isoOrNull(str(fd, 'date'))
  const title = str(fd, 'title')
  if (!date || !title) return
  await query('insert into appointments (date, time, title, note, created_by) values ($1, $2, $3, $4, $5)', [
    date, str(fd, 'time'), title, str(fd, 'note'), me.name,
  ])
  await addLog(await periodIdOn(date), me.name, `Termin „${title}“ am ${formatDate(date)} für alle angelegt`)
  revalidatePath('/', 'layout')
}

export async function deleteAppointment(fd: FormData) {
  const me = await requireStaff()
  if (!(await canEditOthers())) return
  const [a] = await query<{ date: string; title: string }>('delete from appointments where id = $1 returning date, title', [
    num(fd, 'appointment'),
  ])
  if (a) await addLog(await periodIdOn(a.date), me.name, `Termin „${a.title}“ am ${formatDate(a.date)} gelöscht`)
  revalidatePath('/', 'layout')
}

/** Sonderaufgabe übernehmen bzw. abgeben */
export async function toggleSpecialTask(fd: FormData) {
  const me = await requireShiftActor()
  const [t] = await query<{ id: number; period_id: number; name: string; staff_id: number | null }>(
    'select id, period_id, name, staff_id from special_tasks where id = $1',
    [num(fd, 'task')],
  )
  if (!t) return
  if (t.staff_id) {
    if (t.staff_id !== me.id && !(await canEditOthers())) return
    await query('update special_tasks set staff_id = null, updated_by = $2, updated_at = now() where id = $1', [t.id, me.name])
    const who = t.staff_id === me.id ? '' : ` (${(await getStaff(t.staff_id))?.name})`
    await addLog(t.period_id, me.name, `Sonderaufgabe „${t.name}“ abgegeben${who}`)
  } else {
    const done = await query(
      'update special_tasks set staff_id = $2, updated_by = $3, updated_at = now() where id = $1 and staff_id is null returning 1',
      [t.id, me.id, me.name],
    )
    if (done.length) await addLog(t.period_id, me.name, `Sonderaufgabe „${t.name}“ übernommen`)
  }
  revalidatePath('/', 'layout')
}

export async function toggleDaily(fd: FormData) {
  const me = await requireShiftActor()
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
  const role = roleOf(str(fd, 'role')) ?? 'hiwi'
  if (!name) return
  if (email && !EMAIL.test(email)) return
  if (id) {
    await query(
      'update staff set name = $2, hours_per_week = $3, start_date = $4, end_date = $5, active = $6, email = $7, role = $8 where id = $1',
      [id, name, hours, start, end, active, email, role],
    )
    await addLog(null, await actorName(), `${name} geändert`)
  } else {
    await query(
      `insert into staff (name, hours_per_week, start_date, end_date, active, email, role) values ($1, $2, $3, $4, true, $5, $6)
       on conflict (name) do nothing`,
      [name, hours, start, end, email, role],
    )
    await addLog(null, await actorName(), `${name} hinzugefügt`)
  }
  revalidatePath('/', 'layout')
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Bereich aus Text: Schlüssel (hiwi, wimi …) oder übliche Bezeichnungen */
function roleOf(text: string): Role | null {
  const t = text.toLowerCase()
  if ((ROLES as string[]).includes(t)) return t as Role
  if (/hilfskr|shk|hiwi|stud/.test(t)) return 'hiwi'
  if (/sekret/.test(t)) return 'sekretariat'
  if (/rat|rätin/.test(t)) return 'rat'
  if (/prof|inhaber/.test(t)) return 'prof'
  if (/wiss|mitarb|wimi/.test(t)) return 'wimi'
  return null
}

/**
 * Mehrere Personen auf einmal: je Zeile „Name; E-Mail; Bereich“ (E-Mail und Bereich optional,
 * auch mit Komma oder Tab getrennt; „Nachname, Vorname“ wie auf der Lehrstuhlseite geht auch).
 * Wer schon da ist (gleiche E-Mail oder gleicher Name), wird nicht doppelt angelegt; fehlende
 * E-Mail-Adresse und der Bereich werden ergänzt.
 */
export async function importStaff(fd: FormData) {
  await requireAdmin()
  const fallback = roleOf(str(fd, 'role')) ?? 'hiwi'
  let added = 0, updated = 0
  for (const line of str(fd, 'list').split(/\r?\n/)) {
    const parts = line.split(/[;\t]/).map((x) => x.trim()).filter(Boolean)
    if (!parts.length) continue
    let name = parts[0]
    const email = parts.find((x) => EMAIL.test(x)) ?? ''
    const role = parts.slice(1).map(roleOf).find(Boolean) ?? fallback
    // „Nachname, Vorname“ → „Vorname Nachname“
    const m = name.match(/^([^,]+),\s*([^,]+)$/)
    if (m) name = `${m[2]} ${m[1]}`
    if (!name || EMAIL.test(name)) continue
    const [hit] = await query<{ id: number }>(
      `update staff set email = case when email = '' then $2 else email end, role = $3
       where lower(name) = lower($1) or ($2 <> '' and lower(email) = lower($2)) returning id`,
      [name, email, role],
    )
    if (hit) {
      updated++
      continue
    }
    const done = await query(
      `insert into staff (name, email, role, hours_per_week, active) values ($1, $2, $3, 0, true)
       on conflict (name) do nothing returning 1`,
      [name, email, role],
    )
    if (done.length) added++
  }
  if (added || updated) {
    await addLog(null, await actorName(), `Personen importiert: ${added} neu, ${updated} ergänzt`)
  }
  revalidatePath('/', 'layout')
}

export async function deleteStaff(fd: FormData) {
  await requireAdmin()
  const s = await getStaff(num(fd, 'id'))
  if (!s) return
  await query('delete from staff where id = $1', [s.id])
  await addLog(null, await actorName(), `${s.name} gelöscht`)
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

