import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";
import { ChevronDown, MapPin } from "lucide-react-native";

import { ApiError } from "../../lib/api";
import {
  setActiveLocation,
  useActiveLocation,
} from "../../lib/location/activeLocationStore";
import {
  canSwitchLocation,
  homeLocationIdOf,
  workLocationsOf,
} from "../../lib/location/staffLocation";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { getCurrentUser } from "../../lib/session";
import { switchStaffLocation } from "../../services/staffLocationService";
import { BottomSheet } from "./BottomSheet";

type Props = {
  /** Drop the card background so the pill blends into a colored header. */
  transparent?: boolean;
};

/**
 * Global "active location" workspace selector — the mobile equivalent of the
 * web admin's sidebar location picker. Company admins scope every module via
 * the shared activeLocationStore; a location manager with several assigned
 * locations switches the one they work in. Renders nothing for anyone else.
 */
export function LocationWorkspaceSelector({ transparent }: Props) {
  const active = useActiveLocation();
  const { locations } = useLocationOptions();
  const [open, setOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<number | null>(null);

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  if (!isCompanyAdmin && !canSwitchLocation(user)) return null;

  const workLocations = workLocationsOf(user);
  const homeId = homeLocationIdOf(user);
  const pickedId = isCompanyAdmin ? active.id : (user?.location_id ?? null);
  const switchingName =
    switchingId != null
      ? (workLocations.find((l) => l.id === switchingId)?.name ?? "the new location")
      : null;
  const label = isCompanyAdmin
    ? active.name
    : (switchingName ??
      workLocations.find((l) => l.id === user?.location_id)?.name ??
      user?.location?.name ??
      `Location #${user?.location_id}`);

  const select = (id: number | "all", name: string) => {
    setActiveLocation({ id, name });
    setOpen(false);
  };

  const switchTo = async (id: number, name: string) => {
    setOpen(false);
    if (switchingId != null || id === user?.location_id) return;
    setSwitchingId(id);
    try {
      await switchStaffLocation(id);
      // Like the web's reload: the bridge remounts every screen under the new location.
      if (router.canDismiss()) router.dismissAll();
      router.replace({ pathname: "/switch-account", params: { locationName: name } });
    } catch (err) {
      setSwitchingId(null);
      Alert.alert(
        "Couldn't switch locations",
        err instanceof ApiError ? err.message : "Please try again.",
      );
    }
  };

  const options: { id: number; name: string }[] = isCompanyAdmin
    ? locations
    : workLocations;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={switchingId != null}
        className={`flex-row items-center gap-3 px-5 py-4 rounded-2xl border border-gray-100 dark:border-neutral-800 ${
          transparent ? "bg-white/10 dark:bg-white/5" : "bg-white dark:bg-neutral-900"
        } ${switchingId != null ? "opacity-70" : ""}`}
        accessibilityRole="button"
        accessibilityLabel="Select active location"
        accessibilityState={{ busy: switchingId != null }}
      >
        <MapPin size={17} color="#0644C7" />
        <Text
          className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex-1"
          numberOfLines={1}
        >
          {switchingName ? `Switching to ${switchingName}` : label}
        </Text>
        <ChevronDown size={18} color="#9CA3AF" />
      </Pressable>

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title="Select Location"
      >
        <ScrollView className="px-4 pb-6" showsVerticalScrollIndicator={false}>
          {isCompanyAdmin ? (
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
            </Pressable>
          ) : (
            <Text className="px-4 pb-3 text-sm text-gray-500 dark:text-gray-400">
              You manage one location at a time. Pick where you are working.
            </Text>
          )}

          {options.map((loc) => {
            const isSelected = pickedId === loc.id;
            return (
              <Pressable
                key={loc.id}
                onPress={() =>
                  isCompanyAdmin ? select(loc.id, loc.name) : void switchTo(loc.id, loc.name)
                }
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
                {!isCompanyAdmin && loc.id === homeId && (
                  <Text className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    Home
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheet>
    </>
  );
}
