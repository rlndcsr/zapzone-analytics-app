import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Pattern, Rect } from "react-native-svg";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { ConfirmationModal } from "../../components/ui/ConfirmationModal";
import { DatePickerSheet } from "../../components/ui/DatePickerSheet";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import {
  CONTROL_RADIUS,
  PrimaryButton,
} from "../../components/ui/PrimaryButton";
import { TimePickerSheet } from "../../components/ui/TimePickerSheet";
import { Toast, type ToastType } from "../../components/ui/Toast";
import {
  SkeletonBlock,
  usePulse,
} from "../../components/ui/skeleton/SkeletonBlock";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  createPhotoOverlay,
  deletePhotoOverlay,
  fetchPhotoOverlays,
  setPhotoOverlayEnabled,
  type PhotoOverlay,
  type PhotoOverlayStatus,
  type PhotoOverlays,
} from "../../services/photosService";

const PRIMARY = "#0644C7";

/** Earliest selectable schedule day — the web's datetime-local has no floor. */
const MIN_SCHEDULE_DATE = "2020-01-01";

const STATUS_STYLES: Record<
  PhotoOverlayStatus,
  { wrap: string; text: string }
> = {
  active: {
    wrap: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-800 dark:text-green-300",
  },
  scheduled: {
    wrap: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-800 dark:text-blue-300",
  },
  expired: {
    wrap: "bg-gray-200 dark:bg-neutral-700",
    text: "text-gray-700 dark:text-gray-200",
  },
  disabled: {
    wrap: "bg-gray-100 dark:bg-neutral-800",
    text: "text-gray-500 dark:text-gray-400",
  },
};

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

/** "2026-08-12" + "14:30" → the value a datetime-local input would submit. */
const composeDateTime = (date: string, time: string): string =>
  date ? `${date}T${time || "00:00"}` : "";

const prettyDateTime = (iso: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
};

