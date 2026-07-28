/*
 *  WKT Map — Power BI custom visual for planar x/y WKT geometries.
 *
 *  visual.ts is a thin shell: host wiring, DOM, D3 binding and event
 *  handlers. All non-trivial logic lives in src/core/ as pure functions.
 *
 *  Paint discipline: ALL fill/stroke/opacity attributes on shapes and
 *  labels are applied in exactly ONE place (applyStyles), which reads the
 *  single render-state resolver core/resolveStyle. The draw routine and the
 *  interaction handlers both call applyStyles; nothing else sets paint.
 */
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import { select as d3Select, Selection as D3Selection } from "d3-selection";
import {
    zoom as d3Zoom,
    zoomIdentity,
    ZoomBehavior,
    ZoomTransform,
    D3ZoomEvent
} from "d3-zoom";
import { geoPath, geoTransform, GeoPath } from "d3-geo";
import "./../style/visual.less";

import IVisual = powerbi.extensibility.visual.IVisual;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import DataViewCategorical = powerbi.DataViewCategorical;
import DataViewCategoryColumn = powerbi.DataViewCategoryColumn;
import DataViewValueColumn = powerbi.DataViewValueColumn;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import VisualUpdateType = powerbi.VisualUpdateType;

import {
    buildColorScale,
    computeFitTransform,
    geometryBounds,
    geometrySignature,
    labelVisible,
    parseRows,
    resolveStyle,
    sampleFxGradient,
    scaleBarSpec,
    sortZOrder,
    uniqueSortedCategories,
    ColorScaleResult,
    InteractionState,
    MapDatum,
    StyleSettings,
    MAX_CATEGORY_COLOR_SLICES,
    MAX_LEGEND_SWATCHES,
    PINNED,
    SCALE_BAR_MAX_PX
} from "./core";
import { VisualFormattingSettingsModel } from "./settings";

interface ShellDatum extends MapDatum {
    selectionId: ISelectionId;
    tooltipItems: VisualTooltipDataItem[];
    /** Path centroid in identity (pre-zoom) screen space. */
    centroid: [number, number] | null;
    /** Geometry bbox width in screen px at zoom k = 1. */
    bboxWidth: number;
}

type SvgSel = D3Selection<SVGSVGElement, unknown, null, undefined>;
type GroupSel = D3Selection<SVGGElement, unknown, null, undefined>;
type PathSel = D3Selection<SVGPathElement, ShellDatum, SVGGElement, unknown>;
type TextSel = D3Selection<SVGTextElement, ShellDatum, SVGGElement, unknown>;

const BASE_POINT_RADIUS = 4;
const LEGEND_MARGIN = 8;
const LEGEND_BUTTON_CLEARANCE = 40;
const LEGEND_SCALEBAR_CLEARANCE = 28;

/** Static instance counter for unique SVG gradient ids (Math.random is
 *  banned by the certification lint ruleset). */
