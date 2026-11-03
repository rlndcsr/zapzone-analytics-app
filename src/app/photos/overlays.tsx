import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  Image as RNImage,
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
import { SheetSelect, type SheetSelectOption } from "../../components/ui/SheetSelect";
import { TimePickerSheet } from "../../components/ui/TimePickerSheet";
import { Toast, type ToastType } from "../../components/ui/Toast";
import {
  SkeletonBlock,
  usePulse,
} from "../../components/ui/skeleton/SkeletonBlock";
import { useLocationOptions } from "../../lib/hooks/useLocationOptions";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import {
  setActiveLocation,
  useActiveLocation,
} from "../../lib/location/activeLocationStore";
import {
  copiesSummary,
  dayAfter,
  eventDayRange,
  eventFrameIsOver,
  eventOptionLabel,
  formatInstant,
  isEventFrame,
  parseAppliesTo,
  scheduleLine,
  shortDay,
  venueName,
} from "../../lib/photos/overlayEvents";
import {
  createFrameFiles,
  FRAME_FILE_TYPES,
  FRAME_SHAPES,
  fitsShape,
  missingShapeNote,
  overlayVersions,
  PORTRAIT_DROPPED_MESSAGE,
  portraitDropped,
  SHAPE_HINTS,
  SHAPE_NAMES,
  versionRows,
  versionSavedMessage,
  versionSizeLabel,
  versionsKnown,
  wrongShapeMessage,
  type FrameShape,
  type ImageSize,
  type VersionRow,
} from "../../lib/photos/frameVersions";
import { joinNames } from "../../lib/photos/photoRecipients";
import { shortVenueName } from "../../lib/registrationForms/registrationForms";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchEscapeRoomOptions,
  type EscapeRoomOption,
} from "../../services/escapeRoomService";
import {
  createPhotoOverlay,
  deletePhotoOverlay,
  fetchPhotoEventDays,
  fetchPhotoOverlays,
  removePhotoOverlayAltVersion,
  savePhotoOverlayVersion,
  setPhotoOverlayEnabled,
  setPhotoOverlayRoom,
  type OverlayFile,
  type PhotoEventDay,
  type PhotoOverlay,
  type PhotoOverlayStatus,
  type PhotoOverlays,
} from "../../services/photosService";

const PRIMARY = "#0644C7";

/** Earliest selectable schedule day — the web's datetime-local has no floor. */
const MIN_SCHEDULE_DATE = "2020-01-01";

const NO_EVENT_FRAMES = "This server can't save event frames yet. Nothing was saved.";
const FORM_NOT_LISTED = "That event's day has passed, or its form was removed.";

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

type EventDaysState = {
  locationId: number;
  available: boolean;
  forms: PhotoEventDay[];
  error: string | null;
};

/** A "add a frame for this event" link from a registration form page. */
type FrameLink = {
  formId: number;
  locationId: number | null;
  switched: boolean;
};

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

/** "2026-08-12" + "14:30" → the value a datetime-local input would submit. */
const composeDateTime = (date: string, time: string): string =>
  date ? `${date}T${time || "00:00"}` : "";

/** The picked file's pixel size, or null when it can't be read (the server checks again). */
const readImageSize = (uri: string): Promise<ImageSize | null> =>
  new Promise((resolve) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve(width > 0 && height > 0 ? { width, height } : null),
      () => resolve(null),
    );
  });

/** Pick one frame file, keeping its original bytes so the transparency survives. */
const pickFrameFile = async (): Promise<OverlayFile | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: FRAME_FILE_TYPES,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.uri) return null;
  return {
    uri: asset.uri,
    name: asset.name ?? "overlay.png",
    type: asset.mimeType ?? "image/png",
  };
};

