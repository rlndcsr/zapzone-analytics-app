import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import {
  canSwitchLocation,
  workLocationsOf,
} from "../../lib/location/staffLocation";
import {
  canRetryFailure,
  describeFailure,
  type StaffRequestFailure,
} from "../../lib/registrationForms/registrationForms";
import { getCurrentUser } from "../../lib/session";
import { switchStaffLocation } from "../../services/staffLocationService";

export function RegistrationLoadFailure({
  failure,
  fallback,
  returnTo,
  iconColor,
  onRetry,
}: {
  failure: StaffRequestFailure | null;
  fallback: string;
  returnTo: string;
  iconColor: string;
  onRetry: () => void;
}) {
  const [switching, setSwitching] = useState(false);
  const switchId = failure?.switchLocationId ?? null;

  const switchToLocation = async (locationId: number) => {
    const name =
      workLocationsOf(getCurrentUser()).find((l) => l.id === locationId)
        ?.name ?? "the new location";
    setSwitching(true);
    try {
      await switchStaffLocation(locationId);
      if (router.canDismiss()) router.dismissAll();
      router.replace({
        pathname: "/switch-account",
        params: { locationName: name, returnTo },
      } as never);
    } catch (err) {
      setSwitching(false);
      Alert.alert(
        "Couldn't switch locations",
        describeFailure(err, "Please try again.").message,
      );
    }
  };

  return (
    <View className="flex-1 items-center justify-center px-6 gap-4">
      <Feather name="alert-circle" size={44} color="#EF4444" />
      <Text className="text-lg font-bold text-gray-900 dark:text-white text-center">
        {failure?.message ?? fallback}
      </Text>
      {switchId != null && canSwitchLocation(getCurrentUser()) && (
        <Pressable
          onPress={() => void switchToLocation(switchId)}
          disabled={switching}
          className="flex-row items-center gap-2 px-5 py-3 rounded-xl bg-[#0644C7] active:opacity-90"
          accessibilityRole="button"
        >
          {switching && <ActivityIndicator size="small" color="#FFFFFF" />}
          <Text className="text-sm font-semibold text-white">
            Switch to that location
          </Text>
        </Pressable>
      )}
      {failure && canRetryFailure(failure) && (
        <Pressable
          onPress={onRetry}
          className="px-5 py-3 rounded-xl bg-[#0644C7] active:opacity-90"
          accessibilityRole="button"
        >
          <Text className="text-sm font-semibold text-white">Try again</Text>
        </Pressable>
      )}
      <Pressable
        onPress={() => router.dismissTo("/events/registration-forms" as never)}
        className="flex-row items-center gap-2 px-5 py-3 rounded-xl border border-gray-200 dark:border-neutral-700 active:opacity-70"
        accessibilityRole="button"
      >
        <Feather name="arrow-left" size={15} color={iconColor} />
        <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
          Back to all events
        </Text>
      </Pressable>
    </View>
  );
}
