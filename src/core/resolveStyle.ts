/**
 * THE single render-state resolver.
 *
 * ALL paint attributes for shapes and labels are computed here and applied
 * in exactly one place (Visual.applyStyles). The draw routine and the
 * interaction handlers both go through this function; nothing else may set
 * fill/stroke/opacity.
 *
 * Fill priority (highest wins) — documented once, here:
 *   1. High contrast mode      → palette background (stroke = foreground)
 *   2. fx rule color           → category.objects[i].colors.defaultColor
 *   3. Color measure           → sequential scale (optionally log(x+1))
 *   4. Category override color → category.objects[i].dataColors.fill
 *   5. Palette category color  → host.colorPalette.getColor(value)
 *   6. Default color setting
 */
import {
    DIM_FILL_OPACITY,
    DIM_LABEL_OPACITY,
    DIM_STROKE_OPACITY
} from "./constants";
import {
    InteractionState,
    MapDatum,
    ResolvedStyle,
    StyleSettings
} from "./types";

function resolveBaseColor(d: MapDatum, settings: StyleSettings): string {
    if (settings.highContrast.active) {
        return settings.highContrast.background;
    }
    if (d.ruleColor !== null) {
        return d.ruleColor;
    }
    if (d.colorValue !== null && settings.colorScale !== null) {
        return settings.colorScale(d.colorValue);
    }
    if (d.category !== null) {
        if (d.overrideColor !== null) {
            return d.overrideColor;
        }
        if (settings.categoryPalette !== null) {
            return settings.categoryPalette(d.category);
        }
    }
    return settings.defaultColor;
}

/** Is this datum emphasized under the current interaction state? */
function isEmphasized(d: MapDatum, interaction: InteractionState): boolean {
    if (interaction.mode === "selection") {
        return interaction.selectedKeys.has(d.key);
    }
    if (interaction.mode === "highlight") {
        return interaction.highlights !== null &&
            interaction.highlights[d.index] !== null &&
            interaction.highlights[d.index] !== undefined;
    }
    return false;
}

export function resolveStyle(
    d: MapDatum,
    interaction: InteractionState,
    settings: StyleSettings
): ResolvedStyle {
    const color = resolveBaseColor(d, settings);
    const outline = settings.highContrast.active
        ? settings.highContrast.foreground
        : settings.strokeColor;

    // Lines carry their color on the stroke and never fill;
    // polygons/points fill with the color and outline with the stroke color.
    const isLine = d.kind === "line";
    const fill = isLine ? "none" : color;
    const strokeColor = isLine
        ? (settings.highContrast.active ? settings.highContrast.foreground : color)
        : outline;

    const active = interaction.mode !== "none";
    const emphasized = active && isEmphasized(d, interaction);
    const dimmed = active && !emphasized;

    return {
        fill,
        fillOpacity: dimmed ? DIM_FILL_OPACITY : 1,
        strokeColor,
        strokeWidth: emphasized ? settings.selectedStrokeWidth : settings.strokeWidth,
        strokeOpacity: dimmed ? DIM_STROKE_OPACITY : 1,
        labelOpacity: dimmed ? DIM_LABEL_OPACITY : 1,
        emphasized
    };
}
