import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  resolveFirstMediaPath,
  resolveMediaPath,
  resolveMediaPathList,
} from "./mediaPath.ts";

const BASE = "https://api.example.com";
const one = (p: string | null | undefined) => resolveMediaPath(p, BASE);
const first = (v: unknown) => resolveFirstMediaPath(v, BASE);

describe("resolving a single image reference", () => {
  it("builds a storage URL for a stored file path", () => {
    // What the API writes now that package images are saved as files.
    assert.equal(
      one("images/packages/abc123.jpg"),
      `${BASE}/storage/images/packages/abc123.jpg`,
    );
  });

  it("does not double the storage prefix", () => {
    assert.equal(
      one("storage/images/packages/abc.jpg"),
      `${BASE}/storage/images/packages/abc.jpg`,
    );
  });

  it("passes an absolute URL through untouched", () => {
    assert.equal(one("https://cdn.example.com/a.png"), "https://cdn.example.com/a.png");
    assert.equal(one("http://cdn.example.com/a.png"), "http://cdn.example.com/a.png");
  });

  it("passes a data URI through untouched", () => {
    const uri = "data:image/png;base64,iVBORw0KGgo=";
    assert.equal(one(uri), uri);
  });

  it("rebuilds a data URI for bare base64 that lost its prefix", () => {
    const bare = "A".repeat(250);
    assert.equal(one(bare), `data:image/jpeg;base64,${bare}`);
  });

  it("treats a long path with slashes as a path, not base64", () => {
    const longPath = `images/packages/${"a".repeat(250)}.jpg`;
    assert.equal(one(longPath), `${BASE}/storage/${longPath}`);
  });

  it("appends a server-absolute path to the host", () => {
    assert.equal(one("/storage/x.jpg"), `${BASE}/storage/x.jpg`);
  });

  it("is null for nothing usable", () => {
    assert.equal(one(null), null);
    assert.equal(one(undefined), null);
    assert.equal(one(""), null);
    assert.equal(one("   "), null);
  });
});

describe("resolving a column that may hold several", () => {
  it("takes the first of an array — the shape array-cast columns arrive in", () => {
    assert.equal(
      first(["images/packages/one.jpg", "images/packages/two.jpg"]),
      `${BASE}/storage/images/packages/one.jpg`,
    );
  });

  it("reads a JSON-encoded array out of a string column", () => {
    assert.equal(
      first('["images/packages/one.jpg"]'),
      `${BASE}/storage/images/packages/one.jpg`,
    );
  });

  it("accepts a plain single string", () => {
    assert.equal(
      first("images/packages/one.jpg"),
      `${BASE}/storage/images/packages/one.jpg`,
    );
  });

  it("skips unusable entries rather than emitting a broken URL", () => {
    assert.deepEqual(
      resolveMediaPathList([null, "", "images/a.jpg", 42], BASE),
      [`${BASE}/storage/images/a.jpg`],
    );
  });

  it("is null for an empty or absent column", () => {
    assert.equal(first([]), null);
    assert.equal(first(null), null);
    assert.equal(first(undefined), null);
  });

  it("never stringifies a multi-image array into one URL", () => {
    // The bug this guards: String(["a.jpg","b.jpg"]) is "a.jpg,b.jpg", which
    // resolves to a file that does not exist.
    const resolved = first(["a.jpg", "b.jpg"]);
    assert.equal(resolved, `${BASE}/storage/a.jpg`);
    assert.ok(!resolved?.includes(","));
  });
});
