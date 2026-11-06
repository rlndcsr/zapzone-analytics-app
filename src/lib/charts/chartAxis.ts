export function labelStride(count: number, maxLabels: number): number {
  if (count <= 0 || maxLabels <= 0) return 1;
  return Math.max(1, Math.ceil(count / maxLabels));
}

/** Whether index `index`'s label shows at a given stride: 0, n, 2n, ... */
export function isLabelShown(index: number, stride: number): boolean {
  return stride <= 1 || index % stride === 0;
}

export function nearestIndex(
  x: number,
  count: number,
  left: number,
  width: number,
): number {
  if (count <= 1 || width <= 0) return 0;
  const step = width / (count - 1);
  const i = Math.round((x - left) / step);
  return Math.min(count - 1, Math.max(0, i));
}
