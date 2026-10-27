import 'server-only'
import { query } from './db'

// Einstellungen als Schlüssel/Wert in der Datenbank. Geheimnisse (SMTP-Passwort) nur verschlüsselt (AES-256-GCM, lib/crypto.ts).

export async function getSettings(prefix: string) {
  const rows = await query<{ key: string; value: string }>('select key, value from settings where key like $1', [`${prefix}%`])
  return Object.fromEntries(rows.map((r) => [r.key.slice(prefix.length), r.value])) as Record<string, string>
}

export async function setSetting(key: string, value: string | null) {
  if (value === null) await query('delete from settings where key = $1', [key])
  else await query('insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = $2', [key, value])
}

export { canStoreSecrets, decrypt, encrypt } from './crypto'
