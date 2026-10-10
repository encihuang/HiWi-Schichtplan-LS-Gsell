import { addLecture, assignLecture, deleteLecture, toggleLecture } from '@/app/actions'
import {
  AVAILABILITY_LABELS, coverageIssues, DUTY_LABELS, type Availability, type Duty, type Lecture, type Period, type Staff,
} from '@/lib/data'
import { WEEKDAYS } from '@/lib/dates'
import { AVAILABILITY_STYLES } from '@/lib/plan-styles'
import { PlanCell } from './plan-cell'
import { SlotButton, SubmitButton, type SlotState } from './slot-button'
import { StaffSelect, type Person } from './staff-select'

const DAYS = [1, 2, 3, 4, 5]

export function WeeklyPlan({
  period, staff, duties, availability, lectures, calendar, names, meId, canEditOthers, people,
}: {
  calendar: React.ReactNode
  period: Period
  staff: Staff[]
  duties: Duty[]
  availability: Availability[]
  lectures: Lecture[]
  names: Record<number, string>
  meId: number
  canEditOthers: boolean
  people: Person[]
}) {
  // eigene Zeile zuerst
  const rows = [...staff].sort((a, b) => Number(b.id === meId) - Number(a.id === meId))
  const me = staff.find((s) => s.id === meId)
  const missing = staff.filter((s) => availability.filter((a) => a.staff_id === s.id).length < 5)

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <p className="max-w-xl text-sm text-neutral-600">
            Wöchentliche Planung für die Vorlesungszeit.{' '}
            <span className="sm:hidden">
              Tippe unter <strong>Meine Woche</strong> auf einen Tag, um deine Verfügbarkeit (Farbe) und deinen Dienst
              einzutragen.
            </span>
            <span className="hidden sm:inline">
              Klicke in <strong>deiner Zeile</strong> auf einen Tag, um deine Verfügbarkeit (Farbe) und deinen Dienst
              einzutragen.
            </span>
          </p>
          <ul className="grid gap-1 text-xs">
            {(['ok', 'ungern', 'nein'] as const).map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span className={`h-3.5 w-6 rounded-sm ${AVAILABILITY_STYLES[s]}`} /> {AVAILABILITY_LABELS[s]}
              </li>
            ))}
            <li className="flex items-center gap-2">
              <span className="h-3.5 w-6 rounded-sm border border-neutral-300 bg-white" /> Noch nicht ausgefüllt
            </li>
          </ul>
        </div>

        {me && (
          <div className="mt-4 sm:hidden">
            <h3 className="text-sm font-semibold text-lmu-darker">Meine Woche</h3>
            <ul className="mt-2 divide-y divide-neutral-200 overflow-hidden rounded-lg border border-neutral-200">
              {DAYS.map((day) => {
                const duty = duties.find((d) => d.staff_id === me.id && d.weekday === day)
                const status = availability.find((a) => a.staff_id === me.id && a.weekday === day)?.status ?? null
                return (
                  <li key={day} className="grid grid-cols-[6.5rem_1fr] items-stretch">
                    <span className="flex items-center bg-lmu-lighter px-3 text-sm font-semibold">{WEEKDAYS[day - 1]}</span>
                    <PlanCell
                      periodId={period.id}
                      staffId={me.id}
                      weekday={day}
                      status={status}
                      kind={duty?.kind ?? null}
                      kindLabel={duty ? DUTY_LABELS[duty.kind] : ''}
                      editable
                      warn={duty && status === 'nein' ? 'Eingeteilt, obwohl „kein Dienst möglich“' : undefined}
                    />
                  </li>
                )
              })}
            </ul>
            <h3 className="mt-4 text-sm font-semibold text-lmu-darker">Ganzes Team</h3>
            <p className="text-xs text-neutral-500">Tabelle seitlich wischen.</p>
          </div>
        )}

        <div className="mt-2 overflow-x-auto sm:mt-4">
          <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 w-28 bg-white sm:w-32" />
                {WEEKDAYS.map((d) => (
                  <th key={d} className="border border-lmu bg-lmu px-2 py-2 text-left font-semibold uppercase tracking-wide text-white">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const editable = s.id === meId || canEditOthers
                return (
                  <tr key={s.id} className={s.id === meId ? 'outline-2 outline-lmu-darker -outline-offset-2' : ''}>
                    <th className="sticky left-0 z-10 border border-neutral-200 bg-white px-2 text-left font-semibold">
                      {s.name}
                      {s.id === meId && <span className="ml-1 text-xs font-normal text-lmu">(du)</span>}
                    </th>
                    {DAYS.map((day) => {
                      const duty = duties.find((d) => d.staff_id === s.id && d.weekday === day)
                      const status = availability.find((a) => a.staff_id === s.id && a.weekday === day)?.status ?? null
                      return (
                        <td key={day} className="border border-neutral-200 p-0">
                          <PlanCell
                            periodId={period.id}
                            staffId={s.id}
                            weekday={day}
                            status={status}
                            kind={duty?.kind ?? null}
                            kindLabel={duty ? DUTY_LABELS[duty.kind] : ''}
                            editable={editable}
                            warn={duty && status === 'nein' ? 'Eingeteilt, obwohl „kein Dienst möglich“' : undefined}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              <tr>
                <th className="sticky left-0 z-10 border border-neutral-200 bg-lmu-lighter px-2 py-2 text-left align-top font-semibold text-lmu-darker">
                  Besetzung
                </th>
                {DAYS.map((day) => {
                  const today = duties.filter((d) => d.weekday === day)
                  const issues = coverageIssues(day, duties, availability, names)
                  return (
                    <td key={day} className="border border-neutral-200 bg-lmu-lighter px-2 py-2 align-top text-xs">
                      <ul className="space-y-0.5">
                        {today.map((d) => (
                          <li key={d.staff_id}>
                            <strong>{names[d.staff_id]}</strong> · {DUTY_LABELS[d.kind]}
                          </li>
                        ))}
                      </ul>
                      {issues.map((i) => (
                        <div key={i} className="mt-1 font-semibold text-red-700">⚠ {i}</div>
                      ))}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
        {missing.length > 0 && (
          <p className="mt-3 text-xs text-neutral-500">
            Verfügbarkeit noch nicht vollständig: {missing.map((s) => s.name).join(', ')}
          </p>
        )}
      </div>

      {calendar}

      <Lectures period={period} lectures={lectures} names={names} meId={meId} canEditOthers={canEditOthers} people={people} />
    </div>
  )
}

function Lectures({
  period, lectures, names, meId, canEditOthers, people,
}: {
  period: Period
  lectures: Lecture[]
  names: Record<number, string>
  meId: number
  canEditOthers: boolean
  people: Person[]
}) {
  const groups = [...new Set(lectures.map((l) => l.name))]
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-lmu-darker">Vorlesungen Prof. Gsell und weitere Aufgaben</h2>
      <p className="text-sm text-neutral-600">
        Z. B. Betreuung „Grundkurs Zivilrecht II“ oder „Vorlesung Sachenrecht“. Feld anklicken zum Übernehmen bzw. Freigeben.
      </p>

      {groups.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] table-fixed border-separate border-spacing-1.5 text-sm">
            <thead>
              <tr>
                <th className="w-48" />
                {WEEKDAYS.map((d) => (
                  <th key={d} className="rounded bg-neutral-200 px-2 py-1.5 text-left font-semibold">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((name) => (
                <tr key={name}>
                  <th className="text-left align-middle font-semibold">
                    {name}
                    <form action={deleteLecture} className="inline">
                      <input type="hidden" name="period" value={period.id} />
                      <input type="hidden" name="name" value={name} />
                      <SubmitButton className="ml-2 text-xs font-normal text-red-700 hover:underline" title={`„${name}“ löschen`}>
                        löschen
                      </SubmitButton>
                    </form>
                  </th>
                  {DAYS.map((day) => {
                    const l = lectures.find((x) => x.name === name && x.weekday === day)
                    if (!l) return <td key={day} />
                    const state: SlotState = !l.staff_id
                      ? 'free'
                      : l.staff_id === meId
                        ? 'mine'
                        : canEditOthers
                          ? 'taken-editable'
                          : 'taken'
                    if (canEditOthers) {
                      return (
                        <td key={day} className="align-top">
                          <StaffSelect
                            action={assignLecture}
                            fields={{ lecture: l.id }}
                            value={l.staff_id}
                            people={people}
                            names={names}
                            label={`„${name}“ ${WEEKDAYS[day - 1]}`}
                          />
                          {l.time && <span className="block px-1 text-xs text-neutral-500">{l.time}</span>}
                        </td>
                      )
                    }
                    return (
                      <td key={day}>
                        <form action={toggleLecture}>
                          <input type="hidden" name="lecture" value={l.id} />
                          <SlotButton state={state} className="min-h-12 py-1 text-left">
                            <span className="block font-semibold">{l.staff_id ? names[l.staff_id] : '+ übernehmen'}</span>
                            {l.time && <span className="block text-xs opacity-75">{l.time}</span>}
                          </SlotButton>
                        </form>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form action={addLecture} className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-lmu-lighter p-3 text-sm">
        <input type="hidden" name="period" value={period.id} />
        <label className="grid gap-1">
          <span className="text-xs text-neutral-600">Vorlesung / Aufgabe</span>
          <input name="name" required placeholder="z. B. Vorlesung Sachenrecht" className="w-64 rounded border border-neutral-300 px-2 py-1.5" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-neutral-600">Uhrzeit (optional)</span>
          <input name="time" placeholder="z. B. 10–12 Uhr" className="w-36 rounded border border-neutral-300 px-2 py-1.5" />
        </label>
        <fieldset className="grid gap-1">
          <legend className="text-xs text-neutral-600">Wochentage</legend>
          <div className="flex gap-2">
            {WEEKDAYS.map((d, i) => (
              <label key={d} className="flex items-center gap-1">
                <input type="checkbox" name="weekday" value={i + 1} className="accent-lmu" />
                {d.slice(0, 2)}
              </label>
            ))}
          </div>
        </fieldset>
        <SubmitButton className="rounded bg-lmu px-3 py-1.5 font-medium text-white hover:bg-lmu-dark">Hinzufügen</SubmitButton>
      </form>
    </div>
  )
}
