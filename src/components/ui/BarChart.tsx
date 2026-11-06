import React, { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { isLabelShown, labelStride } from "../../lib/charts/chartAxis";

export type BarDatum = { label: string; value: number };

const TICKS = 4;
/** Width a thinned x label may use, wider than its own bar's column. */
const THINNED_LABEL_W = 44;

/** `16000` -> "16k" / `450` -> "450". */
function tick(n: number): string {
  if (n >= 1000) return `${Math.round(n / 100) / 10}k`;
  return `${Math.round(n)}`;
}

/**
 * Vertical bar chart with a y-axis, gridlines, and pressable bars. `onBarPress`
 * fires with the tapped datum + index; `selectedIndex` highlights a bar (others
 * dim). Bars are laid out with flex so any bar count fits the width.
 *
 * Opt-in extras (off by default, so existing screens are unchanged):
 * - `interactive`: tapping a bar selects it and a readout above the chart gives
 *   its label and exact value. Tapping it again clears it. A `selectedIndex`
 *   from the parent still wins over the chart's own selection.
 * - `maxXLabels`: show at most this many x labels (every bar is still drawn),
 *   on one line each, so a dense chart like 24 hours stays legible.
 */
export function BarChart({
  data,
  height = 220,
  color = "#2563EB",
  selectedIndex,
  onBarPress,
  interactive = false,
  formatValue,
  maxXLabels,
}: {
  data: BarDatum[];
  height?: number;
  color?: string;
  selectedIndex?: number | null;
  onBarPress?: (item: BarDatum, index: number) => void;
  interactive?: boolean;
  /** Readout formatting. Defaults to the plain number. */
  formatValue?: (value: number) => string;
  maxXLabels?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const yLabelW = 34;

  const [ownSelected, setOwnSelected] = useState<number | null>(null);
  const dataSignature = data.map((d) => `${d.label}:${d.value}`).join("|");
  // New data (another period or location) starts with nothing selected.
  useEffect(() => {
    setOwnSelected(null);
  }, [dataSignature]);

  const controlled = selectedIndex !== undefined;
  const selected = controlled
    ? selectedIndex
    : interactive && ownSelected !== null && ownSelected < data.length
      ? ownSelected
      : null;
  const stride = maxXLabels ? labelStride(data.length, maxXLabels) : 1;
  const readout = interactive && selected != null ? data[selected] : undefined;

  return (
    <View>
      {interactive && (
        <View className="min-h-[20px] mb-1 justify-center">
          {readout ? (
            <Text className="text-xs text-gray-600 dark:text-gray-300">
              <Text className="font-semibold text-gray-900 dark:text-white">{readout.label}</Text>
              {"  ·  "}
              <Text className="font-semibold text-gray-900 dark:text-white">
                {formatValue ? formatValue(readout.value) : readout.value}
              </Text>
            </Text>
          ) : (
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              {data.length > 0 ? "Tap a bar to see its value" : " "}
            </Text>
          )}
        </View>
      )}

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
                const active = selected == null || selected === i;
                const heightPct = Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0);
                return (
                  <Pressable
                    key={`${d.label}-${i}`}
                    onPress={() => {
                      onBarPress?.(d, i);
                      if (interactive && !controlled) {
                        setOwnSelected((prev) => (prev === i ? null : i));
                      }
                    }}
                    className="flex-1 items-center justify-end h-full"
                    accessibilityRole={interactive ? "button" : undefined}
                    accessibilityLabel={interactive ? `${d.label}: ${formatValue ? formatValue(d.value) : d.value}` : undefined}
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
      {maxXLabels ? (
        <View className="flex-row" style={{ paddingLeft: yLabelW, height: 14 }}>
          {data.map((d, i) => (
            <View key={`${d.label}-${i}`} className="flex-1 items-center">
              {/* The selected bar's label always shows; a thinned-in neighbour
                  that would crowd it steps aside. */}
              {(i === selected ||
                (isLabelShown(i, stride) &&
                  (selected == null || Math.abs(i - selected) >= stride))) && (
                <Text
                  numberOfLines={1}
                  className="text-[9px] text-gray-400 dark:text-gray-500 text-center"
                  style={{ width: THINNED_LABEL_W }}
                >
                  {d.label}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : (
        <View className="flex-row" style={{ paddingLeft: yLabelW }}>
          {data.map((d, i) => (
            <Text
              key={`${d.label}-${i}`}
              className="flex-1 text-[9px] text-gray-400 dark:text-gray-500 text-center px-0.5"
              numberOfLines={2}
            >
              {d.label}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
