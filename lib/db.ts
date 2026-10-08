import 'server-only'

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
create table if not exists weekly_slots (
  period_id int not null references periods(id) on delete cascade,
  weekday int not null check (weekday between 1 and 5),
  role text not null check (role in ('ap','support')),
  staff_id int not null references staff(id) on delete cascade,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (period_id, weekday, role)
);
create table if not exists daily_slots (
  period_id int not null references periods(id) on delete cascade,
  date text not null,
  staff_id int not null references staff(id) on delete cascade,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  primary key (period_id, date)
);
create table if not exists changelog (
  id serial primary key,
  period_id int references periods(id) on delete cascade,
  actor text not null,
  message text not null,
  at timestamptz not null default now()
);
create index if not exists changelog_period on changelog (period_id, at desc);
`

const g = globalThis as unknown as { __hiwiDb?: Promise<Query> }

async function connect(): Promise<Query> {
  let q: Query
  if (process.env.DATABASE_URL) {
    const { neon } = await import('@neondatabase/serverless')
    const sql = neon(process.env.DATABASE_URL)
    q = (text, params = []) => sql.query(text, params) as Promise<Row[]>
    // Mehrere Statements gehen über HTTP nicht in einem Aufruf.
    for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) await q(stmt)
  } else {
    const { PGlite } = await import('@electric-sql/pglite')
    const { mkdirSync } = await import('node:fs')
    mkdirSync('./.data', { recursive: true })
    const db = new PGlite('./.data/pglite')
    await db.exec(SCHEMA)
    q = async (text, params = []) => (await db.query<Row>(text, params)).rows
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
