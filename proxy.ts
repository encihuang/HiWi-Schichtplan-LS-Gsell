import { NextResponse, type NextRequest } from 'next/server'

// Ganze App nur nach Anmeldung (Code per E-Mail oder Passwort). Hier nur die schnelle Vorprüfung, ob ein
// Sitzungs-Cookie da ist; ob die Sitzung gültig ist, prüft jede Seite, Aktion und Route selbst (lib/session.ts).
// Ohne Anmeldung erreichbar: Anmeldeseite, Kalender-Abos (geheime Adresse) und der Cron (CRON_SECRET).
export function proxy(request: NextRequest) {
  if (request.cookies.has('hiwi_session') || request.cookies.has('hiwi_setup')) return NextResponse.next()
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  const next = request.nextUrl.pathname + request.nextUrl.search
  url.search = next === '/' ? '' : `?next=${encodeURIComponent(next)}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!login|ical/|api/cron/|_next/|favicon.ico|lmu-logo).*)'],
}
