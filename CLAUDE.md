# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Power BI custom visual (`.pbiviz`) that renders **planar x/y WKT geometries** — store bays, shopping-centre tenancies, floor plans, planogram items. It is explicitly **not** a geographic map: coordinates are arbitrary planar units (metres/feet from CAD exports), there are no projections, tiles, or basemaps, and aspect ratio is always 1:1.

Read `README.md` first — it documents the data contract, edge-case behavior (unparseable WKT, GEOMETRYCOLLECTION, cross-highlighting fallback, category color stability), the WKT dialect support matrix, and the AppSource submission checklist in detail. Don't duplicate that content when reasoning about behavior; refer to it.

## Commands

```bash
npm install
npx eslint .          # zero errors required (eslint-plugin-powerbi-visuals recommended config)
npm test              # jest unit suite, zero failures required
npm run smoke         # runtime smoke harness, zero failures required
npm run smoke:packaged # same smoke checks against the built .pbiviz bundle
npx pbiviz package    # outputs dist/*.pbiviz
npm start             # pbiviz start — live dev server for Power BI Desktop
```

Run a single test file: `npx jest test/resolveStyle.test.ts`
Run a single test by name: `npx jest -t "test name substring"`

All three of lint, test, and smoke must pass with zero errors/failures before considering a change complete — this is a certified-visual codebase (AppSource submission constraints apply; see README "AppSource submission" section).

## Architecture

**Strict separation: `src/core/` (pure logic) vs `src/visual.ts` (host/DOM shell).**

- `src/core/*.ts` — pure functions, no DOM, no D3 selections, no `powerbi-visuals-api` host objects. Fully unit-tested under `test/`. This is where geometry parsing, style resolution, color scaling, fit-transform math, scale-bar snapping, label decluttering, z-order sorting, and fx-legend reconstruction live.
- `src/visual.ts` (~1200 lines) — the `Visual` class implementing `IVisual`. Owns all D3 selections, SVG/DOM construction, zoom behavior, event wiring, tooltip/selection-manager/context-menu calls, and the formatting pane. It calls into `src/core` for all actual logic and never reimplements it inline.
- `src/settings.ts` — the `FormattingModel` API surface (`getFormattingModel`), i.e. what appears in the Power BI formatting pane. Property/object names must match `capabilities.json` exactly (see `src/core/constants.ts` for the pinned names, which are covered by tests).

**The one architectural rule that matters most:** every fill/stroke/opacity attribute on shapes and labels is applied in exactly one place — `Visual.applyStyles()`, which reads `core/resolveStyle.ts`. The draw routine and every interaction handler (selection, hover, cross-highlight) funnel through this same applier. Never set paint attributes anywhere else — that's what prevents conflicting stroke widths and "double outline" artifacts on selected shapes. When touching selection/highlight/hover behavior, start in `resolveStyle.ts`, not in the interaction handlers.

Data flow through `Visual`:
1. `update()` → `rebuildData()` — reads the `DataView`, parses WKT rows via `core/parseRows.ts` (index-aligned with all other bound columns; unparseable/null rows skipped silently, never desyncing indices), resolves categorical colors (`core/categories.ts`), builds the color scale (`core/colorScale.ts`), sorts by z-order (`core/zorder.ts`).
2. `render()` — (re)creates D3 shape/label selections bound to the parsed datums.
3. `applyStyles()` — the single paint pass, driven by `resolveStyle.ts`.
4. Zoom/pan (`onZoomFrame`), fit (`applyFit`/`fitTransform.ts`), scale bar (`scaleBar.ts`), and legend (`renderLegend`/`fxLegend.ts`) are updated relative to the current transform.

### Runtime smoke harness (`harness/`)

Unit tests cover pure `core/` functions but can't catch a transient exception mid-render that leaves the visual permanently blank — that's what `npm run smoke` guards against. It compiles the real `Visual` class with `tsc` (so ambient const enums inline exactly as in the production build), bundles with esbuild, and drives `update()` under jsdom against a mocked `IVisualHost` with realistic data views (geometry-only, all-fields-bound, cross-highlights, whitespace-padded WKT, empty data). It asserts no `renderingFailed` fires, the auto-fit transform is numerically correct, and every geometry lands inside the viewport. Treat a smoke failure as a real regression, not flakiness — add a new fixture case in `harness/harness.ts` when adding a code path that the existing fixtures don't exercise.

## CI and releases

`.github/workflows/ci.yml` has two jobs:
- `test` — runs on every push and PR to `main`: lint, unit tests, smoke tests. Required as a status check on `main` (branch protection).
- `release` — runs only on a push to `main` (not PRs) after `test` passes. Reads the version from `pbiviz.json`, skips if a GitHub Release for that tag (`v<version>`) already exists, otherwise runs `npx pbiviz package` and publishes the `.pbiviz` file as a new Release via `gh release create`.

**Releasing means bumping the version.** A push to `main` that doesn't change `pbiviz.json`'s `version` field produces no new release (the existing-tag check makes this a no-op, not a failure). To cut a release, bump `visual.version` and the top-level `version` in `pbiviz.json` (keep them equal) before merging — see the versioning note in the README's AppSource section for the segment convention already in use.

## Conventions specific to this repo

- **Pinned names matter.** Object/property names in `capabilities.json`, `src/settings.ts`, and `src/core/constants.ts` must stay in sync — `test/pinnedNames.test.ts` enforces this. If you rename a formatting-pane property, update all three plus check for a corresponding migration concern (Power BI persists these names in saved reports).
- **Certification constraints are load-bearing, not stylistic**: `"privileges": []` in `capabilities.json`, no network calls/WebAccess/externalJS, no `innerHTML`/`d3.html()`/`eval`/`Math.random`, rendering-started/finished/failed events fired on every `update()`, high-contrast support, and `destroy()` cleanup. eslint-plugin-powerbi-visuals enforces much of this — don't suppress its rules to work around a violation; fix the underlying code.
- Bad/unsupported input (unparseable WKT, GEOMETRYCOLLECTION, empty data) is handled by silent skip, not by throwing — this is a deliberate data-contract decision (see README), not an oversight to "fix" with added error handling.
