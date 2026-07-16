import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  SelectField,
  TextField,
  ToggleRow,
  type SelectOption,
} from "../../components/ui/FormControls";
import { mediaUrl } from "../../lib/api";
import { markPackagesStale } from "../../lib/hooks/usePackages";
import { getCurrentUser, getToken } from "../../lib/session";
import { fetchAddOns, type AddOnOption } from "../../services/addOnsService";
import {
  fetchAttractions,
  type AttractionRow,
} from "../../services/attractionsService";
import { fetchRooms, type RoomOption } from "../../services/bookingsService";
import {
  fetchCategories,
  type Category,
} from "../../services/categoriesService";
import {
  fetchGiftCards,
  type GiftCardOption,
} from "../../services/giftCardsService";
import {
  fetchPackageDetail,
  savePackageAvailabilitySchedules,
  updatePackage,
  type PackageDetail,
  type PackageScheduleInput,
} from "../../services/packagesService";
import { fetchPromos, type PromoOption } from "../../services/promosService";

const PRIMARY = "#0644C7";

const PACKAGE_TYPES: SelectOption[] = [
  { label: "Regular", value: "regular" },
  { label: "Custom", value: "custom" },
  { label: "Seasonal", value: "seasonal" },
  { label: "Holiday", value: "holiday" },
  { label: "Special", value: "special" },
];

const DURATION_UNITS: SelectOption[] = [
  { label: "Hours", value: "hours" },
  { label: "Minutes", value: "minutes" },
  { label: "Hours and minutes", value: "hours and minutes" },
];

const SCHEDULE_TYPES: SelectOption[] = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
];

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const OCCURRENCES: SelectOption[] = [
  { label: "First", value: "first" },
  { label: "Second", value: "second" },
  { label: "Third", value: "third" },
  { label: "Fourth", value: "fourth" },
  { label: "Last", value: "last" },
];

const WEEKDAY_OPTIONS: SelectOption[] = WEEKDAYS.map((d) => ({
  label: d[0].toUpperCase() + d.slice(1),
  value: d,
}));

const STEPS = [
  "Basic info",
  "Pricing & participants",
  "Booking rules",
  "Attractions, rooms & add-ons",
  "Promos & gift cards",
  "Availability",
  "Invitation & review",
];

const parseNum = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const parseIntOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
};

/** "9:0" → "09:00"; returns null when not a valid 24h time. */
const normalizeTime = (v: string): string | null => {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(v.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
};

/** "HH:MM:SS" | "HH:MM" → "HH:MM" for the editable time inputs. */
const toHHMM = (v: string | null): string => (v ? v.substring(0, 5) : "");

/** Local schedule row (richer than the payload shape to hold monthly occ/day). */
type SchedRow = {
  key: number;
  type: "daily" | "weekly" | "monthly";
  weekDays: string[];
  occurrence: string;
  monthlyDay: string;
  start: string;
  end: string;
  interval: string;
  isActive: boolean;
};

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <Text className="text-sm font-bold text-gray-900 dark:text-white mt-2 mb-1">
    {children}
  </Text>
);

