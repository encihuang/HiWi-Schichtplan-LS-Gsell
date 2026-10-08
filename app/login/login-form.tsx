'use client'

import { useActionState } from 'react'
import { login } from '../actions'

export function LoginForm({ next, kind }: { next: string; kind: 'access' | 'admin' }) {
  const [error, action, pending] = useActionState(login, null)
  return (
    <form action={action} className="mt-4 space-y-3">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="kind" value={kind} />
      <input
        type="password"
        name="password"
        autoFocus
        required
        className="w-full rounded border border-neutral-300 px-3 py-2 focus:outline-2 focus:outline-lmu"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button disabled={pending} className="w-full rounded bg-lmu px-4 py-2 font-medium text-white hover:bg-lmu-dark disabled:opacity-60">
        Anmelden
      </button>
    </form>
  )
}
