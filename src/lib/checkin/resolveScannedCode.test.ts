import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveScannedCode } from "./resolveScannedCode.ts";

const ok = (raw: string) => {
  const res = resolveScannedCode(raw);
  assert.equal(res.ok, true, `expected ${raw} to resolve`);
  return res.ok ? res.code : null;
};

describe("bare reference codes", () => {
  it("reads each prefix as its own kind", () => {
    assert.equal(ok("BK20260910EDQALA")?.kind, "booking");
    assert.equal(ok("ORD20260910EDQALA")?.kind, "ticket_order");
    assert.equal(ok("EVT-AB12CD34")?.kind, "event_purchase");
    assert.equal(ok("WV20260910EDQALA")?.kind, "waiver");
  });

  it("upper-cases the reference it hands back", () => {
    assert.equal(ok("bk20260910edqala")?.reference, "BK20260910EDQALA");
  });

  it("rejects a string that matches no prefix", () => {
    assert.deepEqual(resolveScannedCode("hello"), { ok: false, raw: "hello" });
    assert.deepEqual(resolveScannedCode("   "), { ok: false, raw: "" });
  });
});

describe("membership and photo tokens", () => {
  const token = `mbr_${"a".repeat(40)}`;

  it("takes a membership token ahead of everything else", () => {
    assert.deepEqual(ok(token), { kind: "membership", token, raw: token });
  });

  it("rejects a membership token of the wrong length", () => {
    assert.equal(resolveScannedCode(`mbr_${"a".repeat(39)}`).ok, false);
  });

  it("pulls the delivery token out of a photo URL", () => {
    const url = "https://zapzone.test/photos/qr/abcdef0123456789";
    assert.deepEqual(ok(url), {
      kind: "photo_delivery",
      token: "abcdef0123456789",
      raw: url,
    });
  });
});

describe("JSON payloads", () => {
  it("trusts a declared type over the id's shape", () => {
    const raw = JSON.stringify({ type: "ticket_order", id: 45 });
    assert.deepEqual(ok(raw), { kind: "ticket_order", id: 45, reference: undefined, raw });
  });

  it("falls back to the reference when the id is unusable", () => {
    const raw = JSON.stringify({
      type: "booking",
      id: 0,
      reference_number: "BK20260910EDQALA",
    });
    assert.deepEqual(ok(raw), {
      kind: "booking",
      reference: "BK20260910EDQALA",
      raw,
    });
  });

  it("classifies by reference when no type is declared", () => {
    const raw = JSON.stringify({ reference_number: "WV20260910EDQALA" });
    assert.equal(ok(raw)?.kind, "waiver");
  });

  it("never treats unreadable JSON as a bare reference", () => {
    assert.equal(resolveScannedCode("{not json").ok, false);
    assert.equal(resolveScannedCode(JSON.stringify({ foo: "bar" })).ok, false);
  });
});
