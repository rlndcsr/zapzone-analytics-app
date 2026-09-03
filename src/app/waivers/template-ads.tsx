import { Feather, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import {
  DateRangeSheet,
  formatShortDate,
} from "../../components/ui/DateRangeSheet";
import { InputField } from "../../components/ui/InputField";
import { StatusModal } from "../../components/ui/StatusModal";
import { mediaUrl } from "../../lib/api";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { useStatusModal } from "../../lib/hooks/useStatusModal";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  describeAdSchedule,
  describeAdTargets,
} from "../../lib/waivers/adPresentation";
import {
  createTemplateAd,
  deleteTemplateAd,
  fetchTemplateAds,
  reorderTemplateAds,
  updateTemplateAd,
  updateTemplateAdSettings,
  type WaiverAd,
  type WaiverAdImage,
  type WaiverAdSettings,
  type WaiverAdStatus,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

/** Tints for the server-derived status, matching the web's chips. */
const STATUS_TONE: Record<WaiverAdStatus, { wrap: string; text: string }> = {
  active: {
    wrap: "bg-emerald-50 dark:bg-emerald-900/25",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  scheduled: {
    wrap: "bg-blue-50 dark:bg-blue-900/25",
    text: "text-blue-700 dark:text-blue-300",
  },
  expired: {
    wrap: "bg-gray-100 dark:bg-neutral-800",
    text: "text-gray-600 dark:text-gray-300",
  },
  disabled: {
    wrap: "bg-amber-50 dark:bg-amber-900/25",
    text: "text-amber-700 dark:text-amber-300",
  },
};

const ROTATION_OPTIONS: { label: string; value: "random" | "ordered" }[] = [
  { label: "Random", value: "random" },
  { label: "Specific order", value: "ordered" },
];

/** The backend clamps display duration to this range. */
const MIN_SECONDS = 1;
const MAX_SECONDS = 10;

const LABEL = "mb-1.5 text-sm font-medium text-gray-700 dark:text-gray-200";
const HINT = "mt-1 text-[11px] text-gray-400 dark:text-gray-500";

type FormState = {
  name: string;
  destinationUrl: string;
  locationIds: number[];
  startsAt: string;
  endsAt: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  destinationUrl: "",
  locationIds: [],
  startsAt: "",
  endsAt: "",
};

type FormTarget =
  { kind: "create"; fallback: boolean } | { kind: "edit"; ad: WaiverAd };

const TemplateAds = () => {
  const insets = useSafeAreaInsets();
  const status = useStatusModal();
  const { templateId: templateIdParam, title: titleParam } =
    useLocalSearchParams<{ templateId?: string; title?: string }>();
  const templateId = templateIdParam ? Number(templateIdParam) : null;

  const isCompanyAdmin = getCurrentUser()?.role === "company_admin";
  const canTarget = isCompanyAdmin;
  const canReorder = isCompanyAdmin;

  const { locations } = useLocationOptions();
  const [ads, setAds] = useState<WaiverAd[]>([]);
  const [settings, setSettings] = useState<WaiverAdSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [target, setTarget] = useState<FormTarget | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [image, setImage] = useState<WaiverAdImage | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const token = getToken();
      if (!token || templateId == null) {
        setLoadError("This screen was opened without a template.");
        setLoading(false);
        return;
      }
      try {
        const data = await fetchTemplateAds(token, templateId, signal);
        if (signal?.aborted) return;
        setAds(data.ads);
        setSettings(data.settings);
        setLoadError(null);
      } catch (e) {
        if (signal?.aborted) return;
        setLoadError(
          e instanceof Error ? e.message : "Could not load the ads.",
        );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [templateId],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  /** The rotation covers ordinary ads only — a fallback has no place in it. */
  const regularAds = useMemo(() => ads.filter((a) => !a.isFallback), [ads]);
  const fallbackAd = useMemo(
    () => ads.find((a) => a.isFallback) ?? null,
    [ads],
  );

  /* ---------------------------------------------------------- settings -- */

  const saveSettings = async (patch: Partial<WaiverAdSettings>) => {
    const token = getToken();
    if (!token || templateId == null || !settings) return;
    const previous = settings;
    // Optimistic: these are switches and steppers, and snapping back on
    // failure reads better than a spinner on every tap.
    setSettings({ ...settings, ...patch });
    try {
      setSettings(await updateTemplateAdSettings(token, templateId, patch));
    } catch (e) {
      setSettings(previous);
      status.error(
        "Could not save",
        e instanceof Error ? e.message : "Please try again.",
      );
    }
  };

  const stepSeconds = (delta: number) => {
    if (!settings) return;
    const next = Math.min(
      MAX_SECONDS,
      Math.max(MIN_SECONDS, settings.displaySeconds + delta),
    );
    if (next !== settings.displaySeconds)
      saveSettings({ displaySeconds: next });
  };

  /* --------------------------------------------------------------- form -- */

  const openCreate = (fallback: boolean) => {
    setForm(EMPTY_FORM);
    setImage(null);
    setTarget({ kind: "create", fallback });
  };

  const openEdit = (ad: WaiverAd) => {
    setForm({
      name: ad.name ?? "",
      destinationUrl: ad.destinationUrl ?? "",
      locationIds: ad.locationIds,
      startsAt: ad.startsAt?.slice(0, 10) ?? "",
      endsAt: ad.endsAt?.slice(0, 10) ?? "",
    });
    setImage(null);
    setTarget({ kind: "edit", ad });
  };

  const closeForm = () => {
    if (busy) return;
    setTarget(null);
    setImage(null);
  };

  /** A fallback carries neither targeting nor a schedule, on either platform. */
  const targetIsFallback =
    target?.kind === "create" ? target.fallback : !!target?.ad.isFallback;
  const existingImage =
    target?.kind === "edit" ? mediaUrl(target.ad.imagePath) : null;

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo library access to choose an ad image.",
      );
      return;
    }
    // Re-encoded at the app's usual upload quality, which also keeps an iPhone
    // HEIC out of the backend's png/jpg/webp allow-list.
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.7,
    });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset?.uri) return;
    setImage({
      uri: asset.uri,
      name: asset.fileName ?? "ad.jpg",
      type: asset.mimeType ?? "image/jpeg",
    });
  };

  const submitForm = async () => {
    const token = getToken();
    if (!token || templateId == null || !target || busy) return;

    const url = form.destinationUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      status.error(
        "Check the link",
        "The destination must be a full URL starting with http:// or https://.",
      );
      return;
    }
    if (form.startsAt && form.endsAt && form.endsAt < form.startsAt) {
      status.error("Check the schedule", "The end date must follow the start.");
      return;
    }

    setBusy(true);
    try {
      const base = {
        name: form.name.trim(),
        destinationUrl: url || undefined,
      };
      // Targeting and schedule belong to ordinary ads only; a location manager
      // is pinned to their own venue by the server, so the field is left out
      // entirely rather than sent as an empty "everywhere".
      const scoped = targetIsFallback
        ? {}
        : {
            ...(canTarget ? { locationIds: form.locationIds } : {}),
            startsAt: form.startsAt || undefined,
            endsAt: form.endsAt || undefined,
          };

      if (target.kind === "create") {
        if (!image) {
          status.error("Image required", "Choose an image for this ad.");
          return;
        }
        await createTemplateAd(token, templateId, image, {
          ...base,
          ...scoped,
          isFallback: target.fallback,
        });
      } else {
        await updateTemplateAd(token, target.ad.id, {
          ...base,
          ...scoped,
          image,
          // Blanking a field needs saying so; omitting it leaves it as it was.
          clearSchedule: !targetIsFallback && !form.startsAt && !form.endsAt,
          clearLink: !url,
        });
      }
      closeForm();
      await load();
    } catch (e) {
      status.error(
        "Could not save",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------------------------------------ actions -- */

  const toggleEnabled = async (ad: WaiverAd) => {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    try {
      await updateTemplateAd(token, ad.id, { isEnabled: !ad.isEnabled });
      await load();
    } catch (e) {
      status.error(
        "Could not save",
        e instanceof Error ? e.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = (ad: WaiverAd) => {
    status.confirm({
      title: "Delete this ad?",
      message: `"${ad.name || "This ad"}" and its image will be removed. This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
      onConfirm: async () => {
        const token = getToken();
        if (!token) return;
        setBusy(true);
        try {
          await deleteTemplateAd(token, ad.id);
          await load();
        } catch (e) {
          status.error(
            "Could not delete",
            e instanceof Error ? e.message : "Please try again.",
          );
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const move = async (ad: WaiverAd, delta: number) => {
    const token = getToken();
    if (!token || templateId == null) return;
    const index = regularAds.findIndex((a) => a.id === ad.id);
    const to = index + delta;
    if (index < 0 || to < 0 || to >= regularAds.length) return;
    const next = [...regularAds];
    [next[index], next[to]] = [next[to], next[index]];
    // Show the new order straight away; the reload confirms it.
    setAds([...next, ...(fallbackAd ? [fallbackAd] : [])]);
    try {
      await reorderTemplateAds(
        token,
        templateId,
        next.map((a) => a.id),
      );
      await load();
    } catch (e) {
      await load();
      status.error(
        "Could not reorder",
        e instanceof Error ? e.message : "Please try again.",
      );
    }
  };

  /* ------------------------------------------------------------- render -- */

  const AdCard = ({ ad, index }: { ad: WaiverAd; index: number | null }) => {
    const tone = STATUS_TONE[ad.status];
    const uri = mediaUrl(ad.imagePath);
    return (
      <View className="mb-3 overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <View className="h-32 items-center justify-center bg-gray-50 dark:bg-neutral-800">
          {uri ? (
            <Image
              source={{ uri }}
              className="h-full w-full"
              resizeMode="contain"
            />
          ) : (
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              No image
            </Text>
          )}
        </View>

        <View className="p-4">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text
              className="flex-1 text-base font-medium text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              {ad.name || "Untitled ad"}
            </Text>
            <View className={`rounded-full px-2 py-0.5 ${tone.wrap}`}>
              <Text
                className={`text-[11px] font-semibold capitalize ${tone.text}`}
              >
                {ad.status}
              </Text>
            </View>
            <View className="flex-row items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 dark:bg-neutral-800">
              <Feather name="map-pin" size={11} color="#6B7280" />
              <Text className="text-[11px] text-gray-600 dark:text-gray-300">
                {describeAdTargets(ad.locationNames)}
              </Text>
            </View>
          </View>

          {ad.destinationUrl ? (
            <View className="mt-1 flex-row items-center gap-1">
              <Feather name="external-link" size={11} color={PRIMARY} />
              <Text
                className="flex-1 text-xs text-[#0644C7] dark:text-blue-300"
                numberOfLines={1}
              >
                {ad.destinationUrl}
              </Text>
            </View>
          ) : null}

          <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {describeAdSchedule(ad)}
          </Text>

          <View className="mt-3 flex-row flex-wrap items-center gap-2">
            <Pressable
              onPress={() => toggleEnabled(ad)}
              disabled={busy}
              className={`rounded-lg border border-gray-200 px-3 py-1.5 active:opacity-70 dark:border-neutral-700 ${
                busy ? "opacity-40" : ""
              }`}
              accessibilityRole="button"
            >
              <Text className="text-xs text-gray-700 dark:text-gray-200">
                {ad.isEnabled ? "Disable" : "Enable"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => openEdit(ad)}
              disabled={busy}
              className={`flex-row items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 active:opacity-70 dark:border-neutral-700 ${
                busy ? "opacity-40" : ""
              }`}
              accessibilityRole="button"
            >
              <Feather name="edit-2" size={12} color="#6B7280" />
              <Text className="text-xs text-gray-700 dark:text-gray-200">
                Edit
              </Text>
            </Pressable>
            <Pressable
              onPress={() => confirmDelete(ad)}
              disabled={busy}
              className={`flex-row items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 active:opacity-70 dark:border-neutral-700 ${
                busy ? "opacity-40" : ""
              }`}
              accessibilityRole="button"
            >
              <Feather name="trash-2" size={12} color="#B91C1C" />
              <Text className="text-xs text-red-700 dark:text-red-400">
                Delete
              </Text>
            </Pressable>

            {/* Mobile stands in for the web's drag handle: same reorder call,
                a control that works inside a scrolling list. */}
            {canReorder && index !== null && regularAds.length > 1 && (
              <View className="ml-auto flex-row items-center gap-1.5">
                <Pressable
                  onPress={() => move(ad, -1)}
                  disabled={busy || index === 0}
                  className={`rounded-lg bg-gray-100 p-2 active:opacity-70 dark:bg-neutral-800 ${
                    busy || index === 0 ? "opacity-40" : ""
                  }`}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${ad.name || "ad"} up`}
                >
                  <Feather name="arrow-up" size={13} color="#6B7280" />
                </Pressable>
                <Pressable
                  onPress={() => move(ad, 1)}
                  disabled={busy || index === regularAds.length - 1}
                  className={`rounded-lg bg-gray-100 p-2 active:opacity-70 dark:bg-neutral-800 ${
                    busy || index === regularAds.length - 1 ? "opacity-40" : ""
                  }`}
                  accessibilityRole="button"
                  accessibilityLabel={`Move ${ad.name || "ad"} down`}
                >
                  <Feather name="arrow-down" size={13} color="#6B7280" />
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </View>
    );
  };

  const formTitle =
    target?.kind === "create"
      ? target.fallback
        ? "Upload the fallback ad"
        : "Upload an ad"
      : target?.ad.isFallback
        ? "Edit the fallback ad"
        : "Edit ad";

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <View className="w-full border-b border-gray-100 bg-white px-5 pb-5 pt-12 dark:border-neutral-800 dark:bg-neutral-900">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="Back to templates"
          >
            <Feather name="chevron-left" size={20} color="#374151" />
          </Pressable>
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Ionicons name="megaphone-outline" size={18} color={PRIMARY} />
              <Text className="text-lg font-bold text-gray-900 dark:text-white">
                Post-Waiver Ads
              </Text>
            </View>
            <Text
              className="mt-0.5 text-xs text-gray-500 dark:text-gray-400"
              numberOfLines={1}
            >
              {titleParam || `Template #${templateId ?? ""}`}
            </Text>
          </View>
          <Pressable
            onPress={() => openCreate(false)}
            className="flex-row items-center gap-1.5 rounded-xl bg-[#0644C7] px-3 py-2 active:opacity-90"
            accessibilityRole="button"
          >
            <Feather name="plus" size={14} color="#FFFFFF" />
            <Text className="text-xs font-semibold text-white">Add ad</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 32,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={PRIMARY}
            colors={[PRIMARY]}
          />
        }
      >
        {loading ? (
          <View className="items-center py-16">
            <ActivityIndicator color={PRIMARY} />
          </View>
        ) : loadError ? (
          <View className="items-center rounded-2xl border border-red-100 bg-red-50 p-6 dark:border-red-900/40 dark:bg-red-900/20">
            <Feather name="alert-circle" size={28} color="#EF4444" />
            <Text className="mt-2 text-center text-sm text-red-600 dark:text-red-300">
              {loadError}
            </Text>
          </View>
        ) : (
          <>
            {settings && (
              <View className="mb-6 rounded-2xl border border-gray-100 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
                <View className="flex-row items-start justify-between gap-4">
                  <View className="flex-1">
                    <Text className="font-medium text-gray-900 dark:text-white">
                      Show an ad after each completed waiver
                    </Text>
                    <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      A full-screen ad appears on the kiosk success screen, then
                      it returns to the start screen.
                    </Text>
                  </View>
                  <Switch
                    value={settings.adsEnabled}
                    onValueChange={(v) => saveSettings({ adsEnabled: v })}
                    disabled={busy}
                    trackColor={{ true: PRIMARY }}
                    accessibilityLabel="Toggle ads"
                  />
                </View>

                <View className="mt-5">
                  <Text className={LABEL}>Rotation</Text>
                  <View className="flex-row gap-2">
                    {ROTATION_OPTIONS.map((opt) => {
                      const on = settings.rotationMode === opt.value;
                      return (
                        <Pressable
                          key={opt.value}
                          onPress={() =>
                            saveSettings({ rotationMode: opt.value })
                          }
                          disabled={busy}
                          className={`flex-1 rounded-lg border py-2.5 active:opacity-80 ${
                            on
                              ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                              : "border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
                          }`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                        >
                          <Text
                            className={`text-center text-sm font-medium ${
                              on
                                ? "text-[#0644C7] dark:text-blue-300"
                                : "text-gray-600 dark:text-gray-300"
                            }`}
                          >
                            {opt.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View className="mt-4">
                  <Text className={LABEL}>Display duration (seconds)</Text>
                  <View className="flex-row items-center gap-3">
                    <Pressable
                      onPress={() => stepSeconds(-1)}
                      disabled={busy || settings.displaySeconds <= MIN_SECONDS}
                      className={`rounded-lg border border-gray-200 p-2.5 active:opacity-70 dark:border-neutral-700 ${
                        busy || settings.displaySeconds <= MIN_SECONDS
                          ? "opacity-40"
                          : ""
                      }`}
                      accessibilityRole="button"
                      accessibilityLabel="Shorter duration"
                    >
                      <Feather name="minus" size={14} color="#6B7280" />
                    </Pressable>
                    <Text className="w-12 text-center text-base font-bold text-gray-900 dark:text-white">
                      {settings.displaySeconds}
                    </Text>
                    <Pressable
                      onPress={() => stepSeconds(1)}
                      disabled={busy || settings.displaySeconds >= MAX_SECONDS}
                      className={`rounded-lg border border-gray-200 p-2.5 active:opacity-70 dark:border-neutral-700 ${
                        busy || settings.displaySeconds >= MAX_SECONDS
                          ? "opacity-40"
                          : ""
                      }`}
                      accessibilityRole="button"
                      accessibilityLabel="Longer duration"
                    >
                      <Feather name="plus" size={14} color="#6B7280" />
                    </Pressable>
                  </View>
                  <Text className={HINT}>
                    How long the ad holds before the kiosk returns to the start
                    screen
                  </Text>
                </View>
              </View>
            )}

            {ads.length === 0 ? (
              <View className="items-center rounded-2xl border border-gray-200 bg-white p-8 dark:border-neutral-800 dark:bg-neutral-900">
                <Ionicons name="megaphone-outline" size={38} color="#D1D5DB" />
                <Text className="mb-1 mt-3 font-medium text-gray-900 dark:text-white">
                  No ads yet
                </Text>
                <Text className="text-center text-sm text-gray-500 dark:text-gray-400">
                  After a guest completes this waiver on the kiosk, a
                  full-screen ad can promote your attractions, parties, or
                  memberships — with an optional “learn more” link sent by email
                  or text. Upload your first ad to get started.
                </Text>
                <Pressable
                  onPress={() => openCreate(false)}
                  className="mt-4 flex-row items-center gap-2 rounded-xl bg-[#0644C7] px-4 py-2.5 active:opacity-90"
                  accessibilityRole="button"
                >
                  <Feather name="plus" size={14} color="#FFFFFF" />
                  <Text className="text-sm font-semibold text-white">
                    Upload an ad
                  </Text>
                </Pressable>
              </View>
            ) : (
              <>
                <View className="mb-3">
                  <Text className="font-semibold text-gray-900 dark:text-white">
                    Ads
                  </Text>
                  <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {settings?.rotationMode === "ordered"
                      ? "Use the arrows to set the display order."
                      : "Use the arrows to reorder — the order only matters when rotation is set to specific order."}
                  </Text>
                </View>

                {regularAds.length === 0 ? (
                  <View className="mb-6 items-center rounded-2xl border border-dashed border-gray-300 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
                    <Text className="text-center text-sm text-gray-500 dark:text-gray-400">
                      No regular ads yet — only the fallback below can show.
                    </Text>
                  </View>
                ) : (
                  <View className="mb-3">
                    {regularAds.map((ad, index) => (
                      <AdCard key={ad.id} ad={ad} index={index} />
                    ))}
                  </View>
                )}

                <View className="mb-3 flex-row flex-wrap items-center justify-between gap-2">
                  <View className="flex-row items-center gap-2">
                    <Feather name="shield" size={14} color="#6B7280" />
                    <Text className="font-semibold text-gray-900 dark:text-white">
                      Fallback ad
                    </Text>
                  </View>
                  {!fallbackAd && (
                    <Pressable
                      onPress={() => openCreate(true)}
                      className="flex-row items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 active:opacity-80 dark:border-neutral-700 dark:bg-neutral-900"
                      accessibilityRole="button"
                    >
                      <Feather name="plus" size={13} color={PRIMARY} />
                      <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-300">
                        Add fallback ad
                      </Text>
                    </Pressable>
                  )}
                </View>
                <Text className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  Used only when no regular ad is eligible — for example when
                  every ad is scheduled for another time or targets a different
                  location. Only one fallback is allowed.
                </Text>

                {fallbackAd ? (
                  <AdCard ad={fallbackAd} index={null} />
                ) : (
                  <View className="items-center rounded-2xl border border-dashed border-gray-300 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
                    <Text className="text-center text-sm text-gray-500 dark:text-gray-400">
                      No fallback ad — when no regular ad is eligible, the kiosk
                      simply returns to the start screen.
                    </Text>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Create / edit */}
      <BottomSheet
        visible={target !== null}
        onClose={closeForm}
        title={formTitle}
      >
        {/* No height of its own: the sheet is already capped at 80% of the
            screen, so the scroll view takes what is left and scrolls inside it.
            Pinning a maxHeight here fights that cap and strands the fields
            below the fold on shorter screens. */}
        <ScrollView
          className="px-5"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          <Text className={LABEL}>
            {target?.kind === "edit" ? "Replace image (optional)" : "Ad image"}
          </Text>
          <Pressable
            onPress={pickImage}
            className="items-center justify-center overflow-hidden rounded-lg border border-dashed border-gray-300 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="Choose an ad image"
          >
            {image || existingImage ? (
              <Image
                source={{ uri: image?.uri ?? existingImage! }}
                className="h-40 w-full"
                resizeMode="contain"
              />
            ) : (
              <View className="items-center py-8">
                <Feather name="upload" size={20} color="#9CA3AF" />
                <Text className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                  Choose an image
                </Text>
              </View>
            )}
          </Pressable>
          <Text className={HINT}>
            PNG, JPG, or WEBP up to 8MB. Portrait works best on the kiosk.
          </Text>

          <View className="mt-4">
            <InputField
              label="Name (optional)"
              value={form.name}
              onChangeText={(name) => setForm((f) => ({ ...f, name }))}
              placeholder="e.g. Summer Pass Promo"
            />
          </View>

          <View className="mt-4">
            <InputField
              label="Destination URL (optional)"
              value={form.destinationUrl}
              onChangeText={(destinationUrl) =>
                setForm((f) => ({ ...f, destinationUrl }))
              }
              placeholder="https://"
              autoCapitalize="none"
              keyboardType="url"
            />
            <Text className={HINT}>
              When set, guests can ask for a “learn more” link by email or text.
              {target?.kind === "edit" && target.ad.destinationUrl
                ? " Clear the field to remove the link."
                : ""}
            </Text>
          </View>

          {/* Targeting and schedule belong to ordinary ads: a fallback runs
              wherever and whenever nothing else is eligible. */}
          {!targetIsFallback && (
            <>
              {canTarget && locations.length > 0 && (
                <View className="mt-4">
                  <View className="mb-1.5 flex-row items-baseline justify-between">
                    <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
                      Locations
                    </Text>
                    <View className="flex-row items-center gap-2">
                      <Pressable
                        onPress={() =>
                          setForm((f) => ({
                            ...f,
                            locationIds: locations.map((l) => l.id),
                          }))
                        }
                        accessibilityRole="button"
                      >
                        <Text className="text-[11px] font-semibold text-[#0644C7]">
                          Select all
                        </Text>
                      </Pressable>
                      <Text className="text-gray-300">|</Text>
                      <Pressable
                        onPress={() =>
                          setForm((f) => ({ ...f, locationIds: [] }))
                        }
                        accessibilityRole="button"
                      >
                        <Text className="text-[11px] font-semibold text-gray-500">
                          Clear
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                  <View className="rounded-lg border border-gray-200 dark:border-neutral-700">
                    {/* Capped and independently scrollable, as the other sheets
                        with a long option list do, so a company with many
                        venues does not push the rest of the form out of reach. */}
                    <ScrollView
                      nestedScrollEnabled
                      style={{ maxHeight: 176 }}
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator={false}
                    >
                      {locations.map((loc) => {
                        const on = form.locationIds.includes(loc.id);
                        return (
                          <Pressable
                            key={loc.id}
                            onPress={() =>
                              setForm((f) => ({
                                ...f,
                                locationIds: on
                                  ? f.locationIds.filter((id) => id !== loc.id)
                                  : [...f.locationIds, loc.id],
                              }))
                            }
                            className={`flex-row items-center gap-3 border-b border-gray-100 px-3 py-2.5 dark:border-neutral-800 ${
                              on ? "bg-blue-50/60 dark:bg-blue-900/20" : ""
                            }`}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                          >
                            <View
                              className={`h-5 w-5 items-center justify-center rounded border ${
                                on
                                  ? "border-[#0644C7] bg-[#0644C7]"
                                  : "border-gray-300 dark:border-neutral-600"
                              }`}
                            >
                              {on && (
                                <Feather
                                  name="check"
                                  size={13}
                                  color="#FFFFFF"
                                />
                              )}
                            </View>
                            <Text className="flex-1 text-sm text-gray-800 dark:text-gray-100">
                              {loc.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                  <Text className={HINT}>
                    {form.locationIds.length === 0
                      ? "Nothing selected, so this ad runs at every location."
                      : `Runs at ${form.locationIds.length} of ${locations.length} locations.`}
                  </Text>
                </View>
              )}
              {!canTarget && (
                <Text className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-[11px] text-gray-500 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-gray-400">
                  This ad runs at your location. Ask a company admin to run it
                  at other venues.
                </Text>
              )}

              <View className="mt-4">
                <Text className={LABEL}>Starts / ends (optional)</Text>
                <Pressable
                  onPress={() => setShowSchedule(true)}
                  className="flex-row items-center justify-between rounded-lg border border-gray-200 px-3 py-3 active:opacity-80 dark:border-neutral-700"
                  accessibilityRole="button"
                >
                  <Text className="text-sm text-gray-800 dark:text-gray-100">
                    {form.startsAt || form.endsAt
                      ? `${
                          form.startsAt
                            ? formatShortDate(form.startsAt)
                            : "No start date"
                        } · ${
                          form.endsAt
                            ? `until ${formatShortDate(form.endsAt)}`
                            : "no end date"
                        }`
                      : "Always shown"}
                  </Text>
                  <Feather name="calendar" size={16} color="#9CA3AF" />
                </Pressable>
                {(form.startsAt || form.endsAt) && (
                  <Pressable
                    onPress={() =>
                      setForm((f) => ({ ...f, startsAt: "", endsAt: "" }))
                    }
                    className="mt-1.5 self-start"
                    accessibilityRole="button"
                  >
                    <Text className="text-[11px] font-semibold text-gray-500">
                      Clear both dates to remove the schedule.
                    </Text>
                  </Pressable>
                )}
              </View>
            </>
          )}

          <Pressable
            onPress={submitForm}
            disabled={busy || (target?.kind === "create" && !image)}
            className={`mt-6 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] py-4 active:opacity-90 ${
              busy || (target?.kind === "create" && !image) ? "opacity-50" : ""
            }`}
            accessibilityRole="button"
          >
            {busy && <ActivityIndicator size="small" color="#FFFFFF" />}
            <Text className="text-base font-semibold text-white">
              {target?.kind === "create" ? "Upload ad" : "Save changes"}
            </Text>
          </Pressable>
        </ScrollView>
      </BottomSheet>

      <DateRangeSheet
        visible={showSchedule}
        initialStart={form.startsAt || undefined}
        initialEnd={form.endsAt || undefined}
        onClose={() => setShowSchedule(false)}
        onApply={(startsAt, endsAt) => {
          setForm((f) => ({ ...f, startsAt, endsAt }));
          setShowSchedule(false);
        }}
      />

      <StatusModal {...status.props} />
    </View>
  );
};

export default TemplateAds;
