# Berufskolleg – Umzug Labels mit QR-Code

Erstelle bunte, druckfertige Kisten-Labels für den Schulumzug – mit QR-Code pro Kiste.

## Starten

```bash
docker compose up -d
```

Dann im Browser: **http://localhost:3000**

## Funktionen

- **Kiste anlegen** mit Bezeichnung, Fach, Aktueller Raum, Zielraum, Lehrkraft, Inhalt, Hinweisen
- **Bunte Labels** je nach Schulfach (15 Fächer mit eigener Farbe)
- **QR-Code** auf dem Label → scannen → Detailansicht mit Inhalt
- **Drucken** – einzelne Labels oder alle auf einmal
- **Suche** durch alle Kisten (Bezeichnung, Raum, Lehrkraft, Inhalt)

## Fächer und Farben

| Fach | Farbe |
|------|-------|
| Mathematik | Blau |
| Deutsch | Rot |
| Englisch / Fremdsprachen | Grün |
| Geschichte / Sozialkunde | Braun |
| Religion / Ethik | Indigo |
| Sport | Pink |
| Kunst / Musik | Lila |
| BWL / Wirtschaft | Amber |
| Informatik | Violett |
| Technik | Grau-Blau |
| Physik | Orange |
| Chemie | Cyan |
| Biologie | Teal |
| Verwaltung / Büro | Dunkelgrau |
| Sonstiges | Grau |

## URL-Erkennung für QR-Codes

Die Basis-URL wird automatisch aus dem HTTP-Request ermittelt.

Falls du einen Reverse Proxy oder einen festen Domain-Namen hast:

```yaml
# docker-compose.yml
environment:
  BASE_URL: "https://umzug.schule.de"
```

## Daten

Die SQLite-Datenbank wird in einem Docker Volume (`umzug-data`) gespeichert
und bleibt auch nach `docker compose down` erhalten.
