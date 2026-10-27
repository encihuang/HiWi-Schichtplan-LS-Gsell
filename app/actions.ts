'use server'

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { query } from '@/lib/db'
import { after } from 'next/server'
import { clampMail, DEFAULT_ABSENCE_TEXTS, loadMails, runMails, saveMails, sendUpdate } from '@/lib/mail'
import { DEFAULT_MAILS, type Topic } from '@/lib/mail-shared'
import { encrypt, setSetting } from '@/lib/settings'
import { sendTestReminder } from '@/lib/reminders'
import {
  ABSENCE_LABEL, addLog, AVAILABILITY_LABELS, createYear, getAbsence, ROLES, DUTY_LABELS, getPeriod, getStaff, listClosedDays, listYears,
  occurrences, repeatText, sealNote, workdaysOf, type AvailabilityStatus, type DutyKind, type Repeat, type Role, type SpecialTask,
} from '@/lib/data'
import { formatDate, PERIOD_KINDS, todayIso, WEEKDAYS, weekday, wsLecture, yearLabel, isLecture } from '@/lib/dates'
import { endSessionsOf } from '@/lib/auth'
import { canEditOthers, currentStaff, isAdmin, mayPlan, PLAN_COOKIE, requireAdmin, requireShiftActor, requireStaff, secureCookie } from '@/lib/session'

const num = (fd: FormData, k: string) => Number(fd.get(k))
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()
const isoOrNull = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

async function actorName() {
  return (await currentStaff())?.name ?? 'Verwaltung'
}

// --- Zugang (Verwaltung) ---------------------------------------------------------

/** Kalender-Adresse einer Person ungültig machen (Einstellungen); beim nächsten Öffnen von „Kalender“ gibt es eine neue */
export async function resetCalendarToken(fd: FormData) {
  await requireAdmin()
  const [s] = await query<{ name: string }>('update staff set calendar_token = null, calendar_hash = null where id = $1 returning name', [num(fd, 'id')])
  if (s) await addLog(null, await actorName(), `Kalender-Adresse von ${s.name} zurückgesetzt`)
  revalidatePath('/', 'layout')
}

/** Person auf allen Geräten abmelden */
export async function endStaffSessions(fd: FormData) {
  await requireAdmin()
  const s = await getStaff(num(fd, 'id'))
  if (!s) return
  await endSessionsOf(s.id)
  await addLog(null, await actorName(), `${s.name} auf allen Geräten abgemeldet`)
  revalidatePath('/verwaltung')
}

// --- Planungsmodus -------------------------------------------------------------

/** Planungsmodus ein/aus. Gilt bis zum Schließen des Browsers. */
export async function setPlanningMode(fd: FormData) {
  const on = str(fd, 'on') === '1'
  const back = str(fd, 'back')
  const next = back.startsWith('/') ? back : '/plan'
  // alle Hilfskräfte und wer Verwaltungsrechte hat
  const me = await currentStaff()
  if (on && !(me && mayPlan(me))) redirect(next)
  const jar = await cookies()
  if (on) jar.set(PLAN_COOKIE, '1', secureCookie)
  else jar.delete(PLAN_COOKIE)
  revalidatePath('/', 'layout')
}

// --- Jahre -------------------------------------------------------------------

