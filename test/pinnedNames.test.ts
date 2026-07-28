/**
 * Pinned capabilities object/property names — a rename in one place must
 * fail loudly everywhere. capabilities.json is asserted against the shared
 * constants module that settings.ts and visual.ts both import.
 */
import { PINNED } from "../src/core/constants";
import * as capabilities from "../capabilities.json";

type Objects = Record<string, { properties: Record<string, unknown> }>;
const objects = (capabilities as unknown as { objects: Objects }).objects;

describe("pinned object/property names", () => {
    test("fx default color lives at colors.defaultColor", () => {
        expect(PINNED.colors.objectName).toBe("colors");
        expect(PINNED.colors.defaultColor).toBe("defaultColor");
        const colors = objects[PINNED.colors.objectName];
        expect(colors).toBeDefined();
        expect(colors.properties[PINNED.colors.defaultColor]).toBeDefined();
    });

    test("per-category overrides live at dataColors.fill", () => {
        expect(PINNED.dataColors.objectName).toBe("dataColors");
        expect(PINNED.dataColors.fill).toBe("fill");
        const dataColors = objects[PINNED.dataColors.objectName];
        expect(dataColors).toBeDefined();
        expect(dataColors.properties[PINNED.dataColors.fill]).toBeDefined();
    });

    test("remaining colors card properties exist in capabilities", () => {
        const colors = objects[PINNED.colors.objectName];
        expect(colors.properties[PINNED.colors.minColor]).toBeDefined();
        expect(colors.properties[PINNED.colors.maxColor]).toBeDefined();
        expect(colors.properties[PINNED.colors.logScale]).toBeDefined();
    });
});

describe("certification constraints in capabilities", () => {
    test("privileges is an empty array (no WebAccess)", () => {
        expect((capabilities as unknown as { privileges: unknown[] }).privileges)
            .toEqual([]);
    });

    test("highlight support and tooltips are declared", () => {
        const caps = capabilities as unknown as {
            supportsHighlight: boolean;
            supportsMultiVisualSelection: boolean;
            tooltips: { roles: string[] };
        };
        expect(caps.supportsHighlight).toBe(true);
        expect(caps.supportsMultiVisualSelection).toBe(true);
        expect(caps.tooltips.roles).toContain("tooltips");
    });

    test("data reduction caps rows at 30,000", () => {
        const caps = capabilities as unknown as {
            dataViewMappings: Array<{
                categorical: {
                    categories: {
                        dataReductionAlgorithm: { top: { count: number } }
                    }
                }
            }>;
        };
        expect(caps.dataViewMappings[0].categorical.categories
            .dataReductionAlgorithm.top.count).toBe(30000);
    });
});
