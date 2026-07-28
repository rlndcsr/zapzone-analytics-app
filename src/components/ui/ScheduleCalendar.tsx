import { Feather } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import {
  MONTHS,
  WEEKDAY_NAMES_LOWER,
  addMonths,
  buildMonthCells,
  formatFullDate,
  parseKey,
  toKey,
} from "../../lib/date/calendar";
import type { AvailabilitySchedule } from "../../services/attractionsService";

const PRIMARY = "#0644C7";

/** Uppercase weekday headers, Sunday-first — matches the web ScheduleCalendar. */
const WEEKDAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const formatTime12Hour = (time24: string): string => {
  const [h, m] = time24.split(":");
  const hours = Number(h);
  const period = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${m} ${period}`;
};

const titleCaseDay = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);

const LegendItem = ({
  color,
  borderColor,
  label,
}: {
  color: string;
  borderColor?: string;
  label: string;
}) => (
  // Margins rather than `gap` — gap is unreliable on wrapping rows in RN, and
  // without it the swatches collide with the previous item's label.
  <View className="flex-row items-center mr-3 mb-1">
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 2,
        marginRight: 4,
        backgroundColor: color,
        borderWidth: borderColor ? 1 : 0,
        borderColor,
      }}
    />
    <Text className="text-[9px] text-gray-500 dark:text-gray-400">{label}</Text>
  </View>
);

type ScheduleCalendarProps = {
  /** Open weekdays + hours for the thing being scheduled. */
  availability: AvailabilitySchedule[];
  /** YYYY-MM-DD dates that are fully blocked (not selectable). */
  dayOffDates: Set<string>;
  /** YYYY-MM-DD dates with limited hours (selectable, amber). */
  limitedDates?: Set<string>;
  scheduledDate: string;
  scheduledTime: string;
  /** Open slots for `scheduledDate`, already trimmed by partial closures. */
  availableTimeSlots: string[];
  onDateSelect: (dateKey: string) => void;
  onTimeSelect: (time: string) => void;
  /** Earliest selectable day (YYYY-MM-DD). Defaults to today. */
  minDate?: string;
};

/**
 * Inline visit-date + time picker — the mobile port of the web admin's
 * `ScheduleCalendar`. Same five day states (available / selected / day off /
 * limited hours / unavailable), same legend, and the time slots stacked below
 * the grid instead of beside it. It renders state only: day-off and
 * availability rules are computed upstream by `lib/attractions/dayOffAvailability`.
 */
export function ScheduleCalendar({
  availability,
  dayOffDates,
  limitedDates,
  scheduledDate,
  scheduledTime,
  availableTimeSlots,
  onDateSelect,
  onTimeSelect,
  minDate,
}: ScheduleCalendarProps) {
  const todayKey = useMemo(() => toKey(new Date()), []);
  const minKey = minDate ?? todayKey;

  const availableWeekdays = useMemo(() => {
    const days = new Set<string>();
    availability.forEach((slot) =>
      slot.days.forEach((d) => days.add(d.toLowerCase())),
    );
    return days;
  }, [availability]);

  // Listed in the order the availability schedule declares them, like the web.
  const availableDaysLabel = useMemo(
    () => [...availableWeekdays].map(titleCaseDay).join(", "),
    [availableWeekdays],
  );

  // Open on the month of the selected date, or the first selectable month.
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = parseKey(scheduledDate) ?? parseKey(minKey) ?? new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  // Jump to the picked date's month when it is set from outside the grid.
  useEffect(() => {
    const d = parseKey(scheduledDate);
    if (!d) return;
    setViewMonth((m) =>
      m.getFullYear() === d.getFullYear() && m.getMonth() === d.getMonth()
        ? m
        : new Date(d.getFullYear(), d.getMonth(), 1),
    );
  }, [scheduledDate]);

  /**
   * The month grid as rows of exactly seven cells. Rendering week-by-week with
   * `flex-1` children is what keeps the columns aligned: a wrapping row of
   * `width: 100/7 %` cells rounds past 100% and spills the seventh day onto the
   * next line, which silently shifts every date by a column.
   */
  const weeks = useMemo(() => {
    const cells = buildMonthCells(viewMonth);
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewMonth]);

  const minMonthStart = useMemo(() => {
    const d = parseKey(minKey) ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, [minKey]);
  const canGoPrev =
    viewMonth.getFullYear() > minMonthStart.getFullYear() ||
    (viewMonth.getFullYear() === minMonthStart.getFullYear() &&
      viewMonth.getMonth() > minMonthStart.getMonth());

  return (
    <View className="rounded-xl border border-gray-200 dark:border-neutral-700 overflow-hidden">
      {/* Header */}
      <View className="px-4 py-2.5 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/40">
        <View className="flex-row items-center gap-2">
          <Feather name="clock" size={14} color={PRIMARY} />
          <Text className="text-sm font-bold text-gray-900 dark:text-white">
            Schedule Your Visit
          </Text>
        </View>
        {!!availableDaysLabel && (
          <Text className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            Available:{" "}
            <Text className="font-medium text-gray-700 dark:text-gray-200">
              {availableDaysLabel}
            </Text>
          </Text>
        )}
      </View>

      {/* Calendar */}
      <View className="p-3">
        <View className="flex-row items-center justify-between mb-2.5">
          <Pressable
            onPress={() => canGoPrev && setViewMonth((m) => addMonths(m, -1))}
            disabled={!canGoPrev}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            className="w-8 h-8 rounded-lg items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800"
          >
            <Feather
              name="chevron-left"
              size={18}
              color={canGoPrev ? "#4B5563" : "#D1D5DB"}
            />
          </Pressable>
          <Text className="text-sm font-bold text-gray-900 dark:text-white">
            {`${MONTHS[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`}
          </Text>
          <Pressable
            onPress={() => setViewMonth((m) => addMonths(m, 1))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            className="w-8 h-8 rounded-lg items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800"
          >
            <Feather name="chevron-right" size={18} color="#4B5563" />
          </Pressable>
        </View>

        {/* Weekday header — open weekdays are tinted, like the web. */}
        <View className="flex-row mb-1">
          {WEEKDAY_HEADERS.map((name, idx) => {
            const open = availableWeekdays.has(WEEKDAY_NAMES_LOWER[idx]);
            return (
              <View key={name} className="flex-1 px-0.5">
                <View
                  className={`items-center py-1 rounded ${
                    open ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold uppercase ${
                      open
                        ? "text-[#0644C7] dark:text-blue-300"
                        : "text-gray-400 dark:text-gray-600"
                    }`}
                  >
                    {name}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Day grid — one row per week so the seven columns always line up. */}
        {weeks.map((week, wi) => (
          <View key={`w${wi}`} className="flex-row">
            {week.map((key, di) => {
              if (!key) {
                return <View key={`b${wi}-${di}`} className="flex-1 h-11" />;
              }
              const isSelected = key === scheduledDate;
              const isToday = key === todayKey;
              const isPast = key < minKey;
              const weekday = WEEKDAY_NAMES_LOWER[parseKey(key)!.getDay()];
              const weekdayClosed =
                availableWeekdays.size > 0 && !availableWeekdays.has(weekday);
              const isDayOff = dayOffDates.has(key);
              const isLimited = !isDayOff && !!limitedDates?.has(key);
              const disabled = isPast || weekdayClosed || isDayOff;

              return (
                <View key={key} className="flex-1 h-11 p-0.5">
                  <Pressable
                    onPress={() => !disabled && onDateSelect(key)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected, disabled }}
                    accessibilityLabel={key}
                    className={`flex-1 rounded-lg items-center justify-center ${
                      isSelected
                        ? "bg-[#0644C7]"
                        : isDayOff
                          ? "bg-red-50 dark:bg-red-900/20"
                          : isLimited
                            ? "bg-amber-50 dark:bg-amber-900/20"
                            : isToday && !disabled
                              ? "bg-blue-100 dark:bg-blue-900/30"
                              : disabled
                                ? ""
                                : "bg-blue-50/60 dark:bg-blue-900/10"
                    }`}
                    style={
                      isLimited
                        ? { borderWidth: 1, borderColor: "#FDE68A" }
                        : isToday && !disabled && !isSelected
                          ? { borderWidth: 1, borderColor: "#93C5FD" }
                          : undefined
                    }
                  >
                    <Text
                      className={`text-[11px] ${
                        isSelected
                          ? "text-white font-bold"
                          : isDayOff
                            ? "text-red-300 line-through"
                            : disabled
                              ? "text-gray-300 dark:text-neutral-700"
                              : isLimited
                                ? "text-amber-800 dark:text-amber-300 font-medium"
                                : isToday
                                  ? "text-[#0644C7] dark:text-blue-300 font-bold"
                                  : "text-gray-800 dark:text-gray-100 font-medium"
                      }`}
                    >
                      {Number(key.substring(8, 10))}
                    </Text>
                    {!isSelected && !disabled && (
                      <View
                        style={{
                          position: "absolute",
                          bottom: 2,
                          width: 4,
                          height: 4,
                          borderRadius: 2,
                          backgroundColor: isLimited
                            ? "#F59E0B"
                            : isToday
                              ? PRIMARY
                              : "#60A5FA",
                        }}
                      />
                    )}
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}

        {/* Legend */}
        <View className="flex-row flex-wrap items-center mt-2.5 pt-2 border-t border-gray-100 dark:border-neutral-800">
          <LegendItem color="#EFF6FF" borderColor="#BFDBFE" label="Available" />
          <LegendItem color={PRIMARY} label="Selected" />
          <LegendItem color="#FEE2E2" borderColor="#FECACA" label="Day Off" />
          <LegendItem color="#FFFBEB" borderColor="#FCD34D" label="Limited hours" />
          <LegendItem color="#F3F4F6" label="Unavailable" />
        </View>
      </View>

      {/* Time slots */}
      <View className="p-3 border-t border-gray-100 dark:border-neutral-800">
        <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">
          {scheduledDate ? "Select a Time" : "Pick a date first"}
        </Text>

        {!scheduledDate ? (
          <View className="items-center py-6">
            <Feather name="clock" size={28} color="#D1D5DB" />
            <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2">
              Select a date to see available times
            </Text>
          </View>
        ) : availableTimeSlots.length > 0 ? (
          <View className="flex-row flex-wrap -m-0.5">
            {availableTimeSlots.map((time) => {
              const active = scheduledTime === time;
              return (
                <View key={time} style={{ width: "33.3333%" }} className="p-0.5">
                  <Pressable
                    onPress={() => onTimeSelect(time)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className={`py-2.5 rounded-lg border items-center ${
                      active
                        ? "bg-[#0644C7] border-[#0644C7]"
                        : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700"
                    }`}
                  >
                    <Text
                      className={`text-xs font-medium ${
                        active
                          ? "text-white"
                          : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      {formatTime12Hour(time)}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <View className="rounded-lg border border-orange-100 dark:border-orange-900/40 bg-orange-50 dark:bg-orange-900/20 p-2.5">
            <Text className="text-xs text-orange-700 dark:text-orange-300">
              No time slots available for this date.
            </Text>
          </View>
        )}
      </View>

      {/* Confirmation */}
      {!!scheduledDate && !!scheduledTime && (
        <View className="px-3 pb-3">
          <View className="flex-row items-center gap-2 rounded-lg border border-green-200 dark:border-green-900/40 bg-green-50 dark:bg-green-900/20 p-2.5">
            <Feather name="check-circle" size={16} color="#16A34A" />
            <Text className="flex-1 text-xs text-green-800 dark:text-green-300">
              <Text className="font-bold">{formatFullDate(scheduledDate)}</Text>
              {" at "}
              <Text className="font-bold">{formatTime12Hour(scheduledTime)}</Text>
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
