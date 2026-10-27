import 'server-only'
import { canStoreSecrets, seal } from './crypto'

// Postgres: Neon, wenn DATABASE_URL gesetzt ist, sonst lokal eine PGlite-Datenbank
// in .data/pglite (nur für die Entwicklung).

type Row = Record<string, unknown>
type Query = (text: string, params?: unknown[]) => Promise<Row[]>

const SCHEMA = `
create table if not exists staff (
  id serial primary key,
  name text not null unique,
  hours_per_week numeric not null default 0,
  start_date text,
  end_date text,
  active boolean not null default true
);
create table if not exists years (
  id serial primary key,
  start_year int not null unique
);
create table if not exists periods (
  id serial primary key,
  year_id int not null references years(id) on delete cascade,
  kind text not null check (kind in ('ws','vfz_ws','ss','vfz_ss')),
  start_date text not null,
  end_date text not null,
  unique (year_id, kind)
);
create table if not exists closed_days (
  year_id int not null references years(id) on delete cascade,
  date text not null,
  name text not null,
  primary key (year_id, date)
);
create table if not exists weekly_duties (
  period_id int not null references periods(id) on delete cascade,
  staff_id int not null references staff(id) on delete cascade,
  weekday int not null check (weekday between 1 and 5),
  kind text not null check (kind in ('alle','geteilt','vor_ort','remote')),
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (period_id, staff_id, weekday)
);
create table if not exists availability (
  period_id int not null references periods(id) on delete cascade,
  staff_id int not null references staff(id) on delete cascade,
  weekday int not null check (weekday between 1 and 5),
  status text not null check (status in ('ok','ungern','nein')),
  updated_at timestamptz not null default now(),
  primary key (period_id, staff_id, weekday)
);
create table if not exists lectures (
  id serial primary key,
  period_id int not null references periods(id) on delete cascade,
  name text not null,
  weekday int not null check (weekday between 1 and 5),
  time text not null default '',
  staff_id int references staff(id) on delete set null,
  updated_by text,
  updated_at timestamptz,
  unique (period_id, name, weekday)
);
create table if not exists date_exceptions (
  period_id int not null references periods(id) on delete cascade,
  date text not null,
  staff_id int not null references staff(id) on delete cascade,
  substitute_id int references staff(id) on delete set null,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (period_id, date, staff_id)
);
create table if not exists date_extras (
  period_id int not null references periods(id) on delete cascade,
  date text not null,
  staff_id int not null references staff(id) on delete cascade,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (period_id, date, staff_id)
);
create table if not exists special_tasks (
  id serial primary key,
  period_id int not null references periods(id) on delete cascade,
  name text not null,
  note text not null default '',
  staff_id int references staff(id) on delete set null,
  updated_by text,
  updated_at timestamptz
);
create table if not exists daily_slots (
  period_id int not null references periods(id) on delete cascade,
  date text not null,
  staff_id int not null references staff(id) on delete cascade,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (period_id, date)
);
create table if not exists appointments (
  id serial primary key,
  date text not null,
  time text not null default '',
  title text not null,
  note text not null default '',
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists appointments_date on appointments (date);
create table if not exists absences (
  id serial primary key,
  staff_id int not null references staff(id) on delete cascade,
  from_date text not null,
  to_date text not null,
  kind text not null check (kind in ('urlaub','krank','dienstreise','sonstiges')),
  note text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  check (from_date <= to_date)
);
create index if not exists absences_dates on absences (to_date, from_date);
create table if not exists settings (
  key text primary key,
  value text not null
);
create table if not exists lecture_exceptions (
  lecture_id int not null references lectures(id) on delete cascade,
  date text not null,
  substitute_id int references staff(id) on delete set null,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (lecture_id, date)
);
create table if not exists reminder_log (
  staff_id int not null references staff(id) on delete cascade,
  date text not null,
  sent_at timestamptz not null default now(),
  primary key (staff_id, date)
);
create table if not exists reminder_sent (
  mail_id text not null,
  staff_id int not null references staff(id) on delete cascade,
  date text not null,
  sent_at timestamptz not null default now(),
  primary key (mail_id, staff_id, date)
);
create table if not exists login_codes (
  id text primary key,
  staff_id int not null references staff(id) on delete cascade,
  purpose text not null check (purpose in ('login','reset')),
  code_hash text not null,
  attempts int not null default 0,
  verified boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists login_codes_staff on login_codes (staff_id, created_at);
create table if not exists sessions (
  id text primary key,
  staff_id int not null references staff(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_staff on sessions (staff_id);
create table if not exists changelog (
  id serial primary key,
  period_id int references periods(id) on delete cascade,
  actor text not null,
  message text not null,
  at timestamptz not null default now()
);
create index if not exists changelog_period on changelog (period_id, at desc);
`

