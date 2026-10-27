# Studentische Hilfskräfte Schichtplan – LS Gsell

Schichtplan für die studentischen Hilfskräfte am Lehrstuhl für Bürgerliches Recht, Zivilverfahrensrecht,
Europäisches Privat- und Verfahrensrecht (Prof. Dr. jur. Beate Gsell), LMU München.

Alle Daten sind vertraulich und nur nach **Anmeldung** sichtbar:

- **Code per E-Mail** (Standard): dienstliche E-Mail-Adresse eingeben, 6-stelligen Code aus der E-Mail eintragen
  (10 Minuten gültig, höchstens 5 Versuche, höchstens 5 Codes pro Stunde)
- **Mit Passwort** (wahlweise): Passwort über „Passwort vergessen?“ (Code per E-Mail) oder in den eigenen
  Einstellungen festlegen; nach 5 Fehlversuchen 15 Minuten gesperrt
- Eine Anmeldung gilt 14 Tage; „Abmelden“ und „Alle anderen Geräte abmelden“

Danach: Hilfskräfte → **Studienjahr** wählen (oder hinzufügen) → Schichten übernehmen in Wintersemester,
vorlesungsfreier Zeit WiSe, Sommersemester und vorlesungsfreier Zeit SoSe. Übriges Team → Abwesenheiten.

- **Einstellungen** (jede Person selbst): Name, Arbeitszeit (h/Woche) und Vertragszeitraum (Hilfskräfte),
  Erinnerungen per E-Mail an/aus, Passwort festlegen/ändern/entfernen, andere Geräte abmelden, Kalender-Abo
- **Verwaltung** (nur mit Verwaltungsrechten): Personen aufnehmen und entfernen (Daten bleiben erhalten; endgültig
  löschen nur bei entfernten Personen), fehlende E-Mail nachtragen, Verwaltungsrechte geben/entziehen, Personen
  abmelden, Kalender-Adressen zurücksetzen, E-Mail-Versand, automatische E-Mails, Studienjahre, Verlauf

- Abwesenheiten (für alle, ohne Art/Grund – angezeigt wird nur „Abwesend“): eintragen, danach per E-Mail (mailto) ans Sekretariat melden;
  sichtbar in der Übersicht und im Kalender-Abo
- E-Mail-Zusammenfassung (Einstellungen → E-Mail-Versand): Empfänger, werktäglich oder wöchentlich, Versand über
  das eigene LMU-Konto per SMTP; Vercel Cron ruft täglich um 5:00 UTC `/api/cron/digest` auf. E-Mail-Texte
  (Betreff, Einleitung, Schluss, Text der Abwesenheitsmeldung) sind einstellbar; optional geht nach Änderungen an
  Abwesenheiten oder Terminen sofort eine Aktualisierung raus
- Vorlesungen Prof. Gsell und weitere Aufgaben: an einzelnen Tagen „kann nicht“ und Vertretung wie bei den Diensten;
  erscheinen in Übersicht, Kalender-Abo und im E-Mail-Platzhalter `{dienste}`
- Erinnerung an Hilfskräfte vor dem Dienst: automatische E-Mail der Art „Erinnerung“ (Verwaltung → Automatische
  E-Mails); jede Hilfskraft meldet sich in ihren Einstellungen selbst an oder ab; Zeitpunkt (am Diensttag, 1–5
  Werktage vorher oder 1–3 Tage vorher, dann auch am Wochenende), Uhrzeit (6–22 Uhr) und Text; enthält Dienst und
  Vorlesungen/Aufgaben des Tages; Versand über den stündlichen Cron (GitHub Actions `.github/workflows/cron.yml`,
  da Vercel Cron im Hobby-Tarif nur täglich läuft)
- Sonderaufgaben ohne festen Tag: eine Person für den ganzen Zeitraum
- Wiederkehrende Aufgaben (eigener Bereich auf der Planseite): jede Woche, alle 2 Wochen oder jeden Monat am n. (sonst
  nächster Werktag), optional mit Uhrzeit; jeder Termin wird einzeln übernommen (jede Woche kann jemand anderes);
  nur auf der Planseite der Hilfskräfte (nicht in der Übersicht) sowie im Kalender-Abo, in `{dienste}` und in den
  Erinnerungen
