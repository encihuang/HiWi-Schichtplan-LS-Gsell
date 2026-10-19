import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { query } from './db'

// Einstellungen als Schlüssel/Wert in der Datenbank. Geheimnisse (SMTP-Passwort) nur verschlüsselt (AES-256-GCM).

export async function getSettings(prefix: string) {
  const rows = await query<{ key: string; value: string }>('select key, value from settings where key like $1', [`${prefix}%`])
  return Object.fromEntries(rows.map((r) => [r.key.slice(prefix.length), r.value])) as Record<string, string>
}

export async function setSetting(key: string, value: string | null) {
  if (value === null) await query('delete from settings where key = $1', [key])
  else await query('insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = $2', [key, value])
}

/**
 * Schlüssel für Geheimnisse: SECRET_KEY (empfohlen), sonst aus ADMIN_PASSWORD abgeleitet.
 * Ohne beides werden keine Passwörter gespeichert. Wird der Schlüssel geändert, muss das Passwort neu eingegeben werden.
 */
function secretKey() {
  const base = process.env.SECRET_KEY || (process.env.ADMIN_PASSWORD && `admin:${process.env.ADMIN_PASSWORD}`)
  return base ? createHash('sha256').update(`hiwi-schichtplan:${base}`).digest() : null
}

export const canStoreSecrets = () => secretKey() !== null

export function encrypt(plain: string) {
  const key = secretKey()
  if (!key) throw new Error('Zum Speichern von Passwörtern SECRET_KEY oder ADMIN_PASSWORD setzen.')
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
