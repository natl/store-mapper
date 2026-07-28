"use strict";

import powerbi from "powerbi-visuals-api";
import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";
import { dataViewWildcard } from "powerbi-visuals-utils-dataviewutils";
import { PINNED } from "./core/constants";

import IEnumMember = powerbi.IEnumMember;
import VisualEnumerationInstanceKinds = powerbi.VisualEnumerationInstanceKinds;
import ValidatorType = powerbi.visuals.ValidatorType;

import Card = formattingSettings.SimpleCard;
import Model = formattingSettings.Model;
import Slice = formattingSettings.Slice;

export const LEGEND_POSITIONS: IEnumMember[] = [
    { value: "topLeft", displayName: "Top left" },
    { value: "topRight", displayName: "Top right" },
    { value: "bottomLeft", displayName: "Bottom left" },
    { value: "bottomRight", displayName: "Bottom right" }
];

export const SCALE_BAR_UNITS: IEnumMember[] = [
    { value: "metres", displayName: "Metres" },
    { value: "feet", displayName: "Feet" },
    { value: "custom", displayName: "Custom" }
];

/** Colors card — fill priority knobs. The default color is fx-enabled. */
export class ColorsCard extends Card {
    defaultColor = new formattingSettings.ColorPicker({
        name: PINNED.colors.defaultColor,
        displayName: "Default color",
        value: { value: "#01B8AA" },
        // fx button: rule-based conditional formatting over all instances.
        instanceKind: VisualEnumerationInstanceKinds.ConstantOrRule,
        selector: dataViewWildcard.createDataViewWildcardSelector(
            dataViewWildcard.DataViewWildcardMatchingOption.InstancesAndTotals
        )
    });

    minColor = new formattingSettings.ColorPicker({
        name: PINNED.colors.minColor,
        displayName: "Minimum color",
        value: { value: "#DEEBF7" }
    });

    maxColor = new formattingSettings.ColorPicker({
        name: PINNED.colors.maxColor,
        displayName: "Maximum color",
        value: { value: "#08306B" }
    });

    logScale = new formattingSettings.ToggleSwitch({
        name: PINNED.colors.logScale,
        displayName: "Log scale (log(x+1))",
        description: "Apply log(x+1) to the Color measure before mapping to colors. Silently falls back to linear when any value is negative.",
        value: false
    });

    name: string = PINNED.colors.objectName;
    displayName: string = "Colors";
    slices: Slice[] = [this.defaultColor, this.minColor, this.maxColor, this.logScale];
}

/** Category colors — dynamic per-category pickers, populated in update().
 *  Visible only when Color Category is bound; capped at 50 slices
 *  (categories beyond the cap remain palette-colored, no picker). */
export class CategoryColorsCard extends Card {
    name: string = PINNED.dataColors.objectName;
    displayName: string = "Category colors";
    slices: Slice[] = [];
    visible: boolean = false;
}

export class StrokeCard extends Card {
    strokeColor = new formattingSettings.ColorPicker({
        name: "strokeColor",
        displayName: "Stroke color",
        value: { value: "#252423" }
    });

    strokeWidth = new formattingSettings.NumUpDown({
        name: "strokeWidth",
        displayName: "Stroke width",
        value: 1.5,
        options: {
            minValue: { type: ValidatorType.Min, value: 0.1 },
            maxValue: { type: ValidatorType.Max, value: 10 }
        }
    });

    selectedStrokeWidth = new formattingSettings.NumUpDown({
        name: "selectedStrokeWidth",
        displayName: "Selected stroke width",
        value: 3,
        options: {
            minValue: { type: ValidatorType.Min, value: 0.1 },
            maxValue: { type: ValidatorType.Max, value: 10 }
        }
    });

    name: string = "stroke";
    displayName: string = "Stroke";
    slices: Slice[] = [this.strokeColor, this.strokeWidth, this.selectedStrokeWidth];
}

export class LabelsCard extends Card {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show",
        value: true
    });

    textSize = new formattingSettings.NumUpDown({
        name: "textSize",
        displayName: "Text size",
        value: 10,
        options: {
            minValue: { type: ValidatorType.Min, value: 6 },
            maxValue: { type: ValidatorType.Max, value: 40 }
        }
    });

    color = new formattingSettings.ColorPicker({
        name: "color",
        displayName: "Color",
        value: { value: "#252423" }
    });

    name: string = "labels";
    displayName: string = "Labels";
    topLevelSlice = this.show;
    slices: Slice[] = [this.textSize, this.color];
}

export class LegendCard extends Card {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show",
        value: true
    });

    position = new formattingSettings.ItemDropdown({
        name: "position",
        displayName: "Position",
        items: LEGEND_POSITIONS,
        value: LEGEND_POSITIONS[0]
    });

    name: string = "legend";
    displayName: string = "Legend";
    topLevelSlice = this.show;
    slices: Slice[] = [this.position];
}

export class ScaleBarCard extends Card {
    show = new formattingSettings.ToggleSwitch({
        name: "show",
        displayName: "Show",
        value: true
    });

    units = new formattingSettings.ItemDropdown({
        name: "units",
        displayName: "Units",
        items: SCALE_BAR_UNITS,
        value: SCALE_BAR_UNITS[0]
    });

    customUnitLabel = new formattingSettings.TextInput({
        name: "customUnitLabel",
        displayName: "Custom unit label",
        placeholder: "e.g. px, in, shelf",
        value: "units",
        visible: false
    });

    unitsPerCoordinate = new formattingSettings.NumUpDown({
        name: "unitsPerCoordinate",
        displayName: "Units per coordinate",
        description: "How many custom units one coordinate unit represents. Must be greater than 0; invalid values fall back to 1.",
        value: 1,
        visible: false
    });

    name: string = "scaleBar";
    displayName: string = "Scale bar";
    topLevelSlice = this.show;
    slices: Slice[] = [this.units, this.customUnitLabel, this.unitsPerCoordinate];
}

export class MapCard extends Card {
    flipY = new formattingSettings.ToggleSwitch({
        name: "flipY",
        displayName: "Flip Y axis",
        description: "On (default): CAD convention, y increases upwards. Off: screen convention, y increases downwards.",
        value: true
    });

    name: string = "map";
    displayName: string = "Map";
    slices: Slice[] = [this.flipY];
}

export class VisualFormattingSettingsModel extends Model {
    colorsCard = new ColorsCard();
    categoryColorsCard = new CategoryColorsCard();
    strokeCard = new StrokeCard();
    labelsCard = new LabelsCard();
    legendCard = new LegendCard();
    scaleBarCard = new ScaleBarCard();
    mapCard = new MapCard();

    cards = [
        this.colorsCard,
        this.categoryColorsCard,
        this.strokeCard,
        this.labelsCard,
        this.legendCard,
        this.scaleBarCard,
        this.mapCard
    ];
}
