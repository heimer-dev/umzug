# Umzugskarton Labels mit QR-Code

Erstelle bunte, druckfertige Labels für Umzugskartons mit QR-Code.

## Starten

```bash
docker compose up -d
```

Dann im Browser: **http://localhost:3000**

## Funktionen

- **Karton anlegen** mit Bezeichnung, Alt-Raum, Neu-Raum, Inhalt, Hinweisen
- **Bunte Labels** je nach Raum (Wohnzimmer, Küche, Bad, ...)
- **QR-Code** auf dem Label → scannen → Detailansicht im Browser
- **Drucken** – einzelne Labels oder alle auf einmal
- **Suche** durch alle Kartons

## URL-Erkennung für QR-Codes

Der QR-Code enthält die URL zur Detailseite. Die Basis-URL wird automatisch
aus dem HTTP-Request ermittelt (funktioniert in den meisten Netzwerken).

Falls du einen Reverse Proxy oder einen festen Domain-Namen hast, trage in
`docker-compose.yml` die Variable ein:

```yaml
environment:
  BASE_URL: "https://umzug.meinedomain.de"
```

## Raumfarben

| Raum | Farbe |
|------|-------|
| Wohnzimmer | Blau |
| Schlafzimmer | Lila |
| Küche | Orange |
| Bad | Türkis |
| Kinderzimmer | Grün |
| Büro | Gelb |
| Keller / Lager | Grau |
| Dachboden | Braun |
| Flur / Eingang | Pink |
| Sonstiges | Dunkelgrau |

## Daten

Die SQLite-Datenbank wird in einem Docker Volume (`umzug-data`) gespeichert
und bleibt auch nach `docker compose down` erhalten.
