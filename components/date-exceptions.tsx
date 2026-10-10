import { dateException } from '@/app/actions'
import { DUTY_LABELS, type ClosedDay, type DateException, type DateExtra, type Duty, type Period } from '@/lib/data'
import { addDays, eachDay, formatDate, MONTHS, todayIso, WEEKDAYS_SHORT, weekday } from '@/lib/dates'
import { SubmitButton } from './slot-button'
import { StaffSelect, type Person } from './staff-select'

function Action({ period, date, op, staff, person, label, tone }: {
  period: number; date: string; op: string; staff?: number; person?: number; label: string; tone: 'red' | 'green' | 'grey'
}) {
  const tones = {
    red: 'border-red-300 text-red-700 hover:bg-red-50',
    green: 'border-lmu text-lmu-darker hover:bg-lmu-light',
    grey: 'border-neutral-300 text-neutral-600 hover:bg-neutral-100',
  }
  return (
    <form action={dateException} className="inline">
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="op" value={op} />
      {staff && <input type="hidden" name="staff" value={staff} />}
      {person && <input type="hidden" name="person" value={person} />}
      <SubmitButton className={`rounded border bg-white px-2 py-1 text-xs leading-tight sm:px-1.5 sm:py-0.5 sm:text-[11px] ${tones[tone]}`}>{label}</SubmitButton>
    </form>
  )
}

