# Observatory — Zaragoza

An independent public-data dashboard for Zaragoza, with a responsive English-language interface and six sections: **Overview, Buses, Bizi, Incidents, History and Methodology**.

**Website:** https://qarlosalberto.github.io/observatory/

## Recorded-first experience

The website displays the **most recent precomputed observation by default**, not a new live fetch. This avoids forcing every visitor to wait for dozens of upstream requests. The fast initial data file is `site/history/latest.json`.

A draggable slider on the service map reads `site/history/timeline.json` and displays the measurements actually recorded at each timestamp. Spatial observations are retained for **seven days**. Individual frames represent the sampled bus stops at that capture time; they do **not** reconstruct unobserved stops or interpolate arrival times. The date and coverage of each data source are shown explicitly.

The **Fetch live data** button is an optional, on-demand action. It is never automatically invoked on initial page load. Selecting the latest capture returns to the saved measurements.

The incident browser loads `site/history/incidents.json` by default. Users can explicitly request a live refresh. Municipal notice dates indicate published/planned start and end dates, not verified resolution timestamps.

## Data collection

The `.github/workflows/history.yml` GitHub Actions workflow attempts collection every 30 minutes (at minutes 07 and 37 UTC), and can also be run manually. Its collector, `scripts/capture-history.mjs`, creates:

| Data file | Purpose | Retention |
| --- | --- | --- |
| `site/history/latest.json` | Latest successful available bus/Bizi capture for fast page loading | Latest per source, preserving original capture time |
| `site/history/timeline.json` | Actual station and sampled stop positions/values per recording | Up to 7 days / 336 frames |
| `site/history/snapshots.json` | Network-level historical coverage and aggregates | Up to 90 days |
| `site/history/bus-details.json` | Cumulative per-route and per-stop observation counts | Cumulative |
| `site/history/incidents.json` | Most recently retrieved municipal street notices | Latest completed capture |

Scheduled collection requires `GITHUB_TOKEN` permission to write to `main` and GitHub Pages deployment permissions. The collection workflow **publishes the generated site directly**, because commits pushed using `GITHUB_TOKEN` do not trigger a subsequent GitHub Actions push workflow.

Scheduled jobs may run late or be suspended. All initially empty files remain empty until the first successful capture; missing readings must not be presented as zeros or as fresh live data.

### Source definitions and interpretation

- **Bizi:** GBFS station information and status, or the municipal station API for on-demand fallback. Missing out-of-service counts are unknown, not zero.
- **Buses:** Zaragoza City Council's catalogue includes approximately 983 stops. Scheduled capture rotates through **up to 180 stops per run** in rate-limited batches; the stored cursor resumes after the last sampled stop, even if a scheduled invocation is missed. Avanza operator responses retain **every individually announced vehicle** (with route, destination, vehicle and ETA), verified against operator vehicle markers, with municipal API fallback. The dashboard distinguishes verified arrivals, no-prediction replies, errors, and never-sampled stops. It does **not** claim a simultaneous network-wide census, current predictions for unqueried stops, or timetable punctuality.
- **Incidents:** Zaragoza City Council's public-space incidence API. Categories include water outages, traffic closures and major disruptions. Date filters are based on published intended intervals, not confirmed completion. The original official notice is linked where its URL is available.

The **History** section groups Bizi, bus and municipal-incident trends. Station-level Bizi frames support counts of stations with **0–4** bikes or **0–1** bikes, recurring shortages, and *interval-censored* episode durations. An episode must have consecutive readings showing a healthy count, then a shortage or disabled count, then recovery; gaps over 90 minutes or missing readings break the chain. Reported times are midpoints of bounded observation intervals, **not** actual bicycle repair times: a disabled bike may be moved or removed. Right-censored and left-censored episodes are excluded from completed-duration averages. Bus charts show sampled stop coverage, individual vehicle predictions, unknown results and API errors without treating missing observations as zero. Route/stop rankings require at least 20 known predictions.

## Run locally

```sh
npm install
python3 -m http.server 4173 --directory site
npm test
npm run test:e2e
```

To capture an actual snapshot from the local checkout (requires connectivity to the external APIs):

```sh
node scripts/capture-history.mjs
```

The `.github/workflows/ci-pages.yml` workflow runs unit and end-to-end browser tests and deploys code changes to GitHub Pages only after both succeed. In the repository settings, use **Settings → Pages → Build and deployment → GitHub Actions**.

## Language policy

Repository documentation, UI labels, accessibility strings, developer-facing errors, test descriptions and new code comments are written in **English**. Official external API field names, identifier patterns, and Spanish input strings must remain unchanged wherever necessary for source compatibility.

Avanza arrivals use `gps.avanzabus.com/index.php/zaragoza/fRefrescaEmpresaExternos` with POST fields `poste` and `coche=0`. Missing or malformed replies remain missing observations.

**Counting bus predictions:** one ETA is recorded for each stop-level arrival announcement. The same Avanza vehicle may be observed at more than one sampled stop. The Buses cards distinguish total ETA entries from distinct operator vehicle IDs; municipal fallback records may not include vehicle identity. Neither figure is a census of all buses circulating in Zaragoza.
