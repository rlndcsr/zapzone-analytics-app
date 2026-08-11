import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { CenterModal } from "../../components/ui/CenterModal";
import { DateRangeSheet, formatShortDate } from "../../components/ui/DateRangeSheet";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { PrimaryButton } from "../../components/ui/PrimaryButton";
import { SheetSelect } from "../../components/ui/SheetSelect";
import { Toast, type ToastType } from "../../components/ui/Toast";
import {
  SkeletonBlock,
  usePulse,
} from "../../components/ui/skeleton/SkeletonBlock";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  deleteLibraryPhoto,
  deleteLibraryPhotos,
  fetchPhotoLibrary,
  photoDownloadUrl,
  searchPhotoWaivers,
  sendLibraryPhoto,
  setPhotoOnSlideshow,
  type LibraryPhoto,
  type PhotoDeliverySchedule,
  type PhotoLibrary,
  type PhotoSessionSource,
  type PhotoWaiverMatch,
} from "../../services/photosService";

const PRIMARY = "#0644C7";

const SOURCE_OPTIONS = [
  { label: "All sources", value: "" },
  { label: "Staff sessions", value: "staff" },
  { label: "Kiosk sessions", value: "kiosk" },
];

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

const CHIP_TONES = {
  gray: {
    wrap: "bg-gray-100 dark:bg-neutral-800",
    text: "text-gray-700 dark:text-gray-300",
  },
  muted: {
    wrap: "bg-gray-100 dark:bg-neutral-800",
    text: "text-gray-500 dark:text-gray-500",
  },
  green: {
    wrap: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-800 dark:text-green-300",
  },
  blue: {
    wrap: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-800 dark:text-blue-300",
  },
  amber: {
    wrap: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-800 dark:text-amber-300",
  },
} as const;

function Chip({
  label,
  tone,
  capitalize = false,
}: {
  label: string;
  tone: keyof typeof CHIP_TONES;
  capitalize?: boolean;
}) {
  const style = CHIP_TONES[tone];
  return (
    <View className={`rounded-full px-2 py-0.5 ${style.wrap}`}>
      <Text
        className={`text-[10px] ${capitalize ? "capitalize" : ""} ${style.text}`}
      >
        {label}
      </Text>
    </View>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <View
      className={`h-5 w-5 items-center justify-center rounded border-2 ${
        checked
          ? "border-[#0644C7] bg-[#0644C7]"
          : "border-gray-300 bg-white/90 dark:border-neutral-500"
      }`}
    >
      {checked && <Feather name="check" size={13} color="#FFFFFF" />}
    </View>
  );
}

function RadioDot({ selected }: { selected: boolean }) {
  return (
    <View
      className={`h-5 w-5 items-center justify-center rounded-full border-2 ${
        selected ? "border-[#0644C7]" : "border-gray-300 dark:border-neutral-600"
      }`}
    >
      {selected && <View className="h-2.5 w-2.5 rounded-full bg-[#0644C7]" />}
    </View>
  );
}

