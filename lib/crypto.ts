import 'server-only'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto'

// Verschlüsselung und Hashes.
// - SHA-256: für alles, was nur verglichen, aber nie wieder gelesen werden muss (Sitzungen, Anmelde-Codes,
//   Kalender-Schlüssel). SHA-256 ist eine Einwegfunktion – daraus lässt sich nichts zurückgewinnen.
// - AES-256-GCM: für vertrauliche Inhalte, die wieder angezeigt werden (Notizen zu Abwesenheiten, SMTP-Passwort,
//   Kalender-Schlüssel zum Anzeigen).
// - scrypt: für Passwörter (absichtlich langsam, mit Salt; reines SHA-256 wäre zu schnell zu erraten).

/**
 * Schlüssel für AES: SECRET_KEY (empfohlen), sonst aus ADMIN_PASSWORD abgeleitet.
 * Ohne beides wird nichts verschlüsselt. Wird der Schlüssel geändert, sind verschlüsselte Werte nicht mehr lesbar.
 */
function secretKey() {
  const base = process.env.SECRET_KEY || (process.env.ADMIN_PASSWORD && `admin:${process.env.ADMIN_PASSWORD}`)
  return base ? createHash('sha256').update(`hiwi-schichtplan:${base}`).digest() : null
}

export const canStoreSecrets = () => secretKey() !== null

export const sha256Hex = (text: string) => createHash('sha256').update(text).digest('hex')

/** HMAC-SHA-256 mit dem geheimen Schlüssel (falls gesetzt) – für kurze Codes, die sonst leicht zu erraten wären */
export function keyedHash(text: string) {
  const key = secretKey()
  return key ? createHmac('sha256', key).update(text).digest('hex') : sha256Hex(`hiwi-schichtplan:${text}`)
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url')

/** 6-stelliger Zahlencode */
export const randomCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0')

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function encrypt(plain: string) {
  const key = secretKey()
  if (!key) throw new Error('Zum Speichern von Passwörtern SECRET_KEY setzen.')
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv, c.getAuthTag(), data].map((x) => (typeof x === 'string' ? x : x.toString('base64'))).join(':')
}

/** null, wenn nicht entschlüsselbar (z. B. Schlüssel geändert) */
export function decrypt(stored: string) {
  const key = secretKey()
  const [v, iv, tag, data] = stored.split(':')
  if (!key || v !== 'v1' || !iv || !tag || !data) return null
  try {
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
    d.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8')
  } catch {
    return null
  }
}

const SEALED = /^v1:[\w+/=]+:[\w+/=]+:[\w+/=]*$/

/** Verschlüsseln, wenn ein Schlüssel gesetzt ist (sonst unverändert); leere Werte bleiben leer. */
export const seal = (plain: string) => (plain && canStoreSecrets() ? encrypt(plain) : plain)

/** Gegenstück zu seal; ältere unverschlüsselte Werte kommen unverändert zurück. */
export function unseal(stored: string | null) {
  if (!stored || !SEALED.test(stored)) return stored ?? ''
  return decrypt(stored) ?? '(nicht lesbar – Schlüssel geändert)'
}

const scryptAsync = (pw: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  )

export async function hashPassword(pw: string) {
  const salt = randomBytes(16)
  return `scrypt:${salt.toString('base64')}:${(await scryptAsync(pw, salt)).toString('base64')}`
}

export async function verifyPassword(pw: string, stored: string | null) {
  const [kind, salt, hash] = (stored ?? '').split(':')
  // gleiche Rechenzeit auch ohne Passwort, damit sich nicht erkennen lässt, ob es ein Konto gibt
  const key = await scryptAsync(pw, salt ? Buffer.from(salt, 'base64') : Buffer.alloc(16))
  return kind === 'scrypt' && !!hash && timingSafeEqual(key, Buffer.from(hash, 'base64'))
}
