import 'server-only'
import { cookies } from 'next/headers'
import { APP_TITLE, CHAIR } from './brand'
import { query } from './db'
import { hashPassword, keyedHash, randomCode, randomToken, sha256Hex, verifyPassword } from './crypto'
import { loadMailConfig, send } from './mail'
import { CHALLENGE_COOKIE, SESSION_COOKIE, SESSION_DAYS, secureCookie } from './session'

// Anmeldung: Code per E-Mail an die dienstliche Adresse (Standard) oder eigenes Passwort.
// Ein Passwort legt man über „Passwort vergessen?“ (Code per E-Mail) oder in den eigenen Einstellungen fest.

export type Purpose = 'login' | 'reset'

const CODE_MINUTES = 10
/** Fehlversuche je Code */
const CODE_ATTEMPTS = 5
/** angeforderte Codes je Person und Stunde */
const CODES_PER_HOUR = 5
/** Fehlversuche mit Passwort, danach kurz gesperrt */
const PASSWORD_ATTEMPTS = 5
const LOCK_MINUTES = 15

export const normEmail = (e: string) => e.trim().toLowerCase()

async function staffByEmail(email: string) {
  const rows = await query<{ id: number; name: string; email: string; password_hash: string | null; locked: boolean }>(
    `select id, name, email, password_hash, coalesce(locked_until > now(), false) as locked
     from staff where active and email <> '' and lower(email) = $1 limit 2`,
    [normEmail(email)],
  )
  // dieselbe Adresse bei mehreren Personen: nicht eindeutig
  return rows.length === 1 ? rows[0] : null
}

