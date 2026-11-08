# Observatory — Zaragoza

An independent observatory of Zaragoza's public services, featuring bus arrival predictions and Bizi bike availability, with Chart.js statistics and a Leaflet map.

**Website:** https://qarlosalberto.github.io/observatory/

## Run locally

```sh
npm install
python3 -m http.server 4173 --directory site
npm test
npm run test:e2e
```

GitHub Actions runs unit and end-to-end tests before deploying to GitHub Pages. If needed, configure **Settings → Pages → Build and deployment → GitHub Actions**.

Live statistics reflect the latest API responses in the current session. **A predicted wait over 15 minutes does not prove that a bus is late against its timetable.** Out-of-service Bizi bikes are counted only when the provider reports that metric. Missing values and API failures are not treated as zero.

My Places maintains personal place management in its own repository.

## Automated historical data

The `.github/workflows/history.yml` workflow attempts to collect public-service snapshots every 30 minutes (at minutes 07 and 37 UTC), and can also be started manually through GitHub Actions. The `scripts/capture-history.mjs` script writes snapshots to `site/history/snapshots.json`, retaining up to 90 days. It also accumulates bus metrics by route and stop in `site/history/bus-details.json`.

The workflow needs `GITHUB_TOKEN` write permission to commit updates to `main`. GitHub Actions scheduled runs can be delayed or suspended.

**Bizi metrics:** reporting stations, empty stations, available bikes, and out-of-service bikes when reported.

**Bus metrics:** a rotating sample of up to 60 stops per run, including known predictions, responses without predictions, API errors, and predictions over 15 minutes. Route and stop rankings require at least 20 known predictions. This is **not a complete census of stops or a punctuality measurement**. API failures do not count as service failures. Percentages use only known predictions and must be interpreted alongside sampling coverage.

Run the collector manually from the repository root with `node scripts/capture-history.mjs`. Historical files start empty until a successful collection.

## Language policy

All repository documentation, UI labels, developer-facing messages, and new code comments should be written in English. External API field names and official Spanish identifiers must remain unchanged where required for compatibility.
