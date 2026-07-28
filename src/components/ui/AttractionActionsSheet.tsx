import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import {
  buildPurchaseLink,
  openPurchasePage,
} from "../../lib/attractions/purchaseLink";
import { formatDurationDisplay } from "../../lib/attractions/attractionDisplay";
import { mediaUrl } from "../../lib/api";
import { getToken } from "../../lib/session";
import { formatTimeRange } from "../../lib/time";
import {
  deleteAttraction,
  duplicateAttraction,
  fetchAttractionDetail,
  type AttractionDetail,
  type AttractionRow,
} from "../../services/attractionsService";
import { BottomSheet } from "./BottomSheet";
import { StatusBadge } from "./StatusBadge";

const PRIMARY = "#0644C7";

const PRICING_TYPES = [
  { label: "Per Person", value: "per_person" },
  { label: "Per Group", value: "per_group" },
  { label: "Per Hour", value: "per_hour" },
  { label: "Per Game", value: "per_game" },
  { label: "Fixed Price", value: "fixed" },
];

const pricingLabel = (value: string): string =>
  PRICING_TYPES.find((p) => p.value === value)?.label ?? value;

const money = (n: number): string =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/* --- Local presentational helpers (matches PackageActionsSheet convention) -- */

const ActionRow = ({
  icon,
  label,
  hint,
  danger = false,
  busy = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  hint?: string;
  danger?: boolean;
  busy?: boolean;
  onPress: () => void;
}) => {
  const color = danger ? "#dc2626" : "#374151";
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
      className="flex-row items-center gap-3 px-4 py-3.5 rounded-xl mb-1"
    >
      <View className="w-9 h-9 rounded-xl items-center justify-center bg-gray-100 dark:bg-neutral-800">
        {busy ? (
          <ActivityIndicator size="small" color={color} />
        ) : (
          <Feather name={icon} size={18} color={color} />
        )}
      </View>
      <View className="flex-1">
        <Text
          className="text-base font-medium text-gray-800 dark:text-gray-100"
          style={danger ? { color } : undefined}
        >
          {label}
        </Text>
        {!!hint && (
          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {hint}
          </Text>
        )}
      </View>
    </Pressable>
  );
};

/** Section heading, matching the web details page's `<h2>` treatment. */
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-lg font-semibold text-gray-900 dark:text-white mt-6 mb-3">
    {children}
  </Text>
);

/**
 * One icon-led detail in the "Attraction Details" grid — icon tile, muted
 * label, value. Two per row, as on the web.
 */
const DetailTile = ({
  icon,
  label,
  value,
  extra,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
  /** Muted qualifier after the value, e.g. "(per person)". */
  extra?: string;
}) => (
  <View className="w-1/2 px-1.5 mb-4">
    <View className="flex-row items-start gap-2.5">
      <View className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 items-center justify-center">
        <Feather name={icon} size={16} color={PRIMARY} />
      </View>
      <View className="flex-1">
        <Text className="text-xs text-gray-500 dark:text-gray-400">{label}</Text>
        <Text className="text-sm font-medium text-gray-900 dark:text-white">
          {value}
          {!!extra && (
            <Text className="text-xs font-normal text-gray-500 dark:text-gray-400">
              {"  "}
              {extra}
            </Text>
          )}
        </Text>
      </View>
    </View>
  </View>
);

type Props = {
  visible: boolean;
  attraction: AttractionRow | null;
  onClose: () => void;
  /** Refetch the list after any mutation so cards reflect the new state. */
  onChanged: () => void;
};

/**
 * Attraction Details sheet — opens straight into the details (a card tap in the
 * list is the sole entry point) and hosts every action inline: Copy Link, View
 * purchase page, Edit, Duplicate, Delete. Editing opens the dedicated
 * /attractions/edit-attraction screen (mirrors PackageActionsSheet, whose Edit
 * routes to the full-screen edit page). Reuses the same endpoints as the web:
 * GET/DELETE /api/attractions/{id} and POST /api/attractions (duplicate).
 */
