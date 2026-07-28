import { resolveStyle } from "../src/core/resolveStyle";
import {
    InteractionState,
    MapDatum,
    StyleSettings
} from "../src/core/types";
import {
    DIM_FILL_OPACITY,
    DIM_LABEL_OPACITY,
    DIM_STROKE_OPACITY
} from "../src/core/constants";

function datum(overrides: Partial<MapDatum> = {}): MapDatum {
    return {
        index: 0,
        key: "k0",
        feature: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
        wktType: "POLYGON",
        kind: "area",
        hasPoint: false,
        label: "A1",
        category: null,
        colorValue: null,
        ruleColor: null,
        overrideColor: null,
        zOrder: null,
        ...overrides
    };
}

function settings(overrides: Partial<StyleSettings> = {}): StyleSettings {
    return {
        highContrast: { active: false, foreground: "#FFFFFF", background: "#000000" },
        defaultColor: "#default",
        strokeColor: "#stroke",
        strokeWidth: 1.5,
        selectedStrokeWidth: 3,
        colorScale: null,
        categoryPalette: null,
        ...overrides
    };
}

const none: InteractionState = {
    mode: "none", selectedKeys: new Set(), highlights: null
};

describe("resolveStyle fill priority (each adjacent pair of rungs)", () => {
    test("high contrast > fx rule", () => {
        const s = settings({
            highContrast: { active: true, foreground: "#FG", background: "#BG" }
        });
        const d = datum({ ruleColor: "#rule" });
        const r = resolveStyle(d, none, s);
        expect(r.fill).toBe("#BG");
        expect(r.strokeColor).toBe("#FG");
    });

    test("fx rule > color measure", () => {
        const s = settings({ colorScale: () => "#measure" });
        const d = datum({ ruleColor: "#rule", colorValue: 5 });
        expect(resolveStyle(d, none, s).fill).toBe("#rule");
    });

    test("color measure > category override", () => {
        const s = settings({
            colorScale: () => "#measure",
            categoryPalette: () => "#palette"
        });
        const d = datum({ colorValue: 5, category: "cat", overrideColor: "#override" });
        expect(resolveStyle(d, none, s).fill).toBe("#measure");
    });

    test("category override > palette", () => {
        const s = settings({ categoryPalette: () => "#palette" });
        const d = datum({ category: "cat", overrideColor: "#override" });
        expect(resolveStyle(d, none, s).fill).toBe("#override");
    });

    test("palette > default", () => {
        const s = settings({ categoryPalette: () => "#palette" });
        const d = datum({ category: "cat" });
        expect(resolveStyle(d, none, s).fill).toBe("#palette");
    });

    test("default when nothing else applies", () => {
        expect(resolveStyle(datum(), none, settings()).fill).toBe("#default");
    });
});

describe("resolveStyle line handling", () => {
    test("lines fill none and carry the color on the stroke", () => {
        const d = datum({ kind: "line", ruleColor: "#rule" });
        const r = resolveStyle(d, none, settings());
        expect(r.fill).toBe("none");
        expect(r.strokeColor).toBe("#rule");
    });

    test("areas fill with the color and outline with the stroke color", () => {
        const d = datum({ ruleColor: "#rule" });
        const r = resolveStyle(d, none, settings());
        expect(r.fill).toBe("#rule");
        expect(r.strokeColor).toBe("#stroke");
    });
});

describe("resolveStyle interaction states", () => {
    test("dimmed values for highlights[i] === null in highlight mode", () => {
        const interaction: InteractionState = {
            mode: "highlight",
            selectedKeys: new Set(),
            highlights: [null, 7]
        };
        const r = resolveStyle(datum({ index: 0 }), interaction, settings());
        expect(r.fillOpacity).toBe(DIM_FILL_OPACITY);
        expect(r.strokeOpacity).toBe(DIM_STROKE_OPACITY);
        expect(r.labelOpacity).toBe(DIM_LABEL_OPACITY);
        expect(r.emphasized).toBe(false);
        expect(r.fillOpacity).toBe(0.15);
        expect(r.strokeOpacity).toBe(0.3);
        expect(r.labelOpacity).toBe(0.25);
    });

    test("highlighted datum is emphasized with the selected stroke width", () => {
        const interaction: InteractionState = {
            mode: "highlight",
            selectedKeys: new Set(),
            highlights: [null, 7]
        };
        const r = resolveStyle(datum({ index: 1 }), interaction, settings());
        expect(r.emphasized).toBe(true);
        expect(r.strokeWidth).toBe(3);
        expect(r.fillOpacity).toBe(1);
        expect(r.strokeOpacity).toBe(1);
        expect(r.labelOpacity).toBe(1);
    });

    test("selected datum is emphasized with the selected stroke width", () => {
        const interaction: InteractionState = {
            mode: "selection",
            selectedKeys: new Set(["k1"]),
            highlights: null
        };
        const r = resolveStyle(datum({ key: "k1" }), interaction, settings());
        expect(r.emphasized).toBe(true);
        expect(r.strokeWidth).toBe(3);
    });

    test("mode none → base width and full opacity", () => {
        const r = resolveStyle(datum(), none, settings());
        expect(r.strokeWidth).toBe(1.5);
        expect(r.fillOpacity).toBe(1);
        expect(r.strokeOpacity).toBe(1);
        expect(r.labelOpacity).toBe(1);
        expect(r.emphasized).toBe(false);
    });

    test("selection and highlight modes produce identical dimming", () => {
        const sel: InteractionState = {
            mode: "selection",
            selectedKeys: new Set(["other"]),
            highlights: null
        };
        const hi: InteractionState = {
            mode: "highlight",
            selectedKeys: new Set(),
            highlights: [null]
        };
        const s = settings();
        const a = resolveStyle(datum({ index: 0, key: "k0" }), sel, s);
        const b = resolveStyle(datum({ index: 0, key: "k0" }), hi, s);
        expect(a.fillOpacity).toBe(b.fillOpacity);
        expect(a.strokeOpacity).toBe(b.strokeOpacity);
        expect(a.labelOpacity).toBe(b.labelOpacity);
        expect(a.strokeWidth).toBe(b.strokeWidth);
    });
});
