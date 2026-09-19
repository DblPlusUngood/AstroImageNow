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

Nominal Z73/Flat73A 1.0×/ASI533MC Pro geometry uses 430 mm focal length, an 11.31 × 11.31 mm sensor, and 3.76 µm pixels, from [William Optics](https://support.williamoptics.com/products/zenithstar-73-iii) and [ZWO](https://www.zwoastro.com/product/asi533-pro-series/). This gives approximately **1.51° square and 1.80 arcseconds/pixel**. Ownership and commissioning status were reconciled with the current rig record on September 19, 2026: Elite Drawer OAG installed, spacing still requiring field verification, L-Pro the only confirmed imaging filter. An unfiltered baseline is also selectable. C8 lunar/planetary planning remains separate.

## Calculation and limits

- A planning night runs from local noon on the selected date to the next local noon, using the site's IANA time zone. Daylight-saving transitions therefore produce 23- or 25-hour intervals.
- Geometry is sampled every 10 minutes. The app first uses astronomical darkness (Sun ≤ -18°); if none exists, it explicitly labels a nautical-darkness fallback (≤ -12°). No interval is invented during polar daylight.
- Target altitude is geometric, with no atmospheric refraction. Minimum useful altitude defaults to 30° and is selectable at 20°, 40° or 50°. Terrain, local obstructions, mount limits and meridian-flip interruption are not modeled.
- Useful windows are contiguous dark samples above the chosen altitude. Their duration stops at the final qualifying sample. Prefer the longest window free of the Moon heuristic when that window lasts at least 60 minutes; otherwise display the longest geometry window with its Moon caution. A chart also shows target and Moon altitude. These are approximate planning times, not precise rise/set predictions.
- The Moon assessment uses topocentric separation, altitude and illumination at each sample. A Moon at/below the horizon, or under 25% illumination, does not trigger this heuristic. For clusters/globulars/planetary nebulae, caution requires at least 50% illumination and separation under 30°. Other objects use 75° for high light-pollution sensitivity, otherwise 55°. A future explicitly owned dual-band filter would use 35° for emission objects only. These thresholds are editorial, not validated exposure/SNR predictions; a low Moon phase can still affect faint dust.
- Site advice uses the saved Bortle value as context, never a measured nightly value. Highly light-pollution-sensitive objects receive a dark-sky caution at Bortle 6–9; unknown site brightness stays unknown.
- Framing uses a conservative bounding rectangle, allowing camera rotation. If the minor dimension is missing it uses the major diameter on both axes. Ratios over 1 require a crop/mosaic, over 0.85 are tight, under 0.25 are small. Nominal geometry excludes edge cropping, spacing defects, surrounding faint structure and composition. Inspect a survey image before committing.
- Candidate ordering is internal and heuristic: 5 per useful hour + peak dark altitude/10, minus 15 for Moon caution, 12 for dark-sky priority, and framing penalties of 20 for mosaic, 12 for small, 8 for uncertain, 4 for tight. The app presents reasons rather than a numeric target-quality score.
- Weather is a separate **night-level** context banner. Target windows are not intersected with an hourly cloud forecast in this increment. Stale, incomplete and absent forecasts are explicit. A good geometric window cannot override a weather hazard.
- Saved assignments include date, site/target/rig IDs, filter, altitude threshold and planned status. They remain browser-local, do not synchronize across devices, and never command a telescope or create calendar events. No API credentials or exact site coordinates are copied into plan records. Deleting an observing-site profile also removes that site's assignments from the displayed plan list.

`provenance.json` records imported-source and vendored-library SHA-256 hashes. Runtime code is separate from the CC BY-SA catalog data. Tests cover geometry against an independent J2000 meridian reference, epoch transformation, Moon-horizon rules, DST, no-darkness cases, framing, local plan validation, and app cache coverage.
