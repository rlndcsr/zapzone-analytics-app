import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  MONTHS,
  WEEKDAYS_MIN as WEEKDAYS,
  buildMonthCells,
  formatShortDate,
  parseKey,
} from "../../lib/date/calendar";
import { BottomSheet } from "./BottomSheet";
import { PrimaryButton } from "./PrimaryButton";

// Re-exported for the many screens that import it from here.
export { formatShortDate } from "../../lib/date/calendar";

type DateRangeSheetProps = {
  visible: boolean;
  /** Pre-selected range (YYYY-MM-DD) when reopening an existing custom range. */
  initialStart?: string;
  initialEnd?: string;
  onClose: () => void;
  /** Called with both endpoints (YYYY-MM-DD) when the user taps Apply. */
  onApply: (start: string, end: string) => void;
};

/**
 * Native range calendar in a BottomSheet — the mobile equivalent of the web's
 * two `<input type="date">`s. Tap a day to set the start, tap another to set the
 * end; tapping before the start restarts the range, so an end can never precede
 * a start. Emits YYYY-MM-DD strings, matching the web + backend.
 */
export function DateRangeSheet({
  visible,
  initialStart,
  initialEnd,
  onClose,
  onApply,
}: DateRangeSheetProps) {
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  // First day of the month currently shown in the grid.
  const [viewMonth, setViewMonth] = useState<Date>(() => new Date());

  // Reset to the incoming range each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setStart(initialStart || null);
    setEnd(initialEnd || null);
    const base = parseKey(initialStart) ?? new Date();
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
  }, [visible, initialStart, initialEnd]);

  const cells = useMemo<(string | null)[]>(
    () => buildMonthCells(viewMonth),
    [viewMonth],
  );

  const onTapDay = (key: string) => {
    // No start yet, or a complete range exists → begin a fresh range.
    if (!start || (start && end)) {
      setStart(key);
      setEnd(null);
      return;
    }
    // Have a start, need an end. Lexicographic compare works for YYYY-MM-DD.
    if (key < start) {
      setStart(key); // tapped earlier than the start → restart from here
      setEnd(null);
    } else {
      setEnd(key);
    }
  };

  const goPrevMonth = () =>
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  const goNextMonth = () =>
    setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1));

  const canApply = !!start && !!end;

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Custom Range">
      <View className="px-5 pb-4">
        {/* Selected range summary */}
        <View className="flex-row items-center justify-center gap-2 mb-4">
          <View className="flex-1 items-center rounded-xl bg-gray-50 dark:bg-neutral-800 py-2.5">
            <Text className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              Start
            </Text>
            <Text className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
              {start ? formatShortDate(start) : "—"}
            </Text>
          </View>
          <Feather name="arrow-right" size={16} color="#9CA3AF" />
          <View className="flex-1 items-center rounded-xl bg-gray-50 dark:bg-neutral-800 py-2.5">
            <Text className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
              End
            </Text>
            <Text className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
              {end ? formatShortDate(end) : "—"}
            </Text>
          </View>
        </View>

        {/* Month navigation */}
        <View className="flex-row items-center justify-between mb-3">
          <Pressable
            onPress={goPrevMonth}
            hitSlop={8}
            className="w-9 h-9 rounded-full items-center justify-center bg-gray-100 dark:bg-neutral-800 active:opacity-70"
          >
            <Feather name="chevron-left" size={20} color="#0644C7" />
          </Pressable>
          <Text className="text-base font-bold text-gray-900 dark:text-white">
            {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
          </Text>
          <Pressable
            onPress={goNextMonth}
            hitSlop={8}
            className="w-9 h-9 rounded-full items-center justify-center bg-gray-100 dark:bg-neutral-800 active:opacity-70"
          >
            <Feather name="chevron-right" size={20} color="#0644C7" />
          </Pressable>
        </View>

        {/* Weekday header */}
        <View className="flex-row mb-1">
          {WEEKDAYS.map((w, i) => (
            <View key={i} style={{ width: `${100 / 7}%` }} className="items-center py-1">
              <Text className="text-[11px] font-medium text-gray-400">{w}</Text>
            </View>
          ))}
        </View>

        {/* Day grid */}
        <View className="flex-row flex-wrap">
          {cells.map((key, i) => {
            if (!key) {
              return <View key={`b${i}`} style={{ width: `${100 / 7}%` }} className="h-11" />;
            }
            const isStart = key === start;
            const isEnd = key === end;
            const isEndpoint = isStart || isEnd;
            const inRange = !!start && !!end && key > start && key < end;
            return (
              <View
                key={key}
                style={{ width: `${100 / 7}%` }}
                className={`h-11 items-center justify-center ${
                  inRange ? "bg-blue-50 dark:bg-blue-900/20" : ""
                } ${isStart && end ? "rounded-l-full bg-blue-50 dark:bg-blue-900/20" : ""} ${
                  isEnd && start !== end ? "rounded-r-full bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Pressable
                  onPress={() => onTapDay(key)}
                  className={`w-9 h-9 rounded-full items-center justify-center ${
                    isEndpoint ? "bg-[#0644C7]" : "active:bg-gray-100 dark:active:bg-neutral-800"
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      isEndpoint
                        ? "text-white font-bold"
                        : "text-gray-800 dark:text-gray-100"
                    }`}
                  >
                    {Number(key.substring(8, 10))}
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        <View className="mt-5">
          <PrimaryButton
            label="Apply Range"
            onPress={() => start && end && onApply(start, end)}
            disabled={!canApply}
          />
        </View>
      </View>
    </BottomSheet>
  );
}
