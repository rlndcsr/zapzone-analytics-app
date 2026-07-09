import React from "react";
import { Text, View } from "react-native";

export type FunnelDatum = { label: string; value: number };

const LABEL_W = 96;
const VALUE_W = 52;
const TICKS = 4;

/** `1234` -> "1.2k" / "1234". */
function tick(n: number): string {
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
  return `${Math.round(n)}`;
}

/**
 * Horizontal bar chart for a conversion funnel: a fixed label column, a bar
 * scaled to the max value, and an x-axis with evenly spaced ticks.
 */
export function FunnelChart({
  data,
  color = "#2563EB",
}: {
  data: FunnelDatum[];
  color?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);

  return (
    <View>
      {data.map((d) => {
        const pct = max > 0 ? Math.round((d.value / max) * 100) : 0;
        return (
          <View key={d.label} className="flex-row items-center mb-3">
            <Text
              className="text-xs text-gray-600 dark:text-gray-300 text-right pr-2"
              style={{ width: LABEL_W }}
              numberOfLines={2}
            >
              {d.label}
            </Text>
            {/* bar track fills the middle; value sits in its own column so it
                never overlaps the bar even at 100% */}
            <View className="flex-1 h-6 justify-center">
              <View
                className="h-6 rounded-r-md"
                style={{ width: `${Math.max(pct, d.value > 0 ? 2 : 0)}%`, backgroundColor: color }}
              />
            </View>
            <Text
              className="text-xs font-semibold text-gray-700 dark:text-gray-200 text-right"
              style={{ width: VALUE_W }}
              numberOfLines={1}
            >
              {d.value.toLocaleString()}
            </Text>
          </View>
        );
      })}

      {/* x-axis ticks (aligned under the bar track) */}
      <View className="flex-row" style={{ paddingLeft: LABEL_W, paddingRight: VALUE_W }}>
        <View className="flex-1 flex-row justify-between border-t border-gray-100 dark:border-neutral-800 pt-1">
          {Array.from({ length: TICKS + 1 }).map((_, i) => (
            <Text key={i} className="text-[10px] text-gray-400 dark:text-gray-500">
              {tick((max / TICKS) * i)}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}
