import { Feather } from "@expo/vector-icons";
import { Linking, Pressable, Text, View } from "react-native";

import { CARD_SHADOW } from "./attractionFormKit";

const TEAL = "#0F766E";

/**
 * Shown in place of the slot picker and pay button when an item has no usable
 * schedule at the selected venue — the mobile twin of the web's
 * `CallToBookPanel`.
 *
 * Two ways forward, matching the web: dial the venue, or leave details for a
 * call back. The call button only exists when that venue actually has a number
 * on file; there is deliberately no fallback number anywhere in this component,
 * because the right one is always the selected location's own.
 */
export function CallToBookCard({
  venueName,
  venuePhone,
  itemLabel = "item",
  onRequestCall,
}: {
  venueName?: string | null;
  /** The selected location's phone. Null/empty hides the call button. */
  venuePhone?: string | null;
  /** "attraction" | "package" | "event" — used in the explanatory line. */
  itemLabel?: string;
  onRequestCall: () => void;
}) {
  const phone = venuePhone?.trim() || null;
  const venue = venueName?.trim() || "the venue";

  return (
    <View
      className="rounded-2xl border border-teal-200 dark:border-teal-900/40 bg-teal-50 dark:bg-teal-900/20 p-4"
      style={CARD_SHADOW}
    >
      <View className="flex-row items-start gap-3">
        <View className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-900/40 items-center justify-center">
          <Feather name="phone-call" size={17} color={TEAL} />
        </View>

        <View className="flex-1">
          <Text className="text-sm font-bold text-teal-900 dark:text-teal-200">
            This one is booked by phone
          </Text>
          <Text className="text-xs leading-5 text-teal-900/80 dark:text-teal-200/80 mt-1">
            There is no online schedule for this {itemLabel} — {venue} arranges
            these bookings personally.{" "}
            {phone
              ? "Call now, or leave a number for the team to call back."
              : "Leave your details below and the venue will contact you."}
          </Text>

          <View className="mt-3 gap-2">
            {phone ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Call ${venue} on ${phone}`}
                onPress={() => void Linking.openURL(`tel:${phone}`)}
                className="flex-row items-center justify-center gap-2 rounded-xl bg-teal-700 active:bg-teal-800 px-4 py-3"
              >
                <Feather name="phone-call" size={15} color="#FFFFFF" />
                <Text className="text-sm font-semibold text-white">
                  Call {phone}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Request a call back"
              onPress={onRequestCall}
              className="flex-row items-center justify-center gap-2 rounded-xl border border-teal-300 dark:border-teal-800 bg-white dark:bg-neutral-900 px-4 py-3"
            >
              <Feather name="phone" size={15} color={TEAL} />
              <Text className="text-sm font-semibold text-teal-800 dark:text-teal-300">
                Request a call back
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
