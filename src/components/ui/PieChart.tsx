import React from "react";
import { Text, View } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";

export type PieSlice = { label: string; value: number };

/** Palette reused across slices (blue, green, amber, then supporting hues). */
const PALETTE = [
  "#0644C7", "#16A34A", "#F59E0B", "#8B5CF6", "#EF4444",
  "#06B6D4", "#EC4899", "#65A30D", "#F97316", "#64748B",
];

/**
 * A donut/pie chart on react-native-svg with a value legend. A single non-zero
 * slice renders as a full ring (arcs can't represent a 360° sweep).
 */
export function PieChart({ data, size = 160 }: { data: PieSlice[]; size?: number }) {
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((acc, d) => acc + d.value, 0);
  const r = size / 2;
  const cx = r;
  const cy = r;

  let angle = -Math.PI / 2; // start at 12 o'clock
  const arcs = slices.map((d, i) => {
    const frac = total > 0 ? d.value / total : 0;
    const start = angle;
    const end = angle + frac * 2 * Math.PI;
    angle = end;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = frac > 0.5 ? 1 : 0;
    return {
      label: d.label,
      value: d.value,
      frac,
      color: PALETTE[i % PALETTE.length],
      path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
    };
  });

  const single = arcs.length === 1;

  return (
    <View className="items-center">
      {total === 0 ? (
        <View style={{ height: size }} className="items-center justify-center">
          <Text className="text-sm text-gray-400 dark:text-gray-500">No data</Text>
        </View>
      ) : (
        <Svg width={size} height={size}>
          <G>
            {single ? (
              <Circle cx={cx} cy={cy} r={r} fill={arcs[0].color} />
            ) : (
              arcs.map((a) => <Path key={a.label} d={a.path} fill={a.color} />)
            )}
          </G>
        </Svg>
      )}

      {/* legend */}
      <View className="flex-row flex-wrap gap-x-4 gap-y-1.5 mt-4 justify-center">
        {arcs.map((a) => (
          <View key={a.label} className="flex-row items-center gap-1.5">
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: a.color }} />
            <Text className="text-xs text-gray-600 dark:text-gray-300">
              {a.label} · {Math.round(a.frac * 100)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
