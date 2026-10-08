import { LoginForm } from './login-form'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; kind?: string }> }) {
  const { next = '/', kind = 'access' } = await searchParams
  return (
    <div className="max-w-sm mx-auto mt-10 bg-white rounded-lg shadow-sm p-6 border-t-4 border-lmu">
      <h1 className="text-xl font-bold text-lmu-darker">
        {kind === 'admin' ? 'Einstellungen' : 'Zugang zum Schichtplan'}
      </h1>
      <p className="text-sm text-neutral-600 mt-1">Bitte das Passwort eingeben.</p>
      <LoginForm next={next} kind={kind === 'admin' ? 'admin' : 'access'} />
    </div>
  )
}