// Einmalige Umstellungen bestehender Datenbanken.
// Jede Umstellung läuft genau einmal (Name in schema_migrations), damit z. B. später
// entfernte Schließtage nicht wieder auftauchen.
const ONCE: [string, string][] = [
  [
    'weihnachtspause',
    `insert into closed_days (year_id, date, name)
     select y.id, to_char(d, 'YYYY-MM-DD'), 'Weihnachtspause'
     from years y,
       generate_series(make_date(y.start_year, 12, 24), make_date(y.start_year + 1, 1, 6), interval '1 day') d
     where extract(isodow from d) < 6
     on conflict (year_id, date) do nothing`,
  ],
]

const MIGRATIONS = [
  `alter table staff add column if not exists email text not null default ''`,
  `alter table staff add column if not exists calendar_token text`,
  `create unique index if not exists staff_calendar_token on staff (calendar_token)`,
  // Bereiche: studentische Hilfskräfte und übriges Lehrstuhlteam
  `alter table staff add column if not exists role text not null default 'hiwi'`,
  // frühere Erinnerung je Person (Werktage vorher); wird einmalig in eine automatische E-Mail „Erinnerung“ übernommen
  `alter table staff add column if not exists reminder_days int`,
  // Anmeldung: eigenes Passwort (scrypt) + Code per E-Mail; Verwaltungsrechte je Person
  `alter table staff add column if not exists password_hash text`,
  `alter table staff add column if not exists is_admin boolean not null default false`,
  `alter table staff add column if not exists failed_logins int not null default 0`,
  `alter table staff add column if not exists locked_until timestamptz`,
  // Kalender-Abo: nur noch SHA-256 des Schlüssels zum Nachschlagen, der Schlüssel selbst verschlüsselt
  `alter table staff add column if not exists calendar_hash text`,
  `create unique index if not exists staff_calendar_hash on staff (calendar_hash)`,
  // Sonderaufgaben: ohne festen Tag oder wiederkehrend (wöchentlich, alle 2 Wochen, monatlich)
  `alter table special_tasks add column if not exists repeat text not null default 'none'`,
  `alter table special_tasks add column if not exists weekday int`,
  `alter table special_tasks add column if not exists day_of_month int`,
  `alter table special_tasks add column if not exists start_date text`,
  `alter table special_tasks add column if not exists time text not null default ''`,
  // Abwesenheiten: keine Unterscheidung mehr nach Art; Notiz verschlüsselt (AES-256-GCM)
  `alter table absences alter column kind set default 'sonstiges'`,
  // Ansprechpartner/Support (weekly_slots) -> Dienstarten: allein = Alle Aufgaben, zu zweit = Geteilt
  `do $$ begin
    if to_regclass('weekly_slots') is not null then
      insert into weekly_duties (period_id, staff_id, weekday, kind, updated_by, updated_at)
      select w.period_id, w.staff_id, w.weekday,
        case when (select count(*) from weekly_slots x where x.period_id = w.period_id and x.weekday = w.weekday) > 1
          then 'geteilt' else 'alle' end,
        w.updated_by, w.updated_at
      from weekly_slots w
      on conflict do nothing;
      drop table weekly_slots;
    end if;
  end $$`,
]

const g = globalThis as unknown as { __hiwiDb?: Promise<Query> }

async function connect(): Promise<Query> {
  let q: Query
  if (process.env.DATABASE_URL) {
    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(process.env.DATABASE_URL)
    q = (text, params = []) => sql.query(text, params) as Promise<Row[]>
  } else {
    const { PGlite } = await import('@electric-sql/pglite')
    const { mkdirSync } = await import('node:fs')
    mkdirSync('./.data', { recursive: true })
    const db = new PGlite('./.data/pglite')
    q = async (text, params = []) => (await db.query<Row>(text, params)).rows
  }
  // Einzeln ausführen: über HTTP (Neon) geht nur ein Statement pro Aufruf.
  for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await q(stmt)
  for (const stmt of MIGRATIONS) await q(stmt)
  await q('create table if not exists schema_migrations (name text primary key, at timestamptz not null default now())')
  for (const [name, stmt] of ONCE) {
    const [done] = await q('select 1 from schema_migrations where name = $1', [name])
    if (done) continue
    await q(stmt)
    await q('insert into schema_migrations (name) values ($1) on conflict do nothing', [name])
  }
  // Notizen zu Abwesenheiten aus früheren Versionen verschlüsseln (sobald ein Schlüssel gesetzt ist)
  if (canStoreSecrets()) {
    for (const r of await q(`select id, note from absences where note <> '' and note not like 'v1:%'`)) {
      await q('update absences set note = $2 where id = $1', [r.id, seal(String(r.note))])
    }
  }
  return q
}

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  g.__hiwiDb ??= connect().catch((e) => {
    g.__hiwiDb = undefined
    throw e
  })
  const q = await g.__hiwiDb
  return (await q(text, params)) as T[]
}