export async function addYear() {
  await requireStaff()
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
    if (done.length) await logShift(period.id, who.me.name, `${label}: Dienst entfernt${forWhom(who.me, who.target)}`)
  } else if (kind in DUTY_LABELS) {
    await query(
      `insert into weekly_duties (period_id, staff_id, weekday, kind, updated_by) values ($1, $2, $3, $4, $5)
       on conflict (period_id, staff_id, weekday) do update set kind = $4, updated_by = $5, updated_at = now()`,
      [period.id, who.target.id, day, kind, who.me.name],
    )
    await logShift(
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
    await logShift(l.period_id, me.name, `${label} freigegeben${who}`)
  } else {
    const done = await query(
      'update lectures set staff_id = $2, updated_by = $3, updated_at = now() where id = $1 and staff_id is null returning 1',
      [l.id, me.id, me.name],
    )
    if (done.length) await logShift(l.period_id, me.name, `${label} übernommen`)
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
    await logShift(l.period_id, who.me.name, who.target ? `${label}: ${who.target.name} eingeteilt` : `${label} freigegeben`)
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
    await logShift(t.period_id, who.me.name, who.target ? `${label}: ${who.target.name} eingeteilt` : `${label} freigegeben`)
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
    await logShift(period.id, who.me.name, `${formatDate(date)}: ${who.target.name} eingeteilt`)
  } else {
    await query('delete from daily_slots where period_id = $1 and date = $2', [period.id, date])
    await logShift(period.id, who.me.name, `${formatDate(date)} freigegeben`)
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
      await logShift(period.id, self.name, `${day}: kann nicht (Vertretung gesucht)${forWho}`)
    } else {
      await query('delete from date_exceptions where period_id = $1 and date = $2 and staff_id = $3', [period.id, date, me.id])
      await logShift(period.id, self.name, `${day}: doch da${forWho}`)
    }
  } else if (op === 'extra') {
    const done = await query(
      'insert into date_extras (period_id, date, staff_id, updated_by) values ($1, $2, $3, $4) on conflict do nothing returning 1',
      [period.id, date, me.id, self.name],
    )
    if (done.length) await logShift(period.id, self.name, `${day}: zusätzlich Dienst${forWho}`)
  } else if (op === 'unextra') {
    const done = await query('delete from date_extras where period_id = $1 and date = $2 and staff_id = $3 returning 1', [
      period.id, date, me.id,
    ])
    if (done.length) await logShift(period.id, self.name, `${day}: zusätzlicher Dienst entfernt${forWho}`)
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
      if (done.length) await logShift(period.id, self.name, `${day}: Vertretung für ${absent.name} übernommen${forWho}`)
    } else {
      const done = await query(
        `update date_exceptions set substitute_id = null, updated_by = $5, updated_at = now()
         where period_id = $1 and date = $2 and staff_id = $3 and substitute_id = $4 returning 1`,
        [period.id, date, absentId, me.id, self.name],
      )
      if (done.length) await logShift(period.id, self.name, `${day}: Vertretung für ${absent.name} abgegeben${forWho}`)
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
      await logShift(period.id, self.name, sub ? `${day}: ${sub.name} vertritt ${absent.name}` : `${day}: Vertretung für ${absent.name} offen`)
    }
  }
  revalidatePath('/plan', 'layout')
}

/**
 * Vorlesung/Aufgabe an einem einzelnen Datum (Vorlesungszeit):
 * absent = eingeteilte Person kann nicht, present = doch da, cover = Vertretung übernehmen, uncover = abgeben,
 * substitute = (Planungsmodus) Vertretung festlegen („assignee“, 0 = offen).
 * absent/present im Planungsmodus auch für andere.
 */
export async function lectureException(fd: FormData) {
  const [self, planning] = await Promise.all([requireShiftActor(), canEditOthers()])
  const date = isoOrNull(str(fd, 'date'))
  const op = str(fd, 'op')
  const [l] = await query<{ id: number; period_id: number; name: string; weekday: number; staff_id: number | null }>(
    'select id, period_id, name, weekday, staff_id from lectures where id = $1',
    [num(fd, 'lecture')],
  )
  if (!l || !l.staff_id || !date || weekday(date) !== l.weekday) return
  const period = await getPeriod(l.period_id)
  if (!period || !workdaysOf(period, await listClosedDays(period.year_id)).includes(date)) return
  const regular = l.staff_id === self.id ? self : await getStaff(l.staff_id)
  if (!regular) return
  const label = `${formatDate(date)}: „${l.name}“`

  if (op === 'absent' || op === 'present') {
    if (regular.id !== self.id && !planning) return
    const forWho = regular.id === self.id ? '' : ` (${regular.name})`
    if (op === 'absent') {
      const done = await query(
        `insert into lecture_exceptions (lecture_id, date, updated_by) values ($1, $2, $3) on conflict do nothing returning 1`,
        [l.id, date, self.name],
      )
      if (done.length) await logShift(l.period_id, self.name, `${label} kann nicht (Vertretung gesucht)${forWho}`)
    } else {
      const done = await query('delete from lecture_exceptions where lecture_id = $1 and date = $2 returning 1', [l.id, date])
      if (done.length) await logShift(l.period_id, self.name, `${label} doch da${forWho}`)
    }
  } else if (op === 'cover' && self.id !== regular.id) {
    const done = await query(
      `update lecture_exceptions set substitute_id = $3, updated_by = $4, updated_at = now()
       where lecture_id = $1 and date = $2 and substitute_id is null returning 1`,
      [l.id, date, self.id, self.name],
    )
    if (done.length) await logShift(l.period_id, self.name, `${label}: Vertretung für ${regular.name} übernommen`)
  } else if (op === 'uncover') {
    const done = await query(
      `update lecture_exceptions set substitute_id = null, updated_by = $4, updated_at = now()
       where lecture_id = $1 and date = $2 and substitute_id = $3 returning 1`,
      [l.id, date, self.id, self.name],
    )
    if (done.length) await logShift(l.period_id, self.name, `${label}: Vertretung für ${regular.name} abgegeben`)
  } else if (op === 'substitute' && planning) {
    const subId = num(fd, 'assignee')
    const sub = subId ? await getStaff(subId) : null
    if ((subId && !sub) || subId === regular.id) return
    const done = await query(
      `update lecture_exceptions set substitute_id = $3, updated_by = $4, updated_at = now()
       where lecture_id = $1 and date = $2 returning 1`,
      [l.id, date, sub?.id ?? null, self.name],
    )
    if (done.length) {
      await logShift(l.period_id, self.name, sub ? `${label}: ${sub.name} vertritt ${regular.name}` : `${label}: Vertretung für ${regular.name} offen`)
    }
  }
  revalidatePath('/plan', 'layout')
}

