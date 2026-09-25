import { AlertTriangle, MessageSquare, StickyNote, Users, X } from "lucide-react-native";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

/** Status badge colours, the same set as the web's BookingHoverCard. */
const STATUS_TONE: Record<string, string> = {
  confirmed: "bg-green-500",
  pending: "bg-yellow-500",
  "checked-in": "bg-emerald-600",
  cancelled: "bg-gray-400",
};

export type BookingSummary = {
  status: string;
  reference: string | null;
  timeLabel: string;
  guestName: string;
  packageName: string;
  participants: number;
  amount: number;
  paymentLabel: string;
  /** NativeWind classes for the payment pill (from resolvePaymentState). */
  paymentClass: string;
  overlap: { label: string; doubleBooked: boolean } | null;
  guestNote: string;
  staffNote: string;
};

/**
 * The web's schedule hover card, for a touch screen: a phone has no hover, so
 * the block's info icon opens the same summary here — who, when, what, how
 * many, and what is owed — without leaving the grid. "View full details" goes
 * on to the whole booking.
 */
export function BookingSummaryPopup({
  summary,
  onClose,
  onOpenDetails,
}: {
  summary: BookingSummary | null;
  onClose: () => void;
  onOpenDetails: () => void;
}) {
  return (
    <Modal
      visible={summary !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        className="flex-1 items-center justify-center bg-black/40 px-6"
        accessibilityLabel="Close the booking summary"
      >
        {summary && (
          // a press inside the card must not fall through to the backdrop
          <Pressable
            onPress={() => {}}
            className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <ScrollView bounces={false} style={{ maxHeight: 460 }}>
              <View className="mb-2 flex-row items-center gap-1.5">
                <View
                  className={`rounded-full px-2 py-0.5 ${
                    STATUS_TONE[summary.status] ?? "bg-blue-500"
                  }`}
                >
                  <Text className="text-[10px] font-bold uppercase text-white">
                    {summary.status}
                  </Text>
                </View>
                {!!summary.reference && (
                  <Text
                    className="ml-auto text-xs font-medium text-gray-400"
                    numberOfLines={1}
                  >
                    #{summary.reference.slice(-6)}
                  </Text>
                )}
                <Pressable
                  onPress={onClose}
                  hitSlop={10}
                  className={`${summary.reference ? "ml-2" : "ml-auto"} rounded-full p-1 active:opacity-60`}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <X size={16} color="#9CA3AF" />
                </Pressable>
              </View>

              <Text className="text-sm font-bold text-gray-700 dark:text-gray-200">
                {summary.timeLabel}
              </Text>
              <Text className="text-lg font-semibold text-gray-900 dark:text-white">
                {summary.guestName}
              </Text>
              <Text className="text-sm text-gray-600 dark:text-gray-300">
                {summary.packageName}
              </Text>

              <View className="mt-1.5 flex-row items-center gap-1.5">
                <Users size={14} color="#6B7280" />
                <Text className="text-sm text-gray-600 dark:text-gray-300">
                  {summary.participants}{" "}
                  {summary.participants === 1 ? "guest" : "guests"}
                </Text>
              </View>

              {!!summary.overlap && (
                <View
                  className={`mt-2 flex-row items-start gap-1.5 rounded-lg border px-2 py-1.5 ${
                    summary.overlap.doubleBooked
                      ? "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-900/20"
                      : "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20"
                  }`}
                >
                  <AlertTriangle
                    size={13}
                    color={summary.overlap.doubleBooked ? "#9F1239" : "#92400E"}
                  />
                  <Text
                    className={`flex-1 text-xs ${
                      summary.overlap.doubleBooked
                        ? "text-rose-800 dark:text-rose-300"
                        : "text-amber-800 dark:text-amber-300"
                    }`}
                  >
                    <Text className="font-bold uppercase">
                      {summary.overlap.doubleBooked ? "Overlaps" : "No gap"}
                    </Text>{" "}
                    {summary.overlap.label}
                  </Text>
                </View>
              )}

              {!!summary.guestNote && (
                <View className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5 dark:border-blue-900/40 dark:bg-blue-900/20">
                  <View className="flex-row items-center gap-1">
                    <MessageSquare size={12} color="#1E3A8A" />
                    <Text className="text-[11px] font-bold uppercase text-blue-900 dark:text-blue-200">
                      From the guest
                    </Text>
                  </View>
                  <Text
                    className="mt-0.5 text-xs text-blue-900 dark:text-blue-200"
                    numberOfLines={3}
                  >
                    {summary.guestNote}
                  </Text>
                </View>
              )}

              {!!summary.staffNote && (
                <View className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 dark:border-amber-900/40 dark:bg-amber-900/20">
                  <View className="flex-row items-center gap-1">
                    <StickyNote size={12} color="#78350F" />
                    <Text className="text-[11px] font-bold uppercase text-amber-900 dark:text-amber-200">
                      Staff note
                    </Text>
                  </View>
                  <Text
                    className="mt-0.5 text-xs text-amber-900 dark:text-amber-200"
                    numberOfLines={3}
                  >
                    {summary.staffNote}
                  </Text>
                </View>
              )}

              <View className="mt-3 flex-row items-center justify-between gap-2 border-t border-gray-100 pt-2 dark:border-neutral-800">
                <Text className="text-base font-bold text-gray-900 dark:text-white">
                  ${summary.amount.toFixed(2)}
                </Text>
                <View className={`rounded px-2 py-0.5 ${summary.paymentClass}`}>
                  <Text className={`text-xs font-medium ${summary.paymentClass}`}>
                    {summary.paymentLabel}
                  </Text>
                </View>
              </View>
            </ScrollView>

            <Pressable
              onPress={onOpenDetails}
              className="mt-3 h-11 items-center justify-center rounded-xl bg-[#0644C7] active:opacity-90"
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold text-white">
                View full details
              </Text>
            </Pressable>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}

export default BookingSummaryPopup;
