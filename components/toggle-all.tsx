'use client'

/** Klappt alle <details data-group={group}> auf einmal auf oder zu. */
export function ToggleAll({ group, className = '' }: { group: string; className?: string }) {
  const set = (open: boolean) =>
    document.querySelectorAll<HTMLDetailsElement>(`details[data-group="${group}"]`).forEach((d) => (d.open = open))
  const btn = 'rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100'
  return (
    <div className={`flex gap-1.5 ${className}`}>
      <button type="button" onClick={() => set(true)} className={btn}>Alle ausklappen</button>
      <button type="button" onClick={() => set(false)} className={btn}>Alle einklappen</button>
    </div>
  )
}
