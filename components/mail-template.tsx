'use client'

import { useRef } from 'react'
import { BLOCK_PLACEHOLDERS, DEFAULT_MAIL, PLACEHOLDERS } from '@/lib/mail-shared'

const input = 'w-full min-w-0 rounded border border-neutral-300 px-2 py-1.5 text-sm focus:outline-2 focus:outline-lmu'
const label = 'grid min-w-0 gap-1 text-sm'
const chip = 'rounded-full border px-2 py-0.5 font-mono text-xs'

type Field = HTMLInputElement | HTMLTextAreaElement

/** Betreff und Text einer automatischen E-Mail; Klick auf einen Platzhalter fügt ihn an der Cursorposition ein. */
export function MailTemplate({ subject, updateSubject, body }: { subject: string; updateSubject: string; body: string }) {
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const last = useRef<Field | null>(null)
  const remember = (e: React.FocusEvent<Field>) => (last.current = e.currentTarget)

  const insert = (key: string) => {
    const el = last.current ?? bodyRef.current
    if (!el) return
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    el.setRangeText(`{${key}}`, start, end, 'end')
    el.focus()
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5 rounded-lg bg-neutral-50 p-3">
        <span className="text-xs text-neutral-600">
          Platzhalter anklicken, um ihn an der Cursorposition einzufügen. Listen werden mit Überschrift eingefügt:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(BLOCK_PLACEHOLDERS).map(([k, d]) => (
            <button key={k} type="button" title={d} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k)}
              className={`${chip} border-lmu bg-lmu-lighter text-lmu-darker hover:bg-lmu-light`}>
              {`{${k}}`}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(PLACEHOLDERS).map(([k, d]) => (
            <button key={k} type="button" title={d} onMouseDown={(e) => e.preventDefault()} onClick={() => insert(k)}
              className={`${chip} border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100`}>
              {`{${k}}`}
            </button>
          ))}
        </div>
        <details className="text-xs text-neutral-600">
          <summary className="cursor-pointer">Was bedeuten die Platzhalter?</summary>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            {Object.entries({ ...BLOCK_PLACEHOLDERS, ...PLACEHOLDERS }).map(([k, d]) => (
              <div key={k} className="contents">
                <dt className="font-mono">{`{${k}}`}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Betreff
          <input name="subject" defaultValue={subject} placeholder={DEFAULT_MAIL.subject} onFocus={remember} className={input} />
        </label>
        <label className={label}>
          Betreff bei Aktualisierungen
          <input name="updateSubject" defaultValue={updateSubject} placeholder={DEFAULT_MAIL.updateSubject} onFocus={remember} className={input} />
        </label>
      </div>
      <label className={label}>
        Text
        <textarea ref={bodyRef} name="body" rows={10} defaultValue={body} onFocus={remember} className={`${input} font-mono`} />
      </label>
    </div>
  )
}