/** Transparency grid behind an overlay preview (the web's 16px checkerboard). */
function Checkerboard({ id }: { id: string }) {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      <Defs>
        <Pattern
          id={id}
          width={16}
          height={16}
          patternUnits="userSpaceOnUse"
        >
          <Rect width={16} height={16} fill="#FFFFFF" />
          <Rect width={8} height={8} fill="#F3F4F6" />
          <Rect x={8} y={8} width={8} height={8} fill="#F3F4F6" />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

function OverlaySkeleton() {
  const pulse = usePulse();
  return (
    <View className="gap-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <View
          key={i}
          className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        >
          <SkeletonBlock pulse={pulse} className="h-40 w-full" />
          <View className="gap-2 p-4">
            <SkeletonBlock pulse={pulse} className="h-4 w-1/2" />
            <SkeletonBlock pulse={pulse} className="h-3 w-1/3" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** Date + time pair standing in for one datetime-local input. */
function ScheduleField({
  label,
  date,
  time,
  onPickDate,
  onPickTime,
  onClear,
}: {
  label: string;
  date: string;
  time: string;
  onPickDate: () => void;
  onPickTime: () => void;
  onClear: () => void;
}) {
  return (
    <View>
      <Text className="mb-1 text-sm text-gray-700 dark:text-gray-200">
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onPickDate}
          className="flex-1 flex-row items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900"
          accessibilityRole="button"
          accessibilityLabel={`${label} date`}
        >
          <Feather name="calendar" size={14} color={PRIMARY} />
          <Text
            className={`flex-1 text-sm ${date ? "text-gray-900 dark:text-white" : "text-gray-400"}`}
            numberOfLines={1}
          >
            {date || "Date"}
          </Text>
        </Pressable>
        <Pressable
          onPress={onPickTime}
          disabled={!date}
          className={`w-28 flex-row items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900 ${
            date ? "" : "opacity-40"
          }`}
          accessibilityRole="button"
          accessibilityLabel={`${label} time`}
        >
          <Feather name="clock" size={14} color={PRIMARY} />
          <Text className="text-sm text-gray-900 dark:text-white">
            {time || "00:00"}
          </Text>
        </Pressable>
        {date ? (
          <Pressable
            onPress={onClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
          >
            <Feather name="x" size={16} color="#9CA3AF" />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default function PhotoOverlaysScreen() {
  const insets = useSafeAreaInsets();

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const activeLocation = useActiveLocation();
  const effectiveLocationId = isCompanyAdmin
    ? activeLocation.id === "all"
      ? null
      : activeLocation.id
    : (user?.location_id ?? null);

  // Overlay routes are company_admin / admin / location_manager only.
  const canManage =
    user?.role === "company_admin" ||
    user?.role === "admin" ||
    user?.role === "location_manager";

  const [data, setData] = useState<PhotoOverlays | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useTransientAlert<{
    message: string;
    type: ToastType;
  }>(4000);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<{
    uri: string;
    name?: string;
    type?: string;
  } | null>(null);
  const [startsDate, setStartsDate] = useState("");
  const [startsTime, setStartsTime] = useState("");
  const [endsDate, setEndsDate] = useState("");
  const [endsTime, setEndsTime] = useState("");
  const [priority, setPriority] = useState("0");
  const [picker, setPicker] = useState<
    null | "starts-date" | "starts-time" | "ends-date" | "ends-time"
  >(null);
  const [confirmDelete, setConfirmDelete] = useState<PhotoOverlay | null>(null);

  const load = useCallback(async () => {
    const token = getToken();
    if (!effectiveLocationId || !token || !canManage) return;
    setLoading(true);
    try {
      setData(await fetchPhotoOverlays(token, effectiveLocationId));
    } catch (e) {
      showToast({
        message: errorMessage(e, "Could not load the overlays."),
        type: "error",
      });
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [canManage, effectiveLocationId, showToast]);

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

  const resetForm = useCallback(() => {
    setName("");
    setFile(null);
    setStartsDate("");
    setStartsTime("");
    setEndsDate("");
    setEndsTime("");
    setPriority("0");
  }, []);

  const pickImage = useCallback(async () => {
    // A document pick keeps the original bytes; re-encoding would flatten the
    // transparency an overlay depends on.
    const result = await DocumentPicker.getDocumentAsync({
      type: ["image/png", "image/jpeg", "image/webp"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    const asset = result.assets?.[0];
    if (!asset?.uri) return;
    setFile({
      uri: asset.uri,
      name: asset.name ?? "overlay.png",
      type: asset.mimeType ?? "image/png",
    });
  }, []);

  const create = useCallback(async () => {
    const token = getToken();
    if (!effectiveLocationId || !file || name.trim().length === 0 || !token)
      return;
    if (busy) return;
    setBusy(true);
    try {
      await createPhotoOverlay(token, {
        locationId: effectiveLocationId,
        name: name.trim(),
        file,
        startsAt: composeDateTime(startsDate, startsTime) || undefined,
        endsAt: composeDateTime(endsDate, endsTime) || undefined,
        priority: Number(priority) || 0,
      });
      showToast({ message: "Overlay uploaded.", type: "success" });
      setShowForm(false);
      resetForm();
      await load();
    } catch (e) {
      showToast({
        message: errorMessage(e, "That overlay could not be saved."),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    effectiveLocationId,
    endsDate,
    endsTime,
    file,
    load,
    name,
    priority,
    resetForm,
    showToast,
    startsDate,
    startsTime,
  ]);

  const toggleEnabled = useCallback(
    async (overlay: PhotoOverlay) => {
      const token = getToken();
      if (!token || busy) return;
      setBusy(true);
      try {
        await setPhotoOverlayEnabled(token, overlay.id, !overlay.isEnabled);
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

  const remove = useCallback(async () => {
    const token = getToken();
    if (!confirmDelete || !token || busy) return;
    setBusy(true);
    try {
      await deletePhotoOverlay(token, confirmDelete.id);
      showToast({
        message:
          "Overlay deleted. New photos use the date layer only unless another overlay is active.",
        type: "info",
      });
      setConfirmDelete(null);
      await load();
    } catch (e) {
      showToast({
        message: errorMessage(e, "That overlay could not be deleted."),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }, [busy, confirmDelete, load, showToast]);

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
          Overlays
        </Text>
        <Pressable
          onPress={() => void load()}
          disabled={loading || !canManage}
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

  if (!canManage) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <View className="items-center rounded-2xl border border-gray-100 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <Feather name="lock" size={34} color="#9CA3AF" />
            <Text className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
              Overlays are managed by a manager
            </Text>
            <Text className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              Your role does not have access to this photo setting. Please ask a
              manager if you need it changed.
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

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
                ? "Overlays are stored per location."
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
          {!!data?.dateLayerNote && (
            <Text className="mb-5 text-sm text-gray-500 dark:text-gray-400">
              {data.dateLayerNote}
            </Text>
          )}

          <View className="mb-4">
            <LocationWorkspaceSelector />
          </View>

          <Pressable
            onPress={() => setShowForm(true)}
            className="mb-4 h-12 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] active:opacity-90"
            accessibilityRole="button"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              Upload overlay
            </Text>
          </Pressable>

          {(data?.conflicts.length ?? 0) > 0 && (
            <View className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/20">
              <View className="flex-row items-center gap-2">
                <Feather name="alert-triangle" size={14} color="#B45309" />
                <Text className="font-medium text-amber-900 dark:text-amber-300">
                  Overlapping schedules
                </Text>
              </View>
              {data?.conflicts.map((conflict, i) => (
                <Text
                  key={`${conflict.overlayId}-${conflict.conflictsWithId}-${i}`}
                  className="mt-2 text-sm text-amber-900 dark:text-amber-300"
                >
                  &ldquo;{conflict.overlayName}&rdquo; overlaps &ldquo;
                  {conflict.conflictsWithName}&rdquo; — the higher priority one
                  is used for new photos.
                </Text>
              ))}
            </View>
          )}

          {!loaded && loading && <OverlaySkeleton />}

          {loaded && (data?.overlays.length ?? 0) === 0 && (
            <View className="items-center rounded-2xl border border-gray-100 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
              <Feather name="layers" size={34} color="#D1D5DB" />
              <Text className="mt-3 font-bold text-gray-900 dark:text-white">
                No overlays yet
              </Text>
              <Text className="mt-1 text-center text-sm text-gray-500 dark:text-gray-400">
                Photos still work — they get the capture date layer only until
                you upload an overlay.
              </Text>
            </View>
          )}

          {(data?.overlays ?? []).map((overlay) => {
            const status = STATUS_STYLES[overlay.status];
            return (
              <View
                key={overlay.id}
                className="mb-4 overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900"
              >
                <View className="aspect-video w-full items-center justify-center overflow-hidden">
                  <Checkerboard id={`overlay-${overlay.id}`} />
                  {overlay.imageUrl ? (
                    <Image
                      source={{ uri: overlay.imageUrl }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="contain"
                    />
                  ) : (
                    <Text className="text-xs text-gray-400">No image</Text>
                  )}
                </View>

                <View className="p-4">
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1">
                      <Text className="font-medium text-gray-900 dark:text-white">
                        {overlay.name}
                      </Text>
                      <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        Priority {overlay.priority}
                      </Text>
                    </View>
                    <View className="items-end gap-1">
                      <View className={`rounded-full px-2 py-0.5 ${status.wrap}`}>
                        <Text className={`text-[11px] ${status.text}`}>
                          {overlay.status}
                        </Text>
                      </View>
                      {overlay.isActive && (
                        <View className="rounded-full bg-green-600 px-2 py-0.5">
                          <Text className="text-[11px] text-white">
                            used for new photos
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {overlay.startsAt
                      ? `From ${prettyDateTime(overlay.startsAt)}`
                      : "No start date"}
                    {" · "}
                    {overlay.endsAt
                      ? `until ${prettyDateTime(overlay.endsAt)}`
                      : "no end date"}
                  </Text>

                  <View className="mt-4 flex-row gap-2">
                    <Pressable
                      onPress={() => void toggleEnabled(overlay)}
                      disabled={busy}
                      className={`flex-1 items-center rounded-xl border border-gray-200 py-2.5 dark:border-neutral-700 ${
                        busy ? "opacity-40" : "active:opacity-70"
                      }`}
                      accessibilityRole="button"
                    >
                      <Text className="text-xs font-medium text-gray-700 dark:text-gray-200">
                        {overlay.isEnabled ? "Disable" : "Enable"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setConfirmDelete(overlay)}
                      disabled={busy}
                      className={`flex-row items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2.5 dark:border-neutral-700 ${
                        busy ? "opacity-40" : "active:opacity-70"
                      }`}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${overlay.name}`}
                    >
                      <Feather name="trash-2" size={13} color="#B91C1C" />
                      <Text className="text-xs font-medium text-red-700 dark:text-red-400">
                        Delete
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <BottomSheet
        visible={showForm}
        onClose={() => setShowForm(false)}
        title="Upload an overlay"
      >
        <ScrollView
          className="px-5"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Use a transparent PNG sized to your photo frame. It is scaled to
            cover the picture, then the capture date is drawn on top.
          </Text>

          <Text className="mb-1 text-sm text-gray-700 dark:text-gray-200">
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={120}
            placeholder="Summer frame"
            placeholderTextColor="#9CA3AF"
            className="mb-4 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />

          <Text className="mb-1 text-sm text-gray-700 dark:text-gray-200">
            Overlay image
          </Text>
          <Pressable
            onPress={() => void pickImage()}
            className="mb-4 flex-row items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-3 dark:border-neutral-700 dark:bg-neutral-900"
            accessibilityRole="button"
            accessibilityLabel="Choose the overlay image"
          >
            <Feather name="upload" size={16} color={PRIMARY} />
            <Text
              className={`flex-1 text-sm ${file ? "text-gray-900 dark:text-white" : "text-gray-400"}`}
              numberOfLines={1}
            >
              {file?.name ?? "Choose a PNG, JPEG or WebP"}
            </Text>
            {file ? (
              <Feather name="check-circle" size={16} color="#16A34A" />
            ) : null}
          </Pressable>

          {file ? (
            <View className="mb-4 aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-gray-100 dark:border-neutral-800">
              <Checkerboard id="overlay-form-preview" />
              <Image
                source={{ uri: file.uri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="contain"
              />
            </View>
          ) : null}

          <View className="mb-4 gap-3">
            <ScheduleField
              label="Starts (optional)"
              date={startsDate}
              time={startsTime}
              onPickDate={() => setPicker("starts-date")}
              onPickTime={() => setPicker("starts-time")}
              onClear={() => {
                setStartsDate("");
                setStartsTime("");
              }}
            />
            <ScheduleField
              label="Ends (optional)"
              date={endsDate}
              time={endsTime}
              onPickDate={() => setPicker("ends-date")}
              onPickTime={() => setPicker("ends-time")}
              onClear={() => {
                setEndsDate("");
                setEndsTime("");
              }}
            />
          </View>

          <Text className="mb-1 text-sm text-gray-700 dark:text-gray-200">
            Priority when schedules overlap
          </Text>
          <TextInput
            value={priority}
            onChangeText={(t) => setPriority(t.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor="#9CA3AF"
            className="mb-5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />

          <View className="mb-8">
            <PrimaryButton
              label="Save overlay"
              onPress={() => void create()}
              loading={busy}
              disabled={!file || name.trim().length === 0}
              style={{ borderRadius: CONTROL_RADIUS }}
            />
          </View>
        </ScrollView>
      </BottomSheet>

      <DatePickerSheet
        visible={picker === "starts-date"}
        value={startsDate}
        minDate={MIN_SCHEDULE_DATE}
        title="Starts"
        onClose={() => setPicker(null)}
        onSelect={(date) => {
          setStartsDate(date);
          setPicker(null);
        }}
      />
      <DatePickerSheet
        visible={picker === "ends-date"}
        value={endsDate}
        minDate={startsDate || MIN_SCHEDULE_DATE}
        title="Ends"
        onClose={() => setPicker(null)}
        onSelect={(date) => {
          setEndsDate(date);
          setPicker(null);
        }}
      />
      <TimePickerSheet
        visible={picker === "starts-time"}
        value={startsTime || "00:00"}
        title="Starts at"
        onClose={() => setPicker(null)}
        onSelect={(time) => {
          setStartsTime(time);
          setPicker(null);
        }}
      />
      <TimePickerSheet
        visible={picker === "ends-time"}
        value={endsTime || "00:00"}
        title="Ends at"
        onClose={() => setPicker(null)}
        onSelect={(time) => {
          setEndsTime(time);
          setPicker(null);
        }}
      />

      <ConfirmationModal
        visible={!!confirmDelete}
        title={`Delete "${confirmDelete?.name ?? ""}"?`}
        message="New photos will use the capture date layer only unless another overlay is active."
        confirmLabel="Delete"
        cancelLabel="Keep it"
        destructive
        loading={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(null)}
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
