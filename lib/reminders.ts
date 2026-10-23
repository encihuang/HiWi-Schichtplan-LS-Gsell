import 'server-only'
import { APP_TITLE, CHAIR } from './brand'
import { isHiwi, lectureText, listStaff, loadDays, type DayInfo, type Staff } from './data'
import { addDays, formatDate, formatDateTime, todayIso, WEEKDAYS, weekday } from './dates'
import { query } from './db'
import { send } from './mail'
import { DEFAULT_REMINDER_TEXTS, type ReminderTexts } from './reminder-shared'
import { getSettings, setSetting } from './settings'

export async function loadReminderTexts(): Promise<ReminderTexts> {
  const t = await getSettings('reminder.')
  return { subject: t.subject || DEFAULT_REMINDER_TEXTS.subject, body: t.body || DEFAULT_REMINDER_TEXTS.body }
}

export async function reminderStatus() {
  return (await getSettings('reminder.')).lastResult ?? null
}

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
  const duties = day.entries
    .filter((e) => e.staff_id === s.id && !e.problem)
    .map((e) => (e.label === 'Dienst' ? 'Dienst' : `Dienst: ${e.label}`))
  const lectures = day.lectures.filter((l) => l.staff_id === s.id).map((l) => lectureText(l, names))
  return [...duties, ...lectures]
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

function render(texts: ReminderTexts, s: Staff, date: string, tasks: string[], origin: string) {
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
    subject: fill(texts.subject, false).replace(/\s+/g, ' ').trim(),
    text: fill(texts.body, false),
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;line-height:1.45">${fill(texts.body, true)}</div>`,
  }
}

/**
 * Täglicher Cron: Erinnerungen an Hilfskräfte, bei denen in den Einstellungen eine Erinnerung eingestellt ist.
 * Pro Person und Diensttag höchstens einmal (reminder_log). Nur an Werktagen.
 */
export async function runReminders(origin: string) {
  const today = todayIso()
  if (weekday(today) > 5) return 'Wochenende'
  const staff = await listStaff()
  const names = Object.fromEntries(staff.map((s) => [s.id, s.name]))
  const due = staff.filter((s) => s.active && isHiwi(s) && s.email && s.reminder_days !== null)
  if (!due.length) return 'niemand eingestellt'
  const texts = await loadReminderTexts()
  const targets = [...new Set(due.map((s) => workdayAfter(today, s.reminder_days!)))].sort()
  const days = await loadDays(targets[0], targets.at(-1)!)
  const sent: string[] = []
  const errors: string[] = []
  for (const s of due) {
    const date = workdayAfter(today, s.reminder_days!)
    const day = days.find((d) => d.date === date)
    if (!day || day.closed || !day.period) continue
    const tasks = tasksOf(day, s, names)
    if (!tasks.length) continue
    const fresh = await query('insert into reminder_log (staff_id, date) values ($1, $2) on conflict do nothing returning 1', [s.id, date])
    if (!fresh.length) continue
    try {
      const mail = render(texts, s, date, tasks, origin)
      await send([s.email], mail.subject, mail.text, mail.html)
      sent.push(`${s.name} (${formatDate(date)})`)
    } catch (e) {
      // beim nächsten Lauf erneut versuchen
      await query('delete from reminder_log where staff_id = $1 and date = $2', [s.id, date])
      errors.push(`${s.name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  if (sent.length || errors.length) {
    const parts = [sent.length && `gesendet an ${sent.join(', ')}`, errors.length && `Fehler – ${errors.join('; ')}`]
    await setSetting('reminder.lastResult', `${formatDateTime(new Date())}: ${parts.filter(Boolean).join(' | ')}`)
  }
  return { sent, errors }
}

/** Test: nächste Erinnerung einer Hilfskraft (innerhalb von 60 Tagen) sofort an eine Adresse schicken */
export async function sendTestReminder(origin: string, staffId: number, to: string) {
  const staff = await listStaff()
  const s = staff.find((x) => x.id === staffId)
  if (!s) return
  const names = Object.fromEntries(staff.map((x) => [x.id, x.name]))
  const today = todayIso()
  const days = await loadDays(today, addDays(today, 60))
  const day = days.find((d) => !d.closed && d.period && tasksOf(d, s, names).length)
  let result: string
  if (!day) result = `Test: ${s.name} hat in den nächsten 60 Tagen keinen Dienst`
  else {
    try {
      const mail = render(await loadReminderTexts(), s, day.date, tasksOf(day, s, names), origin)
      await send([to], `[Test] ${mail.subject}`, mail.text, mail.html)
      result = `Test für ${s.name} (${formatDate(day.date)}) gesendet an ${to}`
    } catch (e) {
      result = `Fehler beim Test – ${e instanceof Error ? e.message : String(e)}`
    }
  }
  await setSetting('reminder.lastResult', `${formatDateTime(new Date())}: ${result}`)
}
