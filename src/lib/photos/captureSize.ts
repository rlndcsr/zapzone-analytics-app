const SHARP_AREA = 3840 * 2160;
const WIDE_RATIO = 16 / 9;
const WIDE_TOLERANCE = 0.03;
const MIN_AREA = 1_800_000;

type Parsed = { size: string; width: number; height: number; area: number };

function parse(sizes: readonly string[]): Parsed[] {
  return sizes
    .map((size) => {
      const m = /^(\d+)x(\d+)$/.exec(size.trim());
      if (!m) return null;
      const width = Number(m[1]);
      const height = Number(m[2]);
      return { size, width, height, area: width * height };
    })
    .filter((s): s is Parsed => !!s && s.area > 0)
    .sort((a, b) => a.area - b.area);
}

export function isWideSize(width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0)) return false;
  const ratio = Math.max(width, height) / Math.min(width, height);
  return Math.abs(ratio - WIDE_RATIO) / WIDE_RATIO <= WIDE_TOLERANCE;
}

export function pickCaptureSize(sizes: readonly string[]): string | undefined {
  const parsed = parse(sizes);
  if (parsed.length === 0) return undefined;

  const wide = parsed.filter((s) => isWideSize(s.width, s.height));
  if (wide.length > 0) {
    const atMostSharp = wide.filter((s) => s.area <= SHARP_AREA);
    return atMostSharp.length > 0
      ? atMostSharp[atMostSharp.length - 1].size
      : wide[0].size;
  }

  return (parsed.find((s) => s.area >= MIN_AREA) ?? parsed[parsed.length - 1])
    .size;
}
