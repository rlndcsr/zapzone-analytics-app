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

import { mediaUrl, webUrl } from "../../lib/api";
import { getToken } from "../../lib/session";
import { buildLocationSlug, createSlugWithId } from "../../lib/slug";
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

type Mode = "menu" | "view";

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

/** Public purchase URL — same shape the web ManageAttractions "Copy Link" builds. */
const buildPurchaseLink = (a: AttractionRow): string =>
  webUrl(
    `/purchase/attraction/${buildLocationSlug(a.locationName, a.locationId)}/${createSlugWithId(a.name, a.id)}`,
  );

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

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mt-5 mb-2">
    {children}
  </Text>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <View className="flex-row items-start justify-between py-1.5">
    <Text className="text-sm text-gray-500 dark:text-gray-400 mr-3">
      {label}
    </Text>
    <Text className="text-sm font-medium text-gray-900 dark:text-white flex-1 text-right">
      {value}
    </Text>
  </View>
);

type Props = {
  visible: boolean;
  attraction: AttractionRow | null;
  /**
   * Which content the sheet opens on. "menu" (default) shows the action hub —
   * used by the three-dot overflow. "view" opens straight into the details, so a
   * card tap lands on the details without the extra menu step (mirrors
   * PackageActionsSheet, which always opens in its view mode).
   */
  initialMode?: Mode;
  onClose: () => void;
  /** Refetch the list after any mutation so cards reflect the new state. */
  onChanged: () => void;
};

/**
 * Per-attraction actions hub — the mobile equivalent of the web admin's row
 * buttons (Copy Link / View purchase / View / Edit / Duplicate / Delete). The
 * menu and details views live in ONE BottomSheet that swaps content, so two
 * native Modals are never stacked. Editing opens the dedicated
 * /attractions/edit-attraction screen (mirrors PackageActionsSheet, whose Edit
 * routes to the full-screen edit page). Reuses the same endpoints as the web:
 * GET/DELETE /api/attractions/{id} and POST /api/attractions (duplicate).
 */