const EMPTY_FRAME_FILES: Record<FrameShape, OverlayFile | null> = {
  landscape: null,
  portrait: null,
};
const NO_FRAME_ERRORS: Record<FrameShape, string | null> = {
  landscape: null,
  portrait: null,
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

/** A ticked option with a line of explanation under it. */
function CheckRow({
  checked,
  onToggle,
  label,
  hint,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  hint: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      className="flex-row items-start gap-3"
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View className="mt-0.5">
        <CheckBox checked={checked} />
      </View>
      <View className="flex-1">
        <Text className="text-sm text-gray-800 dark:text-gray-200">{label}</Text>
        <Text className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          {hint}
        </Text>
      </View>
    </Pressable>
  );
}

/** "2026-10-23" + "14:30" → "10/23/2026 02:30 PM", a datetime-local's display. */
function scheduleDisplay(date: string, time: string): string {
  const [y, m, d] = date.split("-");
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${m}/${d}/${y} ${String(hour12).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
}

/** One field standing in for the web's datetime-local input: date, then time. */
function ScheduleField({
  label,
  date,
  time,
  onPick,
  onClear,
}: {
  label: string;
  date: string;
  time: string;
  onPick: () => void;
  onClear: () => void;
}) {
  return (
    <View className="flex-1">
      <View className="mb-1 flex-row items-center justify-between">
        <Text className="text-sm text-gray-700 dark:text-gray-200">{label}</Text>
        {date ? (
          <Pressable
            onPress={onClear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Clear ${label}`}
          >
            <Text className="text-xs font-medium text-[#0644C7] dark:text-blue-400">Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <Pressable
        onPress={onPick}
        className="flex-row items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-neutral-700 dark:bg-neutral-900"
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text
          className={`flex-1 text-sm ${date ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}`}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {date ? scheduleDisplay(date, time) : "mm/dd/yyyy --:-- --"}
        </Text>
        <Feather name="calendar" size={14} color="#6B7280" />
      </Pressable>
    </View>
  );
}

export default function PhotoOverlaysScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    event?: string;
    location?: string;
    upload?: string;
  }>();

  const user = getCurrentUser();
  const isCompanyAdmin = user?.role === "company_admin";
  const activeLocation = useActiveLocation();
  const { locations, loading: locationsLoading } = useLocationOptions();
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

  // Only admins may copy an event frame to the event's other locations.
  const canCopyFrames = user?.role === "company_admin" || user?.role === "admin";

  const [data, setData] = useState<PhotoOverlays | null>(null);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
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
  const [frameFiles, setFrameFiles] = useState(EMPTY_FRAME_FILES);
  const [frameFileErrors, setFrameFileErrors] = useState(NO_FRAME_ERRORS);
  // Bumped per pick (and on reset) so a slow size check can't land on a newer choice.
  const frameFileChecks = useRef<Record<FrameShape, number>>({ landscape: 0, portrait: 0 });
  const [confirmRemoveVersion, setConfirmRemoveVersion] = useState<{
    overlay: PhotoOverlay;
    shape: FrameShape;
  } | null>(null);
  const [startsDate, setStartsDate] = useState("");
  const [startsTime, setStartsTime] = useState("");
  const [endsDate, setEndsDate] = useState("");
  const [endsTime, setEndsTime] = useState("");
  const [priority, setPriority] = useState("0");
  const [appliesTo, setAppliesTo] = useState("");
  const [limitHours, setLimitHours] = useState(false);
  const [copyToSiblings, setCopyToSiblings] = useState(false);
  const [picker, setPicker] = useState<
    null | "starts-date" | "starts-time" | "ends-date" | "ends-time"
  >(null);
  const [confirmDelete, setConfirmDelete] = useState<PhotoOverlay | null>(null);

  const [rooms, setRooms] = useState<EscapeRoomOption[]>([]);
  const [eventDays, setEventDays] = useState<EventDaysState | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [linkVersion, setLinkVersion] = useState(0);
  const frameLink = useRef<FrameLink | null>(null);
  const eventDaysSeq = useRef(0);

  const load = useCallback(async () => {
    const token = getToken();
    if (!effectiveLocationId || !token || !canManage) return;
    setLoading(true);
    try {
      setData(await fetchPhotoOverlays(token, effectiveLocationId));
      setLoadedAt(Date.now());
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

  const loadEventDays = useCallback(async (locationId: number) => {
    const token = getToken();
    if (!token) return;
    const seq = ++eventDaysSeq.current;
    try {
      const result = await fetchPhotoEventDays(token, locationId);
      if (seq === eventDaysSeq.current) {
        setEventDays({ locationId, available: result.available, forms: result.forms, error: null });
      }
    } catch (e) {
      if (seq === eventDaysSeq.current) {
        setEventDays({
          locationId,
          available: false,
          forms: [],
          error: errorMessage(e, "The event days could not be loaded."),
        });
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // A new location starts the upload form over: its rooms and event days differ.
  useEffect(() => {
    setAppliesTo("");
    setLimitHours(false);
    setCopyToSiblings(false);
    setRooms([]);
    const token = getToken();
    if (!effectiveLocationId || !token || !canManage) return;
    const controller = new AbortController();
    let cancelled = false;
    fetchEscapeRoomOptions(token, effectiveLocationId, controller.signal)
      .then((list) => {
        if (!cancelled) setRooms(list);
      })
      .catch(() => {
        if (!cancelled) setRooms([]);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [canManage, effectiveLocationId]);

  useEffect(() => {
    setEventDays(null);
    if (!effectiveLocationId || !canManage) {
      eventDaysSeq.current += 1;
      return;
    }
    void loadEventDays(effectiveLocationId);
  }, [canManage, effectiveLocationId, loadEventDays]);

  // Read a registration form's "Add one" link once, then clear it from the route.
  useEffect(() => {
    if (!params.event && !params.location) return;
    const formId = Number(params.event);
    const linkLocation = Number(params.location);
    frameLink.current =
      Number.isInteger(formId) && formId > 0
        ? {
            formId,
            locationId:
              Number.isInteger(linkLocation) && linkLocation > 0 ? linkLocation : null,
            switched: false,
          }
        : null;
    router.setParams({ event: undefined, location: undefined });
    setLinkVersion((version) => version + 1);
  }, [params.event, params.location]);

  // From the Photos hub's "Upload Overlay" shortcut (?upload=1): open the
  // upload form once, as the "Upload overlay" button does.
  useEffect(() => {
    if (params.upload !== "1") return;
    router.setParams({ upload: undefined });
    if (canManage) setShowForm(true);
  }, [params.upload, canManage]);

  // Open the upload with the linked event chosen, once its location's event days are in.
  useEffect(() => {
    const link = frameLink.current;
    if (!link || !canManage) return;
    const target = link.locationId ?? effectiveLocationId;
    if (!target) {
      frameLink.current = null;
      return;
    }
    if (effectiveLocationId !== target) {
      if (!isCompanyAdmin) {
        frameLink.current = null;
        showToast({ message: "That form is at another location.", type: "info" });
        return;
      }
      if (link.switched || locationsLoading) return;
      frameLink.current = { ...link, switched: true };
      const listed = locations.find((location) => location.id === target)?.name;
      setActiveLocation({ id: target, name: listed ?? `Location #${target}` });
      showToast({
        message: `Switched to ${listed ? (shortVenueName(listed) ?? listed) : "that location"} to add this frame`,
        type: "info",
      });
      return;
    }
    if (!eventDays || eventDays.locationId !== target) return;
    frameLink.current = null;
    if (eventDays.error) {
      showToast({ message: eventDays.error, type: "error" });
      return;
    }
    if (!eventDays.available) {
      showToast({ message: "Event registrations are not set up yet.", type: "info" });
      return;
    }
    const form = eventDays.forms.find((item) => item.id === link.formId);
    if (!form) {
      showToast({ message: FORM_NOT_LISTED, type: "info" });
      return;
    }
    setAppliesTo(`event:${form.id}`);
    setLimitHours(false);
    setCopyToSiblings(false);
    setShowForm(true);
  }, [
    canManage,
    effectiveLocationId,
    eventDays,
    isCompanyAdmin,
    linkVersion,
    locations,
    locationsLoading,
    showToast,
  ]);

  const eventForms = useMemo(
    () => (eventDays && eventDays.locationId === effectiveLocationId ? eventDays.forms : []),
    [effectiveLocationId, eventDays],
  );

  const chosenEvent = useMemo(() => {
    const { eventId } = parseAppliesTo(appliesTo);
    return eventId === null ? null : (eventForms.find((form) => form.id === eventId) ?? null);
  }, [appliesTo, eventForms]);

  const currentVenue =
    shortVenueName(isCompanyAdmin ? activeLocation.name : (user?.location?.name ?? null)) ??
    "this location";

  const { currentOverlays, pastOverlays } = useMemo(() => {
    const all = data?.overlays ?? [];
    return {
      currentOverlays: all.filter((overlay) => !eventFrameIsOver(overlay, loadedAt)),
      pastOverlays: all.filter((overlay) => eventFrameIsOver(overlay, loadedAt)),
    };
  }, [data, loadedAt]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        load(),
        effectiveLocationId ? loadEventDays(effectiveLocationId) : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [effectiveLocationId, load, loadEventDays]);

  const resetForm = useCallback(() => {
    setName("");
    frameFileChecks.current = {
      landscape: frameFileChecks.current.landscape + 1,
      portrait: frameFileChecks.current.portrait + 1,
    };
    setFrameFiles(EMPTY_FRAME_FILES);
    setFrameFileErrors(NO_FRAME_ERRORS);
    setStartsDate("");
    setStartsTime("");
    setEndsDate("");
    setEndsTime("");
    setPriority("0");
    setAppliesTo("");
    setLimitHours(false);
    setCopyToSiblings(false);
  }, []);

  const chooseAppliesTo = useCallback(
    (value: string) => {
      setAppliesTo(value);
      setCopyToSiblings(false);
      // Hours already typed stay in play for an event, behind "Only during certain hours".
      setLimitHours(value.startsWith("event:") && Boolean(startsDate || endsDate));
    },
    [endsDate, startsDate],
  );

  // A file of the wrong shape is refused on the spot, as on the web; a size
  // that can't be read is left for the server to check.
  const chooseFrameFile = useCallback(async (shape: FrameShape) => {
    const chosen = await pickFrameFile();
    if (!chosen) return;
    const check = frameFileChecks.current[shape] + 1;
    frameFileChecks.current = { ...frameFileChecks.current, [shape]: check };
    const size = await readImageSize(chosen.uri);
    if (frameFileChecks.current[shape] !== check) return;
    if (size && !fitsShape(shape, size)) {
      setFrameFiles((current) => ({ ...current, [shape]: null }));
      setFrameFileErrors((current) => ({ ...current, [shape]: wrongShapeMessage(shape, size) }));
      return;
    }
    setFrameFiles((current) => ({ ...current, [shape]: chosen }));
    setFrameFileErrors((current) => ({ ...current, [shape]: null }));
  }, []);

  // As on the web, closing the form drops the chosen files but keeps the rest.
  const closeForm = useCallback(() => {
    frameFileChecks.current = {
      landscape: frameFileChecks.current.landscape + 1,
      portrait: frameFileChecks.current.portrait + 1,
    };
    setFrameFiles(EMPTY_FRAME_FILES);
    setFrameFileErrors(NO_FRAME_ERRORS);
    setShowForm(false);
  }, []);

  const clearFrameFile = useCallback((shape: FrameShape) => {
    frameFileChecks.current = {
      ...frameFileChecks.current,
      [shape]: frameFileChecks.current[shape] + 1,
    };
    setFrameFiles((current) => ({ ...current, [shape]: null }));
    setFrameFileErrors((current) => ({ ...current, [shape]: null }));
  }, []);

  const create = useCallback(async () => {
    const token = getToken();
    const { image, altImage } = createFrameFiles(frameFiles);
    if (!effectiveLocationId || !image || name.trim().length === 0 || !token)
      return;
    if (busy) return;
    const { roomId, eventId } = parseAppliesTo(appliesTo);
    const withHours = eventId === null || limitHours;
    const copyFrame =
      eventId !== null &&
      copyToSiblings &&
      canCopyFrames &&
      Boolean(chosenEvent?.siblings.some((sibling) => sibling.usable));
    setBusy(true);
    try {
      const { overlay, copies } = await createPhotoOverlay(token, {
        locationId: effectiveLocationId,
        name: name.trim(),
        file: image,
        altFile: altImage,
        startsAt: withHours ? composeDateTime(startsDate, startsTime) || undefined : undefined,
        endsAt: withHours ? composeDateTime(endsDate, endsTime) || undefined : undefined,
        priority: Number(priority) || 0,
        packageId: roomId ?? undefined,
        registrationEventId: eventId ?? undefined,
        alsoOtherLocations: copyFrame,
      });
      // An older server drops the event and saves an everyday frame instead.
      if (eventId !== null && overlay.registrationEventId !== eventId) {
        const removed = await deletePhotoOverlay(token, overlay.id).then(
          () => true,
          () => false,
        );
        showToast({
          message: removed
            ? NO_EVENT_FRAMES
            : `This server can't save event frames yet, and the everyday frame it saved instead could not be removed. Delete “${name.trim()}” below.`,
          type: "error",
        });
        await load();
        return;
      }
      const summary = copiesSummary(copies);
      showToast(
        portraitDropped(frameFiles, overlay)
          ? { message: PORTRAIT_DROPPED_MESSAGE, type: "error" }
          : {
              message: summary ? `Overlay uploaded. ${summary}` : "Overlay uploaded.",
              type: copies.skipped.length > 0 ? "info" : "success",
            },
      );
      setShowForm(false);
      resetForm();
      await load();
      if (eventId !== null) void loadEventDays(effectiveLocationId);
    } catch (e) {
      showToast({
        message: errorMessage(e, "That overlay could not be saved."),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }, [
    appliesTo,
    busy,
    canCopyFrames,
    chosenEvent,
    copyToSiblings,
    effectiveLocationId,
    endsDate,
    endsTime,
    frameFiles,
    limitHours,
    load,
    loadEventDays,
    name,
    priority,
    resetForm,
    showToast,
    startsDate,
    startsTime,
  ]);

  // Add or Replace one shape on an existing frame. The lock covers the picker
  // too: `busy` only goes up once a file is chosen.
  const versionLock = useRef(false);
  const saveVersion = useCallback(
    async (overlay: PhotoOverlay, row: VersionRow) => {
      if (busy || versionLock.current) return;
      versionLock.current = true;
      try {
        const chosen = await pickFrameFile();
        if (!chosen) return;
        const size = await readImageSize(chosen.uri);
        if (size && !fitsShape(row.shape, size)) {
          showToast({ message: wrongShapeMessage(row.shape, size), type: "error" });
          return;
        }
        const token = getToken();
        if (!token) return;
        setBusy(true);
        await savePhotoOverlayVersion(token, overlay.id, row.slot, chosen);
        showToast({ message: versionSavedMessage(row.shape), type: "success" });
        await load();
      } catch (e) {
        showToast({
          message: errorMessage(e, "That version could not be saved."),
          type: "error",
        });
      } finally {
        versionLock.current = false;
        setBusy(false);
      }
    },
    [busy, load, showToast],
  );

  const removeVersion = useCallback(async () => {
    const token = getToken();
    if (!confirmRemoveVersion || !token || busy) return;
    const { overlay, shape } = confirmRemoveVersion;
    setBusy(true);
    try {
      await removePhotoOverlayAltVersion(token, overlay.id);
      showToast({ message: `${SHAPE_NAMES[shape]} version removed.`, type: "info" });
      setConfirmRemoveVersion(null);
      await load();
    } catch (e) {
      showToast({
        message: errorMessage(e, "That version could not be removed."),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }, [busy, confirmRemoveVersion, load, showToast]);

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

  const changeRoom = useCallback(
    async (overlay: PhotoOverlay, value: string) => {
      const token = getToken();
      const roomId = value ? Number(value) : null;
      if (!token || busy || roomId === overlay.packageId) return;
      setBusy(true);
      try {
        await setPhotoOverlayRoom(token, overlay.id, roomId);
        showToast({
          message: roomId
            ? "Saved. This overlay is now used only for that room's group photos."
            : "Saved. This overlay is now used for all photos at this location.",
          type: "success",
        });
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
    const removed = confirmDelete;
    setBusy(true);
    try {
      await deletePhotoOverlay(token, removed.id);
      showToast({
        message:
          "Overlay deleted. New photos use the date layer only unless another overlay is active.",
        type: "info",
      });
      setConfirmDelete(null);
      await load();
      if (isEventFrame(removed) && effectiveLocationId) {
        void loadEventDays(effectiveLocationId);
      }
    } catch (e) {
      showToast({
        message: errorMessage(e, "That overlay could not be deleted."),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }, [busy, confirmDelete, effectiveLocationId, load, loadEventDays, showToast]);

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
          Photo Overlays
        </Text>
        <Pressable
          onPress={() => void onRefresh()}
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
              Photo Overlays are managed by a manager
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

  const roomActive = (data?.overlays ?? []).some(
    (other) => other.packageId && other.isActive,
  );
  const siblings = chosenEvent && canCopyFrames ? chosenEvent.siblings : [];
  const usableSiblings = siblings.filter((sibling) => sibling.usable);
  const skippedSiblings = siblings.filter((sibling) => !sibling.usable);
  const showHours = !chosenEvent || limitHours;

  const appliesToOptions: SheetSelectOption[] = [
    { label: "All photos at this location", value: "" },
    ...rooms.map((room) => ({ label: `Escape room: ${room.name}`, value: `room:${room.id}` })),
    ...eventForms.map((form) => ({
      label: `Event day: ${eventOptionLabel(form)}`,
      value: `event:${form.id}`,
    })),
  ];

  const roomOptionsFor = (overlay: PhotoOverlay): SheetSelectOption[] => [
    { label: "All photos at this location", value: "" },
    ...rooms.map((room) => ({ label: room.name, value: String(room.id) })),
    ...(overlay.packageId && !rooms.some((room) => room.id === overlay.packageId)
      ? [{ label: overlay.roomName ?? "Escape room", value: String(overlay.packageId) }]
      : []),
  ];

  const renderCard = (overlay: PhotoOverlay) => {
    const status = STATUS_STYLES[overlay.status];
    const event = overlay.event;
    const eventFrame = isEventFrame(overlay);
    const schedule = scheduleLine(overlay, formatInstant);
    const eventDayText = event ? eventDayRange(event.firstDay, event.eventDate) : "";
    const versions = overlayVersions(overlay);
    const shapeNote = missingShapeNote(overlay.missingShape);
    return (
      <View
        key={overlay.id}
        className="mb-4 overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      >
        <View className="aspect-video w-full flex-row items-center justify-center gap-3 overflow-hidden p-3">
          <Checkerboard id={`overlay-${overlay.id}`} />
          {versions.length > 0 ? (
            versions.map((version) => (
              <Image
                key={version.slot}
                source={{ uri: version.url }}
                style={{ flex: 1, height: "100%" }}
                contentFit="contain"
                accessibilityLabel={`${overlay.name}${version.shape ? ` (${version.shape})` : ""}`}
              />
            ))
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
            <View className="max-w-[60%] items-end gap-1">
              <View className={`rounded-full px-2 py-0.5 ${status.wrap}`}>
                <Text className={`text-[11px] ${status.text}`}>
                  {overlay.status}
                </Text>
              </View>
              {overlay.packageId ? (
                <View className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-neutral-800">
                  <Text className="text-[11px] text-gray-700 dark:text-gray-300">
                    Room: {overlay.roomName ?? "escape room"}
                  </Text>
                </View>
              ) : null}
              {overlay.isActive && (
                <View className="rounded-full bg-green-600 px-2 py-0.5">
                  <Text className="text-right text-[11px] text-white">
                    {eventFrame
                      ? "used for new photos today"
                      : overlay.packageId
                        ? `used for ${overlay.roomName ?? "this room"}'s group photos`
                        : roomActive
                          ? "used for all other new photos"
                          : "used for new photos"}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {!!schedule && (
            <Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {schedule}
            </Text>
          )}

          {eventFrame && (
            <View className="mt-2 flex-row items-start gap-1.5">
              <Feather name="calendar" size={13} color="#9CA3AF" style={{ marginTop: 1 }} />
              <Text className="flex-1 text-xs text-gray-700 dark:text-gray-300">
                Applies to: Event
                {event?.name ? ` · ${event.name}` : ""}
                {eventDayText ? ` · ${eventDayText}` : ""}
              </Text>
            </View>
          )}

          {event?.locationFormRemoved ? (
            <View className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/20">
              <Text className="text-xs text-amber-900 dark:text-amber-300">
                Event removed. This frame is no longer used; upload it again for
                the event&apos;s current form.
              </Text>
            </View>
          ) : event?.neverRuns ? (
            <View className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/20">
              <Text className="text-xs text-amber-900 dark:text-amber-300">
                Its hours fall outside the event&apos;s day(s), so it is never used.
              </Text>
            </View>
          ) : null}

          {!eventFrame && (rooms.length > 0 || overlay.packageId) && (
            <View className="mt-3">
              <Text className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                Applies to
              </Text>
              <SheetSelect
                title="Applies to"
                value={overlay.packageId ? String(overlay.packageId) : ""}
                options={roomOptionsFor(overlay)}
                disabled={busy}
                onSelect={(value) => void changeRoom(overlay, String(value))}
              />
            </View>
          )}

          {versionsKnown(overlay) && (
            <View className="mt-3 gap-1.5">
              {versionRows(overlay).map((row) => (
                <View key={row.shape} className="flex-row flex-wrap items-center gap-2">
                  <Text className="w-20 text-xs text-gray-500 dark:text-gray-400">
                    {SHAPE_NAMES[row.shape]}
                  </Text>
                  <Text
                    className={`flex-1 text-xs ${
                      row.version
                        ? "text-gray-800 dark:text-gray-200"
                        : "text-amber-700 dark:text-amber-400"
                    }`}
                  >
                    {versionSizeLabel(row.version)}
                  </Text>
                  {row.action && (
                    <Pressable
                      onPress={() => void saveVersion(overlay, row)}
                      disabled={busy}
                      className={`rounded-md border border-gray-200 px-2 py-1 dark:border-neutral-700 ${
                        busy ? "opacity-40" : "active:opacity-70"
                      }`}
                      accessibilityRole="button"
                      accessibilityLabel={`${row.action === "replace" ? "Replace" : "Add"} the ${row.shape} version of ${overlay.name}`}
                    >
                      <Text className="text-xs text-gray-700 dark:text-gray-200">
                        {row.action === "replace" ? "Replace" : "Add"}
                      </Text>
                    </Pressable>
                  )}
                  {row.canRemove && (
                    <Pressable
                      onPress={() => setConfirmRemoveVersion({ overlay, shape: row.shape })}
                      disabled={busy}
                      className={`rounded-md border border-gray-200 px-2 py-1 dark:border-neutral-700 ${
                        busy ? "opacity-40" : "active:opacity-70"
                      }`}
                      accessibilityRole="button"
                      accessibilityLabel={`Remove the ${row.shape} version of ${overlay.name}`}
                    >
                      <Text className="text-xs text-red-700 dark:text-red-400">Remove</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              {!!shapeNote && (
                <View className="flex-row items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/20">
                  <Feather name="alert-triangle" size={13} color="#B45309" style={{ marginTop: 1 }} />
                  <Text className="flex-1 text-xs text-amber-900 dark:text-amber-300">
                    {shapeNote}
                  </Text>
                </View>
              )}
            </View>
          )}

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
  };

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
                  {conflict.conflictsWithName}&rdquo; —{" "}
                  {conflict.winnerName
                    ? `“${conflict.winnerName}” is used for new photos.`
                    : "the higher priority one is used for new photos."}
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

          {currentOverlays.map(renderCard)}

          {pastOverlays.length > 0 && (
            <View className="mt-2">
              <Pressable
                onPress={() => setShowPast((open) => !open)}
                className="flex-row items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 active:opacity-70 dark:border-neutral-800 dark:bg-neutral-900"
                accessibilityRole="button"
                accessibilityState={{ expanded: showPast }}
              >
                <Text className="text-sm font-medium text-gray-900 dark:text-white">
                  Past events ({pastOverlays.length})
                </Text>
                <Feather
                  name={showPast ? "chevron-up" : "chevron-down"}
                  size={16}
                  color="#6B7280"
                />
              </Pressable>
              {showPast && <View className="mt-4">{pastOverlays.map(renderCard)}</View>}
            </View>
          )}
        </View>
      </ScrollView>

      <BottomSheet
        visible={showForm}
        onClose={closeForm}
        title="Upload an overlay"
      >
        <ScrollView
          className="px-5"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text className="mb-4 text-sm text-gray-500 dark:text-gray-400">
            Use a PNG with a see-through middle. Give the frame a landscape
            version and a portrait version: each photo gets the version that
            matches its shape, so the whole frame shows. With only one version,
            photos of the other shape cut off part of the frame. The capture
            date is drawn on top.
          </Text>

          <Text className="mb-1 text-sm text-gray-700 dark:text-gray-200">
            Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={120}
            accessibilityLabel="Name"
            className="mb-4 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />

          {/* The web's two file inputs: "Choose File" then the picked name. */}
          {FRAME_SHAPES.map((shape) => (
            <View key={shape} className="mb-4">
              <Text className="mb-1 text-sm text-gray-700 dark:text-gray-200">
                {SHAPE_NAMES[shape]} version{" "}
                <Text className="text-gray-500 dark:text-gray-400">
                  ({SHAPE_HINTS[shape]})
                </Text>
              </Text>
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={() => void chooseFrameFile(shape)}
                  className="rounded-md border border-gray-300 bg-gray-100 px-3 py-1.5 active:opacity-70 dark:border-neutral-600 dark:bg-neutral-800"
                  accessibilityRole="button"
                  accessibilityLabel={`Choose the ${shape} version`}
                >
                  <Text className="text-sm text-gray-900 dark:text-white">Choose File</Text>
                </Pressable>
                <Text
                  className="flex-1 text-sm text-gray-900 dark:text-white"
                  numberOfLines={1}
                >
                  {frameFiles[shape]?.name ?? "No file chosen"}
                </Text>
                {!!frameFiles[shape] && (
                  <Pressable
                    onPress={() => clearFrameFile(shape)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Clear the ${shape} version`}
                  >
                    <Feather name="x" size={16} color="#9CA3AF" />
                  </Pressable>
                )}
              </View>
              {!!frameFileErrors[shape] && (
                <Text className="mt-1 text-xs text-red-700 dark:text-red-400">
                  {frameFileErrors[shape]}
                </Text>
              )}
            </View>
          ))}

          <View className="mb-4">
            <Text className="mb-1 text-sm text-gray-700 dark:text-gray-200">
              Applies to
            </Text>
            <SheetSelect
              title="Applies to"
              value={appliesTo}
              options={appliesToOptions}
              onSelect={(value) => chooseAppliesTo(String(value))}
            />
            {chosenEvent ? (
              <View className="mt-2 gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800/60">
                <Text className="text-xs text-gray-700 dark:text-gray-300">
                  Used for every photo at {currentVenue} from 6:00 AM{" "}
                  {shortDay(chosenEvent.firstDay || chosenEvent.eventDate)} to
                  6:00 AM {shortDay(dayAfter(chosenEvent.eventDate))}, except
                  escape-room group photos. Photos already taken keep their
                  frame.
                </Text>
                {chosenEvent.dayCount > 3 && (
                  <Text className="text-xs text-amber-800 dark:text-amber-300">
                    This event runs {chosenEvent.dayCount} days, and the frame
                    is used on every one of them.
                  </Text>
                )}
                <Text className="text-xs text-gray-700 dark:text-gray-300">
                  Leave the date off the artwork. Each photo already gets its
                  capture date on top.
                </Text>
              </View>
            ) : (
              <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                A room overlay is used only for that escape room&apos;s group
                photos.
                {eventForms.length > 0
                  ? " An event-day overlay is used only on that event’s day(s)."
                  : ""}{" "}
                The date stamp is added on top as usual.
              </Text>
            )}
          </View>

          {siblings.length > 0 && (
            <View className="mb-4 gap-2 rounded-lg border border-gray-200 p-3 dark:border-neutral-700">
              <Text className="text-xs font-medium text-gray-600 dark:text-gray-400">
                This event&apos;s other locations
              </Text>
              {usableSiblings.length > 0 && (
                <CheckRow
                  checked={copyToSiblings}
                  onToggle={() => setCopyToSiblings((v) => !v)}
                  label={`Also use it at ${joinNames(
                    usableSiblings.map((sibling) => venueName(sibling.locationName)),
                  )}`}
                  hint="Each location gets its own copy, used on its own event day. Change or delete a copy from that location's overlays."
                />
              )}
              {skippedSiblings.map((sibling) => (
                <Text
                  key={sibling.formId}
                  className="text-xs text-gray-400 dark:text-gray-500"
                >
                  {venueName(sibling.locationName)}
                  {sibling.reason ? `: ${sibling.reason}` : ""}
                </Text>
              ))}
            </View>
          )}

          {chosenEvent && (
            <View className="mb-4">
              <CheckRow
                checked={limitHours}
                onToggle={() => setLimitHours((v) => !v)}
                label="Only during certain hours"
                hint="Optional. The hours must fall inside the event's day(s)."
              />
            </View>
          )}

          {showHours && (
            <View className="mb-4 flex-row gap-3">
              <ScheduleField
                label="Starts (optional)"
                date={startsDate}
                time={startsTime}
                onPick={() => setPicker("starts-date")}
                onClear={() => {
                  setStartsDate("");
                  setStartsTime("");
                }}
              />
              <ScheduleField
                label="Ends (optional)"
                date={endsDate}
                time={endsTime}
                onPick={() => setPicker("ends-date")}
                onClear={() => {
                  setEndsDate("");
                  setEndsTime("");
                }}
              />
            </View>
          )}

          <Text className="mb-1 text-sm text-gray-700 dark:text-gray-200">
            Priority when schedules overlap
          </Text>
          <TextInput
            value={priority}
            onChangeText={(t) => {
              // The web's number input runs 0–100, the same bounds the server checks.
              const digits = t.replace(/[^0-9]/g, "");
              setPriority(digits === "" ? "" : String(Math.min(100, Number(digits))));
            }}
            keyboardType="number-pad"
            maxLength={3}
            accessibilityLabel="Priority when schedules overlap"
            className="mb-5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          />

          <View className="mb-8">
            <PrimaryButton
              label="Save overlay"
              onPress={() => void create()}
              loading={busy}
              disabled={
                !(frameFiles.landscape || frameFiles.portrait) ||
                name.trim().length === 0
              }
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
          setPicker("starts-time");
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
          setPicker("ends-time");
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
        visible={!!confirmRemoveVersion}
        title={`Remove the ${confirmRemoveVersion?.shape ?? ""} version of "${confirmRemoveVersion?.overlay.name ?? ""}"?`}
        message="Photos already taken keep it."
        confirmLabel="Remove"
        cancelLabel="Keep it"
        destructive
        loading={busy}
        onConfirm={() => void removeVersion()}
        onCancel={() => setConfirmRemoveVersion(null)}
      />

      <ConfirmationModal
        visible={!!confirmDelete}
        title={`Delete "${confirmDelete?.name ?? ""}"?`}
        message="Photos already taken keep this frame in the image, but the library will no longer show which frame they used."
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