// --- Sonderaufgaben (ohne Datum) und wiederkehrende Aufgaben ------------------------

/** Wiederholung aus dem Formular; null, wenn unvollständig */
function parseRepeat(fd: FormData) {
  const repeat = str(fd, 'repeat')
  const time = str(fd, 'time').slice(0, 40)
  if (repeat === 'weekly' || repeat === 'biweekly') {
    const day = num(fd, 'weekday')
    if (!dayOk(day)) return null
    const start = repeat === 'biweekly' ? isoOrNull(str(fd, 'start')) : null
    return { repeat, weekday: day, day_of_month: null, start_date: start, time }
  }
  if (repeat === 'monthly') {
    const dom = Math.round(num(fd, 'dayOfMonth'))
    if (!(dom >= 1 && dom <= 31)) return null
    return { repeat, weekday: null, day_of_month: dom, start_date: null, time }
  }
  return null
}

const repeatLabel = (r: NonNullable<ReturnType<typeof parseRepeat>>) => repeatText({ ...r, repeat: r.repeat as Repeat } as SpecialTask)

/** Sonderaufgabe ohne festen Tag (eine Person für den ganzen Zeitraum) */
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

/** Wiederkehrende Aufgabe anlegen; übernommen wird sie je Termin */
export async function addRecurringTask(fd: FormData) {
  const me = await requireShiftActor()
  const period = await getPeriod(num(fd, 'period'))
  const name = str(fd, 'name')
  const r = parseRepeat(fd)
  if (!period || !name || !r) return
  await query(
    `insert into special_tasks (period_id, name, note, updated_by, updated_at, repeat, weekday, day_of_month, start_date, time)
     values ($1, $2, $3, $4, now(), $5, $6, $7, $8, $9)`,
    [period.id, name, str(fd, 'note'), me.name, r.repeat, r.weekday, r.day_of_month, r.start_date, r.time],
  )
  await addLog(period.id, me.name, `Wiederkehrende Aufgabe „${name}“ (${repeatLabel(r)}) angelegt`)
  revalidatePath('/', 'layout')
}

/** Wiederholung ändern; Übernahmen an Tagen, die wegfallen, werden gelöscht */
export async function setSpecialTaskRepeat(fd: FormData) {
  const me = await requireShiftActor()
  const r = parseRepeat(fd)
  if (!r) return
  const [t] = await query<SpecialTask & { period_id: number }>(
    `update special_tasks set repeat = $2, weekday = $3, day_of_month = $4, start_date = $5, time = $6, updated_by = $7, updated_at = now()
     where id = $1 and repeat <> 'none' returning *`,
    [num(fd, 'task'), r.repeat, r.weekday, r.day_of_month, r.start_date, r.time, me.name],
  )
  if (!t) return
  const period = await getPeriod(t.period_id)
  if (period) {
    const dates = occurrences(t, period, await listClosedDays(period.year_id))
    await query('delete from recurring_takes where task_id = $1 and not (date = any($2))', [t.id, dates])
  }
  await logShift(t.period_id, me.name, `Wiederkehrende Aufgabe „${t.name}“: ${repeatLabel(r)}`)
  revalidatePath('/', 'layout')
}

