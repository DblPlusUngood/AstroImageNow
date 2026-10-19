# AstroImageNow API and incomplete-weather diagnosis — October 18, 2026

Status: v1.14.1 release candidate passed local verification; Jason authorized commit and deployment on October 19, 2026. Deployment results will be recorded in the release pull request. Diagnosis began on October 18 in America/New_York; network timestamps below are UTC on October 19.

## Result

The real Chrome installation successfully retrieved current Astrospheric and Foreca forecasts. CHECK WEATHER was caused by the full-night weather coverage calculation counting elapsed hours that Foreca no longer returns. It was not caused by a parser failure, rejected real credentials, stale real astronomy data, or a provider response served by the PWA cache.

### Live evidence

- Chrome profile: Jason (++Ungood), deployed app `https://dblplusungood.github.io/AstroImageNow/`, version 1.14.0.
- At 03:22:55 UTC, four normal paired-site Astrospheric GetForecastData POSTs returned HTTP 200. Network showed transferred response bytes and `Cf-Cache-Status: DYNAMIC`; the preceding CORS preflights returned 204. The existing worker bypasses these external POSTs.
- The successful response had `HourlyForecast[]`, `UTCForecastHour`, `HourOffset`, `ModelTime: "2026101818"`, `APICreditCostOfCall: 15`, and `APICreditsRemaining`. This is compatible with the existing parser. Network Preview was inspected directly without opening request Payload or copying credentials.
- Current official v2 documentation at https://www.astrospheric.com/DynamicContent/api_info_v2 instead illustrates top-level per-variable arrays with `Value.ActualValue`. That documentation/live-response discrepancy is real, but is not evidence that the working live parser should be replaced. No provider-adapter change was made.
- Foreca hourly, current, and air-quality requests succeeded for both saved sites. Home hourly coverage was 168 entries, 2026-10-19 03:00 UTC through 2026-10-26 02:00 UTC. Both `astronomyStale` and `weatherStale` were false after refresh.
- The Home dashboard selected darkness 01:00–10:00 UTC (9 PM–6 AM local), ten hourly samples. Foreca supplied eight matching samples starting at 03:00 UTC (11 PM). All eight contained valid precipitation probability, precipitation, gust, visibility, and thunder probability. The missing two samples were already elapsed.
- Replaying the captured Foreca response through the original calculation produced `complete: false`. Evaluating the current/remaining eight samples produced `complete: true`. The original real dashboard showed score 92 and CHECK WEATHER. The isolated browser replay uses synthetic astronomy, yielding score 91; its score is not a live observation.
- A separate controlled fallback test passed an empty Foreca token to the existing fallback function, without changing saved settings. Live Open-Meteo at the rounded Home location returned 192 weather hours and 120 air-quality hours. This verifies fallback behavior; it does not imply a real Foreca account failure. Existing regressions also exercise HTTP 401 fallback without forwarding the token and Foreca-only refusal to switch.
- Chrome console inspection found a legacy PWA meta-tag deprecation warning, with no observed app exception explaining CHECK WEATHER.

## Misleading localhost state found and excluded

The existing in-app-browser origin `http://127.0.0.1:4173/` held the visual fixture's dummy key and token and an 82-hour synthetic astronomy snapshot fetched September 20, ending September 23. The real root did not load the mock script, so its automatic live calls using those dummy credentials failed: Astrospheric 403 (`API Key incorrect or not entitled to programatic access`) and Foreca 401, followed by successful Open-Meteo fallback.

These failures are test-origin contamination, not evidence about Jason's real accounts. Both stored values were compared to the known fixture constants without displaying real secrets. The deployed in-app-browser origin had no settings; the genuine configured session was in native Chrome. In the contaminated local session, current cloud/wind estimates came from Open-Meteo, while the old model metadata came from the synthetic snapshot. The genuine Chrome astronomy measurements were fresh.

`/visual-test` and `/` share localStorage when hosted on the same origin. Future visual tests should use a separate port/profile; README now explains this. Existing test-origin storage was not cleared or migrated.

## Small fix

