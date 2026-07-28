import { useEffect, useMemo, useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { BottomSheet } from "./BottomSheet";

const PRIMARY = "#0644C7";

const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
/** Blank rows above/below so the first and last values can reach the centre. */
const EDGE_PAD = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

const pad2 = (n: number) => String(n).padStart(2, "0");

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);
const MERIDIEMS = ["AM", "PM"] as const;

type Meridiem = (typeof MERIDIEMS)[number];

/** "13:05" → { hour12: 1, minute: 5, meridiem: "PM" }. Falls back to 12:00 AM. */
function parse24(value: string | null | undefined) {
  const [hStr, mStr] = (value ?? "").substring(0, 5).split(":");
  const h24 = Number(hStr);
  const minute = Number(mStr);
  if (Number.isNaN(h24) || Number.isNaN(minute)) {
    return { hour12: 12, minute: 0, meridiem: "AM" as Meridiem };
  }
  return {
    hour12: h24 % 12 === 0 ? 12 : h24 % 12,
    minute,
    meridiem: (h24 >= 12 ? "PM" : "AM") as Meridiem,
  };
}

/** { 1, 5, "PM" } → "13:05" (the format the API and the rest of the app use). */
function to24(hour12: number, minute: number, meridiem: Meridiem): string {
  const h24 =
    meridiem === "AM" ? (hour12 === 12 ? 0 : hour12) : hour12 === 12 ? 12 : hour12 + 12;
  return `${pad2(h24)}:${pad2(minute)}`;
}

type WheelProps<T> = {
  items: readonly T[];
  index: number;
  onIndexChange: (index: number) => void;
  label: (item: T) => string;
  /** Re-centres the wheel without animating whenever this flips. */
  resetKey: number;
};

/**
 * One snapping column. The list is padded so the selected row always sits in
 * the centre band; the committed value is derived from the settled offset.
 */
function Wheel<T>({
  items,
  index,
  onIndexChange,
  label,
  resetKey,
}: WheelProps<T>) {
  const ref = useRef<ScrollView>(null);

  useEffect(() => {
    ref.current?.scrollTo({ y: index * ITEM_HEIGHT, animated: false });
    // Only re-centre on open / external value change, never on user scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.max(0, Math.min(items.length - 1, next));
    if (clamped !== index) onIndexChange(clamped);
  };

  return (
    <ScrollView
      ref={ref}
      style={{ height: WHEEL_HEIGHT, flex: 1 }}
      contentContainerStyle={{ paddingVertical: EDGE_PAD }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      onMomentumScrollEnd={settle}
      onScrollEndDrag={settle}
      nestedScrollEnabled
    >
      {items.map((item, i) => {
        const selected = i === index;
        return (
          <Pressable
            key={String(item)}
            onPress={() => {
              onIndexChange(i);
              ref.current?.scrollTo({ y: i * ITEM_HEIGHT, animated: true });
            }}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={{ height: ITEM_HEIGHT }}
            className="items-center justify-center"
          >
            <Text
              className={
                selected
                  ? "text-xl font-bold text-gray-900 dark:text-white"
                  : "text-lg text-gray-400 dark:text-gray-600"
              }
            >
              {label(item)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

type TimePickerSheetProps = {
  visible: boolean;
  /** Current time as "HH:mm" (24-hour). */
  value: string;
  onClose: () => void;
  /** Emits the chosen time as "HH:mm" (24-hour) when the user confirms. */
  onSelect: (time: string) => void;
  title?: string;
};

/**
 * Hour / minute / AM-PM wheel picker in a BottomSheet — the mobile stand-in for
 * the web's <input type="time">. Minute granularity is 1, so any time can be
 * chosen rather than only fixed increments. Nothing is committed until "Done",
 * which keeps a mid-scroll value from being applied by accident.
 */
export function TimePickerSheet({
  visible,
  value,
  onClose,
  onSelect,
  title = "Select Time",
}: TimePickerSheetProps) {
  const initial = useMemo(() => parse24(value), [value]);

  const [hourIndex, setHourIndex] = useState(initial.hour12 - 1);
  const [minuteIndex, setMinuteIndex] = useState(initial.minute);
  const [meridiemIndex, setMeridiemIndex] = useState(
    initial.meridiem === "AM" ? 0 : 1,
  );
  // Bumped on open so each wheel re-centres on the incoming value.
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const next = parse24(value);
    setHourIndex(next.hour12 - 1);
    setMinuteIndex(next.minute);
    setMeridiemIndex(next.meridiem === "AM" ? 0 : 1);
    setResetKey((k) => k + 1);
  }, [visible, value]);

  const preview = to24(
    HOURS[hourIndex],
    MINUTES[minuteIndex],
    MERIDIEMS[meridiemIndex],
  );

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <View className="px-5 pb-4">
        <View className="flex-row items-center justify-between pb-2.5 mb-2 border-b border-gray-100 dark:border-neutral-800">
          <Text className="text-[11px] font-medium text-gray-400 uppercase tracking-wider">
            Selected
          </Text>
          <Text className="text-sm font-semibold text-gray-900 dark:text-white">
            {`${HOURS[hourIndex]}:${pad2(MINUTES[minuteIndex])} ${MERIDIEMS[meridiemIndex]}`}
          </Text>
        </View>

        <View style={{ height: WHEEL_HEIGHT }} className="justify-center">
          {/* Centre band marking the committed row, behind the wheels. */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: EDGE_PAD,
              height: ITEM_HEIGHT,
            }}
            className="rounded-xl bg-blue-50 dark:bg-blue-900/20"
          />
          <View className="flex-row">
            <Wheel
              items={HOURS}
              index={hourIndex}
              onIndexChange={setHourIndex}
              label={(h) => String(h)}
              resetKey={resetKey}
            />
            <View
              style={{ height: WHEEL_HEIGHT }}
              className="items-center justify-center px-1"
            >
              <Text className="text-xl font-bold text-gray-400">:</Text>
            </View>
            <Wheel
              items={MINUTES}
              index={minuteIndex}
              onIndexChange={setMinuteIndex}
              label={pad2}
              resetKey={resetKey}
            />
            <Wheel
              items={MERIDIEMS}
              index={meridiemIndex}
              onIndexChange={setMeridiemIndex}
              label={(m) => m}
              resetKey={resetKey}
            />
          </View>
        </View>

        <Pressable
          onPress={() => onSelect(preview)}
          accessibilityRole="button"
          className="mt-4 h-12 rounded-xl items-center justify-center active:opacity-90"
          style={{ backgroundColor: PRIMARY }}
        >
          <Text className="text-base font-semibold text-white">Done</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}
