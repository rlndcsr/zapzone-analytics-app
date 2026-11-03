import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isWideSize, pickCaptureSize } from "./captureSize.ts";

describe("pickCaptureSize — 4K at 16:9, else the closest 16:9 below, never 4:3", () => {
  it("asks for 4K when the camera offers it (iOS preset list)", () => {
    const ios = ["3840x2160", "1920x1080", "1280x720", "640x480", "352x288", "Photo", "High", "Medium", "Low"];
    assert.equal(pickCaptureSize(ios), "3840x2160");
  });

  it("asks for 4K on an Android sensor list, over the bigger 4:3 sizes", () => {
    const android = ["4000x3000", "4000x2250", "3840x2160", "3264x2448", "1920x1080", "1600x1200", "640x480"];
    assert.equal(pickCaptureSize(android), "3840x2160");
  });

  it("falls back to 1080p when there is no 4K — not the 4:3 size of similar area", () => {
    // 1600x1200 (4:3, 1.92MP) is what the old "smallest ≥ 2MP" rule picked.
    assert.equal(pickCaptureSize(["3264x2448", "1920x1080", "1600x1200", "1280x720"]), "1920x1080");
  });

  it("takes the largest 16:9 size that isn't over 4K", () => {
    assert.equal(pickCaptureSize(["4000x3000", "2560x1440", "1920x1080"]), "2560x1440");
  });

  it("only goes above 4K when every 16:9 size is bigger", () => {
    assert.equal(pickCaptureSize(["4000x3000", "7680x4320", "5120x2880"]), "5120x2880");
  });

  it("a camera with no 16:9 size keeps the earlier ~2MP rule", () => {
    assert.equal(pickCaptureSize(["4000x3000", "1600x1200", "640x480"]), "1600x1200");
    assert.equal(pickCaptureSize(["1280x960", "640x480"]), "1280x960");
  });

  it("nothing usable → no size (the camera's own default is kept)", () => {
    assert.equal(pickCaptureSize([]), undefined);
    assert.equal(pickCaptureSize(["Photo", "High"]), undefined);
    assert.equal(pickCaptureSize(["0x0", "abc"]), undefined);
  });
});

describe("isWideSize", () => {
  it("accepts 16:9 either way round, within the web's 3%", () => {
    assert.equal(isWideSize(3840, 2160), true);
    assert.equal(isWideSize(2160, 3840), true);
    assert.equal(isWideSize(4000, 2250), true);
    assert.equal(isWideSize(1920, 1088), true); // a common sensor rounding
  });

  it("rejects 4:3, square and nonsense", () => {
    assert.equal(isWideSize(4000, 3000), false);
    assert.equal(isWideSize(1080, 1080), false);
    assert.equal(isWideSize(0, 1080), false);
  });
});
