import { Feather } from "@expo/vector-icons";
import type { CameraView } from "expo-camera";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router, useFocusEffect } from "expo-router";
import { QrCode } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  PhotoCameraView,
  type PhotoCameraState,
} from "../../components/photos/PhotoCameraView";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import {
  CONTROL_RADIUS,
  PrimaryButton,
} from "../../components/ui/PrimaryButton";
import { Toast, type ToastType } from "../../components/ui/Toast";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  addCapturedPhoto,
  deliverPhotoSession,
  discardPhotoSession,
  fetchCaptureContext,
  removeSessionPhoto,
  reorderSessionPhotos,
  searchPhotoWaivers,
  startPhotoSession,
  uploadSessionPhoto,
  type PhotoCaptureContext,
  type PhotoDeliverySchedule,
  type PhotoSession,
  type PhotoWaiverMatch,
} from "../../services/photosService";

const PRIMARY = "#0644C7";

type Step = "consent" | "capture" | "delivery" | "done";

const STEP_ORDER: Step[] = ["consent", "capture", "delivery", "done"];

const STEP_LABELS: Record<Step, string> = {
  consent: "Consent",
  capture: "Capture",
  delivery: "Delivery",
  done: "Sent",
};

/** Delivery status chip colors (same set as the web's status pills). */
const DELIVERY_STATUS_STYLES: Record<string, { wrap: string; text: string }> = {
  sent: {
    wrap: "bg-green-100 dark:bg-green-900/30",
    text: "text-green-800 dark:text-green-300",
  },
  failed: {
    wrap: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-800 dark:text-red-300",
  },
  scheduled: {
    wrap: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-800 dark:text-blue-300",
  },
};

const DEFAULT_STATUS_STYLE = {
  wrap: "bg-gray-100 dark:bg-neutral-800",
  text: "text-gray-700 dark:text-gray-300",
};

/** Waiver badge tones, matching the web pill colors. */
const BADGE_TONES = {
  amber: {
    wrap: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-800 dark:text-amber-300",
  },
  gray: {
    wrap: "bg-gray-100 dark:bg-neutral-800",
    text: "text-gray-700 dark:text-gray-300",
  },
  red: {
    wrap: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-800 dark:text-red-300",
  },
  muted: {
    wrap: "bg-gray-200 dark:bg-neutral-700",
    text: "text-gray-700 dark:text-gray-200",
  },
} as const;

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

