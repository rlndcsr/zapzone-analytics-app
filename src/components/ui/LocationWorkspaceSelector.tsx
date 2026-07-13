import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { CheckCircle, ChevronDown, MapPin } from "lucide-react-native";

import {
  setActiveLocation,
  useActiveLocation,
} from "../../lib/location/activeLocationStore";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getCurrentUser } from "../../lib/session";
import { BottomSheet } from "./BottomSheet";

type Props = {
  /** Drop the card background so the pill blends into a colored header. */
  transparent?: boolean;
};

/**
 * Global "active location" workspace selector — the mobile equivalent of the
 * web admin's sidebar location picker. Company-admin only; renders nothing for
 * managers/attendants (who are auto-scoped to their own location server-side).
 * Writes to the shared activeLocationStore, so every location-aware module
 * follows the selection.
 */
export function LocationWorkspaceSelector({ transparent }: Props) {
  const active = useActiveLocation();
  const { locations } = useLocationOptions();
  const [open, setOpen] = useState(false);

  // Role gate — reuse the same inline check used across the app.
  if (getCurrentUser()?.role !== "company_admin") return null;

  const select = (id: number | "all", name: string) => {
    setActiveLocation({ id, name });
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className={`flex-row items-center gap-3 px-5 py-4 rounded-2xl border border-gray-100 dark:border-neutral-800 ${
          transparent ? "bg-white/10 dark:bg-white/5" : "bg-white dark:bg-neutral-900"
        }`}
        accessibilityRole="button"
        accessibilityLabel="Select active location"
      >
        <MapPin size={17} color="#0644C7" />
        <Text
          className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex-1"
          numberOfLines={1}
        >
          {active.name}
        </Text>
        <ChevronDown size={18} color="#9CA3AF" />
      </Pressable>

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          <Pressable
            onPress={() => select("all", "All Locations")}
            className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
              active.id === "all" ? "bg-blue-50 dark:bg-blue-900/20" : ""
            }`}
          >
            <Text
              className={`text-base font-medium ${
                active.id === "all"
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-700 dark:text-gray-200"
              }`}
            >
              All Locations
            </Text>
            {active.id === "all" && (
              <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                <CheckCircle size={14} color="#FFFFFF" fill="#FFFFFF" />
              </View>
            )}
          </Pressable>

          {locations.map((loc) => {
            const isSelected = active.id === loc.id;
            return (
              <Pressable
                key={loc.id}
                onPress={() => select(loc.id, loc.name)}
                className={`flex-row items-center justify-between px-4 py-3.5 rounded-xl mb-1 ${
                  isSelected ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <Text
                  className={`text-base font-medium flex-1 mr-2 ${
                    isSelected
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-200"
                  }`}
                  numberOfLines={1}
                >
                  {loc.name}
                </Text>
                {isSelected && (
                  <View className="w-6 h-6 rounded-full bg-blue-500 items-center justify-center">
                    <CheckCircle size={14} color="#FFFFFF" fill="#FFFFFF" />
                  </View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </>
  );
}
