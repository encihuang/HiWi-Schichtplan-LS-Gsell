# Studentische Hilfskräfte Schichtplan – LS Gsell

Schichtplan für die studentischen Hilfskräfte am Lehrstuhl für Bürgerliches Recht, Zivilverfahrensrecht,
Europäisches Privat- und Verfahrensrecht (Prof. Dr. jur. Beate Gsell), LMU München.

Ablauf: **Wer bist du?** → **Studienjahr** wählen (oder hinzufügen) → Schichten übernehmen in
Wintersemester, vorlesungsfreier Zeit WiSe, Sommersemester und vorlesungsfreier Zeit SoSe.

- Vorlesungszeit: wöchentlicher Dienst Mo–Fr (Ansprechpartner / Support)
- Vorlesungsfreie Zeit: ein Dienst pro Werktag; Feiertage in Bayern werden automatisch ausgelassen
- Berechnung Soll/Ist nach Wochenstunden (wie im bisherigen Excel-Plan)
- „Zuletzt geändert von … am …“ und Änderungsverlauf
- PDF- und Excel-Export mit „Stand: …“
- Kalender-Abo (Seite „Kalender“): eigene Dienste oder der ganze Plan als iCal-Feed für iPhone, Outlook, Google usw.;
  pro Person eine geheime Adresse unter `/ical/…` (ohne `APP_PASSWORD` erreichbar, jederzeit zurücksetzbar)
- Planungsmodus (Schalter auf der Planseite): Verfügbarkeiten und Schichten aller Hilfskräfte bearbeiten,
  Schichten direkt einer Person zuweisen, Ausfälle und Vertretungen eintragen, Termine für alle anlegen
  (z. B. Teamsitzung; erscheinen im Plan, in der Übersicht und im Kalender-Abo)
- Einstellungen: Hilfskräfte (Name, h/Woche, Beginn/Ende, aktiv), Zeiträume, Feier-/Schließtage.
  Neue Studienjahre werden nach den [LMU-Vorlesungszeiten](https://www.lmu.de/de/workspace-fuer-studierende/1x1-des-studiums/vorlesungszeiten/) angelegt.

LMU-Logo: `public/lmu-logo.svg` (oder `.png`).

## Entwicklung

```bash
npm install
npm run dev
```

Ohne `DATABASE_URL` läuft lokal eine eingebettete Datenbank in `.data/` (nicht in Git).

## Umgebungsvariablen

| Variable | Zweck |
| --- | --- |
| `DATABASE_URL` | Neon-Postgres (Produktion). Tabellen werden beim ersten Zugriff angelegt. |
| `APP_PASSWORD` | optional: gemeinsames Passwort für die ganze App |
| `ADMIN_PASSWORD` | optional: Passwort für die Einstellungen und den Planungsmodus |

Lokale `.env.local` liegt in Dev-Lokal (siehe globale Anweisungen), nicht im Repo.
