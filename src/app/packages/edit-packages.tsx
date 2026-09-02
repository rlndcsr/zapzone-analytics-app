import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { PackageImageField } from "../../components/ui/PackageImageField";
import { mediaUrl } from "../../lib/api";
import {
  packageIsCallToBook,
  type PackageScheduleLike,
} from "../../lib/callToBook";
import { markPackagesStale } from "../../lib/hooks/usePackages";
import {
  ADVANCE_NOTICE_PRESETS,
  BOOKING_WINDOW_PRESETS,
  bookingWindowMonthsLabel,
} from "../../lib/packages/bookingWindow";
import {
  DEFAULT_SLOT_CLEANUP_MINUTES,
  resolveScheduleSlots,
  spaceDrivenIntervalHint,
  spaceDrivenSourceLabel,
  spacesDriveStartTimes,
} from "../../lib/packages/scheduleSlots";
import {
  packageDurationMinutes,
  validatePackageSetup,
} from "../../lib/packageSetup";
import { getCurrentUser, getToken } from "../../lib/session";
import { formatDuration } from "../../lib/time";
import { fetchAddOns, type AddOnOption } from "../../services/addOnsService";
import {
  fetchAttractions,
  type AttractionRow,
} from "../../services/attractionsService";
import {
  fetchRoomOptions,
  type RoomOption,
} from "../../services/bookingsService";
import {
  fetchCategories,
  type Category,
} from "../../services/categoriesService";
import {
  fetchPackageDetail,
  savePackageAvailabilitySchedules,
  updatePackage,
  type PackageDetail,
  type PackagePricingType,
  type PackageScheduleInput,
} from "../../services/packagesService";

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

/** "HH:MM:SS" | "HH:MM" → "HH:MM" for the editable time inputs. */
const toHHMM = (v: string | null): string => (v ? v.substring(0, 5) : "");

