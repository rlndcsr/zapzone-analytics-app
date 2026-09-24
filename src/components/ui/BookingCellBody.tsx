import { AlertTriangle, MessageSquare, StickyNote } from "lucide-react-native";
import { Text, View } from "react-native";

import {
  BALANCE_TONE_CLASS,
  CELL_PADDING_Y,
  EXTRA_TONE_CLASS,
  extraLineRoom,
  NAME_LINE_HEIGHT,
  SLIVER_HEIGHT,
  SMALL_LINE_HEIGHT,
  type BalanceTone,
  type CellExtra,
} from "../../lib/bookings/bookingCell";
import type { BookingNoteFlags } from "../../lib/bookings/bookingNotes";

/**
 * What a schedule booking block prints: the time range with its flags beside it, the guest, the
 * package, the head count and what is owed — then as many extra lines as the block has room for.
 */
export function BookingCellBody({
  contentHeight,
  startLabel,
  timeRange,
  name,
  packageName,
  headCount,
  balance,
  arrival,
  clash,
  noteFlags,
  extras,
  textColor,
  nameColor = textColor,
}: {
  /** The block's height inside any border. */
  contentHeight: number;
  startLabel: string;
  timeRange: string;
  name: string;
  packageName: string;
  headCount: { text: string; overCapacity: boolean };
  balance: { text: string; tone: BalanceTone };
  arrival: "late" | "in" | null;
  clash: { doubleBooked: boolean } | null;
  noteFlags: BookingNoteFlags;
  extras: CellExtra[];
  textColor: string;
  nameColor?: string;
}) {
  const small = { color: textColor, lineHeight: SMALL_LINE_HEIGHT };

  if (contentHeight < SLIVER_HEIGHT) {
    // a sliver, which only degenerate data can produce: who and when
    return (
      <View className="flex-1 flex-row items-center gap-1 px-1">
        <Text className="text-[10px] font-bold" style={small}>
          {startLabel}
        </Text>
        <Text
          className="text-[10px] font-semibold flex-shrink"
          style={{ color: nameColor, lineHeight: SMALL_LINE_HEIGHT }}
          numberOfLines={1}
        >
          {name}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 px-1.5" style={{ paddingVertical: CELL_PADDING_Y }}>
      {/* the flags sit IN the time line rather than over it, so nothing paints on the time */}
      <View
        className="flex-row items-center gap-1"
        style={{ height: SMALL_LINE_HEIGHT }}
      >
        <Text
          className="text-[10px] font-bold flex-shrink"
          style={small}
          numberOfLines={1}
        >
          {timeRange}
        </Text>
        <View className="ml-auto flex-row items-center gap-0.5 flex-shrink-0">
          {arrival === "late" ? (
            <View className="rounded bg-red-600 px-1">
              <Text className="text-[8px] font-bold uppercase text-white">
                Late
              </Text>
            </View>
          ) : arrival === "in" ? (
            <View className="rounded bg-emerald-500 px-1">
              <Text className="text-[8px] font-bold uppercase text-white">
                In
              </Text>
            </View>
          ) : null}
          {clash && (
            <AlertTriangle
              size={10}
              color={clash.doubleBooked ? "#e11d48" : "#d97706"}
            />
          )}
          {noteFlags.staff && (
            <View className="rounded bg-amber-100 px-0.5 py-px">
              <StickyNote size={8} color="#b45309" strokeWidth={2.5} />
            </View>
          )}
          {noteFlags.guest && (
            <View className="rounded bg-blue-100 px-0.5 py-px">
              <MessageSquare size={8} color="#1d4ed8" strokeWidth={2.5} />
            </View>
          )}
        </View>
      </View>

      <Text
        className="text-xs font-bold"
        style={{ color: nameColor, lineHeight: NAME_LINE_HEIGHT }}
        numberOfLines={1}
      >
        {name}
      </Text>

      <Text
        className="text-[10px] opacity-80"
        style={small}
        numberOfLines={1}
      >
        {packageName}
      </Text>

      {/* how many, and what is still owed — the two numbers the desk acts on */}
      <View
        className="flex-row items-center justify-between gap-1"
        style={{ height: SMALL_LINE_HEIGHT }}
      >
        <Text
          className={`text-[10px] flex-shrink-0 ${
            headCount.overCapacity ? "font-bold text-rose-700" : "opacity-70"
          }`}
          style={
            headCount.overCapacity
              ? { lineHeight: SMALL_LINE_HEIGHT }
              : small
          }
        >
          {headCount.text}
        </Text>
        <Text
          className={`text-[10px] font-semibold flex-shrink ${BALANCE_TONE_CLASS[balance.tone]}`}
          style={{ lineHeight: SMALL_LINE_HEIGHT }}
          numberOfLines={1}
        >
          {balance.text}
        </Text>
      </View>

      {extras.slice(0, extraLineRoom(contentHeight)).map((extra) => (
        <Text
          key={extra.key}
          className={`text-[10px] ${EXTRA_TONE_CLASS[extra.tone]}`}
          style={{ lineHeight: SMALL_LINE_HEIGHT }}
          numberOfLines={1}
        >
          {extra.text}
        </Text>
      ))}
    </View>
  );
}
