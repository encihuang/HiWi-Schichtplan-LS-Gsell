// Gemeinsam für Server und Einstellungsseite (ohne Datenbank)

export type Frequency = 'off' | 'daily' | 'weekly'
/** regelmäßig nach Zeitplan oder sofort bei Änderungen */
export type MailKind = 'schedule' | 'change'
export type Topic = 'absences' | 'appointments'

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
}

/** Platzhalter, die durch einen einzelnen Wert ersetzt werden */
export const PLACEHOLDERS = {
  datum: 'heutiges Datum',
  wochentag: 'heutiger Wochentag',
  bis: 'Ende der Vorschau',
  wochen: 'Vorschau in Wochen',
  neu: 'Anzahl seit der letzten E-Mail neu eingetragener Abwesenheiten',
  aenderung: 'die Änderung, z. B. „Anna: Urlaub 02.11.–03.11.2026 eingetragen“ (nur bei Änderungen)',
  titel: 'Name der App',
  lehrstuhl: 'Name des Lehrstuhls',
  link: 'Link zur Übersicht',
} as const

/** Platzhalter, die durch eine Liste mit Überschrift ersetzt werden */
export const BLOCK_PLACEHOLDERS = {
  abwesenheiten: 'Abwesenheiten und Urlaube (Vorschau)',
  neue_abwesenheiten: 'seit der letzten E-Mail neu eingetragene Abwesenheiten',
  abwesend_heute: 'wer heute abwesend ist',
  termine: 'Termine für alle (Vorschau)',
  dienste: 'Dienste der Hilfskräfte (nächste 7 Tage)',
} as const

export type BlockKey = keyof typeof BLOCK_PLACEHOLDERS

const SIGNATURE = 'Diese E-Mail wurde automatisch verschickt.\n{titel} – {lehrstuhl}'

const base = (): Omit<AutoMail, 'id' | 'kind' | 'name' | 'subject' | 'body'> => ({
  staffIds: [], extra: [], frequency: 'off', weekday: 1, topics: [], weeks: 4,
})

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
  change: {
    ...base(),
    kind: 'change',
    name: 'Benachrichtigung bei Änderungen',
    topics: ['absences', 'appointments'],
    subject: '{titel}: {aenderung}',
    body: [
      'Guten Tag,',
      'soeben wurde folgende Änderung eingetragen:\n{aenderung}',
      'Zur Einordnung der aktuelle Stand:',
      '{abwesenheiten}',
      '{termine}',
      'Den jeweils aktuellen Stand finden Sie hier:\n{link}',
      SIGNATURE,
    ].join('\n\n'),
  },
}