/** Card surface used for every panel on the page. */
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`rounded-2xl border border-gray-100 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
    >
      {children}
    </View>
  );
}

/** Square tick box — the web's `<input type="checkbox">` rows. */
function CheckBox({ checked }: { checked: boolean }) {
  return (
    <View
      className={`h-5 w-5 items-center justify-center rounded border-2 ${
        checked
          ? "border-[#0644C7] bg-[#0644C7]"
          : "border-gray-300 dark:border-neutral-600"
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
        selected
          ? "border-[#0644C7]"
          : "border-gray-300 dark:border-neutral-600"
      }`}
    >
      {selected && <View className="h-2.5 w-2.5 rounded-full bg-[#0644C7]" />}
    </View>
  );
}

/** Small pill used for waiver channel/consent badges. */
function Badge({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof BADGE_TONES;
}) {
  const style = BADGE_TONES[tone];
  return (
    <View className={`rounded-full px-2 py-0.5 ${style.wrap}`}>
      <Text className={`text-[11px] ${style.text}`}>{label}</Text>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-1.5">
      <Text className="text-sm text-gray-500 dark:text-gray-400">{label}</Text>
      <Text className="ml-3 flex-1 text-right text-sm text-gray-900 dark:text-white">
        {value}
      </Text>
    </View>
  );
}

export default function PhotoCaptureScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const activeLocation = useActiveLocation();
  const effectiveLocationId = isCompanyAdmin
    ? activeLocation.id === "all"
      ? null
      : activeLocation.id
    : (user?.location_id ?? null);

  const [context, setContext] = useState<PhotoCaptureContext | null>(null);
  const [session, setSession] = useState<PhotoSession | null>(null);
  const [step, setStep] = useState<Step>("consent");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, showToast] = useTransientAlert<{
    message: string;
    type: ToastType;
  }>(4000);

  const [method, setMethod] = useState<"waiver_message" | "staff_qr" | null>(
    null,
  );
  const [schedule, setSchedule] = useState<PhotoDeliverySchedule>("immediate");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<PhotoWaiverMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<PhotoWaiverMatch[]>([]);
  const [deliveryNote, setDeliveryNote] = useState<string | null>(null);
  const [slideshowOptIn, setSlideshowOptIn] = useState(false);

  const submitLockRef = useRef(false);

  const cameraRef = useRef<CameraView>(null);
  const [cameraState, setCameraState] = useState<PhotoCameraState>("starting");
  const [cameraRetry, setCameraRetry] = useState(0);
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const photoCount = session?.photos.length ?? 0;
  const maxPhotos = session?.maxPhotos ?? context?.limits.staffMaxPhotos ?? 3;
  const atCap = photoCount >= maxPhotos;
  const readyPhotos = useMemo(
    () => (session?.photos ?? []).filter((p) => p.processingStatus === "ready"),
    [session],
  );
  const selectableCount = selected.filter((w) => w.contactable).length;

  useEffect(() => {
    if (!effectiveLocationId) {
      setContext(null);
      return;
    }
    const token = getToken();
    if (!token) return;

    const controller = new AbortController();
    let cancelled = false;
    fetchCaptureContext(token, effectiveLocationId, controller.signal)
      .then((ctx) => {
        if (!cancelled) setContext(ctx);
      })
      .catch((e) => {
        if (!cancelled)
          showToast({
            message: errorMessage(e, "Could not load this location."),
            type: "error",
          });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [effectiveLocationId, showToast]);

  const startSession = useCallback(async () => {
    const token = getToken();
    if (!effectiveLocationId || !consent || !token) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setBusy(true);
    try {
      setSession(await startPhotoSession(token, effectiveLocationId));
      setStep("capture");
    } catch (e) {
      showToast({
        message: errorMessage(e, "Could not start the session."),
        type: "error",
      });
    } finally {
      submitLockRef.current = false;
      setBusy(false);
    }
  }, [consent, effectiveLocationId, showToast]);

  const takePhoto = useCallback(async () => {
    const token = getToken();
    if (!session || atCap || busy || !token) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    setBusy(true);
    try {
      const shot = await cameraRef.current?.takePictureAsync({
        quality: 0.7,
        base64: true,
      });
      if (!shot?.base64) {
        showToast({
          message: "The camera did not return an image. Try again.",
          type: "error",
        });
        return;
      }
      setSession(
        await addCapturedPhoto(
          token,
          session.id,
          `data:image/jpeg;base64,${shot.base64}`,
        ),
      );
    } catch (e) {
      showToast({
        message: errorMessage(e, "That photo could not be added."),
        type: "error",
      });
    } finally {
      submitLockRef.current = false;
      setBusy(false);
    }
  }, [atCap, busy, session, showToast]);

  const uploadPhoto = useCallback(async () => {
    const token = getToken();
    if (!session || atCap || busy || !token) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;

    try {
      // Re-encoded to JPEG at the app's usual upload quality, which also keeps
      // an iPhone HEIC out of the backend's jpg/png/webp/gif allow-list.
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: false,
        quality: 0.7,
      });
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset?.uri) return;

      setBusy(true);
      setSession(
        await uploadSessionPhoto(token, session.id, {
          uri: asset.uri,
          name: asset.fileName ?? "photo.jpg",
          type: asset.mimeType ?? "image/jpeg",
        }),
      );
    } catch (e) {
      showToast({
        message: errorMessage(e, "That file could not be uploaded."),
        type: "error",
      });
    } finally {
      submitLockRef.current = false;
      setBusy(false);
    }
  }, [atCap, busy, session, showToast]);

  const removePhoto = useCallback(
    async (photoId: number) => {
      const token = getToken();
      if (!session || !token) return;
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      setBusy(true);
      try {
        setSession(await removeSessionPhoto(token, session.id, photoId));
      } catch (e) {
        showToast({
          message: errorMessage(e, "That photo could not be removed."),
          type: "error",
        });
      } finally {
        submitLockRef.current = false;
        setBusy(false);
      }
    },
    [session, showToast],
  );

  const movePhoto = useCallback(
    async (photoId: number, direction: -1 | 1) => {
      const token = getToken();
      if (!session || !token) return;
      const ids = session.photos.map((p) => p.id);
      const from = ids.indexOf(photoId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= ids.length) return;
      if (submitLockRef.current) return;
      submitLockRef.current = true;
      const next = [...ids];
      [next[from], next[to]] = [next[to], next[from]];
      setBusy(true);
      try {
        setSession(await reorderSessionPhotos(token, session.id, next));
      } catch (e) {
        showToast({
          message: errorMessage(e, "Could not reorder the photos."),
          type: "error",
        });
      } finally {
        submitLockRef.current = false;
        setBusy(false);
      }
    },
    [session, showToast],
  );

  const runSearch = useCallback(async () => {
    const token = getToken();
    if (query.trim().length < 2 || !token) return;
    setSearching(true);
    setSearched(false);
    try {
      setMatches(
        await searchPhotoWaivers(token, query.trim(), effectiveLocationId),
      );
      setSearched(true);
    } catch (e) {
      showToast({
        message: errorMessage(e, "The waiver search failed."),
        type: "error",
      });
    } finally {
      setSearching(false);
    }
  }, [effectiveLocationId, query, showToast]);

  const toggleWaiver = useCallback((waiver: PhotoWaiverMatch) => {
    setSelected((prev) =>
      prev.some((w) => w.id === waiver.id)
        ? prev.filter((w) => w.id !== waiver.id)
        : [...prev, waiver],
    );
  }, []);

  const deliver = useCallback(async () => {
    const token = getToken();
    if (!session || !method || !token) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setBusy(true);
    try {
      const result = await deliverPhotoSession(token, session.id, {
        method,
        schedule: method === "waiver_message" ? schedule : undefined,
        waiverIds:
          method === "waiver_message" ? selected.map((w) => w.id) : undefined,
        slideshowOptIn,
      });
      setSession(result.session);
      setDeliveryNote(result.message);
      setStep("done");
    } catch (e) {
      showToast({
        message: errorMessage(e, "Delivery failed."),
        type: "error",
      });
    } finally {
      submitLockRef.current = false;
      setBusy(false);
    }
  }, [method, schedule, selected, session, showToast, slideshowOptIn]);

  const resetAll = useCallback(() => {
    setSession(null);
    setStep("consent");
    setConsent(false);
    setMethod(null);
    setSchedule("immediate");
    setQuery("");
    setMatches([]);
    setSearched(false);
    setSelected([]);
    setDeliveryNote(null);
    setSlideshowOptIn(false);
  }, []);

  const discard = useCallback(async () => {
    const token = getToken();
    if (!session || !token) return;
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setBusy(true);
    try {
      await discardPhotoSession(token, session.id);
      showToast({ message: "Session discarded.", type: "info" });
      resetAll();
    } catch (e) {
      showToast({
        message: errorMessage(e, "Could not discard the session."),
        type: "error",
      });
    } finally {
      submitLockRef.current = false;
      setBusy(false);
    }
  }, [resetAll, session, showToast]);

  const header = (
    <View className="w-full border-b border-gray-100 bg-white px-5 pb-5 pt-12 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={20} color={headerIcon} />
        </Pressable>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          Take Photos
        </Text>
        {session && step !== "done" ? (
          <Pressable
            onPress={() => void discard()}
            disabled={busy}
            className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="Discard session"
          >
            <Feather name="trash-2" size={18} color="#DC2626" />
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>
    </View>
  );

  if (!effectiveLocationId) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Card className="items-center">
            <Feather name="map-pin" size={34} color="#9CA3AF" />
            <Text className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
              Choose a location first
            </Text>
            <Text className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              {isCompanyAdmin
                ? "Pick a location to work in. Photos, overlays and slideshows are all per location."
                : "Your account is not assigned to a location yet. Ask a manager to set one."}
            </Text>
            {isCompanyAdmin && (
              <View className="mt-5 w-full">
                <LocationWorkspaceSelector />
              </View>
            )}
          </Card>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {header}

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: 20,
            paddingBottom: insets.bottom + 40,
          }}
        >
          {/* Location, operating day and which overlay new photos will carry. */}
          <Text className="mb-4 text-xs text-gray-500 dark:text-gray-400">
            {context
              ? `${context.location.name} · operating day ${context.operatingDay} · ${
                  context.hasOverlay
                    ? `overlay: ${context.activeOverlay?.name}`
                    : "date layer only"
                }`
              : "Loading this location…"}
          </Text>

          {/* Step indicator — wraps rather than clipping on narrow screens. */}
          <View className="mb-5 flex-row flex-wrap items-center gap-y-2">
            {STEP_ORDER.map((s, i) => {
              const active = STEP_ORDER.indexOf(step) >= i;
              return (
                <View key={s} className="flex-row items-center">
                  <View
                    className={`h-6 w-6 items-center justify-center rounded-full ${
                      active
                        ? "bg-[#0644C7]"
                        : "bg-gray-200 dark:bg-neutral-800"
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-bold ${
                        active
                          ? "text-white"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {i + 1}
                    </Text>
                  </View>
                  <Text
                    className={`ml-1.5 text-[11px] ${
                      active
                        ? "font-semibold text-gray-900 dark:text-white"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {STEP_LABELS[s]}
                  </Text>
                  {i < STEP_ORDER.length - 1 && (
                    <View className="mx-1.5 h-px w-3 bg-gray-300 dark:bg-neutral-700" />
                  )}
                </View>
              );
            })}
          </View>

          {/* ---------------------------------------------------- consent -- */}
          {step === "consent" && (
            <Card>
              <Text className="mb-2 text-base font-bold text-gray-900 dark:text-white">
                Confirm the customer wants the photo
              </Text>
              <Text className="mb-5 text-sm text-gray-500 dark:text-gray-400">
                Ask the customer out loud before you capture anything. Up to{" "}
                {maxPhotos} photos can go in one session, and the branded
                preview is shown before you choose how to send them.
              </Text>

              <Pressable
                onPress={() => setConsent((v) => !v)}
                className="mb-6 flex-row items-start gap-3"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: consent }}
              >
                <View className="mt-0.5">
                  <CheckBox checked={consent} />
                </View>
                <Text className="flex-1 text-sm text-gray-800 dark:text-gray-200">
                  I asked the customer and they agreed to have their photo
                  taken.
                </Text>
              </Pressable>

              <PrimaryButton
                label="Start photo session"
                onPress={() => void startSession()}
                disabled={!consent || busy}
                loading={busy}
                style={{ borderRadius: CONTROL_RADIUS }}
              />
            </Card>
          )}

          {/* ---------------------------------------------------- capture -- */}
          {step === "capture" && session && (
            <>
              {focused ? (
                <PhotoCameraView
                  cameraRef={cameraRef}
                  onStateChange={setCameraState}
                  retryToken={cameraRetry}
                />
              ) : (
                <View className="aspect-[4/3] w-full rounded-2xl bg-black" />
              )}

              <View className="mt-4 gap-3">
                <Pressable
                  onPress={() => void takePhoto()}
                  disabled={cameraState !== "live" || atCap || busy}
                  className={`h-14 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] active:opacity-90 ${
                    cameraState !== "live" || atCap || busy ? "opacity-60" : ""
                  }`}
                  accessibilityRole="button"
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Feather name="camera" size={16} color="#FFFFFF" />
                  )}
                  <Text className="text-base font-semibold text-white">
                    Take photo
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => void uploadPhoto()}
                  disabled={atCap || busy}
                  className={`h-14 flex-row items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white active:opacity-80 dark:border-neutral-700 dark:bg-neutral-900 ${
                    atCap || busy ? "opacity-60" : ""
                  }`}
                  accessibilityRole="button"
                >
                  <Feather name="upload" size={16} color={headerIcon} />
                  <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                    Upload from device
                  </Text>
                </Pressable>

                {cameraState !== "live" && (
                  <Pressable
                    onPress={() => setCameraRetry((n) => n + 1)}
                    className="items-center py-1"
                    accessibilityRole="button"
                  >
                    <Text className="text-sm font-semibold text-[#0644C7]">
                      Retry camera
                    </Text>
                  </Pressable>
                )}
              </View>

              {atCap && (
                <View className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/20">
                  <Text className="text-sm text-amber-800 dark:text-amber-300">
                    {maxPhotos} photos is the locked maximum for a staff
                    session. Remove one to swap it out.
                  </Text>
                </View>
              )}

              <Card className="mt-4">
                <Text className="font-bold text-gray-900 dark:text-white">
                  This session ({photoCount}/{maxPhotos})
                </Text>
                <Text className="mb-4 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Each photo already carries the location overlay and the
                  capture date.
                </Text>

                {photoCount === 0 && (
                  <View className="items-center py-8">
                    <Feather name="image" size={30} color="#9CA3AF" />
                    <Text className="mt-2 text-sm text-gray-400 dark:text-gray-500">
                      No photos yet
                    </Text>
                  </View>
                )}

                {session.photos.map((photo, i) => (
                  <View
                    key={photo.id}
                    className="mb-3 flex-row items-center gap-3"
                  >
                    {photo.thumbnailUrl ? (
                      <Image
                        source={{ uri: photo.thumbnailUrl }}
                        style={{ height: 64, width: 64, borderRadius: 8 }}
                        contentFit="cover"
                      />
                    ) : (
                      <View className="h-16 w-16 items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800">
                        <Feather name="image" size={18} color="#9CA3AF" />
                      </View>
                    )}

                    <View className="flex-1">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">
                        Photo {i + 1}
                      </Text>
                      <Text className="text-xs capitalize text-gray-500 dark:text-gray-400">
                        {photo.source}
                      </Text>
                      {photo.processingStatus === "failed" && (
                        <Text className="text-xs text-red-600 dark:text-red-400">
                          Processing failed
                        </Text>
                      )}
                    </View>

                    <View className="flex-row items-center gap-1">
                      <Pressable
                        onPress={() => void movePhoto(photo.id, -1)}
                        disabled={i === 0 || busy}
                        hitSlop={6}
                        className={`rounded p-1.5 ${i === 0 || busy ? "opacity-30" : ""}`}
                        accessibilityRole="button"
                        accessibilityLabel="Move earlier"
                      >
                        <Feather name="arrow-up" size={16} color="#6B7280" />
                      </Pressable>
                      <Pressable
                        onPress={() => void movePhoto(photo.id, 1)}
                        disabled={i === session.photos.length - 1 || busy}
                        hitSlop={6}
                        className={`rounded p-1.5 ${
                          i === session.photos.length - 1 || busy
                            ? "opacity-30"
                            : ""
                        }`}
                        accessibilityRole="button"
                        accessibilityLabel="Move later"
                      >
                        <Feather name="arrow-down" size={16} color="#6B7280" />
                      </Pressable>
                      <Pressable
                        onPress={() => void removePhoto(photo.id)}
                        disabled={busy}
                        hitSlop={6}
                        className={`rounded p-1.5 ${busy ? "opacity-30" : ""}`}
                        accessibilityRole="button"
                        accessibilityLabel="Remove photo"
                      >
                        <Feather name="trash-2" size={16} color="#DC2626" />
                      </Pressable>
                    </View>
                  </View>
                ))}

                {readyPhotos.length > 0 && (
                  <View className="mt-2">
                    <Text className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                      Branded preview
                    </Text>
                    <Image
                      source={{ uri: readyPhotos[0].deliveryUrl ?? "" }}
                      style={{
                        width: "100%",
                        aspectRatio: 4 / 3,
                        borderRadius: 8,
                      }}
                      contentFit="contain"
                    />
                  </View>
                )}

                <View className="mt-5">
                  <PrimaryButton
                    label="Continue to delivery"
                    onPress={() => setStep("delivery")}
                    disabled={readyPhotos.length === 0 || busy}
                    style={{ borderRadius: CONTROL_RADIUS }}
                  />
                </View>
              </Card>
            </>
          )}

          {/* --------------------------------------------------- delivery -- */}
          {step === "delivery" && session && (
            <>
              <Pressable
                onPress={() => setMethod("waiver_message")}
                className={`mb-3 rounded-2xl border-2 bg-white p-5 dark:bg-neutral-900 ${
                  method === "waiver_message"
                    ? "border-[#0644C7]"
                    : "border-gray-200 dark:border-neutral-800"
                }`}
                accessibilityRole="radio"
                accessibilityState={{ selected: method === "waiver_message" }}
              >
                <View className="mb-2 flex-row items-center gap-2">
                  <Feather name="mail" size={18} color={PRIMARY} />
                  <Text className="flex-1 font-bold text-gray-900 dark:text-white">
                    Waiver message delivery
                  </Text>
                  <Text className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Default
                  </Text>
                </View>
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  Search completed waivers by name, phone or email. Every
                  available email and mobile number on the waivers you pick
                  receives the secure link.
                </Text>
              </Pressable>

              <Pressable
                onPress={() => setMethod("staff_qr")}
                className={`mb-4 rounded-2xl border-2 bg-white p-5 dark:bg-neutral-900 ${
                  method === "staff_qr"
                    ? "border-[#0644C7]"
                    : "border-gray-200 dark:border-neutral-800"
                }`}
                accessibilityRole="radio"
                accessibilityState={{ selected: method === "staff_qr" }}
              >
                <View className="mb-2 flex-row items-center gap-2">
                  <QrCode size={18} color={PRIMARY} />
                  <Text className="flex-1 font-bold text-gray-900 dark:text-white">
                    Direct staff QR
                  </Text>
                </View>
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  Show a code on this device. The customer scans it and opens
                  the photos straight away. No form is shown and no customer
                  information is requested.
                </Text>
              </Pressable>

              {method === "waiver_message" && (
                <Card className="mb-4">
                  {(context?.channels.smsNote ||
                    context?.channels.emailNote) && (
                    <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/20">
                      <View className="flex-row items-center gap-2">
                        <Feather
                          name="alert-triangle"
                          size={14}
                          color="#B45309"
                        />
                        <Text className="text-sm font-medium text-amber-900 dark:text-amber-300">
                          Not every channel is sending
                        </Text>
                      </View>
                      {!!context?.channels.emailNote && (
                        <Text className="mt-1 text-sm text-amber-900 dark:text-amber-300">
                          {context.channels.emailNote}
                        </Text>
                      )}
                      {!!context?.channels.smsNote && (
                        <Text className="mt-1 text-sm text-amber-900 dark:text-amber-300">
                          {context.channels.smsNote}
                        </Text>
                      )}
                    </View>
                  )}

                  <Text className="mb-3 font-bold text-gray-900 dark:text-white">
                    Find the waiver
                  </Text>

                  <View className="mb-4 flex-row items-center gap-2">
                    <View className="h-12 flex-1 flex-row items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 dark:border-neutral-700 dark:bg-neutral-900">
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
                      className={`h-12 items-center justify-center rounded-xl bg-[#0644C7] px-5 active:opacity-90 ${
                        query.trim().length < 2 || searching ? "opacity-60" : ""
                      }`}
                      accessibilityRole="button"
                    >
                      {searching ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text className="text-sm font-semibold text-white">
                          Search
                        </Text>
                      )}
                    </Pressable>
                  </View>

                  {searched && matches.length === 0 && (
                    <Text className="py-4 text-sm text-gray-500 dark:text-gray-400">
                      No completed waivers matched that search.
                    </Text>
                  )}

                  {matches.map((waiver) => {
                    const checked = selected.some((w) => w.id === waiver.id);
                    return (
                      <Pressable
                        key={waiver.id}
                        onPress={() =>
                          waiver.contactable && toggleWaiver(waiver)
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
                            {waiver.signedOn
                              ? ` · signed ${waiver.signedOn}`
                              : ""}
                          </Text>
                          <View className="mt-1 flex-row flex-wrap gap-1">
                            {!!waiver.unavailableReason && (
                              <Badge
                                label={waiver.unavailableReason}
                                tone="amber"
                              />
                            )}
                            {waiver.hasEmail && (
                              <Badge label="email" tone="gray" />
                            )}
                            {waiver.hasPhone && (
                              <Badge label="SMS" tone="gray" />
                            )}
                            {waiver.photoVideoConsent === false && (
                              <Badge
                                label="declined the photo release"
                                tone="red"
                              />
                            )}
                            {waiver.photoVideoConsent === null && (
                              <Badge
                                label="photo release never asked"
                                tone="muted"
                              />
                            )}
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}

                  {selected.length > 0 && (
                    <View className="mt-4 border-t border-gray-100 pt-4 dark:border-neutral-800">
                      <Text className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
                        Selected ({selectableCount} will receive the link)
                      </Text>
                      <View className="flex-row flex-wrap gap-2">
                        {selected.map((waiver) => (
                          <Pressable
                            key={waiver.id}
                            onPress={() => toggleWaiver(waiver)}
                            className="flex-row items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 dark:bg-neutral-800"
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${waiver.name}`}
                          >
                            <Text className="text-xs text-gray-800 dark:text-gray-200">
                              {waiver.name}
                            </Text>
                            <Feather name="x" size={12} color="#6B7280" />
                          </Pressable>
                        ))}
                      </View>
                      <Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Waivers that share an email or mobile number are
                        recorded individually but only sent once.
                      </Text>
                    </View>
                  )}

                  <View className="mt-5 border-t border-gray-100 pt-4 dark:border-neutral-800">
                    <Text className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
                      When should it go out?
                    </Text>
                    <Pressable
                      onPress={() => setSchedule("immediate")}
                      className="flex-row items-center gap-3 py-2"
                      accessibilityRole="radio"
                      accessibilityState={{
                        selected: schedule === "immediate",
                      }}
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
                      accessibilityState={{
                        selected: schedule === "next_day_9am",
                      }}
                    >
                      <RadioDot selected={schedule === "next_day_9am"} />
                      <Text className="text-sm text-gray-800 dark:text-gray-200">
                        9:00 AM tomorrow{" "}
                        <Text className="text-gray-500 dark:text-gray-400">
                          ({context?.location.timezone ?? "America/Detroit"})
                        </Text>
                      </Text>
                    </Pressable>
                  </View>
                </Card>
              )}

              <Pressable
                onPress={() => setSlideshowOptIn((v) => !v)}
                className="mb-4 flex-row items-start gap-3 rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: slideshowOptIn }}
              >
                <View className="mt-0.5">
                  <CheckBox checked={slideshowOptIn} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-900 dark:text-white">
                    Also show these photos on the venue slideshow
                  </Text>
                  <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    They appear on the public screen within a few seconds.
                    Please ask the customer first, and leave this unticked if
                    they would rather not be shown. You can add or remove any
                    photo later from the photo library.
                  </Text>
                </View>
              </Pressable>

              <View className="flex-row items-center gap-3">
                <Pressable
                  onPress={() => setStep("capture")}
                  disabled={busy}
                  className="h-14 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-gray-200 active:opacity-80 dark:border-neutral-700"
                  accessibilityRole="button"
                >
                  <Feather name="arrow-left" size={16} color={headerIcon} />
                  <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                    Back to capture
                  </Text>
                </Pressable>
                <View className="flex-1">
                  <PrimaryButton
                    label={
                      method === "staff_qr" ? "Show the QR code" : "Send photos"
                    }
                    onPress={() => void deliver()}
                    loading={busy}
                    disabled={
                      !method ||
                      busy ||
                      (method === "waiver_message" && selectableCount === 0)
                    }
                    style={{ borderRadius: CONTROL_RADIUS }}
                  />
                </View>
              </View>
            </>
          )}

          {/* ------------------------------------------------------- done -- */}
          {step === "done" && session && (
            <>
              <Card>
                <Feather name="check-circle" size={30} color="#16A34A" />
                <Text className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
                  {session.deliveryMethod === "staff_qr"
                    ? "Ready to scan"
                    : "Delivery recorded"}
                </Text>
                <Text className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {deliveryNote ?? "The session is complete."}
                </Text>

                <DetailRow label="Photos" value={String(session.photoCount)} />
                <DetailRow
                  label="Customer page expires"
                  value={
                    session.accessExpiresAt
                      ? new Date(session.accessExpiresAt).toLocaleDateString()
                      : "—"
                  }
                />
                {session.deliveryMethod === "staff_qr" && (
                  <DetailRow
                    label="QR expires"
                    value={
                      session.qrExpiresAt
                        ? new Date(session.qrExpiresAt).toLocaleString()
                        : "—"
                    }
                  />
                )}

                {session.deliveries.length > 0 && (
                  <View className="mt-4 border-t border-gray-100 pt-4 dark:border-neutral-800">
                    <Text className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
                      Channels
                    </Text>
                    {session.deliveries.map((delivery) => {
                      const chip =
                        DELIVERY_STATUS_STYLES[delivery.status] ??
                        DEFAULT_STATUS_STYLE;
                      return (
                        <View
                          key={delivery.id}
                          className="mb-1.5 flex-row items-center justify-between gap-3"
                        >
                          <Text className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                            {delivery.channel === "email" ? "Email" : "SMS"} ·{" "}
                            {delivery.destinationMasked}
                            {delivery.isDuplicate && (
                              <Text className="text-xs text-gray-500 dark:text-gray-400">
                                {"  "}(same destination — not sent twice)
                              </Text>
                            )}
                          </Text>
                          <View
                            className={`rounded-full px-2 py-0.5 ${chip.wrap}`}
                          >
                            <Text className={`text-xs ${chip.text}`}>
                              {delivery.status}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}

                <View className="mt-6">
                  <PrimaryButton
                    label="Start a new session"
                    onPress={resetAll}
                    style={{ borderRadius: CONTROL_RADIUS }}
                  />
                </View>
              </Card>

              {session.deliveryMethod === "staff_qr" && (
                <Card className="mt-4 items-center">
                  <View className="rounded-2xl bg-white p-4">
                    <QRCode
                      value={session.qrTargetUrl}
                      size={230}
                      ecl="M"
                      backgroundColor="#FFFFFF"
                      color="#111827"
                    />
                  </View>
                  <Text className="mt-4 text-sm font-medium text-gray-700 dark:text-gray-300">
                    Hold this up for the customer to scan.
                  </Text>
                  <Text className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
                    No form is shown and no name, email, phone or marketing
                    question is asked. Closing this screen does not invalidate
                    the code.
                  </Text>
                  <View className="mt-3 flex-row items-center gap-1">
                    <Feather name="clock" size={13} color="#9CA3AF" />
                    <Text className="text-xs text-gray-500 dark:text-gray-400">
                      Active for {context?.limits.qrValidHours ?? 12} hours
                    </Text>
                  </View>
                </Card>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

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
