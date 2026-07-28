/**
 * Packaged-bundle smoke test — drives the EXACT shipped .pbiviz artifact
 * (the production webpack bundle, not tsc-compiled source) under jsdom.
 * Catches production-build-only divergences: minification, const-enum
 * handling, module duplication, plugin wiring.
 *
 * Usage: node harness/packaged.cjs .tmp/packaged-resource.json
 */
const fs = require("fs");
const { JSDOM } = require("jsdom");

const resourcePath = process.argv[2] || ".tmp/packaged-resource.json";
const resource = JSON.parse(fs.readFileSync(resourcePath, "utf8"));
const guid = resource.visual.guid;
const js = resource.content.js;

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://localhost/",
    runScripts: "outside-only"
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.SVGElement = window.SVGElement;
global.Element = window.Element;
global.HTMLElement = window.HTMLElement;
global.MouseEvent = window.MouseEvent;
global.KeyboardEvent = window.KeyboardEvent;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
const proto = window.SVGElement.prototype;
proto.getBBox = proto.getBBox || function () {
    return { x: 0, y: 0, width: 110, height: 24 };
};

// The plugin wrapper expects window.powerbi to exist for registration.
window.powerbi = { visuals: { plugins: {} } };

// Evaluate the shipped bundle in the jsdom window realm.
dom.runVMScript
    ? dom.runVMScript(new (require("vm").Script)(js))
    : window.eval(js);

const plugin = window.powerbi.visuals.plugins[guid];
if (!plugin || typeof plugin.create !== "function") {
    console.error("FAIL: plugin not registered under guid", guid);
    process.exit(1);
}
console.log("plugin registered:", plugin.name, "api", plugin.apiVersion);

const failures = [];
const log = [];
const makeSelectionId = (key) => ({
    getKey: () => key,
    getSelector: () => ({ id: key }),
    getSelectorsByColumn: () => ({}),
    equals: (o) => o && o.getKey && o.getKey() === key,
    includes: () => false,
    hasIdentity: () => true
});
const host = {
    eventService: {
        renderingStarted: () => log.push("started"),
        renderingFinished: () => log.push("finished"),
        renderingFailed: (_o, m) => { log.push("FAILED: " + m); failures.push(m); }
    },
    createSelectionManager: () => ({
        getSelectionIds: () => [],
        hasSelection: () => false,
        select: () => Promise.resolve([]),
        clear: () => Promise.resolve({}),
        showContextMenu: () => Promise.resolve({}),
        registerOnSelectCallback: () => undefined
    }),
    createSelectionIdBuilder: () => {
        let key = "empty";
        const b = {
            withCategory: (_c, i) => { key = "row-" + i; return b; },
            withSeries: () => b, withMeasure: () => b,
            withTable: () => b, withMatrixNode: () => b,
            createSelectionId: () => makeSelectionId(key)
        };
        return b;
    },
    colorPalette: {
        isHighContrast: false,
        foreground: { value: "#000000" },
        background: { value: "#FFFFFF" },
        getColor: (k) => ({ value: "#5B9BD5", key: k })
    },
    tooltipService: {
        enabled: () => true, show: () => 0, move: () => 0, hide: () => 0
    },
    hostCapabilities: { allowInteractions: true },
    locale: "en-US",
    persistProperties: () => undefined
};

const element = window.document.createElement("div");
element.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600 });
window.document.body.appendChild(element);

const visual = plugin.create({ element, host, module: undefined });

const geomCol = {
    displayName: "WKT", queryName: "t.WKT",
    roles: { geometry: true }, type: { text: true }, index: 0
};
visual.update({
    dataViews: [{
        metadata: { columns: [geomCol], objects: {} },
        categorical: {
            categories: [{
                source: geomCol,
                values: [
                    "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))",
                    "POINT (5 5)",
                    "LINESTRING (0 0, 10 10)",
                    "MULTIPOLYGON (((20 20, 30 20, 30 30, 20 20)))"
                ]
            }]
        }
    }],
    viewport: { width: 800, height: 600 },
    type: 2
});

const paths = element.querySelectorAll("path.shape");
const zr = element.querySelector("g.zoom-root");
const transform = zr ? zr.getAttribute("transform") : null;
console.log("render log:", log.join(" | "));
console.log("shape paths:", paths.length);
paths.forEach((p, i) => {
    if (i < 2) {
        console.log(`  path[${i}] d=${(p.getAttribute("d") || "NULL").slice(0, 50)} fill=${p.getAttribute("fill")}`);
    }
});
console.log("zoom-root transform:", transform);

let bad = failures.length > 0;
if (paths.length !== 4) { console.error("FAIL: expected 4 paths"); bad = true; }
if (!transform || !/scale\(16/.test(transform)) {
    console.error("FAIL: fit transform missing/incorrect:", transform); bad = true;
}
for (const p of paths) {
    const fill = p.getAttribute("fill");
    if (fill !== "none" && (!fill || /^#?f{3,6}$/i.test(fill.replace("#", "")))) {
        console.error("FAIL: shape painted white/invisible:", fill); bad = true;
    }
}
if (bad) {
    console.error(failures.join("\n"));
    process.exit(1);
}
console.log("PACKAGED SMOKE: passed — shipped bundle renders correctly");
