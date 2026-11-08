# Separating My Places and Observatory

## Observatory
- Independent public website in `site/`: Leaflet map, bus arrivals by route, Bizi availability, and Chart.js statistics.
- `site/data.js`: API parsers and statistical calculations separated from the UI.
- No Firebase, private data, or authentication.
- `tests/unit.test.mjs`: unit tests for arrival parsing and statistics.
- `tests/observatory.e2e.spec.mjs`: browser tests including mobile layouts.
- `.github/workflows/ci-pages.yml`: run tests before deploying `site/` to GitHub Pages.

## My Places
The `qarlosalberto/my-places` repository no longer includes the Services-specific button, panel, JavaScript, styles, or test integration. Map and List views, Firebase, photos, CSV, and PDF remain.

## Enabling GitHub Pages
In the new repository, open **Settings → Pages → Build and deployment → Source → GitHub Actions**. A workflow cannot enable an unconfigured Pages site with the default `GITHUB_TOKEN`. Verify successful test and deployment jobs in **Actions**.

## Interpretation
Metrics represent recorded samples, not comprehensive transit coverage. A predicted wait over 15 minutes does not establish a timetable delay, and missing out-of-service counts must not be interpreted as zero. History is persisted only when the collector runs and commits observations.
