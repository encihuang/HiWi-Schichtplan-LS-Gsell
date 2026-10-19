import Link from 'next/link'
import { MailLink } from '@/components/mail-link'
import { query } from '@/lib/db'
import {
  ABSENCE_LABELS, listAbsences, listSpecialTasks, listStaff, loadDays, ROLE_LABELS, type Absence, type Appointment,
  type Period, type Role, type RosterEntry, type Staff,
} from '@/lib/data'
import { absenceRange } from '@/lib/absence-mail'
import { addDays, formatDate, MONTHS, PERIOD_LABELS, todayIso, WEEKDAYS, weekday } from '@/lib/dates'

export const dynamic = 'force-dynamic'

const WEEKS = 4
const MAX_WEEKS = 60

function Appointments({ items, large = false }: { items: Appointment[]; large?: boolean }) {
  if (!items.length) return null
  return (
    <ul className={`${large ? 'mt-3 space-y-1' : 'mt-1.5 space-y-1'}`}>
      {items.map((a) => (
        <li
          key={a.id}
          title={a.note || undefined}
          className={`rounded bg-amber-100 px-1.5 py-0.5 text-amber-950 ${large ? 'text-sm' : 'text-[11px] leading-tight'}`}
        >
          <span className="font-semibold">{a.title}</span>
          {a.time && <span> · {a.time}</span>}
          {large && a.note && <span className="block text-xs text-amber-900/80">{a.note}</span>}
        </li>
      ))}
    </ul>
  )
}

function Away({ items, names, large = false }: { items: Absence[]; names: Map<number, { name: string }>; large?: boolean }) {
  if (!items.length) return null
  return (
    <div className={`${large ? 'mt-3 text-sm' : 'mt-1.5 text-[11px] leading-tight'} text-neutral-500`}>
      <span className="font-semibold">Abwesend: </span>
      {items.map((a, i) => (
        <span key={a.id} title={a.note || undefined}>
          {i > 0 && ', '}
          {names.get(a.staff_id)?.name ?? '?'}
          {large && ` (${ABSENCE_LABELS[a.kind]})`}
        </span>
      ))}
    </div>
  )
}

