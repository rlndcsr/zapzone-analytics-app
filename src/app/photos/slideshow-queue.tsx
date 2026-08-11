import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { Toast, type ToastType } from "../../components/ui/Toast";
import {
  SkeletonBlock,
  usePulse,
} from "../../components/ui/skeleton/SkeletonBlock";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchSlideshowQueues,
  reorderSlideshowQueue,
  setSlideshowQueuePaused,
  updateSlideshowPhotoState,
  type SlideshowQueuePhoto,
  type SlideshowQueues,
} from "../../services/photosService";

const PRIMARY = "#0644C7";

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

/** Card label above each summary block. */
function CardLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1 text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
      {children}
    </Text>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="mb-3 rounded-2xl border border-gray-100 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      {children}
    </View>
  );
}

/** Small bordered action on a queue row. */
function RowAction({
  icon,
  label,
  onPress,
  disabled = false,
  danger = false,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      className={`flex-1 flex-row items-center justify-center gap-1 rounded-lg border py-2 ${
        danger
          ? "border-red-200 dark:border-red-900/40"
          : "border-gray-200 dark:border-neutral-700"
      } ${disabled ? "opacity-40" : "active:opacity-70"}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Feather name={icon} size={13} color={danger ? "#B91C1C" : "#4B5563"} />
      <Text
        className={`text-xs font-medium ${
          danger
            ? "text-red-700 dark:text-red-400"
            : "text-gray-700 dark:text-gray-300"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function QueueSkeleton() {
  const pulse = usePulse();
  return (
    <View className="gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <View
          key={i}
          className="gap-2 rounded-2xl border border-gray-100 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <SkeletonBlock pulse={pulse} className="h-3 w-24" />
          <SkeletonBlock pulse={pulse} className="h-5 w-40" />
          <SkeletonBlock pulse={pulse} className="h-3 w-32" />
        </View>
      ))}
    </View>
  );
}

export default function SlideshowQueueScreen() {
  const insets = useSafeAreaInsets();

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const activeLocation = useActiveLocation();
  const effectiveLocationId = isCompanyAdmin
    ? activeLocation.id === "all"
      ? null
      : activeLocation.id
    : (user?.location_id ?? null);

  const [data, setData] = useState<SlideshowQueues | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [toast, showToast] = useTransientAlert<{
    message: string;
    type: ToastType;
  }>(4000);

  const load = useCallback(async () => {
    const token = getToken();
    if (!effectiveLocationId || !token) return;
    setLoading(true);
    try {
      setData(await fetchSlideshowQueues(token, effectiveLocationId));
    } catch (e) {
      showToast({
        message: errorMessage(e, "Could not load the slideshow queue."),
        type: "error",
      });
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [effectiveLocationId, showToast]);

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

  const setState = useCallback(
    async (photoId: number, slideshowState: "visible" | "hidden" | "removed") => {
      const token = getToken();
      if (!token || busy) return;
      setBusy(true);
      try {
        await updateSlideshowPhotoState(token, photoId, slideshowState);
        await load();
      } catch (e) {
        showToast({
          message: errorMessage(e, "That change could not be saved."),
          type: "error",
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, load, showToast],
  );

  const move = useCallback(
    async (photoId: number, direction: -1 | 1) => {
      const token = getToken();
      if (!data || !token || busy) return;
      const ids = data.active.photos.map((p) => p.id);
      const from = ids.indexOf(photoId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= ids.length) return;
      const next = [...ids];
      [next[from], next[to]] = [next[to], next[from]];
      setBusy(true);
      try {
        await reorderSlideshowQueue(token, data.active.id, next);
        await load();
      } catch (e) {
        showToast({
          message: errorMessage(e, "Could not reorder the queue."),
          type: "error",
        });
      } finally {
        setBusy(false);
      }
    },
    [busy, data, load, showToast],
  );

  const togglePause = useCallback(async () => {
    const token = getToken();
    if (!data || !token || busy) return;
    setBusy(true);
    try {
      await setSlideshowQueuePaused(token, data.active.id, !data.active.isPaused);
      await load();
    } catch (e) {
      showToast({
        message: errorMessage(e, "Could not change the slideshow."),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }, [busy, data, load, showToast]);

  const copy = useCallback(
    async (value: string, label: string) => {
      try {
        await Clipboard.setStringAsync(value);
        showToast({ message: `${label} copied.`, type: "success" });
      } catch {
        showToast({
          message: "Copying is not available on this device.",
          type: "info",
        });
      }
    },
    [showToast],
  );

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
          Slideshow Queue
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
                ? "Each location runs its own slideshow queue and display passcode."
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
            Kiosk photos join today&apos;s queue the moment the customer accepts
            them. The queue closes at {data?.cutoffHour ?? 6}:00 AM location time
            and a fresh one opens.
          </Text>

          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          {!loaded && loading && <QueueSkeleton />}

          {data && (
            <>
              <Card>
                <CardLabel>Active queue</CardLabel>
                <Text className="text-lg font-bold text-gray-900 dark:text-white">
                  {data.active.label}
                </Text>
                <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {data.active.visiblePhotos} showing of {data.active.totalPhotos}{" "}
                  stored
                </Text>
                {data.active.closesAt && (
                  <View className="mt-2 flex-row items-center gap-1">
                    <Feather name="clock" size={13} color="#9CA3AF" />
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      Closes {new Date(data.active.closesAt).toLocaleString()}
                    </Text>
                  </View>
                )}
                <Pressable
                  onPress={() => void togglePause()}
                  disabled={busy}
                  className={`mt-4 h-11 flex-row items-center justify-center gap-2 rounded-full ${
                    data.active.isPaused
                      ? "bg-[#0644C7]"
                      : "border border-gray-200 dark:border-neutral-700"
                  } ${busy ? "opacity-60" : "active:opacity-80"}`}
                  accessibilityRole="button"
                >
                  <Feather
                    name={data.active.isPaused ? "play" : "pause"}
                    size={15}
                    color={data.active.isPaused ? "#FFFFFF" : "#374151"}
                  />
                  <Text
                    className={`text-sm font-semibold ${
                      data.active.isPaused
                        ? "text-white"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    {data.active.isPaused
                      ? "Resume slideshow"
                      : "Pause slideshow"}
                  </Text>
                </Pressable>
              </Card>

              <Card>
                <CardLabel>Display</CardLabel>
                <View className="flex-row items-center gap-1.5">
                  <Feather
                    name={data.settings.displayOnline ? "wifi" : "wifi-off"}
                    size={15}
                    color={data.settings.displayOnline ? "#15803D" : "#B45309"}
                  />
                  <Text
                    className={`text-sm font-medium ${
                      data.settings.displayOnline
                        ? "text-green-700 dark:text-green-400"
                        : "text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {data.settings.displayOnline
                      ? "Reporting in"
                      : "Not reporting"}
                  </Text>
                </View>
                <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {data.settings.lastSeenAt
                    ? `Last seen ${new Date(data.settings.lastSeenAt).toLocaleString()}`
                    : "No display has opened this slideshow yet."}
                </Text>
                <Text className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Each photo shows for {data.settings.slideshowDurationSeconds}{" "}
                  seconds.
                </Text>
                {!data.settings.slideshowEnabled && (
                  <Text className="mt-2 text-sm text-amber-800 dark:text-amber-400">
                    The slideshow is turned off in photo settings.
                  </Text>
                )}
              </Card>

              <Card>
                <CardLabel>Display URL and passcode</CardLabel>
                <View className="flex-row items-center gap-2">
                  <View className="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
                    <Text
                      className="text-[11px] text-gray-700 dark:text-gray-300"
                      numberOfLines={1}
                    >
                      {data.settings.slideshowUrl}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      void copy(data.settings.slideshowUrl, "Slideshow URL")
                    }
                    hitSlop={8}
                    className="rounded p-1.5"
                    accessibilityRole="button"
                    accessibilityLabel="Copy slideshow URL"
                  >
                    <Feather name="copy" size={16} color="#4B5563" />
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      void WebBrowser.openBrowserAsync(
                        data.settings.slideshowUrl,
                      )
                    }
                    hitSlop={8}
                    className="rounded p-1.5"
                    accessibilityRole="button"
                    accessibilityLabel="Open slideshow"
                  >
                    <Feather name="external-link" size={16} color="#4B5563" />
                  </Pressable>
                </View>

                <View className="mt-2 flex-row items-center gap-2">
                  <View className="flex-1 rounded border border-gray-200 bg-gray-50 px-2 py-1.5 dark:border-neutral-700 dark:bg-neutral-800">
                    <Text className="text-sm tracking-[4px] text-gray-900 dark:text-white">
                      {data.settings.slideshowPasscode}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      void copy(data.settings.slideshowPasscode, "Passcode")
                    }
                    hitSlop={8}
                    className="rounded p-1.5"
                    accessibilityRole="button"
                    accessibilityLabel="Copy passcode"
                  >
                    <Feather name="copy" size={16} color="#4B5563" />
                  </Pressable>
                </View>

                <Text className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  The URL and passcode grant picture playback only. They never
                  open customers, waivers, reports or settings.
                </Text>
              </Card>

              <View className="mb-3 overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                <View className="border-b border-gray-100 px-5 py-4 dark:border-neutral-800">
                  <Text className="font-bold text-gray-900 dark:text-white">
                    Photos in today&apos;s rotation
                  </Text>
                </View>

                {data.active.photos.length === 0 ? (
                  <Text className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    Nothing in the queue yet. Kiosk photos land here as soon as a
                    customer accepts one with the slideshow box ticked.
                  </Text>
                ) : (
                  data.active.photos.map((photo, i) => (
                    <QueueRow
                      key={photo.id}
                      photo={photo}
                      index={i}
                      isLast={i === data.active.photos.length - 1}
                      busy={busy}
                      onMove={move}
                      onSetState={setState}
                    />
                  ))
                )}
              </View>

              <View className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                <Pressable
                  onPress={() => setShowPast((v) => !v)}
                  className="flex-row items-center justify-between px-5 py-4 active:opacity-70"
                  accessibilityRole="button"
                >
                  <Text className="font-bold text-gray-900 dark:text-white">
                    Past slideshows ({data.past.length})
                  </Text>
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    {showPast ? "Hide" : "Show"}
                  </Text>
                </Pressable>

                {showPast && (
                  <View>
                    {data.past.length === 0 && (
                      <Text className="px-5 py-6 text-sm text-gray-500 dark:text-gray-400">
                        No closed queues yet.
                      </Text>
                    )}
                    {data.past.map((queue) => (
                      <View
                        key={queue.id}
                        className="border-t border-gray-100 px-5 py-3 dark:border-neutral-800"
                      >
                        <Text className="text-sm text-gray-900 dark:text-white">
                          {queue.label}
                        </Text>
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {queue.visiblePhotos} showing of {queue.totalPhotos}{" "}
                          stored · {queue.status === "closed" ? "closed" : "active"}
                          {queue.closedAt
                            ? ` ${new Date(queue.closedAt).toLocaleString()}`
                            : ""}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>

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

/** One photo in the active rotation: position, thumbnail, state and actions. */
function QueueRow({
  photo,
  index,
  isLast,
  busy,
  onMove,
  onSetState,
}: {
  photo: SlideshowQueuePhoto;
  index: number;
  isLast: boolean;
  busy: boolean;
  onMove: (photoId: number, direction: -1 | 1) => void;
  onSetState: (
    photoId: number,
    state: "visible" | "hidden" | "removed",
  ) => void;
}) {
  const visible = photo.slideshowState === "visible";

  return (
    <View
      className={`px-5 py-3 ${index > 0 ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
    >
      <View className="flex-row items-center gap-3">
        <Text className="w-5 text-sm text-gray-400">{index + 1}</Text>
        {photo.thumbnailUrl ? (
          <Image
            source={{ uri: photo.thumbnailUrl }}
            style={{ height: 56, width: 56, borderRadius: 8 }}
            contentFit="cover"
          />
        ) : (
          <View className="h-14 w-14 rounded-lg bg-gray-100 dark:bg-neutral-800" />
        )}
        <View className="flex-1">
          <Text className="text-sm text-gray-900 dark:text-white">
            {photo.capturedAt
              ? new Date(photo.capturedAt).toLocaleTimeString()
              : "—"}
          </Text>
          <Text className="text-xs capitalize text-gray-500 dark:text-gray-400">
            {photo.sessionSource ?? photo.source} ·{" "}
            {photo.slideshowEligible ? photo.slideshowState : "not eligible"}
          </Text>
        </View>
        <View className="flex-row items-center">
          <Pressable
            onPress={() => onMove(photo.id, -1)}
            disabled={index === 0 || busy}
            hitSlop={6}
            className={`rounded p-1.5 ${index === 0 || busy ? "opacity-30" : "active:opacity-70"}`}
            accessibilityRole="button"
            accessibilityLabel="Move up"
          >
            <Feather name="arrow-up" size={16} color="#4B5563" />
          </Pressable>
          <Pressable
            onPress={() => onMove(photo.id, 1)}
            disabled={isLast || busy}
            hitSlop={6}
            className={`rounded p-1.5 ${isLast || busy ? "opacity-30" : "active:opacity-70"}`}
            accessibilityRole="button"
            accessibilityLabel="Move down"
          >
            <Feather name="arrow-down" size={16} color="#4B5563" />
          </Pressable>
        </View>
      </View>

      <View className="mt-2 flex-row gap-2 pl-8">
        {visible ? (
          <RowAction
            icon="eye-off"
            label="Hide"
            onPress={() => onSetState(photo.id, "hidden")}
            disabled={busy}
          />
        ) : (
          <RowAction
            icon="eye"
            label="Restore"
            onPress={() => onSetState(photo.id, "visible")}
            disabled={busy}
          />
        )}
        <RowAction
          icon="trash-2"
          label="Remove"
          onPress={() => onSetState(photo.id, "removed")}
          disabled={busy}
          danger
        />
      </View>
    </View>
  );
}