/** Einzelne Tage der Vorlesungszeit: regulärer Dienst je Datum, Ausfälle und Vertretungen. */
export function DateExceptions({
  period, duties, exceptions, extras, closed, names, meId, planning, people,
}: {
  period: Period
  duties: Duty[]
  exceptions: DateException[]
  extras: DateExtra[]
  closed: ClosedDay[]
  names: Record<number, string>
  meId: number
  planning: boolean
  people: Person[]
}) {
  const byClosed = new Map(closed.map((c) => [c.date, c.name]))
  const today = todayIso()
  const days = eachDay(period.start_date, period.end_date)
  const months = [...new Set(days.map((d) => d.slice(0, 7)))]
  const open = exceptions.filter(
    (e) => !e.substitute_id && duties.some((d) => d.staff_id === e.staff_id && d.weekday === weekday(e.date)),
  ).length

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-lmu-darker">Kalender – einzelne Tage ändern</h2>
      <p className="text-sm text-neutral-600">
        Der Wochenplan füllt jeden Tag der Vorlesungszeit. Wenn du an einem Tag schon sicher nicht kannst, markiere ihn mit{' '}
        <strong>„kann nicht“</strong> – dann kann jemand anderes die Vertretung vorab übernehmen und es muss später nicht
        getauscht werden. Mit <strong>„+ ich zusätzlich“</strong> übernimmst du einen einzelnen Tag zusätzlich.
      </p>
      {open > 0 && (
        <p className="mt-2 text-sm font-semibold text-amber-700">⚠ {open} Tag{open === 1 ? '' : 'e'} ohne Vertretung</p>
      )}

      <div className="mt-4 space-y-5">
        {months.map((m) => {
          const inMonth = days.filter((d) => d.startsWith(m) && weekday(d) <= 5)
          if (!inMonth.length) return null
          const mondays = [...new Set(inMonth.map((d) => addDays(d, 1 - weekday(d))))]
          const [y, mo] = m.split('-').map(Number)
          return (
            <div key={m}>
              <h3 className="pb-1.5 font-semibold text-lmu-darker">{MONTHS[mo - 1]} {y}</h3>
              <div>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-5">
                  {WEEKDAYS_SHORT.slice(0, 5).map((d) => (
                    <div key={d} className="hidden rounded bg-lmu py-1 text-center text-xs font-semibold uppercase text-white sm:block">{d}</div>
                  ))}
                  {mondays.flatMap((mon) =>
                    [0, 1, 2, 3, 4].map((i) => {
                      const d = addDays(mon, i)
                      if (!d.startsWith(m) || d < period.start_date || d > period.end_date) return <div key={d} className="hidden sm:block" />
                      const head = (
                        <div className="text-xs tabular-nums text-neutral-500">
                          <span className="font-semibold sm:hidden">{WEEKDAYS_SHORT[i]}, </span>
                          {formatDate(d).slice(0, 6)}
                        </div>
                      )
                      const holiday = byClosed.get(d)
                      if (holiday) {
                        return (
                          <div key={d} className={`rounded border border-neutral-100 bg-neutral-50 p-1.5 text-neutral-400 ${d < today ? 'hidden sm:block' : ''}`}>
                            {head}
                            <div className="text-xs">{holiday}</div>
                          </div>
                        )
                      }
                      const regular = duties.filter((x) => x.weekday === i + 1)
                      const exc = exceptions.filter((e) => e.date === d)
                      const extra = extras.filter((x) => x.date === d)
                      const iAmOn =
                        regular.some((r) => r.staff_id === meId && !exc.some((e) => e.staff_id === meId)) ||
                        exc.some((e) => e.substitute_id === meId) ||
                        extra.some((x) => x.staff_id === meId)
                      const present =
                        regular.filter((r) => !exc.some((e) => e.staff_id === r.staff_id)).length +
                        exc.filter((e) => e.substitute_id && regular.some((r) => r.staff_id === e.staff_id)).length +
                        extra.length
                      const hasOpen = regular.some((r) => exc.some((e) => e.staff_id === r.staff_id && !e.substitute_id))
                      const past = d < today
                      return (
                        <div
                          key={d}
                          className={`rounded border p-1.5 ${hasOpen ? 'border-amber-400 bg-amber-50' : 'border-neutral-200'} ${past ? 'hidden opacity-60 sm:block' : ''}`}
                        >
                          {head}
                          {present === 0 && <div className="text-xs font-semibold text-red-700">unbesetzt</div>}
                          <ul className="space-y-1 text-xs">
                            {regular.map((r) => {
                              const e = exc.find((x) => x.staff_id === r.staff_id)
                              const mine = r.staff_id === meId
                              return (
                                <li key={r.staff_id}>
                                  <span className={e ? 'text-red-700 line-through' : mine ? 'font-semibold text-lmu-darker' : ''}>
                                    {names[r.staff_id]}
                                  </span>{' '}
                                  <span className="text-neutral-400">{DUTY_LABELS[r.kind]}</span>
                                  {e && (
                                    <div>
                                      →{' '}
                                      {e.substitute_id ? (
                                        <strong className={e.substitute_id === meId ? 'text-lmu-darker' : ''}>
                                          {names[e.substitute_id]}
                                        </strong>
                                      ) : (
                                        <span className="font-semibold text-amber-700">Vertretung offen</span>
                                      )}
                                    </div>
                                  )}
                                  {!past && planning && (
                                    <div className="mt-0.5 grid gap-1">
                                      {e ? (
                                        <>
                                          <StaffSelect
                                            action={dateException}
                                            fields={{ period: period.id, date: d, op: 'substitute', staff: r.staff_id }}
                                            value={e.substitute_id}
                                            people={people.filter((p) => p.id !== r.staff_id)}
                                            names={names}
                                            empty="– Vertretung offen –"
                                            label={`Vertretung für ${names[r.staff_id]} am ${formatDate(d)}`}
                                          />
                                          <Action period={period.id} date={d} op="present" person={r.staff_id} label="doch da" tone="grey" />
                                        </>
                                      ) : (
                                        <Action period={period.id} date={d} op="absent" person={r.staff_id} label="fällt aus" tone="red" />
                                      )}
                                    </div>
                                  )}
                                  {!past && !planning && (
                                    <div className="mt-0.5 flex flex-wrap gap-1">
                                      {mine && !e && <Action period={period.id} date={d} op="absent" label="kann nicht" tone="red" />}
                                      {mine && e && <Action period={period.id} date={d} op="present" label="doch da" tone="grey" />}
                                      {e && !e.substitute_id && !mine && !iAmOn && (
                                        <Action period={period.id} date={d} op="cover" staff={r.staff_id} label="Vertretung übernehmen" tone="green" />
                                      )}
                                      {e && e.substitute_id === meId && (
                                        <Action period={period.id} date={d} op="uncover" staff={r.staff_id} label="abgeben" tone="grey" />
                                      )}
                                    </div>
                                  )}
                                </li>
                              )
                            })}
                            {extra.map((x) => (
                              <li key={`x${x.staff_id}`}>
                                <span className={x.staff_id === meId ? 'font-semibold text-lmu-darker' : ''}>{names[x.staff_id]}</span>{' '}
                                <span className="text-neutral-400">zusätzlich</span>
                                {!past && (planning || x.staff_id === meId) && (
                                  <div className="mt-0.5">
                                    <Action period={period.id} date={d} op="unextra" person={x.staff_id} label="entfernen" tone="grey" />
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                          {!past && planning && (
                            <StaffSelect
                              action={dateException}
                              fields={{ period: period.id, date: d, op: 'extra' }}
                              value={null}
                              people={people.filter(
                                (p) => !regular.some((r) => r.staff_id === p.id) && !extra.some((x) => x.staff_id === p.id),
                              )}
                              names={names}
                              empty="+ zusätzlich …"
                              label={`Zusätzlicher Dienst am ${formatDate(d)}`}
                              className="mt-1"
                            />
                          )}
                          {!past && !planning && !iAmOn && !exc.some((e) => e.staff_id === meId) && (
                            <div className="mt-1">
                              <Action period={period.id} date={d} op="extra" label="+ ich zusätzlich" tone="green" />
                            </div>
                          )}
                        </div>
                      )
                    }),
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
