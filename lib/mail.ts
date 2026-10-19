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
import {
  BLOCK_PLACEHOLDERS, DEFAULT_MAIL, type AutoMail, type BlockKey, type Frequency,
} from './mail-shared'

export { FREQUENCY_LABELS, PLACEHOLDERS, BLOCK_PLACEHOLDERS, DEFAULT_MAIL } from './mail-shared'
export type { AutoMail, Frequency } from './mail-shared'

// --- Einstellungen -------------------------------------------------------------------

export type SmtpConfig = { host: string; port: number; security: 'starttls' | 'ssl'; user: string; from: string; hasPassword: boolean }

/** Text der Abwesenheitsmeldung, die Personen selbst ans Sekretariat schicken (mailto) */
export type AbsenceTexts = { absenceGreeting: string; absenceIntro: string; absenceClosing: string }

export const DEFAULT_ABSENCE_TEXTS: AbsenceTexts = {
  absenceGreeting: 'Guten Tag,',
  absenceIntro: 'ich bin zu folgenden Zeiten abwesend:',
  absenceClosing: 'Viele Grüße',
}

export async function loadAbsenceTexts(): Promise<AbsenceTexts> {
  const t = await getSettings('text.')
  return Object.fromEntries(
    Object.entries(DEFAULT_ABSENCE_TEXTS).map(([k, v]) => [k, t[k] ?? v]),
  ) as AbsenceTexts
}

/** Zustand einer automatischen E-Mail (getrennt von der Konfiguration, damit Speichern ihn nicht überschreibt) */
export type MailState = { lastSent: string | null; lastResult: string | null }

const clampMail = (m: Partial<AutoMail> & { id: string }): AutoMail => ({
  ...DEFAULT_MAIL,
  ...m,
  frequency: (['daily', 'weekly'] as const).find((f) => f === m.frequency) ?? 'off',
  weekday: Math.min(5, Math.max(1, Number(m.weekday) || 1)),
  weeks: Math.min(26, Math.max(1, Number(m.weeks) || 4)),
  staffIds: (m.staffIds ?? []).map(Number).filter(Boolean),
  extra: m.extra ?? [],
})

/**
 * Automatische E-Mails. Gespeichert als JSON unter „mails.json“. Gibt es das noch nicht, wird die frühere einzelne
 * Zusammenfassung (digest.* und text.*) übernommen.
 */
export async function loadMails(): Promise<AutoMail[]> {
  const [stored, d, t] = await Promise.all([getSettings('mails.'), getSettings('digest.'), getSettings('text.')])
  const mails = stored.json
  if (mails !== undefined) {
    try {
      return (JSON.parse(mails) as AutoMail[]).map(clampMail)
    } catch {
      return []
    }
  }
  if (!d.recipients && !d.frequency) return [clampMail({ id: 'm1' })]
  const blocks = [
    d.absences !== '0' && '{neue_abwesenheiten}\n\n{abwesenheiten}',
    d.appointments !== '0' && '{termine}',
    d.duties === '1' && '{dienste}',
  ].filter(Boolean)
  const body = [t.intro, ...blocks, 'Aktuelle Übersicht: {link}', t.closing].filter((x) => x && x.trim()).join('\n\n')
  return [
    clampMail({
      id: 'legacy',
      name: 'Zusammenfassung',
      extra: (d.recipients ?? '').split(/[\s,;]+/).filter(Boolean),
      frequency: d.frequency as Frequency,
      weekday: Number(d.weekday),
      weeks: Number(d.weeks),
      onlyNew: d.onlyNew === '1',
      updates: d.updates === '1',
      subject: t.subject || DEFAULT_MAIL.subject,
      updateSubject: t.updateSubject || DEFAULT_MAIL.updateSubject,
      body,
    }),
  ]
}

export async function saveMails(mails: AutoMail[]) {
  await setSetting('mails.json', JSON.stringify(mails.map(clampMail)))
}

