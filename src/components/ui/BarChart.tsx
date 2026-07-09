import React from "react";
import { Pressable, Text, View } from "react-native";

export type BarDatum = { label: string; value: number };

const TICKS = 4;

/** `16000` -> "16k" / `450` -> "450". */
function tick(n: number): string {
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
  return `${Math.round(n)}`;
}

/**
 * Vertical bar chart with a y-axis, gridlines, and pressable bars. `onBarPress`
 * fires with the tapped datum + index; `selectedIndex` highlights a bar (others
 * dim). Bars are laid out with flex so any bar count fits the width.
 */
export function BarChart({
  data,
  height = 220,
  color = "#2563EB",
  selectedIndex,
  onBarPress,
}: {
  data: BarDatum[];
  height?: number;
  color?: string;
  selectedIndex?: number | null;
  onBarPress?: (item: BarDatum, index: number) => void;
}) {
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const yLabelW = 34;

  return (
    <View>
      <View className="flex-row" style={{ height }}>
        {/* Y axis labels */}
        <View style={{ width: yLabelW }} className="justify-between py-1">
          {Array.from({ length: TICKS + 1 }).map((_, i) => (
            <Text key={i} className="text-[10px] text-gray-400 dark:text-gray-500 text-right pr-1">
              {tick((max / TICKS) * (TICKS - i))}
            </Text>
          ))}
        </View>

        {/* Plot area */}
        <View className="flex-1">
          <View className="flex-1 relative">
            {/* gridlines */}
            {Array.from({ length: TICKS + 1 }).map((_, i) => (
              <View
                key={i}
                className="absolute left-0 right-0 border-t border-gray-100 dark:border-neutral-800"
                style={{ top: `${(100 / TICKS) * i}%` }}
              />
            ))}
            {/* bars */}
            <View className="absolute inset-0 flex-row items-end">
              {data.map((d, i) => {
                const active = selectedIndex == null || selectedIndex === i;
                const heightPct = Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0);
                return (
                  <Pressable
                    key={`${d.label}-${i}`}
                    onPress={() => onBarPress?.(d, i)}
                    className="flex-1 items-center justify-end h-full"
                  >
                    <View
                      style={{
                        height: `${heightPct}%`,
                        width: "62%",
                        backgroundColor: color,
                        opacity: active ? 1 : 0.35,
                        borderTopLeftRadius: 3,
                        borderTopRightRadius: 3,
                      }}
                    />
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>

      {/* X labels */}
      <View className="flex-row" style={{ paddingLeft: yLabelW }}>
        {data.map((d, i) => (
          <Text
            key={`${d.label}-${i}`}
            className="flex-1 text-[9px] text-gray-400 dark:text-gray-500 text-center px-0.5"
            numberOfLines={1}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
