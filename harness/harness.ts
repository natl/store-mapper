/**
 * Runtime smoke harness — NOT part of the packaged visual.
 * Constructs the real Visual with a mocked IVisualHost and drives update()
 * with realistic data views, then reports what actually rendered.
 */
import powerbi from "powerbi-visuals-api";
import { Visual } from "../src/visual";

type AnyObj = Record<string, unknown>;

function makeSelectionId(key: string): AnyObj {
    return {
        getKey: () => key,
        getSelector: () => ({ id: key }),
        getSelectorsByColumn: () => ({}),
        equals: (o: AnyObj) => o && (o as { getKey?: () => string }).getKey?.() === key,
        includes: () => false,
        hasIdentity: () => true
    };
}

const failures: string[] = [];
const renderLog: string[] = [];
const assertionFailures: string[] = [];

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        assertionFailures.push(msg);
    }
}

function makeHost(): AnyObj {
    return {
        eventService: {
            renderingStarted: () => renderLog.push("started"),
            renderingFinished: () => renderLog.push("finished"),
            renderingFailed: (_o: unknown, msg: string) => {
                renderLog.push("FAILED: " + msg);
                failures.push(msg);
            }
        },
        createSelectionManager: () => ({
            getSelectionIds: () => [],
            hasSelection: () => false,
            select: () => Promise.resolve([]),
            clear: () => Promise.resolve({}),
            showContextMenu: () => Promise.resolve({}),
            registerOnSelectCallback: () => undefined,
            toggleExpandCollapse: () => Promise.resolve({})
        }),
        createSelectionIdBuilder: () => {
            let key = "empty";
            const builder: AnyObj = {
                withCategory: (_c: unknown, i: number) => {
                    key = "row-" + i;
                    return builder;
                },
                withSeries: () => builder,
                withMeasure: () => builder,
                withTable: () => builder,
                withMatrixNode: () => builder,
                createSelectionId: () => makeSelectionId(key)
            };
            return builder;
        },
        colorPalette: (() => {
            // Emulates the real host palette: theme colors assigned
            // sequentially by FIRST REQUEST per key, memoized per instance.
            const theme = ["#101010", "#202020", "#303030", "#404040",
                "#505050", "#606060", "#707070", "#808080"];
            const assigned = new Map<string, string>();
            return {
                isHighContrast: false,
                foreground: { value: "#000000" },
                background: { value: "#FFFFFF" },
                foregroundSelected: { value: "#000000" },
                getColor: (k: string) => {
                    if (!assigned.has(k)) {
                        assigned.set(k, theme[assigned.size % theme.length]);
                    }
                    return { value: assigned.get(k), key: k };
                }
            };
        })(),
        tooltipService: {
            enabled: () => true,
            show: () => undefined,
            move: () => undefined,
            hide: () => undefined
        },
        hostCapabilities: { allowInteractions: true },
        locale: "en-US",
        persistProperties: () => undefined
    };
}

function textColumn(roles: string[], displayName: string): AnyObj {
    const r: AnyObj = {};
    roles.forEach((x) => (r[x] = true));
    return {
        displayName,
        queryName: "t." + displayName,
        roles: r,
        type: { text: true },
        format: undefined,
        isMeasure: false,
        index: 0
    };
}

function numColumn(roles: string[], displayName: string, isMeasure: boolean): AnyObj {
    const r: AnyObj = {};
    roles.forEach((x) => (r[x] = true));
    return {
        displayName,
        queryName: "t." + displayName,
        roles: r,
        type: { numeric: true },
        format: "0.00",
        isMeasure,
        index: 1
    };
}

function report(name: string, root: HTMLElement): void {
    const paths = Array.from(root.querySelectorAll("path.shape"));
    const labels = Array.from(root.querySelectorAll("text.shape-label"));
    const zr = root.querySelector("g.zoom-root");
    const sb = root.querySelectorAll("g.scale-bar *");
    const lg = root.querySelectorAll("g.legend *");
    console.log(`\n=== ${name} ===`);
    console.log("render log:", renderLog.join(" | "));
    console.log("shape paths:", paths.length);
    paths.slice(0, 4).forEach((p, i) => {
        const d = p.getAttribute("d");
        console.log(`  path[${i}] d=${d === null ? "NULL" : d.slice(0, 70)}`);
        console.log(`           fill=${p.getAttribute("fill")} stroke=${p.getAttribute("stroke")} sw=${p.getAttribute("stroke-width")} fo=${p.getAttribute("fill-opacity")}`);
    });
    console.log("labels:", labels.length,
        labels.slice(0, 3).map((l) => `${l.textContent}@${l.getAttribute("transform")}`));
    console.log("zoom-root transform:", zr ? zr.getAttribute("transform") : "MISSING");
    console.log("scale-bar nodes:", sb.length, "legend nodes:", lg.length);
    renderLog.length = 0;
}

