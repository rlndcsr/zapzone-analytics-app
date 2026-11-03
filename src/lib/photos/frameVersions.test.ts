import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createFrameFiles,
  fitsShape,
  frameShapeTip,
  mapOverlayVersions,
  missingShapeNote,
  overlayVersions,
  portraitDropped,
  sizeShape,
  versionFor,
  versionRows,
  versionSavedMessage,
  versionSizeLabel,
  versionsKnown,
  wrongShapeMessage,
  type PhotoOverlayVersion,
} from "./frameVersions.ts";

const wide: PhotoOverlayVersion = { slot: "image", url: "https://x/wide.png", width: 1920, height: 1080, shape: "landscape" };
const tall: PhotoOverlayVersion = { slot: "alt_image", url: "https://x/tall.png", width: 1080, height: 1920, shape: "portrait" };
const tallMain: PhotoOverlayVersion = { ...tall, slot: "image" };
const square: PhotoOverlayVersion = { slot: "image", url: "https://x/sq.png", width: 1080, height: 1080, shape: "square" };

const frame = (versions: PhotoOverlayVersion[] | null, extra: Partial<{ imageUrl: string | null; versionsSupported: boolean | null }> = {}) => ({
  imageUrl: versions?.[0]?.url ?? "https://x/legacy.png",
  versions,
  versionsSupported: true as boolean | null,
  ...extra,
});

describe("shape rules (web fitsShape / FrameImage::shape)", () => {
  it("names a size's shape", () => {
    assert.equal(sizeShape({ width: 1920, height: 1080 }), "landscape");
    assert.equal(sizeShape({ width: 1080, height: 1920 }), "portrait");
    assert.equal(sizeShape({ width: 800, height: 800 }), "square");
  });

  it("takes a wide or square file as landscape, only a tall one as portrait", () => {
    assert.equal(fitsShape("landscape", { width: 1920, height: 1080 }), true);
    assert.equal(fitsShape("landscape", { width: 1000, height: 1000 }), true);
    assert.equal(fitsShape("landscape", { width: 1080, height: 1920 }), false);
    assert.equal(fitsShape("portrait", { width: 1080, height: 1920 }), true);
    assert.equal(fitsShape("portrait", { width: 1000, height: 1000 }), false);
    assert.equal(fitsShape("portrait", { width: 1920, height: 1080 }), false);
  });

  it("explains a refused file in the web's words", () => {
    assert.equal(
      wrongShapeMessage("portrait", { width: 1920, height: 1080 }),
      "This image is wide (1920 × 1080), so it can't be the portrait version.",
    );
    assert.equal(
      wrongShapeMessage("portrait", { width: 900, height: 900 }),
      "This image is square (900 × 900), so it can't be the portrait version.",
    );
    assert.equal(
      wrongShapeMessage("landscape", { width: 1080, height: 1920 }),
      "This image is tall (1080 × 1920), so it can't be the landscape version.",
    );
  });
});

describe("reading the API's versions", () => {
  it("keeps valid versions and drops unknown slots or missing urls", () => {
    assert.deepEqual(
      mapOverlayVersions([
        { slot: "image", url: "a", width: 10, height: 5, shape: "landscape" },
        { slot: "alt_image", url: "b", width: null, height: null, shape: null },
        { slot: "other", url: "c" },
        { slot: "image", url: null },
      ]),
      [
        { slot: "image", url: "a", width: 10, height: 5, shape: "landscape" },
        { slot: "alt_image", url: "b", width: null, height: null, shape: null },
      ],
    );
  });

  it("reports no versions for a server that predates them", () => {
    assert.equal(mapOverlayVersions(undefined), null);
  });

  it("stands the legacy image in for a frame without versions", () => {
    const versions = overlayVersions({ imageUrl: "https://x/legacy.png", versions: null });
    assert.equal(versions.length, 1);
    assert.equal(versions[0].shape, null);
    assert.equal(versionsKnown({ versions: null }), false);
    assert.equal(versionsKnown({ versions: [wide, { ...tall, shape: null }] }), false);
    assert.equal(versionsKnown({ versions: [wide, tall] }), true);
  });
});

