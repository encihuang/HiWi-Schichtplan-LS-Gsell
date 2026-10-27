'use client'

import { startTransition, useActionState } from 'react'

type Action = (prev: string | null, fd: FormData) => Promise<string | null>

/**
 * Formular mit Rückmeldung: Die Aktion gibt eine Fehlermeldung zurück, „ok“ bei Erfolg (dann done anzeigen)
 * oder leitet weiter.
 */
export function ActionForm({ action, submit, done, className = 'space-y-3', children }: {
  action: Action
  submit: string
  done?: string
  className?: string
  children: React.ReactNode
}) {
  const [result, formAction, pending] = useActionState(action, null)
  return (
    <form
      action={formAction}
      // selbst abschicken: sonst leert React das Formular nach der Aktion (z. B. die E-Mail nach falschem Passwort)
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        startTransition(() => formAction(fd))
      }}
      className={className}
    >
      {children}
      {result && result !== 'ok' && <p className="text-sm text-red-700" role="alert">{result}</p>}
      {result === 'ok' && done && <p className="text-sm text-lmu-darker" role="status">{done}</p>}
      <button
        disabled={pending}
        className="rounded bg-lmu px-4 py-2 text-sm font-medium text-white hover:bg-lmu-dark disabled:opacity-60"
      >
        {pending ? 'Bitte warten …' : submit}
      </button>
    </form>
  )
}
