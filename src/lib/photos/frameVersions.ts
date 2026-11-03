export type PhotoFrameShape = "landscape" | "portrait" | "square";
export type FrameShape = "landscape" | "portrait";
export const FRAME_SHAPES: FrameShape[] = ["landscape", "portrait"];
export type FrameSlot = "image" | "alt_image";

export type PhotoOverlayVersion = {
  slot: FrameSlot;
  url: string;
  width: number | null;
  height: number | null;
  shape: PhotoFrameShape | null;
};

export type RawOverlayVersion = {
  slot?: string | null;
  url?: string | null;
  width?: number | null;
  height?: number | null;
  shape?: string | null;
};

export type ImageSize = { width: number; height: number };

export const SHAPE_NAMES: Record<FrameShape, string> = {
  landscape: "Landscape",
  portrait: "Portrait",
};

export const SHAPE_HINTS: Record<FrameShape, string> = {
  landscape: "wide, for example 1920 × 1080; used for photos taken sideways",
  portrait: "tall, for example 1080 × 1920; used for photos taken upright",
};

/** PNG and WebP only: a frame needs a see-through middle, which JPEG can't hold. */
export const FRAME_FILE_TYPES = ["image/png", "image/webp"];

const asShape = (value: unknown): PhotoFrameShape | null =>
  value === "landscape" || value === "portrait" || value === "square"
    ? value
    : null;

export function mapOverlayVersions(
  raw: RawOverlayVersion[] | null | undefined,
): PhotoOverlayVersion[] | null {
  if (!Array.isArray(raw)) return null;
  return raw
    .filter((v) => (v.slot === "image" || v.slot === "alt_image") && !!v.url)
    .map((v) => ({
      slot: v.slot as FrameSlot,
      url: v.url as string,
      width: v.width ?? null,
      height: v.height ?? null,
      shape: asShape(v.shape),
    }));
}

export const asFrameShape = asShape;

export const sizeShape = (size: ImageSize): PhotoFrameShape =>
  size.width === size.height
    ? "square"
    : size.width > size.height
      ? "landscape"
      : "portrait";

/** Portrait must be taller than wide; landscape takes wide or square. */
export const fitsShape = (shape: FrameShape, size: ImageSize): boolean =>
  shape === "portrait" ? size.height > size.width : size.width >= size.height;

export function wrongShapeMessage(shape: FrameShape, size: ImageSize): string {
  const actual = sizeShape(size);
  const described =
    actual === "square" ? "square" : actual === "landscape" ? "wide" : "tall";
  return `This image is ${described} (${size.width} × ${size.height}), so it can't be the ${shape} version.`;
}

export function overlayVersions(overlay: {
  imageUrl: string | null;
  versions: PhotoOverlayVersion[] | null;
}): PhotoOverlayVersion[] {
  if (overlay.versions) return overlay.versions;
  return overlay.imageUrl
    ? [
        {
          slot: "image",
          url: overlay.imageUrl,
          width: null,
          height: null,
          shape: null,
        },
      ]
    : [];
}

export const versionsKnown = (overlay: {
  versions: PhotoOverlayVersion[] | null;
}): boolean =>
  Array.isArray(overlay.versions) &&
  overlay.versions.every((v) => v.shape !== null);

export const versionFor = (
  versions: PhotoOverlayVersion[],
  shape: FrameShape,
): PhotoOverlayVersion | undefined =>
  versions.find((v) =>
    shape === "portrait"
      ? v.shape === "portrait"
      : v.shape === "landscape" || v.shape === "square",
  );

export type VersionRow = {
  shape: FrameShape;
  version: PhotoOverlayVersion | undefined;
  action: "replace" | "add" | null;
  slot: FrameSlot;
  canRemove: boolean;
};

export function versionRows(overlay: {
  imageUrl: string | null;
  versions: PhotoOverlayVersion[] | null;
  versionsSupported: boolean | null;
}): VersionRow[] {
  const versions = overlayVersions(overlay);
  const supported = overlay.versionsSupported !== false;
  return FRAME_SHAPES.map((shape) => {
    const version = versionFor(versions, shape);
    const slot: FrameSlot = version ? version.slot : "alt_image";
    const canAdd = !version && supported && versions.length < 2;
    const slotWritable = slot !== "alt_image" || supported;
    return {
      shape,
      version,
      action: !slotWritable
        ? null
        : version
          ? "replace"
          : canAdd
            ? "add"
            : null,
      slot,
      canRemove: version?.slot === "alt_image" && supported,
    };
  });
}

export function missingShapeNote(
  shape: PhotoFrameShape | null | undefined,
): string | null {
  if (shape === "portrait") {
    return "No portrait version yet, so photos taken upright cut off this frame’s sides. Add a portrait version.";
  }
  if (shape === "landscape") {
    return "No landscape version yet, so photos taken sideways cut off this frame’s top and bottom. Add a landscape version.";
  }
  return null;
}

export function frameShapeTip(
  missing: PhotoFrameShape | null | undefined,
): string | null {
  if (missing === "portrait") {
    return "Today’s frame has no portrait version yet, so photos taken upright cut off its sides. Hold the device sideways to get the whole frame. A manager can add a portrait version in Overlays.";
  }
  if (missing === "landscape") {
    return "Today’s frame has no landscape version yet, so photos taken sideways cut off its top and bottom. Hold the device upright to get the whole frame. A manager can add a landscape version in Overlays.";
  }
  return null;
}

export function createFrameFiles<T>(files: Record<FrameShape, T | null>): {
  image: T | null;
  altImage: T | null;
} {
  return {
    image: files.landscape ?? files.portrait,
    altImage: files.landscape && files.portrait ? files.portrait : null,
  };
}

export const portraitDropped = (
  files: Record<FrameShape, unknown>,
  saved: { altImageUrl: string | null },
): boolean => Boolean(files.landscape && files.portrait) && !saved.altImageUrl;

export const PORTRAIT_DROPPED_MESSAGE =
  "Overlay uploaded with its landscape version only, because the server could not keep the portrait version yet. Add it from the frame’s card in a few minutes.";

export const versionSavedMessage = (shape: FrameShape): string =>
  `${SHAPE_NAMES[shape]} version saved. New photos taken ${shape === "portrait" ? "upright" : "sideways"} use it.`;

export function versionSizeLabel(
  version: PhotoOverlayVersion | undefined,
): string {
  if (!version) return "Missing";
  const size =
    version.width && version.height
      ? `${version.width} × ${version.height}`
      : "Size unknown";
  return version.shape === "square" ? `${size} (square)` : size;
}
