/**
 * Empirical fx-rule legend: an fx rule's definition is not available to the
 * visual, so the legend can only be reconstructed empirically from the
 * delivered per-row colors. Sort (colorValue, ruleColor) pairs by value and
 * sample N stops by nearest value across the range. This honestly renders
 * both gradient AND bucket rules. If rule colors exist but no Color measure
 * is bound, there is nothing to anchor a scale to — the caller must HIDE
 * the legend rather than fabricate one.
 */
import { FX_LEGEND_STOPS } from "./constants";

export interface FxGradient {
    /** Stop colors, evenly spaced 0..1 along the gradient. */
    stops: string[];
    min: number;
    max: number;
}

export function sampleFxGradient(
    pairs: ReadonlyArray<{ value: number; color: string }>,
    stopCount: number = FX_LEGEND_STOPS
): FxGradient | null {
    const clean = pairs.filter((p) => isFinite(p.value) && !!p.color);
    if (clean.length === 0) {
        return null;
    }
    const sorted = clean.slice().sort((a, b) => a.value - b.value);
    const min = sorted[0].value;
    const max = sorted[sorted.length - 1].value;
    const n = Math.max(2, stopCount);
    const stops: string[] = [];
    for (let i = 0; i < n; i++) {
        const v = max === min ? min : min + ((max - min) * i) / (n - 1);
        // nearest pair by value
        let best = sorted[0];
        let bestDist = Math.abs(sorted[0].value - v);
        for (const p of sorted) {
            const dist = Math.abs(p.value - v);
            if (dist < bestDist) {
                best = p;
                bestDist = dist;
            }
        }
        stops.push(best.color);
    }
    return { stops, min, max };
}