describe("picking the version for a shape", () => {
  it("finds the landscape and the portrait version", () => {
    assert.equal(versionFor([wide, tall], "landscape"), wide);
    assert.equal(versionFor([wide, tall], "portrait"), tall);
  });

  it("treats a square frame as the landscape version", () => {
    assert.equal(versionFor([square], "landscape"), square);
    assert.equal(versionFor([square], "portrait"), undefined);
  });
});

describe("Add, Replace and Remove per shape", () => {
  it("offers Replace on both and Remove on the second version only", () => {
    const [land, port] = versionRows(frame([wide, tall]));
    assert.deepEqual([land.action, land.slot, land.canRemove], ["replace", "image", false]);
    assert.deepEqual([port.action, port.slot, port.canRemove], ["replace", "alt_image", true]);
  });

  it("offers Add for the missing shape, into the second slot", () => {
    const [land, port] = versionRows(frame([wide]));
    assert.equal(land.action, "replace");
    assert.deepEqual([port.version, port.action, port.slot], [undefined, "add", "alt_image"]);
  });

  it("works when the main image is the portrait one", () => {
    const [land, port] = versionRows(frame([tallMain]));
    assert.deepEqual([land.action, land.slot], ["add", "alt_image"]);
    assert.deepEqual([port.action, port.slot, port.canRemove], ["replace", "image", false]);
  });

  it("offers nothing on the second slot when the server can't keep one", () => {
    const [land, port] = versionRows(frame([wide], { versionsSupported: false }));
    assert.equal(land.action, "replace");
    assert.equal(port.action, null);
    assert.equal(port.canRemove, false);
  });

  it("treats a server that doesn't say as supporting versions", () => {
    assert.equal(versionRows(frame([wide], { versionsSupported: null }))[1].action, "add");
  });

  it("labels sizes, squares and missing versions", () => {
    assert.equal(versionSizeLabel(wide), "1920 × 1080");
    assert.equal(versionSizeLabel(square), "1080 × 1080 (square)");
    assert.equal(versionSizeLabel(undefined), "Missing");
  });

  it("says which photos a saved version is used for", () => {
    assert.equal(versionSavedMessage("portrait"), "Portrait version saved. New photos taken upright use it.");
    assert.equal(versionSavedMessage("landscape"), "Landscape version saved. New photos taken sideways use it.");
  });
});

describe("missing-shape warnings", () => {
  it("warns on the card for each missing shape, and not when both exist", () => {
    assert.match(missingShapeNote("portrait") ?? "", /No portrait version yet.*upright cut off this frame’s sides/);
    assert.match(missingShapeNote("landscape") ?? "", /No landscape version yet.*sideways cut off this frame’s top and bottom/);
    assert.equal(missingShapeNote(null), null);
    assert.equal(missingShapeNote("square"), null);
  });

  it("gives the capture screen a tip naming how to hold the device", () => {
    assert.match(frameShapeTip("portrait") ?? "", /no portrait version yet.*Hold the device sideways/);
    assert.match(frameShapeTip("landscape") ?? "", /no landscape version yet.*Hold the device upright/);
    assert.equal(frameShapeTip(null), null);
    assert.equal(frameShapeTip(undefined), null);
  });
});

describe("files sent on create", () => {
  const L = { uri: "file:///land.png" };
  const P = { uri: "file:///port.png" };

  it("sends landscape as the image and portrait as the second version", () => {
    assert.deepEqual(createFrameFiles({ landscape: L, portrait: P }), { image: L, altImage: P });
  });

  it("sends a lone version as the image, whichever shape it is", () => {
    assert.deepEqual(createFrameFiles({ landscape: L, portrait: null }), { image: L, altImage: null });
    assert.deepEqual(createFrameFiles({ landscape: null, portrait: P }), { image: P, altImage: null });
  });

  it("notices when an older server dropped the portrait version", () => {
    assert.equal(portraitDropped({ landscape: L, portrait: P }, { altImageUrl: null }), true);
    assert.equal(portraitDropped({ landscape: L, portrait: P }, { altImageUrl: "https://x/p.png" }), false);
    assert.equal(portraitDropped({ landscape: L, portrait: null }, { altImageUrl: null }), false);
  });
});