let instanceCounter = 0;

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private selectionManager: ISelectionManager;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;
    private allowInteractions: boolean;
    private locale: string;
    private instanceId: number;

    private rootElement: HTMLElement;
    private svg: SvgSel;
    private defs: D3Selection<SVGDefsElement, unknown, null, undefined>;
    private zoomRoot: GroupSel;
    private shapesGroup: GroupSel;
    private labelsGroup: GroupSel;
    private legendGroup: GroupSel;
    private statusGroup: GroupSel;
    private scaleBarGroup: GroupSel;
    private buttonsContainer: HTMLDivElement;
    private buttons: HTMLButtonElement[] = [];

    private zoomBehavior: ZoomBehavior<SVGSVGElement, unknown>;
    private currentTransform: ZoomTransform = zoomIdentity;
    private fitTransform: ZoomTransform = zoomIdentity;
    private pathGen: GeoPath;
    private flipY: boolean = true;

    private datums: ShellDatum[] = [];
    private sortedDatums: ShellDatum[] = [];
    private shapePaths: PathSel;
    private labelTexts: TextSel;
    private highlights: ReadonlyArray<unknown> | null = null;
    /** Distinct Color Category values in deterministic sorted order
     *  (row-order independent). Drives palette assignment, legend
     *  swatch order, and the Category colors pane. */
    private sortedCategories: string[] = [];
    /** Category value -> theme color, captured at pre-warm time so the
     *  mapping is explicit rather than relying on palette memoization. */
    private categoryColorMap: Map<string, string> = new Map();
    /** Category value -> user override (dataColors.fill). */
    private categoryOverrides: ReadonlyMap<string, string> = new Map();
    private styleSettings: StyleSettings;
    private colorScale: ColorScaleResult | null = null;
    private colorValueFormat: string | undefined;
    private lastSignature: string = "";
    private viewport: powerbi.IViewport = { width: 0, height: 0 };
    private svgKeydownListener: (e: KeyboardEvent) => void;
    /** Parse diagnostics: when geometry is bound but zero rows parse, the
     *  visual explains itself on canvas instead of rendering silent white. */
    private parseStats = {
        total: 0,
        parsed: 0,
        firstFailure: null as string | null
    };

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.formattingSettingsService = new FormattingSettingsService();
        this.formattingSettings = new VisualFormattingSettingsModel();
        this.allowInteractions = options.host.hostCapabilities.allowInteractions ?? true;
        this.locale = options.host.locale;
        this.instanceId = instanceCounter++;

        this.rootElement = options.element;
        this.rootElement.classList.add("wkt-map-root");

        this.svg = d3Select(this.rootElement)
            .append("svg")
            .classed("wkt-map-svg", true)
            .attr("role", "group")
            .attr("aria-label",
                "WKT map. Planar geometry map. Use Tab to focus shapes, " +
                "Enter or Space to select, Escape to clear the selection.");
        this.defs = this.svg.append("defs");
        this.zoomRoot = this.svg.append("g").classed("zoom-root", true);
        this.shapesGroup = this.zoomRoot.append("g").classed("shapes", true);
        this.labelsGroup = this.zoomRoot.append("g").classed("labels", true);
        this.scaleBarGroup = this.svg.append("g").classed("scale-bar", true);
        this.legendGroup = this.svg.append("g").classed("legend", true);
        this.statusGroup = this.svg.append("g").classed("status", true);
        this.shapePaths = this.shapesGroup
            .selectAll<SVGPathElement, ShellDatum>("path.shape");
        this.labelTexts = this.labelsGroup
            .selectAll<SVGTextElement, ShellDatum>("text.shape-label");

        this.pathGen = this.buildPathGenerator(1);

        // Zoom buttons (HTML, textContent only — never innerHTML).
        this.buttonsContainer = document.createElement("div");
        this.buttonsContainer.className = "wkt-map-buttons";
        const mkButton = (
            text: string, label: string, onClick: () => void
        ): HTMLButtonElement => {
            const b = document.createElement("button");
            b.type = "button";
            b.textContent = text;
            b.setAttribute("aria-label", label);
            b.title = label;
            b.addEventListener("click", onClick);
            this.buttonsContainer.appendChild(b);
            this.buttons.push(b);
            return b;
        };
        mkButton("+", "Zoom in", () => this.zoomBy(1.4));
        mkButton("\u2212", "Zoom out", () => this.zoomBy(1 / 1.4));
        mkButton("\u27F2", "Reset view", () => this.resetView());
        this.rootElement.appendChild(this.buttonsContainer);

        // Pan/zoom: wheel + drag. The scale extent is set relative to the
        // auto-fit scale every time the fit is recomputed (never absolute).
        this.zoomBehavior = d3Zoom<SVGSVGElement, unknown>()
            .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
                this.onZoomFrame(event.transform);
            })
            .on("end", () => this.declutterLabels());
        this.svg.call(this.zoomBehavior);

        // Background interactions.
        this.svg.on("click", () => {
            if (!this.allowInteractions) { return; }
            this.selectionManager.clear().then(() => this.applyStyles());
        });
        this.svg.on("contextmenu", (event: MouseEvent) => {
            event.preventDefault();
            const emptyId = this.host.createSelectionIdBuilder()
                .createSelectionId() as ISelectionId;
            this.selectionManager.showContextMenu(emptyId, {
                x: event.clientX,
                y: event.clientY
            });
        });
        this.svgKeydownListener = (event: KeyboardEvent) => {
            if (event.key === "Escape" && this.allowInteractions) {
                this.selectionManager.clear().then(() => this.applyStyles());
            }
        };
        this.rootElement.addEventListener("keydown", this.svgKeydownListener);

        // Bookmarks restore selection only; the view is restored with the
        // reset button (view state is deliberately not persisted).
        this.selectionManager.registerOnSelectCallback(() => this.applyStyles());
    }

    // ------------------------------------------------------------------ //
    // Update pipeline
    // ------------------------------------------------------------------ //

    public update(options: VisualUpdateOptions): void {
        this.events.renderingStarted(options);
        try {
            this.formattingSettings = this.formattingSettingsService
                .populateFormattingSettingsModel(
                    VisualFormattingSettingsModel, options.dataViews?.[0]);
            this.applySettingsVisibility();

            this.viewport = options.viewport;
            this.svg
                .attr("width", Math.max(0, options.viewport.width))
                .attr("height", Math.max(0, options.viewport.height));
            // The zoom extent must come from the host viewport, never from
            // d3-zoom's default extent (which measures the live SVG element
            // and can throw or mis-measure in embedded environments).
            this.zoomBehavior.extent([[0, 0], [
                Math.max(1, options.viewport.width),
                Math.max(1, options.viewport.height)
            ]]);

            const hasDataUpdate =
                (options.type & VisualUpdateType.Data) === VisualUpdateType.Data;

            if (hasDataUpdate || this.datums.length === 0) {
                // Rebuild data points only on Data updates — never on
                // resize-only updates.
                this.rebuildData(options);
            }

            this.render();
            this.events.renderingFinished(options);
        } catch (error) {
            this.events.renderingFailed(options,
                error instanceof Error ? error.message : String(error));
        }
    }

    private rebuildData(options: VisualUpdateOptions): void {
        const categorical: DataViewCategorical | undefined =
            options.dataViews?.[0]?.categorical;
        const categories = categorical?.categories ?? [];
        const geometryCat = categories.find(
            (c) => c.source?.roles?.geometry);

        this.datums = [];
        this.highlights = null;
        this.colorScale = null;
        this.colorValueFormat = undefined;
        this.parseStats = { total: 0, parsed: 0, firstFailure: null };
        this.sortedCategories = [];
        this.categoryColorMap = new Map();
        this.categoryOverrides = new Map();

        if (!geometryCat || !geometryCat.values?.length) {
            // Empty data clears the canvas.
            this.sortedDatums = [];
            this.lastSignature = "";
            return;
        }

        const labelCat = categories.find((c) => c.source?.roles?.label);
        const categoryCat = categories.find((c) => c.source?.roles?.colorCategory);
        const zOrderCat = categories.find((c) => c.source?.roles?.zOrder);
        const values = categorical?.values ?? [];
        const colorValueCol = (values as DataViewValueColumn[])
            .find((v) => v.source?.roles?.colorValue);
        const tooltipCols = (values as DataViewValueColumn[])
            .filter((v) => v.source?.roles?.tooltips);

        // Cross-highlight: read the highlights array from any measure
        // column. With zero measures bound there is no highlights channel
        // (host falls back to filtering).
        const highlightCol = (values as DataViewValueColumn[])
            .find((v) => Array.isArray(v.highlights));
        this.highlights = highlightCol ? highlightCol.highlights : null;

        // Parse WKT, preserving index alignment (skipped rows are null).
        const parsed = parseRows(geometryCat.values);
        this.parseStats.total = geometryCat.values.length;
        this.parseStats.parsed = parsed.filter((p) => p !== null).length;
        if (this.parseStats.firstFailure === null) {
            const failIdx = parsed.findIndex((p, i) =>
                p === null && geometryCat.values[i] !== null &&
                geometryCat.values[i] !== undefined);
            if (failIdx >= 0) {
                this.parseStats.firstFailure =
                    String(geometryCat.values[failIdx]);
            }
        }

        // Deterministic category order (locale-aware, row-order
        // independent). The palette is pre-warmed in THIS order before any
        // other getColor call, so each category value keeps the same theme
        // color slot no matter how the host reorders rows when fields are
        // added or removed.
        const firstRowByCategory = new Map<string, number>();
        if (categoryCat) {
            for (let i = 0; i < categoryCat.values.length; i++) {
                const value = this.toDisplayString(categoryCat.values[i]);
                if (value !== null && !firstRowByCategory.has(value)) {
                    firstRowByCategory.set(value, i);
                }
            }
        }
        this.sortedCategories = uniqueSortedCategories(
            Array.from(firstRowByCategory.keys()), this.locale);
        for (const value of this.sortedCategories) {
            this.categoryColorMap.set(value,
                this.host.colorPalette.getColor(value).value);
        }

        // Per-category override colors (object dataColors, property fill),
        // persisted on the category's current-first-row selector and read
        // back from category.objects[i].dataColors.fill keyed by category
        // value. The CURRENT first row's value wins; other rows are only a
        // fallback — after a row reorder, a stale override persisted on a
        // previously-first row must not shadow a newer one.
        const overrideByCategory = new Map<string, string>();
        if (categoryCat) {
            for (const [value, firstRow] of firstRowByCategory) {
                const preferred = this.readRowObjectColor(
                    geometryCat, firstRow,
                    PINNED.dataColors.objectName, PINNED.dataColors.fill);
                if (preferred !== null) {
                    overrideByCategory.set(value, preferred);
                }
            }
            for (let i = 0; i < geometryCat.values.length; i++) {
                const fill = this.readRowObjectColor(
                    geometryCat, i,
                    PINNED.dataColors.objectName, PINNED.dataColors.fill);
                if (fill !== null) {
                    const key = this.toDisplayString(categoryCat.values[i]);
                    if (key !== null && !overrideByCategory.has(key)) {
                        overrideByCategory.set(key, fill);
                    }
                }
            }
        }

        this.colorValueFormat = colorValueCol?.source?.format;
        const colorValueFormatter = valueFormatter.create({
            format: this.colorValueFormat,
            cultureSelector: this.locale
        });
        const tooltipFormatters = tooltipCols.map((c) => valueFormatter.create({
            format: c.source?.format,
            cultureSelector: this.locale
        }));

        for (let i = 0; i < parsed.length; i++) {
            const row = parsed[i];
            if (row === null) {
                // Unparseable/null WKT and GEOMETRYCOLLECTION rows are
                // skipped silently without desynchronizing index alignment.
                continue;
            }
            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(geometryCat, i)
                .createSelectionId() as ISelectionId;

            const label = labelCat
                ? this.toDisplayString(labelCat.values[i]) : null;
            const category = categoryCat
                ? this.toDisplayString(categoryCat.values[i]) : null;
            const colorValue = colorValueCol
                ? this.toFiniteNumber(colorValueCol.values[i]) : null;
            const zOrder = zOrderCat
                ? this.toFiniteNumber(zOrderCat.values[i]) : null;
            // Per-row fx conditional-formatting rule color.
            const ruleColor = this.readRowObjectColor(
                geometryCat, i,
                PINNED.colors.objectName, PINNED.colors.defaultColor);
            const overrideColor = category !== null
                ? (overrideByCategory.get(category) ?? null) : null;

            const tooltipItems: VisualTooltipDataItem[] = [];
            if (labelCat && label !== null) {
                tooltipItems.push({
                    displayName: labelCat.source.displayName,
                    value: label
                });
            }
            if (categoryCat && category !== null) {
                tooltipItems.push({
                    displayName: categoryCat.source.displayName,
                    value: category
                });
            }
            if (colorValueCol && colorValue !== null) {
                tooltipItems.push({
                    displayName: colorValueCol.source.displayName,
                    value: colorValueFormatter.format(colorValueCol.values[i])
                });
            }
            tooltipCols.forEach((col, t) => {
                const v = col.values[i];
                if (v !== null && v !== undefined) {
                    tooltipItems.push({
                        displayName: col.source.displayName,
                        value: tooltipFormatters[t].format(v)
                    });
                }
            });

            this.datums.push({
                index: i,
                key: selectionId.getKey(),
                selectionId,
                feature: row.feature,
                wktType: row.wktType,
                kind: row.kind,
                hasPoint: row.hasPoint,
                label,
                category,
                colorValue,
                ruleColor,
                overrideColor,
                zOrder,
                tooltipItems,
                centroid: null,
                bboxWidth: 0
            });
        }

        // Sequential color scale from the bound Color measure.
        const colors = this.formattingSettings.colorsCard;
        this.colorScale = colorValueCol
            ? buildColorScale(
                this.datums.map((d) => d.colorValue),
                {
                    minColor: colors.minColor.value.value,
                    maxColor: colors.maxColor.value.value,
                    logScale: colors.logScale.value
                })
            : null;

        // Z-order: ascending stable sort; unbound → input order untouched.
        this.sortedDatums = sortZOrder(this.datums);

        this.categoryOverrides = overrideByCategory;
        this.populateCategoryColorsCard(categoryCat, geometryCat);
    }

    private render(): void {
        const settings = this.formattingSettings;
        this.flipY = settings.mapCard.flipY.value;
        this.styleSettings = this.buildStyleSettings();

        // Keyboard focus ring color: host palette foreground so the visible
        // focus indicator works in high contrast.
        this.rootElement.style.setProperty("--wkt-focus-color",
            this.styleSettings.highContrast.active
                ? this.styleSettings.highContrast.foreground
                : "#252423");

        this.pathGen = this.buildPathGenerator(this.currentTransform.k);

        // Shapes (keyed join on the selection-id key).
        this.shapePaths = this.shapesGroup
            .selectAll<SVGPathElement, ShellDatum>("path.shape")
            .data(this.sortedDatums, (d: ShellDatum) => d.key)
            .join("path")
            .classed("shape", true);

        const identityPath = this.buildPathGenerator(1);
        this.shapePaths
            .attr("d", (d) => this.pathGen(d.feature as never))
            .attr("vector-effect", "non-scaling-stroke")
            .attr("tabindex", this.allowInteractions ? 0 : null)
            .attr("role", "button")
            .attr("aria-label", (d) =>
                d.label !== null && d.label.length > 0
                    ? d.label
                    : `${d.wktType} ${d.index + 1}`)
            .each((d) => {
                // Identity-space metrics for labels and declutter.
                const c = identityPath.centroid(d.feature as never);
                d.centroid = (isFinite(c[0]) && isFinite(c[1]))
                    ? [c[0], c[1]] : null;
                const b = identityPath.bounds(d.feature as never);
                const w = b[1][0] - b[0][0];
                d.bboxWidth = isFinite(w) ? w : 0;
            });
        this.bindShapeHandlers();

        // Labels at centroids; pointer-events: none; counter-scaled so the
        // size is constant on screen.
        const labelData = settings.labelsCard.show.value
            ? this.sortedDatums.filter((d) =>
                d.label !== null && d.label.length > 0 && d.centroid !== null)
            : [];
        this.labelTexts = this.labelsGroup
            .selectAll<SVGTextElement, ShellDatum>("text.shape-label")
            .data(labelData, (d: ShellDatum) => d.key)
            .join("text")
            .classed("shape-label", true);
        this.labelTexts
            .text((d) => d.label as string)
            .attr("font-size", settings.labelsCard.textSize.value)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle");
        this.updateLabelTransforms(this.currentTransform.k);

        // ALL paint attributes flow through the single resolver.
        this.applyStyles();

        // Auto-fit only when the geometry set (or the Y orientation)
        // actually changes — highlight and formatting updates arrive as
        // Data updates and must NOT reset the user's pan/zoom. The
        // signature is committed only AFTER the fit succeeds; committing it
        // first meant a single transient failure left the visual
        // permanently unfitted (content rendered off-viewport) while every
        // subsequent update reported success.
        const signature = geometrySignature(
            this.sortedDatums.map((d) => d.feature)) +
            `|flip:${this.flipY ? 1 : 0}`;
        if (signature !== this.lastSignature) {
            this.applyFit();
            this.lastSignature = signature;
        }

        this.declutterLabels();
        this.renderScaleBar();
        this.renderLegend();
        this.renderParseStatus();
    }

    /** Diagnostic overlay: a bound Geometry field whose rows ALL fail to
     *  parse must explain itself instead of rendering silent white. Rows
     *  that fail alongside successfully parsed rows remain silently skipped
     *  per the data contract. */
    private renderParseStatus(): void {
        const g = this.statusGroup;
        g.selectAll("*").remove();
        const stats = this.parseStats;
        if (stats.total === 0 || stats.parsed > 0) {
            return;
        }
        const palette = this.host.colorPalette;
        const color = palette.isHighContrast
            ? (palette.foreground?.value ?? "#000000")
            : "#605E5C";
        const cx = this.viewport.width / 2;
        const cy = this.viewport.height / 2;
        const sample = stats.firstFailure === null
            ? null
            : (stats.firstFailure.length > 60
                ? stats.firstFailure.slice(0, 59) + "\u2026"
                : stats.firstFailure);
        const lines: string[] = [
            `WKT Map: 0 of ${stats.total.toLocaleString(this.locale)} ` +
            "rows contained renderable WKT.",
            "Supported: 2D/Z/M WKT for POINT, LINESTRING, POLYGON and " +
            "their MULTI* forms."
        ];
        if (sample !== null) {
            lines.push(`First skipped value: ${sample}`);
        }
        lines.forEach((line, i) => {
            g.append("text")
                .attr("x", cx)
                .attr("y", cy + (i - (lines.length - 1) / 2) * 18)
                .attr("text-anchor", "middle")
                .attr("font-size", i === 0 ? 12 : 11)
                .attr("fill", color)
                .text(line);
        });
    }

    // ------------------------------------------------------------------ //
    // Single style applier (the ONLY place paint attributes are set)
    // ------------------------------------------------------------------ //

    private applyStyles(): void {
        if (!this.shapePaths) { return; }
        const interaction = this.buildInteractionState();
        const settings = this.styleSettings;
        const labelColor = settings.highContrast.active
            ? settings.highContrast.foreground
            : this.formattingSettings.labelsCard.color.value.value;

        // One resolver pass per datum; the applier below only reads.
        const styleOf = new Map<string, ReturnType<typeof resolveStyle>>();
        for (const d of this.sortedDatums) {
            styleOf.set(d.key, resolveStyle(d, interaction, settings));
        }
        const style = (d: ShellDatum) => styleOf.get(d.key)!;

        this.shapePaths
            .attr("fill", (d) => style(d).fill)
            .attr("fill-opacity", (d) => style(d).fillOpacity)
            .attr("stroke", (d) => style(d).strokeColor)
            .attr("stroke-width", (d) => style(d).strokeWidth)
            .attr("stroke-opacity", (d) => style(d).strokeOpacity);

        // Labels dim with their geometry via paint-level alpha (fill-opacity,
        // not element opacity) or they mask the highlight.
        if (this.labelTexts) {
            this.labelTexts
                .attr("fill", labelColor)
                .attr("fill-opacity", (d) => style(d).labelOpacity);
        }

        if (interaction.mode !== "none") {
            // Raise emphasized shapes so the heavier outline draws ABOVE
            // neighbours sharing borders (fixes the double-outline
            // artifact). This deliberately overrides z-order while the
            // interaction is active.
            this.shapePaths
                .filter((d) => style(d).emphasized)
                .raise();
        } else {
            // Interaction cleared: re-sort the DOM back to z-order.
            this.shapePaths.order();
        }
    }

    private buildInteractionState(): InteractionState {
        if (this.highlights !== null) {
            return {
                mode: "highlight",
                selectedKeys: new Set<string>(),
                highlights: this.highlights
            };
        }
        const ids = this.selectionManager.getSelectionIds() as ISelectionId[];
        if (ids.length > 0) {
            return {
                mode: "selection",
                selectedKeys: new Set(ids.map((id) => id.getKey())),
                highlights: null
            };
        }
        return { mode: "none", selectedKeys: new Set<string>(), highlights: null };
    }

    private buildStyleSettings(): StyleSettings {
        const palette = this.host.colorPalette;
        const settings = this.formattingSettings;
        const categoryColors = this.categoryColorMap;
        const categoryPalette = categoryColors.size > 0
            ? (category: string) =>
                categoryColors.get(category) ?? palette.getColor(category).value
            : null;
        return {
            highContrast: {
                active: !!palette.isHighContrast,
                foreground: palette.foreground?.value ?? "#000000",
                background: palette.background?.value ?? "#FFFFFF"
            },
            defaultColor: settings.colorsCard.defaultColor.value.value,
            strokeColor: settings.strokeCard.strokeColor.value.value,
            strokeWidth: settings.strokeCard.strokeWidth.value,
            selectedStrokeWidth: settings.strokeCard.selectedStrokeWidth.value,
            colorScale: this.colorScale ? this.colorScale.color : null,
            categoryPalette
        };
    }

    // ------------------------------------------------------------------ //
    // Interactivity
    // ------------------------------------------------------------------ //

    private bindShapeHandlers(): void {
        this.shapePaths
            .on("click", (event: MouseEvent, d: ShellDatum) => {
                if (!this.allowInteractions) { return; }
                event.stopPropagation();
                const multi = event.ctrlKey || event.metaKey || event.shiftKey;
                this.selectionManager.select(d.selectionId, multi)
                    .then(() => this.applyStyles());
            })
            .on("contextmenu", (event: MouseEvent, d: ShellDatum) => {
                event.preventDefault();
                event.stopPropagation();
                this.selectionManager.showContextMenu(d.selectionId, {
                    x: event.clientX,
                    y: event.clientY
                });
            })
            .on("keydown", (event: KeyboardEvent, d: ShellDatum) => {
                if (!this.allowInteractions) { return; }
                if (event.key === "Enter" || event.key === " " ||
                    event.key === "Spacebar") {
                    event.preventDefault();
                    event.stopPropagation();
                    const multi = event.ctrlKey || event.metaKey || event.shiftKey;
                    this.selectionManager.select(d.selectionId, multi)
                        .then(() => this.applyStyles());
                }
            })
            .on("mouseover", (event: MouseEvent, d: ShellDatum) => {
                this.host.tooltipService.show({
                    dataItems: d.tooltipItems,
                    identities: [d.selectionId],
                    coordinates: this.tooltipCoordinates(event),
                    isTouchEvent: false
                });
            })
            .on("mousemove", (event: MouseEvent, d: ShellDatum) => {
                this.host.tooltipService.move({
                    dataItems: d.tooltipItems,
                    identities: [d.selectionId],
                    coordinates: this.tooltipCoordinates(event),
                    isTouchEvent: false
                });
            })
            .on("mouseout", () => {
                this.host.tooltipService.hide({
                    immediately: false,
                    isTouchEvent: false
                });
            });
    }

    /** Tooltip coordinates relative to the visual root. */
    private tooltipCoordinates(event: MouseEvent): number[] {
        const rect = this.rootElement.getBoundingClientRect();
        return [event.clientX - rect.left, event.clientY - rect.top];
    }

    // ------------------------------------------------------------------ //
    // Pan / zoom
    // ------------------------------------------------------------------ //

    private buildPathGenerator(k: number): GeoPath {
        const flip = this.flipY;
        const transform = geoTransform({
            point: function (x: number, y: number) {
                this.stream.point(x, flip ? -y : y);
            }
        });
        return geoPath(transform)
            .pointRadius(BASE_POINT_RADIUS / Math.max(k, 1e-9));
    }

    private onZoomFrame(transform: ZoomTransform): void {
        this.currentTransform = transform;
        this.zoomRoot.attr("transform", transform.toString());
        // Point radii are recomputed as base/k every zoom frame; re-emit
        // path d only for features containing points.
        this.pathGen = this.buildPathGenerator(transform.k);
        if (this.shapePaths) {
            this.shapePaths
                .filter((d) => d.hasPoint)
                .attr("d", (d) => this.pathGen(d.feature as never));
        }
        // Per-frame label work is the counter-scale transform only;
        // declutter re-evaluates on zoom end.
        this.updateLabelTransforms(transform.k);
        this.renderScaleBar();
    }

    private updateLabelTransforms(k: number): void {
        if (!this.labelTexts) { return; }
        const safeK = Math.max(k, 1e-9);
        this.labelTexts.attr("transform", (d) => {
            const c = d.centroid as [number, number];
            return `translate(${c[0]},${c[1]}) scale(${1 / safeK})`;
        });
    }

    private declutterLabels(): void {
        if (!this.labelTexts) { return; }
        const fontSize = this.formattingSettings.labelsCard.textSize.value;
        const k = this.currentTransform.k;
        this.labelTexts.attr("display", (d) =>
            labelVisible(d.label, fontSize, d.bboxWidth,
                d.kind === "point", k) ? null : "none");
    }

    private applyFit(): void {
        const bounds = geometryBounds(this.sortedDatums.map((d) => d.feature));
        if (!bounds) {
            this.fitTransform = zoomIdentity;
            this.svg.call(this.zoomBehavior.transform, zoomIdentity);
            return;
        }
        const fit = computeFitTransform(bounds, this.viewport, this.flipY);
        this.fitTransform = zoomIdentity.translate(fit.tx, fit.ty).scale(fit.k);
        // Scale extent is 0.1x–20x RELATIVE to the auto-fit scale so tiny
        // and huge coordinate ranges stay reachable.
        this.zoomBehavior.scaleExtent([fit.k * 0.1, fit.k * 20]);
        this.svg.call(this.zoomBehavior.transform, this.fitTransform);
    }

    private zoomBy(factor: number): void {
        this.svg.call(this.zoomBehavior.scaleBy, factor);
        this.declutterLabels();
    }

    private resetView(): void {
        this.svg.call(this.zoomBehavior.transform, this.fitTransform);
        this.declutterLabels();
    }

    // ------------------------------------------------------------------ //
    // Scale bar
    // ------------------------------------------------------------------ //

    private renderScaleBar(): void {
        const g = this.scaleBarGroup;
        g.selectAll("*").remove();
        const card = this.formattingSettings.scaleBarCard;
        if (!card.show.value || this.sortedDatums.length === 0) {
            return;
        }
        const units = String(card.units.value.value);
        let unitLabel: string;
        let unitsPerCoordinate = 1;
        if (units === "feet") {
            unitLabel = "ft";
        } else if (units === "custom") {
            unitLabel = card.customUnitLabel.value || "units";
            const upc = card.unitsPerCoordinate.value;
            // Must be > 0; fall back to 1 if invalid.
            unitsPerCoordinate = (isFinite(upc) && upc > 0) ? upc : 1;
        } else {
            unitLabel = "m";
        }

        // 1 coordinate unit = k screen px; 1 chosen unit =
        // (1 / unitsPerCoordinate) coordinate units = k / upc px.
        const pxPerUnit = this.currentTransform.k / unitsPerCoordinate;
        const spec = scaleBarSpec(pxPerUnit, unitLabel, SCALE_BAR_MAX_PX,
            (n) => n.toLocaleString(this.locale));
        if (!spec) { return; }

        const palette = this.host.colorPalette;
        const color = palette.isHighContrast
            ? (palette.foreground?.value ?? "#000")
            : "#252423";
        const x = LEGEND_MARGIN;
        const y = this.viewport.height - 12;
        g.append("path")
            .attr("d", `M${x},${y - 4} V${y} H${x + spec.px} V${y - 4}`)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 1.5);
        g.append("text")
            .attr("x", x + spec.px / 2)
            .attr("y", y - 7)
            .attr("text-anchor", "middle")
            .attr("font-size", 10)
            .attr("fill", color)
            .text(spec.label);
    }

    // ------------------------------------------------------------------ //
    // Legend
    // ------------------------------------------------------------------ //

    private renderLegend(): void {
        const g = this.legendGroup;
        g.selectAll("*").remove();
        this.defs.selectAll("*").remove();

        const card = this.formattingSettings.legendCard;
        const palette = this.host.colorPalette;
        // Hidden entirely in high-contrast mode.
        if (!card.show.value || palette.isHighContrast ||
            this.sortedDatums.length === 0) {
            return;
        }

        const textColor = "#252423";
        const ruleColorsPresent = this.sortedDatums.some(
            (d) => d.ruleColor !== null);
        const formatNumber = valueFormatter.create({
            format: this.colorValueFormat,
            cultureSelector: this.locale
        });

        let rendered = false;
        if (ruleColorsPresent) {
            // fx rule active. The rule definition is not available, so the
            // legend is rebuilt empirically from delivered per-row colors —
            // and only when the Color measure anchors it to real values.
            if (this.colorScale !== null) {
                const pairs = this.sortedDatums
                    .filter((d) => d.colorValue !== null && d.ruleColor !== null)
                    .map((d) => ({
                        value: d.colorValue as number,
                        color: d.ruleColor as string
                    }));
                const grad = sampleFxGradient(pairs);
                if (grad) {
                    this.renderGradientLegend(g, grad.stops,
                        formatNumber.format(grad.min),
                        formatNumber.format(grad.max), textColor);
                    rendered = true;
                }
            }
            // Rule colors without a bound Color measure: HIDE the legend —
            // never fabricate a scale.
        } else if (this.colorScale !== null) {
            // Gradient sampled through the active transform in raw value
            // space — a log scale visibly compresses the top end.
            const scale = this.colorScale;
            const stops: string[] = [];
            const n = 24;
            for (let i = 0; i < n; i++) {
                const v = scale.min + ((scale.max - scale.min) * i) / (n - 1);
                stops.push(scale.color(v));
            }
            this.renderGradientLegend(g, stops,
                formatNumber.format(scale.min),
                formatNumber.format(scale.max), textColor);
            rendered = true;
        } else if (this.styleSettings.categoryPalette !== null) {
            rendered = this.renderSwatchLegend(g, textColor);
        }

        if (!rendered) {
            return;
        }
        this.positionLegend();
    }

    private renderGradientLegend(
        g: GroupSel, stops: string[], minLabel: string, maxLabel: string,
        textColor: string
    ): void {
        const gradId = `wkt-map-grad-${this.instanceId}`;
        const grad = this.defs.append("linearGradient")
            .attr("id", gradId)
            .attr("x1", "0%").attr("x2", "100%")
            .attr("y1", "0%").attr("y2", "0%");
        stops.forEach((color, i) => {
            grad.append("stop")
                .attr("offset", `${(i / (stops.length - 1)) * 100}%`)
                .attr("stop-color", color);
        });
        g.append("rect")
            .attr("x", 0).attr("y", 0)
            .attr("width", 110).attr("height", 10)
            .attr("fill", `url(#${gradId})`)
            .attr("stroke", "#CCCCCC")
            .attr("stroke-width", 0.5);
        g.append("text")
            .attr("x", 0).attr("y", 22)
            .attr("font-size", 9)
            .attr("text-anchor", "start")
            .attr("fill", textColor)
            .text(minLabel);
        g.append("text")
            .attr("x", 110).attr("y", 22)
            .attr("font-size", 9)
            .attr("text-anchor", "end")
            .attr("fill", textColor)
            .text(maxLabel);
    }

    /** Swatch rows in the same deterministic sorted order that drives
     *  palette assignment and the Category colors pane, so neither the
     *  colors nor the legend order reshuffle when adding/removing fields
     *  changes the row order of the data view. */
    private renderSwatchLegend(g: GroupSel, textColor: string): boolean {
        const categories = this.sortedCategories;
        if (categories.length === 0) {
            return false;
        }
        const shown = categories.slice(0, MAX_LEGEND_SWATCHES);
        const overflow = categories.length - shown.length;
        const paletteFn = this.styleSettings.categoryPalette as
            (c: string) => string;
        const overrides = this.categoryOverrides;
        shown.forEach((category, i) => {
            const y = i * 16;
            g.append("rect")
                .attr("x", 0).attr("y", y)
                .attr("width", 10).attr("height", 10)
                .attr("fill", overrides.get(category) ?? paletteFn(category))
                .attr("stroke", "#CCCCCC")
                .attr("stroke-width", 0.5);
            g.append("text")
                .attr("x", 15).attr("y", y + 9)
                .attr("font-size", 10)
                .attr("fill", textColor)
                .text(category.length > 24
                    ? category.slice(0, 23) + "\u2026" : category);
        });
        if (overflow > 0) {
            g.append("text")
                .attr("x", 15).attr("y", shown.length * 16 + 9)
                .attr("font-size", 10)
                .attr("font-style", "italic")
                .attr("fill", textColor)
                .text(`+${overflow} more`);
        }
        return true;
    }

    /** Render at the group origin, then anchor the corner using getBBox();
     *  clear the zoom buttons at top-right and the scale bar at
     *  bottom-left. getBBox is the one layout-measurement call in the
     *  visual; if the environment cannot measure (hidden/detached render),
     *  the legend stays at the origin rather than failing the update. */
    private positionLegend(): void {
        const node = this.legendGroup.node();
        if (!node) { return; }
        let bbox: { x: number; y: number; width: number; height: number };
        try {
            bbox = node.getBBox();
        } catch {
            return;
        }
        const position = String(
            this.formattingSettings.legendCard.position.value.value);
        const scaleBarVisible =
            this.formattingSettings.scaleBarCard.show.value &&
            this.sortedDatums.length > 0;
        const vw = this.viewport.width;
        const vh = this.viewport.height;

        let x = LEGEND_MARGIN;
        let y = LEGEND_MARGIN;
        if (position === "topRight") {
            x = vw - bbox.width - LEGEND_MARGIN;
            y = LEGEND_MARGIN + LEGEND_BUTTON_CLEARANCE;
        } else if (position === "bottomLeft") {
            x = LEGEND_MARGIN;
            y = vh - bbox.height - LEGEND_MARGIN -
                (scaleBarVisible ? LEGEND_SCALEBAR_CLEARANCE : 0);
        } else if (position === "bottomRight") {
            x = vw - bbox.width - LEGEND_MARGIN;
            y = vh - bbox.height - LEGEND_MARGIN;
        }
        this.legendGroup.attr("transform",
            `translate(${x - bbox.x},${y - bbox.y})`);
    }

    // ------------------------------------------------------------------ //
    // Formatting pane
    // ------------------------------------------------------------------ //

    private applySettingsVisibility(): void {
        const sb = this.formattingSettings.scaleBarCard;
        const isCustom = String(sb.units.value.value) === "custom";
        // Custom unit fields are visible only when units = Custom.
        sb.customUnitLabel.visible = isCustom;
        sb.unitsPerCoordinate.visible = isCustom;
    }

    /** Dynamic "Category colors" card: one ColorPicker per category value
     *  (cap 50), persisted via the FIRST row's selection-id selector
     *  (object dataColors, property fill). */
    private populateCategoryColorsCard(
        categoryCat: DataViewCategoryColumn | undefined,
        geometryCat: DataViewCategoryColumn
    ): void {
        const cardModel = this.formattingSettings.categoryColorsCard;
        cardModel.slices = [];
        cardModel.visible = !!categoryCat;
        if (!categoryCat) {
            return;
        }
        const firstRowByCategory = new Map<string, number>();
        for (let i = 0; i < categoryCat.values.length; i++) {
            const value = this.toDisplayString(categoryCat.values[i]);
            if (value !== null && !firstRowByCategory.has(value)) {
                firstRowByCategory.set(value, i);
            }
        }
        // Pickers in the same deterministic sorted order as the legend.
        // The cap applies to the sorted list; categories beyond it remain
        // palette-colored and get no picker.
        for (const value of
            this.sortedCategories.slice(0, MAX_CATEGORY_COLOR_SLICES)) {
            const row = firstRowByCategory.get(value);
            if (row === undefined) {
                continue;
            }
            const selectionId = this.host.createSelectionIdBuilder()
                .withCategory(geometryCat, row)
                .createSelectionId() as ISelectionId;
            cardModel.slices.push(new formattingSettings.ColorPicker({
                name: PINNED.dataColors.fill,
                displayName: value,
                value: {
                    value: this.categoryOverrides.get(value) ??
                        this.categoryColorMap.get(value) ?? "#000000"
                },
                selector: selectionId.getSelector()
            }));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService
            .buildFormattingModel(this.formattingSettings);
    }

    // ------------------------------------------------------------------ //
    // Helpers / teardown
    // ------------------------------------------------------------------ //

    private readRowObjectColor(
        category: DataViewCategoryColumn, index: number,
        objectName: string, propertyName: string
    ): string | null {
        const obj = category.objects?.[index]?.[objectName] as
            Record<string, unknown> | undefined;
        const fill = obj?.[propertyName] as
            { solid?: { color?: string } } | undefined;
        return fill?.solid?.color ?? null;
    }

    private toDisplayString(value: unknown): string | null {
        if (value === null || value === undefined) {
            return null;
        }
        return String(value);
    }

    private toFiniteNumber(value: unknown): number | null {
        if (value === null || value === undefined) {
            return null;
        }
        const n = typeof value === "number" ? value : Number(value);
        return isFinite(n) ? n : null;
    }

    public destroy(): void {
        // Remove zoom / click / contextmenu / keyboard listeners.
        this.svg.on(".zoom", null);
        this.svg.on("click", null);
        this.svg.on("contextmenu", null);
        this.rootElement.removeEventListener("keydown", this.svgKeydownListener);
        if (this.shapePaths) {
            this.shapePaths
                .on("click", null)
                .on("contextmenu", null)
                .on("keydown", null)
                .on("mouseover", null)
                .on("mousemove", null)
                .on("mouseout", null);
        }
        for (const b of this.buttons) {
            b.remove();
        }
        this.buttons = [];
        // Remove SVG + button DOM, clear data.
        this.svg.remove();
        this.buttonsContainer.remove();
        this.datums = [];
        this.sortedDatums = [];
        this.highlights = null;
    }
}
