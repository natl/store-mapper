import { sampleFxGradient } from "../src/core/fxLegend";

describe("sampleFxGradient", () => {
    test("returns null when there are no usable pairs", () => {
        expect(sampleFxGradient([])).toBeNull();
        expect(sampleFxGradient([{ value: NaN, color: "#fff" }])).toBeNull();
    });

    test("samples stops by nearest value across the range (bucket rule)", () => {
        // A bucket rule: values < 50 are red, >= 50 are blue.
        const pairs = [
            { value: 0, color: "#red" },
            { value: 40, color: "#red" },
            { value: 60, color: "#blue" },
            { value: 100, color: "#blue" }
        ];
        const grad = sampleFxGradient(pairs, 10);
        expect(grad).not.toBeNull();
        expect(grad!.min).toBe(0);
        expect(grad!.max).toBe(100);
        expect(grad!.stops[0]).toBe("#red");
        expect(grad!.stops[grad!.stops.length - 1]).toBe("#blue");
        // Buckets render as a hard-ish transition, not a fabricated blend.
        expect(new Set(grad!.stops)).toEqual(new Set(["#red", "#blue"]));
    });

    test("min/max labels come from real data and input order does not matter", () => {
        const grad = sampleFxGradient([
            { value: 9, color: "#c" },
            { value: -3, color: "#a" },
            { value: 5, color: "#b" }
        ], 5);
        expect(grad!.min).toBe(-3);
        expect(grad!.max).toBe(9);
        expect(grad!.stops[0]).toBe("#a");
        expect(grad!.stops[4]).toBe("#c");
    });

    test("a single pair yields a uniform gradient with no NaN", () => {
        const grad = sampleFxGradient([{ value: 5, color: "#only" }], 8);
        expect(grad!.stops).toHaveLength(8);
        expect(grad!.stops.every((s) => s === "#only")).toBe(true);
        expect(grad!.min).toBe(5);
        expect(grad!.max).toBe(5);
    });
});