async function sendCode(to: string, name: string, code: string, purpose: Purpose) {
  const what = purpose === 'reset' ? 'zum Festlegen eines neuen Passworts' : 'zur Anmeldung'
  const text = [
    `Hallo ${name.split(/\s+/)[0]},`,
    '',
    `dein Code ${what} beim ${APP_TITLE}:`,
    '',
    code,
    '',
    `Der Code gilt ${CODE_MINUTES} Minuten. Falls du ihn nicht angefordert hast, kannst du diese E-Mail ignorieren.`,
    '',
    CHAIR,
  ].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.45">
    <p>Hallo ${name.split(/\s+/)[0].replace(/[&<>"]/g, '')},</p>
    <p>dein Code ${what} beim ${APP_TITLE}:</p>
    <p style="font-size:28px;font-weight:bold;letter-spacing:6px;color:#004d21">${code}</p>
    <p>Der Code gilt ${CODE_MINUTES} Minuten. Falls du ihn nicht angefordert hast, kannst du diese E-Mail ignorieren.</p>
    <p style="color:#555">${CHAIR}</p></div>`
  const { smtp, password } = await loadMailConfig()
  if (process.env.NODE_ENV !== 'production' && !(smtp.host && smtp.user && smtp.from && password)) {
    // lokale Entwicklung ohne E-Mail-Versand
    console.log(`[Anmeldung] Code für ${to}: ${code}`)
    return
  }
  await send([to], `${code} – dein Code für den ${APP_TITLE}`, text, html)
}

/**
 * Code anfordern. Antwortet immer gleich, auch wenn es die Adresse nicht gibt (damit sich nicht herausfinden lässt,
 * wer ein Konto hat). Im Cookie steht ein zufälliger Schlüssel, in der Datenbank nur dessen SHA-256.
 */
export async function requestCode(email: string, purpose: Purpose): Promise<string | null> {
  const token = randomToken()
  ;(await cookies()).set(CHALLENGE_COOKIE, `${purpose}.${token}`, { ...secureCookie, maxAge: CODE_MINUTES * 60 })
  const s = await staffByEmail(email)
  if (!s) return null
  const [{ n }] = await query<{ n: number }>(
    `select count(*)::int as n from login_codes where staff_id = $1 and created_at > now() - interval '1 hour'`,
    [s.id],
  )
  if (n >= CODES_PER_HOUR) return 'Zu viele Codes angefordert. Bitte in einer Stunde erneut versuchen.'
  const code = randomCode()
  const id = sha256Hex(token)
  // ältere offene Codes ungültig machen; abgelaufene aufräumen
  await query(`delete from login_codes where (staff_id = $1 and created_at < now() - interval '1 hour') or expires_at < now() - interval '1 day'`, [s.id])
  await query(`update login_codes set expires_at = now() where staff_id = $1 and expires_at > now()`, [s.id])
  await query(
    `insert into login_codes (id, staff_id, purpose, code_hash, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
    [id, s.id, purpose, keyedHash(`${id}:${code}`), CODE_MINUTES],
  )
  try {
    await sendCode(s.email, s.name, code, purpose)
  } catch (e) {
    console.error('Anmelde-Code nicht gesendet:', e)
    return 'Die E-Mail mit dem Code konnte nicht gesendet werden. Bitte später erneut versuchen.'
  }
  return null
}

async function challenge() {
  const v = (await cookies()).get(CHALLENGE_COOKIE)?.value ?? ''
  const [purpose, token] = v.split('.')
  return token && (purpose === 'login' || purpose === 'reset') ? { purpose: purpose as Purpose, id: sha256Hex(token) } : null
}

/** Welcher Code wird gerade erwartet? (für die Anmeldeseite) */
export const pendingPurpose = async () => (await challenge())?.purpose ?? null

/** Code prüfen: liefert die Person oder eine Fehlermeldung */
export async function checkCode(code: string): Promise<{ staffId: number; purpose: Purpose } | { error: string }> {
  const c = await challenge()
  if (!c) return { error: 'Der Code ist abgelaufen. Bitte einen neuen anfordern.' }
  const [row] = await query<{ staff_id: number; purpose: Purpose; code_hash: string; attempts: number }>(
    `update login_codes set attempts = attempts + 1
     where id = $1 and expires_at > now() and not verified and attempts < $2
     returning staff_id, purpose, code_hash, attempts`,
    [c.id, CODE_ATTEMPTS],
  )
  const clean = code.replace(/\D/g, '')
  if (!row || row.purpose !== c.purpose || keyedHash(`${c.id}:${clean}`) !== row.code_hash) {
    return { error: row && row.attempts < CODE_ATTEMPTS ? 'Der Code stimmt nicht.' : 'Der Code ist nicht mehr gültig. Bitte einen neuen anfordern.' }
  }
  if (row.purpose === 'login') {
    await query('delete from login_codes where id = $1', [c.id])
    ;(await cookies()).delete(CHALLENGE_COOKIE)
  } else {
    // „Passwort vergessen“: bestätigt, jetzt noch das neue Passwort festlegen
    await query('update login_codes set verified = true where id = $1', [c.id])
  }
  await query('update staff set failed_logins = 0, locked_until = null where id = $1', [row.staff_id])
  return { staffId: row.staff_id, purpose: row.purpose }
}

/** Nach bestätigtem Code („Passwort vergessen“): Person, deren Passwort festgelegt werden darf */
export async function verifiedResetStaff() {
  const c = await challenge()
  if (!c || c.purpose !== 'reset') return null
  const [row] = await query<{ staff_id: number }>(
    'select staff_id from login_codes where id = $1 and verified and expires_at > now()',
    [c.id],
  )
  return row?.staff_id ?? null
}

export async function finishReset() {
  const c = await challenge()
  if (c) await query('delete from login_codes where id = $1', [c.id])
  ;(await cookies()).delete(CHALLENGE_COOKIE)
}

export const PASSWORD_MIN = 10

export function passwordProblem(pw: string, repeat: string) {
  if (pw.length < PASSWORD_MIN) return `Das Passwort muss mindestens ${PASSWORD_MIN} Zeichen lang sein.`
  if (pw.length > 200) return 'Das Passwort ist zu lang.'
  if (pw !== repeat) return 'Die beiden Passwörter stimmen nicht überein.'
  return null
}

export async function setPassword(staffId: number, pw: string | null) {
  await query('update staff set password_hash = $2, failed_logins = 0, locked_until = null where id = $1', [
    staffId, pw === null ? null : await hashPassword(pw),
  ])
}

export async function hasPassword(staffId: number) {
  const [r] = await query<{ ok: boolean }>('select password_hash is not null as ok from staff where id = $1', [staffId])
  return !!r?.ok
}

/** Anmeldung mit Passwort: Person oder null (gleiche Meldung bei falscher Adresse, falschem Passwort und Sperre) */
export async function checkPassword(email: string, pw: string) {
  const s = await staffByEmail(email)
  const ok = await verifyPassword(pw, s?.password_hash ?? null)
  if (!s) return null
  if (s.locked) return null
  if (!ok) {
    await query(
      `update staff set
         locked_until = case when failed_logins + 1 >= $2 then now() + make_interval(mins => $3) else locked_until end,
         failed_logins = case when failed_logins + 1 >= $2 then 0 else failed_logins + 1 end
       where id = $1`,
      [s.id, PASSWORD_ATTEMPTS, LOCK_MINUTES],
    )
    return null
  }
  await query('update staff set failed_logins = 0, locked_until = null where id = $1', [s.id])
  return s.id
}

export async function startSession(staffId: number) {
  const token = randomToken()
  await query('delete from sessions where expires_at < now()')
  await query(`insert into sessions (id, staff_id, expires_at) values ($1, $2, now() + make_interval(days => $3))`, [
    sha256Hex(token), staffId, SESSION_DAYS,
  ])
  ;(await cookies()).set(SESSION_COOKIE, token, { ...secureCookie, maxAge: SESSION_DAYS * 24 * 60 * 60 })
}

export async function endSession() {
  const jar = await cookies()
  const token = jar.get(SESSION_COOKIE)?.value
  if (token) await query('delete from sessions where id = $1', [sha256Hex(token)])
  jar.delete(SESSION_COOKIE)
}

/** Alle Sitzungen einer Person beenden, optional außer der aktuellen */
export async function endSessionsOf(staffId: number, keepCurrent = false) {
  const token = keepCurrent ? (await cookies()).get(SESSION_COOKIE)?.value : undefined
  await query('delete from sessions where staff_id = $1 and id <> $2', [staffId, token ? sha256Hex(token) : ''])
}
