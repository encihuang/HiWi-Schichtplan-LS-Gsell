import { NextResponse, type NextRequest } from 'next/server'

// Optionaler Zugangsschutz für die ganze App: APP_PASSWORD setzen.
export async function proxy(request: NextRequest) {
  const pw = process.env.APP_PASSWORD
  if (!pw) return NextResponse.next()
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hiwi-schichtplan:' + pw))
  const expected = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
  if (request.cookies.get('hiwi_access')?.value === expected) return NextResponse.next()
  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/((?!login|ical/|api/cron/|_next/|favicon.ico|lmu-logo).*)'],
}
