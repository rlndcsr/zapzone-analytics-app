import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { launchKioskSession } from "../../lib/waivers/kiosk";
import {
  countLabel,
  entityCoverage,
  peopleOnForm,
} from "../../lib/waivers/waiverCoverage";
import type {
  ConnectedWaiver,
  EntityWaivers,
  KioskSourceType,
} from "../../services/waiversService";
import { StatusBadge } from "./StatusBadge";
import { WaiverCoverageLine } from "./WaiverCoverageLine";

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
        {peopleOnForm(waiver) > 1 && (
          <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {"  "}
            {countLabel(peopleOnForm(waiver), "participant", "participants")}
          </Text>
        )}
      </Text>
      <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
        {waiver.template ? `${waiver.template} · ` : ""}
        {waiver.selectedDate ?? ""}
        {waiver.minors.length > 0
          ? ` · ${waiver.status === "completed" ? "Minors covered by this waiver" : "Minors"}: ${waiver.minors.join(", ")}`
          : ""}
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
  emptyMessage,
}: {
  sourceType: KioskSourceType;
  sourceId: number;
  /** Used in the empty message, e.g. "attraction purchase". */
  entityLabel: string;
  waivers: EntityWaivers | null;
  loading: boolean;
  emptyMessage?: string;
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
          {emptyMessage ?? `No waiver connected to this ${entityLabel}.`}
        </Text>
        <KioskButton launching={launching} onPress={openKiosk} />
      </View>
    );
  }

  return (
    <>
      <View className="flex-row items-start gap-3 mb-2">
        <View className="flex-1">
          <WaiverCoverageLine coverage={entityCoverage(waivers)} showCheckedIn={false} />
        </View>
        <KioskButton launching={launching} onPress={openKiosk} />
      </View>
      {waivers.waivers.map((w) => (
        <WaiverRow key={w.id} waiver={w} onCopyLink={copyLink} />
      ))}
    </>
  );
}