export async function loadMailStates(): Promise<Record<string, MailState>> {
  const [s, d] = await Promise.all([getSettings('mailstate.'), getSettings('digest.')])
  const out: Record<string, MailState> = {}
  for (const [k, v] of Object.entries(s)) {
    const [id, field] = k.split('.')
    out[id] ??= { lastSent: null, lastResult: null }
    if (field === 'lastSent' || field === 'lastResult') out[id][field] = v
  }
  // frühere einzelne Zusammenfassung
  out.legacy ??= { lastSent: d.lastSent ?? null, lastResult: d.lastResult ?? null }
  return out
}

const setState = (id: string, field: keyof MailState, value: string) => setSetting(`mailstate.${id}.${field}`, value)

export async function loadMailConfig() {
  const m = await getSettings('smtp.')
  const smtp: SmtpConfig = {
    host: m.host ?? '',
    port: Number(m.port) || 587,
    security: m.security === 'ssl' ? 'ssl' : 'starttls',
    user: m.user ?? '',
    from: m.from ?? '',
    hasPassword: !!m.password,
  }
  return { smtp, password: m.password ? decrypt(m.password) : null }
}

/** Empfänger-Adressen: ausgewählte aktive Personen mit E-Mail plus weitere Adressen */
export async function recipientsOf(mail: AutoMail) {
  const staff = await listStaff()
  const chosen = staff.filter((s) => s.active && s.email && mail.staffIds.includes(s.id)).map((s) => s.email)
  return [...new Set([...chosen, ...mail.extra])]
}

/** true, wenn eine eingeschaltete automatische E-Mail Abwesenheiten enthält und Empfänger hat */
export async function absenceDigestActive() {
  const mails = await loadMails()
  for (const m of mails) {
    if (m.frequency !== 'off' && covers(m, 'absences') && (await recipientsOf(m)).length) return true
  }
  return false
}

// --- Versand ---------------------------------------------------------------------

async function send(to: string[], subject: string, text: string, html: string) {
  const { smtp, password } = await loadMailConfig()
  if (!smtp.host || !smtp.user || !smtp.from) throw new Error('SMTP-Server, Benutzername und Absender fehlen.')
  if (!password) throw new Error('SMTP-Passwort fehlt oder ist nicht mehr entschlüsselbar – bitte neu eingeben.')
  if (!to.length) throw new Error('Keine Empfänger ausgewählt.')
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

// --- Inhalt ------------------------------------------------------------------------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

type Block = { title: string; lines: string[] }

const uses = (m: AutoMail, ...keys: string[]) => keys.some((k) => `${m.subject}\n${m.body}`.includes(`{${k}}`))

/** Enthält die E-Mail Abwesenheiten bzw. Termine? (für Aktualisierungen) */
function covers(m: AutoMail, topic: 'absences' | 'appointments') {
  return topic === 'absences'
    ? uses(m, 'abwesenheiten', 'neue_abwesenheiten', 'abwesend_heute', 'neu')
    : uses(m, 'termine')
}

/** Ersetzt {platzhalter} in Text und HTML; Listen-Platzhalter werden zu Überschrift + Aufzählung. */
function render(template: string, values: Record<string, string>, blocks: Partial<Record<BlockKey, Block>>) {
  const parts = template.split(/(\{\w+\})/)
  let text = ''
  let html = ''
  parts.forEach((part, i) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1]
    const block = key && key in BLOCK_PLACEHOLDERS ? blocks[key as BlockKey] : undefined
    if (key && block) {
      text += [block.title, ...block.lines.map((l) => `- ${l}`)].join('\n')
      html += `<h3 style="color:#004d21;margin:14px 0 4px;font-size:15px">${esc(block.title)}</h3><ul style="margin:0 0 4px;padding-left:18px">${block.lines
        .map((l) => `<li>${esc(l)}</li>`)
        .join('')}</ul>`
    } else if (key && key in values) {
      text += values[key]
      html += key === 'link' ? `<a href="${esc(values.link)}" style="color:#00883a">${esc(values.link)}</a>` : esc(values[key])
    } else {
      text += part
      // Zeilenumbrüche direkt an Listen grenzen sonst doppelt an
      const prevBlock = i > 0 && /^\{(\w+)\}$/.test(parts[i - 1]) && parts[i - 1].slice(1, -1) in BLOCK_PLACEHOLDERS
      const nextBlock = i + 1 < parts.length && parts[i + 1].slice(1, -1) in BLOCK_PLACEHOLDERS
      let h = part
      if (prevBlock) h = h.replace(/^\n/, '')
      if (nextBlock) h = h.replace(/\n$/, '')
      html += esc(h).replace(/\n/g, '<br>')
    }
  })
  return { text, html }
}

