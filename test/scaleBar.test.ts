import { scaleBarSpec } from "../src/core/scaleBar";

describe("scaleBarSpec", () => {
    test.each([
        // [pxPerUnit, expected snapped units]
        [1, 100],        // target 120 → 100
        [0.5, 200],      // target 240 → 200
        [0.1, 1000],     // target 1200 → 1000
        [2, 50],         // target 60 → 50
        [10, 10],        // target 12 → 10
        [60, 2],         // target 2 → 2
        [0.024, 5000],   // target 5000 → 5000
        [0.001, 100000], // extreme: 120,000 units target → 100,000
        [50000, 0.002],  // extreme: 0.0024 units target → 0.002
    ])("pxPerUnit=%p snaps to the largest 1/2/5×10^n ≤ ~120px (%p units)",
        (pxPerUnit, expectedUnits) => {
            const spec = scaleBarSpec(pxPerUnit as number, "m");
            expect(spec).not.toBeNull();
            expect(spec!.units).toBeCloseTo(expectedUnits as number,
                (expectedUnits as number) < 1 ? 6 : 0);
            expect(spec!.px).toBeLessThanOrEqual(120 + 1e-9);
            // The bar uses most of the budget: next step up (within the
            // 1/2/5 ladder, ≤ 2.5x) would exceed maxPx.
            expect(spec!.px).toBeGreaterThan(120 / 2.5 - 1e-9);
        });

    test("no unit rollover ever occurs — metres never become km", () => {
        const spec = scaleBarSpec(0.024, "m");
        expect(spec!.units).toBe(5000);
        expect(spec!.label).toBe("5000 m");
        expect(spec!.label).not.toContain("km");
    });

    test("custom unit label passes through verbatim", () => {
        const spec = scaleBarSpec(0.06, "shelf");
        expect(spec!.units).toBe(2000);
        expect(spec!.label).toBe("2000 shelf");
    });

    test("feet never become miles", () => {
        const spec = scaleBarSpec(0.00001, "ft");
        expect(spec!.label.endsWith(" ft")).toBe(true);
        expect(spec!.label).not.toContain("mi");
    });

    test("injected formatter is used for the number", () => {
        const spec = scaleBarSpec(0.024, "m", 120, (n) => `<${n}>`);
        expect(spec!.label).toBe("<5000> m");
    });

    test("invalid px-per-unit returns null", () => {
        expect(scaleBarSpec(0, "m")).toBeNull();
        expect(scaleBarSpec(-1, "m")).toBeNull();
        expect(scaleBarSpec(NaN, "m")).toBeNull();
        expect(scaleBarSpec(Infinity, "m")).toBeNull();
    });
});
