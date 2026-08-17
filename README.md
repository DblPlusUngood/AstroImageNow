# AstroImageNow

A polished personal dashboard using the official Astrospheric Data API v2.

## Fastest use

Open `index.html` in a modern browser.

On first launch:
1. Paste your Astrospheric API key.
2. Bellaire, Michigan is preloaded as the default location.
3. Press **Save & open dashboard**.

The API key is stored in that browser's local storage on that device. It is not embedded in the source files.

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

## Scoring philosophy

This is an app-derived astrophotography assessment, not an official Astrospheric rating. Cloud and transparency are weighted most heavily. Seeing is intentionally weighted less for a wide-field / first-light workflow. Wind, dew margin, and Moon are contextual penalties.

## Security

This build is intended for private personal devices. For public/shared hosting, do not use browser storage for the API key; move API calls behind a server-side proxy and keep the key as a server secret.


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

## v1.8 — Multi-night planning (draft)

- Finalizes the app name as **AstroImageNow** without a question mark.
- Requests up to 168 forecast hours and displays every upcoming night currently available from Astrospheric, up to seven nights.
- Adds a compact, selectable night outlook; selecting a future night updates the existing detailed score, best window, metrics, timeline, Moon, dew, and recommendation views.
- Uses the existing v1.7 forecast scoring weights, thresholds, and hard limiters without modification.
- Migrates the existing single location into a saved-location profile automatically.
- Adds multiple saved locations with a fast dashboard location switcher.
- Stores a separate Yellow (48+), Lime (65+), or Green (80+) alert threshold for each location.
- Displays each location's **Bortle class** as neutral reference information, without an "estimated" qualifier or forecast-status coloring.
- Establishes the local data needed for later push notifications, travel comparisons, and target/filter guidance.
