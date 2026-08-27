import { Feather } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  submitCallToBook,
  type CallToBookEntityType,
} from "../../services/checkoutConcernsService";
import { BottomSheet } from "./BottomSheet";

const TEAL = "#0F766E";

/** Staff screens default an unnamed buyer to this before posting a purchase.
 *  It is a fine label on a receipt and useless on a callback request, so it is
 *  never accepted as the person to ring back. */
const PLACEHOLDER_NAME = "walk-in customer";

const digits = (value: string) => value.replace(/\D/g, "");

export type CallToBookSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** The venue being booked — required, and always the checkout location. */
  locationId: number | null;
  venueName?: string | null;
  venuePhone?: string | null;
  entityType?: CallToBookEntityType;
  entityId?: number | null;
  entityName?: string | null;
  /** Seeded from whatever the booking screen already collected. */
  initialName?: string;
  initialPhone?: string;
  initialEmail?: string;
};

/**
 * "Request a call back" — the mobile twin of the web's `CallToBookModal`.
 *
 * Posts one `call_to_book` concern and nothing else: staff email, SMS and the
 * in-app notification are all raised by the backend after it responds.
 */
export function CallToBookSheet({
  visible,
  onClose,
  locationId,
  venueName,
  venuePhone,
  entityType,
  entityId,
  entityName,
  initialName = "",
  initialPhone = "",
  initialEmail = "",
}: CallToBookSheetProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sentMessage, setSentMessage] = useState("");

  const phoneNumber = venuePhone?.trim() || null;
  const venue = venueName?.trim() || "This venue";

  // Seed from the booking screen each time the sheet opens, without clobbering
  // anything already typed here. "Walk-in Customer" is dropped rather than
  // carried in — staff have to give a real person to call back.
  useEffect(() => {
    if (!visible) return;
    const seedName = initialName.trim();
    setName((prev) =>
      prev || (seedName.toLowerCase() === PLACEHOLDER_NAME ? "" : seedName),
    );
    setPhone((prev) => prev || initialPhone.trim());
    setEmail((prev) => prev || initialEmail.trim());
  }, [visible, initialName, initialPhone, initialEmail]);

  const close = () => {
    setError("");
    // Clear the request only once it has actually been sent, so a mistyped
    // submit keeps what was typed when the sheet is reopened.
    if (sentMessage) {
      setMessage("");
      setSentMessage("");
    }
    onClose();
  };

  const submit = async () => {
    setError("");

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError("Please enter the customer's name.");
      return;
    }
    if (trimmedName.toLowerCase() === PLACEHOLDER_NAME) {
      setError("Please enter the customer's real name, not the walk-in placeholder.");
      return;
    }
    if (digits(phone).length < 7) {
      setError("Please enter a number the venue can call back, including area code.");
      return;
    }
    if (locationId == null) {
      setError("Pick a location first so the request reaches the right venue.");
      return;
    }

    setSubmitting(true);
    try {
      const { message: confirmation } = await submitCallToBook({
        locationId,
        name: trimmedName,
        phone: phone.trim(),
        email: email.trim() || undefined,
        message: message.trim() || undefined,
        entityType,
        entityId: entityId ?? undefined,
        entityName: entityName ?? undefined,
        context: { source: "mobile_staff_app" },
      });
      setSentMessage(confirmation);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "We could not send that. Please call the venue directly.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      title={sentMessage ? "We've got their details" : "This one is booked by phone"}
      subtitle={entityName ?? undefined}
      icon={
        <View className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-900/30 items-center justify-center">
          <Feather
            name={sentMessage ? "check-circle" : "phone-call"}
            size={17}
            color={TEAL}
          />
        </View>
      }
    >
      <ScrollView
        className="px-4 pb-6"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {sentMessage ? (
          <View>
            <View className="items-center py-4">
              <View className="w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-900/30 items-center justify-center mb-3">
                <Feather name="check-circle" size={28} color="#16A34A" />
              </View>
              <Text className="text-sm text-gray-700 dark:text-gray-200 text-center leading-5">
                {sentMessage}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
                {venue} will call{" "}
                <Text className="font-semibold text-gray-700 dark:text-gray-200">
                  {phone.trim()}
                </Text>
                .
              </Text>
              <View className="mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800 px-3.5 py-2.5">
                <Text className="text-xs text-gray-600 dark:text-gray-300 text-center leading-5">
                  Nothing has been booked and nothing has been charged.
                </Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              onPress={close}
              className="rounded-xl bg-[#0644C7] active:opacity-90 px-4 py-3 items-center"
            >
              <Text className="text-sm font-semibold text-white">Done</Text>
            </Pressable>
          </View>
        ) : (
          <View>
            <View className="rounded-2xl border border-teal-100 dark:border-teal-900/40 bg-teal-50 dark:bg-teal-900/20 px-4 py-3.5 items-center">
              <Text className="text-sm font-semibold text-teal-900 dark:text-teal-200">
                {venue}
              </Text>
              {phoneNumber ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Call ${venue} on ${phoneNumber}`}
                    onPress={() => void Linking.openURL(`tel:${phoneNumber}`)}
                    className="mt-2.5 w-full flex-row items-center justify-center gap-2 rounded-xl bg-teal-700 active:bg-teal-800 px-4 py-3"
                  >
                    <Feather name="phone-call" size={15} color="#FFFFFF" />
                    <Text className="text-sm font-semibold text-white">
                      Call {phoneNumber}
                    </Text>
                  </Pressable>
                  <Text className="mt-2 text-[11px] text-teal-800/80 dark:text-teal-200/70 text-center">
                    Fastest option — the team can check dates and book on the spot.
                  </Text>
                </>
              ) : (
                <Text className="mt-1 text-xs text-teal-800/80 dark:text-teal-200/70 text-center">
                  Leave the customer&apos;s details below and the venue will
                  contact them.
                </Text>
              )}
            </View>

            <View className="flex-row items-center gap-3 my-4">
              <View className="flex-1 h-px bg-gray-200 dark:bg-neutral-700" />
              <Text className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                or request a call back
              </Text>
              <View className="flex-1 h-px bg-gray-200 dark:bg-neutral-700" />
            </View>

            <Text className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">
              Name *
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Jamie Rivera"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="words"
              editable={!submitting}
              className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
            />

            <Text className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-4 mb-1.5">
              Mobile number *
            </Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="(810) 555-0134"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              editable={!submitting}
              className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
            />

            <Text className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-4 mb-1.5">
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="jamie@example.com"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!submitting}
              className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700"
            />

            <Text className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-4 mb-1.5">
              What would they like to book?
            </Text>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="A Saturday afternoon for 12 people, if possible."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              maxLength={1000}
              editable={!submitting}
              textAlignVertical="top"
              className="bg-white dark:bg-neutral-900 rounded-xl px-3.5 py-3 text-sm text-gray-900 dark:text-white border border-gray-200 dark:border-neutral-700 min-h-[80px]"
            />

            {error ? (
              <View className="mt-3 rounded-xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-3.5 py-2.5">
                <Text className="text-sm text-red-600 dark:text-red-300">
                  {error}
                </Text>
                {phoneNumber ? (
                  <Text className="text-xs text-red-500 dark:text-red-300/80 mt-1">
                    You can still call {phoneNumber} directly.
                  </Text>
                ) : null}
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={() => void submit()}
              className={`mt-4 flex-row items-center justify-center gap-2 rounded-xl px-4 py-3 ${
                submitting ? "bg-[#0644C7]/60" : "bg-[#0644C7] active:opacity-90"
              }`}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="phone" size={15} color="#FFFFFF" />
              )}
              <Text className="text-sm font-semibold text-white">
                {submitting ? "Sending…" : "Request a call back"}
              </Text>
            </Pressable>

            <Text className="text-[11px] text-gray-400 dark:text-gray-500 text-center leading-5 mt-3">
              This does not book or charge anything. The details are only used to
              contact the customer about this request.
            </Text>
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}

export default CallToBookSheet;
