import { redirect } from 'next/navigation'
import { isHiwi } from '@/lib/data'
import { requireUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

/** Startseite je Bereich: Hilfskräfte zum Schichtplan, alle anderen zu den Abwesenheiten */
export default async function Home() {
  const me = await requireUser()
  redirect(isHiwi(me) ? '/plan' : me.role === 'prof' || me.role === 'sekretariat' ? '/uebersicht' : '/abwesenheiten')
}
