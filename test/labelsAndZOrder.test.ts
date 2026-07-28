import { labelVisible } from "../src/core/labels";
import { sortZOrder } from "../src/core/zorder";

describe("labelVisible", () => {
    // "Bay 12" = 6 chars × 10px × 0.6 = 36px estimated width.
    test("hidden when estimated width exceeds bbox width at k=1, shown at k=4 when it then fits", () => {
        expect(labelVisible("Bay 12", 10, 20, false, 1)).toBe(false);
        expect(labelVisible("Bay 12", 10, 20, false, 4)).toBe(true);
    });

    test("point features use the fixed 60px allowance instead of bbox width", () => {
        // 9 chars × 10 × 0.6 = 54 ≤ 60 → visible regardless of bbox/zoom.
        expect(labelVisible("Shop 1234", 10, 0, true, 1)).toBe(true);
        // 11 chars × 10 × 0.6 = 66 > 60 → hidden even when zoomed in.
        expect(labelVisible("Shop 123456", 10, 1000, true, 8)).toBe(false);
    });

    test("empty label → hidden", () => {
        expect(labelVisible("", 10, 1000, false, 10)).toBe(false);
        expect(labelVisible(null, 10, 1000, false, 10)).toBe(false);
        expect(labelVisible(undefined, 10, 1000, true, 10)).toBe(false);
    });

    test("non-finite or zero bbox width hides non-point labels", () => {
        expect(labelVisible("A", 10, 0, false, 10)).toBe(false);
        expect(labelVisible("A", 10, NaN, false, 10)).toBe(false);
    });
});

describe("sortZOrder", () => {
    test("sorts ascending (lowest drawn first/underneath)", () => {
        const rows = [
            { id: "a", zOrder: 3 },
            { id: "b", zOrder: 1 },
            { id: "c", zOrder: 2 }
        ];
        expect(sortZOrder(rows).map((r) => r.id)).toEqual(["b", "c", "a"]);
    });

    test("ties preserve input order (stable sort)", () => {
        const rows = [
            { id: "a", zOrder: 1 },
            { id: "b", zOrder: 0 },
            { id: "c", zOrder: 1 },
            { id: "d", zOrder: 1 },
            { id: "e", zOrder: 0 }
        ];
        expect(sortZOrder(rows).map((r) => r.id))
            .toEqual(["b", "e", "a", "c", "d"]);
    });

    test("unbound z-order (all null) → input order untouched", () => {
        const rows = [
            { id: "x", zOrder: null },
            { id: "y", zOrder: null },
            { id: "z", zOrder: null }
        ];
        expect(sortZOrder(rows).map((r) => r.id)).toEqual(["x", "y", "z"]);
    });

    test("does not mutate the input array", () => {
        const rows = [
            { id: "a", zOrder: 2 },
            { id: "b", zOrder: 1 }
        ];
        sortZOrder(rows);
        expect(rows.map((r) => r.id)).toEqual(["a", "b"]);
    });
});