const Chip = ({
  label,
  sub,
  selected,
  onPress,
}: {
  label: string;
  sub?: string;
  selected: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    className={`px-3 py-2 rounded-lg border mr-2 mb-2 ${
      selected
        ? "bg-[#0644C7] border-[#0644C7]"
        : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800"
    }`}
  >
    <Text
      className={`text-sm ${
        selected
          ? "text-white font-semibold"
          : "text-gray-700 dark:text-gray-200"
      }`}
    >
      {label}
      {sub ? ` · ${sub}` : ""}
    </Text>
  </Pressable>
);

/** Map the read-only detail schedules back into editable rows. */
const seedSchedules = (detail: PackageDetail): SchedRow[] =>
  detail.schedules.map((s, i) => {
    const type: SchedRow["type"] =
      s.availabilityType === "weekly" || s.availabilityType === "monthly"
        ? s.availabilityType
        : "daily";
    let occurrence = "first";
    let monthlyDay = "monday";
    if (type === "monthly" && s.dayConfiguration[0]) {
      const [occ, day] = s.dayConfiguration[0].split("-");
      if (occ) occurrence = occ;
      if (day) monthlyDay = day;
    }
    return {
      key: i,
      type,
      weekDays: type === "weekly" ? s.dayConfiguration : [],
      occurrence,
      monthlyDay,
      start: toHHMM(s.timeSlotStart) || "09:00",
      end: toHHMM(s.timeSlotEnd) || "17:00",
      interval: String(s.timeSlotInterval ?? 30),
      isActive: s.isActive,
    };
  });

const EditPackage = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const packageId = Number(params.id);

  const user = getCurrentUser();
  const userId = user?.id ?? 0;

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Location is not editable on edit (mirrors the web); shown read-only.
  const [locationName, setLocationName] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);

  // --- Step 1: basic info ---
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [packageType, setPackageType] = useState("regular");
  const [features, setFeatures] = useState<string[]>([""]);
  const [isActive, setIsActive] = useState(true);

  // --- Step 2: pricing & participants ---
  const [price, setPrice] = useState("");
  const [pricePerAdditional, setPricePerAdditional] = useState("");
  const [minParticipants, setMinParticipants] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [duration, setDuration] = useState("");
  const [durationUnit, setDurationUnit] = useState("hours");
  const [durationHours, setDurationHours] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");

  // --- Step 3: booking rules & deposits ---
  const [bookingWindowDays, setBookingWindowDays] = useState("");
  const [minNotice, setMinNotice] = useState("");
  const [partialPct, setPartialPct] = useState("0");
  const [partialFixed, setPartialFixed] = useState("0");
  const [hasGoh, setHasGoh] = useState(false);
  const [customerNotes, setCustomerNotes] = useState("");

  // --- Step 4: attractions / rooms / add-ons ---
  const [attractions, setAttractions] = useState<AttractionRow[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);
  const [addOns, setAddOns] = useState<AddOnOption[]>([]);
  const [attractionSel, setAttractionSel] = useState<number[]>([]);
  const [roomSel, setRoomSel] = useState<number[]>([]);
  const [addonOrder, setAddonOrder] = useState<number[]>([]);

  // --- Step 5: promos / gift cards ---
  const [promos, setPromos] = useState<PromoOption[]>([]);
  const [giftCards, setGiftCards] = useState<GiftCardOption[]>([]);
  const [promoSel, setPromoSel] = useState<number[]>([]);
  const [giftCardSel, setGiftCardSel] = useState<number[]>([]);

  // --- Step 6: availability ---
  const scheduleKey = useRef(1);
  const [schedules, setSchedules] = useState<SchedRow[]>([]);

  // --- Step 7: image + invitation ---
  const [existingImageUri, setExistingImageUri] = useState<string | null>(null);
  const [newImage, setNewImage] = useState<string | null>(null);
  const [invitationType, setInvitationType] = useState<"link" | "file">("link");
  const [invitationLink, setInvitationLink] = useState("");
  const [invitationFile, setInvitationFile] = useState<string | null>(null);
  const [invitationFileName, setInvitationFileName] = useState("");

  // Load the package + every option list up front so seeded relations always
  // resolve (chips render + add-on order names map at submit).
  useEffect(() => {
    if (!Number.isFinite(packageId) || packageId <= 0) {
      setLoadError("Missing package id.");
      setLoadingDetail(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setLoadError("Not signed in.");
      setLoadingDetail(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    (async () => {
      try {
        const detail = await fetchPackageDetail(
          token,
          packageId,
          controller.signal,
        );
        if (!active) return;
        const locId = detail.locationId ?? undefined;
        const [cats, atts, rms, ads, prs, gcs] = await Promise.all([
          fetchCategories(token).catch(() => []),
          fetchAttractions({ token, userId, locationId: locId }).catch(
            () => [],
          ),
          fetchRooms(token, locId).catch(() => []),
          fetchAddOns({ token, userId, locationId: locId, perPage: 500 }).catch(
            () => [],
          ),
          fetchPromos(token).catch(() => []),
          fetchGiftCards(token).catch(() => []),
        ]);
        if (!active) return;

        setCategories(cats);
        setAttractions(atts);
        setRooms(rms);
        setAddOns(ads);
        setPromos(prs);
        setGiftCards(gcs);

        // Seed every field from the fetched detail.
        setLocationName(detail.locationName || "Your location");
        setName(detail.name);
        setDescription(detail.description);
        setCategory(detail.category || null);
        setPackageType(detail.packageType || "regular");
        setFeatures(detail.features.length > 0 ? detail.features : [""]);
        setIsActive(detail.isActive);

        setPrice(detail.price != null ? String(detail.price) : "");
        setPricePerAdditional(
          detail.pricePerAdditional != null
            ? String(detail.pricePerAdditional)
            : "",
        );
        setMinParticipants(
          detail.minParticipants != null ? String(detail.minParticipants) : "",
        );
        setMaxParticipants(
          detail.maxParticipants != null ? String(detail.maxParticipants) : "",
        );
        setDurationUnit(detail.durationUnit || "hours");
        if (
          detail.durationUnit === "hours and minutes" &&
          detail.duration != null
        ) {
          setDurationHours(String(Math.floor(detail.duration)));
          setDurationMinutes(String(Math.round((detail.duration % 1) * 60)));
        } else {
          setDuration(detail.duration != null ? String(detail.duration) : "");
        }

        setBookingWindowDays(
          detail.bookingWindowDays != null
            ? String(detail.bookingWindowDays)
            : "",
        );
        setMinNotice(
          detail.minBookingNoticeHours != null
            ? String(detail.minBookingNoticeHours)
            : "",
        );
        setPartialPct(
          detail.partialPaymentPercentage != null
            ? String(detail.partialPaymentPercentage)
            : "0",
        );
        setPartialFixed(
          detail.partialPaymentFixed != null
            ? String(detail.partialPaymentFixed)
            : "0",
        );
        setHasGoh(detail.hasGuestOfHonor);
        setCustomerNotes(detail.customerNotes);

        setAttractionSel(detail.attractions.map((a) => a.id));
        setRoomSel(detail.rooms.map((r) => r.id));
        setAddonOrder(detail.addOns.map((a) => a.id));
        setPromoSel(detail.promos.map((p) => p.id));
        setGiftCardSel(detail.giftCards.map((g) => g.id));

        const seeded = seedSchedules(detail);
        scheduleKey.current = seeded.length;
        setSchedules(seeded);

        setExistingImageUri(
          detail.image.length > 0 ? mediaUrl(detail.image[0]) : null,
        );
        setInvitationLink(detail.invitationDownloadLink);
        setInvitationType("link");
      } catch (err) {
        if (active)
          setLoadError(
            err instanceof Error ? err.message : "Failed to load package.",
          );
      } finally {
        if (active) setLoadingDetail(false);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [packageId, userId]);

  const toggleIn = (arr: number[], id: number): number[] =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  /* --- image picker (lazy native import, base64 data URL) --------------- */
  const pickImage = async () => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Allow photo library access to add an image.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        base64: true,
        quality: 0.7,
      });
      if (result.canceled) return;
      const a = result.assets?.[0];
      if (a?.base64)
        setNewImage(`data:${a.mimeType ?? "image/jpeg"};base64,${a.base64}`);
    } catch {
      Alert.alert("Image error", "Could not open the image picker.");
    }
  };

  /* --- invitation file picker (lazy native import → base64 data URL) ----- */
  const pickInvitationFile = async () => {
    try {
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "image/png",
          "image/jpeg",
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      const resp = await fetch(asset.uri);
      const blob = await resp.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      setInvitationFile(dataUrl);
      setInvitationFileName(asset.name || "document");
    } catch {
      Alert.alert("File error", "Could not open the document picker.");
    }
  };

  /* --- schedule editing -------------------------------------------------- */
  const addSchedule = () =>
    setSchedules((prev) => [
      ...prev,
      {
        key: scheduleKey.current++,
        type: "daily",
        weekDays: [],
        occurrence: "first",
        monthlyDay: "monday",
        start: "09:00",
        end: "17:00",
        interval: "30",
        isActive: true,
      },
    ]);
  const removeSchedule = (key: number) =>
    setSchedules((prev) => prev.filter((s) => s.key !== key));
  const patchSchedule = (key: number, patch: Partial<SchedRow>) =>
    setSchedules((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );

  /* --- per-step validation on Next -------------------------------------- */
  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!name.trim()) return "Package name is required.";
      if (!description.trim()) return "Description is required.";
      const cat = useCustomCategory ? customCategory : category;
      if (!cat || !String(cat).trim()) return "Please choose a category.";
    }
    if (s === 1) {
      const p = parseNum(price);
      if (p == null || p < 0) return "Please enter a valid price.";
      if (durationUnit === "hours and minutes") {
        const h = parseNum(durationHours) ?? 0;
        const m = parseNum(durationMinutes) ?? 0;
        if (h === 0 && m === 0) return "Please enter a duration.";
      } else {
        const d = parseNum(duration);
        if (d == null || d < 1) return "Duration must be at least 1.";
      }
    }
    return null;
  };

  const goNext = () => {
    const err = validateStep(step);
    if (err) {
      Alert.alert("Check this step", err);
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const resolvedDuration = (): number | null => {
    if (durationUnit === "hours and minutes") {
      const h = parseNum(durationHours) ?? 0;
      const m = parseNum(durationMinutes) ?? 0;
      const total = h + m / 60;
      return total > 0 ? total : null;
    }
    return parseNum(duration);
  };

  const buildSchedulePayload = (): PackageScheduleInput[] =>
    schedules.map((s) => ({
      availabilityType: s.type,
      dayConfiguration:
        s.type === "weekly"
          ? s.weekDays
          : s.type === "monthly"
            ? [`${s.occurrence}-${s.monthlyDay}`]
            : [],
      timeSlotStart: normalizeTime(s.start) ?? "09:00",
      timeSlotEnd: normalizeTime(s.end) ?? "17:00",
      timeSlotInterval: parseIntOrNull(s.interval) ?? 30,
      isActive: s.isActive,
    }));

  const handleSubmit = async () => {
    for (let s = 0; s <= 1; s++) {
      const err = validateStep(s);
      if (err) {
        setStep(s);
        Alert.alert("Check this step", err);
        return;
      }
    }
    // Schedules are optional on edit (matches the web — only replaced when
    // present), but any row that IS present must be valid.
    for (const s of schedules) {
      if (!normalizeTime(s.start) || !normalizeTime(s.end))
        return Alert.alert(
          "Invalid time",
          "Schedule times must be in HH:MM (24-hour) format.",
        );
      const iv = parseIntOrNull(s.interval);
      if (iv == null || iv < 15)
        return Alert.alert(
          "Invalid interval",
          "Time slot interval must be at least 15 minutes.",
        );
      if (s.type === "weekly" && s.weekDays.length === 0)
        return Alert.alert(
          "Pick days",
          "Select at least one day for a weekly schedule.",
        );
    }

    const dur = resolvedDuration();
    if (dur == null || dur <= 0)
      return Alert.alert("Invalid duration", "Please enter a valid duration.");

    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");

    const categoryValue = (
      useCustomCategory ? customCategory : (category ?? "")
    ).trim();

    setSubmitting(true);
    try {
      await updatePackage(token, packageId, {
        name: name.trim(),
        description: description.trim(),
        category: categoryValue,
        packageType,
        features: features.map((f) => f.trim()).filter(Boolean),
        price: parseNum(price) ?? 0,
        pricePerAdditional: maxParticipants.trim()
          ? parseNum(pricePerAdditional)
          : null,
        minParticipants: parseIntOrNull(minParticipants),
        maxParticipants: parseIntOrNull(maxParticipants),
        duration: dur,
        durationUnit,
        bookingWindowDays: parseIntOrNull(bookingWindowDays),
        minBookingNoticeHours: parseIntOrNull(minNotice),
        hasGuestOfHonor: hasGoh,
        partialPaymentPercentage: parseIntOrNull(partialPct),
        partialPaymentFixed: parseNum(partialFixed),
        customerNotes: customerNotes.trim(),
        invitationDownloadLink:
          invitationType === "link" ? invitationLink.trim() : "",
        invitationFile: invitationType === "file" ? invitationFile : null,
        displayOrder: null,
        isActive,
        image: newImage,
        attractionIds: attractionSel,
        addonIds: addonOrder,
        addOnsOrder: addonOrder
          .map((aid) => addOns.find((a) => a.id === aid)?.name)
          .filter((n): n is string => !!n),
        roomIds: roomSel,
        promoIds: promoSel,
        giftCardIds: giftCardSel,
      });

      if (schedules.length > 0) {
        try {
          await savePackageAvailabilitySchedules(
            token,
            packageId,
            buildSchedulePayload(),
          );
        } catch {
          markPackagesStale();
          Alert.alert(
            "Partly saved",
            "The package was updated, but its availability schedule could not be saved. You can adjust it from the web admin.",
          );
          router.back();
          return;
        }
      }

      markPackagesStale();
      Alert.alert("Package updated", `"${name.trim()}" was saved.`);
      router.back();
    } catch (err) {
      Alert.alert(
        "Update failed",
        err instanceof Error ? err.message : "Could not update the package.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isLast = step === STEPS.length - 1;

  const categoryOptions = useMemo(() => {
    const opts = categories.map((c) => ({ label: c.name, value: c.name }));
    // Ensure the package's current category is always selectable.
    if (category && !opts.some((o) => o.value === category)) {
      opts.unshift({ label: category, value: category });
    }
    return opts;
  }, [categories, category]);

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-4 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={PRIMARY} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Edit Package
          </Text>
          <View style={{ width: 36 }} />
        </View>
        {!loadingDetail && !loadError && (
          <View className="mt-3">
            <Text className="text-xs font-semibold text-[#0644C7]">
              Step {step + 1} of {STEPS.length} · {STEPS[step]}
            </Text>
            <View className="flex-row gap-1 mt-2">
              {STEPS.map((_, i) => (
                <View
                  key={i}
                  className={`flex-1 h-1 rounded-full ${
                    i <= step
                      ? "bg-[#0644C7]"
                      : "bg-gray-200 dark:bg-neutral-800"
                  }`}
                />
              ))}
            </View>
          </View>
        )}
      </View>

      {loadingDetail ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      ) : loadError ? (
        <View className="flex-1 items-center justify-center px-8">
          <Feather name="alert-circle" size={40} color="#EF4444" />
          <Text className="text-sm text-gray-600 dark:text-gray-300 mt-3 text-center">
            {loadError}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-4 px-5 py-2.5 rounded-xl bg-[#0644C7]"
          >
            <Text className="text-sm font-semibold text-white">Go back</Text>
          </Pressable>
        </View>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* STEP 1 — Basic info */}
            {step === 0 && (
              <View className="gap-4">
                {/* Package image — shown at the top of the form, matching the web admin. */}
                <SectionLabel>Package image</SectionLabel>
                {newImage || existingImageUri ? (
                  <View>
                    <Image
                      source={{
                        uri: newImage ?? existingImageUri ?? undefined,
                      }}
                      style={{ width: "100%", height: 160, borderRadius: 12 }}
                      resizeMode="cover"
                    />
                    <View className="flex-row gap-4 mt-2">
                      <Pressable onPress={pickImage}>
                        <Text className="text-xs font-semibold text-[#0644C7]">
                          Replace image
                        </Text>
                      </Pressable>
                      {newImage && (
                        <Pressable onPress={() => setNewImage(null)}>
                          <Text className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                            Undo change
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={pickImage}
                    className="flex-row items-center justify-center gap-2 py-4 rounded-xl border border-dashed border-gray-300 dark:border-neutral-700"
                  >
                    <Feather name="image" size={18} color={PRIMARY} />
                    <Text className="text-sm font-medium text-[#0644C7]">
                      Choose image
                    </Text>
                  </Pressable>
                )}

                <View>
                  <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                    Location
                  </Text>
                  <View className="rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800">
                    <Text className="text-sm text-gray-700 dark:text-gray-200">
                      {locationName}
                    </Text>
                  </View>
                </View>

                <TextField
                  label="Name"
                  required
                  value={name}
                  onChangeText={setName}
                  placeholder="Package name"
                />
                <TextField
                  label="Description"
                  required
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Describe this package"
                  multiline
                />

                {useCustomCategory ? (
                  <TextField
                    label="Category"
                    required
                    value={customCategory}
                    onChangeText={setCustomCategory}
                    placeholder="New category name"
                    hint="Tap below to pick from existing categories instead."
                  />
                ) : (
                  <SelectField
                    label="Category"
                    required
                    placeholder="Select a category"
                    value={category}
                    options={categoryOptions}
                    onSelect={(v) => setCategory(String(v))}
                  />
                )}
                <Pressable onPress={() => setUseCustomCategory((v) => !v)}>
                  <Text className="text-xs font-semibold text-[#0644C7]">
                    {useCustomCategory
                      ? "Pick existing category"
                      : "＋ New category"}
                  </Text>
                </Pressable>

                <SelectField
                  label="Package type"
                  value={packageType}
                  options={PACKAGE_TYPES}
                  onSelect={(v) => setPackageType(String(v))}
                />

                <View>
                  <SectionLabel>Features</SectionLabel>
                  {features.map((f, i) => (
                    <View key={i} className="flex-row items-center gap-2 mb-2">
                      <View className="flex-1">
                        <TextField
                          value={f}
                          onChangeText={(t) =>
                            setFeatures((prev) =>
                              prev.map((x, xi) => (xi === i ? t : x)),
                            )
                          }
                          placeholder={`Feature ${i + 1}`}
                        />
                      </View>
                      <Pressable
                        onPress={() =>
                          setFeatures((prev) =>
                            prev.length === 1
                              ? [""]
                              : prev.filter((_, xi) => xi !== i),
                          )
                        }
                        className="p-2"
                      >
                        <Feather name="x" size={18} color="#9CA3AF" />
                      </Pressable>
                    </View>
                  ))}
                  <Pressable
                    onPress={() => setFeatures((prev) => [...prev, ""])}
                  >
                    <Text className="text-xs font-semibold text-[#0644C7]">
                      ＋ Add feature
                    </Text>
                  </Pressable>
                </View>

                <ToggleRow
                  label="Active"
                  value={isActive}
                  onValueChange={setIsActive}
                />
              </View>
            )}

            {/* STEP 2 — Pricing & participants */}
            {step === 1 && (
              <View className="gap-4">
                <View>
                  <Text className="text-sm font-bold text-gray-900 dark:text-white">
                    Pricing
                  </Text>
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">
                    Set the base price for this package (before any add-ons or
                    additional participants)
                  </Text>
                  <TextField
                    label="Base Price"
                    required
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </View>

                <View>
                  <Text className="text-sm font-bold text-gray-900 dark:text-white">
                    Partial Payment Options
                  </Text>
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">
                    Configure partial payment options for customers (percentage
                    or fixed amount)
                  </Text>
                  <View className="gap-3">
                    <TextField
                      label="Partial Payment Percentage (%)"
                      value={partialPct}
                      onChangeText={setPartialPct}
                      keyboardType="number-pad"
                      placeholder="0"
                      hint="Leave 0 to disable percentage-based partial payment."
                    />
                    <TextField
                      label="Partial Payment Fixed Amount ($)"
                      value={partialFixed}
                      onChangeText={setPartialFixed}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      hint="Leave 0 to disable fixed amount partial payment."
                    />
                  </View>
                </View>

                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <TextField
                      label="Min participants"
                      value={minParticipants}
                      onChangeText={setMinParticipants}
                      keyboardType="number-pad"
                      placeholder="1"
                    />
                  </View>
                  <View className="flex-1">
                    <TextField
                      label="Max participants"
                      value={maxParticipants}
                      onChangeText={setMaxParticipants}
                      keyboardType="number-pad"
                      placeholder="—"
                    />
                  </View>
                </View>

                {/* Per-additional pricing — only relevant with a max cap (web parity). */}
                {maxParticipants.trim() !== "" && (
                  <TextField
                    label="Price per additional participant"
                    value={pricePerAdditional}
                    onChangeText={setPricePerAdditional}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                )}

                <SelectField
                  label="Duration unit"
                  required
                  value={durationUnit}
                  options={DURATION_UNITS}
                  onSelect={(v) => setDurationUnit(String(v))}
                />
                {durationUnit === "hours and minutes" ? (
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <TextField
                        label="Hours"
                        value={durationHours}
                        onChangeText={setDurationHours}
                        keyboardType="number-pad"
                        placeholder="0"
                      />
                    </View>
                    <View className="flex-1">
                      <TextField
                        label="Minutes"
                        value={durationMinutes}
                        onChangeText={setDurationMinutes}
                        keyboardType="number-pad"
                        placeholder="0"
                      />
                    </View>
                  </View>
                ) : (
                  <TextField
                    label="Duration"
                    required
                    value={duration}
                    onChangeText={setDuration}
                    keyboardType="decimal-pad"
                    placeholder="0"
                  />
                )}
              </View>
            )}

            {/* STEP 3 — Booking rules & deposits */}
            {step === 2 && (
              <View className="gap-4">
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <TextField
                      label="Booking window (days)"
                      value={bookingWindowDays}
                      onChangeText={setBookingWindowDays}
                      keyboardType="number-pad"
                      placeholder="No limit"
                    />
                  </View>
                  <View className="flex-1">
                    <TextField
                      label="Min. notice (hours)"
                      value={minNotice}
                      onChangeText={setMinNotice}
                      keyboardType="number-pad"
                      placeholder="0"
                    />
                  </View>
                </View>
                <ToggleRow
                  label="Has guest of honor"
                  value={hasGoh}
                  onValueChange={setHasGoh}
                />
                <TextField
                  label="Customer Notes"
                  value={customerNotes}
                  onChangeText={setCustomerNotes}
                  placeholder="Notes shown to customers"
                  multiline
                />
              </View>
            )}

            {/* STEP 4 — Attractions / rooms / add-ons */}
            {step === 3 && (
              <View>
                <SectionLabel>Attractions</SectionLabel>
                {attractions.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500 mb-2">
                    No attractions available.
                  </Text>
                ) : (
                  <View className="flex-row flex-wrap">
                    {attractions.map((a) => (
                      <Chip
                        key={a.id}
                        label={a.name}
                        sub={a.price ? `$${a.price}` : undefined}
                        selected={attractionSel.includes(a.id)}
                        onPress={() =>
                          setAttractionSel((prev) => toggleIn(prev, a.id))
                        }
                      />
                    ))}
                  </View>
                )}

                <SectionLabel>Spaces (rooms)</SectionLabel>
                {rooms.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500 mb-2">
                    No rooms available.
                  </Text>
                ) : (
                  <View className="flex-row flex-wrap">
                    {rooms.map((r) => (
                      <Chip
                        key={r.id}
                        label={r.name}
                        selected={roomSel.includes(r.id)}
                        onPress={() =>
                          setRoomSel((prev) => toggleIn(prev, r.id))
                        }
                      />
                    ))}
                  </View>
                )}

                <SectionLabel>Add-ons</SectionLabel>
                {addOns.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500 mb-2">
                    No add-ons available.
                  </Text>
                ) : (
                  <View className="flex-row flex-wrap">
                    {addOns.map((a) => (
                      <Chip
                        key={a.id}
                        label={a.name}
                        sub={a.price ? `$${a.price}` : undefined}
                        selected={addonOrder.includes(a.id)}
                        onPress={() =>
                          setAddonOrder((prev) => toggleIn(prev, a.id))
                        }
                      />
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* STEP 5 — Promos / gift cards */}
            {step === 4 && (
              <View>
                <SectionLabel>Promos</SectionLabel>
                {promos.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500 mb-2">
                    No active promos.
                  </Text>
                ) : (
                  <View className="flex-row flex-wrap">
                    {promos.map((p) => (
                      <Chip
                        key={p.id}
                        label={p.name}
                        sub={p.code}
                        selected={promoSel.includes(p.id)}
                        onPress={() =>
                          setPromoSel((prev) => toggleIn(prev, p.id))
                        }
                      />
                    ))}
                  </View>
                )}

                <SectionLabel>Gift cards</SectionLabel>
                {giftCards.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500 mb-2">
                    No active gift cards.
                  </Text>
                ) : (
                  <View className="flex-row flex-wrap">
                    {giftCards.map((g) => (
                      <Chip
                        key={g.id}
                        label={g.code}
                        selected={giftCardSel.includes(g.id)}
                        onPress={() =>
                          setGiftCardSel((prev) => toggleIn(prev, g.id))
                        }
                      />
                    ))}
                  </View>
                )}
              </View>
            )}

            {/* STEP 6 — Availability */}
            {step === 5 && (
              <View className="gap-4">
                <Text className="text-xs text-gray-400 dark:text-gray-500">
                  Existing schedules are shown below; add, edit, or remove them.
                </Text>
                {schedules.map((s, idx) => (
                  <View
                    key={s.key}
                    className="rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 gap-3"
                  >
                    <View className="flex-row items-center justify-between">
                      <Text className="text-sm font-bold text-gray-900 dark:text-white">
                        Schedule {idx + 1}
                      </Text>
                      <Pressable onPress={() => removeSchedule(s.key)}>
                        <Feather name="trash-2" size={16} color="#dc2626" />
                      </Pressable>
                    </View>

                    <SelectField
                      label="Type"
                      value={s.type}
                      options={SCHEDULE_TYPES}
                      onSelect={(v) =>
                        patchSchedule(s.key, { type: v as SchedRow["type"] })
                      }
                    />

                    {s.type === "weekly" && (
                      <View className="flex-row flex-wrap">
                        {WEEKDAYS.map((d) => (
                          <Chip
                            key={d}
                            label={d[0].toUpperCase() + d.slice(1, 3)}
                            selected={s.weekDays.includes(d)}
                            onPress={() =>
                              patchSchedule(s.key, {
                                weekDays: s.weekDays.includes(d)
                                  ? s.weekDays.filter((x) => x !== d)
                                  : [...s.weekDays, d],
                              })
                            }
                          />
                        ))}
                      </View>
                    )}

                    {s.type === "monthly" && (
                      <View className="flex-row gap-3">
                        <View className="flex-1">
                          <SelectField
                            label="Occurrence"
                            value={s.occurrence}
                            options={OCCURRENCES}
                            onSelect={(v) =>
                              patchSchedule(s.key, { occurrence: String(v) })
                            }
                          />
                        </View>
                        <View className="flex-1">
                          <SelectField
                            label="Day"
                            value={s.monthlyDay}
                            options={WEEKDAY_OPTIONS}
                            onSelect={(v) =>
                              patchSchedule(s.key, { monthlyDay: String(v) })
                            }
                          />
                        </View>
                      </View>
                    )}

                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <TextField
                          label="Start (HH:MM)"
                          value={s.start}
                          onChangeText={(t) =>
                            patchSchedule(s.key, { start: t })
                          }
                          placeholder="09:00"
                        />
                      </View>
                      <View className="flex-1">
                        <TextField
                          label="End (HH:MM)"
                          value={s.end}
                          onChangeText={(t) => patchSchedule(s.key, { end: t })}
                          placeholder="17:00"
                        />
                      </View>
                    </View>
                    <TextField
                      label="Slot interval (min)"
                      value={s.interval}
                      onChangeText={(t) =>
                        patchSchedule(s.key, { interval: t })
                      }
                      keyboardType="number-pad"
                      placeholder="30"
                      hint="Minimum 15 minutes."
                    />
                    <ToggleRow
                      label="Active"
                      value={s.isActive}
                      onValueChange={(v) =>
                        patchSchedule(s.key, { isActive: v })
                      }
                    />
                  </View>
                ))}
                <Pressable onPress={addSchedule}>
                  <Text className="text-xs font-semibold text-[#0644C7]">
                    ＋ Add schedule
                  </Text>
                </Pressable>
              </View>
            )}

            {/* STEP 7 — Invitation & review */}
            {step === 6 && (
              <View className="gap-4">
                <View>
                  <SectionLabel>Invitation template (optional)</SectionLabel>
                  <View className="flex-row gap-2 mb-3">
                    {(["link", "file"] as const).map((t) => {
                      const active = invitationType === t;
                      return (
                        <Pressable
                          key={t}
                          onPress={() => setInvitationType(t)}
                          className={`flex-1 items-center py-2.5 rounded-xl border ${
                            active
                              ? "bg-[#0644C7] border-[#0644C7]"
                              : "bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800"
                          }`}
                        >
                          <Text
                            className={`text-sm font-semibold ${
                              active
                                ? "text-white"
                                : "text-gray-700 dark:text-gray-200"
                            }`}
                          >
                            {t === "link" ? "Link" : "File"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {invitationType === "link" ? (
                    <TextField
                      value={invitationLink}
                      onChangeText={setInvitationLink}
                      placeholder="https://…"
                      autoCapitalize="none"
                    />
                  ) : invitationFile ? (
                    <View className="flex-row items-center justify-between rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800">
                      <View className="flex-row items-center gap-2 flex-1 mr-2">
                        <Feather name="file-text" size={16} color={PRIMARY} />
                        <Text
                          className="text-sm text-gray-700 dark:text-gray-200 flex-1"
                          numberOfLines={1}
                        >
                          {invitationFileName}
                        </Text>
                      </View>
                      <View className="flex-row gap-3">
                        <Pressable onPress={pickInvitationFile}>
                          <Text className="text-xs font-semibold text-[#0644C7]">
                            Replace
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setInvitationFile(null);
                            setInvitationFileName("");
                          }}
                        >
                          <Text className="text-xs font-semibold text-red-600">
                            Remove
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      onPress={pickInvitationFile}
                      className="flex-row items-center justify-center gap-2 py-4 rounded-xl border border-dashed border-gray-300 dark:border-neutral-700"
                    >
                      <Feather name="upload" size={18} color={PRIMARY} />
                      <Text className="text-sm font-medium text-[#0644C7]">
                        Choose file (PDF, DOC, image)
                      </Text>
                    </Pressable>
                  )}
                </View>

                <SectionLabel>Review</SectionLabel>
                <View className="rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 gap-1.5">
                  <Text className="text-base font-bold text-gray-900 dark:text-white">
                    {name.trim() || "Untitled package"}
                  </Text>
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    {(useCustomCategory ? customCategory : category) || "—"} ·{" "}
                    {packageType}
                  </Text>
                  <Text className="text-sm text-gray-700 dark:text-gray-200">
                    ${(parseNum(price) ?? 0).toFixed(2)}
                    {resolvedDuration()
                      ? ` · ${resolvedDuration()} ${durationUnit}`
                      : ""}
                  </Text>
                  <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {attractionSel.length} attractions · {roomSel.length} rooms
                    · {addonOrder.length} add-ons · {promoSel.length} promos ·{" "}
                    {giftCardSel.length} gift cards · {schedules.length}{" "}
                    schedule(s)
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer nav */}
          <View
            className="flex-row gap-3 px-5 pt-3 border-t border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900"
            style={{ paddingBottom: insets.bottom + 12 }}
          >
            {step > 0 && (
              <Pressable
                onPress={goBack}
                disabled={submitting}
                className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
              >
                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Back
                </Text>
              </Pressable>
            )}
            {isLast ? (
              <Pressable
                onPress={handleSubmit}
                disabled={submitting}
                className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7] active:opacity-90"
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Feather name="check" size={16} color="#fff" />
                    <Text className="text-sm font-semibold text-white">
                      Save changes
                    </Text>
                  </>
                )}
              </Pressable>
            ) : (
              <Pressable
                onPress={goNext}
                className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7] active:opacity-90"
              >
                <Text className="text-sm font-semibold text-white">Next</Text>
                <Feather name="chevron-right" size={16} color="#fff" />
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
};

export default EditPackage;
