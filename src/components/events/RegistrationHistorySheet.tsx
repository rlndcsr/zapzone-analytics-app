import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { formatDateTimeET } from "../../lib/date/venueTime";
import { formatPhoneForDisplay } from "../../lib/phone";
import {
  describeFailure,
  locationDisplayName,
} from "../../lib/registrationForms/registrationForms";
import { getToken } from "../../lib/session";
import { formatDateLong } from "../../lib/waivers/returningCustomers";
import {
  fetchContactHistory,
  type RegistrationHistory,
} from "../../services/registrationFormsService";
import { BottomSheet } from "../ui/BottomSheet";

const Chip = ({ label, tone }: { label: string; tone: "blue" | "gray" }) => (
  <View
    className={`px-2 py-0.5 rounded-full border ${
      tone === "blue"
        ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800"
        : "bg-gray-100 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700"
    }`}
  >
    <Text
      className={`text-xs font-medium ${
        tone === "blue"
          ? "text-blue-800 dark:text-blue-300"
          : "text-gray-700 dark:text-gray-300"
      }`}
    >
      {label}
    </Text>
  </View>
);

export function RegistrationHistorySheet({
  formId,
  contactId,
  onClose,
}: {
  formId: number;
  contactId: number | null;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<RegistrationHistory | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (contactId == null) return;
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    setHistory(null);
    setError(null);
    fetchContactHistory(token, formId, contactId, controller.signal)
      .then(setHistory)
      .catch((failure: unknown) =>
        setError(
          describeFailure(
            failure,
            "The registration history could not be loaded.",
          ).message,
        ),
      );
    return () => controller.abort();
  }, [formId, contactId]);

  return (
    <BottomSheet
      visible={contactId != null}
      onClose={onClose}
      title="Registration history"
      subtitle="Shows registrations only — not who attended."
    >
      <ScrollView className="px-5 pb-6" showsVerticalScrollIndicator={false}>
        {error ? (
          <Text className="text-sm text-red-600">{error}</Text>
        ) : !history ? (
          <View className="flex-row items-center gap-2 py-6">
            <ActivityIndicator size="small" color="#0644C7" />
            <Text className="text-sm text-gray-500">Loading…</Text>
          </View>
        ) : (
          <View className="gap-4">
            <View className="rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-4 py-3">
              <Text className="text-sm font-medium text-gray-900 dark:text-white">
                {history.email}
              </Text>
              <Text className="text-sm text-gray-700 dark:text-gray-300">
                {formatPhoneForDisplay(history.phone) || history.phone}
              </Text>
              <Text className="text-xs text-gray-500 dark:text-gray-400 pt-1">
                These contact details are one shared record across your
                registration forms.
              </Text>
            </View>

            <View className="rounded-xl border border-gray-100 dark:border-neutral-800">
              {history.history.map((item, index) => (
                <View
                  key={item.entryId}
                  className="px-4 py-3 gap-1 border-gray-100 dark:border-neutral-800"
                  style={{ borderTopWidth: index > 0 ? 1 : 0 }}
                >
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="font-medium text-gray-900 dark:text-white">
                      {item.eventName}
                    </Text>
                    {item.isCurrentEvent && (
                      <Chip label="This form" tone="blue" />
                    )}
                    {item.isPreviousEdition && (
                      <Chip label={"Last year's edition"} tone="gray" />
                    )}
                  </View>
                  <Text className="text-sm text-gray-600 dark:text-gray-400">
                    {formatDateLong(item.eventDate)}
                    {item.locationName
                      ? ` · ${locationDisplayName(item.locationName)}`
                      : ""}
                  </Text>
                  <Text className="text-sm text-gray-700 dark:text-gray-300">
                    Registered {formatDateTimeET(item.registeredAt)}
                    {item.name ? (
                      <>
                        {" "}
                        as <Text className="font-medium">{item.name}</Text>
                      </>
                    ) : null}
                  </Text>
                </View>
              ))}
            </View>

            {history.otherLocationRegistrations > 0 && (
              <Text className="text-sm text-gray-600 dark:text-gray-400">
                Also registered for {history.otherLocationRegistrations} form
                {history.otherLocationRegistrations === 1 ? "" : "s"} at other
                locations.
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
