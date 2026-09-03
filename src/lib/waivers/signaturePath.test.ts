import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isBlankSignature,
  strokeToPath,
  strokesToSvgDataUri,
  type Stroke,
} from "./signaturePath.ts";

const line: Stroke = [
  { x: 10, y: 10 },
  { x: 20, y: 30 },
  { x: 40, y: 15 },
];

describe("a stroke as an SVG path", () => {
  it("moves to the first point and lines to the rest", () => {
    assert.equal(strokeToPath(line), "M10 10L20 30L40 15");
  });

  it("rounds to whole pixels", () => {
    assert.equal(
      strokeToPath([
        { x: 10.4, y: 10.6 },
        { x: 20.5, y: 30.2 },
      ]),
      "M10 11L21 30",
    );
  });

  it("renders a single tap as a dot, not nothing", () => {
    // A round line cap turns a zero-length line into a visible dot.
    assert.equal(strokeToPath([{ x: 5, y: 6 }]), "M5 6l0 0");
  });

  it("is empty for an empty stroke", () => {
    assert.equal(strokeToPath([]), "");
  });
});

describe("the whole signature as a data URI", () => {
  const uri = () => strokesToSvgDataUri([line], 300, 120);

  it("produces a data URI the API will accept", () => {
    // The only server-side rule is the prefix.
    assert.ok(uri()!.startsWith("data:image/"));
    assert.ok(uri()!.startsWith("data:image/svg+xml,"));
  });

  it("carries the drawn path and the pad's dimensions", () => {
    const decoded = decodeURIComponent(uri()!.replace("data:image/svg+xml,", ""));
    assert.match(decoded, /<svg[^>]*width="300"[^>]*height="120"/);
    assert.match(decoded, /viewBox="0 0 300 120"/);
    assert.ok(decoded.includes("M10 10L20 30L40 15"));
  });

  it("escapes the markup so the URI stays well-formed", () => {
    // Raw angle brackets and quotes would break the URI.
    assert.ok(!uri()!.includes("<"));
    assert.ok(!uri()!.includes('"'));
  });

  it("keeps every stroke", () => {
    const two = strokesToSvgDataUri([line, [{ x: 1, y: 2 }, { x: 3, y: 4 }]], 300, 120)!;
    const decoded = decodeURIComponent(two.replace("data:image/svg+xml,", ""));
    assert.equal((decoded.match(/<path /g) ?? []).length, 2);
  });

  it("is null when nothing was drawn, so the optional field is omitted", () => {
    assert.equal(strokesToSvgDataUri([], 300, 120), null);
    assert.equal(strokesToSvgDataUri([[]], 300, 120), null);
  });

  it("is null for a pad with no measured size", () => {
    assert.equal(strokesToSvgDataUri([line], 0, 120), null);
    assert.equal(strokesToSvgDataUri([line], 300, 0), null);
  });
});

describe("detecting an untouched pad", () => {
  it("is blank for no strokes or only empty ones", () => {
    assert.equal(isBlankSignature([]), true);
    assert.equal(isBlankSignature([[], []]), true);
  });

  it("is not blank once a point exists", () => {
    assert.equal(isBlankSignature([[{ x: 1, y: 1 }]]), false);
  });
});
