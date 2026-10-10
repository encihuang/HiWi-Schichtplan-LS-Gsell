'use client'

import { useFormStatus } from 'react-dom'

export type SlotState = 'free' | 'mine' | 'taken' | 'taken-editable'

const STYLES: Record<SlotState, string> = {
  free: 'border-dashed border-lmu/50 bg-white text-lmu hover:bg-lmu-light hover:border-lmu hover:border-solid',
  mine: 'border-lmu bg-lmu text-white hover:bg-lmu-dark',
  taken: 'border-neutral-200 bg-neutral-100 text-neutral-700 cursor-default',
  'taken-editable': 'border-neutral-300 bg-neutral-100 text-neutral-700 hover:border-red-400 hover:bg-red-50',
}

const TITLES: Record<SlotState, string> = {
  free: 'Übernehmen',
  mine: 'Klicken zum Freigeben',
  taken: '',
  'taken-editable': 'Klicken zum Entfernen',
}

export function SlotButton({ state, children, className = '' }: { state: SlotState; children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      disabled={state === 'taken' || pending}
      aria-busy={pending}
      title={TITLES[state]}
      className={`w-full rounded border-2 px-2 text-sm hover:shadow-sm ${STYLES[state]} ${pending ? 'animate-pulse opacity-60' : ''} ${className}`}
    >
      {children}
    </button>
  )
}

/** Normaler Formular-Button, der während des Speicherns sichtbar reagiert. */
export function SubmitButton({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      disabled={pending}
      aria-busy={pending}
      title={title}
      className={`${className} ${pending ? 'animate-pulse opacity-60' : ''}`}
    >
      {children}
    </button>
  )
}
