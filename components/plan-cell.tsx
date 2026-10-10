'use client'

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react'
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
  // Sofort anzeigen, was gewählt wurde; der Server bestätigt im Hintergrund.
  const [shown, setShown] = useOptimistic(
    { status, kind, kindLabel },
    (cur, next: Partial<{ status: AvailabilityStatus | null; kind: DutyKind | null; kindLabel: string }>) => ({ ...cur, ...next }),
  )
  const ref = useRef<HTMLDivElement>(null)
  // Desktop: Auswahl am Bildschirm ausrichten (fixed), damit der scrollbare Tabellen-Container sie nicht abschneidet.
  const [anchor, setAnchor] = useState<React.CSSProperties | null>(null)

  const toggle = () => {
    if (open) return setOpen(false)
    const r = ref.current?.getBoundingClientRect()
    if (r && window.matchMedia('(min-width: 640px)').matches) {
      const up = window.innerHeight - r.bottom < 340 && r.top > 340
      setAnchor({
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
        ...(weekday >= 4 ? { right: Math.max(8, window.innerWidth - r.right) } : { left: Math.max(8, r.left) }),
      })
    } else setAnchor(null)
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    // Beim Scrollen der Seite würde die fixierte Auswahl wegdriften – dann schließen.
    const scroll = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const resize = () => setOpen(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', resize)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', resize)
    }
  }, [open])

  const send = (field: 'status' | 'kind', value: string) => {
    const fd = new FormData()
    fd.set('period', String(periodId))
    fd.set('staff', String(staffId))
    fd.set('weekday', String(weekday))
    fd.set(field, value)
    start(async () => {
      if (field === 'status') {
        setShown({ status: (value || null) as AvailabilityStatus | null })
        await setAvailability(fd)
      } else {
        const label = DUTY_OPTIONS.find((o) => o.value === value)?.label ?? ''
        setShown({ kind: (value || null) as DutyKind | null, kindLabel: value ? label : '' })
        await setDuty(fd)
      }
    })
  }

  const body = (
    <span className="flex items-center gap-1">
      <span className="truncate">{shown.kindLabel}</span>
      {warn && <span title={warn} aria-label={warn}>⚠</span>}
    </span>
  )

  return (
    <div ref={ref} className="relative h-full">
      {editable ? (
        <button
          type="button"
          onClick={toggle}
          className={`flex h-12 w-full items-center px-2 text-left text-sm font-semibold text-neutral-900 outline-offset-[-3px] hover:outline-2 hover:outline-lmu-darker hover:brightness-95 active:scale-100 ${
            AVAILABILITY_STYLES[shown.status ?? 'none']
          } ${open ? 'outline-2 outline-lmu-darker' : ''} ${pending ? 'animate-pulse' : ''}`}
          aria-busy={pending}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {body}
          {!shown.kind && !shown.status && <span className="text-xs font-normal text-neutral-400">auswählen</span>}
        </button>
      ) : (
        <div className={`flex h-12 items-center px-2 text-sm font-semibold text-neutral-900 ${AVAILABILITY_STYLES[shown.status ?? 'none']}`}>
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
          style={anchor ?? undefined}
          className={
            anchor
              ? 'fixed z-40 w-56 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg'
              : 'fixed inset-x-0 bottom-0 z-40 rounded-t-2xl bg-white p-4 pb-6 shadow-2xl'
          }
        >
          <div className={`mb-3 flex items-center justify-between ${anchor ? 'hidden' : ''}`}>
            <span className="text-base font-semibold text-lmu-darker">{WEEKDAYS[weekday - 1]}</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100">
              Schließen
            </button>
          </div>
          <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Verfügbarkeit</div>
          <div className="mt-1 grid gap-1">
            {STATUS_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => send('status', o.value)}
                className={`flex items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-neutral-100 sm:py-1 ${
                  (shown.status ?? '') === o.value ? 'bg-neutral-100 font-semibold' : ''
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
                  send('kind', o.value)
                  setOpen(false)
                }}
                className={`rounded border px-2 py-2 text-sm sm:py-1 ${
                  (shown.kind ?? '') === o.value
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
