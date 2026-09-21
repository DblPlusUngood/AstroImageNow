# AstroImageNow

A polished personal dashboard using the official Astrospheric Data API v2.

## Fastest use

Open [AstroImageNow](https://dblplusungood.github.io/AstroImageNow/) in a modern browser. For local development, serve the folder over localhost.

On first launch:
1. Paste your Astrospheric API key.
2. Choose **Foreca with Open-Meteo backup**, **Foreca only**, or **Open-Meteo only**.
3. Paste a Foreca token when using a Foreca option. The backup mode works with Open-Meteo until a token is added.
4. Add your observing locations. First-use setup starts with a blank **Home** profile; no address or coordinates are shipped. Existing saved locations are preserved.
5. Press **Save & open dashboard**.

The API credentials and weather-source choice are stored in that browser's local storage on that device. They are not embedded in the source files.

## Install like an app / PWA

For a true Home Screen / standalone app experience, serve this folder over HTTPS (or localhost) using any static host. The included manifest and service worker make it installable.

## What it does

- Direct browser POST calls to official Astrospheric v2 endpoints
- Cloud, transparency, seeing, temperature, dew point, and wind
- Moon conditions
- Green → yellow → red visual scoring
- GO / MARGINAL / NO-GO recommendation
- Best imaging window
- Hour-by-hour condition bands
- Explainable component scores
- API credit display
- User-selectable Foreca or Open-Meteo supplemental weather, with an optional automatic backup
- Compact current temperature, selected-night low, precipitation, visibility, fog/storm, gust, and air-quality context
- Educational condition explanations behind small information buttons
- Target-aware filter guidance and concise preparation reminders
- A searchable 31-object deep-sky catalog with target/date/site planning, Moon geometry, multi-rig framing, and local saved assignments

## Scoring philosophy

This is an app-derived astrophotography assessment, not an official Astrospheric rating. Cloud and transparency are weighted most heavily. Seeing has a modest fixed weight in this general overview. Wind and dew margin also contribute. The score is independent of target, telescope, camera, filter and Moon; those choices affect Imaging Targets instead. When seeing/transparency or other optional components are absent, available weights are normalized and the score receives an ≈ marker. Cloud and sustained wind are required; hazards still override the setup verdict.

## Security

This build is intended for private personal devices. For public/shared hosting, do not use browser storage for API credentials; move authenticated API calls behind a server-side proxy and keep credentials as server secrets.

A normal refresh requests the active site and the fixed Home/JGAP comparison pair. The browser sends those profiles’ exact coordinates to Astrospheric for the astronomy forecast. Supplemental weather requests use coordinates rounded to two decimal places. The Astrospheric key is sent only to Astrospheric; the Foreca token is sent only to Foreca. Weather data is provided by [Foreca](https://www.foreca.com/) or [Open-Meteo](https://open-meteo.com/), according to the selected source. Open-Meteo air-quality data incorporates Copernicus Atmosphere Monitoring Service (CAMS) forecasts.


## v1.14 — A night plan and Travel Site Comparison

The normal **Refresh** updates the saved **Home + JGAP** profiles together. Each site uses its own provider response. Changing dates, targets, rigs or filters recalculates locally; switching to a freshly cached paired site also avoids a repeat request. The comparison recognizes existing profile IDs or Home/JGAP names and never supplies or replaces personal coordinates. Ambiguous/missing profiles need attention in Settings.

**Imaging Targets** now gives a concise **Plan for Home / Consider JGAP / Neither site for this plan** recommendation, or leaves the comparison undecided when forecasts are stale or incomplete. It offers a primary target and one useful alternative, with rig, filter and window. **Use this plan** selects the recommended site and setup; saving a planned target or logging a session remains an explicit separate action. Existing mode and rig constraints, planned-filter ownership labels, and this device's journal history still apply.

Home wins when opportunities are comparable. A trip needs a meaningful target-window or dark-sky benefit; bright planets do not favor JGAP merely for its Bortle class. Automatic plans require at least an hour for deep sky or twenty minutes for lunar/planetary work and exclude mosaics, unknown deep-sky framing, and unsuitable selected filters. The **≈** cue remains on estimates. The top conditions score stays independent of these choices.

Source credit is a quiet linked line beside the weather. **Forecast details** at the bottom contains provider retrieval times, supporting weather measurements, model/credits, diagnostics and the update check. Meaningful hazards and stale/missing coverage remain visible.

See the [v1.14 implementation and validation record](docs/releases/2026-09-21-v1.14-travel-night-plan.md). A selectable second travel site, alternate-site research, journal synchronization and remote conversational AI remain future work.

## v1.13 — A full week, Imaging Targets and an observing journal (original release)

Every night with sufficient weather coverage has a score on the same 0–100 scale. **≈** identifies an estimate that uses available data, usually Foreca cloud/wind/dew beyond Astrospheric's detailed horizon. Missing seeing/transparency stay unknown. The general conditions score no longer includes Moon, and never changes with a rig, filter or subject choice. Local Moon geometry now supplies the whole week without extra Moon API requests.

**Imaging Targets** carries subtle red target rings and offers up to three explained target/rig/filter/window suggestions. Choose **Best fit for this night**, **Deep sky**, **Moon & planets**, or **Use my selected rig & mode**. Manual rig, mode and filter choices select that last policy. These are local, deterministic planning rules using visibility, forecast coverage and hazards, seeing/transparency, framing, Moon, Bortle context and this device's logged sessions. They are not remote AI output or predictions of image quality. Automatic choices compare Z73/ASI533 and provisional UltraCat/ASI533 deep-sky setups with the native C8/Canon planetary setup; other configurations remain selectable. Shared hardware represents alternatives.

Filters are **Unfiltered**, owned **L-Pro**, planned **L-Ultimate**, and proposed **UV/IR-cut**. Automatic choices exclude planned/proposed filters until **Explore planned filters** is enabled. Manual selections always remain available, with short target/camera advice and an adapter-path caveat where needed.

Use **Log a session** under a target to record date, site, rig, filter, attempted/captured/revisit outcome, optional integration/video duration, and notes. Entries can be edited, removed with immediate undo, and exported as a JSON backup. They remain on this device/browser, work offline, and are preserved if a saved site is deleted. No entries means **unknown history**, not never photographed. A revisit adds a modest preference; it cannot override hazardous weather or inaccessible geometry. Backup import, image references, synchronized journal reconciliation, time-sensitive events and a conversational AI layer remain future work.

See the [v1.13 release record](docs/releases/2026-09-19-v1.13-week-targets-journal.md) and [calculation notes](data/README.md).

## v1.12 — Rigs and actual imaging opportunities (original release)

The **Plan targets** section now offers **Z73**, **C8 / NexStar 8SE** and **UltraCat 56**. C8 has **native**, **f/6.3 reducer**, and **Barlow** configurations, with 2×/3× inside the Barlow choice. Choose the ASI533MC Pro or Canon R6 Mark II to update field of view and image scale. UltraCat initially uses a provisional shared ASI533 baseline; physical setup and camera adapters still need verification.

**Deep sky** retains the 31-object catalog. **Moon & planets** computes moving positions for Moon, Venus, Mars, Jupiter and Saturn and uses seeing-oriented conditions and civil twilight. The dashboard score remains the wide-field overview.

Each target now distinguishes its geometric window from its **forecast-supported window**, checking actual hourly coverage, cloud, transparency/seeing, wind, rain/storm/fog/gust hazards and Moon/dew caution. Missing/stale data cannot create a favorable interval. **Refresh site comparison** loads independent forecasts for the other saved locations, keeping the active dashboard location unchanged.

Graphite surfaces, subtle glass panels and papaya/rust accents carry forward the local Card Studio v0.3 design, with semantic condition colors preserved. See the [v1.12 release and continuation record](docs/releases/2026-09-19-v1.12-multi-rig-opportunities.md) and [calculation notes](data/README.md). Personal capture history, event-aware ranking and automatic choice across rigs remain planned follow-ons.

## v1.11 — Target, date and site planning (original release)

Tap **Plan targets** near the top, or scroll to **What could I image?** The planner follows the selected forecast night and observing site. Choose a different date to explore another season; **Follow selected night** reconnects it to the forecast cards.

- Searches 31 curated deep-sky targets by common name or catalog designation. The versioned [OpenNGC seed and method notes](data/README.md) include licenses, source provenance, explicit J2000 coordinate units, and catalog-size limitations.
- Calculates altitude, darkness and Moon geometry locally at 10-minute intervals, with daylight-saving-aware local nights. Astronomy Engine is bundled for offline use and also supplies the dashboard's solar geometry.
- Shows a useful window, highest altitude in darkness, target/Moon altitude chart, illumination and nearest separation while the Moon is up. Windows can favor a later Moon-free interval. These remain geometric windows; the separate night-level weather warning still governs setup.
- Uses the nominal Z73/Flat73A/ASI533MC Pro field: **1.51° × 1.51°**, about **1.80″/pixel**. Oversized targets, tiny targets and uncertain nebula complexes receive explicit framing cautions. Full M31 and M45 require cropping or a mosaic with this combination.
- Offers the confirmed owned L-Pro or an unfiltered baseline. The rig reflects the installed Elite Drawer OAG and still-unverified optical spacing. Bortle remains site context, not a nightly measurement. The C8's lunar/planetary use is reserved for a separate planner.
- Saves target/date/site/rig/filter/altitude assignments locally. There is no cross-device synchronization, automatic telescope command, or calendar write. Planner state uses a separate storage key and preserves forecast credentials and site profiles.
- Geometry works beyond the weather horizon and after the updated app shell has been cached offline. Weather absence, incomplete data and stale saved forecasts remain explicit.

See the [v1.11 release record](docs/releases/2026-09-19-v1.11-target-planning.md) for validation and the bounded next increment.

## v1.10 — Foreca and forecast reliability (original release)

- Uses Foreca Weather API at `weatherapi.foreca.net/api/v1`. The older `pfa.foreca.com` host rejects current Weather API tokens. Current and hourly calls request the full dataset. Precipitation is converted from millimeters to inches before hazard evaluation.
- Foreca hourly weather remains usable if optional current conditions or air quality fail. Foreca is primary in the default mode; a failure explicitly identifies any Open-Meteo backup. Foreca-only mode never silently switches sources.
- Forecast and weather requests settle independently, have 12-second timeouts, and cancel on a new refresh/site selection. Invalid or missing values remain unknown. Failed Moon data cannot inflate the score.
- Up to seven nights are built from actual forecast timestamps. Later nights without astronomy detail are labeled **WEATHER ONLY**. The Near term / Planning / Watch labels indicate increasing forecast distance, not a calibrated probability.
- The headline and night-card astronomy scores use the same capped hourly values. Significant weather hazards override the operational verdict. Incomplete weather prevents a weather go-ahead.
- Best-window elapsed duration stops at the last dark hourly sample; the app does not extend it into an unverified hour. Moon context remains one mid-night snapshot, not an hourly Moon/target model.
- Retrieval timestamps, provider coverage, model time, credits, and sanitized errors are available in diagnostics. Credentials and location coordinates are excluded.
- One last-used site/source forecast snapshot is saved locally. Failed refreshes and snapshots restored on reload are marked **STALE**; data older than three hours is also marked stale on render. This preserves reference data without presenting it as a fresh setup recommendation.
- Selected nights persist by local calendar date. Existing API keys, source choices, and sites migrate without being replaced. The current personal configuration is Home and JGAP, with Home active; it remains in the user's browser, not this repository.
- An update notice and **Check for app update** / **Apply update** controls preserve settings. The service worker caches only this app's shell and removes only this app's obsolete caches.

### Verification and development

Requires Node.js 22 or later; no dependency installation is needed.

```sh
node --test tests/*.test.js
node --check app.js
node --check providers.js
node --check planner.js
node --check planner-ui.js
node --check sw.js
node tests/visual-server.js
```

Open `http://127.0.0.1:4173/visual-test` for synthetic provider data. The fixture uses dummy credentials and overwrites settings **only on that localhost origin**. Service-worker registration is stubbed in the fixture; service-worker behavior is separately covered by tests. Open `/` for a normal local installation with its own settings.

The current suite has 81 tests. Rebuilding the catalog additionally requires Python 3 (`python3 scripts/build-catalog.py`); normal app use and Node tests do not.

v1.11.1 fixes offline reloads from the **Plan targets** section anchor. The worker strips only the URL fragment before looking up the same cached document; provider and unrelated-site requests still bypass it.

### Installed-app update

An existing v1.9 installation does not yet have the new update controls. Close AstroImageNow and any Safari tabs for the app, open it online to let the new version download, then close and reopen it if the footer still shows v1.9. Once on v1.10, use **Check for app update** and **Apply update** when offered. Avoid deleting the app or clearing website data, which can remove saved settings.

Settings are device/browser-local. Saving a new token or Home/JGAP on desktop does not synchronize them to the iPhone Home Screen app. Enter the token in the phone's password field if it still has the old token.

## v1.3 — API response parser corrected

Astrospheric v2 returns forecast values inside `HourlyForecast[]`. Each hourly
record contains the requested variables directly, such as `Cloud.ActualValue`,
`Seeing.ActualValue`, and `Temperature.ActualValue`.

Earlier builds incorrectly expected separate top-level arrays. v1.3 now parses
the actual API response shape and merges optional variable calls by
`UTCForecastHour`.

## v1.4 — Decision-quality night scoring

- Scores only astronomical darkness (Sun altitude <= -18 degrees).
- Falls back to nautical darkness (<= -12 degrees) when necessary and labels it.
- Solar altitude is calculated locally, so this adds zero API credits.
- Best imaging window is selected only from dark hours.
- Hard limiters prevent heavy cloud, strong wind, very poor transparency, or severe dew risk from being hidden by a good average.
- Seeing remains intentionally less decisive for wide-field / first-light imaging.

## v1.5 — Install candidate

- Fixes the duplicate-night timeline bug.
- The dashboard now selects exactly one contiguous dark period:
  - the current night if the Sun is already below the darkness threshold, or
  - the next upcoming night otherwise.
- It will no longer concatenate dark hours from multiple forecast nights.
- This build is intended to be the first deployment/install candidate.

## v1.6 — App identity and Home Screen icon

- Changes the visible, browser, Apple web-app, and PWA name to **AstroImageNow?**.
- Adds a custom dark-sky telescope icon with green, yellow, and red status cues.
- Adds dedicated 180 px, 192 px, and 512 px PNG icons for Apple and PWA installs.
- Updates the service-worker cache so existing installations receive the new branding.
- Preserves the complete v1.5 forecast, night-selection, and scoring implementation.

## v1.7 — iPhone layout corrections

- Respects the iPhone top and bottom safe areas in standalone Home Screen mode.
- Stacks the app title and controls on narrow screens so they cannot collide.
- Locks the score ring to a true circle even when the mobile layout is compressed.
- Advances the service-worker cache so installed copies receive the corrected layout.
- Makes no changes to forecast retrieval, night selection, or scoring.

## v1.8 — Multi-night planning

- Finalizes the app name as **AstroImageNow** without a question mark.
- Requests up to 168 forecast hours and displays every upcoming night currently available from Astrospheric, up to seven nights.
- Adds a compact, selectable night outlook; selecting a future night updates the existing detailed score, best window, metrics, timeline, Moon, dew, and recommendation views.
- Uses the existing v1.7 forecast scoring weights, thresholds, and hard limiters without modification.
- Migrates the existing single location into a saved-location profile automatically.
- Adds multiple saved locations with a fast dashboard location switcher.
- Stores a separate Yellow (48+), Lime (65+), or Green (80+) alert threshold for each location.
- Displays each location's **Bortle class** as neutral reference information, without an "estimated" qualifier or forecast-status coloring.
- Establishes the local data needed for later push notifications, travel comparisons, and target/filter guidance.

## v1.9 — Practical session planning

- Preserves all v1.8 forecast scoring weights, thresholds, hard limiters, and night-selection behavior.
- Adds a compact weather strip with current temperature, selected-night low, precipitation probability, and meaningful fog, storm, visibility, gust, smoke, or air-quality warnings.
- Adds an explicit weather-source setting: Foreca with Open-Meteo backup, Foreca only, or Open-Meteo only.
- Normalizes both providers into one internal weather model; supplemental weather never changes the preserved Astrospheric astronomy score.
- Rounds supplemental-weather coordinates to two decimal places and keeps provider credentials in browser-local settings only.
- Keeps general-weather visibility secondary to Astrospheric transparency and shows it mainly as supporting diagnostic context.
- Adds focused information dialogs for Cloud, Transparency, Seeing, Wind, Moon, Dew margin, Bortle class, and visibility.
- Adds a session target selector with generic filter guidance for emission, broadband, reflection/dust, and equipment-test plans.
- Adds concise clothing, dew-control, precipitation, visibility, and wind preparation reminders.
- Keeps Bortle as neutral per-location metadata. Astrospheric's documented v2 forecast variables do not include Bortle, and v1.9 does not depend on an undocumented light-pollution service.

v1.11.2 makes worker installation fetch fresh shell assets, preventing a rapid update from copying older files out of the browser HTTP cache.