/** Termin einer wiederkehrenden Aufgabe: Aufgabe und Datum prüfen */
async function recurringOn(fd: FormData) {
  const date = isoOrNull(str(fd, 'date'))
  const [t] = await query<SpecialTask & { period_id: number }>(`select * from special_tasks where id = $1 and repeat <> 'none'`, [num(fd, 'task')])
  if (!t || !date) return null
  const period = await getPeriod(t.period_id)
  if (!period || !occurrences(t, period, await listClosedDays(period.year_id)).includes(date)) return null
  return { t, date, label: `„${t.name}“ ${formatDate(date)}` }
}

/** Termin einer wiederkehrenden Aufgabe selbst übernehmen bzw. abgeben */
export async function toggleRecurring(fd: FormData) {
  const [me, x, planning] = await Promise.all([requireShiftActor(), recurringOn(fd), canEditOthers()])
  if (!x) return
  const [take] = await query<{ staff_id: number }>('select staff_id from recurring_takes where task_id = $1 and date = $2', [x.t.id, x.date])
  if (take) {
    if (take.staff_id !== me.id && !planning) return
    await query('delete from recurring_takes where task_id = $1 and date = $2', [x.t.id, x.date])
    const who = take.staff_id === me.id ? '' : ` (${(await getStaff(take.staff_id))?.name})`
    await logShift(x.t.period_id, me.name, `${x.label} abgegeben${who}`)
  } else {
    const done = await query(
      `insert into recurring_takes (task_id, date, staff_id, updated_by) values ($1, $2, $3, $4) on conflict do nothing returning 1`,
      [x.t.id, x.date, me.id, me.name],
    )
    if (done.length) await logShift(x.t.period_id, me.name, `${x.label} übernommen`)
  }
  revalidatePath('/', 'layout')
}

/** Planungsmodus: Termin einer wiederkehrenden Aufgabe einer Person zuweisen oder freigeben */
export async function assignRecurring(fd: FormData) {
  const [who, x] = await Promise.all([planningAssignee(fd), recurringOn(fd)])
  if (!who || !x) return
  if (who.target) {
    await query(
      `insert into recurring_takes (task_id, date, staff_id, updated_by) values ($1, $2, $3, $4)
       on conflict (task_id, date) do update set staff_id = $3, updated_by = $4, updated_at = now()`,
      [x.t.id, x.date, who.target.id, who.me.name],
    )
    await logShift(x.t.period_id, who.me.name, `${x.label}: ${who.target.name} eingeteilt`)
  } else {
    await query('delete from recurring_takes where task_id = $1 and date = $2', [x.t.id, x.date])
    await logShift(x.t.period_id, who.me.name, `${x.label} freigegeben`)
  }
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
  if (!from || !to || from > to) return
  const personId = num(fd, 'person')
  const person = personId && personId !== me.id && (await isAdmin()) ? await getStaff(personId) : me
  if (!person) return
  const [a] = await query<{ id: number }>(
    'insert into absences (staff_id, from_date, to_date, note, created_by) values ($1, $2, $3, $4, $5) returning id',
    [person.id, from, to, sealNote(str(fd, 'note')), me.name],
  )
  const range = from === to ? formatDate(from) : `${formatDate(from)}–${formatDate(to)}`
  const forWho = person.id === me.id ? '' : ` für ${person.name}`
  await addLog(null, me.name, `${ABSENCE_LABEL} ${range} eingetragen${forWho}`)
  if (to >= todayIso()) await notifyChange('absences', `${person.name}: ${ABSENCE_LABEL} ${range} eingetragen`)
  revalidatePath('/', 'layout')
  // nur Pfade dieser App
  const back = str(fd, 'back')
  const target = back.startsWith('/') && !back.startsWith('//') ? back : '/abwesenheiten'
  redirect(`${target}${target.includes('?') ? '&' : '?'}neu=${a.id}#abwesenheiten`)
}

