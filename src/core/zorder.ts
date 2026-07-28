/**
 * Z-order: stable ascending sort (lowest drawn first/underneath); ties
 * preserve input order. When z-order is unbound (every value null) the
 * input order is returned untouched — the visual never guesses z-order.
 * Rows with a missing/non-finite value (when the field is bound) sort as 0.
 */
export function sortZOrder<T extends { zOrder: number | null }>(
    rows: ReadonlyArray<T>
): T[] {
    const copy = rows.slice();
    const bound = copy.some((r) => r.zOrder !== null && r.zOrder !== undefined);
    if (!bound) {
        return copy;
    }
    const z = (r: T): number => {
        const v = r.zOrder;
        return v !== null && v !== undefined && isFinite(v) ? v : 0;
    };
    // Array.prototype.sort is stable (ES2019+), preserving input order on ties.
    return copy.sort((a, b) => z(a) - z(b));
}