/** Label a stored invitation file by its basename ("invitations/a1b2.pdf"). */
const fileNameOf = (path: string): string =>
  path.split("/").pop() || "Invitation file";

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
      minPlayers: s.minParticipants != null ? String(s.minParticipants) : "",
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
  /** The venue's cleanup gap between two bookings in one space, from the API. */
  const [slotCleanupMinutes, setSlotCleanupMinutes] = useState<number | null>(
    null,
  );
  const [addOns, setAddOns] = useState<AddOnOption[]>([]);
  const [attractionSel, setAttractionSel] = useState<number[]>([]);
  const [roomSel, setRoomSel] = useState<number[]>([]);
  const [addonOrder, setAddonOrder] = useState<number[]>([]);

  // --- Step 5: promos / gift cards ---
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
  // A newly picked file (base64 data URL) vs. the one already stored on the
  // package — kept apart so an untouched file is never re-uploaded, while
  // "Remove" can still clear it. Removing sets `existingInvitationFile` to null.
  const [invitationFile, setInvitationFile] = useState<string | null>(null);
  const [existingInvitationFile, setExistingInvitationFile] = useState<
    string | null
  >(null);
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
        const [cats, atts, rms, ads] = await Promise.all([
          fetchCategories(token).catch(() => []),
          fetchAttractions({ token, userId, locationId: locId }).catch(
            () => [],
          ),
          fetchRoomOptions(token, locId).catch(() => ({
            rooms: [],
            slotCleanupMinutes: null,
          })),
          fetchAddOns({ token, userId, locationId: locId, perPage: 500 }).catch(
            () => [],
          ),
        ]);
        if (!active) return;

        setCategories(cats);
        setAttractions(atts);
        setRooms(rms.rooms);
        setSlotCleanupMinutes(rms.slotCleanupMinutes);
        setAddOns(ads);

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
        setMaxTicketsPerSlot(
          detail.maxTicketsPerSlot != null
            ? String(detail.maxTicketsPerSlot)
            : "",
        );
        setPricingType(detail.pricingType);
        setParticipantLabel(detail.participantLabel);
        setDisplayLabel(detail.displayLabel);
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
        // Open on the tab the package actually uses, so a stored file is
        // visible (and removable) instead of silently hidden behind "Link".
        setExistingInvitationFile(detail.invitationFile || null);
        setInvitationFileName(fileNameOf(detail.invitationFile));
        setInvitationType(detail.invitationFile ? "file" : "link");
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

  /**
   * What to send as `invitation_file`: the new data URL when one was picked,
   * `null` when the stored file was removed or the package switched to a link,
   * and `undefined` to leave an untouched file alone (never resend its path —
   * the backend unlinks the old file before re-saving whatever it is given).
   */
  const invitationFileForSave = (): string | null | undefined => {
    if (invitationType !== "file") return existingInvitationFile ? null : undefined;
    if (invitationFile) return invitationFile;
    return existingInvitationFile ? undefined : null;
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
      if (!name.trim()) return "Package name is required.";
      if (!description.trim()) return "Description is required.";
      const cat = useCustomCategory ? customCategory : category;
      if (!cat || !String(cat).trim()) return "Please choose a category.";
    }
    if (s === 1) {
      const p = parseNum(price);
      if (p == null || p < 0) return "Please enter a valid price.";
      const minP = parseIntOrNull(minParticipants);
      if (minParticipants.trim() && (minP == null || minP < 1))
        return "Please enter a valid min participants (minimum 1)";
      const maxP = parseIntOrNull(maxParticipants);
      if (maxParticipants.trim() && (maxP == null || maxP < 1))
        return "Please enter a valid max participants (minimum 1)";
      const extra = parseNum(pricePerAdditional);
      if (pricePerAdditional.trim() && (extra == null || extra < 0))
        return "Please enter a valid price per additional participant";
      if (perPerson && (!minP || !maxP))
        return `Per-${playerWord.toLowerCase()} pricing needs both minimum and maximum ${playerWord.toLowerCase()}s`;
      if (minP && maxP && minP > maxP)
        return "Minimum cannot be greater than maximum";
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

  const bookingWindowMonths = bookingWindowMonthsLabel(
    parseIntOrNull(bookingWindowDays),
  );

  /** Session length in minutes, for the generated-slots preview. 0 means the
   *  duration fields are still blank, so there is nothing to preview yet. */
  const sessionMinutes =
    packageDurationMinutes(durationUnit, duration, durationHours, durationMinutes) ||
    null;

  /**
   * The booking interval of every space this package is booked into — one entry
   * per selected space, 0 for a space that sets none, because the server
   * staggers start times across all of them and sizes the stagger from the
   * non-zero ones only.
   *
   * A selected id missing from `rooms` is dropped rather than counted as 0: the
   * list holds the location's available spaces, and the server likewise
   * staggers only across the available ones.
   */
  const selectedSpaceIntervals = useMemo(
    () =>
      roomSel
        .map((id) => rooms.find((room) => room.id === id))
        .filter((room): room is RoomOption => room != null)
        .map((room) => room.bookingInterval ?? 0),
    [roomSel, rooms],
  );

  /** One schedule row's preview, resolved the way the server resolves it. */
  const resolveSlotsFor = (schedule: {
    start: string;
    end: string;
    interval: string;
  }) =>
    resolveScheduleSlots({
      start: schedule.start,
      end: schedule.end,
      intervalMinutes: parseIntOrNull(schedule.interval),
      durationMinutes: sessionMinutes,
      spaceIntervals: selectedSpaceIntervals,
      cleanupMinutes: slotCleanupMinutes ?? DEFAULT_SLOT_CLEANUP_MINUTES,
    });

  /** True while the spaces — not the typed interval — set the start times. */
  const spacesRunStartTimes = spacesDriveStartTimes(selectedSpaceIntervals);
  const spaceStagger = spacesRunStartTimes
    ? Math.min(...selectedSpaceIntervals.filter((m) => m > 0))
    : null;

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

  /**
   * One line per schedule — "12:30 PM - 9:30 PM (a start every 90 min)" — so the
   * whole week is visible even though the Available line above collapses to a
   * count.
   */
  const previewTimeSlots = useMemo(
    () =>
      schedules
        .filter((s) => s.start && s.end)
        .map((s) => {
          // The spaces override the typed interval, so the summary quotes
          // whichever one actually opens the next start.
          const every = spaceStagger ?? parseIntOrNull(s.interval);
          return (
            `${to12h(s.start)} - ${to12h(s.end)}` +
            (every ? ` (a start every ${every} min)` : "")
          );
        }),
    [schedules, spaceStagger],
  );

  /** Selected names, or the web's greyed "No X selected" when none are picked. */
  const namesOf = <T extends { id: number; name: string }>(
    all: T[],
    selected: number[],
    emptyLabel: string,
  ) => {
    const picked = all.filter((x) => selected.includes(x.id)).map((x) => x.name);
    return picked.length > 0 ? picked.join(", ") : emptyLabel;
  };

  const previewAttractions = namesOf(
    attractions,
    attractionSel,
    "No attractions selected",
  );
  const previewSpaces = namesOf(rooms, roomSel, "No rooms selected");
  const previewAddOns = namesOf(addOns, addonOrder, "No add-ons selected");

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
        invitationDownloadLink:
          invitationType === "link" ? invitationLink.trim() : "",
        invitationFile: invitationFileForSave(),
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
        <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Update the details of your package deal.
        </Text>
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
            contentContainerStyle={{
              padding: 20,
              // The actions scroll with the content now, so the safe area has
              // to be cleared here rather than by a pinned footer.
              paddingBottom: insets.bottom + 32,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Package Image leads the form, as on the web — before Details. */}
            <Section icon="image" title="Package Image">
              <PackageImageField
                uri={newImage ?? existingImageUri}
                isNew={!!newImage}
                onPick={pickImage}
                onUndo={() => setNewImage(null)}
              />
            </Section>

            <Section icon="info" title="Details">
              <View className="gap-4">
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
            </Section>

            <Section icon="calendar" title="Availability Schedules">
              <View className="gap-4">
                {/* What these schedules mean for the customer site. */}
                <CallToBookNotice
                  active={packageIsCallToBook(schedules.map(toScheduleLike))}
                  itemLabel="package"
                />
                {/* Count banner — the web's "N availability schedule(s)
                    configured for this package". */}
                <View className="rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-900/20">
                  <Text className="text-sm text-blue-900 dark:text-blue-200">
                    <Text className="font-bold">{schedules.length}</Text>{" "}
                    availability schedule{schedules.length === 1 ? "" : "s"}{" "}
                    configured for this package.
                  </Text>
                  <Text className="mt-1 text-xs text-blue-800/80 dark:text-blue-300/80">
                    Availability schedules define when this package can be
                    booked, with different time configurations.
                  </Text>
                </View>
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
                          // Typing here changes nothing while the spaces are in
                          // charge, so the field says so instead of inviting an
                          // edit the server would ignore.
                          disabled={spacesRunStartTimes}
                          hint={
                            spaceDrivenIntervalHint(selectedSpaceIntervals) ??
                            (parseIntOrNull(s.interval)
                              ? `A new start time every ${parseIntOrNull(s.interval)} min.`
                              : "Minimum 15 minutes.")
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
                      onValueChange={(v) =>
                        patchSchedule(s.key, { isActive: v })
                      }
                    />

                    {/* The starts a customer will actually be offered — run
                        through the same rule the server applies, and labelled
                        by whatever drives it, so a misconfiguration is visible
                        before saving rather than after a customer cannot book. */}
                    {(() => {
                      const resolved =
                        sessionMinutes == null ? null : resolveSlotsFor(s);
                      const source = resolved
                        ? spaceDrivenSourceLabel(resolved)
                        : null;
                      return (
                        <View className="border-t border-gray-100 dark:border-neutral-800 pt-3">
                          <Text className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">
                            Start times customers will see:
                            {source ? (
                              <Text className="font-normal text-gray-500 dark:text-gray-400">
                                {" "}
                                {source}
                              </Text>
                            ) : null}
                          </Text>
                          {resolved == null ? (
                            <Text className="text-xs text-gray-400 dark:text-gray-500">
                              Set the package duration to preview slots.
                            </Text>
                          ) : resolved.slots.length === 0 ? (
                            <Text className="text-xs text-gray-400 dark:text-gray-500">
                              No start times fit inside this window.
                            </Text>
                          ) : (
                            <View className="flex-row flex-wrap">
                              {resolved.slots.map((slot) => (
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
                          )}
                        </View>
                      );
                    })()}
                  </View>
                ))}
                <Pressable onPress={addSchedule}>
                  <Text className="text-xs font-semibold text-[#0644C7]">
                    ＋ Add schedule
                  </Text>
                </Pressable>
              </View>
            </Section>

            <Section icon="info" title="Additional Attractions">
              {attractions.length === 0 ? (
                <View className="items-center rounded-2xl border border-dashed border-gray-300 px-5 py-6 dark:border-neutral-700">
                  <Text className="text-sm text-gray-500 dark:text-gray-400">
                    No attractions available yet
                  </Text>
                  <Pressable
                    onPress={() => router.push("/attractions/create-attraction")}
                    className="mt-3 flex-row items-center gap-1.5 rounded-lg bg-[#0644C7] px-4 py-2.5 active:opacity-90"
                    accessibilityRole="button"
                  >
                    <Feather name="plus" size={14} color="#FFFFFF" />
                    <Text className="text-sm font-semibold text-white">
                      Create Attraction
                    </Text>
                  </Pressable>
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
                {rooms.length === 0 ? (
                  <Text className="text-sm text-gray-400 dark:text-gray-500">
                    No spaces available yet
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
              {addOns.length === 0 ? (
                <Text className="text-sm text-gray-400 dark:text-gray-500">
                  No add-ons available yet
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


                {/* Per-additional pricing — only with a max cap and base pricing (web parity). */}
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

            {/* Promos & gift cards are managed on the web, not here — but the
                package's existing links are still held in state and sent back
                on save, so editing from the app never drops them. */}

            <Section icon="file-text" title="Invitation Template">
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
                  ) : invitationFile || existingInvitationFile ? (
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
                            setExistingInvitationFile(null);
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
                      ? "text-[#0644C7] dark:text-blue-400"
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

              {/* Each schedule's window spelled out, since the Available line
                  above collapses to a count once there is more than one. */}
              {previewTimeSlots.length > 0 && (
                <View className="mt-1 flex-row items-start gap-1.5">
                  <Feather
                    name="clock"
                    size={13}
                    color="#6B7280"
                    style={{ marginTop: 2 }}
                  />
                  <View className="flex-1">
                    <Text className="text-xs font-bold text-gray-700 dark:text-gray-200">
                      Time Slots:
                    </Text>
                    {previewTimeSlots.map((slot, i) => (
                      <Text
                        key={`${slot}-${i}`}
                        className="ml-1 text-xs text-gray-600 dark:text-gray-300"
                      >
                        {slot}
                      </Text>
                    ))}
                  </View>
                </View>
              )}

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
                {/* Always listed, even on a per-player package: the form hides
                    the Space picker there, but the preview still reports the
                    state as "No rooms selected" rather than omitting the row. */}
                <Text className="text-xs text-gray-600 dark:text-gray-300">
                  <Text className="font-bold text-gray-900 dark:text-white">
                    SPACE:{" "}
                  </Text>
                  {previewSpaces}
                </Text>
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
                    <Feather name="save" size={16} color="#fff" />
                    <Text className="text-sm font-semibold text-white">
                      Update Package
                    </Text>
                  </>
                )}
              </Pressable>
              <Pressable
                onPress={() => router.back()}
                disabled={submitting}
                className="flex-1 items-center justify-center py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700"
              >
                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Cancel
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
};

export default EditPackage;
