// Gemeinsam für Server und Einstellungsseite (ohne Datenbank)

export type Frequency = 'off' | 'daily' | 'weekly'

/** Automatisch verschickte E-Mail (z. B. wöchentliche Übersicht fürs Sekretariat) */
export type AutoMail = {
  id: string
  name: string
  /** ausgewählte Personen aus der Lehrstuhl-Liste */
  staffIds: number[]
  /** weitere Adressen */
  extra: string[]
  frequency: Frequency
  /** 1 = Montag … 5 = Freitag (nur wöchentlich) */
  weekday: number
  /** Vorschau in Wochen für {abwesenheiten} und {termine} */
  weeks: number
  /** nur senden, wenn seit der letzten E-Mail neue Abwesenheiten eingetragen wurden */
  onlyNew: boolean
  /** Aktualisierung senden, wenn sich nach der letzten Zusendung etwas ändert */
  updates: boolean
  subject: string
  updateSubject: string
  body: string
}

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  off: 'aus',
  daily: 'werktäglich (Mo–Fr)',
  weekly: 'wöchentlich',
}

/** Platzhalter, die durch einen einzelnen Wert ersetzt werden */
export const PLACEHOLDERS = {
  datum: 'heutiges Datum',
  wochentag: 'heutiger Wochentag',
  bis: 'Ende der Vorschau',
  wochen: 'Vorschau in Wochen',
  neu: 'Anzahl neuer Abwesenheiten',
  aenderung: 'die Änderung (nur in Aktualisierungen)',
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

export const DEFAULT_MAIL: Omit<AutoMail, 'id'> = {
  name: 'Wöchentliche Übersicht',
  staffIds: [],
  extra: [],
  frequency: 'off',
  weekday: 1,
  weeks: 4,
  onlyNew: false,
  updates: false,
  subject: '{titel}: Übersicht {datum}',
  updateSubject: '{titel}: Aktualisierung – {aenderung}',
  body: 'Guten Tag,\n\nhier die aktuelle Übersicht vom {datum}.\n\n{neue_abwesenheiten}\n\n{abwesenheiten}\n\n{termine}\n\nAktuelle Übersicht: {link}\n\nViele Grüße',
}
