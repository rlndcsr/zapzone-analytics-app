import React, { useEffect, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, {
  Circle,
  Line,
  Path,
  Text as SvgText,
} from "react-native-svg";

import { isLabelShown, labelStride, nearestIndex } from "../../lib/charts/chartAxis";

export type AreaSeries = {
  label: string;
  color: string;
  data: number[];
  /** Which y-axis this series is scaled against. Defaults to "left". */
  axis?: "left" | "right";
  /** Fill the area under the line. Defaults to true. */
  area?: boolean;
};

const PAD_L = 34;
const PAD_R = 42;
const PAD_T = 10;
const PAD_B = 22;
const TICKS = 4;
/** "spaced" x labels keep at least this many px between label centres. */
const MIN_LABEL_SPACING = 34;
const LABEL_W = 40;

/** A Catmull-Rom → cubic-bézier smoothed path through the points. */
function smoothPath(points: [number, number][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  return d;
}

const niceNum = (n: number) => {
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
  return `${Math.round(n)}`;
};

/**
 * A smoothed multi-series area chart with optional dual y-axis and gridlines —
 * built on react-native-svg (the app has no charting library). Left-axis series
 * share one scale; right-axis series share another (e.g. views vs revenue).
 *
 * Opt-in extras (off by default, so existing screens are unchanged):
 * - `interactive`: tap the plot to select the nearest point. A guide line marks
 *   it and a readout above the chart gives every series' exact value there.
 *   Tapping the same point again clears it.
 * - `xLabelMode="spaced"`: x labels sit under their own points and thin out to
 *   fit the width, instead of only first / middle / last.
 */
export function AreaChart({
  series,
  height = 220,
  labels,
  dark,
  interactive = false,
  formatValue,
  xLabelMode = "ends",
}: {
  series: AreaSeries[];
  height?: number;
  labels?: string[];
  dark?: boolean;
  interactive?: boolean;
  /** Readout formatting per series. Defaults to the plain number. */
  formatValue?: (value: number, series: AreaSeries) => string;
  xLabelMode?: "ends" | "spaced";
}) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const innerW = Math.max(0, width - PAD_L - PAD_R);
  const innerH = height - PAD_T - PAD_B;
  const baseY = PAD_T + innerH;

  const grid = dark ? "#374151" : "#E5E7EB";
  const axisText = dark ? "#9CA3AF" : "#9CA3AF";

  const leftSeries = series.filter((s) => (s.axis ?? "left") === "left");
  const rightSeries = series.filter((s) => s.axis === "right");
  const maxLeft = Math.max(1, ...leftSeries.flatMap((s) => s.data));
  const maxRight = Math.max(1, ...rightSeries.flatMap((s) => s.data));
  const hasRight = rightSeries.length > 0;
  const n = Math.max(...series.map((s) => s.data.length), 0);
  const hasData = series.some((s) => s.data.some((v) => v > 0));

  // New data (another period or location) starts with nothing selected, so a
  // readout never describes the previous figures.
  const dataSignature = `${labels?.join("|") ?? ""}#${series.map((s) => s.data.join(",")).join(";")}`;
  useEffect(() => {
    setSelected(null);
  }, [dataSignature]);

  const active = interactive && hasData && selected !== null && selected < n ? selected : null;
  const stepX = n > 1 ? innerW / (n - 1) : 0;

  const pointsFor = (s: AreaSeries): [number, number][] => {
    const max = (s.axis === "right" ? maxRight : maxLeft) || 1;
    const sStep = s.data.length > 1 ? innerW / (s.data.length - 1) : 0;
    return s.data.map((v, i) => [
      PAD_L + i * sStep,
      PAD_T + innerH - (v / max) * innerH,
    ]);
  };

  const fmt = (v: number, s: AreaSeries) => (formatValue ? formatValue(v, s) : `${v}`);

  return (
    <View>
      {interactive && (
        <View className="min-h-[36px] mb-1 justify-center">
          {active === null ? (
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              {hasData ? "Tap the chart to see exact values" : " "}
            </Text>
          ) : (
            <View>
              <Text className="text-xs font-semibold text-gray-900 dark:text-white">
                {labels?.[active] ?? `Point ${active + 1}`}
              </Text>
              <View className="flex-row flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                {series.map((s) =>
                  s.data[active] === undefined ? null : (
                    <View key={s.label} className="flex-row items-center gap-1.5">
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} />
                      <Text className="text-xs text-gray-600 dark:text-gray-300">
                        {s.label}:{" "}
                        <Text className="font-semibold text-gray-900 dark:text-white">
                          {fmt(s.data[active], s)}
                        </Text>
                      </Text>
                    </View>
                  ),
                )}
              </View>
            </View>
          )}
        </View>
      )}

      <View onLayout={onLayout} style={{ height }}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {/* gridlines + axis labels */}
            {Array.from({ length: TICKS + 1 }).map((_, i) => {
              const y = PAD_T + (innerH / TICKS) * i;
              const frac = 1 - i / TICKS;
              return (
                <React.Fragment key={i}>
                  <Line x1={PAD_L} y1={y} x2={width - PAD_R} y2={y} stroke={grid} strokeWidth={1} />
                  <SvgText x={PAD_L - 4} y={y + 3} fontSize={9} fill={axisText} textAnchor="end">
                    {niceNum(maxLeft * frac)}
                  </SvgText>
                  {hasRight && (
                    <SvgText x={width - PAD_R + 4} y={y + 3} fontSize={9} fill={axisText} textAnchor="start">
                      {niceNum(maxRight * frac)}
                    </SvgText>
                  )}
                </React.Fragment>
              );
            })}

            {active !== null && (
              <Line
                x1={PAD_L + active * stepX}
                y1={PAD_T}
                x2={PAD_L + active * stepX}
                y2={baseY}
                stroke={dark ? "#6B7280" : "#9CA3AF"}
                strokeWidth={1}
                strokeDasharray="3,3"
              />
            )}

            {hasData &&
              series.map((s) => {
                const pts = pointsFor(s);
                if (pts.length === 0) return null;
                const line = smoothPath(pts);
                const fill =
                  (s.area ?? true) && pts.length > 1
                    ? `${line} L ${pts[pts.length - 1][0]} ${baseY} L ${pts[0][0]} ${baseY} Z`
                    : "";
                const marker = active !== null ? pts[active] : pts[pts.length - 1];
                return (
                  <React.Fragment key={s.label}>
                    {fill ? <Path d={fill} fill={s.color} fillOpacity={0.18} /> : null}
                    <Path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {marker && (
                      <Circle
                        cx={marker[0]}
                        cy={marker[1]}
                        r={active !== null ? 4.5 : 3}
                        fill={s.color}
                        stroke={active !== null ? (dark ? "#171717" : "#FFFFFF") : undefined}
                        strokeWidth={active !== null ? 2 : 0}
                      />
                    )}
                  </React.Fragment>
                );
              })}
          </Svg>
        )}
        {width > 0 && !hasData && (
          <View className="absolute inset-0 items-center justify-center">
            <Text className="text-sm text-gray-400 dark:text-gray-500">No data for this range</Text>
          </View>
        )}
        {interactive && hasData && width > 0 && (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={(e) => {
              const i = nearestIndex(e.nativeEvent.locationX, n, PAD_L, innerW);
              setSelected((prev) => (prev === i ? null : i));
            }}
            accessibilityRole="button"
            accessibilityLabel="Chart. Tap to see the value at a point."
          />
        )}
      </View>

      {/* x labels */}
      {labels && labels.length > 0 && n > 0 && xLabelMode === "ends" && (
        <View className="flex-row justify-between mt-1" style={{ paddingLeft: PAD_L, paddingRight: PAD_R }}>
          {[labels[0], labels[Math.floor(labels.length / 2)], labels[labels.length - 1]].map((l, i) => (
            <Text key={i} className="text-[10px] text-gray-400 dark:text-gray-500">
              {l}
            </Text>
          ))}
        </View>
      )}
      {labels && labels.length > 0 && n > 0 && xLabelMode === "spaced" && width > 0 && (
        <SpacedLabels
          labels={labels.slice(0, n)}
          width={width}
          stepX={stepX}
          innerW={innerW}
          active={active}
        />
      )}

      {/* legend */}
      <View className="flex-row flex-wrap gap-4 mt-2 justify-center">
        {series.map((s) => (
          <View key={s.label} className="flex-row items-center gap-1.5">
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: s.color }} />
            <Text className="text-xs text-gray-500 dark:text-gray-400">{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Labels under their own points, thinned to fit; the selected point's label always shows. */
function SpacedLabels({
  labels,
  width,
  stepX,
  innerW,
  active,
}: {
  labels: string[];
  width: number;
  stepX: number;
  innerW: number;
  active: number | null;
}) {
  const maxLabels = Math.max(2, Math.floor(innerW / MIN_LABEL_SPACING) + 1);
  const stride = labelStride(labels.length, maxLabels);
  return (
    <View className="mt-1" style={{ height: 14 }}>
      {labels.map((l, i) => {
        const shown = isLabelShown(i, stride) || i === active;
        if (!shown) return null;
        // Skip a thinned-in label that would collide with the selected one.
        if (active !== null && i !== active && Math.abs(i - active) * stepX < MIN_LABEL_SPACING) {
          return null;
        }
        const centre = PAD_L + i * stepX;
        const left = Math.min(Math.max(0, centre - LABEL_W / 2), width - LABEL_W);
        return (
          <Text
            // The selected flag is in the key so a restyle remounts the label.
            key={`${l}-${i}-${i === active}`}
            numberOfLines={1}
            className={
              i === active
                ? "text-[10px] font-semibold text-gray-700 dark:text-gray-200"
                : "text-[10px] text-gray-400 dark:text-gray-500"
            }
            style={{ position: "absolute", left, width: LABEL_W, textAlign: "center" }}
          >
            {l}
          </Text>
        );
      })}
    </View>
  );
}