export function AttractionActionsSheet({
  visible,
  attraction,
  onClose,
  onChanged,
}: Props) {
  const [detail, setDetail] = useState<AttractionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  const reqRef = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const loadDetail = useCallback(async (id: number) => {
    const token = getToken();
    if (!token) {
      setError("Not signed in");
      return;
    }
    const rid = ++reqRef.current;
    setLoading(true);
    setError(null);
    try {
      const d = await fetchAttractionDetail(token, id);
      if (rid === reqRef.current) setDetail(d);
    } catch (err) {
      if (rid === reqRef.current) {
        setError(
          err instanceof Error ? err.message : "Failed to load attraction",
        );
      }
    } finally {
      if (rid === reqRef.current) setLoading(false);
    }
  }, []);

  // Load the selected attraction's detail whenever the sheet (re)opens.
  useEffect(() => {
    if (visible && attraction) {
      setDetail(null);
      setError(null);
      setBusy(false);
      setCopied(false);
      setDuplicating(false);
      loadDetail(attraction.id);
    }
  }, [visible, attraction, loadDetail]);

  if (!attraction) {
    return (
      <BottomSheet
        visible={visible}
        onClose={onClose}
        title="Attraction actions"
      >
        <View className="px-5 py-10 items-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      </BottomSheet>
    );
  }

  // The attraction name IS the header title, sharing the sheet's top row with
  // the close button (web admin parity). Falls back to the row name until the
  // full detail loads.
  const title = detail?.name ?? attraction.name;

  const purchaseLink = buildPurchaseLink(attraction);

  /* --- Actions ------------------------------------------------------------ */

  // Editing is a dedicated full-screen experience (all sections, web parity),
  // matching PackageActionsSheet. Close the sheet and navigate; the list
  // refetches on focus via the stale flag the edit screen sets on save.
  const goEdit = () => {
    onClose();
    router.push(`/attractions/edit-attraction?id=${attraction.id}`);
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(purchaseLink);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const handleViewPurchasePage = () => {
    onClose();
    openPurchasePage(attraction);
  };

  const handleDuplicate = async () => {
    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    setDuplicating(true);
    try {
      await duplicateAttraction(token, attraction.id);
      onChanged();
      onClose();
      Alert.alert(
        "Duplicated",
        `"${attraction.name}" was duplicated (inactive copy).`,
      );
    } catch (err) {
      Alert.alert(
        "Duplicate failed",
        err instanceof Error ? err.message : "Could not duplicate attraction.",
      );
    } finally {
      setDuplicating(false);
    }
  };

  const confirmDelete = () => {
    Alert.alert(
      "Delete attraction",
      "Are you sure you want to delete this attraction? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token) {
              Alert.alert("Not signed in", "Please sign in again.");
              return;
            }
            setBusy(true);
            try {
              await deleteAttraction(token, attraction.id);
              onChanged();
              onClose();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error
                  ? err.message
                  : "Could not delete attraction.",
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  /* --- Render -------------------------------------------------------------- */

  // Add-ons in their saved display order (`addOnsOrder`, by name), matching the
  // web details page's sort.
  const orderedAddOns = detail
    ? [...detail.addOns].sort((a, b) => {
        const order = detail.addOnsOrder ?? [];
        if (order.length === 0) return 0;
        const ia = order.indexOf(a.name);
        const ib = order.indexOf(b.name);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
    : [];

  // Pricing type in words as a muted qualifier, e.g. "(per person)" — matching
  // the web admin. Flat "fixed" pricing carries no per-unit qualifier.
  const priceQualifier =
    detail?.pricingType && detail.pricingType !== "fixed"
      ? `(${pricingLabel(detail.pricingType).toLowerCase()})`
      : undefined;

  // Created date in the web admin's numeric locale form, e.g. "2/22/2026".
  const createdValue = (() => {
    if (!detail?.createdAt) return "—";
    const d = new Date(detail.createdAt);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US");
  })();

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <ScrollView
        className="px-5"
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View className="py-10 items-center">
            <ActivityIndicator color={PRIMARY} />
          </View>
        )}
        {!loading && error && (
          <View className="bg-red-50 dark:bg-red-900/20 rounded-2xl p-4 my-3">
            <Text className="text-sm text-red-600 dark:text-red-300">
              {error}
            </Text>
          </View>
        )}
        {!loading && !error && detail && (
          <>
            {/* The attraction name lives in the sheet header (beside the close
                  button); the category + status badges sit directly beneath it,
                  then the image. */}
            <View className="flex-row items-center gap-2 mt-1">
              <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-lg">
                <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
                  {detail.category}
                </Text>
              </View>
              <StatusBadge status={detail.status} />
              {detail.name.includes("(Copy)") && (
                <View className="flex-row items-center gap-1 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40">
                  <Feather name="copy" size={10} color="#B45309" />
                  <Text className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    Copy
                  </Text>
                </View>
              )}
            </View>

            {/* Images — every image, two per row, like the web's grid. */}
            <SectionTitle>Images</SectionTitle>
            {detail.images.length > 0 ? (
              <View className="flex-row flex-wrap -mx-1.5">
                {detail.images.map((img, i) => (
                  <View key={i} className="w-1/2 px-1.5 mb-3">
                    <View
                      className="w-full rounded-lg overflow-hidden border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800"
                      style={{ aspectRatio: 16 / 9 }}
                    >
                      <Image
                        source={{ uri: mediaUrl(img) ?? undefined }}
                        style={{ width: "100%", height: "100%" }}
                        contentFit="cover"
                      />
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View
                className="w-full rounded-lg overflow-hidden border border-gray-200 dark:border-neutral-700 bg-gray-100 dark:bg-neutral-800 items-center justify-center"
                style={{ aspectRatio: 16 / 9 }}
              >
                <Feather name="image" size={36} color="#9CA3AF" />
              </View>
            )}

            <SectionTitle>Description</SectionTitle>
            <Text className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
              {detail.description || "No description provided."}
            </Text>

            <SectionTitle>Attraction Details</SectionTitle>
            <View className="flex-row flex-wrap -mx-1.5">
              <DetailTile icon="tag" label="Category" value={detail.category} />
              <DetailTile
                icon="dollar-sign"
                label="Price"
                value={money(detail.price)}
                extra={priceQualifier}
              />
              <DetailTile
                icon="users"
                label="Max Capacity"
                value={`${detail.maxCapacity} people`}
              />
              <DetailTile
                icon="clock"
                label="Duration"
                value={formatDurationDisplay(detail.duration, detail.durationUnit)}
              />
              <DetailTile
                icon="map-pin"
                label="Location"
                value={detail.locationName || "N/A"}
              />
              <DetailTile icon="calendar" label="Created" value={createdValue} />
            </View>

            {detail.addOns.length > 0 && (
              <>
                <SectionTitle>Add-ons</SectionTitle>
                {orderedAddOns.map((a) => {
                  const thumb = mediaUrl(a.image);
                  return (
                    <View
                      key={a.id}
                      className="flex-row items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 mb-2 dark:border-neutral-700 dark:bg-neutral-800/40"
                    >
                      <View
                        className="rounded-md overflow-hidden bg-gray-100 dark:bg-neutral-800 items-center justify-center"
                        style={{ width: 48, height: 48 }}
                      >
                        {thumb ? (
                          <Image
                            source={{ uri: thumb }}
                            style={{ width: "100%", height: "100%" }}
                            contentFit="cover"
                          />
                        ) : (
                          <Text className="text-[10px] text-gray-400">No Img</Text>
                        )}
                      </View>
                      <View className="flex-1">
                        <Text
                          className="text-sm font-medium text-gray-900 dark:text-white"
                          numberOfLines={1}
                        >
                          {a.name}
                        </Text>
                        {!!a.description && (
                          <Text
                            className="text-xs text-gray-500 dark:text-gray-400"
                            numberOfLines={1}
                          >
                            {a.description}
                          </Text>
                        )}
                      </View>
                      <View className="items-end">
                        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                          {money(a.price)}
                        </Text>
                        <Text className="text-[10px] text-gray-500 dark:text-gray-400">
                          Min: {a.minQuantity} · Max: {a.maxQuantity}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </>
            )}

            {/* Availability — one card per schedule: blue day chips, then the
                open hours beside a clock (web parity). */}
            <SectionTitle>Availability Schedule</SectionTitle>
            {detail.availability.length > 0 ? (
              detail.availability.map((s, i) => (
                <View
                  key={i}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-4 mb-2 dark:border-neutral-700 dark:bg-neutral-800/40"
                >
                  {s.days.length > 0 && (
                    <View className="flex-row flex-wrap gap-2 mb-3">
                      {s.days.map((day) => (
                        <View
                          key={day}
                          className="rounded bg-[#0644C7] px-3 py-1.5"
                        >
                          <Text className="text-sm font-medium capitalize text-white">
                            {day}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View className="flex-row items-center gap-2">
                    <Feather name="clock" size={14} color={PRIMARY} />
                    <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      {formatTimeRange(s.start_time, s.end_time) ||
                        `${s.start_time}–${s.end_time}`}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <View className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/40">
                <Text className="text-sm text-gray-600 dark:text-gray-300">
                  No availability schedule configured for this attraction.
                </Text>
              </View>
            )}

            {/* Purchase-page actions (relocated here from the old overflow
                  menu now that a card tap opens straight into these details). */}
            <SectionTitle>Purchase Page</SectionTitle>
            <View className="-mx-1">
              <ActionRow
                icon={copied ? "check" : "link"}
                label={copied ? "Link copied" : "Copy link"}
                hint="Copy the public purchase URL"
                onPress={handleCopyLink}
              />
              <ActionRow
                icon="shopping-cart"
                label="View purchase page"
                hint="Open the in-app purchase page"
                onPress={handleViewPurchasePage}
              />
            </View>

            {/* Footer actions */}
            <View className="flex-row gap-3 mt-6">
              <Pressable
                onPress={goEdit}
                className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7]"
              >
                <Feather name="edit-2" size={16} color="#fff" />
                <Text className="text-sm font-semibold text-white">Edit</Text>
              </Pressable>
              <Pressable
                onPress={handleDuplicate}
                disabled={duplicating}
                className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
              >
                {duplicating ? (
                  <ActivityIndicator size="small" color="#374151" />
                ) : (
                  <>
                    <Feather name="copy" size={16} color="#374151" />
                    <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                      Duplicate
                    </Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={confirmDelete}
                disabled={busy}
                className="w-12 items-center justify-center py-3.5 rounded-xl border border-red-200 dark:border-red-900/50"
              >
                {busy ? (
                  <ActivityIndicator size="small" color="#dc2626" />
                ) : (
                  <Feather name="trash-2" size={16} color="#dc2626" />
                )}
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  );
}
