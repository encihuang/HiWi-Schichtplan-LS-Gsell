import { runMails } from '@/lib/mail'
import { runReminders } from '@/lib/reminders'

export const dynamic = 'force-dynamic'

// Täglich von Vercel Cron aufgerufen (vercel.json): automatische E-Mails und Dienst-Erinnerungen.
// Ob gesendet wird, entscheidet der Zeitplan in den Einstellungen;
// pro Tag höchstens einmal. Mit CRON_SECRET nur mit passendem Authorization-Header (setzt Vercel automatisch).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Nicht erlaubt', { status: 401 })
  }
  const origin = new URL(request.url).origin
  const result = await runMails(origin)
  // Erinnerungen an Hilfskräfte vor dem Dienst (in den Einstellungen je Person)
  const reminders = await runReminders(origin)
  return Response.json({ result, reminders })
}
