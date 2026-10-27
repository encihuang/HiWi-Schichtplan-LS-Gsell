import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { query } from './db'
import { safeEqual, sha256Hex } from './crypto'
import type { Staff } from './data'
import { smtpReady } from './mail'

export const SESSION_COOKIE = 'hiwi_session'
export const CHALLENGE_COOKIE = 'hiwi_challenge'
/** nur für die Einrichtung: Zugang zur Verwaltung mit ADMIN_PASSWORD, solange sich noch niemand anmelden kann */
export const SETUP_COOKIE = 'hiwi_setup'
export const PLAN_COOKIE = 'hiwi_planung'

/** Anmeldung gilt so lange (danach neu anmelden) */
export const SESSION_DAYS = 14

export const secureCookie = { httpOnly: true, sameSite: 'lax' as const, path: '/', secure: process.env.NODE_ENV === 'production' }

/**
 * Angemeldete Person (aktiv, Sitzung gültig), sonst null. Pro Anfrage nur einmal geladen (Layout + Seite).
 * Im Cookie steht ein zufälliger Schlüssel, in der Datenbank nur dessen SHA-256.
 */
export const currentStaff = cache(async (): Promise<Staff | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const [s] = await query<Staff>(
    `select s.id, s.name, s.hours_per_week::float as hours_per_week, s.start_date, s.end_date, s.active, s.email, s.role, s.is_admin
     from sessions x join staff s on s.id = x.staff_id
     where x.id = $1 and x.expires_at > now() and s.active`,
    [sha256Hex(token)],
  )
  return s ?? null
})

/** Für Seiten: ohne Anmeldung zur Anmeldeseite */
export async function requireUser(next = '/') {
  const s = await currentStaff()
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`)
  return s
}

/** Für Server-Aktionen */
export async function requireStaff() {
  const s = await currentStaff()
  if (!s) throw new Error('Bitte anmelden.')
  return s
}

/** Kann sich überhaupt jemand anmelden? (E-Mail-Versand eingerichtet und eine aktive Person mit Verwaltungsrechten) */
export async function loginReady() {
  if (!(await smtpReady())) return false
  const [a] = await query(`select 1 from staff where active and is_admin and email <> '' limit 1`)
  return !!a
}

/**
 * Einrichtung: Solange sich niemand mit Verwaltungsrechten anmelden kann, öffnet ADMIN_PASSWORD die Verwaltung
 * (E-Mail-Versand einrichten, Personen anlegen). Danach ist dieser Zugang gesperrt.
 * Ohne ADMIN_PASSWORD nur in der lokalen Entwicklung offen.
 */
export async function setupAccess() {
  if (await loginReady()) return false
  const pw = process.env.ADMIN_PASSWORD
  const v = (await cookies()).get(SETUP_COOKIE)?.value
  if (!v) return false
  if (!pw) return process.env.NODE_ENV !== 'production' && v === 'dev'
  return safeEqual(v, setupCookieValue(pw))
}

export const setupCookieValue = (pw: string) => sha256Hex(`hiwi-schichtplan:setup:${pw}`)

/** Verwaltung: angemeldet mit Verwaltungsrechten (oder Einrichtung) */
export async function isAdmin() {
  const me = await currentStaff()
  if (me) return me.is_admin
  return setupAccess()
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Nur mit Verwaltungsrechten.')
}

/**
 * Planungsmodus: Verfügbarkeiten und Schichten aller Hilfskräfte bearbeiten.
 * Einschalten dürfen alle Hilfskräfte und wer Verwaltungsrechte hat.
 */
export const mayPlan = (s: Pick<Staff, 'role' | 'is_admin'>) => s.role === 'hiwi' || s.is_admin

export async function canEditOthers() {
  if ((await cookies()).get(PLAN_COOKIE)?.value !== '1') return false
  const me = await currentStaff()
  return !!me && mayPlan(me)
}

/**
 * Schichten übernehmen/abgeben: nur Hilfskräfte selbst; andere (z. B. Sekretariat) nur im Planungsmodus.
 */
export async function requireShiftActor() {
  const s = await requireStaff()
  if (s.role === 'wimi' || (s.role !== 'hiwi' && !(await canEditOthers()))) {
    throw new Error('Schichten übernehmen nur studentische Hilfskräfte – zum Bearbeiten den Planungsmodus einschalten.')
  }
  return s
}
