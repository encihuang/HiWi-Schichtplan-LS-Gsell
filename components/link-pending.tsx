'use client'

import { useLinkStatus } from 'next/link'

/** Innerhalb eines <Link>: pulsiert, solange die Zielseite lädt. */
export function LinkPending({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus()
  return (
    <span aria-busy={pending} className={pending ? 'animate-pulse opacity-60' : undefined}>
      {children}
    </span>
  )
}
