/**
 * Deterministic category ordering.
 *
 * The host delivers categorical rows in query order, which CHANGES when
 * fields are added/removed (e.g. dropping in a tooltip measure re-sorts the
 * rows). The host color palette assigns theme colors sequentially by FIRST
 * REQUEST per key, so any color/legend/picker logic that walks categories
 * in row order reshuffles whenever the query changes.
 *
 * Everything category-ordered in this visual — palette pre-warming, legend
 * swatch order, formatting-pane picker order — therefore goes through this
 * one function: unique values in a locale-aware, numeric-aware, fully
 * deterministic sort that is independent of row arrival order.
 */
export function uniqueSortedCategories(
    values: ReadonlyArray<string | null | undefined>,
    locale?: string
): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of values) {
        if (v !== null && v !== undefined && !seen.has(v)) {
            seen.add(v);
            out.push(v);
        }
    }
    let collator: Intl.Collator;
    try {
        collator = new Intl.Collator(locale, {
            numeric: true,
            sensitivity: "variant"
        });
    } catch {
        collator = new Intl.Collator(undefined, {
            numeric: true,
            sensitivity: "variant"
        });
    }
    // Code-point tie-break keeps the order total and deterministic even for
    // strings the collator considers equal.
    return out.sort((a, b) =>
        collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0));
}