export async function buildMail(mail: AutoMail, state: MailState, origin: string, change?: string) {
  const today = todayIso()
  const until = addDays(today, mail.weeks * 7 - 1)
  const staff = await listStaff()
  const byId = new Map(staff.map((s) => [s.id, s]))
  const who = (id: number) => {
    const s = byId.get(id)
    return s ? `${s.name} (${ROLE_LABELS[s.role]})` : '?'
  }
  const absenceLine = (a: Absence) => `${who(a.staff_id)}: ${ABSENCE_LABELS[a.kind]} ${absenceRange(a)}${a.note ? ` – ${a.note}` : ''}`

  const fresh = state.lastSent
    ? await query<Absence>(
        `select id, staff_id, from_date, to_date, kind, note, created_by from absences
         where created_at > $1 and to_date >= $2 order by from_date`,
        [state.lastSent, today],
      )
    : []

  const blocks: Partial<Record<BlockKey, Block>> = {}
  if (uses(mail, 'abwesenheiten')) {
    const all = await listAbsences(today, until)
    blocks.abwesenheiten = {
      title: `Abwesenheiten und Urlaube bis ${formatDate(until)}`,
      lines: all.length ? all.map(absenceLine) : ['Niemand eingetragen.'],
    }
  }
  if (uses(mail, 'abwesend_heute')) {
    const now = await listAbsences(today, today)
    blocks.abwesend_heute = { title: `Heute abwesend (${formatDate(today)})`, lines: now.length ? now.map(absenceLine) : ['Niemand.'] }
  }
  if (uses(mail, 'neue_abwesenheiten')) {
    blocks.neue_abwesenheiten = {
      title: state.lastSent ? `Neu eingetragen seit ${formatDateTime(state.lastSent)}` : 'Neu eingetragen',
      lines: fresh.length ? fresh.map(absenceLine) : ['Nichts Neues.'],
    }
  }
  if (uses(mail, 'termine')) {
    const apps = await listAppointments(today, until)
    blocks.termine = {
      title: `Termine bis ${formatDate(until)}`,
      lines: apps.length
        ? apps.map((a) => `${formatDate(a.date)}${a.time ? ` ${a.time}` : ''}: ${a.title}${a.note ? ` – ${a.note}` : ''}`)
        : ['Keine Termine.'],
    }
  }
  if (uses(mail, 'dienste')) {
    const days = await loadDays(today, addDays(today, 6))
    blocks.dienste = {
      title: 'Dienste der Hilfskräfte (nächste 7 Tage)',
      lines: days.map((d) => {
        const label = `${WEEKDAYS[weekday(d.date) - 1].slice(0, 2)}, ${formatDate(d.date)}`
        if (d.closed) return `${label}: ${d.closed}`
        if (!d.period) return `${label}: kein Zeitraum angelegt`
        const people = d.entries.map((e) => `${byId.get(e.staff_id)?.name ?? '?'} (${e.label})`)
        return `${label}: ${people.join(', ') || 'niemand eingeteilt'}`
      }),
    }
  }

  const values: Record<string, string> = {
    titel: APP_TITLE,
    lehrstuhl: CHAIR,
    datum: formatDate(today),
    wochentag: weekday(today) <= 5 ? WEEKDAYS[weekday(today) - 1] : '',
    bis: formatDate(until),
    wochen: String(mail.weeks),
    neu: String(fresh.length),
    aenderung: change ?? '',
    link: `${origin}/uebersicht`,
  }
  const subject = render(change ? mail.updateSubject : mail.subject, values, {}).text.replace(/\s+/g, ' ').trim()
  // Aktualisierung ohne {aenderung} im Text: Änderung oben einfügen
  const body = change && !mail.body.includes('{aenderung}') ? `Änderung: {aenderung}\n\n${mail.body}` : mail.body
  const out = render(body, values, blocks)
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.45">${out.html}</div>`
  return { subject, text: out.text, html, fresh: fresh.length }
}