/** Compact icon action on a photo card. */
function CardAction({
  icon,
  label,
  onPress,
  disabled = false,
  tone = "default",
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "default" | "danger" | "active";
}) {
  const color =
    tone === "danger" ? "#B91C1C" : tone === "active" ? "#15803D" : "#4B5563";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      className={`flex-1 items-center justify-center rounded-lg border py-2 ${
        tone === "active"
          ? "border-green-200 bg-green-50 dark:border-green-900/40 dark:bg-green-900/20"
          : "border-gray-200 dark:border-neutral-700"
      } ${disabled ? "opacity-40" : "active:opacity-70"}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Feather name={icon} size={14} color={color} />
    </Pressable>
  );
}

function LibrarySkeleton() {
  const pulse = usePulse();
  return (
    <View className="-mx-1.5 flex-row flex-wrap">
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} className="w-1/2 p-1.5">
          <View className="overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
            <SkeletonBlock pulse={pulse} className="aspect-square w-full" />
            <View className="gap-2 p-3">
              <SkeletonBlock pulse={pulse} className="h-3 w-2/3" />
              <SkeletonBlock pulse={pulse} className="h-3 w-1/2" />
              <SkeletonBlock pulse={pulse} className="h-7 w-full" />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function PhotoLibraryScreen() {
  const insets = useSafeAreaInsets();

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const activeLocation = useActiveLocation();
  const effectiveLocationId = isCompanyAdmin
    ? activeLocation.id === "all"
      ? null
      : activeLocation.id
    : (user?.location_id ?? null);

  // Deleting is irreversible, so this matches the server rule: managers and admins.
  const canDelete =
    user?.role === "company_admin" ||
    user?.role === "admin" ||
    user?.role === "location_manager";

  const [library, setLibrary] = useState<PhotoLibrary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<"" | PhotoSessionSource>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showDateRange, setShowDateRange] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [toast, showToast] = useTransientAlert<{
    message: string;
    type: ToastType;
  }>(4000);
  const [preview, setPreview] = useState<LibraryPhoto | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<{
    photos: LibraryPhoto[];
    bulk: boolean;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [slideshowBusyId, setSlideshowBusyId] = useState<number | null>(null);
  const [downloading, setDownloading] = useState(false);

  const [sendFor, setSendFor] = useState<LibraryPhoto | null>(null);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<PhotoWaiverMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<number[]>([]);
  const [schedule, setSchedule] = useState<PhotoDeliverySchedule>("immediate");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!effectiveLocationId || !token) return;
    setLoading(true);
    try {
      setLibrary(
        await fetchPhotoLibrary(token, {
          locationId: effectiveLocationId,
          source: source || undefined,
          from: from || undefined,
          to: to || undefined,
        }),
      );
    } catch (e) {
      showToast({
        message: errorMessage(e, "Could not load the photo library."),
        type: "error",
      });
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [effectiveLocationId, from, source, to, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const allPhotos = useMemo(
    () => (library?.days ?? []).flatMap((day) => day.photos),
    [library],
  );

  const toggle = useCallback((photoId: number) => {
    setSelectedIds((prev) =>
      prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : [...prev, photoId],
    );
  }, []);

  const toggleDay = useCallback((photos: LibraryPhoto[]) => {
    const ids = photos.map((p) => p.id);
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.includes(id));
      return allSelected
        ? prev.filter((id) => !ids.includes(id))
        : [...new Set([...prev, ...ids])];
    });
  }, []);

  /** Stream one photo to the cache and hand it to the gallery. */
  const saveToGallery = useCallback(async (photo: LibraryPhoto) => {
    const token = getToken();
    if (!token) throw new Error("Not authenticated.");

    const FileSystem = await import("expo-file-system/legacy");
    const MediaLibrary = await import("expo-media-library");
    const name = `zapzone-${photo.operatingDay ?? "photo"}-${photo.id}.jpg`;
    const { status, uri } = await FileSystem.downloadAsync(
      photoDownloadUrl(photo.id),
      `${FileSystem.cacheDirectory}${name}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "image/jpeg" } },
    );

    if (status !== 200) {
      let message = "That download failed.";
      try {
        const parsed = JSON.parse(await FileSystem.readAsStringAsync(uri));
        if (parsed?.message) message = parsed.message;
      } catch {
        // Non-JSON body — keep the generic message.
      }
      throw new Error(message);
    }

    try {
      await MediaLibrary.saveToLibraryAsync(uri);
    } catch {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (!perm.granted) {
        throw new Error(
          "Allow photo access so photos can be saved to your gallery.",
        );
      }
      await MediaLibrary.saveToLibraryAsync(uri);
    }
  }, []);

  const downloadOne = useCallback(
    async (photo: LibraryPhoto) => {
      if (downloading) return;
      setDownloading(true);
      try {
        await saveToGallery(photo);
        showToast({ message: "Saved to your gallery.", type: "success" });
      } catch (e) {
        showToast({
          message: errorMessage(e, "That download failed."),
          type: "error",
        });
      } finally {
        setDownloading(false);
      }
    },
    [downloading, saveToGallery, showToast],
  );

  const downloadSelected = useCallback(async () => {
    if (selectedIds.length === 0 || downloading) return;
    const photos = allPhotos.filter((p) => selectedIds.includes(p.id));
    setDownloading(true);
    let saved = 0;
    try {
      for (const photo of photos) {
        await saveToGallery(photo);
        saved += 1;
      }
      showToast({
        message: `Saved ${saved} photo${saved === 1 ? "" : "s"} to your gallery.`,
        type: "success",
      });
    } catch (e) {
      showToast({
        message: saved
          ? `Saved ${saved} of ${photos.length}. ${errorMessage(e, "The bulk download failed.")}`
          : errorMessage(e, "The bulk download failed."),
        type: "error",
      });
    } finally {
      setDownloading(false);
    }
  }, [allPhotos, downloading, saveToGallery, selectedIds, showToast]);

  const runDelete = useCallback(async () => {
    const token = getToken();
    if (!confirmDelete || !token) return;
    setDeleting(true);
    try {
      const ids = confirmDelete.photos.map((p) => p.id);
      const message = confirmDelete.bulk
        ? await deleteLibraryPhotos(token, ids)
        : await deleteLibraryPhoto(token, ids[0]);
      showToast({ message, type: "success" });
      setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      setPreview((current) =>
        current && ids.includes(current.id) ? null : current,
      );
      setConfirmDelete(null);
      await load();
    } catch (e) {
      showToast({
        message: errorMessage(e, "That photo could not be deleted."),
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  }, [confirmDelete, load, showToast]);

  const toggleSlideshow = useCallback(
    async (photo: LibraryPhoto) => {
      const token = getToken();
      if (!token || slideshowBusyId !== null) return;
      const include = !(
        photo.slideshowEligible && photo.slideshowState === "visible"
      );
      setSlideshowBusyId(photo.id);
      try {
        const message = await setPhotoOnSlideshow(token, photo.id, include);
        showToast({ message, type: "success" });
        await load();
      } catch (e) {
        showToast({
          message: errorMessage(e, "That change could not be saved."),
          type: "error",
        });
      } finally {
        setSlideshowBusyId(null);
      }
    },
    [load, showToast, slideshowBusyId],
  );

  const runSearch = useCallback(async () => {
    const token = getToken();
    if (query.trim().length < 2 || !token) return;
    setSearching(true);
    try {
      setMatches(
        await searchPhotoWaivers(token, query.trim(), effectiveLocationId),
      );
    } catch (e) {
      showToast({
        message: errorMessage(e, "The waiver search failed."),
        type: "error",
      });
    } finally {
      setSearching(false);
    }
  }, [effectiveLocationId, query, showToast]);

  const send = useCallback(async () => {
    const token = getToken();
    if (!sendFor || chosen.length === 0 || !token || sending) return;
    setSending(true);
    try {
      await sendLibraryPhoto(token, sendFor.id, {
        waiverIds: chosen,
        schedule,
      });
      showToast({
        message: "Sent using the normal waiver message delivery flow.",
        type: "success",
      });
      setSendFor(null);
      setChosen([]);
      setMatches([]);
      setQuery("");
      void load();
    } catch (e) {
      showToast({
        message: errorMessage(e, "That send failed."),
        type: "error",
      });
    } finally {
      setSending(false);
    }
  }, [chosen, load, schedule, sendFor, sending, showToast]);

  const openSend = useCallback((photo: LibraryPhoto) => {
    setSendFor(photo);
    setChosen([]);
    setMatches([]);
    setQuery("");
  }, []);

  const dateLabel =
    from && to
      ? `${formatShortDate(from)} – ${formatShortDate(to)}`
      : "All days";

  const header = (
    <View className="w-full border-b border-gray-100 bg-white px-5 pb-5 pt-12 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={20} color="#111827" />
        </Pressable>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          Photo Library
        </Text>
        <Pressable
          onPress={() => void load()}
          disabled={loading}
          className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
          accessibilityRole="button"
          accessibilityLabel="Refresh"
        >
          {loading ? (
            <ActivityIndicator size="small" color={PRIMARY} />
          ) : (
            <Feather name="refresh-cw" size={18} color="#111827" />
          )}
        </Pressable>
      </View>
    </View>
  );

  if (!effectiveLocationId) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View className="items-center rounded-2xl border border-gray-100 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <Feather name="map-pin" size={34} color="#9CA3AF" />
            <Text className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
              Choose a location first
            </Text>
            <Text className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              {isCompanyAdmin
                ? "Pick a location to see its photos grouped by operating day."
                : "Your account is not assigned to a location yet."}
            </Text>
            {isCompanyAdmin && (
              <View className="mt-5 w-full">
                <LocationWorkspaceSelector />
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {header}

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View className="mt-5 px-5">
          <Text className="mb-5 text-sm text-gray-500 dark:text-gray-400">
            Grouped by operating day. A day runs 6:00 AM to 5:59 AM the next
            morning, in this location&apos;s time zone.
          </Text>

          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {/* Source + operating-day range (the web's two selects and date inputs). */}
          <View className="mb-4 flex-row items-center gap-2">
            <View className="flex-1">
              <SheetSelect
                icon="filter"
                title="Source"
                value={source}
                options={SOURCE_OPTIONS}
                onSelect={(v) => setSource(v as "" | PhotoSessionSource)}
              />
            </View>
            <Pressable
              onPress={() => setShowDateRange(true)}
              className="flex-1 flex-row items-center gap-2 rounded-xl border border-gray-100 bg-white px-4 py-3.5 dark:border-neutral-800 dark:bg-neutral-900"
              accessibilityRole="button"
              accessibilityLabel="Filter by operating day"
            >
              <Feather name="calendar" size={16} color={PRIMARY} />
              <Text
                className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-200"
                numberOfLines={1}
              >
                {dateLabel}
              </Text>
              {from || to ? (
                <Pressable
                  onPress={() => {
                    setFrom("");
                    setTo("");
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Clear the day range"
                >
                  <Feather name="x" size={14} color="#9CA3AF" />
                </Pressable>
              ) : (
                <Feather name="chevron-down" size={16} color="#9CA3AF" />
              )}
            </Pressable>
          </View>

          {selectedIds.length > 0 && (
            <View className="mb-4 rounded-xl border border-gray-100 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
              <View className="flex-row items-center justify-between">
                <Text className="text-sm text-gray-800 dark:text-gray-200">
                  {selectedIds.length} selected
                </Text>
                <Pressable
                  onPress={() => setSelectedIds([])}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text className="text-sm text-gray-500 underline dark:text-gray-400">
                    Clear
                  </Text>
                </Pressable>
              </View>
              <View className="mt-3 flex-row gap-2">
                <Pressable
                  onPress={() => void downloadSelected()}
                  disabled={downloading}
                  className={`flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-[#0644C7] py-2.5 active:opacity-90 ${
                    downloading ? "opacity-60" : ""
                  }`}
                  accessibilityRole="button"
                >
                  {downloading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Feather name="download" size={14} color="#FFFFFF" />
                  )}
                  <Text className="text-xs font-semibold text-white">
                    Download selected
                  </Text>
                </Pressable>
                {canDelete && (
                  <Pressable
                    onPress={() =>
                      setConfirmDelete({
                        photos: allPhotos.filter((p) =>
                          selectedIds.includes(p.id),
                        ),
                        bulk: true,
                      })
                    }
                    className="flex-1 flex-row items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 active:opacity-90"
                    accessibilityRole="button"
                  >
                    <Feather name="trash-2" size={14} color="#FFFFFF" />
                    <Text className="text-xs font-semibold text-white">
                      Delete selected
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}

          {library?.truncated && (
            <View className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/20">
              <Text className="text-sm text-amber-800 dark:text-amber-300">
                Showing the most recent 1,500 photos. Narrow the date range to
                see older days.
              </Text>
            </View>
          )}

          {!loaded && loading && <LibrarySkeleton />}

          {loaded && allPhotos.length === 0 && (
            <View className="items-center rounded-2xl border border-gray-100 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
              <Feather name="image" size={34} color="#D1D5DB" />
              <Text className="mt-3 font-bold text-gray-900 dark:text-white">
                No photos in this range
              </Text>
              <Text className="mt-1 text-center text-sm text-gray-500 dark:text-gray-400">
                Photos appear here once a staff session or kiosk capture
                finishes processing. Retaken and abandoned captures are
                discarded and never stored.
              </Text>
            </View>
          )}

          {(library?.days ?? []).map((day) => (
            <View key={day.operatingDay} className="mb-6">
              <View className="mb-2 flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Feather name="calendar" size={14} color="#6B7280" />
                    <Text className="font-bold text-gray-900 dark:text-white">
                      {day.label}
                    </Text>
                  </View>
                  <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {day.photoCount} photo{day.photoCount === 1 ? "" : "s"} ·{" "}
                    {day.staffCount} staff · {day.kioskCount} kiosk
                  </Text>
                </View>
                <Pressable
                  onPress={() => toggleDay(day.photos)}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-semibold text-[#0644C7] underline">
                    Select this day
                  </Text>
                </Pressable>
              </View>

              <View className="-mx-1.5 flex-row flex-wrap">
                {day.photos.map((photo) => {
                  const onSlideshow =
                    photo.slideshowEligible &&
                    photo.slideshowState === "visible";
                  const linkActive = photo.session.accessStatus === "active";
                  return (
                    <View key={photo.id} className="w-1/2 p-1.5">
                      <View className="overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                        <Pressable
                          onPress={() => setPreview(photo)}
                          className="aspect-square w-full bg-gray-100 dark:bg-neutral-800"
                          accessibilityRole="button"
                          accessibilityLabel={`Photo ${photo.id}`}
                        >
                          {photo.thumbnailUrl ? (
                            <Image
                              source={{ uri: photo.thumbnailUrl }}
                              style={{ width: "100%", height: "100%" }}
                              contentFit="cover"
                            />
                          ) : (
                            <View className="h-full items-center justify-center">
                              <Text className="text-xs text-gray-400">
                                No preview
                              </Text>
                            </View>
                          )}
                          <Pressable
                            onPress={() => toggle(photo.id)}
                            hitSlop={8}
                            className="absolute left-2 top-2 rounded bg-white/90 p-1 dark:bg-neutral-900/90"
                            accessibilityRole="checkbox"
                            accessibilityLabel={`Select photo ${photo.id}`}
                            accessibilityState={{
                              checked: selectedIds.includes(photo.id),
                            }}
                          >
                            <CheckBox checked={selectedIds.includes(photo.id)} />
                          </Pressable>
                        </Pressable>

                        <View className="gap-2 p-3">
                          <View className="flex-row flex-wrap gap-1">
                            <Chip
                              label={
                                photo.session.source ?? photo.source ?? "staff"
                              }
                              tone="gray"
                              capitalize
                            />
                            {photo.slideshowEligible ? (
                              <Chip
                                label={`slideshow ${photo.slideshowState}`}
                                tone={onSlideshow ? "green" : "gray"}
                              />
                            ) : (
                              <Chip label="not on slideshow" tone="muted" />
                            )}
                            <Chip
                              label={`link ${photo.session.accessStatus ?? "unknown"}`}
                              tone={linkActive ? "blue" : "amber"}
                            />
                          </View>

                          <Text className="text-[10px] text-gray-500 dark:text-gray-400">
                            {photo.captureDate}
                            {photo.downloadCount > 0
                              ? ` · ${photo.downloadCount} download(s)`
                              : ""}
                          </Text>

                          <View className="flex-row gap-1">
                            <CardAction
                              icon="download"
                              label="Save"
                              onPress={() => void downloadOne(photo)}
                              disabled={downloading}
                            />
                            <CardAction
                              icon="send"
                              label="Send"
                              onPress={() => openSend(photo)}
                              disabled={!linkActive}
                            />
                            <CardAction
                              icon={onSlideshow ? "eye-off" : "monitor"}
                              label={
                                onSlideshow
                                  ? `Take photo ${photo.id} off the slideshow`
                                  : `Show photo ${photo.id} on the slideshow`
                              }
                              onPress={() => void toggleSlideshow(photo)}
                              disabled={slideshowBusyId === photo.id}
                              tone={onSlideshow ? "active" : "default"}
                            />
                            {canDelete && (
                              <CardAction
                                icon="trash-2"
                                label={`Delete photo ${photo.id}`}
                                onPress={() =>
                                  setConfirmDelete({
                                    photos: [photo],
                                    bulk: false,
                                  })
                                }
                                tone="danger"
                              />
                            )}
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Full-size preview */}
      <CenterModal visible={!!preview} onClose={() => setPreview(null)}>
        <View className="rounded-3xl bg-white p-4 dark:bg-neutral-900">
          <View className="mb-3 flex-row justify-end">
            <Pressable
              onPress={() => setPreview(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close preview"
            >
              <Feather name="x" size={20} color="#9CA3AF" />
            </Pressable>
          </View>
          {preview?.deliveryUrl ? (
            <Image
              source={{ uri: preview.deliveryUrl }}
              style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: 12 }}
              contentFit="contain"
            />
          ) : null}
          <View className="mt-4 gap-2">
            <Pressable
              onPress={() => preview && void downloadOne(preview)}
              disabled={downloading}
              className={`flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] py-3 active:opacity-90 ${
                downloading ? "opacity-60" : ""
              }`}
              accessibilityRole="button"
            >
              {downloading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="download" size={16} color="#FFFFFF" />
              )}
              <Text className="text-sm font-semibold text-white">Download</Text>
            </Pressable>
            {preview?.session.photoLink ? (
              <Pressable
                onPress={() =>
                  void WebBrowser.openBrowserAsync(preview.session.photoLink!)
                }
                className="items-center py-2"
                accessibilityRole="button"
              >
                <Text className="text-sm text-gray-600 underline dark:text-gray-300">
                  Open the customer page
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </CenterModal>

      {/* Delete confirmation */}
      <CenterModal
        visible={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        dismissable={!deleting}
      >
        <View className="rounded-3xl bg-white p-6 dark:bg-neutral-900">
          <View className="mb-4 flex-row items-start gap-3">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <Feather name="alert-triangle" size={18} color="#B91C1C" />
            </View>
            <View className="flex-1">
              <Text className="font-bold text-gray-900 dark:text-white">
                Delete {confirmDelete?.photos.length} photo
                {confirmDelete?.photos.length === 1 ? "" : "s"}?
              </Text>
              <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                This cannot be undone.
              </Text>
            </View>
          </View>

          <View className="mb-5 gap-1.5">
            {[
              "The image file is deleted from storage for good.",
              `Any customer link already sent will stop showing ${
                confirmDelete?.photos.length === 1 ? "it" : "them"
              }, and downloads will no longer work.`,
              confirmDelete?.photos.some((p) => p.slideshowEligible)
                ? "It also comes off the venue slideshow straight away."
                : "Nothing here is currently on the venue slideshow.",
              "The delivery record and activity log are kept, so the history stays intact.",
            ].map((line) => (
              <Text
                key={line}
                className="text-sm text-gray-700 dark:text-gray-300"
              >
                • {line}
              </Text>
            ))}
          </View>

          {(confirmDelete?.photos.length ?? 0) > 1 && (
            <View className="mb-5 flex-row flex-wrap items-center gap-2">
              {confirmDelete?.photos.slice(0, 8).map((photo) => (
                <Image
                  key={photo.id}
                  source={{ uri: photo.thumbnailUrl ?? "" }}
                  style={{ height: 48, width: 48, borderRadius: 6 }}
                  contentFit="cover"
                />
              ))}
              {(confirmDelete?.photos.length ?? 0) > 8 && (
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  +{(confirmDelete?.photos.length ?? 0) - 8} more
                </Text>
              )}
            </View>
          )}

          <View className="flex-row gap-3">
            <Pressable
              onPress={() => setConfirmDelete(null)}
              disabled={deleting}
              className="flex-1 items-center rounded-xl border border-gray-200 py-3 active:opacity-70 dark:border-neutral-700"
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                Keep {confirmDelete?.photos.length === 1 ? "it" : "them"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void runDelete()}
              disabled={deleting}
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-red-600 py-3 active:opacity-80"
              accessibilityRole="button"
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Feather name="trash-2" size={14} color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">
                    Delete {confirmDelete?.photos.length === 1 ? "photo" : "photos"}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </CenterModal>

      {/* Send this photo again */}
      <BottomSheet
        visible={!!sendFor}
        onClose={() => setSendFor(null)}
        title="Send this photo again"
      >
        <ScrollView
          className="px-5"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            This uses the normal waiver message delivery flow, and the action is
            recorded in the activity log.
          </Text>

          <View className="mb-4 flex-row items-center gap-2">
            <View className="h-12 flex-1 flex-row items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900">
              <Feather name="search" size={16} color="#9CA3AF" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={() => void runSearch()}
                returnKeyType="search"
                placeholder="Name, phone or email"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                className="flex-1 text-sm text-gray-900 dark:text-white"
                style={{ paddingVertical: 0 }}
              />
            </View>
            <Pressable
              onPress={() => void runSearch()}
              disabled={query.trim().length < 2 || searching}
              className={`h-12 items-center justify-center rounded-lg bg-[#0644C7] px-5 active:opacity-90 ${
                query.trim().length < 2 || searching ? "opacity-60" : ""
              }`}
              accessibilityRole="button"
            >
              {searching ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-sm font-semibold text-white">Search</Text>
              )}
            </Pressable>
          </View>

          {matches.map((waiver) => {
            const checked = chosen.includes(waiver.id);
            return (
              <Pressable
                key={waiver.id}
                onPress={() =>
                  waiver.contactable &&
                  setChosen((prev) =>
                    prev.includes(waiver.id)
                      ? prev.filter((id) => id !== waiver.id)
                      : [...prev, waiver.id],
                  )
                }
                disabled={!waiver.contactable}
                className={`mb-2 flex-row items-start gap-3 rounded-xl border p-3 ${
                  waiver.contactable
                    ? checked
                      ? "border-[#0644C7] bg-blue-50/60 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-neutral-700"
                    : "border-gray-200 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-800/40"
                }`}
                accessibilityRole="checkbox"
                accessibilityState={{
                  checked,
                  disabled: !waiver.contactable,
                }}
              >
                <View className="mt-0.5">
                  <CheckBox checked={checked} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-900 dark:text-white">
                    {waiver.name}
                  </Text>
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {waiver.emailMasked || "no email"} ·{" "}
                    {waiver.phoneMasked || "no phone"}
                  </Text>
                  {!waiver.contactable && (
                    <Text className="text-[11px] text-amber-800 dark:text-amber-400">
                      no contact method on this waiver
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}

          <View className="mb-5 mt-2">
            <Pressable
              onPress={() => setSchedule("immediate")}
              className="flex-row items-center gap-3 py-2"
              accessibilityRole="radio"
              accessibilityState={{ selected: schedule === "immediate" }}
            >
              <RadioDot selected={schedule === "immediate"} />
              <Text className="text-sm text-gray-800 dark:text-gray-200">
                Send immediately
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setSchedule("next_day_9am")}
              className="flex-row items-center gap-3 py-2"
              accessibilityRole="radio"
              accessibilityState={{ selected: schedule === "next_day_9am" }}
            >
              <RadioDot selected={schedule === "next_day_9am"} />
              <Text className="text-sm text-gray-800 dark:text-gray-200">
                9:00 AM tomorrow, location time
              </Text>
            </Pressable>
          </View>

          <View className="mb-8">
            <PrimaryButton
              label={`Send to ${chosen.length} waiver${chosen.length === 1 ? "" : "s"}`}
              onPress={() => void send()}
              loading={sending}
              disabled={chosen.length === 0}
            />
          </View>
        </ScrollView>
      </BottomSheet>

      <DateRangeSheet
        visible={showDateRange}
        initialStart={from}
        initialEnd={to}
        onClose={() => setShowDateRange(false)}
        onApply={(start, end) => {
          setFrom(start);
          setTo(end);
          setShowDateRange(false);
        }}
      />

      {!!toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => showToast(null)}
        />
      )}
    </View>
  );
}