// ----------------------------------------------------------------------- //

const element = document.createElement("div");
Object.defineProperty(element, "getBoundingClientRect", {
    value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 })
});
document.body.appendChild(element);

const host = makeHost();
const visual = new Visual({
    element,
    host: host as never,
    module: undefined
} as never);

// --- Scenario 1: ONLY the Geometry field bound (the user's repro) ------- //
const wkt = [
    "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))",
    "POINT (5 5)",
    "LINESTRING (0 0, 10 10)",
    "MULTIPOLYGON (((20 20, 30 20, 30 30, 20 20)))"
];
const geomCol = textColumn(["geometry"], "WKT");
const dv1: AnyObj = {
    metadata: { columns: [geomCol], objects: {} },
    categorical: {
        categories: [{ source: geomCol, values: wkt, identity: wkt.map((_, i) => ({ i })) }]
    }
};
visual.update({
    dataViews: [dv1],
    viewport: { width: 800, height: 600 },
    type: 2 // VisualUpdateType.Data
} as never);
report("Scenario 1: geometry only", element);
// Fit math for bounds (0,0)-(30,30) in 800x600 with flipY:
// k = min(800*0.8, 600*0.8)/30 = 16; tx = 400-16*15 = 160; ty = 300+16*15 = 540.
{
    const zr = element.querySelector("g.zoom-root");
    const t = zr ? zr.getAttribute("transform") : null;
    assert(t !== null, "fit transform must be applied to the zoom root");
    const m = t ? /translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+)/.exec(t) : null;
    assert(m !== null, "zoom-root transform must be translate(...) scale(...)");
    if (m) {
        assert(Math.abs(parseFloat(m[1]) - 160) < 1e-6, "fit tx must be 160, got " + m[1]);
        assert(Math.abs(parseFloat(m[2]) - 540) < 1e-6, "fit ty must be 540, got " + m[2]);
        assert(Math.abs(parseFloat(m[3]) - 16) < 1e-6, "fit k must be 16, got " + m[3]);
        // Every shape's data-space corner must land inside the viewport.
        const k = parseFloat(m[3]), tx = parseFloat(m[1]), ty = parseFloat(m[2]);
        const corners: Array<[number, number]> = [[0, 0], [30, 30], [5, 5]];
        for (const [x, y] of corners) {
            const sx = k * x + tx, sy = k * -y + ty;
            assert(sx >= 0 && sx <= 800 && sy >= 0 && sy <= 600,
                `data point (${x},${y}) must land on-screen, got (${sx},${sy})`);
        }
    }
    assert(element.querySelectorAll("path.shape").length === wkt.length,
        "geometry-only binding must render every parsed row");
}

// --- Scenario 2: geometry + label + category + color measure + zOrder --- //
const labelCol = textColumn(["label"], "Bay");
const catCol = textColumn(["colorCategory"], "Tenant type");
const zCol = numColumn(["zOrder"], "Z", false);
const measureCol = numColumn(["colorValue"], "Sales", true);
const dv2: AnyObj = {
    metadata: { columns: [geomCol, labelCol, catCol, zCol, measureCol], objects: {} },
    categorical: {
        categories: [
            { source: geomCol, values: wkt },
            { source: labelCol, values: ["A1", "A2", "A3", "A4"] },
            { source: catCol, values: ["Food", "Retail", "Food", "Anchor"] },
            { source: zCol, values: [2, 1, 3, 0] }
        ],
        values: [
            { source: measureCol, values: [10, 250, 40, 1000] }
        ]
    }
};
visual.update({
    dataViews: [dv2],
    viewport: { width: 800, height: 600 },
    type: 2
} as never);
report("Scenario 2: all fields", element);

// --- Scenario 3: highlights (cross-highlight) --------------------------- //
const dv3 = JSON.parse(JSON.stringify(dv2)) as AnyObj;
((dv3.categorical as AnyObj).values as AnyObj[])[0].highlights = [null, 250, null, 1000];
visual.update({
    dataViews: [dv3],
    viewport: { width: 800, height: 600 },
    type: 2
} as never);
report("Scenario 3: highlights", element);

