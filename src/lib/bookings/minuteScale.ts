export type StretchSpan = {
  startMinutes: number;
  endMinutes: number;
  minHeight: number;
};

export type MinuteScale = {
  base: number;
  height: number;
  at(minute: number): number;
  minuteAt(offsetPx: number): number;
  spanHeight(fromMinute: number, toMinute: number): number;
};

type Segment = { from: number; to: number; rate: number; top: number };

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/** The last index whose key is at or before `value`; `keys` must be ascending. */
function lastAtOrBefore(keys: readonly number[], value: number): number {
  let lo = 0;
  let hi = keys.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (keys[mid] <= value) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function buildMinuteScale(
  startMinutes: number,
  endMinutes: number,
  pxPerMinute: number,
  stretch: readonly StretchSpan[] = [],
): MinuteScale {
  const base = Math.max(0.01, finite(pxPerMinute, 1));
  const start = finite(startMinutes, 0);
  const end = Math.max(start + 1, finite(endMinutes, start + 1));

  // a span already tall enough at the base rate asks for nothing
  const wanted = stretch
    .map((span) => ({
      from: Math.max(start, finite(span.startMinutes, NaN)),
      to: Math.min(end, finite(span.endMinutes, NaN)),
      minHeight: finite(span.minHeight, 0),
    }))
    .filter(
      (span) =>
        span.to > span.from && span.minHeight > (span.to - span.from) * base,
    );

  const edges = new Set<number>([start, end]);
  for (const span of wanted) {
    edges.add(span.from);
    edges.add(span.to);
  }
  const points = [...edges].sort((a, b) => a - b);

  const rates = new Array<number>(points.length - 1).fill(base);
  for (const span of wanted) {
    const rate = span.minHeight / (span.to - span.from);
    for (let i = lastAtOrBefore(points, span.from); points[i] < span.to; i++) {
      rates[i] = Math.max(rates[i], rate);
    }
  }

  const segments: Segment[] = [];
  let top = 0;
  for (let i = 0; i < rates.length; i++) {
    segments.push({ from: points[i], to: points[i + 1], rate: rates[i], top });
    top += (points[i + 1] - points[i]) * rates[i];
  }
  const height = top;
  const froms = segments.map((s) => s.from);
  const tops = segments.map((s) => s.top);

  const at = (minute: number): number => {
    const m = finite(minute, start);
    if (m <= start) return (m - start) * base;
    if (m >= end) return height + (m - end) * base;
    const segment = segments[lastAtOrBefore(froms, m)];
    return segment.top + (m - segment.from) * segment.rate;
  };

  const minuteAt = (offsetPx: number): number => {
    const px = finite(offsetPx, 0);
    if (px <= 0) return start + px / base;
    if (px >= height) return end + (px - height) / base;
    const segment = segments[lastAtOrBefore(tops, px)];
    return segment.from + (px - segment.top) / segment.rate;
  };

  return {
    base,
    height,
    at,
    minuteAt,
    spanHeight: (from, to) => at(to) - at(from),
  };
}