function People({ entries, byId, large = false }: {
  entries: RosterEntry[]
  byId: Map<number, { name: string; email: string }>
  large?: boolean
}) {
  if (!entries.length) return <div className={`${large ? 'text-base' : 'text-xs'} font-semibold text-red-700`}>niemand eingeteilt</div>
  return (
    <ul className={large ? 'space-y-2' : 'space-y-1'}>
      {entries.map((e, i) => {
        const s = byId.get(e.staff_id)
        return (
          <li key={i} className="flex items-center gap-1">
            <span className={`${large ? 'text-lg' : 'text-sm'} font-semibold ${e.problem ? 'text-red-700 line-through' : ''}`}>
              {s?.name}
            </span>
            {!e.problem && s && <MailLink email={s.email} name={s.name} />}
            <span className={`${large ? 'text-sm' : 'text-[11px]'} text-neutral-500`}>{e.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

// Reihenfolge der Gruppen im Abschnitt „Lehrstuhl“
const GROUPS: { title: string; roles: Role[] }[] = [
  { title: 'Lehrstuhlinhaberin', roles: ['prof'] },
  { title: 'Sekretariat', roles: ['sekretariat'] },
  { title: 'Wissenschaftliche Mitarbeiter:innen', roles: ['wimi', 'rat'] },
  { title: 'Studentische Hilfskräfte', roles: ['hiwi'] },
]

function MailAll({ emails, label = 'E-Mail an alle' }: { emails: string[]; label?: string }) {
  const to = emails.filter(Boolean)
  if (!to.length) return null
  return (
    <a href={`mailto:${to.join(',')}`} className="text-sm text-lmu underline hover:text-lmu-darker">
      {label}
    </a>
  )
}

function StaffGroup({ title, people }: { title: string; people: Staff[] }) {
  if (!people.length) return null
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-neutral-700">{title}</h3>
        <MailAll emails={people.map((s) => s.email)} />
      </div>
      <ul className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {people.map((s) => (
          <li key={s.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
            <span className="min-w-0">
              <span className="font-semibold">{s.name}</span>
              <span className="block truncate text-xs text-neutral-500">
                {s.role === 'rat' && `${ROLE_LABELS.rat} · `}
                {s.email || 'keine E-Mail hinterlegt'}
              </span>
            </span>
            <MailLink email={s.email} name={s.name} />
          </li>
        ))}
      </ul>
    </div>
  )
}

const mondayOf = (d: string) => addDays(d, 1 - weekday(d))

export default async function Overview({ searchParams }: { searchParams: Promise<{ wochen?: string; alle?: string }> }) {
  const params = await searchParams
  const today = todayIso()
  // „Gesamter Zeitraum“: laufender Zeitraum (sonst der nächste) von Anfang bis Ende
  const [period] = await query<Period>(
    'select * from periods where end_date >= $1 order by start_date limit 1',
    [today],
  )
  const all = params.alle === '1' && !!period
  const weeks = Math.min(MAX_WEEKS, Math.max(WEEKS, Math.round(Number(params.wochen)) || WEEKS))
  const monday = all ? mondayOf(period.start_date < today ? period.start_date : today) : mondayOf(today)
  const end = all ? period.end_date : addDays(monday, weeks * 7 - 1)
  const absencesUntil = all ? end : addDays(today, Math.max(8 * 7, weeks * 7))
  const [days, everyone, absences] = await Promise.all([
    loadDays(monday, end), listStaff(true), listAbsences(today, absencesUntil),
  ])
  const expanded = all || weeks > WEEKS
  const more = `/uebersicht?wochen=${weeks + 4}`
  const byId = new Map(everyone.map((s) => [s.id, s]))
  // auch inaktive Personen anzeigen, falls noch eingeteilt
  for (const s of await listStaff()) if (!byId.has(s.id)) byId.set(s.id, s)
  const todayInfo = days.find((d) => d.date === today)
  // Sonderaufgaben des laufenden Zeitraums
  const currentPeriod = todayInfo?.period ?? days.find((d) => d.period)?.period
  const tasks = currentPeriod ? await listSpecialTasks(currentPeriod.id) : []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-lmu-darker">Übersicht für den Lehrstuhl</h1>
        <p className="text-neutral-600">
          Wer ist wann im Dienst und ansprechbar, wer ist abwesend. Mit dem Briefumschlag öffnet sich eine E-Mail.
        </p>
      </div>

      <section className="rounded-lg border-l-8 border-lmu bg-white p-5 shadow-sm">
        <div className="text-sm uppercase tracking-wide text-neutral-500">Heute</div>
        <div className="text-xl font-bold text-lmu-darker">
          {weekday(today) <= 5 ? WEEKDAYS[weekday(today) - 1] : 'Wochenende'}, {formatDate(today)}
          {todayInfo?.period && (
            <span className="ml-2 text-sm font-normal text-neutral-500">{PERIOD_LABELS[todayInfo.period.kind]}</span>
          )}
        </div>
        <div className="mt-3">
          {weekday(today) > 5 ? (
            <p className="text-neutral-600">Am Wochenende ist kein Dienst.</p>
          ) : todayInfo?.closed ? (
            <p className="text-neutral-600">{todayInfo.closed} – kein Dienst.</p>
          ) : !todayInfo?.period ? (
            <p className="text-neutral-600">Für heute ist noch kein Zeitraum angelegt.</p>
          ) : (
            <People entries={todayInfo.entries} byId={byId} large />
          )}
          <Appointments items={todayInfo?.appointments ?? []} large />
          <Away items={todayInfo?.absences ?? []} names={byId} large />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-lmu-darker">
          {all ? `${PERIOD_LABELS[period.kind]} (${formatDate(period.start_date)} – ${formatDate(period.end_date)})` : `Die nächsten ${weeks} Wochen`}
        </h2>
        <div className="mt-2">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
            {WEEKDAYS.map((d) => (
              <div key={d} className="hidden rounded bg-lmu py-1.5 text-center text-xs font-semibold uppercase text-white sm:block">{d}</div>
            ))}
            {days.map((d) => {
              const [, m, day] = d.date.split('-').map(Number)
              return (
                <div
                  key={d.date}
                  className={`rounded border bg-white p-2 sm:min-h-24 ${d.date === today ? 'border-2 border-lmu' : 'border-neutral-200'} ${
                    d.date < today ? 'hidden opacity-50 sm:block' : ''
                  }`}
                >
                  <div className="mb-1 text-xs text-neutral-500 tabular-nums">
                    <span className="font-semibold sm:hidden">{WEEKDAYS[weekday(d.date) - 1]}, </span>
                    {day}. {MONTHS[m - 1].slice(0, 3)}
                  </div>
                  {d.closed ? (
                    <div className="text-xs text-neutral-400">{d.closed}</div>
                  ) : !d.period ? (
                    <div className="text-xs text-neutral-400">kein Zeitraum angelegt</div>
                  ) : (
                    <People entries={d.entries} byId={byId} />
                  )}
                  <Appointments items={d.appointments} />
                  <Away items={d.absences} names={byId} />
                </div>
              )
            })}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {!all && weeks < MAX_WEEKS && (
            <Link href={more} scroll={false} className="rounded border border-lmu bg-white px-3 py-1.5 text-lmu-darker hover:bg-lmu-light">
              Mehr anzeigen (+4 Wochen)
            </Link>
          )}
          {!all && period && (
            <Link href="/uebersicht?alle=1" scroll={false} className="rounded border border-lmu bg-white px-3 py-1.5 text-lmu-darker hover:bg-lmu-light">
              Gesamten Zeitraum anzeigen ({PERIOD_LABELS[period.kind]} bis {formatDate(period.end_date)})
            </Link>
          )}
          {expanded && (
            <Link href="/uebersicht" scroll={false} className="rounded px-3 py-1.5 text-neutral-600 hover:bg-white">
              Weniger anzeigen
            </Link>
          )}
        </div>
      </section>

      {tasks.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-lmu-darker">Sonderaufgaben</h2>
          <ul className="mt-2 divide-y divide-neutral-100 rounded-lg bg-white shadow-sm">
            {tasks.map((t) => {
              const s = t.staff_id ? byId.get(t.staff_id) : undefined
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="font-semibold">{t.name}</span>
                    {t.note && <span className="block text-xs text-neutral-500">{t.note}</span>}
                  </span>
                  {s ? (
                    <span className="flex items-center gap-1">
                      <span className="text-sm">{s.name}</span>
                      <MailLink email={s.email} name={s.name} />
                    </span>
                  ) : (
                    <span className="text-sm font-semibold text-amber-700">noch niemand</span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-lmu-darker">Abwesenheiten und Urlaube (bis {formatDate(absencesUntil)})</h2>
          <a href="/abwesenheiten" className="text-sm text-lmu underline hover:text-lmu-darker">Abwesenheit eintragen</a>
        </div>
        {absences.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Niemand eingetragen.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100 rounded-lg bg-white shadow-sm">
            {absences.map((a) => {
              const s = byId.get(a.staff_id)
              const now = a.from_date <= today
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                  <span className="w-52 shrink-0">
                    <span className="font-semibold">{s?.name ?? '?'}</span>
                    {s && <span className="block text-xs text-neutral-500">{ROLE_LABELS[s.role]}</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={now ? 'font-semibold text-amber-800' : ''}>{ABSENCE_LABELS[a.kind]}</span>{' '}
                    <span className="tabular-nums">{absenceRange(a)}</span>
                    {now && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900">jetzt</span>}
                    {a.note && <span className="block text-neutral-600">{a.note}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-lmu-darker">Lehrstuhl</h2>
          <MailAll emails={everyone.map((s) => s.email)} label="E-Mail an den gesamten Lehrstuhl" />
        </div>
        <div className="mt-2 space-y-5">
          {GROUPS.map((g) => (
            <StaffGroup key={g.title} title={g.title} people={everyone.filter((s) => g.roles.includes(s.role))} />
          ))}
        </div>
      </section>
    </div>
  )
}
