'use client'

import { useState } from 'react'

/** Schreibgeschütztes Feld mit Kopieren-Knopf (z. B. für die Kalender-Adresse). */
export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={value}
        aria-label={label}
        onFocus={(e) => e.currentTarget.select()}
        className="min-w-0 flex-1 rounded border border-neutral-300 bg-neutral-50 px-2 py-1.5 font-mono text-xs"
      />
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          } catch {
            // ohne Zwischenablage-Zugriff: Feld ist markierbar
          }
        }}
        className="shrink-0 rounded border border-lmu px-3 py-1.5 text-sm text-lmu-darker hover:bg-lmu-light"
      >
        {copied ? 'Kopiert ✓' : 'Kopieren'}
      </button>
    </div>
  )
}
