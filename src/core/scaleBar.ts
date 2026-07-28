/**
 * Scale bar: snap to the largest 1/2/5 × 10^n value whose bar fits in
 * maxPx. NO unit rollover ever — metres never become km, feet never become
 * miles; the label always prints the chosen unit verbatim.
 */
import { SCALE_BAR_MAX_PX } from "./constants";
import { ScaleBarSpec } from "./types";

/**
 * @param pxPerUnit  screen pixels per one chosen unit at the current zoom
 * @param unitLabel  printed verbatim after the number ("m", "ft", "shelf")
 * @param maxPx     maximum bar length in pixels (default ~120)
 * @param format    number formatter (inject host-locale formatting here)
 */
export function scaleBarSpec(
    pxPerUnit: number,
    unitLabel: string,
    maxPx: number = SCALE_BAR_MAX_PX,
    format: (n: number) => string = (n) => String(n)
): ScaleBarSpec | null {
    if (!isFinite(pxPerUnit) || pxPerUnit <= 0 || maxPx <= 0) {
        return null;
    }
    const targetUnits = maxPx / pxPerUnit;
    if (!isFinite(targetUnits) || targetUnits <= 0) {
        return null;
    }
    const exp = Math.floor(Math.log10(targetUnits));
    const base = Math.pow(10, exp);
    let units = base;
    for (const m of [5, 2, 1]) {
        if (m * base <= targetUnits) {
            units = m * base;
            break;
        }
    }
    const px = units * pxPerUnit;
    return {
        units,
        px,
        label: `${format(units)} ${unitLabel}`.trim()
    };
}
