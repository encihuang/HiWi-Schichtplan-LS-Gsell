// Gemeinsam für Server und Einstellungsseite (ohne Datenbank)

export type Frequency = 'off' | 'daily' | 'weekly'
/** regelmäßig nach Zeitplan, sofort bei Änderungen oder Erinnerung an Hilfskräfte vor ihrem Dienst */
export type MailKind = 'schedule' | 'change' | 'reminder'
export type Topic = 'absences' | 'appointments' | 'shifts'

/** Automatisch verschickte E-Mail (z. B. wöchentliche Übersicht fürs Sekretariat) */
export type AutoMail = {
  id: string
  kind: MailKind
  name: string
  /** ausgewählte Personen aus der Lehrstuhl-Liste */
  staffIds: number[]
  /** weitere Adressen */
  extra: string[]
  /** nur regelmäßig: wie oft */
  frequency: Frequency
  /** 1 = Montag … 5 = Freitag (nur wöchentlich) */
  weekday: number
  /** nur bei Änderungen: bei welchen Änderungen */
  topics: Topic[]
  /** Vorschau in Wochen für {abwesenheiten} und {termine} */
  weeks: number
  /** nur Erinnerung: Tage vor dem Dienst (0 = am Diensttag) */
  daysBefore: number
  /** nur Erinnerung: Kalendertage statt Werktage (Versand dann auch am Wochenende) */
  calendarDays: boolean
  /** nur Erinnerung: Uhrzeit des Versands (volle Stunde, Berlin) */
  hour: number
  subject: string
  body: string
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  off: 'aus',
  daily: 'werktäglich (Mo–Fr)',
  weekly: 'wöchentlich',
}

export const TOPIC_LABELS: Record<Topic, string> = {
  absences: 'Abwesenheit eingetragen oder gelöscht',
  appointments: 'Termin eingetragen oder gelöscht',
  shifts: 'Schichtplan geändert (Dienste, Vertretungen, Sonderaufgaben)',
}

/** Platzhalter, die durch einen einzelnen Wert ersetzt werden */
export const PLACEHOLDERS = {
  datum: 'heutiges Datum',
  wochentag: 'heutiger Wochentag',
  bis: 'Ende der Vorschau',
  wochen: 'Vorschau in Wochen',
  neu: 'Anzahl seit der letzten E-Mail neu eingetragener Abwesenheiten',
  aenderung: 'die Änderung, z. B. „Anna: Abwesend 02.11.–03.11.2026 eingetragen“ (nur bei Änderungen)',
  titel: 'Name der App',
  lehrstuhl: 'Name des Lehrstuhls',
  link: 'Link zur Übersicht',
} as const

/** Platzhalter, die durch eine Liste mit Überschrift ersetzt werden */
export const BLOCK_PLACEHOLDERS = {
  abwesenheiten: 'Abwesenheiten (Vorschau)',
  neue_abwesenheiten: 'seit der letzten E-Mail neu eingetragene Abwesenheiten',
  abwesend_heute: 'wer heute abwesend ist',
  termine: 'Termine für alle (Vorschau)',
  dienste: 'Dienste, Vorlesungen und Aufgaben der Hilfskräfte mit Vertretungen (nächste 7 Tage)',
} as const

export type BlockKey = keyof typeof BLOCK_PLACEHOLDERS

const SIGNATURE = 'Diese E-Mail wurde automatisch verschickt.\n{titel} – {lehrstuhl}'

const base = (): Omit<AutoMail, 'id' | 'kind' | 'name' | 'subject' | 'body'> => ({
  staffIds: [], extra: [], frequency: 'off', weekday: 1, topics: [], weeks: 4, daysBefore: 1, calendarDays: false, hour: 7,
})

/** Erinnerung: Werktage („1“) oder Kalendertage („1k“) vor dem Dienst */
export const DAYS_BEFORE_OPTIONS: [string, string][] = [
  ['0', 'am Diensttag'],
  ['1', '1 Werktag vorher'],
  ['2', '2 Werktage vorher'],
  ['3', '3 Werktage vorher'],
  ['5', '5 Werktage vorher'],
  ['1k', '1 Tag vorher (auch am Wochenende)'],
  ['2k', '2 Tage vorher (auch am Wochenende)'],
  ['3k', '3 Tage vorher (auch am Wochenende)'],
]

/** Erinnerung: wählbare Uhrzeiten (volle Stunden) */
export const HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => i + 6)

/** Wert der Auswahl für eine Erinnerung */
export const daysBeforeKey = (m: Pick<AutoMail, 'daysBefore' | 'calendarDays'>) =>
  `${m.daysBefore}${m.calendarDays && m.daysBefore ? 'k' : ''}`

/** Platzhalter der Erinnerung (Werte der jeweiligen Hilfskraft und des Diensttags) */
export const REMINDER_PLACEHOLDERS = {
  vorname: 'Vorname der Hilfskraft',
  name: 'voller Name der Hilfskraft',
  datum: 'Datum des Dienstes',
  wochentag: 'Wochentag des Dienstes',
  link: 'Link zum Schichtplan',
  titel: 'Name der App',
  lehrstuhl: 'Name des Lehrstuhls',
} as const
export const REMINDER_BLOCKS = {
  aufgaben: 'Dienst sowie Vorlesungen/Aufgaben an dem Tag (mit Vertretungen)',
} as const

export const DEFAULT_MAILS: Record<MailKind, Omit<AutoMail, 'id'>> = {
  schedule: {
    ...base(),
    kind: 'schedule',
    name: 'Wochenübersicht',
    frequency: 'weekly',
    subject: '{titel}: Übersicht vom {datum}',
    body: [
      'Guten Tag,',
      'hier die Übersicht für die nächsten {wochen} Wochen (bis {bis}).',
      '{neue_abwesenheiten}',
      '{abwesenheiten}',
      '{termine}',
      '{dienste}',
      'Den jeweils aktuellen Stand finden Sie hier:\n{link}',
      SIGNATURE,
    ].join('\n\n'),
  },
  reminder: {
    ...base(),
    kind: 'reminder',
    name: 'Erinnerung an Hilfskräfte',
    subject: 'Erinnerung: Dienst am {wochentag}, {datum}',
    body: [
      'Hallo {vorname},',
      'kurze Erinnerung an deinen Dienst am {wochentag}, {datum}:',
      '{aufgaben}',
      'Falls du nicht kannst, trag bitte rechtzeitig „kann nicht“ im Schichtplan ein, damit jemand die Vertretung übernehmen kann:\n{link}',
      SIGNATURE,
    ].join('\n\n'),
  },
  change: {
    ...base(),
    kind: 'change',
    name: 'Benachrichtigung bei Änderungen',
    topics: ['absences', 'appointments', 'shifts'],
    subject: '{titel}: {aenderung}',
    body: [
      'Guten Tag,',
      'soeben wurde folgende Änderung eingetragen:\n{aenderung}',
      'Zur Einordnung der aktuelle Stand:',
      '{abwesenheiten}',
      '{termine}',
      '{dienste}',
      'Den jeweils aktuellen Stand finden Sie hier:\n{link}',
      SIGNATURE,
    ].join('\n\n'),
  },
}
