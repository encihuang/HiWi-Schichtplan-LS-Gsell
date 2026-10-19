import { runMails } from '@/lib/mail'

export const dynamic = 'force-dynamic'

// Täglich von Vercel Cron aufgerufen (vercel.json). Ob gesendet wird, entscheidet der Zeitplan in den Einstellungen;
// pro Tag höchstens einmal. Mit CRON_SECRET nur mit passendem Authorization-Header (setzt Vercel automatisch).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Nicht erlaubt', { status: 401 })
  }
  const result = await runMails(new URL(request.url).origin)
  return Response.json({ result })
}