// --- Scenario 4: WKT with leading/trailing whitespace -------------------- //
const dirtyWkt = wkt.map((w) => "  " + w + " \n");
const dv4: AnyObj = {
    metadata: { columns: [geomCol], objects: {} },
    categorical: {
        categories: [{ source: geomCol, values: dirtyWkt }]
    }
};
visual.update({
    dataViews: [dv4],
    viewport: { width: 800, height: 600 },
    type: 2
} as never);
report("Scenario 4: whitespace-padded WKT", element);
assert(element.querySelectorAll("path.shape").length === wkt.length,
    "whitespace-padded WKT must still render every row");

// --- Scenario 5: empty data ---------------------------------------------- //
visual.update({
    dataViews: [{ metadata: { columns: [] } }],
    viewport: { width: 800, height: 600 },
    type: 2
} as never);
report("Scenario 5: empty data", element);
assert(element.querySelectorAll("path.shape").length === 0,
    "empty data must clear the canvas");

// --- Scenario 6: geometry bound but NO row parses ------------------------ //
const dv6: AnyObj = {
    metadata: { columns: [geomCol], objects: {} },
    categorical: {
        categories: [{
            source: geomCol,
            values: ["CURVEPOLYGON (...)", "not wkt", "POINT EMPTY"]
        }]
    }
};
visual.update({
    dataViews: [dv6],
    viewport: { width: 800, height: 600 },
    type: 2
} as never);
report("Scenario 6: all rows unparseable", element);
{
    const statusTexts = Array.from(
        element.querySelectorAll("g.status text"))
        .map((t) => t.textContent ?? "");
    assert(statusTexts.length > 0,
        "all-rows-unparseable must show the on-canvas diagnostic");
    assert(statusTexts.some((t) => t.includes("0 of 3")),
        "diagnostic must report the row counts, got: " + statusTexts.join(" / "));
    assert(element.querySelectorAll("path.shape").length === 0,
        "no shapes when nothing parses");
}

// --- Scenario 7: M/ZM dimension tokens render ----------------------------- //
const dv7: AnyObj = {
    metadata: { columns: [geomCol], objects: {} },
    categorical: {
        categories: [{
            source: geomCol,
            values: [
                "POLYGON ZM ((0 0 1 2, 10 0 1 2, 10 10 1 2, 0 0 1 2))",
                "POINT M (5 5 9)"
            ]
        }]
    }
};
visual.update({
    dataViews: [dv7],
    viewport: { width: 800, height: 600 },
    type: 2
} as never);
report("Scenario 7: M/ZM dimension tokens", element);
assert(element.querySelectorAll("path.shape").length === 2,
    "M/ZM-token WKT must render");
assert(element.querySelectorAll("g.status text").length === 0,
    "diagnostic must clear once rows parse");

visual.destroy();

// --- Scenario 8: category colors + legend stable across field changes --- //
// Repro of "category colouring changes when I drop in a new tooltip
// element" + "it also changes the legend sorting": adding a field re-sorts
// the data view rows AND typically re-instantiates the visual (fresh
// palette). Per-category colors and legend order must not change.
function categoryRun(
    rows: Array<[string, string]>, withTooltip: boolean
): { fills: Map<string, string>; legend: string[] } {
    const el = document.createElement("div");
    Object.defineProperty(el, "getBoundingClientRect", {
        value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 })
    });
    document.body.appendChild(el);
    const h = makeHost();
    const v = new Visual({ element: el, host: h as never, module: undefined } as never);
    const gCol = textColumn(["geometry"], "WKT");
    const cCol = textColumn(["colorCategory"], "Tenant type");
    const lCol = textColumn(["label"], "Name");
    const dv: AnyObj = {
        metadata: { columns: [gCol, cCol, lCol], objects: {} },
        categorical: {
            categories: [
                { source: gCol, values: rows.map((r) => r[0]) },
                { source: cCol, values: rows.map((r) => r[1]) },
                { source: lCol, values: rows.map((r) => r[1]) }
            ],
            values: withTooltip
                ? [{ source: numColumn(["tooltips"], "Visits", true), values: rows.map((_, i) => i * 10) }]
                : []
        }
    };
    v.update({ dataViews: [dv], viewport: { width: 800, height: 600 }, type: 2 } as never);
    const fills = new Map<string, string>();
    el.querySelectorAll("path.shape").forEach((p) => {
        const cat = p.getAttribute("aria-label");
        if (cat && p.getAttribute("fill") !== "none") {
            fills.set(cat, p.getAttribute("fill") as string);
        }
    });
    const legend = Array.from(el.querySelectorAll("g.legend text"))
        .map((t) => t.textContent as string);
    v.destroy();
    el.remove();
    return { fills, legend };
}

