import 'server-only'
import nodemailer from 'nodemailer'
import { absenceRange } from './absence-mail'
import { APP_TITLE, CHAIR } from './brand'
import {
  ABSENCE_LABELS, listAbsences, listAppointments, listStaff, loadDays, ROLE_LABELS, type Absence,
} from './data'
import { addDays, formatDate, formatDateTime, todayIso, WEEKDAYS, weekday } from './dates'
import { query } from './db'
import { decrypt, getSettings, setSetting } from './settings'

// --- Einstellungen -------------------------------------------------------------------

export type SmtpConfig = { host: string; port: number; security: 'starttls' | 'ssl'; user: string; from: string; hasPassword: boolean }
export type Frequency = 'off' | 'daily' | 'weekly'
export type DigestConfig = {
  recipients: string[]
  frequency: Frequency
  /** 1 = Montag … 5 = Freitag (nur wöchentlich) */
  weekday: number
  weeks: number
  absences: boolean
  duties: boolean
  appointments: boolean
  /** nur senden, wenn seit der letzten E-Mail neue Abwesenheiten eingetragen wurden */
  onlyNew: boolean
  lastSent: string | null
  lastResult: string | null
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  off: 'aus',
  daily: 'werktäglich (Mo–Fr)',
  weekly: 'wöchentlich',
}

export async function loadMailConfig() {
  const [m, d] = await Promise.all([getSettings('smtp.'), getSettings('digest.')])
  const smtp: SmtpConfig = {
    host: m.host ?? '',
    port: Number(m.port) || 587,
    security: m.security === 'ssl' ? 'ssl' : 'starttls',
    user: m.user ?? '',
    from: m.from ?? '',
    hasPassword: !!m.password,
  }
  const digest: DigestConfig = {
    recipients: (d.recipients ?? '').split(/[\s,;]+/).filter(Boolean),
    frequency: (['daily', 'weekly'] as const).find((f) => f === d.frequency) ?? 'off',
    weekday: Math.min(5, Math.max(1, Number(d.weekday) || 1)),
    weeks: Math.min(26, Math.max(1, Number(d.weeks) || 4)),
    absences: d.absences !== '0',
    duties: d.duties === '1',
    appointments: d.appointments !== '0',
    onlyNew: d.onlyNew === '1',
    lastSent: d.lastSent ?? null,
    lastResult: d.lastResult ?? null,
  }
  return { smtp, digest, password: m.password ? decrypt(m.password) : null }
}

// --- Versand ---------------------------------------------------------------------

async function send(to: string[], subject: string, text: string, html: string) {
  const { smtp, password } = await loadMailConfig()
  if (!smtp.host || !smtp.user || !smtp.from) throw new Error('SMTP-Server, Benutzername und Absender fehlen.')
  if (!password) throw new Error('SMTP-Passwort fehlt oder ist nicht mehr entschlüsselbar – bitte neu eingeben.')
  if (!to.length) throw new Error('Keine Empfänger eingetragen.')
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.security === 'ssl',
    requireTLS: smtp.security === 'starttls',
    auth: { user: smtp.user, pass: password },
    connectionTimeout: 15_000,
  })
  await transport.sendMail({ from: smtp.from, to, subject, text, html })
}

// --- Zusammenfassung ---------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

type Section = { title: string; lines: string[] }