export async function deleteAbsence(fd: FormData) {
  const me = await requireStaff()
  const a = await getAbsence(num(fd, 'absence'))
  if (!a || (a.staff_id !== me.id && !(await isAdmin()))) return
  await query('delete from absences where id = $1', [a.id])
  const who = a.staff_id === me.id ? '' : ` (${(await getStaff(a.staff_id))?.name})`
  await addLog(null, me.name, `${ABSENCE_LABEL} ${formatDate(a.from_date)}–${formatDate(a.to_date)} gelöscht${who}`)
  if (a.to_date >= todayIso()) {
    const person = a.staff_id === me.id ? me.name : (await getStaff(a.staff_id))?.name
    await notifyChange('absences', `${person}: ${ABSENCE_LABEL} ${formatDate(a.from_date)}–${formatDate(a.to_date)} gelöscht`)
  }
  revalidatePath('/', 'layout')
}

// --- Termine für alle (Planungsmodus) -------------------------------------------

/** Zeitraum, in dem ein Datum liegt (für den Änderungsverlauf), sonst null */
async function periodIdOn(date: string) {
  const [p] = await query<{ id: number }>('select id from periods where start_date <= $1 and end_date >= $1 limit 1', [date])
  return p?.id ?? null
}

/** Termine bearbeiten: im Planungsmodus oder mit dem Passwort für die Einstellungen */
async function appointmentEditor() {
  const me = await currentStaff()
  if (await isAdmin()) return { name: me?.name ?? 'Verwaltung' }
  return me && (await canEditOthers()) ? me : null
}

export async function addAppointment(fd: FormData) {
  const me = await appointmentEditor()
  if (!me) return
  const date = isoOrNull(str(fd, 'date'))
  const title = str(fd, 'title')
  if (!date || !title) return
  await query('insert into appointments (date, time, title, note, created_by) values ($1, $2, $3, $4, $5)', [
    date, str(fd, 'time'), title, str(fd, 'note'), me.name,
  ])
  await addLog(await periodIdOn(date), me.name, `Termin „${title}“ am ${formatDate(date)} für alle angelegt`)
  if (date >= todayIso()) await notifyChange('appointments', `Termin „${title}“ am ${formatDate(date)} angelegt`)
  revalidatePath('/', 'layout')
}

export async function deleteAppointment(fd: FormData) {
  const me = await appointmentEditor()
  if (!me) return
  const [a] = await query<{ date: string; title: string }>('delete from appointments where id = $1 returning date, title', [
    num(fd, 'appointment'),
  ])
  if (a) {
    await addLog(await periodIdOn(a.date), me.name, `Termin „${a.title}“ am ${formatDate(a.date)} gelöscht`)
    if (a.date >= todayIso()) await notifyChange('appointments', `Termin „${a.title}“ am ${formatDate(a.date)} gelöscht`)
  }
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
    await logShift(t.period_id, me.name, `Sonderaufgabe „${t.name}“ abgegeben${who}`)
  } else {
    const done = await query(
      'update special_tasks set staff_id = $2, updated_by = $3, updated_at = now() where id = $1 and staff_id is null returning 1',
      [t.id, me.id, me.name],
    )
    if (done.length) await logShift(t.period_id, me.name, `Sonderaufgabe „${t.name}“ übernommen`)
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
    await logShift(period.id, me.name, `${formatDate(date)} freigegeben${who}`)
  } else {
    const workdays = workdaysOf(period, await listClosedDays(period.year_id))
    if (!workdays.includes(date)) return
    const done = await query(
      `insert into daily_slots (period_id, date, staff_id, updated_by) values ($1, $2, $3, $4)
       on conflict do nothing returning 1`,
      [period.id, date, me.id, me.name],
    )
    if (done.length) await logShift(period.id, me.name, `${formatDate(date)} übernommen`)
  }
  revalidatePath('/plan', 'layout')
}

// --- Einstellungen -----------------------------------------------------------

// Verwaltung: Personen nur aufnehmen und entfernen. Name, Wochenstunden usw. trägt jede Person selbst ein.

async function emailTaken(email: string, id = 0) {
  return (await query('select 1 from staff where lower(email) = $1 and id <> $2', [email, id])).length > 0
}

