# Target data and planning method

## Catalog provenance and license

The 31-object seed is adapted from **OpenNGC**, by Mattia Verga and contributors, release `v20260501`, commit `36cb178a0f69dba8bfc03a99c10512831edf1c6b`:

- [Upstream catalog and documentation](https://github.com/mattiaverga/OpenNGC/tree/36cb178a0f69dba8bfc03a99c10512831edf1c6b)
- Source files: `database_files/NGC.csv` and `database_files/addendum.csv` (M45).
- [CC BY-SA 4.0 license](OpenNGC-LICENSE.txt). The adapted catalog, committed seed and curation notes in this directory are distributed under the same license. No endorsement by upstream authors is implied.
- Changes: selected 31 records/13 source columns, converted sexagesimal coordinates, normalized display names, added target categories and authored planning/framing cautions. Original `Sources` strings remain with each record.

OpenNGC incorporates NED (NASA/IPAC at JPL/Caltech), HyperLEDA, SIMBAD (CDS, Strasbourg), HEASARC tables, and Harold Corwin's positions/notes. We acknowledge those underlying databases. Source codes in each record map to: 1 NED; 2 SIMBAD; 3 HyperLEDA; 4 Corwin; 5 HEASARC MWSC; 6 SMC clusters; 7 LMC extended objects; 8 planetary nebulae; 9 Lynds bright nebulae; 10 Messier; 11 Lynga clusters; 99 OpenNGC revisions. Consult upstream documentation for the field-specific provenance and interpretation.

`openngc-seed.csv` preserves imported values. `target-notes.json` contains editorial curation. Rebuild `targets.js` offline from the repository root:

```sh
python3 scripts/build-catalog.py
```

| Field | Contract |
| --- | --- |
| `id` | Stable lowercase source catalog ID, independent of display name |
| `epoch` | J2000 equatorial coordinates |
| `raHours` | Right ascension, decimal hours in [0, 24) |
| `decDeg` | Declination, signed degrees in [-90, 90] |
| `majorArcmin`, `minorArcmin` | Catalog angular extent in arcminutes; null means unavailable |
| `positionAngleDeg` | Catalog major axis north through east; not a prescribed camera angle |
| `magnitudeV` | Integrated V magnitude where provided; not a detectability score |
| `surfaceBrightness` | Galaxies only: mean B-band brightness within the 25-mag isophote, mag/arcsec²; not used to rank unlike object types |
| `framingReliable` | Editorial permission to use the catalog extent for a rough fit calculation; never a guarantee |

Dimensions can describe a core, an infrared extent, one component, or a whole complex. In particular, NGC 6960, NGC 1333, NGC 2237 and NGC 2264 have an explicit framing uncertainty. Eastern Veil and each Double Cluster member are separate entries. A common-name search is not a claim that every named complex is one camera field. Magnitude is retained for provenance but not used as a simplistic brightness ranking.

## Offline astronomy and equipment

[Astronomy Engine v2.1.19](https://github.com/cosinekitty/astronomy/tree/v2.1.19), by Don Cross, is vendored unchanged in `vendor/astronomy.browser.min.js`, with its [MIT license](../vendor/astronomy-LICENSE.txt). No CDN or runtime catalog service is required. It provides Sun/Moon vectors and the J2000-to-horizon transformation, including precession/nutation. This was selected over a Sun/Moon-only helper to support a coherent geometry layer and the later planetary increment. Both dashboard darkness grouping and target planning use it; they sample at different intervals.

Nominal Z73/Flat73A 1.0×/ASI533MC Pro geometry uses 430 mm focal length, an 11.31 × 11.31 mm sensor, and 3.76 µm pixels, from [William Optics](https://support.williamoptics.com/products/zenithstar-73-iii) and [ZWO](https://www.zwoastro.com/product/asi533-pro-series/). This gives approximately **1.51° square and 1.80 arcseconds/pixel**. Ownership and commissioning status were reconciled with the current rig record on September 19, 2026: Elite Drawer OAG installed, spacing still requiring field verification, L-Pro the only confirmed imaging filter. An unfiltered baseline is also selectable. Additional configurations and lunar/planetary rules are documented below.

## Calculation and limits

- A planning night runs from local noon on the selected date to the next local noon, using the site's IANA time zone. Daylight-saving transitions therefore produce 23- or 25-hour intervals.
- Geometry is sampled every 10 minutes. The app first uses astronomical darkness (Sun ≤ -18°); if none exists, it explicitly labels a nautical-darkness fallback (≤ -12°). No interval is invented during polar daylight.
- Target altitude is geometric, with no atmospheric refraction. Minimum useful altitude defaults to 30° and is selectable at 20°, 40° or 50°. Terrain, local obstructions, mount limits and meridian-flip interruption are not modeled.
- Useful windows are contiguous dark samples above the chosen altitude. Their duration stops at the final qualifying sample. Prefer the longest window free of the Moon heuristic when that window lasts at least 60 minutes; otherwise display the longest geometry window with its Moon caution. A chart also shows target and Moon altitude. These are approximate planning times, not precise rise/set predictions.
- The Moon assessment uses topocentric separation, altitude and illumination at each sample. A Moon at/below the horizon, or under 25% illumination, does not trigger this heuristic. For clusters/globulars/planetary nebulae, caution requires at least 50% illumination and separation under 30°. Other objects use 75° for high light-pollution sensitivity, otherwise 55°. The selected L-Ultimate planning option uses 35° for emission/supernova objects; its planned ownership remains explicit. These thresholds are editorial, not validated exposure/SNR predictions; a low Moon phase can still affect faint dust.
- Site advice uses the saved Bortle value as context, never a measured nightly value. Highly light-pollution-sensitive objects receive a dark-sky caution at Bortle 6–9; unknown site brightness stays unknown.
- Framing uses a conservative bounding rectangle, allowing camera rotation. If the minor dimension is missing it uses the major diameter on both axes. Ratios over 1 require a crop/mosaic, over 0.85 are tight, under 0.25 are small. Nominal geometry excludes edge cropping, spacing defects, surrounding faint structure and composition. Inspect a survey image before committing.
- Candidate ordering is internal and heuristic: 5 per useful hour + peak dark altitude/10, minus 15 for Moon caution, 12 for dark-sky priority, and framing penalties of 20 for mosaic, 12 for small, 8 for uncertain, 4 for tight. The app presents reasons rather than a numeric target-quality score.
- v1.12 adds target-specific forecast intersections and site comparison as documented below. A good geometric window cannot override a weather hazard.
- Saved assignments include date, site/target/rig IDs, filter, altitude threshold and planned status. They remain browser-local, do not synchronize across devices, and never command a telescope or create calendar events. No API credentials or exact site coordinates are copied into plan records. Deleting an observing-site profile also removes that site's assignments from the displayed plan list.

`provenance.json` records imported-source and vendored-library SHA-256 hashes. Runtime code is separate from the CC BY-SA catalog data. Tests cover geometry against an independent J2000 meridian reference, epoch transformation, Moon-horizon rules, DST, no-darkness cases, framing, local plan validation, and app cache coverage.


## v1.12 equipment and moving targets

Nominal optical specifications (verified September 19, 2026):

| Optical configuration | Focal length | Nominal focal ratio | Source |
| --- | ---: | ---: | --- |
| Z73 + Flat73A 1× | 430 mm | f/5.9 | William Optics / existing reconciled train above |
| UltraCat 56 | 269 mm | f/4.8 | [William Optics support](https://support.williamoptics.com/products/ultra-cat-56) |
| C8 native | 2032 mm | f/10 | [Celestron NexStar 8SE](https://www.celestron.com/products/nexstar-8se-computerized-telescope) |
| C8 + 94175 reducer | 1280.16 mm | f/6.3 | [Celestron Reducer/Corrector](https://www.celestron.com/products/reducer-corrector), nominal 0.63× |
| C8 + 2× / 3× Barlow | 4064 / 6096 mm | f/20 / f/30 | Owned [X-Cel LX 2×](https://www.celestron.com/products/x-cel-lx-2x-barlow-lens-125in), [3×](https://www.celestron.com/products/x-cel-lx-3x-barlow-lens-125in); nominal multipliers |

The ASI533 sensor is 11.31 mm square, with 3.76 μm pixels. The [Canon EOS R6 Mark II](https://www.usa.canon.com/support/p/eos-r6-mark-ii) uses a nominal 36 × 24 mm full still-image sensor and 6 μm pixels. Field width/height use `2 atan(sensor dimension / (2 focal length))`; scale uses `206.264806 × pixel μm / focal mm`. Actual C8 focal length/reduction/Barlow factor depend on optical spacing. Vignetting, video ROI/crops and mechanical compatibility are not modeled. Full nominal field is not a guarantee of a fully illuminated, corrected image. UltraCat/ASI533 is approximately 2.41° square at 2.88″/pixel; the catalog's 150′ M45 extent remains slightly wider.

`solar-system.js` is authored object metadata, not fixed-coordinate OpenNGC data. Moon/planet positions use Astronomy Engine's topocentric equatorial vector recalculated at each sample, transformed to the horizon without refraction. The observer's parallax is included. Planning requires Sun ≤ −6° and the same selectable target altitude. No daytime/solar observing, disk-size, opposition, ring-angle, satellite-event or capture-mode model is included. Planetary ranking is visibility-based, not an assertion that each visible planet has a useful apparent diameter.

## v1.12 forecast intersection (with v1.13 fallback below)

For each geometric 10-minute sample, find the immediately preceding/following hourly astronomy and weather samples. Both must support the interval; a gap over one hour, a missing endpoint or time outside coverage is unknown. An exact hourly time can use that sample alone, but a window still requires at least two contiguous geometry samples. Past time is excluded. Weather/astronomy retrievals older than three hours, failed/restored snapshots, and implausibly future-dated retrievals cannot support a window.

Current **editorial planning presets**, not calibrated success probabilities:

- Cloud ≤40%, sustained wind ≤12 mph. Deep sky requires Astrospheric transparency raw value ≤13; long focal length (≥1000 mm) also requires seeing ≥3/5.
- Lunar/planetary requires seeing ≥3/5 at native/reduced focal length and ≥4/5 with a Barlow. Transparency is not a hard planetary gate. These presets are not a claim that all pixel scales are critically sampled or all targets benefit from a Barlow.
- Reuse the dashboard's weather hazards at each hourly endpoint: storm, fog/very low visibility, likely rain, strong gusts block; moderate rain/haze/air-quality/gust cautions stay cautionary. All required rain, precipitation, gust, visibility and storm indicators must be present. Cumulative rain elsewhere in the night can still make the dashboard's whole-night operational verdict more conservative.
- A known dew margin below 4°F, or unavailable dew margin, is cautionary. Moon heuristics apply per sample to deep sky; lunar/planetary imaging is not penalized for imaging the Moon itself.
- Prefer the longest fully supported window, otherwise show the longest caution window. Supported/caution candidates precede incomplete/limited/no-geometry candidates, then use the existing geometric heuristic ordering. Show reasons outside supported intervals separately; no future coverage is invented from an earlier night.

The explicit comparison action requests other saved sites using their own context key (site ID, coordinates, weather-source choice). It does not switch global dashboard state. Cancellation generations reject late responses. Browser-local snapshots contain normalized forecasts, not API credentials. Restored site forecasts are stale until reloaded. User locations and precise addresses remain outside repository data.


## v1.13 full-week conditions and missing-data policy

Astrospheric documents an [84-hour RDPS forecast](https://www.astrospheric.com/DynamicContent/notification_help); its API's [ForecastLength parameter](https://www.astrospheric.com/DynamicContent/api_info_v2) limits returned entries rather than extending the model. Use the actual timestamp coverage. `forecast-model.js` fills absent cloud, sustained wind, temperature and dew point from the configured normalized weather provider. [Foreca full hourly data](https://developer.foreca.com/) supplies `cloudiness`, `windSpeed`, `temperature`, and `dewPoint`. Open-Meteo backup requests the corresponding fields explicitly. Normalize MPH to m/s and Fahrenheit to Kelvin before applying existing component functions. Never synthesize seeing or transparency, extrapolate across missing weather hours, or mutate the raw provider records.

The fixed general score is `sum(available component score × weight) / sum(available weights)`, with cloud .36, transparency .27, seeing .12, wind .10, dew .10. Moon is excluded. Cloud and sustained wind must both be known. Existing heavy-cloud, strong-wind, transparency and dew hard caps still apply. The night score uses the same capped hourly values as its best window. Missing optional values or weather fallback produce **≈** on the night card and headline. This is not a calibrated uncertainty interval or probability. A partial horizon can represent less than a full night's darkness; weather gaps do not gain fabricated values. Significant hazards still control the separate operational verdict, and incomplete hazard data prevents a GO.

Moon illumination/horizon context is calculated locally at the night midpoint using the bundled engine. Detailed target Moon geometry still uses each 10-minute sample. No additional Moon API requests are made.

Target matching uses the same merged weather fields. Cloud, wind, two-sided hourly coverage and complete hazard fields remain necessary. Missing seeing/transparency can yield a separately labeled **≈ Weather-based window**. Known adverse specialized measurements still limit an interval even when the other hourly endpoint is missing that measurement. Dew/Moon/weather cautions remain cautionary. Prefer a fully supported window, then an estimated window, then a caution window; stale data never yields a setup window.

## v1.13 filters and explained recommendations

[L-Ultimate](https://optolong.com/cms/document/detail/id/192.html) is a 3-nm Ha/O III dual-band emission filter, recorded as planned. It is not the general recommendation for continuum galaxies, clusters, reflection dust or natural-color planets. L-Pro remains the owned broadband light-pollution option. UV/IR-cut is a proposed broadband natural-color choice for the ASI533; [ZWO's window specification](https://www.zwoastro.com/product/zwo-protective-window-for-asi-cameras/) lists ASI533 with an AR window. An unmodified Canon already has internal spectral filtering. Mechanical fit is a separate unresolved property of each train.

`advisor.js` uses local rules. Automatic candidates compare Z73/ASI533 and UltraCat/ASI533 in deep sky and native C8/Canon in planetary mode; the C8's native alt-az mount is not automatically proposed for long-exposure deep sky. A user-selected rig/mode/filter can explore every modeled combination, including C8 short-exposure deep sky, with the field-rotation caveat. Automatic planetary advice starts native rather than assuming a Barlow improves usable detail. Planned/proposed filters require the exploration toggle unless explicitly chosen manually.

Rank = forecast category (supported 100, estimated 65, caution 45, unknown/stale 0, limited −70) + 3 per window hour capped at 6 hours + peak altitude/15 + framing (comfortable 8, tight 0, small −8, mosaic −24, unknown −5; no disk-framing term for moving targets) − 12 if dark-sky-sensitive at a bright site − 10 for Moon caution − 4 for provisional UltraCat commissioning + history preference. Deduplicate subjects across candidate rigs and show up to three. These are editorial priorities, not calibrated image-quality scores. The general dashboard score is not an input dependent on the selected equipment. Bright Moon context uses sampled altitude ≥15° and illumination ≥50%; it does not automatically force planetary imaging when a good later Moon-free deep-sky window exists.

## v1.13 device-local observing history

`astroImageNowJournalV1` stores versioned entries with stable ID, local night date, target/site/rig/filter IDs, the historical site label, attempted/captured/revisit outcome, optional nonnegative capture minutes, notes and creation time. Entries are whitelisted and capped at 1,000; the UI rejects a further save instead of overwriting an old session. Unknown site IDs are retained for historical sessions after site-profile removal. No credentials or exact coordinates are added. The JSON backup is downloaded locally; it is not uploaded, synchronized, or automatically imported anywhere.

Latest logged outcome by session date and creation time gives a modest preference: revisit +8, attempted +3, captured −4, unknown history 0. No logged session does not establish that a target was never captured. Manual plans remain separate from actual sessions. Import, existing-record reconciliation, image links and event catalogs are explicit future increments.
