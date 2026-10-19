import 'server-only'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { getStaff } from './data'

export const STAFF_COOKIE = 'hiwi_staff'
export const ACCESS_COOKIE = 'hiwi_access'
export const ADMIN_COOKIE = 'hiwi_admin'
export const PLAN_COOKIE = 'hiwi_planung'

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hiwi-schichtplan:' + text))
  return Buffer.from(buf).toString('hex')
}

/** Die ausgewählte Person (aktiv), sonst null. Pro Anfrage nur einmal geladen (Layout + Seite). */
export const currentStaff = cache(async () => {
  const id = Number((await cookies()).get(STAFF_COOKIE)?.value)
  if (!id) return null
  const s = await getStaff(id)
  return s?.active ? s : null
})

export async function requireStaff() {
  const s = await currentStaff()
  if (!s) throw new Error('Bitte zuerst auswählen, wer du bist.')
  return s
}

export async function isAdmin() {
  const pw = process.env.ADMIN_PASSWORD
  if (!pw) return true
  return (await cookies()).get(ADMIN_COOKIE)?.value === (await sha256(pw))
}

export async function requireAdmin() {
  if (!(await isAdmin())) throw new Error('Nur mit dem Passwort für die Einstellungen.')
}

/**
 * Planungsmodus: Verfügbarkeiten und Schichten aller Hilfskräfte bearbeiten.
 * Einschalten darf, wer auch die Einstellungen öffnen darf (ADMIN_PASSWORD, falls gesetzt).
 */
export async function canEditOthers() {
  if ((await cookies()).get(PLAN_COOKIE)?.value !== '1') return false
  return isAdmin()
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
