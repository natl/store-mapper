import { uniqueSortedCategories } from "../src/core/categories";

describe("uniqueSortedCategories", () => {
    test("returns distinct values, dropping null/undefined", () => {
        expect(uniqueSortedCategories(
            ["Food", null, "Retail", "Food", undefined, "Anchor"]))
            .toEqual(["Anchor", "Food", "Retail"]);
    });

    test("order is independent of row arrival order (the palette/legend stability guarantee)", () => {
        const a = uniqueSortedCategories(["Food", "Retail", "Anchor"]);
        const b = uniqueSortedCategories(["Anchor", "Food", "Retail", "Food"]);
        const c = uniqueSortedCategories(["Retail", "Anchor", "Anchor", "Food"]);
        expect(b).toEqual(a);
        expect(c).toEqual(a);
    });

    test("numeric-aware: Bay 2 sorts before Bay 10", () => {
        expect(uniqueSortedCategories(["Bay 10", "Bay 2", "Bay 1"]))
            .toEqual(["Bay 1", "Bay 2", "Bay 10"]);
    });

    test("case-variant values stay distinct and totally ordered", () => {
        const out = uniqueSortedCategories(["food", "Food", "FOOD"]);
        expect(out).toHaveLength(3);
        // Re-running with any input order yields the identical sequence.
        expect(uniqueSortedCategories(["FOOD", "food", "Food"])).toEqual(out);
    });

    test("empty input yields empty output", () => {
        expect(uniqueSortedCategories([])).toEqual([]);
        expect(uniqueSortedCategories([null, undefined])).toEqual([]);
    });

    test("invalid locale falls back instead of throwing", () => {
        expect(uniqueSortedCategories(["b", "a"], "not-a-locale!!!"))
            .toEqual(["a", "b"]);
    });
});
