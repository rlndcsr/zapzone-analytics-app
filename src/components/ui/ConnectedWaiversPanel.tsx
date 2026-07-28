import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { launchKioskSession } from "../../lib/waivers/kiosk";
import type {
  ConnectedWaiver,
  EntityWaivers,
  KioskSourceType,
} from "../../services/waiversService";
import { StatusBadge } from "./StatusBadge";

const PRIMARY = "#0644C7";

/** Header action that opens the prefilled kiosk for this record. */
const KioskButton = ({
  launching,
  onPress,
}: {
  launching: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={launching}
    hitSlop={6}
    className="flex-row items-center gap-1 active:opacity-70"
    style={launching ? { opacity: 0.5 } : undefined}
    accessibilityRole="button"
    accessibilityLabel="Open waiver kiosk"
  >
    {launching ? (
      <ActivityIndicator size="small" color={PRIMARY} />
    ) : (
      <Feather name="tablet" size={12} color={PRIMARY} />
    )}
    <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
      Kiosk
    </Text>
  </Pressable>
);

const WaiverRow = ({
  waiver,
  onCopyLink,
}: {
  waiver: ConnectedWaiver;
  onCopyLink: (waiver: ConnectedWaiver) => void;
}) => (
  <View className="flex-row items-start justify-between py-2.5 border-b border-gray-100 dark:border-neutral-800">
    <View className="flex-1 mr-2">
      <Text className="text-sm font-medium text-gray-900 dark:text-white">
        {waiver.adultName}
      </Text>
      <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
        {waiver.template ? `${waiver.template} · ` : ""}
        {waiver.selectedDate ?? ""}
        {waiver.minors.length > 0 ? ` · Minors: ${waiver.minors.join(", ")}` : ""}
      </Text>
    </View>
    <View className="items-end gap-1.5">
      <StatusBadge status={waiver.status} />
      {/* Only pending waivers still have a shareable link (backend rule). */}
      {!!waiver.signingUrl && (
        <Pressable
          onPress={() => onCopyLink(waiver)}
          hitSlop={6}
          className="flex-row items-center gap-1 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={`Copy waiver link for ${waiver.adultName}`}
        >
          <Feather name="link" size={12} color={PRIMARY} />
          <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
            Copy link
          </Text>
        </Pressable>
      )}
    </View>
  </View>
);

/**
 * The connected-waivers body of a details screen — summary counts, a Kiosk
 * launcher, and one row per waiver with a Copy link action. Mirrors the web
 * `WaiverConnectionPanel`; the caller supplies the surrounding SectionCard and
 * the already-fetched data.
 */
export function ConnectedWaiversPanel({
  sourceType,
  sourceId,
  entityLabel,
  waivers,
  loading,
}: {
  sourceType: KioskSourceType;
  sourceId: number;
  /** Used in the empty message, e.g. "attraction purchase". */
  entityLabel: string;
  waivers: EntityWaivers | null;
  loading: boolean;
}) {
  const [launching, setLaunching] = useState(false);

  const openKiosk = async () => {
    setLaunching(true);
    try {
      await launchKioskSession(sourceType, sourceId);
    } finally {
      setLaunching(false);
    }
  };

  const copyLink = async (waiver: ConnectedWaiver) => {
    if (!waiver.signingUrl) return;
    try {
      await Clipboard.setStringAsync(waiver.signingUrl);
      Alert.alert("Link copied", "The waiver link was copied to your clipboard.");
    } catch {
      Alert.alert("Copy failed", "Could not copy the waiver link.");
    }
  };

  if (loading) {
    return (
      <View className="py-4 items-center">
        <ActivityIndicator color={PRIMARY} />
      </View>
    );
  }

  if (!waivers || waivers.summary.total === 0) {
    return (
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-sm text-gray-400 dark:text-gray-500">
          No waiver connected to this {entityLabel}.
        </Text>
        <KioskButton launching={launching} onPress={openKiosk} />
      </View>
    );
  }

  return (
    <>
      <View className="flex-row items-center gap-3 mb-2">
        <Text className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
          {waivers.summary.completed} complete
        </Text>
        {waivers.summary.pending > 0 && (
          <Text className="text-xs font-medium text-amber-600 dark:text-amber-400">
            {waivers.summary.pending} pending
          </Text>
        )}
        <View className="flex-1" />
        <KioskButton launching={launching} onPress={openKiosk} />
      </View>
      {waivers.waivers.map((w) => (
        <WaiverRow key={w.id} waiver={w} onCopyLink={copyLink} />
      ))}
    </>
  );
}
