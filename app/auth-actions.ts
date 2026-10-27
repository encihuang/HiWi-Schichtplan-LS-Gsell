'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import {
  checkCode, checkPassword, endSession, endSessionsOf, finishReset, passwordProblem, requestCode, setPassword, startSession,
  verifiedResetStaff,
} from '@/lib/auth'
import { safeEqual } from '@/lib/crypto'
import { addLog, getStaff } from '@/lib/data'
import { loadMails, saveMails } from '@/lib/mail'
import { query } from '@/lib/db'
import { PLAN_COOKIE, requireStaff, secureCookie, SETUP_COOKIE, setupCookieValue, loginReady } from '@/lib/session'

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim()

/** nur Pfade dieser App */
const safeNext = (v: string) => (/^\/(?![/\\])/.test(v) ? v : '/')

const qs = (o: Record<string, string>) => new URLSearchParams(o).toString()

// --- Anmeldung ---------------------------------------------------------------

/** Schritt 1 (Standard und „Passwort vergessen“): Code an die dienstliche Adresse */
export async function requestLoginCode(_: string | null, fd: FormData) {
  const email = str(fd, 'email')
  const purpose = str(fd, 'purpose') === 'reset' ? 'reset' : 'login'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Bitte deine dienstliche E-Mail-Adresse eingeben.'
  const error = await requestCode(email, purpose)
  if (error) return error
  redirect(`/login?${qs({ schritt: 'code', next: safeNext(str(fd, 'next')), an: email })}`)
}

/** Schritt 2: Code eingeben */
export async function submitLoginCode(_: string | null, fd: FormData) {
  const r = await checkCode(str(fd, 'code'))
  if ('error' in r) return r.error
  const next = safeNext(str(fd, 'next'))
  if (r.purpose === 'reset') redirect(`/login?${qs({ schritt: 'neues-passwort', next })}`)
  await startSession(r.staffId)
  redirect(next)
}

/** „Passwort vergessen“, Schritt 3: neues Passwort festlegen, danach angemeldet */
export async function submitNewPassword(_: string | null, fd: FormData) {
  const staffId = await verifiedResetStaff()
  if (!staffId) return 'Die Bestätigung ist abgelaufen. Bitte noch einmal „Passwort vergessen?“ wählen.'
  const pw = String(fd.get('password') ?? '')
  const problem = passwordProblem(pw, String(fd.get('repeat') ?? ''))
  if (problem) return problem
  await setPassword(staffId, pw)
  await finishReset()
  // ein vergessenes Passwort könnte anderswo bekannt sein: alle anderen Sitzungen beenden
  await endSessionsOf(staffId)
  await startSession(staffId)
  const s = await getStaff(staffId)
  if (s) await addLog(null, s.name, 'Passwort neu festgelegt')
  redirect(safeNext(str(fd, 'next')))
}

/** Anmeldung mit Passwort (wer eins festgelegt hat) */
export async function passwordLogin(_: string | null, fd: FormData) {
  const staffId = await checkPassword(str(fd, 'email'), String(fd.get('password') ?? ''))
  if (!staffId) {
    return 'E-Mail-Adresse oder Passwort stimmt nicht (nach mehreren Fehlversuchen ist die Anmeldung mit Passwort kurz gesperrt – der Code per E-Mail geht weiterhin).'
  }
  await startSession(staffId)
  redirect(safeNext(str(fd, 'next')))
}

/** Einrichtung: Verwaltung mit ADMIN_PASSWORD öffnen, solange sich noch niemand anmelden kann */
export async function setupLogin(_: string | null, fd: FormData) {
  const pw = process.env.ADMIN_PASSWORD
  if (await loginReady()) return 'Die Einrichtung ist abgeschlossen – bitte normal anmelden.'
  if (!pw) {
    // lokale Entwicklung ohne ADMIN_PASSWORD: Einrichtung offen
    if (process.env.NODE_ENV === 'production') return 'ADMIN_PASSWORD ist nicht gesetzt.'
  } else if (!safeEqual(String(fd.get('password') ?? ''), pw)) return 'Falsches Passwort.'
  ;(await cookies()).set(SETUP_COOKIE, pw ? setupCookieValue(pw) : 'dev', { ...secureCookie, maxAge: 60 * 60 * 4 })
  redirect('/verwaltung')
}

export async function logout() {
  await endSession()
  const jar = await cookies()
  jar.delete(PLAN_COOKIE)
  jar.delete(SETUP_COOKIE)
  redirect('/login')
}

// --- Eigene Einstellungen ------------------------------------------------------

const isoOrNull = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)

/** Eigene Daten: Name, für Hilfskräfte Wochenstunden und Beschäftigungszeitraum */
export async function saveProfile(_: string | null, fd: FormData) {
  const me = await requireStaff()
  const name = str(fd, 'name')
  if (!name) return 'Bitte einen Namen eingeben.'
  const [taken] = await query('select 1 from staff where name = $1 and id <> $2', [name, me.id])
  if (taken) return 'Diesen Namen gibt es schon.'
  if (me.role === 'hiwi') {
    const hours = Number(str(fd, 'hours').replace(',', '.'))
    if (!Number.isFinite(hours) || hours < 0 || hours > 40) return 'Bitte die Wochenstunden als Zahl zwischen 0 und 40 eingeben.'
    const start = isoOrNull(str(fd, 'start'))
    const end = isoOrNull(str(fd, 'end'))
    if (start && end && start > end) return 'Das Ende liegt vor dem Beginn.'
    await query('update staff set name = $2, hours_per_week = $3, start_date = $4, end_date = $5 where id = $1', [
      me.id, name, hours, start, end,
    ])
  } else {
    await query('update staff set name = $2 where id = $1', [me.id, name])
  }
  await addLog(null, name, 'Eigene Daten geändert')
  revalidatePath('/', 'layout')
  return 'ok'
}

/** Erinnerungen vor dem Dienst: selbst an- und abmelden (je automatische E-Mail der Art „Erinnerung“) */
export async function saveReminders(_: string | null, fd: FormData) {
  const me = await requireStaff()
  const chosen = new Set(fd.getAll('reminder').map(String))
  const mails = await loadMails()
  for (const m of mails) {
    if (m.kind !== 'reminder') continue
    const others = m.staffIds.filter((id) => id !== me.id)
    m.staffIds = chosen.has(m.id) && me.role === 'hiwi' ? [...others, me.id] : others
  }
  await saveMails(mails)
  await addLog(null, me.name, chosen.size ? 'Erinnerungen per E-Mail eingeschaltet' : 'Erinnerungen per E-Mail ausgeschaltet')
  revalidatePath('/', 'layout')
  return 'ok'
}

export async function saveOwnPassword(_: string | null, fd: FormData) {
  const me = await requireStaff()
  const pw = String(fd.get('password') ?? '')
  const problem = passwordProblem(pw, String(fd.get('repeat') ?? ''))
  if (problem) return problem
  await setPassword(me.id, pw)
  await endSessionsOf(me.id, true)
  await addLog(null, me.name, 'Passwort geändert')
  revalidatePath('/einstellungen')
  return 'ok'
}

/** Passwort entfernen: Anmeldung dann nur noch per Code */
export async function removeOwnPassword() {
  const me = await requireStaff()
  await setPassword(me.id, null)
  await addLog(null, me.name, 'Passwort entfernt (Anmeldung nur per Code)')
  revalidatePath('/einstellungen')
}

export async function logoutOtherDevices() {
  const me = await requireStaff()
  await endSessionsOf(me.id, true)
  revalidatePath('/einstellungen')
}
