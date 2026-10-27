import 'server-only'
import { APP_TITLE, CHAIR } from './brand'
import { hiwisWithDuties, lectureText, listStaff, loadDays, type DayInfo, type Staff } from './data'
import { addDays, berlinHour, formatDate, formatDateTime, todayIso, WEEKDAYS, weekday } from './dates'
import { query } from './db'
import { loadMailConfig, loadMails, send, setState } from './mail'
import type { AutoMail } from './mail-shared'

// Erinnerung an Hilfskräfte vor ihrem Dienst: automatische E-Mails der Art „reminder“ (Verwaltung → Automatische E-Mails; an- und abmelden in den eigenen Einstellungen).

/** n-ter Werktag (Mo–Fr) ab d; n = 0: d selbst */
function workdayAfter(d: string, n: number) {
  let x = d
  for (let i = 0; i < n; ) {
    x = addDays(x, 1)
    if (weekday(x) <= 5) i++
  }
  return x
}

/** Dienst und Vorlesungen/Aufgaben einer Person an einem Tag (mit Vertretungen) */
function tasksOf(day: DayInfo, s: Staff, names: Record<number, string>) {
  if (day.closed || !day.period) return []
  const duties = day.entries
    .filter((e) => e.staff_id === s.id && !e.problem)
    .map((e) => (e.label === 'Dienst' ? 'Dienst' : `Dienst: ${e.label}`))
  const lectures = day.lectures.filter((l) => l.staff_id === s.id).map((l) => lectureText(l, names))
  return [...duties, ...lectures]
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function render(mail: AutoMail, s: Staff, date: string, tasks: string[], origin: string) {
  const values: Record<string, string> = {
    vorname: s.name.split(/\s+/)[0],
    name: s.name,
    datum: formatDate(date),
    wochentag: WEEKDAYS[weekday(date) - 1],
    link: `${origin}/plan`,
    titel: APP_TITLE,
    lehrstuhl: CHAIR,
  }
  const fill = (t: string, html: boolean) =>
    t.split(/(\{\w+\})/).map((part) => {
      const key = /^\{(\w+)\}$/.exec(part)?.[1]
      if (key === 'aufgaben') {
        return html
          ? `<ul style="margin:4px 0;padding-left:18px">${tasks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`
          : tasks.map((x) => `- ${x}`).join('\n')
      }
      if (key && key in values) {
        if (!html) return values[key]
        return key === 'link' ? `<a href="${esc(values.link)}" style="color:#00883a">${esc(values.link)}</a>` : esc(values[key])
      }
      return html ? esc(part).replace(/\n/g, '<br>') : part
    }).join('')
  return {
    subject: fill(mail.subject, false).replace(/\s+/g, ' ').trim(),
    text: fill(mail.body, false),
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.45">${fill(mail.body, true)}</div>`,
  }
}

/** Ausgewählte Hilfskräfte einer Erinnerung, die (noch) Dienst haben und eine E-Mail-Adresse */
async function recipients(mail: AutoMail) {
  return (await hiwisWithDuties()).filter((s) => s.email && mail.staffIds.includes(s.id))
}

/**
 * Stündlicher Cron: je Erinnerung ab ihrer Uhrzeit an die ausgewählten Hilfskräfte, die am n-ten Werktag (nur werktags verschickt)
 * bzw. in n Kalendertagen (auch am Wochenende) Dienst haben.
 * Pro Erinnerung, Person und Diensttag höchstens einmal (reminder_sent).
 */
export async function runReminders(origin: string) {
  const today = todayIso()
  const weekend = weekday(today) > 5
  const all = (await loadMails()).filter((m) => m.kind === 'reminder' && m.staffIds.length)
  if (!all.length) return 'keine Erinnerung eingerichtet'
  const mails = weekend ? all.filter((m) => m.calendarDays) : all
  if (!mails.length) return 'Wochenende'
  const staff = await listStaff()
  const names = Object.fromEntries(staff.map((s) => [s.id, s.name]))
  const out: Record<string, string> = {}
  const hour = berlinHour()
  for (const mail of mails) {
    // Cron läuft stündlich: erst ab der eingestellten Uhrzeit (danach dank reminder_sent nicht noch einmal)
    if (hour < mail.hour) {
      out[`${mail.name} (${mail.id})`] = `erst ab ${mail.hour} Uhr`
      continue
    }
    const date = mail.calendarDays ? addDays(today, mail.daysBefore) : workdayAfter(today, mail.daysBefore)
    const [day] = await loadDays(date, date)
    const sent: string[] = []
    const errors: string[] = []
    for (const s of await recipients(mail)) {
      const tasks = day ? tasksOf(day, s, names) : []
      if (!tasks.length) continue
      const fresh = await query(
        'insert into reminder_sent (mail_id, staff_id, date) values ($1, $2, $3) on conflict do nothing returning 1',
        [mail.id, s.id, date],
      )
      if (!fresh.length) continue
      try {
        const m = render(mail, s, date, tasks, origin)
        await send([s.email], m.subject, m.text, m.html)
        sent.push(s.name)
      } catch (e) {
        // beim nächsten Lauf erneut versuchen
        await query('delete from reminder_sent where mail_id = $1 and staff_id = $2 and date = $3', [mail.id, s.id, date])
        errors.push(`${s.name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    if (sent.length || errors.length) {
      const parts = [sent.length && `Erinnerung für ${formatDate(date)} an ${sent.join(', ')}`, errors.length && `Fehler – ${errors.join('; ')}`]
      await setState(mail.id, 'lastResult', `${formatDateTime(new Date())}: ${parts.filter(Boolean).join(' | ')}`)
      if (sent.length) await setState(mail.id, 'lastSent', new Date().toISOString())
    }
    out[`${mail.name} (${mail.id})`] = sent.length ? `gesendet: ${sent.join(', ')}` : errors.length ? 'Fehler' : 'niemand fällig'
  }
  return out
}

/** Test: nächste Erinnerung (innerhalb von 60 Tagen) der ersten ausgewählten Hilfskraft an die Absender-Adresse */
export async function sendTestReminder(origin: string, mailId: string) {
  const mail = (await loadMails()).find((m) => m.id === mailId && m.kind === 'reminder')
  if (!mail) return
  const { smtp } = await loadMailConfig()
  const to = smtp.from.match(/[^\s<>]+@[^\s<>]+/)?.[0]
  const staff = await listStaff()
  const names = Object.fromEntries(staff.map((s) => [s.id, s.name]))
  const today = todayIso()
  const days = await loadDays(today, addDays(today, 60))
  let result = 'Test: keine ausgewählte Hilfskraft hat in den nächsten 60 Tagen Dienst'
  if (!to) result = 'Fehler beim Test – keine Absender-Adresse eingetragen'
  else {
    for (const s of await recipients(mail)) {
      const day = days.find((d) => tasksOf(d, s, names).length)
      if (!day) continue
      try {
        const m = render(mail, s, day.date, tasksOf(day, s, names), origin)
        await send([to], `[Test] ${m.subject}`, m.text, m.html)
        result = `Test: Erinnerung für ${s.name} (${formatDate(day.date)}) gesendet an ${to}`
      } catch (e) {
        result = `Fehler beim Test – ${e instanceof Error ? e.message : String(e)}`
      }
      break
    }
  }
  await setState(mail.id, 'lastResult', `${formatDateTime(new Date())}: ${result}`)
}
