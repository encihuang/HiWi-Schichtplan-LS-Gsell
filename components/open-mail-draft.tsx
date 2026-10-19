'use client'

import { useEffect } from 'react'

/**
 * Öffnet direkt nach dem Eintragen einmal den E-Mail-Entwurf (mailto) im Mailprogramm.
 * `id` merkt sich, dass der Entwurf schon offen war, damit ein Neuladen ihn nicht erneut öffnet.
 */
export function OpenMailDraft({ href, id }: { href: string; id: string }) {
  useEffect(() => {
    const key = `mail-draft:${id}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, '1')
    } catch {}
    window.location.href = href
  }, [href, id])
  return null
}
