/** Briefumschlag-Symbol, öffnet das Mailprogramm (mailto:) */
export function MailLink({ email, name, className = '' }: { email: string; name?: string; className?: string }) {
  if (!email) return null
  return (
    <a
      href={`mailto:${email}`}
      title={`E-Mail an ${name ?? email} (${email})`}
      aria-label={`E-Mail an ${name ?? email}`}
      className={`inline-flex h-6 w-6 items-center justify-center rounded text-lmu hover:bg-lmu-light hover:text-lmu-darker ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    </a>
  )
}