export function AttractionActionsSheet({
  visible,
  attraction,
  initialMode = "menu",
  onClose,
  onChanged,
}: Props) {
  const [mode, setMode] = useState<Mode>("menu");
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

  // Reset to the requested entry mode whenever the sheet (re)opens for an
  // attraction. When opening straight into the details (initialMode "view"), the
  // detail is loaded here since there's no menu tap to trigger it.
  useEffect(() => {
    if (visible) {
      setMode(initialMode);
      setDetail(null);
      setError(null);
      setBusy(false);
      setCopied(false);
      setDuplicating(false);
      if (initialMode !== "menu" && attraction) loadDetail(attraction.id);
    }
  }, [visible, initialMode, attraction, loadDetail]);

  const ensureDetail = useCallback(
    (id: number) => {
      if (!detail || detail.id !== id) loadDetail(id);
    },
    [detail, loadDetail],
  );

  if (!attraction) {
    return (
      <BottomSheet visible={visible} onClose={onClose} title="Attraction actions">
        <View className="px-5 py-10 items-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      </BottomSheet>
    );
  }

  // In the details view the attraction name IS the header title, so it shares
  // the sheet's top row with the close button (web admin parity). Falls back to
  // the row name until the full detail loads.
  const title =
    mode === "view" ? (detail?.name ?? attraction.name) : "Attraction actions";

  const purchaseLink = buildPurchaseLink(attraction);

  /* --- Actions ------------------------------------------------------------ */

  const goView = () => {
    setMode("view");
    ensureDetail(attraction.id);
  };
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

  // Opens the in-app customer purchase page for this attraction (the internal
  // equivalent of the web `/purchase/attraction/...` route) instead of an
  // external browser. Passes the attraction id + slug so the screen can load
  // the record and mirror the public purchase URL.
  const handleViewPurchasePage = () => {
    const slug = createSlugWithId(attraction.name, attraction.id);
    onClose();
    router.push({
      pathname: "/attractions/purchase-page",
      params: { id: String(attraction.id), slug },
    });
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

  // Primary image (first image, like the web admin), resolved to an absolute
  // URL via the shared media resolver. Null when the attraction has no image.
  const primaryImage =
    detail && detail.images.length > 0 ? mediaUrl(detail.images[0]) : null;

  // Price with its pricing type in words, e.g. "$31.99 (per person)" — matching
  // the web admin. Flat "fixed" pricing carries no per-unit qualifier.
  const priceValue = detail
    ? `${money(detail.price)}${
        detail.pricingType && detail.pricingType !== "fixed"
          ? ` (${pricingLabel(detail.pricingType).toLowerCase()})`
          : ""
      }`
    : "";

  // Created date in the web admin's numeric locale form, e.g. "2/22/2026".
  const createdValue = (() => {
    if (!detail?.createdAt) return "—";
    const d = new Date(detail.createdAt);
    return Number.isNaN(d.getTime())
      ? "—"
      : d.toLocaleDateString("en-US");
  })();

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      {mode === "menu" && (
        <View className="px-4 pb-6">
          <View className="px-4 pb-2">
            <Text
              className="text-base font-bold text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              {attraction.name}
            </Text>
            {!!attraction.locationName && (
              <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {attraction.locationName}
              </Text>
            )}
          </View>
          <ActionRow
            icon={copied ? "check" : "link"}
            label={copied ? "Link copied" : "Copy link"}
            hint="Public purchase URL"
            onPress={handleCopyLink}
          />
          <ActionRow
            icon="shopping-cart"
            label="View purchase page"
            hint="Open the in-app purchase page"
            onPress={handleViewPurchasePage}
          />
          <ActionRow icon="eye" label="View details" onPress={goView} />
          <ActionRow icon="edit-2" label="Edit attraction" onPress={goEdit} />
          <ActionRow
            icon="copy"
            label="Duplicate"
            hint="Creates an inactive copy"
            busy={duplicating}
            onPress={handleDuplicate}
          />
          <ActionRow
            icon="trash-2"
            label="Delete"
            danger
            busy={busy}
            onPress={confirmDelete}
          />
        </View>
      )}

      {mode === "view" && (
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

              {/* Primary image (web admin parity) — first image if present, else
                  the shared placeholder. Fixed aspect ratio keeps it undistorted
                  with the app's standard rounded-corner card style. */}
              <View
                className="w-full rounded-2xl overflow-hidden bg-gray-100 dark:bg-neutral-800 mt-4 items-center justify-center"
                style={{ aspectRatio: 16 / 9 }}
              >
                {primaryImage ? (
                  <Image
                    source={{ uri: primaryImage }}
                    style={{ width: "100%", height: "100%" }}
                    contentFit="cover"
                  />
                ) : (
                  <Feather name="image" size={36} color="#9CA3AF" />
                )}
              </View>

              {!!detail.description && (
                <>
                  <SectionTitle>Description</SectionTitle>
                  <Text className="text-sm text-gray-700 dark:text-gray-200 leading-5">
                    {detail.description}
                  </Text>
                </>
              )}

              <SectionTitle>Attraction Details</SectionTitle>
              <Row label="Category" value={detail.category} />
              <Row label="Price" value={priceValue} />
              <Row
                label="Max Capacity"
                value={`${detail.maxCapacity} people`}
              />
              <Row
                label="Duration"
                value={
                  detail.duration
                    ? `${detail.duration} ${detail.durationUnit}`
                    : "Unlimited"
                }
              />
              <Row label="Location" value={detail.locationName || "—"} />
              <Row label="Created" value={createdValue} />

              {detail.addOns.length > 0 && (
                <>
                  <SectionTitle>Add-ons ({detail.addOns.length})</SectionTitle>
                  {detail.addOns.map((a) => (
                    <View
                      key={a.id}
                      className="flex-row items-center justify-between py-1.5 border-b border-gray-100 dark:border-neutral-800"
                    >
                      <Text className="text-sm text-gray-700 dark:text-gray-200 flex-1 mr-2">
                        {a.name}
                      </Text>
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">
                        {money(a.price)}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              {detail.availability.length > 0 && (
                <>
                  <SectionTitle>Availability Schedule</SectionTitle>
                  {detail.availability.map((s, i) => (
                    <View
                      key={i}
                      className="py-2 border-b border-gray-100 dark:border-neutral-800"
                    >
                      <View className="flex-row items-center justify-between">
                        <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
                          {formatTimeRange(s.start_time, s.end_time) ||
                            `${s.start_time}–${s.end_time}`}
                        </Text>
                      </View>
                      {s.days.length > 0 && (
                        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1 capitalize">
                          {s.days.join(", ")}
                        </Text>
                      )}
                    </View>
                  ))}
                </>
              )}

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
                  className="w-12 items-center justify-center py-3.5 rounded-xl border border-red-200 dark:border-red-900/50"
                >
                  <Feather name="trash-2" size={16} color="#dc2626" />
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </BottomSheet>
  );
}