/** Neue Person: Name, dienstliche E-Mail (= Anmeldung), Bereich, ggf. Verwaltungsrechte */
export async function addStaff(fd: FormData) {
  await requireAdmin()
  const name = str(fd, 'name')
  const email = str(fd, 'email').toLowerCase()
  const role = (ROLES as string[]).includes(str(fd, 'role')) ? (str(fd, 'role') as Role) : 'hiwi'
  if (!name || !EMAIL.test(email) || (await emailTaken(email))) return
  const done = await query(
    `insert into staff (name, active, email, role, is_admin) values ($1, true, $2, $3, $4) on conflict (name) do nothing returning 1`,
    [name, email, role, fd.get('admin') === 'on'],
  )
  if (done.length) await addLog(null, await actorName(), `${name} aufgenommen`)
  revalidatePath('/', 'layout')
}

/** Dienstliche E-Mail nachtragen (nur wenn noch keine hinterlegt ist – sonst ist keine Anmeldung möglich) */
export async function addStaffEmail(fd: FormData) {
  await requireAdmin()
  const email = str(fd, 'email').toLowerCase()
  const id = num(fd, 'id')
  if (!EMAIL.test(email) || (await emailTaken(email, id))) return
  const [s] = await query<{ name: string }>(`update staff set email = $2 where id = $1 and email = '' returning name`, [id, email])
  if (s) await addLog(null, await actorName(), `E-Mail von ${s.name} nachgetragen`)
  revalidatePath('/', 'layout')
}

/** Entfernen: nicht mehr aktiv, abgemeldet – Schichten, Abwesenheiten und Verlauf bleiben erhalten */
export async function removeStaff(fd: FormData) {
  await requireAdmin()
  const id = num(fd, 'id')
  if (id === (await currentStaff())?.id) return
  const [s] = await query<{ name: string }>('update staff set active = false, is_admin = false where id = $1 returning name', [id])
  if (!s) return
  await endSessionsOf(id)
  await addLog(null, await actorName(), `${s.name} entfernt`)
  revalidatePath('/', 'layout')
}

/** Entfernte Person wieder aufnehmen */
export async function restoreStaff(fd: FormData) {
  await requireAdmin()
  const [s] = await query<{ name: string }>('update staff set active = true where id = $1 returning name', [num(fd, 'id')])
  if (s) await addLog(null, await actorName(), `${s.name} wieder aufgenommen`)
  revalidatePath('/', 'layout')
}

