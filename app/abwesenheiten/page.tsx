import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AbsencesPanel } from '@/components/absences-panel'
import { currentYearAndPeriod, isHiwi } from '@/lib/data'
import { requireUser } from '@/lib/session'

export const dynamic = 'force-dynamic'

export default async function AbsencesPage({ searchParams }: { searchParams: Promise<{ neu?: string }> }) {
  const me = await requireUser('/abwesenheiten')
  const { neu } = await searchParams
  // Hilfskräfte tragen Abwesenheiten im Schichtplan ein
  if (isHiwi(me)) {
    const p = await currentYearAndPeriod()
    redirect(p ? `/plan/${p.year_id}?tab=${p.kind}${neu ? `&neu=${neu}` : ''}#abwesenheiten` : '/plan')
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-lmu-darker">Abwesenheiten</h1>
        <p className="mt-1 text-neutral-600">
          Zeiten eintragen, in denen du nicht da bist (ohne Angabe von Gründen). Alle Abwesenheiten sind in der{' '}
          <Link href="/uebersicht" className="text-lmu underline">Übersicht</Link> für den Lehrstuhl sichtbar.
        </p>
      </div>
      <AbsencesPanel me={me} neu={neu} back="/abwesenheiten" />
    </div>
  )
}
