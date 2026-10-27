/** Seitennavigation zu den Bereichen einer Seite (links ab lg, darüber als waagerechte Leiste) */
export function SideNav({ title, items }: { title: string; items: readonly (readonly [string, string])[] }) {
  return (
    <aside className="no-print mb-6 lg:mb-0">
      <nav className="flex gap-1 overflow-x-auto rounded-lg bg-white p-1 text-sm shadow-sm lg:sticky lg:top-4 lg:flex-col lg:overflow-visible lg:p-2">
        <div className="hidden px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 lg:block">{title}</div>
        {items.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded px-2 py-1.5 text-lmu-darker hover:bg-lmu-light">
            {label}
          </a>
        ))}
      </nav>
    </aside>
  )
}
