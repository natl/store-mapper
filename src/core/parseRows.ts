/**
 * WKT ingestion. One entry per input row: null marks a skipped row
 * (unparseable, null/empty, or unsupported GEOMETRYCOLLECTION), so index
 * alignment with the other categorical columns is never desynchronized.
 */
import { parse } from "wellknown";
import { GeoJsonGeometry, GeometryKind, ParsedRow } from "./types";

const SUPPORTED: ReadonlySet<string> = new Set([
    "Point", "MultiPoint",
    "LineString", "MultiLineString",
    "Polygon", "MultiPolygon"
]);

function kindOf(type: string): GeometryKind {
    if (type === "Point" || type === "MultiPoint") {
        return "point";
    }
    if (type === "LineString" || type === "MultiLineString") {
        return "line";
    }
    return "area";
}

export function parseRows(
    wktStrings: ReadonlyArray<unknown>
): Array<ParsedRow | null> {
    return wktStrings.map((raw): ParsedRow | null => {
        if (typeof raw !== "string") {
            return null;
        }
        // wellknown rejects strings with leading/trailing whitespace, so the
        // exact string handed to the parser MUST be the trimmed one
        // (validating the trimmed string but parsing the raw one silently
        // skipped every row of otherwise-valid data).
        let wkt = raw.trim();
        if (wkt.length === 0) {
            return null;
        }
        // Normalize Z/M/ZM dimension tokens after the geometry keyword
        // (e.g. "POLYGON ZM (...)", "SRID=...;POINT M (...)"). wellknown
        // accepts extra ordinates per position but not the M/ZM tokens; the
        // visual only ever reads the first two ordinates, so stripping the
        // token is lossless for rendering.
        wkt = wkt.replace(/^((?:SRID=[^;]+;\s*)?[A-Za-z]+)\s+(?:Z|M|ZM)\b\s*/i, "$1 ");
        let geo: ReturnType<typeof parse>;
        try {
            geo = parse(wkt);
        } catch {
            return null;
        }
        // wellknown returns null for garbage; GEOMETRYCOLLECTION parses but
        // is unsupported here — skipped silently like bad WKT (README: split
        // collections upstream, e.g. ST_Dump).
        if (!geo || !SUPPORTED.has(geo.type)) {
            return null;
        }
        const feature = geo as unknown as GeoJsonGeometry;
        return {
            feature,
            wktType: geo.type.toUpperCase(),
            kind: kindOf(geo.type),
            hasPoint: geo.type === "Point" || geo.type === "MultiPoint"
        };
    });
}
