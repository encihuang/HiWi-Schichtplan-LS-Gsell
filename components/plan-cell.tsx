'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { setAvailability, setDuty } from '@/app/actions'
import type { AvailabilityStatus, DutyKind } from '@/lib/data'
import { AVAILABILITY_STYLES } from '@/lib/plan-styles'
import { WEEKDAYS } from '@/lib/dates'

const STATUS_OPTIONS: { value: AvailabilityStatus | ''; label: string }[] = [
  { value: 'ok', label: 'Dienst möglich' },
  { value: 'ungern', label: 'Lieber nicht' },
  { value: 'nein', label: 'Kein Dienst' },
  { value: '', label: 'Nicht ausgefüllt' },
]

const DUTY_OPTIONS: { value: DutyKind | ''; label: string }[] = [
  { value: 'alle', label: 'Alle Aufgaben' },
  { value: 'geteilt', label: 'Geteilt' },
  { value: 'vor_ort', label: 'Vor Ort' },
  { value: 'remote', label: 'Remote' },
  { value: '', label: 'Kein Dienst' },
]

/** Zelle Person × Wochentag: Farbe = Verfügbarkeit, Text = Dienstart. Klick öffnet die Auswahl. */
export function PlanCell({
  periodId, staffId, weekday, status, kind, kindLabel, editable, warn,
}: {
  periodId: number
  staffId: number
  weekday: number
  status: AvailabilityStatus | null
  kind: DutyKind | null
  kindLabel: string
  editable: boolean
  warn?: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, start] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const send = (action: (fd: FormData) => Promise<void>, field: string, value: string) => {
    const fd = new FormData()
    fd.set('period', String(periodId))
    fd.set('staff', String(staffId))
    fd.set('weekday', String(weekday))
    fd.set(field, value)
    start(() => action(fd))
  }

  const body = (
    <span className="flex items-center gap-1">
      <span className="truncate">{kindLabel}</span>
      {warn && <span title={warn} aria-label={warn}>⚠</span>}
    </span>
  )

  return (
    <div ref={ref} className="relative h-full">
      {editable ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`flex h-12 w-full items-center px-2 text-left text-sm font-semibold text-neutral-900 outline-offset-[-3px] hover:outline-2 hover:outline-lmu-darker ${
            AVAILABILITY_STYLES[status ?? 'none']
          } ${pending ? 'opacity-50' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {body}
          {!kind && !status && <span className="text-xs font-normal text-neutral-400">auswählen</span>}
        </button>
      ) : (
        <div className={`flex h-12 items-center px-2 text-sm font-semibold text-neutral-900 ${AVAILABILITY_STYLES[status ?? 'none']}`}>
          {body}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-30 bg-black/30 sm:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}
      {open && (
        <div
          role="dialog"
          aria-label={`${WEEKDAYS[weekday - 1]} bearbeiten`}
          className={`fixed inset-x-0 bottom-0 z-40 rounded-t-2xl bg-white p-4 pb-6 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:z-20 sm:mt-1 sm:w-56 sm:rounded-lg sm:border sm:border-neutral-200 sm:p-3 sm:pb-3 sm:shadow-lg ${
            weekday >= 4 ? 'sm:right-0' : 'sm:left-0'
          }`}
        >
          <div className="mb-3 flex items-center justify-between sm:hidden">
            <span className="text-base font-semibold text-lmu-darker">{WEEKDAYS[weekday - 1]}</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-sm text-neutral-600">
              Schließen
            </button>
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Verfügbarkeit</div>
          <div className="mt-1 grid gap-1">
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => send(setAvailability, 'status', o.value)}
                className={`flex items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-neutral-100 sm:py-1 ${
                  (status ?? '') === o.value ? 'font-semibold' : ''
                }`}
              >
                <span className={`h-4 w-4 rounded-sm border border-neutral-300 ${AVAILABILITY_STYLES[o.value || 'none']}`} />
                {o.label}
              </button>
            ))}
          </div>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Dienst</div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {DUTY_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  send(setDuty, 'kind', o.value)
                  setOpen(false)
                }}
                className={`rounded border px-2 py-2 text-sm sm:py-1 ${
                  (kind ?? '') === o.value
                    ? 'border-lmu bg-lmu text-white'
                    : 'border-neutral-200 hover:border-lmu hover:bg-lmu-lighter'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
