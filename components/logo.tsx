'use client'

import { useEffect, useState } from 'react'

// Logo aus public/lmu-logo.svg bzw. public/lmu-logo.png; fehlt beides, ein Text-Ersatz.
const SOURCES = ['/lmu-logo.svg', '/lmu-logo.png']

export function Logo() {
  const [i, setI] = useState(0)
  // Fehler vor der Hydration lösen kein onError mehr aus, daher zusätzlich nachsehen.
  useEffect(() => {
    if (i >= SOURCES.length) return
    fetch(SOURCES[i], { method: 'HEAD' })
      .then((r) => { if (!r.ok) setI((n) => Math.max(n, i + 1)) })
      .catch(() => {})
  }, [i])
  if (i >= SOURCES.length) {
    return (
      <span className="shrink-0 grid place-items-center h-12 w-16 bg-lmu text-white font-bold tracking-wide rounded-sm">
        LMU
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={SOURCES[i]} alt="LMU München" className="h-12 w-auto shrink-0" onError={() => setI(i + 1)} />
  )
}
