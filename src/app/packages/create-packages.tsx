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
  SegmentedToggle,
  SelectField,
  TextField,
  ToggleRow,
  type SelectOption,
} from "../../components/ui/FormControls";
import {
  CallToBookNotice,
  CARD_SHADOW,
  Section,
} from "../../components/ui/attractionFormKit";
import {
  packageIsCallToBook,
  type PackageScheduleLike,
} from "../../lib/callToBook";
import { markPackagesStale } from "../../lib/hooks/usePackages";

import { generateScheduleSlots } from "../../lib/packages/scheduleSlots";
import { formatDuration } from "../../lib/time";
import {
  packageDurationMinutes,
  validatePackageSetup,
} from "../../lib/packageSetup";
import { getCurrentUser, getToken } from "../../lib/session";
import { fetchAddOns, type AddOnOption } from "../../services/addOnsService";
import {
  fetchAttractions,
  type AttractionRow,
} from "../../services/attractionsService";
import { fetchCategories, type Category } from "../../services/categoriesService";
import { fetchRooms, type RoomOption } from "../../services/bookingsService";
import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";
import {
  createPackage,
  savePackageAvailabilitySchedules,
  type PackagePricingType,
  type PackageScheduleInput,
} from "../../services/packagesService";


const PRIMARY = "#0644C7";

/** Booking-window shortcuts, in days — the web's 1mo…12mo row (30-day months). */
const BOOKING_WINDOW_PRESETS = Array.from({ length: 12 }, (_, i) => ({
  label: `${i + 1}mo`,
  days: (i + 1) * 30,
}));

/** Advance-notice shortcuts, in hours — the web's 1h…4 weeks rows. */
const ADVANCE_NOTICE_PRESETS: { label: string; hours: number }[] = [
  ...Array.from({ length: 12 }, (_, i) => ({
    label: `${i + 1} h`,
    hours: i + 1,
  })),
  { label: "1 day", hours: 24 },
  { label: "2 days", hours: 48 },
  { label: "3 days", hours: 72 },
  { label: "4 days", hours: 96 },
  { label: "5 days", hours: 120 },
  { label: "6 days", hours: 144 },
  { label: "1 week", hours: 168 },
  { label: "2 weeks", hours: 336 },
  { label: "3 weeks", hours: 504 },
  { label: "4 weeks", hours: 672 },
];

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


const parseNum = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
/** "13:30" -> "1:30 PM", for the generated-slot chips. */
const to12h = (hhmm: string): string => {
  const [h, m] = hhmm.split(":");
  let hour = Number(h);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${m} ${meridian}`;
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
  /** Per-schedule override of the package minimum; blank uses the default. */
  minPlayers: string;
  isActive: boolean;
};

/** One editor row in the shape `packageIsCallToBook` reads. Times are passed
 *  through as typed — unlike the save payload, which substitutes defaults for
 *  blanks — so a row with no times correctly reads as unusable here. */
const toScheduleLike = (s: SchedRow): PackageScheduleLike => ({
  availabilityType: s.type,
  dayConfiguration:
    s.type === "weekly"
      ? s.weekDays
      : s.type === "monthly"
        ? [`${s.occurrence}-${s.monthlyDay}`]
        : [],
  timeSlotStart: s.start || null,
  timeSlotEnd: s.end || null,
  isActive: s.isActive,
});

/* --- Small presentational helpers --------------------------------------- */

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
        selected ? "text-white font-semibold" : "text-gray-700 dark:text-gray-200"
      }`}
    >
      {label}
      {sub ? ` · ${sub}` : ""}
    </Text>
  </Pressable>
);

/**
 * Create Package — one scrolling form of stacked sections, mirroring the web
 * `/packages/create` and the app's Edit Attraction layout. Posts to
 * POST /api/packages, then saves availability via
 * PUT /api/packages/{id}/availability-schedules (exactly as the web does).
 * Option lists (attractions/rooms/add-ons/promos/gift-cards/categories) come
 * from existing endpoints — all confirmed payload-safe (no base64), so no new
 * backend endpoints were needed.
 */