const baseRows: Array<[string, string]> = [
    ["POLYGON ((0 0, 10 0, 10 10, 0 0))", "Food"],
    ["POLYGON ((20 0, 30 0, 30 10, 20 0))", "Retail"],
    ["POLYGON ((40 0, 50 0, 50 10, 40 0))", "Anchor"],
    ["POLYGON ((60 0, 70 0, 70 10, 60 0))", "Food"]
];
const runA = categoryRun(baseRows, false);
const runB = categoryRun(baseRows.slice().reverse(), true);
console.log("\n=== Scenario 8: category color stability ===");
console.log("run A fills:", Array.from(runA.fills.entries()));
console.log("run B fills:", Array.from(runB.fills.entries()));
console.log("legend A:", runA.legend, " legend B:", runB.legend);
for (const [cat, fill] of runA.fills) {
    assert(runB.fills.get(cat) === fill,
        `category "${cat}" color must survive row reorder + added tooltip ` +
        `(was ${fill}, became ${runB.fills.get(cat)})`);
}
assert(JSON.stringify(runA.legend) === JSON.stringify(runB.legend),
    "legend order must not change when fields are added");
assert(JSON.stringify(runA.legend) === JSON.stringify(["Anchor", "Food", "Retail"]),
    "legend must list categories in deterministic sorted order");

// --- Scenario 9: highlight dimming with category colors ----------------- //
// Repro of "highlighting isn't being applied when I am using category
// colours": with a tooltip measure carrying the highlights channel,
// non-highlighted shapes must dim and highlighted ones must emphasize.
{
    const el = document.createElement("div");
    Object.defineProperty(el, "getBoundingClientRect", {
        value: () => ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 })
    });
    document.body.appendChild(el);
    const h = makeHost();
    const v = new Visual({ element: el, host: h as never, module: undefined } as never);
    const gCol = textColumn(["geometry"], "WKT");
    const cCol = textColumn(["colorCategory"], "Tenant type");
    const tCol = numColumn(["tooltips"], "Visits", true);
    const dv: AnyObj = {
        metadata: { columns: [gCol, cCol, tCol], objects: {} },
        categorical: {
            categories: [
                { source: gCol, values: baseRows.map((r) => r[0]) },
                { source: cCol, values: baseRows.map((r) => r[1]) }
            ],
            values: [{
                source: tCol,
                values: [5, 10, 15, 20],
                highlights: [null, 10, null, 20]
            }]
        }
    };
    v.update({ dataViews: [dv], viewport: { width: 800, height: 600 }, type: 2 } as never);
    const paths = Array.from(el.querySelectorAll("path.shape"));
    const dimmed = paths.filter((p) => p.getAttribute("fill-opacity") === "0.15");
    const emphasized = paths.filter((p) =>
        p.getAttribute("stroke-width") === "3" &&
        p.getAttribute("fill-opacity") === "1");
    console.log("\n=== Scenario 9: highlights with category colors ===");
    console.log("dimmed:", dimmed.length, "emphasized:", emphasized.length);
    assert(dimmed.length === 2,
        "exactly 2 shapes must dim under highlights with category colors, got " + dimmed.length);
    assert(emphasized.length === 2,
        "exactly 2 shapes must emphasize under highlights with category colors, got " + emphasized.length);
    // Dimmed shapes keep their CATEGORY color (paint-level alpha only).
    for (const p of dimmed) {
        assert(p.getAttribute("fill") !== null && p.getAttribute("fill") !== "none",
            "dimmed shapes must keep their category fill");
    }
    v.destroy();
    el.remove();
}

console.log("\nrenderingFailed count:", failures.length);
console.log("assertion failures:", assertionFailures.length);
assertionFailures.forEach((a) => console.log("  ASSERT:", a));
if (failures.length > 0 || assertionFailures.length > 0) {
    console.log(failures.join("\n"));
    process.exitCode = 1;
} else {
    console.log("SMOKE: all scenarios passed");
}
// keep the powerbi import alive so tsc retains ambient types
void powerbi;
