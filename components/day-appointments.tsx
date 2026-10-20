import type { Appointment } from '@/lib/data'

/** Termine für alle (z. B. Klausuren) an einem Tag im Kalender; der Dienst findet trotzdem statt. Nur <span>, da auch in Knöpfen. */
export function DayAppointments({ items, className = '' }: { items: Appointment[]; className?: string }) {
  if (!items.length) return null
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
      {items.map((a) => (
        <span
          key={a.id}
          title={[a.title, a.time, a.note].filter(Boolean).join(' · ')}
          className="block truncate rounded bg-amber-100 px-1 text-left text-[11px] font-medium leading-tight text-amber-950"
        >
          {a.title}
          {a.time && <span className="font-normal"> · {a.time}</span>}
        </span>
      ))}
    </span>
  )
}

/** Termine nach Datum gruppiert */
export function appointmentsByDate(items: Appointment[]) {
  const m = new Map<string, Appointment[]>()
  for (const a of items) m.set(a.date, [...(m.get(a.date) ?? []), a])
  return m
}
