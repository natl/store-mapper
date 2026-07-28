import { buildColorScale } from "../src/core/colorScale";

const BLACK_TO_WHITE = {
    minColor: "#000000",
    maxColor: "#FFFFFF",
    logScale: false
};

describe("buildColorScale", () => {
    test("returns null when no finite numeric values exist", () => {
        expect(buildColorScale([], BLACK_TO_WHITE)).toBeNull();
        expect(buildColorScale([null, undefined, "x"], BLACK_TO_WHITE)).toBeNull();
    });

    test("linear scale maps min and max to the endpoint colors", () => {
        const s = buildColorScale([0, 10], BLACK_TO_WHITE);
        expect(s).not.toBeNull();
        expect(s!.color(0)).toBe("#000000");
        expect(s!.color(10)).toBe("#ffffff");
        expect(s!.color(5)).toBe("#808080");
        expect(s!.log).toBe(false);
    });

    test("log(x+1) is applied when the toggle is on and all values >= 0", () => {
        const s = buildColorScale([0, 99], { ...BLACK_TO_WHITE, logScale: true });
        expect(s!.log).toBe(true);
        // log(9+1)/log(99+1) = 1/2 → midpoint gray well below linear t≈0.09
        expect(s!.color(9)).toBe("#808080");
    });

    test("silently falls back to linear when any value < 0", () => {
        const s = buildColorScale([-5, 10], { ...BLACK_TO_WHITE, logScale: true });
        expect(s!.log).toBe(false);
        expect(s!.color(2.5)).toBe("#808080"); // linear midpoint of [-5, 10]
    });

    test("min === max returns a single color with no NaN", () => {
        const s = buildColorScale([7, 7, 7], BLACK_TO_WHITE);
        const c = s!.color(7);
        expect(c).toMatch(/^#[0-9a-f]{6}$/);
        expect(c).not.toContain("NaN");
        expect(s!.color(123)).toBe(c);
    });

    test("clamps values outside [min, max]", () => {
        const s = buildColorScale([0, 10], BLACK_TO_WHITE);
        expect(s!.color(-100)).toBe("#000000");
        expect(s!.color(1e9)).toBe("#ffffff");
    });

    test("non-numeric entries are ignored when computing the domain", () => {
        const s = buildColorScale([null, 2, undefined, 8, "junk"], BLACK_TO_WHITE);
        expect(s!.min).toBe(2);
        expect(s!.max).toBe(8);
    });
});
