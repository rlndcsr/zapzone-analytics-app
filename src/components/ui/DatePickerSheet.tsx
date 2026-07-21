import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  MONTHS,
  WEEKDAYS_MIN as WEEKDAYS,
  WEEKDAY_NAMES_LOWER,
  addMonths,
  buildMonthCells,
  parseKey,
  toKey,
} from "../../lib/date/calendar";
import { BottomSheet } from "./BottomSheet";

const PRIMARY = "#0644C7";

type DatePickerSheetProps = {
  visible: boolean;
  /** Currently selected date (YYYY-MM-DD), or empty/null when none. */
  value?: string | null;
  /**
   * Earliest selectable date (YYYY-MM-DD). Days before it are disabled and the
   * grid can't navigate to earlier months. Defaults to today.
   */
  minDate?: string;
  /**
   * Availability parity (optional). When any of these is provided the calendar
   * switches to "availability mode": full day-offs are red + unselectable,
   * limited-hours days are amber + selectable, and days whose weekday isn't in
   * `availableWeekdays` are greyed out — mirroring the web ScheduleCalendar.
   * The date state is computed upstream (dayOffAvailability); the calendar only
   * renders it, so it never infers business rules on its own.
   */
  dayOffDates?: Set<string>;
  limitedDates?: Set<string>;
  /** Lowercase weekday names the venue is open (empty/undefined ⇒ no limit). */
  availableWeekdays?: Set<string>;
  onClose: () => void;
  /** Emits the chosen day as YYYY-MM-DD, then the parent typically closes. */
  onSelect: (date: string) => void;
  title?: string;
};

const LegendItem = ({ color, label }: { color: string; label: string }) => (
  <View className="flex-row items-center gap-1.5">
    <View
      style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }}
    />
    <Text className="text-[11px] text-gray-500 dark:text-gray-400">{label}</Text>
  </View>
);

/**
 * Single-date calendar in a BottomSheet — the mobile equivalent of the web
 * admin's ScheduleCalendar for choosing a visit date. Reuses the shared month
 * grid + date helpers (same visual language as DateRangeSheet): browse months,
 * tap a day to select, past days disabled and visually distinct, today marked,
 * and the selected day filled. Emits YYYY-MM-DD, matching the web + backend.
 */
