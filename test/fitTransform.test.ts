import {
    computeFitTransform,
    geometryBounds,
    geometrySignature
} from "../src/core/fitTransform";
import { GeoJsonGeometry } from "../src/core/types";

const square = (x: number, y: number, size: number): GeoJsonGeometry => ({
    type: "Polygon",
    coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y]]]
});

describe("geometrySignature", () => {
    test("same geometry set → equal signature (highlights/formatting changes do not refit)", () => {
        const a = [square(0, 0, 10), square(20, 20, 5)];
        const b = [square(0, 0, 10), square(20, 20, 5)];
        expect(geometrySignature(a)).toBe(geometrySignature(b));
    });

    test("added or removed feature → different signature", () => {
        const base = [square(0, 0, 10)];
        const added = [square(0, 0, 10), square(2, 2, 1)];
        expect(geometrySignature(base)).not.toBe(geometrySignature(added));
    });

    test("changed bounds → different signature", () => {
        expect(geometrySignature([square(0, 0, 10)]))
            .not.toBe(geometrySignature([square(0, 0, 11)]));
    });

    test("empty data → defined behavior", () => {
        expect(geometrySignature([])).toBe("0|empty");
    });
});

describe("computeFitTransform", () => {
    const viewport = { width: 1000, height: 500 };

    function screenOf(
        x: number, y: number, fit: { k: number; tx: number; ty: number },
        flipY: boolean
    ): [number, number] {
        const fy = flipY ? -y : y;
        return [fit.k * x + fit.tx, fit.k * fy + fit.ty];
    }

    test.each([true, false])(
        "bounds + 10%% padding centers content (flipY=%s)", (flipY) => {
            const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
            const fit = computeFitTransform(bounds, viewport, flipY);
            // Content is limited by the 500px height: k = 500*0.8/100 = 4.
            expect(fit.k).toBeCloseTo(4);
            const [cx, cy] = screenOf(50, 50, fit, flipY);
            expect(cx).toBeCloseTo(500);
            expect(cy).toBeCloseTo(250);
            // Content stays inside the viewport with padding.
            const corners = [
                screenOf(0, 0, fit, flipY),
                screenOf(100, 100, fit, flipY)
            ];
            for (const [sx, sy] of corners) {
                expect(sx).toBeGreaterThanOrEqual(0);
                expect(sx).toBeLessThanOrEqual(viewport.width);
                expect(sy).toBeGreaterThanOrEqual(0);
                expect(sy).toBeLessThanOrEqual(viewport.height);
            }
        });

    test("degenerate bounds: single point produces no Infinity/NaN", () => {
        const fit = computeFitTransform(
            { minX: 5, minY: 5, maxX: 5, maxY: 5 }, viewport, true);
        expect(isFinite(fit.k) && fit.k > 0).toBe(true);
        expect(isFinite(fit.tx)).toBe(true);
        expect(isFinite(fit.ty)).toBe(true);
        const [sx, sy] = [fit.k * 5 + fit.tx, fit.k * -5 + fit.ty];
        expect(sx).toBeCloseTo(500);
        expect(sy).toBeCloseTo(250);
    });

    test("degenerate bounds: zero-height line produces no Infinity/NaN", () => {
        const fit = computeFitTransform(
            { minX: 0, minY: 10, maxX: 100, maxY: 10 }, viewport, false);
        expect(isFinite(fit.k) && fit.k > 0).toBe(true);
        expect(fit.k).toBeCloseTo((1000 * 0.8) / 100);
        expect(isFinite(fit.tx)).toBe(true);
        expect(isFinite(fit.ty)).toBe(true);
    });

    test("geometryBounds returns null for an empty set", () => {
        expect(geometryBounds([])).toBeNull();
    });
});
