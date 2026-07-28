# WKT Map — Power BI custom visual for indoor/store maps

Renders **planar x/y WKT geometries** — store bays, shopping-centre
tenancies, floor plans, planogram items. This is **not** a latitude/longitude
geo map: coordinates are arbitrary planar units (typically metres or feet
from CAD exports). No projections, no tiles, no basemaps, no raster
underlays. Equal aspect ratio always.

## Features

- POINT, LINESTRING, POLYGON, MULTIPOINT, MULTILINESTRING, MULTIPOLYGON
- Pan/zoom (wheel + drag, on-screen +/−/reset buttons), auto-fit with 10%
  padding, zoom extent 0.1x–20x **relative to the auto-fit scale**
- "Flip Y axis" toggle (default ON = CAD convention, y up)
- Z Order field for draw order (ascending, stable ties)
- Coloring: fx conditional-formatting rules, sequential heatmap with
  optional log(x+1), categorical palette with per-category overrides,
  default color — with one explicit priority (see `src/core/resolveStyle.ts`)
- Legend (4 corners, dodges buttons and scale bar, hidden in high contrast)
- Scale bar with 1/2/5×10ⁿ snapping and **no unit rollover**
  (Metres / Feet / Custom units)
- Centroid labels with constant screen size and zoom-aware decluttering
- Selection (click, Ctrl/Cmd/Shift multi-select, context menu on shapes and
  background), cross-highlighting, bookmarks, native tooltips
- Keyboard accessibility: Tab focuses shapes in draw order, Enter/Space
  selects, Escape clears, visible focus ring (high-contrast aware)
- High contrast mode via the host palette

## Data contract

| Field | Kind | Max | Notes |
|---|---|---|---|
| Geometry (WKT) | Grouping | 1 | One WKT string per row. Selection identity. |
| Label | Grouping | 1 | Text at each geometry centroid. |
| Color Category | Grouping | 1 | Palette-based categorical fill. |
| Color | Measure | 1 | Sequential heatmap. Uses the measure's own default aggregation; the visual never re-aggregates. |
| Z Order | Grouping | 1 | Optional numeric draw order, ascending, stable ties. Unbound → input order untouched. |
| Tooltip Values | Measure | 10 | Extra tooltip rows. |

Assumptions and edge-case behavior:

- **One row per geometry.** Duplicate geometries are an upstream data
  problem; the visual renders whatever rows arrive without deduplication.
- **GEOMETRYCOLLECTION is unsupported** and skipped silently like bad WKT.
  Split collections upstream (e.g. PostGIS `ST_Dump`, SQL Server
  `STGeometryN`).
- **Unparseable/null WKT rows are skipped silently** — never a crash, and
  skipping never desynchronizes index alignment with the other columns.
  Empty data clears the canvas.
- Rows are correlated by index across all bound columns (categorical data
  mapping, top 30,000 rows).
- **Cross-highlighting requires at least one bound measure** (Color or a
  Tooltip Value). With zero measures bound there is no highlights channel
  and the host falls back to filtering; binding any measure restores
  dim-style highlighting.
- **Bookmarks restore selection only; the reset button restores the view**
  (pan/zoom state is deliberately not persisted).