/** Verwaltungsrechte geben oder entziehen (nicht sich selbst) */
export async function setStaffAdmin(fd: FormData) {
  await requireAdmin()
  const id = num(fd, 'id')
  if (id === (await currentStaff())?.id) return
  const on = str(fd, 'on') === '1'
  const [s] = await query<{ name: string }>('update staff set is_admin = $2 where id = $1 and active returning name', [id, on])
  if (s) await addLog(null, await actorName(), `${s.name}: Verwaltungsrechte ${on ? 'gegeben' : 'entzogen'}`)
  revalidatePath('/', 'layout')
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Endgültig löschen (nur bereits entfernte Personen) – löscht auch alle Schichten und Abwesenheiten */
export async function deleteStaff(fd: FormData) {
  await requireAdmin()
  const s = await getStaff(num(fd, 'id'))
  if (!s || s.active) return
  await query('delete from staff where id = $1', [s.id])
  await addLog(null, await actorName(), `${s.name} endgültig gelöscht`)
  revalidatePath('/', 'layout')
}

// --- E-Mail-Versand (Einstellungen) ---------------------------------------------------

/** SMTP-Zugang speichern. Leeres Passwortfeld = bisheriges Passwort behalten. */
export async function saveSmtp(fd: FormData) {
  await requireAdmin()
  const port = Math.round(num(fd, 'port'))
  await setSetting('smtp.host', str(fd, 'host'))
  await setSetting('smtp.port', String(port > 0 && port < 65536 ? port : 587))
  await setSetting('smtp.security', str(fd, 'security') === 'ssl' ? 'ssl' : 'starttls')
  await setSetting('smtp.user', str(fd, 'user'))
  await setSetting('smtp.from', str(fd, 'from'))
  const password = String(fd.get('password') ?? '')
  if (fd.get('clearPassword') === 'on') await setSetting('smtp.password', null)
  else if (password) await setSetting('smtp.password', encrypt(password))
  await addLog(null, await actorName(), 'Absender-Konto für E-Mails geändert')
  revalidatePath('/verwaltung')
}

const text = (fd: FormData, k: string) => String(fd.get(k) ?? '').replace(/\r\n/g, '\n').trim()

/** Eine automatische E-Mail speichern (Empfänger, Zeitplan, Texte) */
export async function saveMail(fd: FormData) {
  await requireAdmin()
  const id = str(fd, 'id')
  const mails = await loadMails()
  const i = mails.findIndex((m) => m.id === id)
  if (i < 0) return
  const { kind } = mails[i]
  const frequency = str(fd, 'frequency')
  mails[i] = clampMail({
    id,
    kind,
    name: str(fd, 'name') || DEFAULT_MAILS[kind].name,
    // Erinnerungen: wer sie bekommt, entscheidet jede Hilfskraft selbst
    staffIds: kind === 'reminder' ? mails[i].staffIds : fd.getAll('staff').map(Number).filter(Boolean),
    extra: str(fd, 'extra').split(/[\s,;]+/).filter((x) => EMAIL.test(x)),
    frequency: frequency === 'daily' || frequency === 'weekly' ? frequency : 'off',
    weekday: num(fd, 'weekday'),
    topics: fd.getAll('topics').map(String) as Topic[],
    weeks: num(fd, 'weeks'),
    daysBefore: parseInt(str(fd, 'daysBefore')) || 0,
    calendarDays: str(fd, 'daysBefore').endsWith('k'),
    hour: num(fd, 'hour'),
    subject: text(fd, 'subject') || DEFAULT_MAILS[kind].subject,
    body: text(fd, 'body'),
  })
  await saveMails(mails)
  await addLog(null, await actorName(), `Automatische E-Mail „${mails[i].name}“ geändert`)
  revalidatePath('/', 'layout')
}

/** Neue automatische E-Mail: regelmäßig, bei Änderungen oder Erinnerung (zunächst ohne Empfänger, also inaktiv) */
export async function addMail(fd: FormData) {
  await requireAdmin()
  const k = str(fd, 'kind')
  const kind = k === 'change' || k === 'reminder' ? k : 'schedule'
  const mails = await loadMails()
  const id = `m${Date.now().toString(36)}`
  mails.push({ ...DEFAULT_MAILS[kind], id })
  await saveMails(mails)
  await addLog(null, await actorName(), 'Automatische E-Mail angelegt')
  revalidatePath('/verwaltung')
  redirect(`/verwaltung#mail-${id}`)
}

export async function deleteMail(fd: FormData) {
  await requireAdmin()
  const mails = await loadMails()
  const gone = mails.find((m) => m.id === str(fd, 'id'))
  if (!gone) return
  await saveMails(mails.filter((m) => m !== gone))
  await addLog(null, await actorName(), `Automatische E-Mail „${gone.name}“ gelöscht`)
  revalidatePath('/', 'layout')
}

/** Text der Abwesenheitsmeldung ans Sekretariat */
export async function saveAbsenceTexts(fd: FormData) {
  await requireAdmin()
  for (const k of Object.keys(DEFAULT_ABSENCE_TEXTS)) await setSetting(`text.${k}`, text(fd, k))
  await addLog(null, await actorName(), 'Text der Abwesenheitsmeldung geändert')
  revalidatePath('/', 'layout')
}

async function origin() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

/** Änderung am Schichtplan: im Verlauf speichern und ggf. per E-Mail „bei Änderungen“ melden */
async function logShift(periodId: number, actor: string, message: string) {
  await addLog(periodId, actor, message)
  await notifyChange('shifts', `${actor}: ${message}`)
}

/** Nach der Antwort ggf. eine Aktualisierungs-E-Mail schicken (blockiert die Seite nicht). */
async function notifyChange(topic: Topic, change: string) {
  const o = await origin()
  after(() => sendUpdate(o, topic, change))
}

/** Eine automatische E-Mail sofort an ihre Empfänger schicken (zum Testen). */
export async function sendTestMail(fd: FormData) {
  await requireAdmin()
  const id = str(fd, 'id')
  // Erinnerung: Beispiel für die erste ausgewählte Hilfskraft an die Absender-Adresse
  if ((await loadMails()).some((m) => m.id === id && m.kind === 'reminder')) await sendTestReminder(await origin(), id)
  else await runMails(await origin(), id)
  revalidatePath('/verwaltung')
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

