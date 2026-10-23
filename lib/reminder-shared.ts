// Erinnerung an Hilfskräfte vor dem Dienst – gemeinsam für Server und Einstellungsseite

/** Auswahl in den Einstellungen: Werktage vor dem Dienst (0 = am Diensttag morgens) */
export const REMINDER_OPTIONS: [number | null, string][] = [
  [null, 'keine Erinnerung'],
  [0, 'am Diensttag morgens'],
  [1, '1 Werktag vorher'],
  [2, '2 Werktage vorher'],
  [3, '3 Werktage vorher'],
  [5, '5 Werktage vorher'],
]

export type ReminderTexts = { subject: string; body: string }

export const DEFAULT_REMINDER_TEXTS: ReminderTexts = {
  subject: 'Erinnerung: Dienst am {wochentag}, {datum}',
  body: [
    'Hallo {vorname},',
    '',
    'kurze Erinnerung an deinen Dienst am {wochentag}, {datum}:',
    '',
    '{aufgaben}',
    '',
    'Falls du nicht kannst, trag bitte rechtzeitig „kann nicht“ im Schichtplan ein, damit jemand die Vertretung übernehmen kann: {link}',
    '',
    'Diese E-Mail wurde automatisch verschickt.',
    '{titel} – {lehrstuhl}',
  ].join('\n'),
}

export const REMINDER_PLACEHOLDERS = {
  vorname: 'Vorname der Hilfskraft',
  name: 'voller Name',
  datum: 'Datum des Dienstes',
  wochentag: 'Wochentag des Dienstes',
  aufgaben: 'Liste: Dienst sowie Vorlesungen/Aufgaben an dem Tag (mit Vertretungen)',
  link: 'Link zum Schichtplan',
  titel: 'Name der App',
  lehrstuhl: 'Name des Lehrstuhls',
} as const
