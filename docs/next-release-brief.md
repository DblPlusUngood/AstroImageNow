# v1.14 release brief — September 20–21, 2026

Status: implemented in v1.14.0. Jason resumed the work on September 21 and authorized the complete combined update through deployment in one run. Baseline: deployed v1.13.0. See [the implementation and validation record](releases/2026-09-21-v1.14-travel-night-plan.md).

## Accepted scope

- Rename **Same target, different site** to **Travel Site Comparison**.
- Lock this comparison to the existing **Home** and **JGAP** site profiles for now. Preserve saved site IDs, coordinates and Bortle values; do not overwrite phone settings from a desktop snapshot. No additional observing site is being added.
- Refresh Home and JGAP together during the normal forecast refresh flow. Remove the separate **Refresh site comparison** button and its explanatory paragraph. Reuse the active site's response; one refresh cycle should fetch each necessary site/provider once. Changing target, filter, telescope or displayed night should recompute from available data rather than cause more API requests.
- Keep the two site cards compact: site name, useful forecast window or concise reason there is none, and the conditions that materially affect the choice. Remove repeated date/time-zone/provider prose and generic explanations. Keep Bortle available as useful site context; geometry-only times can be secondary detail when conditions prevent imaging.
- Make provider attribution and retrieval status quiet. Preferred normal-state placement: a collapsed **Forecast details** area near the bottom, using muted text such as `Astrospheric + Foreca · updated 10:56 AM`. Show the actual active providers, including a backup if used; retain provider attribution links and verify applicable display requirements before relocating them. Distinguish provider retrieval times in expanded detail if they differ.
- Bring errors, stale data, unavailable coverage or a meaningful fallback into view only when they affect a decision. Partial failure at one site must not hide the other site's successful forecast or label old data fresh.
- Reduce repeated tutorial text throughout the app. Assume Jason understands the purpose and basic controls. Keep concise rationales, material uncertainty, weather hazards, and genuinely useful equipment or target limitations. Put scoring methodology, model/credit information, and routine data provenance in expandable details.
- Preserve the approved graphite/papaya palette, quiet target rings, approximate-score indicator and fixed general conditions score. Do not add visual emphasis to routine metadata.

## Saved future possibilities — not current implementation scope

- Replace the fixed comparison pair with a second-site dropdown plus **Compare** button. That explicit action would request the selected comparison site's forecast, analogous to the present refresh action. Home/JGAP stays the current default pair.
- Evaluate the Hope Furnace/Lake Hope possibility only if a later site-research task is useful. The exact place and whether it is meaningfully better than JGAP are unverified. Jason currently expects JGAP to remain the relevant nearby dark-site alternative. No research, ranking claim or site entry is authorized by this note alone.

## Night-plan capability — included in the combined update

After the cleanup, synthesize the existing data into one concise night plan: **stay home / consider JGAP / neither**, one primary target with rig/filter/window, and one fallback where useful. Place this in the existing Imaging Targets/Travel Site Comparison flow rather than adding another dense section. Explain the recommendation in one or two decision-relevant reasons. Compare both sites' actual target windows and hazards; darker sky alone must not automatically win for planetary imaging. State when a travel choice cannot be judged from the available data. Do not invent drive-time, site access, horizon or personal capture-history facts.

The authorized combined run includes both the cleanup and the night-plan recommendation. Keep journal import/synchronization, external conversational AI, event feeds, deeper glass rendering and alternative-site research parked for separate decisions. The current observing journal is available for real session data without further feature work.

## Acceptance checks

- One normal refresh updates Home and JGAP without duplicate active-site calls, recursive refreshes or requests on mere UI selection.
- Independent site/provider errors, cancellation, cached/offline states and stale data stay correct.
- Comparison name and cards read cleanly at phone width; no separate refresh button or duplicated instruction paragraph remains.
- Normal metadata is unobtrusive; meaningful failures remain noticeable and actionable.
- Existing locations, credentials, journal entries, saved plans, scoring independence and offline update behavior are preserved.
- The screenshots are product feedback and evidence of the installed v1.13 appearance. The subsequent explicit resumption supplies implementation and deployment authorization.