export async function buildDigest(cfg: DigestConfig, origin: string) {
  const today = todayIso()
  const until = addDays(today, cfg.weeks * 7 - 1)
  const staff = await listStaff()
  const byId = new Map(staff.map((s) => [s.id, s]))
  const who = (id: number) => {
    const s = byId.get(id)
    return s ? `${s.name} (${ROLE_LABELS[s.role]})` : '?'
  }
  const absenceLine = (a: Absence) => `${who(a.staff_id)}: ${ABSENCE_LABELS[a.kind]} ${absenceRange(a)}${a.note ? ` – ${a.note}` : ''}`
  const sections: Section[] = []

  const fresh = cfg.lastSent
    ? await query<Absence>(
        `select id, staff_id, from_date, to_date, kind, note, created_by from absences
         where created_at > $1 and to_date >= $2 order by from_date`,
        [cfg.lastSent, today],
      )
    : []
  if (cfg.absences) {
    if (fresh.length) sections.push({ title: `Neu eingetragen seit ${formatDateTime(cfg.lastSent!)}`, lines: fresh.map(absenceLine) })
    const all = await listAbsences(today, until)
    sections.push({
      title: `Abwesenheiten und Urlaube bis ${formatDate(until)}`,
      lines: all.length ? all.map(absenceLine) : ['Niemand eingetragen.'],
    })
  }
  if (cfg.appointments) {
    const apps = await listAppointments(today, until)
    if (apps.length) {
      sections.push({
        title: 'Termine für alle',
        lines: apps.map((a) => `${formatDate(a.date)}${a.time ? ` ${a.time}` : ''}: ${a.title}${a.note ? ` – ${a.note}` : ''}`),
      })
    }
  }
  if (cfg.duties) {
    const days = await loadDays(today, addDays(today, 6))
    sections.push({
      title: 'Dienste der Hilfskräfte (nächste 7 Tage)',
      lines: days.map((d) => {
        const label = `${WEEKDAYS[weekday(d.date) - 1].slice(0, 2)}, ${formatDate(d.date)}`
        if (d.closed) return `${label}: ${d.closed}`
        if (!d.period) return `${label}: kein Zeitraum angelegt`
        const people = d.entries.map((e) => `${byId.get(e.staff_id)?.name ?? '?'} (${e.label})`)
        return `${label}: ${people.join(', ') || 'niemand eingeteilt'}`
      }),
    })
  }

  const subject = `${APP_TITLE}: Übersicht ${formatDate(today)}${fresh.length ? ` – ${fresh.length} neue Abwesenheit${fresh.length === 1 ? '' : 'en'}` : ''}`
  const link = `${origin}/uebersicht`
  const text = [
    `${APP_TITLE} – ${CHAIR}`,
    '',
    ...sections.flatMap((s) => [s.title, ...s.lines.map((l) => `- ${l}`), '']),
    `Aktuelle Übersicht: ${link}`,
  ].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
<p style="color:#555">${esc(APP_TITLE)} – ${esc(CHAIR)}</p>
${sections
  .map(
    (s) => `<h3 style="color:#004d21;margin:18px 0 6px">${esc(s.title)}</h3><ul style="margin:0;padding-left:18px">${s.lines
      .map((l) => `<li>${esc(l)}</li>`)
      .join('')}</ul>`,
  )
  .join('\n')}
<p style="margin-top:18px"><a href="${esc(link)}" style="color:#00883a">Aktuelle Übersicht öffnen</a></p>
</div>`
  return { subject, text, html, fresh: fresh.length }
}

/**
 * Zusammenfassung senden. force = sofort als Test (Knopf in den Einstellungen), sonst nur, wenn laut Zeitplan heute fällig
 * und heute noch nicht gesendet. Ergebnis wird in den Einstellungen angezeigt.
 */
export async function runDigest(origin: string, force = false) {
  const { digest } = await loadMailConfig()
  const today = todayIso()
  if (!force) {
    if (digest.frequency === 'off') return 'aus'
    const day = weekday(today)
    if (day > 5 || (digest.frequency === 'weekly' && day !== digest.weekday)) return 'heute nicht fällig'
    if (digest.lastSent && new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(digest.lastSent)) === today) {
      return 'heute schon gesendet'
    }
  }
  try {
    const mail = await buildDigest(digest, origin)
    if (!force && digest.onlyNew && digest.lastSent && !mail.fresh) {
      await setSetting('digest.lastResult', `${formatDateTime(new Date())}: nichts Neues, nicht gesendet`)
      return 'nichts Neues'
    }
    await send(digest.recipients, mail.subject, mail.text, mail.html)
    // Test-E-Mails zählen nicht als letzte Zusammenfassung („neu seit …“ bleibt erhalten)
    if (!force) await setSetting('digest.lastSent', new Date().toISOString())
    const what = force ? 'Test gesendet' : 'gesendet'
    await setSetting('digest.lastResult', `${formatDateTime(new Date())}: ${what} an ${digest.recipients.join(', ')}`)
    return 'gesendet'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await setSetting('digest.lastResult', `${formatDateTime(new Date())}: Fehler – ${msg}`)
    return `Fehler: ${msg}`
  }
}
