/**
 * Turning drawn strokes into something the waiver record can store.
 *
 * `signature_image` is kept verbatim as a string and only has to start with
 * `data:image/`, so the signature is emitted as an SVG data URI. SVG rather
 * than PNG because React Native cannot rasterise a canvas without a native
 * dependency, and URL-encoded rather than base64 because the app has no base64
 * encoder and browsers render either form.
 */

/** A point in the pad's coordinate space. */
export type Point = { x: number; y: number };

/** One continuous pen-down..pen-up line. */
export type Stroke = Point[];

/** Round to whole pixels — sub-pixel precision only inflates the payload. */
const r = (n: number) => Math.round(n);

/**
 * One stroke as an SVG path. A single point becomes a dot (a zero-length line
 * with a round cap), which is what a tap on the pad should leave behind.
 */
export function strokeToPath(stroke: Stroke): string {
  if (stroke.length === 0) return "";
  const [first, ...rest] = stroke;
  if (rest.length === 0) return `M${r(first.x)} ${r(first.y)}l0 0`;
  return `M${r(first.x)} ${r(first.y)}` + rest.map((p) => `L${r(p.x)} ${r(p.y)}`).join("");
}

/** True when nothing has actually been drawn. */
export function isBlankSignature(strokes: Stroke[]): boolean {
  return strokes.every((s) => s.length === 0);
}

/**
 * The whole signature as an SVG data URI, or null when the pad is empty — the
 * field is optional, and an empty <svg> is worse than sending nothing.
 */
export function strokesToSvgDataUri(
  strokes: Stroke[],
  width: number,
  height: number,
  { stroke = "#111827", strokeWidth = 2 } = {},
): string | null {
  if (!strokes.length || isBlankSignature(strokes)) return null;
  if (!(width > 0) || !(height > 0)) return null;

  const paths = strokes
    .map(strokeToPath)
    .filter(Boolean)
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${r(width)}" height="${r(height)}" ` +
    `viewBox="0 0 ${r(width)} ${r(height)}">${paths}</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
