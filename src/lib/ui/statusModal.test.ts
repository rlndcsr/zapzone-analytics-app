import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  statusStyle,
  statusTileColor,
  type StatusVariant,
} from "./statusModal.ts";

const ALL: StatusVariant[] = [
  "error",
  "danger",
  "success",
  "warning",
  "info",
  "confirm",
];

describe("status variants", () => {
  it("gives every variant an accent and a glyph", () => {
    for (const v of ALL) {
      const s = statusStyle(v);
      assert.match(s.accent, /^#[0-9A-F]{6}$/i, `${v} has a hex accent`);
      assert.ok(s.icon.length > 0, `${v} has an icon`);
    }
  });

  it("uses red for the two serious variants", () => {
    assert.equal(statusStyle("error").accent, statusStyle("danger").accent);
    assert.equal(statusStyle("error").accent, "#EF4444");
  });

  it("separates success, warning and info", () => {
    const accents = new Set(
      (["success", "warning", "info"] as StatusVariant[]).map(
        (v) => statusStyle(v).accent,
      ),
    );
    assert.equal(accents.size, 3);
  });

  it("distinguishes error from success — the two most confusable outcomes", () => {
    assert.notEqual(statusStyle("error").accent, statusStyle("success").accent);
  });

  it("falls back to info for an unrecognised variant", () => {
    const s = statusStyle("nonsense" as StatusVariant);
    assert.deepEqual(s, statusStyle("info"));
  });
});

describe("the icon tile", () => {
  it("is the accent at a fixed low opacity", () => {
    assert.equal(statusTileColor("#EF4444"), "#EF44441A");
  });

  it("stays in step with whatever accent it is given", () => {
    for (const v of ALL) {
      const { accent } = statusStyle(v);
      assert.ok(statusTileColor(accent).startsWith(accent));
    }
  });
});
