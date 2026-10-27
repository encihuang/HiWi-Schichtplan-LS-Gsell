'use client'

import { useEffect, useRef, useState } from 'react'
import type { Repeat } from '@/lib/data'

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']
const OPTIONS: [Repeat, string][] = [
  ['none', 'ohne festen Tag'],
  ['weekly', 'jede Woche'],
  ['biweekly', 'alle 2 Wochen'],
  ['monthly', 'jeden Monat'],
]
const input = 'rounded border border-neutral-300 bg-white px-2 py-1.5'

/** Wiederholung einer Sonderaufgabe: ohne festen Tag, wöchentlich, alle 2 Wochen oder monatlich (+ Uhrzeit) */
export function RepeatFields({ value = 'none', weekday, dayOfMonth, start, time }: {
  value?: Repeat
  weekday?: number | null
  dayOfMonth?: number | null
  start?: string | null
  time?: string
}) {
  const [repeat, setRepeat] = useState<Repeat>(value)
  const ref = useRef<HTMLSelectElement>(null)
  // nach dem Speichern setzt React das Formular zurück: dann auch die passenden Felder zeigen
  useEffect(() => {
    const form = ref.current?.form
    const reset = () => setRepeat(value)
    form?.addEventListener('reset', reset)
    return () => form?.removeEventListener('reset', reset)
  }, [value])
  return (
    <>
      <label className="grid gap-1">
        <span className="text-xs text-neutral-600">Wiederholung</span>
        <select ref={ref} name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} className={input}>
          {OPTIONS.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
      </label>
      {(repeat === 'weekly' || repeat === 'biweekly') && (
        <label className="grid gap-1">
          <span className="text-xs text-neutral-600">Wochentag</span>
          <select name="weekday" defaultValue={weekday ?? 1} className={input}>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i + 1}>{d}</option>
            ))}
          </select>
        </label>
      )}
      {repeat === 'biweekly' && (
        <label className="grid gap-1">
          <span className="text-xs text-neutral-600">Erster Termin (optional)</span>
          <input type="date" name="start" defaultValue={start ?? ''} className={input} />
        </label>
      )}
      {repeat === 'monthly' && (
        <label className="grid gap-1">
          <span className="text-xs text-neutral-600">Tag im Monat</span>
          <input type="number" name="dayOfMonth" min={1} max={31} required defaultValue={dayOfMonth ?? 1} className={`${input} w-20`} />
        </label>
      )}
      {repeat !== 'none' && (
        <label className="grid gap-1">
          <span className="text-xs text-neutral-600">Uhrzeit (optional)</span>
          <input name="time" defaultValue={time ?? ''} placeholder="z. B. 10–11 Uhr" className={`${input} w-32`} />
        </label>
      )}
    </>
  )
}