// --- Zeitplan -------------------------------------------------------------------------

const berlinDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(iso))

async function runOne(mail: AutoMail, state: MailState, origin: string, force: boolean) {
  const today = todayIso()
  if (!force) {
    if (mail.frequency === 'off') return 'aus'
    const day = weekday(today)
    if (day > 5 || (mail.frequency === 'weekly' && day !== mail.weekday)) return 'heute nicht fällig'
    if (state.lastSent && berlinDay(state.lastSent) === today) return 'heute schon gesendet'
  }
  try {
    const out = await buildMail(mail, state, origin)
    if (!force && mail.onlyNew && state.lastSent && !out.fresh) {
      await setState(mail.id, 'lastResult', `${formatDateTime(new Date())}: nichts Neues, nicht gesendet`)
      return 'nichts Neues'
    }
    const to = await recipientsOf(mail)
    await send(to, out.subject, out.text, out.html)
    // Test-E-Mails zählen nicht als letzte Zusendung („neu seit …“ bleibt erhalten)
    if (!force) await setState(mail.id, 'lastSent', new Date().toISOString())
    await setState(mail.id, 'lastResult', `${formatDateTime(new Date())}: ${force ? 'Test gesendet' : 'gesendet'} an ${to.join(', ')}`)
    return 'gesendet'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await setState(mail.id, 'lastResult', `${formatDateTime(new Date())}: Fehler – ${msg}`)
    return `Fehler: ${msg}`
  }
}

/** Alle fälligen automatischen E-Mails senden (täglicher Cron). Mit id nur diese, sofort als Test. */
export async function runMails(origin: string, testId?: string) {
  const [mails, states] = await Promise.all([loadMails(), loadMailStates()])
  const result: Record<string, string> = {}
  for (const m of mails) {
    if (testId && m.id !== testId) continue
    result[m.name] = await runOne(m, states[m.id] ?? { lastSent: null, lastResult: null }, origin, !!testId)
  }
  return result
}

/**
 * Aktualisierung nach einer Änderung (Abwesenheit oder Termin eingetragen/gelöscht) an alle E-Mails, die das Thema
 * enthalten, Aktualisierungen eingeschaltet haben und schon einmal planmäßig verschickt wurden.
 */
export async function sendUpdate(origin: string, topic: 'absences' | 'appointments', change: string) {
  const [mails, states] = await Promise.all([loadMails(), loadMailStates()])
  for (const m of mails) {
    const state = states[m.id]
    if (!m.updates || m.frequency === 'off' || !state?.lastSent || !covers(m, topic)) continue
    try {
      const to = await recipientsOf(m)
      if (!to.length) continue
      const out = await buildMail(m, state, origin, change)
      await send(to, out.subject, out.text, out.html)
      await setState(m.id, 'lastResult', `${formatDateTime(new Date())}: Aktualisierung gesendet (${change})`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await setState(m.id, 'lastResult', `${formatDateTime(new Date())}: Fehler bei Aktualisierung – ${msg}`)
    }
  }
}