const CreatePackage = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: string }>();

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const userId = user?.id ?? 0;


  const [submitting, setSubmitting] = useState(false);

  // --- Location + categories (loaded on mount) ---
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [locationId, setLocationId] = useState<number | null>(
    isCompanyAdmin ? null : (user?.location_id ?? null),
  );

  const initialType =
    typeof params.type === "string" &&
    PACKAGE_TYPES.some((t) => t.value === params.type)
      ? params.type
      : "regular";

  // --- Step 1: basic info ---
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [customCategory, setCustomCategory] = useState("");
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [packageType, setPackageType] = useState(initialType);
  const [features, setFeatures] = useState<string[]>([""]);
  const [isActive, setIsActive] = useState(true);

  // --- Step 2: pricing & participants ---
  const [price, setPrice] = useState("");
  const [pricingType, setPricingType] = useState<PackagePricingType>("base");
  const [pricePerAdditional, setPricePerAdditional] = useState("");
  const [minParticipants, setMinParticipants] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [maxTicketsPerSlot, setMaxTicketsPerSlot] = useState("");
  const [participantLabel, setParticipantLabel] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");
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
  const [loadingRelations, setLoadingRelations] = useState(false);

  const [attractionSel, setAttractionSel] = useState<number[]>([]);
  const [roomSel, setRoomSel] = useState<number[]>([]);
  const [addonOrder, setAddonOrder] = useState<number[]>([]);



  // --- Step 6: availability ---
  const scheduleKey = useRef(1);
  /**
   * Starts empty, as the web's create form does. A package with no schedule is
   * a valid configuration — it sells as Call to Book — so the form opens on
   * that state and its notice, rather than pre-filling a 09:00–17:00 daily
   * schedule the user never asked for.
   */
  const [schedules, setSchedules] = useState<SchedRow[]>([]);

  // --- Step 7: image + invitation ---
  const [image, setImage] = useState<string | null>(null);
  const [invitationType, setInvitationType] = useState<"link" | "file">("link");
  const [invitationLink, setInvitationLink] = useState("");
  const [invitationFile, setInvitationFile] = useState<string | null>(null);
  const [invitationFileName, setInvitationFileName] = useState("");

  // Load locations + categories on mount (needed by the Details section).
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let active = true;
    const controller = new AbortController();
    Promise.all([
      fetchLocations(token, controller.signal).catch(() => []),
      fetchCategories(token).catch(() => []),
    ]).then(([locs, cats]) => {
      if (!active) return;
      setLocations(locs);
      setCategories(cats);
      // Deliberately not auto-selecting the first location: the grid starts
      // empty so the "select a location" notice is the first thing staff see,
      // matching the web. A manager's own location is still locked in below.
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [isCompanyAdmin]);

  /**
   * Attraction / room / add-on options, keyed on the selected location.
   *
   * Deliberately NOT a load-once latch: the form is one page now and starts
   * with no location chosen, so a latch would fetch unscoped lists on mount and
   * then never refresh when a location is picked — leaving another venue's
   * rooms on screen. Re-running per location also clears any selection carried
   * over from the previous one, which would no longer be valid.
   */
  useEffect(() => {
    // A company admin must choose first; a manager is already scoped server-side.
    if (isCompanyAdmin && locationId == null) {
      setAttractions([]);
      setRooms([]);
      setAddOns([]);
      return;
    }
    const token = getToken();
    if (!token) return;
    let active = true;
    setLoadingRelations(true);
    const locId = locationId ?? undefined;
    Promise.all([
      fetchAttractions({ token, userId, locationId: locId }).catch(() => []),
      fetchRooms(token, locId).catch(() => []),
      fetchAddOns({ token, userId, locationId: locId, perPage: 500 }).catch(
        () => [],
      ),
    ]).then(([atts, rms, ads]) => {
      if (!active) return;
      setAttractions(atts);
      setRooms(rms);
      setAddOns(ads);
      setLoadingRelations(false);
    });
    return () => {
      active = false;
    };
  }, [locationId, userId, isCompanyAdmin]);

  // A selection made against one venue cannot survive a move to another.
  const prevLocationRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevLocationRef.current !== null && prevLocationRef.current !== locationId) {
      setAttractionSel([]);
      setRoomSel([]);
      setAddonOrder([]);
    }
    prevLocationRef.current = locationId;
  }, [locationId]);


  const lockedLocationName = useMemo(() => {
    if (isCompanyAdmin) return null;
    return (
      user?.location?.name ||
      locations.find((l) => l.id === locationId)?.name ||
      "Your location"
    );
  }, [isCompanyAdmin, user, locations, locationId]);

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
      if (a?.base64) setImage(`data:${a.mimeType ?? "image/jpeg"};base64,${a.base64}`);
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
      // Read the picked file into a base64 data URL (RN Blob + FileReader), the
      // same encoding the web sends as `invitation_file`.
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
        minPlayers: "",
        isActive: true,
      },
    ]);
  const removeSchedule = (key: number) =>
    setSchedules((prev) => prev.filter((s) => s.key !== key));
  const patchSchedule = (key: number, patch: Partial<SchedRow>) =>
    setSchedules((prev) =>
      prev.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    );

  /* --- pricing-mode labels (web parity) ---------------------------------- */
  const perPerson = pricingType === "per_person";
  const guestLabel = participantLabel.trim();
  const playerWord = guestLabel || "Player";
  const participantWord = guestLabel || (perPerson ? "Player" : "Participant");

  /**
   * Field validation, grouped the way the form reads: 0 is the Details section,
   * 1 is Pricing & Players. Kept as groups (rather than one flat function) so
   * the first failure reported is the one nearest the top of the page.
   */
  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (locationId == null) return "Please select a location.";
      if (!name.trim()) return "Package name is required.";
      if (!description.trim()) return "Description is required.";
      const cat = useCustomCategory ? customCategory : category;
      if (!cat || !String(cat).trim()) return "Please choose a category.";
    }
    if (s === 1) {
      const p = parseNum(price);
      if (p == null || p < 0) return "Please enter a valid price.";
      const maxP = parseIntOrNull(maxParticipants);
      if (maxParticipants.trim() && (maxP == null || maxP < 1))
        return "Please enter a valid max participants (minimum 1)";
      const minP = parseIntOrNull(minParticipants);
      if (minParticipants.trim() && (minP == null || minP < 1))
        return "Please enter a valid min participants (minimum 1)";
      if (minP && maxP && minP > maxP)
        return "Minimum cannot be greater than maximum";
      if (perPerson && (!minP || !maxP))
        return `Per-${playerWord.toLowerCase()} pricing needs both minimum and maximum ${playerWord.toLowerCase()}s`;
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


  const resolvedDuration = (): number | null => {
    if (durationUnit === "hours and minutes") {
      const h = parseNum(durationHours) ?? 0;
      const m = parseNum(durationMinutes) ?? 0;
      const total = h + m / 60;
      return total > 0 ? total : null;
    }
    return parseNum(duration);
  };

  /** Session length in minutes, for the generated-slots preview. 0 means the
   *  duration fields are still blank, so there is nothing to preview yet. */
  const sessionMinutes =
    packageDurationMinutes(durationUnit, duration, durationHours, durationMinutes) ||
    null;

  const buildSchedulePayload = (): PackageScheduleInput[] =>
    schedules.map((s, index) => ({
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
      // Blank means "use the package minimum", which the API stores as null.
      minParticipants: parseIntOrNull(s.minPlayers),
      isActive: s.isActive,
      priority: index,
    }));

  /**
   * Reset — the web form's Reset button. Re-navigating to this route remounts
   * the screen, clearing every field without hand-resetting ~40 pieces of state
   * (and without the drift that list going stale would cause). The `type` param
   * is carried over so a custom-package form resets to a custom form.
   */
  const confirmReset = () => {
    Alert.alert(
      "Reset form?",
      "This clears everything you have entered so far.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () =>
            router.replace(
              params.type
                ? `/packages/create-packages?type=${params.type}`
                : "/packages/create-packages",
            ),
        },
      ],
    );
  };

  /**
   * The package image control. Held here rather than inline so the Package
   * Image section can sit at the top of the form (as on the web) without the
   * picker logic drifting from the rest of the image state.
   */
  const packageImageField = image ? (
    <View>
      <Image
        source={{ uri: image }}
        style={{ width: "100%", height: 160, borderRadius: 12 }}
        resizeMode="cover"
      />
      <View className="flex-row gap-4 mt-2">
        <Pressable onPress={pickImage}>
          <Text className="text-xs font-semibold text-[#0644C7]">
            Replace image
          </Text>
        </Pressable>
        <Pressable onPress={() => setImage(null)}>
          <Text className="text-xs font-semibold text-red-600">
            Remove image
          </Text>
        </Pressable>
      </View>
      <Text className="mt-2 text-xs text-gray-400 dark:text-gray-500">
        Recommended 16:9 (1280×720 or 1920×1080). Images are cropped to fit, so
        centre your subject.
      </Text>
    </View>
  ) : (
    <View>
      <Pressable
        onPress={pickImage}
        className="flex-row items-center justify-center gap-2 py-4 rounded-xl border border-dashed border-gray-300 dark:border-neutral-700"
      >
        <Feather name="image" size={18} color={PRIMARY} />
        <Text className="text-sm font-medium text-[#0644C7]">Choose image</Text>
      </Pressable>
      <Text className="mt-2 text-xs text-gray-400 dark:text-gray-500">
        Recommended 16:9 (1280×720 or 1920×1080). Images are cropped to fit, so
        centre your subject.
      </Text>
    </View>
  );

  /** "3 months" for a window that lands on a whole 30-day multiple, else "". */
  const bookingWindowMonths = useMemo(() => {
    const days = parseIntOrNull(bookingWindowDays);
    if (days == null || days <= 0 || days % 30 !== 0) return "";
    const months = days / 30;
    return `${months} month${months === 1 ? "" : "s"}`;
  }, [bookingWindowDays]);

  /* --- Live Preview: how this package will read to a customer ------------ */

  const previewCategory = (
    (useCustomCategory ? customCategory : category) ?? ""
  ).trim();

  const previewDuration = useMemo(() => {
    const mins = packageDurationMinutes(
      durationUnit,
      duration,
      durationHours,
      durationMinutes,
    );
    return mins > 0 ? formatDuration(mins, "minutes") : "Not specified";
  }, [durationUnit, duration, durationHours, durationMinutes]);

  /**
   * "Every day (9:00 AM - 5:00 PM)" for a single daily schedule, the weekday
   * list for a weekly one, and a plain count once several are configured —
   * spelling out four windows would not fit the card.
   */
  const previewAvailability = useMemo(() => {
    if (schedules.length === 0) return "No schedules configured";
    if (schedules.length > 1) return `${schedules.length} schedules configured`;
    const s = schedules[0];
    const window =
      s.start && s.end ? ` (${to12h(s.start)} - ${to12h(s.end)})` : "";
    if (s.type === "daily") return `Every day${window}`;
    if (s.type === "weekly") {
      if (s.weekDays.length === 0) return `No days selected${window}`;
      const days = WEEKDAYS.filter((d) => s.weekDays.includes(d))
        .map((d) => d[0].toUpperCase() + d.slice(1, 3))
        .join(", ");
      return `${days}${window}`;
    }
    return `${s.occurrence} ${s.monthlyDay}${window}`;
  }, [schedules]);

  /** Selected names, or the web's greyed "None" when nothing is picked. */
  const namesOf = <T extends { id: number; name: string }>(
    all: T[],
    selected: number[],
  ) => {
    const picked = all.filter((x) => selected.includes(x.id)).map((x) => x.name);
    return picked.length > 0 ? picked.join(", ") : "None";
  };

  const previewAttractions = namesOf(attractions, attractionSel);
  const previewSpaces = namesOf(rooms, roomSel);
  const previewAddOns = namesOf(addOns, addonOrder);

  const handleSubmit = async () => {
    // The form is one page now, so every rule runs here rather than gating a
    // Next button. Groups are checked in reading order so the message names the
    // first problem the user would scroll to.
    for (const group of [0, 1]) {
      const err = validateStep(group);
      if (err) {
        Alert.alert("Check this form", err);
        return;
      }
    }
    // No schedule is a valid package — it sells as Call to Book, which the
    // notice above the list explains. The web create form allows this too
    // (it simply skips the schedule save), so nothing is blocked here.
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

    const setupError = validatePackageSetup({
      minParticipants: parseIntOrNull(minParticipants),
      maxTicketsPerSlot: parseIntOrNull(maxTicketsPerSlot),
      durationMinutes: packageDurationMinutes(
        durationUnit,
        duration,
        durationHours,
        durationMinutes,
      ),
      schedules: schedules.map((s) => ({ start: s.start, end: s.end })),
      bookingWindowDays: parseIntOrNull(bookingWindowDays),
      minBookingNoticeHours: parseIntOrNull(minNotice),
    });
    if (setupError) return Alert.alert("Check this package", setupError);

    const dur = resolvedDuration();
    if (dur == null || dur <= 0)
      return Alert.alert("Invalid duration", "Please enter a valid duration.");

    const token = getToken();
    if (!token) return Alert.alert("Not signed in", "Please sign in again.");
    if (locationId == null)
      return Alert.alert("Missing location", "Please select a location.");

    const categoryValue = (
      useCustomCategory ? customCategory : (category ?? "")
    ).trim();

    setSubmitting(true);
    try {
      const id = await createPackage(token, {
        locationId,
        name: name.trim(),
        description: description.trim(),
        category: categoryValue,
        packageType,
        price: parseNum(price) ?? 0,
        pricingType,
        pricePerAdditional: perPerson ? 0 : (parseNum(pricePerAdditional) ?? 0),
        minParticipants: parseIntOrNull(minParticipants),
        maxParticipants: parseIntOrNull(maxParticipants),
        maxTicketsPerSlot: parseIntOrNull(maxTicketsPerSlot),
        participantLabel,
        displayLabel,
        duration: dur,
        durationUnit,
        bookingWindowDays: parseIntOrNull(bookingWindowDays),
        minBookingNoticeHours: parseIntOrNull(minNotice),
        hasGuestOfHonor: hasGoh,
        partialPaymentPercentage: parseIntOrNull(partialPct),
        partialPaymentFixed: parseNum(partialFixed),
        customerNotes: customerNotes.trim(),
        displayOrder: null,
        isActive,
        features: features.map((f) => f.trim()).filter(Boolean),
        // Link OR file, per the chosen tab (matches the web admin).
        invitationDownloadLink:
          invitationType === "link" ? invitationLink.trim() : "",
        invitationFile: invitationType === "file" ? invitationFile : null,
        image,
        attractionIds: attractionSel,
        addonIds: addonOrder,
        addOnsOrder: addonOrder
          .map((aid) => addOns.find((a) => a.id === aid)?.name)
          .filter((n): n is string => !!n),
        roomIds: roomSel,
        // Promos and gift cards are not chosen on this form; the fields are
        // required by the endpoint, so they go up empty.
        promoIds: [],
        giftCardIds: [],
      });

      if (id && schedules.length > 0) {
        try {
          await savePackageAvailabilitySchedules(
            token,
            id,
            buildSchedulePayload(),
          );
        } catch {
          markPackagesStale();
          Alert.alert(
            "Partly saved",
            "The package was created, but its availability schedule could not be saved. You can add it from the web admin.",
          );
          router.back();
          return;
        }
      }

      markPackagesStale();
      Alert.alert("Package created", `"${name.trim()}" was created.`);
      router.back();
    } catch (err) {
      Alert.alert(
        "Create failed",
        err instanceof Error ? err.message : "Could not create the package.",
      );
    } finally {
      setSubmitting(false);
    }
  };


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
            Create Package Deal
          </Text>
          <View style={{ width: 36 }} />
        </View>
        <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Fill in the details below to create a new package deal.
        </Text>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{
            padding: 20,
            // The actions scroll with the content now, so the safe area has to
            // be cleared here rather than by a pinned footer.
            paddingBottom: insets.bottom + 32,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Select Location — a card grid above the form, as on the web. It
              sits outside the Details card because picking a location is what
              loads the rooms, add-ons and attractions further down. */}
          {isCompanyAdmin ? (
            <View className="mb-4">
              <View className="flex-row items-center gap-2 mb-3">
                <Feather name="map-pin" size={16} color={PRIMARY} />
                <Text className="text-base font-bold text-gray-900 dark:text-white">
                  Select Location
                </Text>
              </View>
              <View className="flex-row flex-wrap justify-between">
                {locations.map((l) => {
                  const active = locationId === l.id;
                  return (
                    <Pressable
                      key={l.id}
                      onPress={() => setLocationId(l.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      className={`w-[48%] mb-2.5 flex-row items-center gap-2.5 rounded-xl border p-3 active:opacity-80 ${
                        active
                          ? "border-[#0644C7] bg-[#0644C7]/5"
                          : "border-gray-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
                      }`}
                    >
                      <View
                        className={`h-9 w-9 items-center justify-center rounded-lg ${
                          active ? "bg-[#0644C7]" : "bg-[#0644C7]/10"
                        }`}
                      >
                        <Feather
                          name="map-pin"
                          size={16}
                          color={active ? "#FFFFFF" : PRIMARY}
                        />
                      </View>
                      <View className="flex-1">
                        <Text
                          numberOfLines={1}
                          className="text-xs font-bold text-gray-900 dark:text-white"
                        >
                          {l.name}
                        </Text>
                        {!!l.address && (
                          <Text
                            numberOfLines={1}
                            className="text-[11px] text-gray-500 dark:text-gray-400"
                          >
                            {l.address}
                          </Text>
                        )}
                      </View>
                      {active && (
                        <Feather name="check-circle" size={16} color={PRIMARY} />
                      )}
                    </Pressable>
                  );
                })}
                {/* Keeps a lone trailing card in the left column. */}
                {locations.length % 2 === 1 && <View className="w-[48%]" />}
              </View>

              {locationId == null && (
                <View className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/20">
                  <Text className="text-sm text-amber-800 dark:text-amber-300">
                    Select a location to load its rooms, add-ons, and
                    attractions.
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <View className="mb-4">
              <View className="flex-row items-center gap-2 mb-2">
                <Feather name="map-pin" size={16} color={PRIMARY} />
                <Text className="text-base font-bold text-gray-900 dark:text-white">
                  Location
                </Text>
              </View>
              <View className="rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-3 dark:border-neutral-800 dark:bg-neutral-800">
                <Text className="text-sm text-gray-700 dark:text-gray-200">
                  {lockedLocationName}
                </Text>
              </View>
            </View>
          )}

          {/* Package Image — directly under the location, as on the web. */}
          <Section icon="image" title="Package Image">
            <View className="gap-4">{packageImageField}</View>
          </Section>

          <Section icon="info" title="Details">
            <View className="gap-4">
              <TextField
                label="Package Name"
                required
                value={name}
                onChangeText={setName}
                placeholder="Enter package name"
              />

              {/* Duration — unit first, then the value(s), as on the web. */}
              <SelectField
                label="Duration"
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
                  label=""
                  required
                  value={duration}
                  onChangeText={setDuration}
                  keyboardType="decimal-pad"
                  placeholder="Enter duration"
                />
              )}

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <TextField
                    label={`Min ${participantWord}s`}
                    value={minParticipants}
                    onChangeText={setMinParticipants}
                    keyboardType="number-pad"
                    placeholder="Enter min participants"
                  />
                </View>
                <View className="flex-1">
                  <TextField
                    label={`Max ${participantWord}s`}
                    value={maxParticipants}
                    onChangeText={setMaxParticipants}
                    keyboardType="number-pad"
                    placeholder="Enter max participants"
                  />
                </View>
              </View>

              {/* The web runs these three across one row; stacked here, since
                  three inputs plus their hints will not fit a phone. */}
              <TextField
                label="Guest label"
                value={participantLabel}
                onChangeText={setParticipantLabel}
                maxLength={50}
                placeholder="Participant, Player, Guest..."
                hint="What one person is called on the customer page."
              />
              <TextField
                label="Shown to customers as"
                value={displayLabel}
                onChangeText={setDisplayLabel}
                maxLength={100}
                placeholder="Escape Room, Party Package..."
                hint={'Storefront section and badge. Blank keeps "Package".'}
              />
              <TextField
                label="Max tickets per time slot"
                value={maxTicketsPerSlot}
                onChangeText={setMaxTicketsPerSlot}
                keyboardType="number-pad"
                placeholder="No limit"
                hint="Seats sellable per slot per day. Customers see the live count."
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
                  placeholder="Select category"
                  value={category}
                  options={categories.map((c) => ({
                    label: c.name,
                    value: c.name,
                  }))}
                  onSelect={(v) => setCategory(String(v))}
                />
              )}
              <Pressable onPress={() => setUseCustomCategory((v) => !v)}>
                <Text className="text-xs font-semibold text-[#0644C7]">
                  {useCustomCategory ? "Pick existing category" : "＋ New category"}
                </Text>
              </Pressable>

              <View>
                <SelectField
                  label="Package Type"
                  value={packageType}
                  options={PACKAGE_TYPES}
                  onSelect={(v) => setPackageType(String(v))}
                />
                <Text className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  Use &quot;Regular&quot; for standard packages. Other types
                  appear in the Custom Packages section.
                </Text>
              </View>

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
                <Pressable onPress={() => setFeatures((prev) => [...prev, ""])}>
                  <Text className="text-xs font-semibold text-[#0644C7]">
                    ＋ Add Feature
                  </Text>
                </Pressable>
              </View>

              <TextField
                label="Description"
                required
                value={description}
                onChangeText={setDescription}
                placeholder="Describe the package"
                multiline
              />

              <ToggleRow label="Active" value={isActive} onValueChange={setIsActive} />
            </View>
          </Section>

          <Section
            icon="calendar"
            title="Availability Schedules"
            right={
              <Pressable
                onPress={addSchedule}
                className="flex-row items-center gap-1.5 rounded-lg bg-[#0644C7] px-3 py-2 active:opacity-90"
                accessibilityRole="button"
                accessibilityLabel="Add schedule"
              >
                <Feather name="plus" size={14} color="#FFFFFF" />
                <Text className="text-xs font-semibold text-white">
                  Add Schedule
                </Text>
              </Pressable>
            }
          >
            <View className="gap-4">
              {/* What these schedules mean for the customer site. */}
              <CallToBookNotice
                active={packageIsCallToBook(schedules.map(toScheduleLike))}
                itemLabel="package"
              />
              {schedules.length === 0 && (
                <View className="items-center rounded-2xl border border-dashed border-gray-300 px-5 py-8 dark:border-neutral-700">
                  <Feather name="calendar" size={32} color="#9CA3AF" />
                  <Text className="mt-3 text-base text-gray-600 dark:text-gray-300">
                    No availability schedules configured
                  </Text>
                  <Text className="mt-1 text-center text-xs text-gray-500 dark:text-gray-400">
                    Without a schedule this package is sold as Call to Book —
                    add schedules to let customers pick times online
                  </Text>
                  <Pressable
                    onPress={addSchedule}
                    className="mt-4 flex-row items-center gap-1.5 rounded-lg bg-[#0644C7] px-4 py-2.5 active:opacity-90"
                    accessibilityRole="button"
                  >
                    <Feather name="plus" size={14} color="#FFFFFF" />
                    <Text className="text-sm font-semibold text-white">
                      Add First Schedule
                    </Text>
                  </Pressable>
                </View>
              )}
              {schedules.length > 1 && (
                <Text className="text-xs text-gray-500 dark:text-gray-400">
                  When two schedules cover the same day, the one lower in this
                  list wins.
                </Text>
              )}
              {schedules.map((s, idx) => (
                <View
                  key={s.key}
                  className="rounded-2xl border border-gray-200 dark:border-neutral-800 p-4 gap-3"
                >
                  <View className="flex-row items-center justify-between">
                    <Text className="text-sm font-bold text-gray-900 dark:text-white">
                      Schedule {idx + 1}
                    </Text>
                    {/* The last schedule is removable too: clearing them all is
                        how a package is switched to Call to Book. */}
                    <Pressable onPress={() => removeSchedule(s.key)}>
                      <Feather name="trash-2" size={16} color="#dc2626" />
                    </Pressable>
                  </View>

                  {/* Schedule Type — the web's three buttons, not a dropdown. */}
                  <View>
                    <SectionLabel>Schedule Type</SectionLabel>
                    <View className="flex-row flex-wrap">
                      {SCHEDULE_TYPES.map((t) => (
                        <Chip
                          key={String(t.value)}
                          label={t.label}
                          selected={s.type === t.value}
                          onPress={() =>
                            patchSchedule(s.key, {
                              type: t.value as SchedRow["type"],
                            })
                          }
                        />
                      ))}
                    </View>
                  </View>

                  {s.type === "weekly" && (
                    <View>
                      <View className="flex-row items-center justify-between mb-1">
                        <SectionLabel>Select Days</SectionLabel>
                        <Pressable
                          onPress={() =>
                            patchSchedule(s.key, {
                              weekDays:
                                s.weekDays.length === WEEKDAYS.length
                                  ? []
                                  : [...WEEKDAYS],
                            })
                          }
                          className="active:opacity-70"
                          accessibilityRole="button"
                        >
                          <Text className="text-xs font-semibold text-[#0644C7]">
                            {s.weekDays.length === WEEKDAYS.length
                              ? "Deselect All"
                              : "Select All"}
                          </Text>
                        </Pressable>
                      </View>
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
                        onChangeText={(t) => patchSchedule(s.key, { start: t })}
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
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <TextField
                        label="Interval (min)"
                        value={s.interval}
                        onChangeText={(t) =>
                          patchSchedule(s.key, { interval: t })
                        }
                        keyboardType="number-pad"
                        placeholder="30"
                        hint={
                          parseIntOrNull(s.interval)
                            ? `A new start time every ${parseIntOrNull(s.interval)} min.`
                            : "Minimum 15 minutes."
                        }
                      />
                    </View>
                    <View className="flex-1">
                      <TextField
                        label="Min players (override)"
                        value={s.minPlayers}
                        onChangeText={(t) =>
                          patchSchedule(s.key, {
                            minPlayers: t.replace(/\D/g, ""),
                          })
                        }
                        keyboardType="number-pad"
                        placeholder="Package default"
                        hint="Leave blank to use the package minimum on these days."
                      />
                    </View>
                  </View>
                  <ToggleRow
                    label="Active"
                    value={s.isActive}
                    onValueChange={(v) => patchSchedule(s.key, { isActive: v })}
                  />

                  {/* Generated Time Slots — what this window + interval will
                      actually offer, so a misconfiguration is visible before
                      saving rather than after a customer cannot book. */}
                  <View className="border-t border-gray-100 dark:border-neutral-800 pt-3">
                    <Text className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">
                      Generated Time Slots:
                    </Text>
                    {(() => {
                      if (sessionMinutes == null) {
                        return (
                          <Text className="text-xs text-gray-400 dark:text-gray-500">
                            Set the package duration to preview slots.
                          </Text>
                        );
                      }
                      const slots = generateScheduleSlots({
                        start: s.start,
                        end: s.end,
                        intervalMinutes: parseIntOrNull(s.interval),
                        durationMinutes: sessionMinutes,
                      });
                      if (slots.length === 0) {
                        return (
                          <Text className="text-xs text-gray-400 dark:text-gray-500">
                            No valid slots with current configuration
                          </Text>
                        );
                      }
                      return (
                        <View className="flex-row flex-wrap">
                          {slots.map((slot) => (
                            <View
                              key={slot.start}
                              className="mr-1.5 mb-1.5 rounded border border-gray-200 bg-white px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
                            >
                              <Text className="text-xs text-gray-700 dark:text-gray-200">
                                {to12h(slot.start)} - {to12h(slot.end)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      );
                    })()}
                  </View>
                </View>
              ))}
              {/* Only below an existing list — on an empty form the header and
                  the empty state already offer this, and three Add buttons on
                  one screen is one too many. */}
              {schedules.length > 0 && (
                <Pressable onPress={addSchedule}>
                  <Text className="text-xs font-semibold text-[#0644C7]">
                    ＋ Add schedule
                  </Text>
                </Pressable>
              )}
            </View>
          </Section>

          {/* Attractions / Space / Add-ons are three sections on the web, each
              with its own header, rather than one combined card. */}
          <Section icon="info" title="Additional Attractions">
            {loadingRelations ? (
              <View className="py-8 items-center">
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : attractions.length === 0 ? (
              <View className="items-center rounded-2xl border border-dashed border-gray-300 px-5 py-6 dark:border-neutral-700">
                <Text className="text-sm text-gray-500 dark:text-gray-400">
                  {locationId == null
                    ? "Select a location to load its attractions"
                    : "No attractions available yet"}
                </Text>
                {locationId != null && (
                  <Pressable
                    onPress={() =>
                      router.push("/attractions/create-attraction")
                    }
                    className="mt-3 flex-row items-center gap-1.5 rounded-lg bg-[#0644C7] px-4 py-2.5 active:opacity-90"
                    accessibilityRole="button"
                  >
                    <Feather name="plus" size={14} color="#FFFFFF" />
                    <Text className="text-sm font-semibold text-white">
                      Create Attraction
                    </Text>
                  </Pressable>
                )}
              </View>
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
          </Section>

          {/* Per-player packages are the room, so the web hides Space here. */}
          {!perPerson && (
            <Section
              icon="home"
              title="Space"
              right={
                rooms.length > 0 ? (
                  <Pressable
                    onPress={() =>
                      setRoomSel((prev) =>
                        prev.length === rooms.length
                          ? []
                          : rooms.map((r) => r.id),
                      )
                    }
                    className="rounded-lg bg-[#0644C7] px-3 py-2 active:opacity-90"
                    accessibilityRole="button"
                  >
                    <Text className="text-xs font-semibold text-white">
                      {roomSel.length === rooms.length
                        ? "Deselect All"
                        : "Select All"}
                    </Text>
                  </Pressable>
                ) : undefined
              }
            >
              {loadingRelations ? (
                <View className="py-8 items-center">
                  <ActivityIndicator color={PRIMARY} />
                </View>
              ) : rooms.length === 0 ? (
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  {locationId == null
                    ? "Select a location to load its spaces"
                    : "No spaces available yet"}
                </Text>
              ) : (
                <View className="flex-row flex-wrap">
                  {rooms.map((r) => (
                    <Chip
                      key={r.id}
                      label={r.name}
                      selected={roomSel.includes(r.id)}
                      onPress={() => setRoomSel((prev) => toggleIn(prev, r.id))}
                    />
                  ))}
                </View>
              )}
            </Section>
          )}

          <Section
            icon="info"
            title="Add-ons"
            right={
              addOns.length > 0 ? (
                <Pressable
                  onPress={() =>
                    setAddonOrder((prev) =>
                      prev.length === addOns.length
                        ? []
                        : addOns.map((a) => a.id),
                    )
                  }
                  className="rounded-lg bg-[#0644C7] px-3 py-2 active:opacity-90"
                  accessibilityRole="button"
                >
                  <Text className="text-xs font-semibold text-white">
                    {addonOrder.length === addOns.length
                      ? "Deselect All"
                      : "Select All"}
                  </Text>
                </Pressable>
              ) : undefined
            }
          >
            {loadingRelations ? (
              <View className="py-8 items-center">
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : addOns.length === 0 ? (
              <Text className="text-sm text-gray-400 dark:text-gray-500">
                {locationId == null
                  ? "Select a location to load its add-ons"
                  : "No add-ons available yet"}
              </Text>
            ) : (
              <View className="flex-row flex-wrap">
                {addOns.map((a) => (
                  <Chip
                    key={a.id}
                    label={a.name}
                    sub={a.price ? `$${a.price}` : undefined}
                    selected={addonOrder.includes(a.id)}
                    onPress={() => setAddonOrder((prev) => toggleIn(prev, a.id))}
                  />
                ))}
              </View>
            )}
          </Section>

          <Section icon="dollar-sign" title="Pricing & Players">
            <View className="gap-4">
              <View>
                <Text className="text-sm font-bold text-gray-900 dark:text-white">
                  Pricing
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">
                  Set the base price for this package (before any add-ons or
                  additional participants)
                </Text>
                <SegmentedToggle<PackagePricingType>
                  options={[
                    { value: "base", label: "Base price" },
                    {
                      value: "per_person",
                      label: `Per ${playerWord.toLowerCase()}`,
                    },
                  ]}
                  value={pricingType}
                  onChange={(next) => {
                    setPricingType(next);
                    // Per-player packages are not room-based (web clears rooms too).
                    if (next === "per_person") setRoomSel([]);
                  }}
                />
                <TextField
                  label={perPerson ? `Price per ${playerWord}` : "Price"}
                  required
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholder={
                    perPerson
                      ? `Amount each ${playerWord.toLowerCase()} pays`
                      : "Enter price"
                  }
                  hint={
                    perPerson
                      ? `No base price — the total is this amount times the number of ${playerWord.toLowerCase()}s.`
                      : undefined
                  }
                />
              </View>

              {/* Partial Payment Options — matches the web admin. */}
              <View>
                <Text className="text-sm font-bold text-gray-900 dark:text-white">
                  Partial Payment Options
                </Text>
                <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">
                  Configure partial payment options for customers (percentage or
                  fixed amount)
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

              {/* Only offered on a base-price package with a ceiling: it is
                  what each head beyond the minimum costs, which per-player
                  pricing has no concept of. */}
              {maxParticipants.trim() !== "" && !perPerson && (
                <TextField
                  label="Price per Additional Participant"
                  value={pricePerAdditional}
                  onChangeText={setPricePerAdditional}
                  keyboardType="decimal-pad"
                  placeholder="Enter price per additional"
                />
              )}
            </View>
          </Section>

          {/* Guest of Honor and Customer Notes are their own sections on the
              web, directly under Pricing — not fields buried in Booking Rules. */}
          <Section icon="gift" title="Guest of Honor">
            <Pressable
              onPress={() => setHasGoh(!hasGoh)}
              className="flex-row items-center gap-3 active:opacity-70"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: hasGoh }}
            >
              <Feather
                name={hasGoh ? "check-square" : "square"}
                size={20}
                color={hasGoh ? PRIMARY : "#9CA3AF"}
              />
              <Text className="flex-1 text-sm text-gray-900 dark:text-white">
                Enable guest of honor fields for this package
              </Text>
            </Pressable>
            <Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              When enabled, customers can specify the name, age, and gender of
              the guest of honor during booking.
            </Text>
          </Section>

          <Section icon="file-text" title="Customer Notes">
            <TextField
              value={customerNotes}
              onChangeText={setCustomerNotes}
              placeholder="e.g., A 4.87% processing fee applies to all card transactions. Please arrive 15 minutes early."
              multiline
              hint="These notes will be displayed to customers during booking and included in their confirmation email."
            />
          </Section>

          <Section icon="sliders" title="Booking Rules">
            <View className="gap-5">
              {/* Booking Window — how far ahead a customer may book. */}
              <View>
                <Text className="text-sm font-bold text-gray-900 dark:text-white">
                  Booking Window
                </Text>
                <Text className="mt-0.5 mb-2 text-xs text-gray-500 dark:text-gray-400">
                  How far in advance customers can book this package
                </Text>
                <View className="flex-row flex-wrap">
                  {BOOKING_WINDOW_PRESETS.map((p) => (
                    <Chip
                      key={p.days}
                      label={p.label}
                      selected={bookingWindowDays === String(p.days)}
                      onPress={() => setBookingWindowDays(String(p.days))}
                    />
                  ))}
                </View>
                <View className="mt-1 flex-row items-center gap-2">
                  <View className="w-24">
                    <TextField
                      value={bookingWindowDays}
                      onChangeText={(t) =>
                        setBookingWindowDays(t.replace(/\D/g, ""))
                      }
                      keyboardType="number-pad"
                      placeholder="Days"
                    />
                  </View>
                  <Text className="text-sm text-gray-600 dark:text-gray-300">
                    days
                  </Text>
                  <Text className="text-gray-300 dark:text-neutral-700">|</Text>
                  {/* Blank is "no limit" — the same value the API stores as null. */}
                  <Pressable
                    onPress={() => setBookingWindowDays("")}
                    className={`rounded-lg px-3 py-2 active:opacity-80 ${
                      bookingWindowDays.trim() === ""
                        ? "bg-gray-800 dark:bg-neutral-700"
                        : "border border-gray-200 dark:border-neutral-700"
                    }`}
                    accessibilityRole="button"
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        bookingWindowDays.trim() === ""
                          ? "text-white"
                          : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      No Limit
                    </Text>
                  </Pressable>
                </View>
                {bookingWindowDays.trim() !== "" && (
                  <Text className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    Customers can book up to {bookingWindowDays} days
                    {bookingWindowMonths ? ` (${bookingWindowMonths})` : ""} in
                    advance
                  </Text>
                )}
              </View>

              {/* Advance Booking Time — how close to the slot a customer may book. */}
              <View>
                <Text className="text-sm font-bold text-gray-900 dark:text-white">
                  Advance Booking Time{" "}
                  <Text className="font-normal text-gray-500 dark:text-gray-400">
                    (optional)
                  </Text>
                </Text>
                <Text className="mt-0.5 mb-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  Set how far in advance customers must book. For example,
                  setting 48 hours means if a customer visits on Monday at 2:00
                  PM, the earliest available time slot would be Wednesday at
                  2:00 PM. This only affects customer-facing bookings — staff
                  can still book freely.
                </Text>
                <View className="flex-row flex-wrap">
                  {ADVANCE_NOTICE_PRESETS.map((p) => (
                    <Chip
                      key={p.hours}
                      label={p.label}
                      selected={minNotice === String(p.hours)}
                      onPress={() => setMinNotice(String(p.hours))}
                    />
                  ))}
                </View>
                <View className="mt-1 flex-row items-center gap-2">
                  <View className="flex-1">
                    <TextField
                      value={minNotice}
                      onChangeText={(t) => setMinNotice(t.replace(/\D/g, ""))}
                      keyboardType="number-pad"
                      placeholder="Custom hours (e.g., 24)"
                    />
                  </View>
                  <Text className="text-sm text-gray-600 dark:text-gray-300">
                    hours
                  </Text>
                  {/* Blank / 0 is "no notice needed" — last-minute allowed. */}
                  <Pressable
                    onPress={() => setMinNotice("")}
                    className={`rounded-lg px-3 py-2 active:opacity-80 ${
                      minNotice.trim() === "" || minNotice === "0"
                        ? "border border-[#0644C7] bg-[#0644C7]/10"
                        : "border border-gray-200 dark:border-neutral-700"
                    }`}
                    accessibilityRole="button"
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        minNotice.trim() === "" || minNotice === "0"
                          ? "text-[#0644C7]"
                          : "text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      Allow last-minute
                    </Text>
                  </Pressable>
                </View>
                {minNotice.trim() !== "" && minNotice !== "0" && (
                  <Text className="mt-1.5 text-xs text-[#0644C7]">
                    Customers must book at least {minNotice} hours (
                    {(Number(minNotice) / 24).toFixed(1)} days) in advance. Any
                    time slots within this window from the current time will be
                    hidden.
                  </Text>
                )}
              </View>
            </View>
          </Section>

          <Section icon="file-text" title="Invitation Template">
            <View className="gap-4">
              <View>
                {/* Underlined tabs, as on the web — not filled buttons. */}
                <View className="flex-row border-b border-gray-200 dark:border-neutral-800 mb-3">
                  {(["link", "file"] as const).map((t) => {
                    const active = invitationType === t;
                    return (
                      <Pressable
                        key={t}
                        onPress={() => setInvitationType(t)}
                        className={`px-4 pb-2.5 ${
                          active ? "border-b-2 border-[#0644C7]" : ""
                        }`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text
                          className={`text-sm ${
                            active
                              ? "font-semibold text-[#0644C7]"
                              : "text-gray-600 dark:text-gray-300"
                          }`}
                        >
                          {t === "link" ? "Link" : "Upload File"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {invitationType === "link" ? (
                  <>
                    <TextField
                      value={invitationLink}
                      onChangeText={setInvitationLink}
                      placeholder="https://example.com/invitation-template.pdf"
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                    <Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      Provide a URL to a downloadable invitation template.
                    </Text>
                    <Text className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      Optional: Customers can access this invitation template
                      after booking.
                    </Text>
                  </>
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

            </View>
          </Section>

          {/* Live Preview — how the package will read to a customer, updating
              as the form is filled in. Mirrors the web's sidebar card. */}
          <View
            className="rounded-2xl bg-white dark:bg-neutral-900 p-5 mb-4 shadow-sm"
            style={CARD_SHADOW}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white mb-4">
              Live Preview
            </Text>

            <View className="flex-row items-start justify-between gap-3">
              <Text
                className={`flex-1 text-xl font-bold ${
                  name.trim()
                    ? "text-gray-900 dark:text-white"
                    : "text-gray-300 dark:text-neutral-700"
                }`}
              >
                {name.trim() || "Package Name"}
              </Text>
              <Text className="text-base font-bold text-gray-900 dark:text-white">
                {parseNum(price) != null
                  ? `$${(parseNum(price) ?? 0).toFixed(2)}`
                  : "$--"}
              </Text>
            </View>

            <Text
              className={`mt-0.5 text-xs ${
                previewCategory
                  ? "text-gray-500 dark:text-gray-400"
                  : "text-gray-300 dark:text-neutral-700"
              }`}
            >
              {previewCategory || "Category"}
            </Text>

            <View className="mt-2 flex-row items-center gap-1.5">
              <Feather name="clock" size={13} color="#6B7280" />
              <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">
                Duration:
              </Text>
              <Text className="text-xs text-gray-600 dark:text-gray-300">
                {previewDuration}
              </Text>
            </View>

            <View className="mt-1 flex-row items-start gap-1.5">
              <Feather
                name="calendar"
                size={13}
                color="#6B7280"
                style={{ marginTop: 2 }}
              />
              <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">
                Available:
              </Text>
              <Text className="flex-1 text-xs text-gray-600 dark:text-gray-300">
                {previewAvailability}
              </Text>
            </View>

            <Text
              className={`mt-3 text-xs leading-5 ${
                description.trim()
                  ? "text-gray-600 dark:text-gray-300"
                  : "text-gray-300 dark:text-neutral-700"
              }`}
            >
              {description.trim() || "Description"}
            </Text>

            <View className="mt-3 gap-1.5">
              <Text className="text-xs text-gray-600 dark:text-gray-300">
                <Text className="font-bold text-gray-900 dark:text-white">
                  Attractions:{" "}
                </Text>
                {previewAttractions}
              </Text>
              {!perPerson && (
                <Text className="text-xs text-gray-600 dark:text-gray-300">
                  <Text className="font-bold text-gray-900 dark:text-white">
                    Space:{" "}
                  </Text>
                  {previewSpaces}
                </Text>
              )}
              <Text className="text-xs text-gray-600 dark:text-gray-300">
                <Text className="font-bold text-gray-900 dark:text-white">
                  Add-ons:{" "}
                </Text>
                {previewAddOns}
              </Text>
            </View>
          </View>
          {/* Actions scroll with the form, sitting below the last section
              rather than pinned to the bottom — the Edit Attraction pattern. */}
          <View className="flex-row gap-3 mt-4">
            <Pressable
              onPress={handleSubmit}
              disabled={submitting}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0644C7] active:opacity-90"
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="plus" size={16} color="#fff" />
                  <Text className="text-sm font-semibold text-white">
                    Submit
                  </Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={confirmReset}
              disabled={submitting}
              className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
            >
              <Feather name="refresh-cw" size={16} color="#6B7280" />
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Reset
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default CreatePackage;