export function DatePickerSheet({
  visible,
  value,
  minDate,
  dayOffDates,
  limitedDates,
  availableWeekdays,
  onClose,
  onSelect,
  title = "Select Date",
}: DatePickerSheetProps) {
  const todayKey = useMemo(() => toKey(new Date()), []);
  const minKey = minDate ?? todayKey;
  // Availability mode = at least one availability set was supplied. Off for the
  // plain onsite-create calendar, which keeps its simple past-only disabling.
  const availabilityMode = !!(
    dayOffDates ||
    limitedDates ||
    availableWeekdays
  );

  // First day of the month currently shown in the grid.
  const [viewMonth, setViewMonth] = useState<Date>(() => new Date());

  // Open on the selected date's month (or the min month) each time it opens.
  useEffect(() => {
    if (!visible) return;
    const base = parseKey(value) ?? parseKey(minKey) ?? new Date();
    setViewMonth(new Date(base.getFullYear(), base.getMonth(), 1));
  }, [visible, value, minKey]);

  const cells = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);

  // Can't page earlier than the month that contains minKey.
  const minMonthStart = useMemo(() => {
    const d = parseKey(minKey) ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [minKey]);
  const canGoPrev =
    viewMonth.getFullYear() > minMonthStart.getFullYear() ||
    (viewMonth.getFullYear() === minMonthStart.getFullYear() &&
      viewMonth.getMonth() > minMonthStart.getMonth());

  const goPrevMonth = () => canGoPrev && setViewMonth((m) => addMonths(m, -1));
  const goNextMonth = () => setViewMonth((m) => addMonths(m, 1));

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View className="px-5 pb-4">
        {/* Selected date — a compact single-line header, not a card. */}
        <View className="flex-row items-center justify-between pb-2.5 mb-3 border-b border-gray-100 dark:border-neutral-800">
          <Text className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
            Selected
          </Text>
          <Text className="text-sm font-semibold text-gray-900 dark:text-white">
            {value === todayKey
              ? "Today"
              : value
                ? `${MONTHS[parseKey(value)!.getMonth()]} ${parseKey(value)!.getDate()}, ${parseKey(value)!.getFullYear()}`
                : "—"}
          </Text>
        </View>

        {/* Month navigation */}
        <View className="flex-row items-center justify-between mb-3">
          <Pressable
            onPress={goPrevMonth}
            disabled={!canGoPrev}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            className={`w-9 h-9 rounded-full items-center justify-center ${
              canGoPrev
                ? "bg-gray-100 dark:bg-neutral-800 active:opacity-70"
                : "bg-gray-50 dark:bg-neutral-900"
            }`}
          >
            <Feather
              name="chevron-left"
              size={20}
              color={canGoPrev ? PRIMARY : "#D1D5DB"}
            />
          </Pressable>
          <Text className="text-base font-bold text-gray-900 dark:text-white">
            {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
          </Text>
          <Pressable
            onPress={goNextMonth}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            className="w-9 h-9 rounded-full items-center justify-center bg-gray-100 dark:bg-neutral-800 active:opacity-70"
          >
            <Feather name="chevron-right" size={20} color={PRIMARY} />
          </Pressable>
        </View>

        {/* Weekday header */}
        <View className="flex-row mb-1">
          {WEEKDAYS.map((w, i) => (
            <View
              key={i}
              style={{ width: `${100 / 7}%` }}
              className="items-center py-1"
            >
              <Text className="text-[11px] font-medium text-gray-400">{w}</Text>
            </View>
          ))}
        </View>

        {/* Day grid */}
        <View className="flex-row flex-wrap">
          {cells.map((key, i) => {
            if (!key) {
              return (
                <View
                  key={`b${i}`}
                  style={{ width: `${100 / 7}%` }}
                  className="h-12"
                />
              );
            }
            const isSelected = key === value;
            const isToday = key === todayKey;
            const isPast = key < minKey;
            const weekday = WEEKDAY_NAMES_LOWER[parseKey(key)!.getDay()];
            const weekdayClosed =
              !!availableWeekdays &&
              availableWeekdays.size > 0 &&
              !availableWeekdays.has(weekday);
            const isFullDayOff = !!dayOffDates?.has(key);
            const isLimited = !isFullDayOff && !!limitedDates?.has(key);
            // Full day-off, past, and closed weekdays can't be tapped.
            const disabled = isPast || weekdayClosed || isFullDayOff;
            // Dot indicator colour (availability mode, selectable, non-selected).
            const dotColor = isLimited
              ? "#F59E0B"
              : isToday
                ? PRIMARY
                : "#60A5FA";
            const showDot =
              availabilityMode && !isSelected && !disabled;
            return (
              <View
                key={key}
                style={{ width: `${100 / 7}%` }}
                className="h-12 items-center justify-center"
              >
                <Pressable
                  onPress={() => !disabled && onSelect(key)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled }}
                  accessibilityLabel={key}
                  className={`w-10 h-10 rounded-full items-center justify-center ${
                    isSelected
                      ? "bg-[#0644C7]"
                      : isFullDayOff
                        ? "bg-red-50 dark:bg-red-900/20"
                        : isLimited
                          ? "bg-amber-50 dark:bg-amber-900/20"
                          : isToday
                            ? "bg-blue-50 dark:bg-blue-900/20"
                            : availabilityMode && !disabled
                              ? "bg-blue-50/60 dark:bg-blue-900/10"
                              : "active:bg-gray-100 dark:active:bg-neutral-800"
                  }`}
                  style={
                    isSelected
                      ? { backgroundColor: PRIMARY }
                      : isLimited
                        ? { borderWidth: 1, borderColor: "#FDE68A" }
                        : isToday
                          ? { borderWidth: 1, borderColor: "#93C5FD" }
                          : undefined
                  }
                >
                  <Text
                    className={`text-sm ${
                      isSelected
                        ? "text-white font-bold"
                        : isFullDayOff
                          ? "text-red-300 line-through"
                          : disabled
                            ? "text-gray-300 dark:text-neutral-700"
                            : isLimited
                              ? "text-amber-800 dark:text-amber-300 font-medium"
                              : isToday
                                ? "text-[#0644C7] dark:text-blue-300 font-bold"
                                : "text-gray-800 dark:text-gray-100"
                    }`}
                  >
                    {Number(key.substring(8, 10))}
                  </Text>
                  {showDot && (
                    <View
                      style={{
                        position: "absolute",
                        bottom: 3,
                        width: 4,
                        height: 4,
                        borderRadius: 2,
                        backgroundColor: dotColor,
                      }}
                    />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* Legend */}
        {availabilityMode ? (
          // Full 5-state legend, mirroring the web ScheduleCalendar.
          <View className="flex-row flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 mt-4 pt-3 border-t border-gray-100 dark:border-neutral-800">
            <LegendItem color="#BFDBFE" label="Available" />
            <LegendItem color={PRIMARY} label="Selected" />
            <LegendItem color="#FCA5A5" label="Day Off" />
            <LegendItem color="#FCD34D" label="Limited hours" />
            <LegendItem color="#E5E7EB" label="Unavailable" />
          </View>
        ) : (
          <View className="flex-row items-center justify-center gap-4 mt-4">
            <LegendItem color={PRIMARY} label="Selected" />
            <View className="flex-row items-center gap-1.5">
              <View className="w-3 h-3 rounded-full border border-blue-300" />
              <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                Today
              </Text>
            </View>
            <LegendItem color="#E5E7EB" label="Unavailable" />
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
