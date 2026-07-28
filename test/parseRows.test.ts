import { parseRows } from "../src/core/parseRows";

describe("parseRows", () => {
    test("every supported WKT type parses", () => {
        const rows = parseRows([
            "POINT (1 2)",
            "LINESTRING (0 0, 10 10)",
            "POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0))",
            "MULTIPOINT ((1 1), (2 2))",
            "MULTILINESTRING ((0 0, 1 1), (2 2, 3 3))",
            "MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((5 5, 6 5, 6 6, 5 5)))"
        ]);
        expect(rows.every((r) => r !== null)).toBe(true);
        expect(rows.map((r) => r!.wktType)).toEqual([
            "POINT", "LINESTRING", "POLYGON",
            "MULTIPOINT", "MULTILINESTRING", "MULTIPOLYGON"
        ]);
        expect(rows.map((r) => r!.kind)).toEqual([
            "point", "line", "area", "point", "line", "area"
        ]);
        expect(rows.map((r) => r!.hasPoint)).toEqual(
            [true, false, false, true, false, false]);
    });

    test("garbage, null, empty rows and GEOMETRYCOLLECTION are skipped without throwing", () => {
        const rows = parseRows([
            "not wkt at all",
            null,
            "",
            "   ",
            undefined,
            42,
            "GEOMETRYCOLLECTION (POINT (1 2), LINESTRING (0 0, 1 1))",
            "POLYGON ((0 0, 1 0"
        ]);
        expect(rows).toHaveLength(8);
        expect(rows.every((r) => r === null)).toBe(true);
    });

    test("index alignment with category arrays is preserved after skips", () => {
        const labels = ["a", "b", "c", "d", "e"];
        const wkt = [
            "POINT (0 0)",
            "garbage",
            "POINT (2 2)",
            "GEOMETRYCOLLECTION (POINT (3 3))",
            "POINT (4 4)"
        ];
        const rows = parseRows(wkt);
        expect(rows).toHaveLength(wkt.length);
        expect(rows[1]).toBeNull();
        expect(rows[3]).toBeNull();
        // Surviving rows still line up with their original labels by index.
        const surviving = rows
            .map((r, i) => (r !== null ? labels[i] : null))
            .filter((l) => l !== null);
        expect(surviving).toEqual(["a", "c", "e"]);
        expect((rows[4]!.feature.coordinates as number[])[0]).toBe(4);
    });

    test("leading/trailing whitespace and newlines do not skip valid WKT", () => {
        // Regression: wellknown rejects untrimmed strings; the parser must
        // receive the trimmed text or whole datasets vanish silently.
        const rows = parseRows([
            "  POINT (1 2)",
            "POLYGON ((0 0, 1 0, 1 1, 0 0))  ",
            "\n\tLINESTRING (0 0, 5 5)\r\n"
        ]);
        expect(rows.every((r) => r !== null)).toBe(true);
        expect(rows.map((r) => r!.wktType))
            .toEqual(["POINT", "POLYGON", "LINESTRING"]);
    });

    test("common dialect tolerance: Z/M/ZM tokens, 3D coords, EWKT SRID prefix, lowercase", () => {
        const rows = parseRows([
            "POINT Z (1 2 3)",
            "POLYGON Z ((0 0 1, 10 0 1, 10 10 1, 0 0 1))",
            "POINT (1 2 3)",
            "SRID=4326;POINT (1 2)",
            "polygon ((0 0, 1 0, 1 1, 0 0))",
            "POINT M (1 2 9)",
            "POINT ZM (1 2 3 4)",
            "MULTIPOLYGON ZM (((0 0 1 2, 5 0 1 2, 5 5 1 2, 0 0 1 2)))",
            "SRID=28356;LINESTRING M (0 0 1, 5 5 2)"
        ]);
        expect(rows.every((r) => r !== null)).toBe(true);
        // x/y stay first regardless of extra ordinates.
        expect((rows[6]!.feature.coordinates as number[]).slice(0, 2))
            .toEqual([1, 2]);
    });

    test("documented unsupported dialects are skipped, not crashed: EMPTY, curves, comma decimals", () => {
        const rows = parseRows([
            "POINT EMPTY",
            "CURVEPOLYGON (CIRCULARSTRING (0 0, 1 1, 2 0))",
            "POINT (1,5 2,7)"
        ]);
        expect(rows.every((r) => r === null)).toBe(true);
    });
});
