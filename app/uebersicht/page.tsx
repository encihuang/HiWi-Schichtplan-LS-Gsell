import { MailLink } from '@/components/mail-link'
import { listSpecialTasks, listStaff, loadDays, type RosterEntry } from '@/lib/data'
import { addDays, formatDate, MONTHS, PERIOD_LABELS, todayIso, WEEKDAYS, weekday } from '@/lib/dates'

export const dynamic = 'force-dynamic'

const WEEKS = 4

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

export default async function Overview() {
  const today = todayIso()
  const monday = addDays(today, 1 - weekday(today))
  const end = addDays(monday, WEEKS * 7 - 1)
  const [days, staff] = await Promise.all([loadDays(monday, end), listStaff(true)])
  const byId = new Map(staff.map((s) => [s.id, s]))
  // auch inaktive Personen anzeigen, falls noch eingeteilt
  for (const s of await listStaff()) if (!byId.has(s.id)) byId.set(s.id, s)
  const todayInfo = days.find((d) => d.date === today)
  const allEmails = staff.map((s) => s.email).filter(Boolean)
  // Sonderaufgaben des laufenden Zeitraums
  const currentPeriod = todayInfo?.period ?? days.find((d) => d.period)?.period
  const tasks = currentPeriod ? await listSpecialTasks(currentPeriod.id) : []

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-lmu-darker">Übersicht für den Lehrstuhl</h1>
        <p className="text-neutral-600">Wer ist wann im Dienst und ansprechbar. Mit dem Briefumschlag öffnet sich eine E-Mail.</p>
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
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-lmu-darker">Die nächsten {WEEKS} Wochen</h2>
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
                </div>
              )
            })}
          </div>
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
          <h2 className="text-lg font-semibold text-lmu-darker">Alle Hilfskräfte</h2>
          {allEmails.length > 0 && (
            <a href={`mailto:${allEmails.join(',')}`} className="text-sm text-lmu underline hover:text-lmu-darker">
              E-Mail an alle
            </a>
          )}
        </div>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {staff.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 shadow-sm">
              <span>
                <span className="font-semibold">{s.name}</span>
                <span className="block text-xs text-neutral-500">{s.email || 'keine E-Mail hinterlegt'}</span>
              </span>
              <MailLink email={s.email} name={s.name} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
