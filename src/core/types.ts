/**
 * Core types. This module (like everything in src/core/) is pure:
 * no DOM access, no D3 selections, no runtime powerbi-visuals-api imports.
 */

/** Minimal GeoJSON geometry shape produced by the wellknown parser. */
export interface GeoJsonGeometry {
    type: "Point" | "MultiPoint" | "LineString" | "MultiLineString" |
        "Polygon" | "MultiPolygon";
    coordinates: unknown;
}

/** Broad rendering kind of a geometry. */
export type GeometryKind = "point" | "line" | "area";

/** A successfully parsed row. Index alignment with the source categorical
 *  columns is preserved by parseRows returning null for skipped rows. */
export interface ParsedRow {
    /** GeoJSON geometry from the WKT string. */
    feature: GeoJsonGeometry;
    /** Uppercased WKT type, e.g. "MULTIPOLYGON". */
    wktType: string;
    /** Rendering kind (lines are stroke-colored, others fill-colored). */
    kind: GeometryKind;
    /** True when the geometry contains point coordinates (POINT/MULTIPOINT)
     *  whose radii must be recomputed on zoom. */
    hasPoint: boolean;
}

/** One renderable datum. The shell augments this with host objects
 *  (selection ids); core functions only read the plain fields. */
export interface MapDatum {
    /** Original row index in the categorical data view (highlights and
     *  per-row objects are aligned to this, not to the filtered array). */
    index: number;
    /** Stable key for selection comparison (ISelectionId.getKey()). */
    key: string;
    feature: GeoJsonGeometry;
    wktType: string;
    kind: GeometryKind;
    hasPoint: boolean;
    label: string | null;
    /** Color Category value as a display string, null when unbound. */
    category: string | null;
    /** Color measure value, null when unbound or non-numeric. */
    colorValue: number | null;
    /** Per-row fx conditional-formatting rule color
     *  (category.objects[i].colors.defaultColor), null when absent. */
    ruleColor: string | null;
    /** Per-category user override color
     *  (category.objects[i].dataColors.fill), null when absent. */
    overrideColor: string | null;
    /** Z Order value, null when unbound or non-numeric. */
    zOrder: number | null;
}

/** Single interaction state object consumed by the render-state resolver. */
export interface InteractionState {
    mode: "none" | "selection" | "highlight";
    /** Keys (ISelectionId.getKey()) of currently selected datums. */
    selectedKeys: ReadonlySet<string>;
    /** Raw highlights array aligned to original row indices;
     *  highlights[i] !== null means row i is highlighted. Null when the
     *  host did not deliver highlights. */
    highlights: ReadonlyArray<unknown> | null;
}

/** Style-relevant settings snapshot passed to the resolver. Plain data +
 *  plain functions so the resolver stays pure and unit-testable. */
export interface StyleSettings {
    highContrast: {
        active: boolean;
        foreground: string;
        background: string;
    };
    defaultColor: string;
    strokeColor: string;
    strokeWidth: number;
    selectedStrokeWidth: number;
    /** Sequential color scale, or null when no Color measure is bound. */
    colorScale: ((value: number) => string) | null;
    /** Palette lookup for a category value, or null when Color Category is
     *  unbound. (Per-category overrides take priority via d.overrideColor.) */
    categoryPalette: ((category: string) => string) | null;
}

/** Everything the single applier needs to paint a shape and its label. */
export interface ResolvedStyle {
    fill: string;
    fillOpacity: number;
    strokeColor: string;
    strokeWidth: number;
    strokeOpacity: number;
    labelOpacity: number;
    /** True when the datum is emphasized (selected/highlighted while an
     *  interaction is active); the shell raises these shapes. */
    emphasized: boolean;
}

export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface FitTransform {
    k: number;
    tx: number;
    ty: number;
}

export interface ScaleBarSpec {
    /** Snapped bar length in chosen units (1/2/5 × 10^n). */
    units: number;
    /** Bar length in CSS pixels. */
    px: number;
    /** Display label, e.g. "5000 m" or "2000 shelf". No unit rollover. */
    label: string;
}

export interface ColorScaleResult {
    color: (value: number) => string;
    min: number;
    max: number;
    /** True when log(x+1) is actually applied (toggle on AND all values >= 0). */
    log: boolean;
}