- fx-rule legends are reconstructed **empirically** from the delivered
  per-row colors (a rule's definition is not available to a visual). If an
  fx rule is based on a field that is not bound as the Color measure, the
  legend is hidden rather than fabricating a scale.

## Sample datasets

`mapdata/` contains starter CSVs for manual testing in Power BI Desktop — each
row's `WKT Geometry` column binds to the Geometry field:

| File | Contents |
|---|---|
| `wkt-map-sample-data.csv` | Shopping-centre floor plan: common areas and tenancies by category, one level. |
| `wkt-map-supermarket-sample.csv` | Single supermarket floor plan: registers, service counter, back-of-house, aisles. |
| `wkt-map-planogram-sample.csv` | Planogram bay/shelf geometries for a single aisle set. |

## Project layout

```
capabilities.json      data roles, objects, mappings (pinned names tested)
src/visual.ts          thin shell: host wiring, DOM, D3 binding, events
src/settings.ts        FormattingModel API settings (getFormattingModel)
src/core/              pure logic, no DOM, no D3 selections, unit-tested
  constants.ts         pinned object/property names + shared constants
  resolveStyle.ts      THE single render-state resolver (all paint logic)
  colorScale.ts        min/max/log/clamp → (value) => color
  parseRows.ts         WKT ingestion preserving index alignment
  fitTransform.ts      bounds, refit signature, fit-with-padding math
  scaleBar.ts          1/2/5×10ⁿ snapping, no rollover
  fxLegend.ts          empirical fx gradient sampling
  labels.ts            declutter rule
  zorder.ts            stable ascending sort
test/                  Jest + jsdom unit suite
```

Architectural rule: **all** fill/stroke/opacity attributes on shapes and
labels are applied in exactly one place (`Visual.applyStyles`), which reads
`core/resolveStyle`. The draw routine and every interaction handler call the
same applier. Nothing else sets paint — this is what prevents conflicting
stroke widths and the "double outline" artifact on selected shapes
(emphasized shapes are additionally raised above neighbours sharing
borders, deliberately overriding z-order while an interaction is active and
restoring DOM z-order when it clears).

## Build

```bash
npm install
npx eslint .        # zero errors required
npm test            # zero failures required
npm run smoke       # runtime smoke harness (see below), zero failures required
npx pbiviz package  # outputs dist/*.pbiviz
```

### Runtime smoke harness

`npm run smoke` compiles the real `Visual` class (tsc, so ambient const
enums are inlined exactly as in the production build), bundles it with
esbuild, and drives `update()` under jsdom against a mocked `IVisualHost`
with realistic data views: geometry-only binding, all fields bound,
cross-highlights, whitespace-padded WKT, and empty data. It asserts that no
`renderingFailed` fires, that the auto-fit transform is numerically correct,
and that every geometry lands inside the viewport. This guards the failure
class that unit tests of pure functions cannot see: a transient exception
mid-render leaving the visual permanently blank.

## WKT dialect support

Accepted (verified by tests): standard 2D WKT, lowercase keywords,
`Z`/`M`/`ZM` dimension tokens and bare 3D/4D coordinates (ordinates beyond
x/y are ignored), EWKT `SRID=...;` prefixes, scientific notation, embedded
line breaks, and leading/trailing whitespace. **Not supported** (skipped
silently like bad WKT): `EMPTY` geometries, curve types (`CIRCULARSTRING`,
`CURVEPOLYGON`, ...), comma decimal separators, and `GEOMETRYCOLLECTION`.
Strip or convert these upstream (e.g. `ST_CurveToLine`, `ST_Dump`).

**Diagnostic overlay:** if the Geometry field is bound and *zero* rows
parse, the visual prints the row count and the first skipped value on the
canvas instead of rendering silent white. Rows that fail alongside
successfully parsed rows remain silently skipped per the data contract.

## Category colors, legend order, and highlighting

**Color stability.** The host palette assigns theme colors sequentially by
*first request per key*, and Power BI both re-sorts the data view rows and
re-instantiates the visual when fields are added or removed. The visual
therefore assigns palette colors by walking the distinct Color Category
values in a deterministic locale-aware sorted order (numeric-aware, so
"Bay 2" < "Bay 10"), never in row order. The legend swatches and the
Category colors pane use the same order. Result: adding a tooltip measure
(or any field) does not reshuffle category colors or legend order. Two
caveats: (a) adding a brand-new category value can shift the theme colors
of the values that sort after it — pin colors in the *Category colors* card
to make them permanent; (b) if a cross-filter is active when the visual is
re-instantiated, colors are assigned from the filtered category set.

**Highlighting requires a highlights channel.** Power BI only sends
highlight arrays to a visual through bound *measures*. With Color Category
plus a Color measure or any Tooltip Value, cross-highlighting dims
non-highlighted shapes (fill 0.15 / stroke 0.3 / label 0.25) and emphasizes
highlighted ones. With **zero measures bound** — a common
category-colors-only setup — there is no channel, and the host falls back
to **cross-filtering**: rows leave the data view, shapes disappear, and the
map refits to what remains. That is host behavior, not a dimming bug; bind
any measure (a Tooltip Value is enough) to restore dim-style highlighting.

## Troubleshooting: nothing renders

1. **Read the canvas.** If every row failed to parse, the visual now says
   so on screen, including a sample of the first skipped value. Compare it
   against the supported dialects above.
2. **Check the column type.** The Geometry field must arrive as text. A
   column Power BI has typed as something else (or a measure) will not
   populate the category.
3. **Coordinate orientation.** If shapes render mirrored or appear after
   pressing reset, toggle *Map → Flip Y axis* (default ON = CAD, y up).
4. **Press the reset button.** It re-applies the auto-fit from current data.

## Manual test checklist (Power BI Desktop)

Unit tests cover the pure core. The following are validated manually:
D3 zoom behavior, SVG attribute application, tooltip service calls,
context menus, bookmark restore, high-contrast rendering, fx rule
round-trips, and the formatting pane.

## AppSource submission

1. Replace the placeholders in `pbiviz.json`: `author.name`, `author.email`,
   `supportUrl`, `gitHubUrl` — and `repository.url` in `package.json`.
   Certification requires a **public repository that builds the exact
   submitted package**.
2. Replace `assets/icon.png` with a real 20×20 icon.
3. Bump the **4th** version segment in `pbiviz.json` (both `visual.version`
   and the top-level `version`) for every submitted iteration — AppSource
   rejects reused versions. This line starts at **1.1.0.0** (the previous
   line reached 1.0.0.2).
4. `npx eslint .` (zero errors), `npm test` (zero failures),
   `npx pbiviz package` (zero errors).
5. Verify certification constraints (all already enforced here):
   `"privileges": []`, no WebAccess or network calls, no externalJS, no
   innerHTML / `d3.html()` / eval / `Math.random`, rendering events on every
   update, high contrast support, `destroy()` cleanup.
6. Create the submission in Partner Center, attach `dist/*.pbiviz`, sample
   report (.pbix) and the public repo link, and request certification.

## License

MIT (see `package.json`). Update as appropriate before publishing.
