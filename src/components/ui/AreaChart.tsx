import React, { useState } from "react";
import { LayoutChangeEvent, Text, View } from "react-native";
import Svg, {
  Circle,
  Line,
  Path,
  Text as SvgText,
} from "react-native-svg";

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
 */
export function AreaChart({
  series,
  height = 220,
  labels,
  dark,
}: {
  series: AreaSeries[];
  height?: number;
  labels?: string[];
  dark?: boolean;
}) {
  const [width, setWidth] = useState(0);
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

  const pointsFor = (s: AreaSeries): [number, number][] => {
    const max = (s.axis === "right" ? maxRight : maxLeft) || 1;
    const stepX = s.data.length > 1 ? innerW / (s.data.length - 1) : 0;
    return s.data.map((v, i) => [
      PAD_L + i * stepX,
      PAD_T + innerH - (v / max) * innerH,
    ]);
  };

  return (
    <View>
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

            {hasData &&
              series.map((s) => {
                const pts = pointsFor(s);
                if (pts.length === 0) return null;
                const line = smoothPath(pts);
                const fill =
                  (s.area ?? true) && pts.length > 1
                    ? `${line} L ${pts[pts.length - 1][0]} ${baseY} L ${pts[0][0]} ${baseY} Z`
                    : "";
                return (
                  <React.Fragment key={s.label}>
                    {fill ? <Path d={fill} fill={s.color} fillOpacity={0.18} /> : null}
                    <Path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                    {pts.length > 0 && (
                      <Circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3} fill={s.color} />
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
      </View>

      {/* x labels */}
      {labels && labels.length > 0 && n > 0 && (
        <View className="flex-row justify-between mt-1" style={{ paddingLeft: PAD_L, paddingRight: PAD_R }}>
          {[labels[0], labels[Math.floor(labels.length / 2)], labels[labels.length - 1]].map((l, i) => (
            <Text key={i} className="text-[10px] text-gray-400 dark:text-gray-500">
              {l}
            </Text>
          ))}
        </View>
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
