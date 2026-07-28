/**
 * Sequential color scale: min color → max color, optionally through
 * log(x + 1). Pure: own hex interpolation, no D3.
 */
import { ColorScaleResult } from "./types";

interface Rgb { r: number; g: number; b: number; }

function parseHex(hex: string): Rgb {
    let h = hex.replace("#", "").trim();
    if (h.length === 3) {
        h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    const n = parseInt(h, 16);
    if (h.length !== 6 || !isFinite(n)) {
        return { r: 0, g: 0, b: 0 };
    }
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex(c: Rgb): string {
    const pad = (v: number) => {
        const clamped = Math.max(0, Math.min(255, Math.round(v)));
        return clamped.toString(16).padStart(2, "0");
    };
    return "#" + pad(c.r) + pad(c.g) + pad(c.b);
}

function lerpColor(a: Rgb, b: Rgb, t: number): Rgb {
    return {
        r: a.r + (b.r - a.r) * t,
        g: a.g + (b.g - a.g) * t,
        b: a.b + (b.b - a.b) * t
    };
}

export interface ColorScaleSettings {
    minColor: string;
    maxColor: string;
    /** "Log scale (log(x+1))" toggle. Silently falls back to linear when
     *  any value is negative. */
    logScale: boolean;
}

/**
 * Build the (value) => color function from the bound Color measure values.
 * Returns null when there are no finite numeric values.
 * - log(x+1) applies only when the toggle is on AND every value >= 0.
 * - Values are clamped to [min, max].
 * - min === max returns a single color with no NaN.
 */
export function buildColorScale(
    values: ReadonlyArray<unknown>,
    settings: ColorScaleSettings
): ColorScaleResult | null {
    const nums: number[] = [];
    for (const v of values) {
        const n = typeof v === "number" ? v : Number(v);
        if (v !== null && v !== undefined && isFinite(n)) {
            nums.push(n);
        }
    }
    if (nums.length === 0) {
        return null;
    }

    let min = nums[0];
    let max = nums[0];
    for (const n of nums) {
        if (n < min) { min = n; }
        if (n > max) { max = n; }
    }

    const log = settings.logScale && min >= 0;
    const lo = parseHex(settings.minColor);
    const hi = parseHex(settings.maxColor);
    const transform = (x: number) => (log ? Math.log(x + 1) : x);
    const tMin = transform(min);
    const tMax = transform(max);
    const span = tMax - tMin;

    const color = (value: number): string => {
        if (!isFinite(value)) {
            return toHex(hi);
        }
        // Clamp into the data domain first.
        const clamped = Math.max(min, Math.min(max, value));
        if (span === 0) {
            // min === max: single color, never NaN.
            return toHex(hi);
        }
        const t = (transform(clamped) - tMin) / span;
        return toHex(lerpColor(lo, hi, t));
    };

    return { color, min, max, log };
}
