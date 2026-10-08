import Link from 'next/link'
import { listStaff } from '@/lib/data'
import { currentStaff } from '@/lib/session'
import { selectStaff } from './actions'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const [staff, me] = await Promise.all([listStaff(true), currentStaff()])
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-lmu-darker">Wer bist du?</h1>
      <p className="mt-1 text-neutral-600">Wähle deinen Namen, danach das Studienjahr und deine Schichten.</p>

      {staff.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-lmu p-6 bg-white">
          Noch keine Hilfskräfte eingetragen.{' '}
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
                    {s.hours_per_week.toLocaleString('de-DE')} h/Woche
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