- Planseite und Verwaltung mit Seitennavigation zu den Bereichen
- Übersicht: „Mehr anzeigen“ (+4 Wochen) und „Gesamten Zeitraum anzeigen“
- Personen haben einen Bereich (Hilfskraft, Wiss. Mitarbeiter:in, Akad. Rat, Sekretariat, Lehrstuhlinhaberin)

- Vorlesungszeit: wöchentlicher Dienst Mo–Fr (Ansprechpartner / Support)
- Vorlesungsfreie Zeit: ein Dienst pro Werktag; Feiertage in Bayern werden automatisch ausgelassen
- Berechnung Soll/Ist nach Wochenstunden (wie im bisherigen Excel-Plan)
- „Zuletzt geändert von … am …“ und Änderungsverlauf
- PDF- und Excel-Export mit „Stand: …“
- Kalender-Abo (in den Einstellungen): eigene Dienste oder der ganze Plan als iCal-Feed für iPhone, Outlook, Google
  usw.; pro Person eine geheime Adresse unter `/ical/…` (ohne Anmeldung erreichbar, in der Verwaltung zurücksetzbar)
- Planungsmodus (Schalter auf der Planseite, für alle Hilfskräfte und Verwaltung): Verfügbarkeiten und Schichten aller Hilfskräfte bearbeiten,
  Schichten direkt einer Person zuweisen, Ausfälle und Vertretungen eintragen, Termine für alle anlegen
  (z. B. Klausurtermine, Teamsitzung; erscheinen im Plan, in der Übersicht und im Kalender-Abo)
- Zeiträume, Feier-/Schließtage in der Verwaltung. Neue Studienjahre werden nach den [LMU-Vorlesungszeiten](https://www.lmu.de/de/workspace-fuer-studierende/1x1-des-studiums/vorlesungszeiten/) angelegt.

LMU-Logo: `public/lmu-logo.svg` (oder `.png`).

## Entwicklung

```bash
npm install
npm run dev
```

Ohne `DATABASE_URL` läuft lokal eine eingebettete Datenbank in `.data/` (nicht in Git). Ohne eingerichteten
E-Mail-Versand stehen die Anmelde-Codes lokal in der Konsole.

## Einrichtung

1. `SECRET_KEY` und `ADMIN_PASSWORD` setzen (siehe unten).
2. `/login?schritt=einrichtung` mit `ADMIN_PASSWORD` öffnen → Verwaltung: E-Mail-Versand (SMTP) einrichten und eine
   Person mit dienstlicher E-Mail und Verwaltungsrechten aufnehmen (bestehende Personen: E-Mail nachtragen und unter
   „Zugang und Sicherheit“ Verwaltungsrechte geben).
3. Sobald sich jemand mit Verwaltungsrechten anmelden kann, ist der Zugang mit `ADMIN_PASSWORD` gesperrt.

## Datenschutz und Verschlüsselung

- SHA-256 (Einwegfunktion, nicht umkehrbar): Sitzungs-Schlüssel, Kalender-Schlüssel; Anmelde-Codes als HMAC-SHA-256
- scrypt (mit Salt): Passwörter
- AES-256-GCM mit `SECRET_KEY`: Notizen zu Abwesenheiten, SMTP-Passwort, Kalender-Schlüssel (zum Anzeigen)
- Cookies `httpOnly`, `sameSite=lax`, in Produktion `secure`

## Umgebungsvariablen

| Variable | Zweck |
| --- | --- |
| `DATABASE_URL` | Neon-Postgres (Produktion). Tabellen werden beim ersten Zugriff angelegt. |
| `SECRET_KEY` | **erforderlich**: ein globaler geheimer Schlüssel (z. B. `openssl rand -base64 48`) für die Verschlüsselung (AES-256-GCM) und die Anmelde-Codes. Nie ändern – sonst sind verschlüsselte Notizen und das SMTP-Passwort nicht mehr lesbar. |
| `ADMIN_PASSWORD` | Einrichtungs-Passwort: öffnet die Verwaltung nur, solange sich noch niemand mit Verwaltungsrechten anmelden kann |
| `CRON_SECRET` | empfohlen: schützt `/api/cron/digest` (Vercel sendet den Header automatisch) |

Lokale `.env.local` liegt in Dev-Lokal (siehe globale Anweisungen), nicht im Repo.
