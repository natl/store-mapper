/**
 * Geometry bounds, the cheap refit signature, and fit-with-padding math.
 * Pure coordinate arithmetic — no D3, no DOM.
 */
import { FIT_PADDING } from "./constants";
import { Bounds, FitTransform, GeoJsonGeometry } from "./types";

function walkCoords(coords: unknown, visit: (x: number, y: number) => void): void {
    if (!Array.isArray(coords)) {
        return;
    }
    if (coords.length >= 2 &&
        typeof coords[0] === "number" && typeof coords[1] === "number") {
        visit(coords[0], coords[1]);
        return;
    }
    for (const c of coords) {
        walkCoords(c, visit);
    }
}

/** Bounds of a set of geometries in raw (unflipped) data space.
 *  Returns null for an empty set or when no finite coordinate exists. */
export function geometryBounds(
    features: ReadonlyArray<GeoJsonGeometry>
): Bounds | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let any = false;
    for (const f of features) {
        walkCoords(f.coordinates, (x, y) => {
            if (!isFinite(x) || !isFinite(y)) {
                return;
            }
            any = true;
            if (x < minX) { minX = x; }
            if (y < minY) { minY = y; }
            if (x > maxX) { maxX = x; }
            if (y > maxY) { maxY = y; }
        });
    }
    return any ? { minX, minY, maxX, maxY } : null;
}

/**
 * Cheap signature of the geometry *set*: feature count + collection bounds.
 * Highlight and formatting updates arrive as Data updates with the same
 * geometry set — equal signature means do NOT refit (the user's pan/zoom
 * is preserved). Empty data has the defined signature "0|empty".
 */
export function geometrySignature(
    features: ReadonlyArray<GeoJsonGeometry>
): string {
    const b = geometryBounds(features);
    if (!b) {
        return "0|empty";
    }
    return `${features.length}|${b.minX}|${b.minY}|${b.maxX}|${b.maxY}`;
}

/**
 * Fit content bounds into the viewport with 10% padding, for either Y
 * orientation. The renderer flips y *before* the zoom transform (the
 * geoTransform streams (x, -y) when flipY is on), so this computes the fit
 * in that post-flip space: screen = k * flipped(data) + t.
 * Degenerate bounds (single point, zero-height line) never produce
 * Infinity/NaN.
 */
export function computeFitTransform(
    bounds: Bounds,
    viewport: { width: number; height: number },
    flipY: boolean
): FitTransform {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const vw = Math.max(1, viewport.width);
    const vh = Math.max(1, viewport.height);
    const usable = 1 - 2 * FIT_PADDING;

    let k: number;
    if (w <= 0 && h <= 0) {
        k = 1; // single point — any scale fits; pick identity
    } else if (w <= 0) {
        k = (vh * usable) / h;
    } else if (h <= 0) {
        k = (vw * usable) / w;
    } else {
        k = Math.min((vw * usable) / w, (vh * usable) / h);
    }
    if (!isFinite(k) || k <= 0) {
        k = 1;
    }

    const cx = (bounds.minX + bounds.maxX) / 2;
    const cyData = (bounds.minY + bounds.maxY) / 2;
    const cy = flipY ? -cyData : cyData;

    return {
        k,
        tx: vw / 2 - k * cx,
        ty: vh / 2 - k * cy
    };
}
