'use client'

import { useFormStatus } from 'react-dom'

export type Person = { id: number; name: string }

/** Planungsmodus: Person für eine Schicht auswählen; speichert sofort beim Ändern. */
export function StaffSelect({
  action, fields, value, people, names, empty = '– frei –', className = '', label,
}: {
  action: (fd: FormData) => Promise<void>
  fields: Record<string, string | number>
  value: number | null
  people: Person[]
  names: Record<number, string>
  empty?: string
  className?: string
  label: string
}) {
  return (
    <form action={action} className={className}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {/* key: nach dem Speichern mit dem Wert vom Server neu aufbauen */}
      <Select key={value ?? ''} value={value} people={people} names={names} empty={empty} label={label} />
    </form>
  )
}

function Select({ value, people, names, empty, label }: {
  value: number | null; people: Person[]; names: Record<number, string>; empty: string; label: string
}) {
  const { pending } = useFormStatus()
  // Eingeteilte, aber inzwischen inaktive Person trotzdem anzeigen.
  const options = value && !people.some((p) => p.id === value) ? [...people, { id: value, name: names[value] ?? '?' }] : people
  return (
    <select
      name="assignee"
      aria-label={label}
      aria-busy={pending}
      disabled={pending}
      defaultValue={value ?? ''}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={`w-full cursor-pointer rounded border-2 px-1.5 py-1 text-sm font-semibold hover:border-lmu ${
        value ? 'border-lmu bg-lmu-light text-lmu-darker' : 'border-dashed border-neutral-300 bg-white text-neutral-500'
      } ${pending ? 'animate-pulse opacity-60' : ''}`}
    >
      <option value="">{empty}</option>
      {options.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  )
}