`weatherSummaryForRows` accepts an optional decision time. Dashboard callers pass the current time, excluding completed UTC hourly intervals while retaining the hour currently in progress. Missing current/future samples or hazard fields still make coverage incomplete; current hazards still override the score. Historical and target-interval callers that omit the time retain their explicit interval behavior.

Version and PWA cache advance to 1.14.1. The score weights, whole-night astronomy score/window, credentials, site configuration, providers, and planner algorithms are unchanged. This patch addresses weather completeness; it does not redesign elapsed-time presentation of the whole-night imaging window.

## Validation

- Baseline: 97 tests passed before edits.
- Five added regressions: elapsed-hour exclusion; missing current/middle/final future hour; missing hazard fields; current-hour versus elapsed storms; future-night and entirely elapsed-night behavior.
- Canonical `node --test tests/*.test.js`: 102 passed, 0 failed.
- `node --check` passed for app.js, providers.js, planner.js, planner-ui.js, sw.js. `git diff --check` passed.
- Captured real Foreca response replay confirmed old false-incomplete → corrected complete.
- Native Chrome and Safari both reproduced CHECK WEATHER in the isolated 1.14.0 replay and showed GO / No major hazard after applying the 1.14.1 local update. Replay is explicitly labeled and uses captured weather plus synthetic astronomy; no real credentials were copied to it.
- Chromium PWA: existing controller stayed on 1.14.0 while 1.14.1 waited; both caches existed until Apply update. After reload only `astro-image-now-v1.14.1` remained, with 26 shell assets.
- Settings, planner, and journal storage compared equal before update and after offline recovery in the isolated replay. This validates the mechanism, not physical-iPhone behavior or cross-device synchronization.
- Cached app.js SHA-256 matched canonical `535a7da9d66f517a38289b88a6343152cb4d44d8d853c1a8bb866295646505ad`; cached unchanged providers.js matched `240f2f7b629ddc0a77879c4e260adb16b0ddbc20166195fa2693b20ce374a4c6`.
- Offline reopening at `#targetPlanner` restored the cached shell and showed STALE for astronomy/weather. Online refresh returned GO in the replay. No browser error logs were captured during that validation.
- Chrome reported `navigator.onLine=false` despite successful network requests and no throttling. The disposable harness was changed to probe actual loopback connectivity instead of trusting that heuristic. No production code or Chrome preference changed for this harness issue.

## Git and rollback

Canonical repo: `/Users/jdretzke/CodexWork/GitHub/AstroImageNow`.
Initial branch: `main`. Remote: `https://github.com/DblPlusUngood/AstroImageNow.git`.
Initial HEAD: `5550fc9ae29cc7a591c0d4d5d0c1387b4683efb8`, “Merge v1.14 travel forecasts and night planning,” September 21, 2026.
Initial tracked tree was clean. Existing untracked `.DS_Store` and `design/` artifacts remain untouched.

Work branch: `codex/diagnose-weather-coverage`.
Rollback branch: `rollback/2026-10-18-api-diagnostic`.
Checksummed archive of all 60 pre-edit tracked/untracked nonignored files: `/Users/jdretzke/CodexWork/!Quarantine!/astroimagenow-diagnostic-2026-10-18/working-files-before.tar.gz`, with manifest and original git status alongside it.

For rollback after reviewing any subsequent edits, restore only this task's modified tracked app.js, sw.js, and tests/service-worker.test.js from the rollback branch. README changes and newly added test/record files can be reverted separately. Do not reset/clean the entire checkout or remove the existing design artifacts.

## Release boundary

The initial diagnostic stopped before publishing. After reviewing the diagnosis, Jason authorized committing and deploying the verified fix on October 19, 2026. The release pull request records deployment status and live verification. Installed-iPhone/PWA verification remains a post-deployment user/device check.

An initial automatic write review rejected the test-first workflow because the new regression failed on the old code. The fix was then tested in an isolated copy; all 102 tests and syntax checks passed, and a fresh automatic review approved copying only those verified files. No user security warning was bypassed; raw network responses were inspected via built-in DevTools UI when console pasting remained blocked.
