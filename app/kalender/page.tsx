import { redirect } from 'next/navigation'

// Das Kalender-Abo steht jetzt in den eigenen Einstellungen.
export default function CalendarPage() {
  redirect('/einstellungen#kalender')
}
