# AstroImageNow repository and deployment assessment


> **Implementation update, September 19:** This document records the initial v1.9 assessment. Jason subsequently explicitly directed that Foreca be included and supplied a new token through the app. That decision supersedes the earlier proposed deferral below. The confirmed current-token failure and implemented first increment are recorded in [the v1.10 release record](../releases/2026-09-19-v1.10-foreca-reliability.md).

Date: 2026-09-19  
Status: assessment complete; proposed implementation increment, not yet approved or implemented.

## Recommendation

Retain the existing static application and strengthen its forecast reliability before expanding target planning. The current v1.9 already implements a useful part of the handoff. The highest-value first increment is consistent capped scoring, independent provider outcomes, honest freshness/unknown states, and diagnostics suitable for the installed iPhone app.

Jason clarified that the previous error was **Foreca not loading in the installed iPhone Home Screen app**. The affected provider is therefore identified by the user's report; the underlying Foreca failure mechanism remains undiagnosed. Desktop checks used Open-Meteo fallback without attempting Foreca, so they neither reproduce nor resolve that incident. Separate defects were reproduced with controlled inputs; they must not be presented as its proven cause.

## Source and scope

Read all sections 0–59 of [AstroImageNow_v3_Master_Handoff.md](https://drive.google.com/file/d/1C35QaRczkOwQPIO8K9HDl1qaIw9VKQR4/view). Drive metadata reports 64,945 bytes, text/markdown, modified 2026-09-19T17:14:47.551Z. The [editable master](https://docs.google.com/document/d/1J0b9fBHgg7p3upgk4mWg3hOSBqNTHGW68MRUWfUmO6Y/edit) remains the linked revision source; it was not independently compared with the Markdown. The Markdown is the specification assessed here.

Work performed: repository inspection, public GitHub deployment verification, live desktop browser observation, provider network inspection, official API documentation review, narrow-viewport inspection, syntax checks, and isolated Node probes against the unchanged application source.

No application code, saved provider settings, API credentials, external documents, deployments, or schedules were changed. This assessment is a local repository document, not a synchronized Drive update. No commit or tag was created during assessment.

## Verified baseline and rollback reference

| Item | Verified result |
| --- | --- |
| Canonical checkout | `/Users/jdretzke/CodexWork/GitHub/AstroImageNow` |
| Git remote | `https://github.com/DblPlusUngood/AstroImageNow.git` |
| Branch/upstream | `main` tracking `origin/main` |
| Initial worktree | Clean |
| Local HEAD and current GitHub main | `57131942eb488bbb0b3d536242707d78d414ff41` |
| Commit title | Release AstroImageNow v1.9 weather planning |
| Commit timestamp | 2026-08-16T23:40:27-04:00 |
| Previous commit | `886a7a1`, Commit V1.8 |
| Tags | None in the local repository |
| Pages deployment | ID `5938581752`, same full SHA, success at 2026-08-17T03:41:12Z |
| Public application | `https://dblplusungood.github.io/AstroImageNow/` |
| Service-worker cache constant | `astro-image-now-v1.9-release-1` |

Deployment evidence: [GitHub commit](https://github.com/DblPlusUngood/AstroImageNow/commit/57131942eb488bbb0b3d536242707d78d414ff41), [successful Pages job](https://github.com/DblPlusUngood/AstroImageNow/actions/runs/31991913313/job/95276917969).

Public HTTP downloads matched local files byte for byte:

| File | SHA-256 |
| --- | --- |
| app.js | `dfa2f52255d273c55309bd4aea97fa6d9f5a1e6a7fbb43174e78e772c7f67c10` |
| index.html | `495b688e0b391ad79f1e72877b62af012a9375e4e75ccd86ef4712fa51d9be83` |
| sw.js | `fc59f53e7a8647e375a21151b7de3d9d31d02dd0d02187ad48e9dc2b35be2517` |

Before implementation: recheck status and remote state, create a `codex/` branch and a named baseline reference to the verified commit. Preserve this deployment reference; do not overwrite or reconstruct the baseline.

## Current architecture

- **Static browser application:** nine tracked files, no framework, package manifest, build pipeline, backend, checked-in test suite, CI configuration, or license file.
- **app.js:** 1,354 lines containing settings migration, localStorage persistence, provider requests/parsing, Sun-altitude calculation, night grouping, scoring, weather interpretation, generic filter advice, DOM rendering, and event handlers. Pure helpers are already exported for Node use, which provides a practical regression-test entry point.
- **index.html:** 232 lines with the entire page and inline CSS. Contains setup, dashboard, compact metric cards, weather strip, selectable night outlook, hourly timeline, information dialogs, and generic session advice.
- **manifest.webmanifest and icons:** current name is AstroImageNow; standalone launch and install assets exist.
- **sw.js:** 17-line application-shell precache and cache-first GET handler. It does not automatically add API responses to the cache. Old-cache cleanup currently removes every differently named cache on the origin, rather than just this application's caches.
- **Persistence:** settings schema version 4, credentials, saved locations, selected location, target category, and location alert thresholds. No persisted forecasts, selected observing date, session plans, packing/startup/shutdown state, or target records.

Existing behavior worth preserving: single contiguous night detail, astronomical/nautical darkness distinction, familiar color and verdict language, saved locations, weather fallback, information controls, and mobile safe-area/CSS corrections. Location alert thresholds are stored configuration; they are not an implemented push notification service.

## Provider inventory and live observation

| Provider/capability | Current implementation | Observed result / limit |
| --- | --- | --- |
| Astrospheric forecast | Two sequential v2 `GetForecastData` POSTs; core Cloud/Seeing/Temperature, then Transparency/DewPoint/Wind; merge by `UTCForecastHour` | Both HTTP 200; actual `HourlyForecast[]` confirmed; 82 rows despite `ForecastLength:168` |
| Astrospheric Moon | One sequential v2 `Moon` POST at the middle hour of each available night | Three HTTP 200 responses; one lunar snapshot reused for every hour of each night |
| Astrospheric Sun | v2 `RiseSet`, Sun, Days 7 | HTTP 200; response saved for diagnostics but otherwise unused |
| Astrospheric location | v2 `IpLookup` on explicit location action | Present in source; not invoked in this assessment; IP-derived location, not device GPS |
| Open-Meteo weather | Eight-day current/hourly request, Fahrenheit/mph/inches, UTC; weather coordinates rounded to two decimals | HTTP 200; 192 hourly timestamps |
| Open-Meteo air quality | Five-day hourly CAMS-related request, merged by timestamp | HTTP 200; 120 hourly timestamps; optional failure is swallowed |
| Foreca | Current, hourly forecast, optional air quality; bearer token; selectable direct or fallback mode | Configured mode was Foreca with fallback, but no token was configured in this desktop session, so no Foreca request was made |
| Tempest / PurpleAir | Absent | Future integrations |
| Light pollution / target catalog | No provider integration | Manual Bortle, four generic target categories |

All inspected current Astrospheric request paths use v2. No current v1 Astrospheric path was found. The parser correctly consumes `HourlyForecast[]` and merges extra values by timestamp.

The official [Astrospheric v2 reference](https://www.astrospheric.com/DynamicContent/api_info_v2) documents the current endpoint and `ForecastLength` as a maximum, not a guarantee. Its forecast response example still shows separate variable arrays, which conflicts with the successful live response. Preserve the live `HourlyForecast[]` contract and sanitized regression fixtures rather than reverting to that example. The documented monthly credit model also conflicts with older example fields that mention daily remaining credits.

One instrumented refresh consumed 75 credits: two cached forecast calls at 15 each, three Moon calls at 10 each, and RiseSet at 15. The footer showed the remaining balance after the second forecast call, not the final balance after Moon and RiseSet. This is a specific diagnostic defect, not evidence of quota exhaustion.

## Forecast-error diagnosis

Jason identified the affected surface as the **installed iPhone Home Screen app** and then clarified: **the previous error was Foreca not loading**. Its precise error text, installed asset version, saved weather mode, and Foreca response status/body are not yet known.

In the existing desktop Chrome session, astronomy, Open-Meteo supplemental weather, Moon, and Sun calls all returned HTTP 200; CORS preflights returned 204. Foreca was not requested because no Foreca token was configured. These successful fallback checks are not a Foreca health check. Console messages about an asynchronous listener closing were observed, but no evidence ties them to the reported Foreca failure.

The desktop site displayed three selectable nights and successfully changed all night-specific details when the next night was selected. The 82 astronomy rows spanned 2026-09-19T15:00:00Z through 2026-09-23T00:00:00Z. The general weather response extended through 2026-09-26T23:00 UTC. Night cards are constructed only from astronomy rows, so the longer weather horizon cannot currently create additional cards.

The handoff reports that the Foreca Freemium account was deactivated or scheduled for deletion after inactivity. This is relevant historical context, not independently verified account status or proof of the earlier failure's cause. If direct Foreca diagnosis becomes necessary, inspect its saved mode and sanitized request failure first; distinguish account/token rejection, CORS/network failure, and response parsing from fallback behavior. Do not revive or pay for Foreca without demonstrating a useful advantage over Open-Meteo.

The desktop origin contained the v1.9 cache and one activated worker registration with no waiting worker. This does not establish which assets or worker control the phone's installed app. Worker version remains useful diagnostic context, but the user's clarification gives no basis to attribute the Foreca failure to PWA caching.

Do not clear the phone's storage as the first diagnostic: that would remove useful evidence and local configuration. First expose/check app build, worker/cache version, per-provider state, timestamps, and sanitized error information on that installation.

## Confirmed defects and other technical debt

### 1. Headline and night-card scores bypass hard limits

`overallForRow()` at app.js:654 applies the existing caps. `summaryForNight()` at app.js:717 instead recomputes an uncapped weighted score for a representative hour. Both the hero verdict and day cards use that score.

Controlled reproduction with 50% cloud and otherwise favorable inputs:

| Output | Result |
| --- | --- |
| Capped hourly/timeline score | 47 |
| Best-window score | 47 |
| Headline/day-card score | 82 |
| Headline verdict | GO |

This contradicts the handoff's preserved hard-limit intent. Correcting it does not require retuning the established 36/27/12/10/10/5 weights.

### 2. Optional or partial provider failure can block useful output

The refresh transaction at app.js:967 waits for all astronomy work before rendering. The unused Sun lookup is on its critical path. Controlled Node VM probes against unchanged source produced:

| Injected result | Render reached? | Consequence |
| --- | --- | --- |
| All healthy | Yes | Baseline |
| Core astronomy HTTP 503 | No | Successfully fetched weather is not assigned/rendered |
| Extra astronomy HTTP 503 | No | Successful core data and weather do not reach a usable dashboard |
| Sun RiseSet HTTP 503 | No | Both forecasts exist in state, but rendering is aborted |
| Weather HTTP 503 | Yes | Astronomy survives; useful existing behavior |
| Moon HTTP 503 | Yes | Render survives, but missing Moon is scored as 100 |

These probes instrumented render entry; they are not full browser failure tests and do not reproduce the historical iPhone error.

### 3. Unknown and stale data can look reassuring

- A weather response containing overlapping timestamps but no hazard measurements yields `No major hazard` with clear severity. This was reproduced with a minimal fixture.
- Missing Moon data returns a perfect Moon component score. Missing numeric forecast values also lack a consistent validity contract.
- The header's Updated timestamp is generated by rendering, including night selection, rather than by successful retrieval. Clicking another night made the displayed update time advance without fetching new weather.
- Failed refreshes can leave previous forecast/UI content without an explicit last-good/stale state. Requests have no timeout or request-generation guard.
- General-weather hazards do not affect the astronomy score by design. A future operational verdict must still prevent prominent GO advice from contradicting a storm warning; keep the astronomy score and operational safety decision distinct and explicit.

### 4. Night and Moon semantics need tightening

- The live UI labeled 11 PM–12 AM as a two-hour window because it counts two hourly samples. Define sample intervals and end boundaries before using these durations in target/session planning.
- A single midpoint Moon altitude is reused across the whole night; it cannot express lunar rise/set during the chosen imaging window or target separation.
- No astronomy forecast beyond its returned coverage means no later-night cards, despite available general weather. There are no Actionable/Planning/Watch labels or explicit partial-horizon semantics.
- Selected night is stored as an array index and resets on refresh; the selected observing date does not persist.

### 5. PWA diagnostics and persistence are incomplete

- There is no visible build/commit/worker version or controlled update prompt.
- Cache-first shell behavior and normal worker waiting can keep an installed session on older code. That possibility is not a diagnosis of the phone's failure.
- Cache cleanup should target the AstroImageNow prefix, because Cache Storage is shared by origin, including other GitHub Pages projects on the same hostname.
- The shell can load offline, but forecast/session data and field workflows are not persisted.
- A 390×844 desktop Chrome viewport measured document width 390 and score ring 68×68, with no page-wide horizontal overflow. Real iPhone safe-area behavior, standalone lifecycle, background/resume, and upgrade behavior remain untested.

### 6. Target, equipment, and security foundations remain future work

Generic filter guidance is not inventory-aware and can suggest a dual-band filter without verifying ownership. No target catalog, coordinate engine for targets, rig data model, FOV matching, session workflow, or ChatGPT state export exists.

Credentials remain browser-local and are sent to their intended providers by the current code. Existing source inspection found no embedded production key. This was not a complete historical secret audit or an approval of a multi-user/public credential architecture. Exact home coordinates and credentials must be excluded from any shared diagnostics or future summary export.

## Reconciliation with the handoff

| Handoff topic | Actual state and decision |
| --- | --- |
| Establish multi-night outlook | Already present since v1.8; extend coverage and meaning rather than rebuild |
| Normalize providers | Weather already partially normalized into an Open-Meteo-shaped object; astronomy and provider status remain separate and inconsistent |
| Audit v2 migration | Current paths already v2; live parser is correct despite contradictory reference example |
| Diagnose forecast error | User identifies prior Foreca loading failure on installed iPhone; desktop Open-Meteo fallback healthy; Foreca failure mechanism unverified |
| Preserve scoring | Preserve weights/thresholds; fix demonstrated bypass of existing caps |
| Mobile safe areas / circular ring | Existing CSS handles these; narrow desktop check passes, installed iPhone still required |
| Bortle estimate with provenance | Current manual field deliberately uses plain Bortle label; v3 requires source/estimate semantics |
| Owned equipment and target-aware filters | Current advice uses categories only; reconcile inventory before encoding ownership or compatibility |
| First session includes targets and week outlook | Too broad as the first implementation increment given confirmed reliability defects; stage those after the trust foundation |

Illustrative target/rig examples in the handoff are product examples, not verified catalog/framing facts. Recompute FOV and reconcile the authoritative equipment record before converting them into recommendations.

## Proposed first implementation increment

**Name: Forecast reliability and trustworthy status.** Keep the static deployment and current dashboard structure.

1. Establish the baseline branch/reference and a small Node regression harness using existing exported functions. Add tests for the reproduced defects and successful partial-provider behavior.
2. Make the headline and day cards derive their score from the selected window's capped hourly scores. Use the existing best-window mean as the proposed aggregation; document that correction from the current uncapped midpoint. Keep weights, thresholds, and cap values unchanged.
3. Introduce a compact provider result contract: provider, status, requested site, fetched time, valid coverage, model time when available, normalized data, sanitized error, and credit metadata. Explicitly distinguish available, partial, failed, stale, and unknown.
4. Remove the unused RiseSet call from the rendering dependency; allow weather, core astronomy, extra astronomy, and Moon to settle independently. Validate inputs/units/coverage and render usable partial data without manufacturing a complete score. Add bounded request timeouts and protect against stale requests overwriting a newer site request.
5. Track actual retrieval times and last-good state; expose calm provider-specific failures. Missing hazard measurements must not become an affirmative all-clear. Missing lunar data must remain unknown.
6. Add a compact diagnostics view with app build, worker/cache state, provider outcomes, coverage, and credits. Redact keys/tokens and omit exact home coordinates from any copied diagnostic.
7. Make worker updates discoverable and controlled, scope cache deletion to this app, and preserve existing settings during upgrade. Do not force-reload an active session.

Expected application touch points: app.js or a small extracted provider/state module, index.html diagnostics/status UI, sw.js, README, and focused tests. If a new module is introduced, include it in the app-shell cache. A framework migration or backend is unnecessary for this increment.

Acceptance checks:

- The 50%-cloud fixture cannot produce GO/82 when its capped score is 47; headline, cards, and timeline agree on score semantics.
- Known-good hourly scores retain their existing weights/thresholds.
- Weather remains visible if astronomy fails; astronomy remains visible if weather fails; Moon failure and Sun-service failure cannot abort otherwise useful output.
- Foreca failure in fallback mode visibly identifies the failed source and successful Open-Meteo replacement; Foreca-only mode gives a specific unavailable state without suppressing astronomy. Cover both with controlled tests without requiring a revived Foreca account.
- Malformed, missing, out-of-range, and timestamp-mismatched fields become explicit unknown/partial states.
- Selecting a night cannot change the last-fetched timestamp; failed refresh retains only clearly labeled last-good data.
- Missing hazard data is never labeled No major hazard.
- Diagnostics identify the running build and failed provider without exporting secrets.
- Existing saved settings migrate without loss, and a v1.9-to-new-build PWA upgrade is tested. Installed iPhone validation remains a release gate, with a concise on-device check if remote inspection is unavailable.

The production release should follow validation, not be part of an unreviewed assessment change.

## Subsequent implementation sequence

1. **Honest week outlook:** generate observing nights independently of provider coverage; combine available astronomy with broader general-weather planning information; label later nights and missing astronomy explicitly; persist site/date and correct window duration semantics. Open-Meteo needs a cloud-cover request added for useful weather-only sky outlooks. Its [official forecast documentation](https://open-meteo.com/en/docs) covers hourly cloud and the forecast horizon.
2. **Target and equipment foundation:** choose a licensed/provenanced catalog and coherent astronomy calculation layer, define schemas, reconcile owned rigs/filters, and add a small verified seed catalog. Define RA units, coordinate epoch, angular size units, and moving-object handling explicitly.
3. **Target intelligence:** useful altitude/darkness windows, time-dependent Moon geometry, FOV/filter/site matching, distinct DSO and planetary/lunar decisions, and explainable future-night assignment.
4. **Field execution:** persist plans and generated packing/startup/shutdown workflows, verify hardware dependencies, support offline/resume, and carry known session context into AstroLog.
5. **Optional integrations:** add Home sensors and summary sharing when their prerequisites are ready. Evaluate Foreca only against an observed benefit; no account revival, new backend, MCP server, or automation is required now.

## Verification record and limits

Passed: app.js and sw.js syntax checks, clean initial git status, live remote/deployment identity, public asset hash comparisons, live successful provider requests, next-night selection, current desktop cache inspection, and narrow-viewport geometry checks. Controlled probes confirmed score bypass, critical-path provider coupling, missing-weather all-clear, and missing-Moon scoring behavior.

Not established: technical cause of the user-reported Foreca loading failure on installed iPhone, physical iPhone/PWA upgrade behavior, current Foreca account/API health, complete offline operation, target data accuracy, exact owned equipment inventory, full secret-history audit, or comprehensive astronomy accuracy testing.

Return point: review/approve the reliability increment above; then branch from the reverified baseline, implement it, run its acceptance checks, and validate the installed iPhone behavior before release.
