/**
 * Label declutter rule. Estimated width = chars × fontSize × 0.6, compared
 * against the geometry's screen-space bbox width at the current zoom
 * (bbox-at-k=1 × k). Point features use a fixed pixel allowance instead.
 * Empty labels are always hidden.
 */
import {
    LABEL_CHAR_WIDTH_FACTOR,
    POINT_LABEL_ALLOWANCE_PX
} from "./constants";

export function labelVisible(
    text: string | null | undefined,
    fontSize: number,
    /** Geometry bounding-box width in screen px at zoom k = 1. */
    screenBBoxWidth: number,
    isPoint: boolean,
    k: number
): boolean {
    if (!text || text.length === 0) {
        return false;
    }
    const estWidth = text.length * fontSize * LABEL_CHAR_WIDTH_FACTOR;
    if (isPoint) {
        // Labels are counter-scaled (constant screen size) and points have
        // no area, so the allowance is zoom-independent.
        return estWidth <= POINT_LABEL_ALLOWANCE_PX;
    }
    if (!isFinite(screenBBoxWidth) || screenBBoxWidth <= 0) {
        return false;
    }
    return estWidth <= screenBBoxWidth * k;
}
