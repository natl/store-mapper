/**
 * Pinned capabilities object/property names (canonical — do not drift).
 *
 * These exact names are used consistently in capabilities.json, the
 * formatting model (settings.ts), persistence calls and read-back code.
 * The test suite asserts that capabilities.json matches this module, so a
 * rename in one place fails loudly everywhere.
 */
export const PINNED = {
    /** fx-enabled default color. Per-row rule colors are read back from
     *  category.objects[i].colors.defaultColor. */
    colors: {
        objectName: "colors",
        defaultColor: "defaultColor",
        minColor: "minColor",
        maxColor: "maxColor",
        logScale: "logScale"
    },
    /** Per-category color overrides, persisted via the first row's
     *  selection-id selector; read back from
     *  category.objects[i].dataColors.fill. */
    dataColors: {
        objectName: "dataColors",
        fill: "fill"
    }
} as const;

/** Maximum number of per-category color picker slices. Categories beyond
 *  the cap remain palette-colored and get no picker. */
export const MAX_CATEGORY_COLOR_SLICES = 50;

/** Maximum legend swatch rows before collapsing to "+N more". */
export const MAX_LEGEND_SWATCHES = 12;

/** Number of empirical gradient stops sampled for fx-rule legends. */
export const FX_LEGEND_STOPS = 24;

/** Scale bar: maximum bar length in CSS pixels. */
export const SCALE_BAR_MAX_PX = 120;

/** Declutter: average glyph width as a fraction of font size. */
export const LABEL_CHAR_WIDTH_FACTOR = 0.6;

/** Declutter: fixed pixel allowance for labels on point features. */
export const POINT_LABEL_ALLOWANCE_PX = 60;

/** Dimmed-state paint alphas (paint-level, not element opacity). */
export const DIM_FILL_OPACITY = 0.15;
export const DIM_STROKE_OPACITY = 0.3;
export const DIM_LABEL_OPACITY = 0.25;

/** Auto-fit padding: content occupies (1 - 2*padding) of the viewport. */
export const FIT_PADDING = 0.1;
