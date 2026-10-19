import Link from 'next/link'
import { isHiwi, listStaff, ROLE_LABELS, type Staff } from '@/lib/data'
import { currentStaff } from '@/lib/session'
import { selectStaff } from './actions'

export const dynamic = 'force-dynamic'

const AREAS = {
  hilfskraefte: {
    title: 'Studentische Hilfskräfte',
    text: 'Schichtplan: Dienste übernehmen, Verfügbarkeiten, Vertretungen, Sonderaufgaben. Abwesenheiten und Urlaube melden.',
    filter: isHiwi,
  },
  team: {
    title: 'Wissenschaftliche Mitarbeiter:innen, Akad. Räte und Sekretariat',
    text: 'Abwesenheiten und Urlaube eintragen und dem Sekretariat melden.',
    filter: (s: Staff) => !isHiwi(s),
  },
} as const
type Area = keyof typeof AREAS

export default async function Home({ searchParams }: { searchParams: Promise<{ bereich?: string }> }) {
  const { bereich } = await searchParams
  const area = bereich && bereich in AREAS ? (bereich as Area) : null
  if (!area) return <AreaPicker />

  const [all, me] = await Promise.all([listStaff(true), currentStaff()])
  const staff = all.filter(AREAS[area].filter)
  return (
    <div className="max-w-2xl mx-auto">
      <p className="text-sm">
        <Link href="/" className="text-neutral-500 hover:text-lmu">← Bereiche</Link>
      </p>
      <h1 className="mt-1 text-2xl font-bold text-lmu-darker">{AREAS[area].title}</h1>
      <p className="mt-1 text-neutral-600">Wer bist du?</p>

      {staff.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-lmu p-6 bg-white">
          Noch niemand eingetragen.{' '}
          <Link href="/einstellungen" className="text-lmu font-medium underline">
            In den Einstellungen anlegen
          </Link>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {staff.map((s) => (
            <li key={s.id}>
              <form action={selectStaff}>
                <input type="hidden" name="id" value={s.id} />
                <button
                  className={`w-full rounded-lg border-2 px-4 py-5 text-left transition shadow-sm ${
                    me?.id === s.id
                      ? 'border-lmu bg-lmu text-white'
                      : 'border-transparent bg-white hover:border-lmu hover:bg-lmu-lighter'
                  }`}
                >
                  <span className="block text-lg font-semibold">{s.name}</span>
                  <span className={`text-sm ${me?.id === s.id ? 'text-white/85' : 'text-neutral-500'}`}>
                    {isHiwi(s) ? `${s.hours_per_week.toLocaleString('de-DE')} h/Woche` : ROLE_LABELS[s.role]}
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AreaPicker() {
  const tile = 'block rounded-lg border-2 border-transparent bg-white p-6 shadow-sm transition hover:border-lmu hover:bg-lmu-lighter'
  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-lmu-darker">Willkommen</h1>
      <p className="mt-1 text-neutral-600">Bitte wähle deinen Bereich.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {(Object.keys(AREAS) as Area[]).map((k) => (
          <Link key={k} href={`/?bereich=${k}`} className={tile}>
            <span className="block text-lg font-bold text-lmu-darker">{AREAS[k].title}</span>
            <span className="mt-2 block text-sm text-neutral-600">{AREAS[k].text}</span>
            <span className="mt-4 block text-sm font-medium text-lmu">Weiter →</span>
          </Link>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Link href="/uebersicht" className={tile}>
          <span className="block font-bold text-lmu-darker">Übersicht für den Lehrstuhl</span>
          <span className="mt-1 block text-sm text-neutral-600">
            Wer hat wann Dienst, wer ist abwesend – für Prof. Gsell und das Sekretariat, ohne Anmeldung.
          </span>
        </Link>
      </div>
    </div>
  )
}
