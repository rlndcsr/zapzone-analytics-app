import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KioskAdModal } from "../../components/ui/KioskAdModal";
import { StaffReturnControl } from "../../components/ui/StaffReturnControl";
import { StatusModal } from "../../components/ui/StatusModal";
import { WaiverSuccessModal } from "../../components/ui/WaiverSuccessModal";
import { KioskWaiverForm } from "../../components/waivers/KioskWaiverForm";
import { ApiError } from "../../lib/api";
import { formatFullDate } from "../../lib/date/calendar";
import { DATE_KEY } from "../../lib/escapeRooms/escapeRooms";
import { useStatusModal } from "../../lib/hooks/useStatusModal";
import { markWaiversStale } from "../../lib/hooks/useWaivers";
import { touchSession } from "../../lib/session";
import type { KioskAd } from "../../lib/waivers/kioskContract";
import {
  fetchEscapeRoomForm,
  fetchEscapeRoomKiosk,
  submitEscapeRoomWaiver,
  type EscapeRoomGameLink,
  type EscapeRoomGuestRoom,
  type EscapeRoomGuestTime,
  type EscapeRoomKiosk,
  type EscapeRoomRoomForm,
} from "../../services/escapeRoomService";
import type { KioskSubmission } from "../../services/waiversService";

const PRIMARY = "#0644C7";
const SUCCESS_HOLD_SECONDS = 25;
const RETRY_SECONDS = 30;
const BROKEN_LINK =
  "This check-in link isn't right. Please scan the QR code at the escape-room desk again, or ask a team member.";

type Phase = "room" | "time" | "form";

const STEPS: { key: Phase; label: string }[] = [
  { key: "room", label: "Room" },
  { key: "time", label: "Time" },
  { key: "form", label: "Waiver" },
];

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

/** A submission refused on this field (the backend's `errors.{field}`). */
const refusedField = (e: unknown, field: string): boolean =>
  e instanceof ApiError && !!e.fieldErrors?.[field];

/** Times a guest may pick; a game that just finished is still accepted but not offered. */
const openTimes = (times: EscapeRoomGuestTime[]) => times.filter((t) => !t.justFinished);

/** "Tuesday, September 29" without the year, as the web words it. */
const dayLabel = (key: string) => formatFullDate(key).replace(/, \d{4}$/, "");

function TimeGrid({
  times,
  onPick,
}: {
  times: EscapeRoomGuestTime[];
  onPick: (time: EscapeRoomGuestTime) => void;
}) {
  return (
    <View className="-mx-1.5 flex-row flex-wrap">
      {times.map((t) => (
        <View key={t.time} className="mb-3 w-1/2 px-1.5">
          <Pressable
            onPress={() => onPick(t)}
            className="items-center rounded-xl border-2 border-gray-200 bg-white px-3 py-4 active:border-[#0644C7] active:bg-blue-50 dark:border-neutral-700 dark:bg-neutral-900"
            accessibilityRole="button"
            accessibilityLabel={`${t.label}${t.inProgress ? ", started" : ""}`}
          >
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              {t.label}
            </Text>
            {t.inProgress && (
              <Text className="mt-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                Started
              </Text>
            )}
          </Pressable>
        </View>
      ))}
    </View>
  );
}

function Notice({ children }: { children: string }) {
  return (
    <View
      className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/20"
      accessibilityLiveRegion="polite"
    >
      <Text className="text-center text-sm text-amber-800 dark:text-amber-300">
        {children}
      </Text>
    </View>
  );
}

function OutlineButton({
  label,
  onPress,
  tone = "gray",
}: {
  label: string;
  onPress: () => void;
  tone?: "gray" | "blue";
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`min-h-[44px] items-center justify-center rounded-lg border bg-white px-4 active:opacity-80 dark:bg-neutral-900 ${
        tone === "blue"
          ? "border-blue-200 dark:border-blue-900/50"
          : "border-gray-300 dark:border-neutral-700"
      }`}
      accessibilityRole="button"
    >
      <Text
        className={`text-sm font-semibold ${
          tone === "blue"
            ? "text-[#0644C7] dark:text-blue-300"
            : "text-gray-700 dark:text-gray-200"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Escape-room guest check-in, run inside the app — the web's
 * /waiver/escape-room/{locationId}?staff=1 page. Staff open it from Escape
 * Rooms ("Open on this device") and hand the device over: players choose their
 * room and time and sign the room's waiver, and the screen clears itself
 * between guests. Staff leave with the press-and-hold control.
 *
 * Params: `locationId`, and optionally `date` + `room` + `time` for one game's
 * check-in (the room and time are then picked already).
 */
export default function EscapeRoomKioskScreen() {
  const insets = useSafeAreaInsets();
  const status = useStatusModal();
  const params = useLocalSearchParams<{
    locationId?: string;
    date?: string;
    room?: string;
    time?: string;
  }>();
  const locationId = Number(params.locationId) || 0;
  const linkDate = params.date && DATE_KEY.test(params.date) ? params.date : null;

  // "Playing today instead?" drops the game link, like the web's plain URL.
  const [linkDropped, setLinkDropped] = useState(false);
  const gameLink = useMemo<EscapeRoomGameLink | null>(
    () =>
      linkDate && !linkDropped
        ? {
            date: linkDate,
            ...(params.room ? { room: params.room } : {}),
            ...(params.time ? { time: params.time } : {}),
          }
        : null,
    [linkDate, linkDropped, params.room, params.time],
  );

  const [kiosk, setKiosk] = useState<EscapeRoomKiosk | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkBroken, setLinkBroken] = useState(false);
  const [phase, setPhase] = useState<Phase>("room");
  const [room, setRoom] = useState<EscapeRoomGuestRoom | null>(null);
  const [time, setTime] = useState<EscapeRoomGuestTime | null>(null);
  const [form, setForm] = useState<EscapeRoomRoomForm | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [completedName, setCompletedName] = useState<string | null>(null);
  const [completedAd, setCompletedAd] = useState<KioskAd | null>(null);
  const [completedWaiverId, setCompletedWaiverId] = useState<number | null>(null);
  const [completedRef, setCompletedRef] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const scrollRef = useRef<ScrollView>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadSequence = useRef(0);
  const stepSequence = useRef(0);
  const hasLoaded = useRef(false);

  const timeoutSeconds = kiosk?.inactivityTimeoutSeconds ?? 120;
  const toTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  const loadKiosk = useCallback(async (): Promise<EscapeRoomKiosk | null> => {
    if (!locationId) {
      setLinkBroken(true);
      setError(BROKEN_LINK);
      setLoading(false);
      return null;
    }
    const sequence = ++loadSequence.current;
    try {
      const data = await fetchEscapeRoomKiosk(locationId, gameLink);
      if (sequence !== loadSequence.current) return null;
      hasLoaded.current = true;
      setKiosk(data);
      setError(null);
      return data;
    } catch (e) {
      if (sequence === loadSequence.current && !hasLoaded.current) {
        const notFound = e instanceof ApiError && e.status === 404;
        setLinkBroken(notFound);
        setError(
          notFound
            ? BROKEN_LINK
            : errorMessage(e, "Escape-room check-in is not available right now."),
        );
      }
      return null;
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [locationId, gameLink]);

  useEffect(() => {
    void loadKiosk();
  }, [loadKiosk]);

  const activeLink = kiosk && gameLink && kiosk.date === gameLink.date ? gameLink : null;

  // Unavailable (not a bad link): try again by itself, as the web does.
  useEffect(() => {
    if (!error || hasLoaded.current || linkBroken) return;
    const timer = setInterval(() => void loadKiosk(), RETRY_SECONDS * 1000);
    return () => clearInterval(timer);
  }, [error, linkBroken, loadKiosk]);

  const resetAll = useCallback(() => {
    stepSequence.current++;
    setFormKey((k) => k + 1);
    setPhase("room");
    setRoom(null);
    setTime(null);
    setForm(null);
    setFormLoading(false);
    setNotice(null);
    setJustCompleted(false);
    setCompletedName(null);
    setCompletedAd(null);
    setCompletedWaiverId(null);
    setCompletedRef(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    void loadKiosk();
  }, [loadKiosk]);

  // Inactivity clears the device for the next guest. Any touch re-arms it —
  // and counts as app activity: this screen can serve guests for hours with no
  // staff screen in between, and its public calls don't extend the staff
  // session, so without this the app would sign out under a guest.
  const idleActive = !loading && !error && !justCompleted;
  const armIdle = useCallback(() => {
    void touchSession();
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (!idleActive) return;
    idleTimer.current = setTimeout(resetAll, timeoutSeconds * 1000);
  }, [idleActive, resetAll, timeoutSeconds]);

  useEffect(() => {
    armIdle();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, [armIdle]);

  const startNextPlayer = () => {
    if (!room || !time || !form) {
      resetAll();
      return;
    }
    setFormKey((k) => k + 1);
    setPhase("form");
    setNotice(null);
    setJustCompleted(false);
    setCompletedName(null);
    setCompletedAd(null);
    setCompletedWaiverId(null);
    setCompletedRef(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const refreshRoomTimes = async (current: EscapeRoomGuestRoom) => {
    const sequence = stepSequence.current;
    try {
      const data = await fetchEscapeRoomForm(locationId, current.id, activeLink);
      if (sequence !== stepSequence.current) return;
      setRoom((r) => (r && r.id === current.id ? { ...r, times: data.times } : r));
    } catch {
      // The grid keeps the times it has.
    }
  };

  const chooseRoom = async (picked: EscapeRoomGuestRoom) => {
    const sequence = ++stepSequence.current;
    setNotice(null);
    setRoom(picked);
    setTime(null);
    setForm(null);
    setFormLoading(false);
    setPhase("time");
    toTop();
    const fresh = await loadKiosk();
    if (sequence !== stepSequence.current || !fresh) return;
    const updated = fresh.rooms.find((r) => r.id === picked.id);
    if (!updated) {
      setRoom(null);
      setPhase("room");
      setNotice("That room is not available right now. Please choose another room.");
    } else {
      setRoom(updated);
    }
  };

  const chooseTime = async (picked: EscapeRoomGuestTime, forRoom?: EscapeRoomGuestRoom) => {
    const current = forRoom ?? room;
    if (!current) return;
    setNotice(null);
    setTime(picked);
    setPhase("form");

    // Changing only the time keeps the waiver and whatever was typed into it.
    if (form && form.room.id === current.id) return;

    const sequence = ++stepSequence.current;
    setFormLoading(true);
    toTop();
    try {
      const data = await fetchEscapeRoomForm(locationId, current.id, activeLink);
      if (sequence !== stepSequence.current) return;
      setRoom((r) => (r && r.id === current.id ? { ...r, times: data.times } : r));
      if (!data.times.some((t) => t.time === picked.time)) {
        setTime(null);
        setNotice("That time is no longer available. Please choose another time.");
      }
      setForm(data);
      setFormKey((k) => k + 1);
    } catch (e) {
      if (sequence !== stepSequence.current) return;
      setTime(null);
      setPhase("time");
      setNotice(errorMessage(e, "This room is not ready for check-in. Please see the front desk."));
    } finally {
      if (sequence === stepSequence.current) setFormLoading(false);
    }
  };
  const chooseTimeRef = useRef(chooseTime);
  chooseTimeRef.current = chooseTime;

  // A one-game link: say so when it is for another day, else pick its room and time.
  const preselect = useRef<{ room: number; time: string | null } | null>(
    Number(params.room) > 0 ? { room: Number(params.room), time: params.time ?? null } : null,
  );
  const linkChecked = useRef(false);

  useEffect(() => {
    if (!kiosk || linkChecked.current) return;
    linkChecked.current = true;
    if (!linkDate || linkDropped || linkDate === kiosk.date) return;
    preselect.current = null;
    setNotice(
      linkDate < kiosk.date
        ? `That link was for a game on ${dayLabel(linkDate)}. If you are playing today, choose your room and time below.`
        : "That game could not be opened. Please choose your room and time below, or see the front desk.",
    );
  }, [kiosk, linkDate, linkDropped]);

  useEffect(() => {
    const wanted = preselect.current;
    if (!kiosk || !wanted || !linkChecked.current) return;
    preselect.current = null;
    const picked = kiosk.rooms.find((r) => r.id === wanted.room);
    if (!picked) {
      setNotice("That game is not taking check-ins right now. Please choose your room.");
      return;
    }
    setRoom(picked);
    setPhase("time");
    const slot = wanted.time ? picked.times.find((t) => t.time === wanted.time) : undefined;
    if (slot) {
      void chooseTimeRef.current(slot, picked);
    } else if (wanted.time) {
      setNotice(
        kiosk.ahead
          ? "We could not find a booking for that room and time. Please check your booking email, or see the front desk."
          : "That game time is no longer open. Please choose your time.",
      );
    }
  }, [kiosk]);

  const backToRooms = () => {
    stepSequence.current++;
    setRoom(null);
    setTime(null);
    setForm(null);
    setFormLoading(false);
    setNotice(null);
    setPhase("room");
    void loadKiosk();
  };

  const changeTime = () => {
    setTime(null);
    setNotice(null);
    if (room) void refreshRoomTimes(room);
  };

  const playToday = () => {
    preselect.current = null;
    linkChecked.current = true;
    setLinkDropped(true);
    resetAll();
  };

  const handleSubmit = async (submission: KioskSubmission) => {
    if (!room) {
      backToRooms();
      return;
    }
    if (!time) {
      status.error("Choose your game time", "Choose your game time at the top of the page first.");
      toTop();
      return;
    }
    setSubmitting(true);
    try {
      const result = await submitEscapeRoomWaiver(locationId, room.id, time.time, submission, {
        sessionDate: time.date,
        templateId: form?.form.templateId,
        templateVersion: form?.form.version,
      });
      markWaiversStale();
      setCompletedName(submission.adult_first_name);
      setCompletedAd(result.ad);
      setCompletedWaiverId(result.id);
      setCompletedRef(result.referenceNumber);
      setJustCompleted(true);
    } catch (e) {
      if (refusedField(e, "waiver_template_version")) {
        // The waiver changed while they were reading it: load the new one.
        const message = errorMessage(
          e,
          "This waiver was updated while you were filling it in. Please read it again before signing.",
        );
        try {
          const fresh = await fetchEscapeRoomForm(locationId, room.id, activeLink);
          setRoom((r) => (r && r.id === room.id ? { ...r, times: fresh.times } : r));
          setForm(fresh);
          setFormKey((k) => k + 1);
          if (!fresh.times.some((t) => t.time === time.time)) setTime(null);
        } catch {
          backToRooms();
        }
        setNotice(message);
        toTop();
      } else if (refusedField(e, "package_id")) {
        backToRooms();
        setNotice(errorMessage(e, "That room is not available right now. Please choose another room."));
        toTop();
      } else if (refusedField(e, "session_time")) {
        setTime(null);
        setNotice(errorMessage(e, "That time is no longer available. Please choose another time."));
        toTop();
        void refreshRoomTimes(room);
      } else {
        status.error(
          "Could not submit",
          errorMessage(e, "Your waiver could not be submitted. Please try again."),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const subtitle = kiosk ? `${kiosk.location.name} · ${kiosk.dateLabel}` : "Check-in is not available right now";

  const shell = (children: React.ReactNode) => (
    <View
      className="flex-1 bg-gray-50 dark:bg-black"
      onTouchStart={armIdle}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScrollBeginDrag={armIdle}
          contentContainerStyle={{
            padding: 16,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 32,
          }}
        >
          <View className="mb-3 items-center rounded-2xl bg-[#1D3FCF] px-5 py-7">
            <View className="mb-3 h-12 w-12 items-center justify-center rounded-xl bg-white/15">
              <Feather name="file-text" size={22} color="#FFFFFF" />
            </View>
            <Text className="text-center text-lg font-bold text-white">
              Escape Room Check-In
            </Text>
            <Text className="mt-1 text-center text-sm text-white/80">{subtitle}</Text>
          </View>

          <StaffReturnControl />

          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 dark:bg-black">
        <ActivityIndicator color={PRIMARY} />
        <Text className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Loading escape-room check-in...
        </Text>
      </View>
    );
  }

  if (error || !kiosk) {
    return shell(
      <View className="items-center rounded-xl border border-gray-100 bg-white px-6 py-10 dark:border-neutral-800 dark:bg-neutral-900">
        <Text className="text-center text-sm text-gray-700 dark:text-gray-200">
          {error ?? "Escape-room check-in is not available right now."}
        </Text>
        {!linkBroken && (
          <>
            <Text className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
              {`This page tries again by itself every ${RETRY_SECONDS} seconds. If this keeps happening, please see the front desk.`}
            </Text>
            <Pressable
              onPress={() => {
                setLoading(true);
                void loadKiosk();
              }}
              className="mt-4 rounded-lg bg-[#0644C7] px-5 py-2.5 active:opacity-80"
              accessibilityRole="button"
            >
              <Text className="text-sm font-semibold text-white">Try again</Text>
            </Pressable>
          </>
        )}
      </View>,
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.key === phase);
  const hasRooms = kiosk.rooms.length > 0;
  const noGamesText = kiosk.ahead
    ? "There are no booked games in this room that day. Please check your booking email, or see the front desk."
    : "There are no more games in this room today. Please see the front desk.";

  return (
    <>
      {shell(
        <>
          {kiosk.ahead && (
            <View className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-900/20">
              <Text className="text-center text-sm text-blue-900 dark:text-blue-200">
                You are signing ahead for your booked game on{" "}
                <Text className="font-bold">{kiosk.dateLabel}</Text>.{" "}
                <Text
                  onPress={playToday}
                  className="font-semibold underline"
                  accessibilityRole="button"
                >
                  Playing today instead?
                </Text>
              </Text>
            </View>
          )}

          {hasRooms && (
            <View className="mb-4 flex-row items-center justify-center gap-3">
              {STEPS.map((step, index) => {
                const done = index < stepIndex;
                const current = index === stepIndex;
                return (
                  <View key={step.key} className="flex-row items-center gap-1.5">
                    <View
                      className={`h-7 w-7 items-center justify-center rounded-full ${
                        current
                          ? "bg-[#1D4ED8]"
                          : done
                            ? "bg-blue-100 dark:bg-blue-900/40"
                            : "bg-gray-200 dark:bg-neutral-800"
                      }`}
                    >
                      {done ? (
                        <Feather name="check" size={14} color="#1E40AF" />
                      ) : (
                        <Text
                          className={`text-xs font-bold ${
                            current ? "text-white" : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {index + 1}
                        </Text>
                      )}
                    </View>
                    <Text
                      className={`text-sm font-semibold ${
                        current ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {!!notice && <Notice>{notice}</Notice>}

          {phase === "room" && (
            <View className="rounded-xl border border-gray-100 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              {hasRooms ? (
                <>
                  <Text className="text-center text-lg font-bold text-gray-900 dark:text-white">
                    Which room are you playing?
                  </Text>
                  <Text className="mb-4 mt-1 text-center text-sm text-gray-500 dark:text-gray-400">
                    Choose your escape room to get started.
                  </Text>
                  <View className="gap-3">
                    {kiosk.rooms.map((r) => {
                      const available = openTimes(r.times);
                      const hasTimes = available.length > 0;
                      return (
                        <Pressable
                          key={r.id}
                          onPress={() => void chooseRoom(r)}
                          disabled={!hasTimes}
                          className={`rounded-xl border-2 border-gray-200 px-5 py-4 active:border-[#0644C7] active:bg-blue-50 dark:border-neutral-700 ${
                            hasTimes ? "" : "opacity-50"
                          }`}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: !hasTimes }}
                        >
                          <Text className="text-base font-bold text-gray-900 dark:text-white">
                            {r.name}
                          </Text>
                          <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {kiosk.ahead
                              ? hasTimes
                                ? `${r.durationMinutes} min · ${available.length} booked ${available.length === 1 ? "game" : "games"} that day`
                                : "No booked games that day"
                              : hasTimes
                                ? `${r.durationMinutes} min · ${available.length} ${available.length === 1 ? "game" : "games"} left today`
                                : "No more games today"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : (
                <View className="py-6">
                  <Text className="text-center text-lg font-bold text-gray-900 dark:text-white">
                    {"Escape-room check-in isn't open here right now"}
                  </Text>
                  <Text className="mt-2 text-center text-sm text-gray-600 dark:text-gray-300">
                    No escape rooms at this location are taking check-ins. Please see the front
                    desk.
                  </Text>
                </View>
              )}
            </View>
          )}

          {phase === "time" && room && (
            <View className="rounded-xl border border-gray-100 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
              <Text className="text-center text-xs font-semibold uppercase tracking-wide text-[#1D4ED8] dark:text-blue-300">
                {room.name}
              </Text>
              <Text className="mt-1 text-center text-lg font-bold text-gray-900 dark:text-white">
                What time is your game?
              </Text>
              <Text className="mb-4 mt-1 text-center text-sm text-gray-500 dark:text-gray-400">
                Choose the start time on your booking.
              </Text>
              {openTimes(room.times).length === 0 ? (
                <Text className="py-6 text-center text-sm text-gray-600 dark:text-gray-300">
                  {noGamesText}
                </Text>
              ) : (
                <TimeGrid times={openTimes(room.times)} onPick={(t) => void chooseTime(t)} />
              )}
              <View className="mt-1 items-center">
                <OutlineButton label="Choose a different room" onPress={backToRooms} />
              </View>
            </View>
          )}

          {phase === "form" && room && (
            <>
              <View className="mb-4 gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-900/20">
                <View>
                  <Text className="text-xs font-semibold uppercase tracking-wide text-[#1D4ED8] dark:text-blue-300">
                    Your game
                  </Text>
                  <Text className="text-sm font-bold text-gray-900 dark:text-white">
                    {room.name} · {time ? time.label : "choose your time"}
                    {kiosk.ahead && time ? ` · ${kiosk.dateLabel}` : ""}
                  </Text>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  {time && <OutlineButton label="Change time" tone="blue" onPress={changeTime} />}
                  <OutlineButton label="Change room" onPress={backToRooms} />
                </View>
                <Text className="text-xs text-blue-900 dark:text-blue-200">
                  {"After your game, we'll email your group photo to the email address you enter below."}
                </Text>
                {!time &&
                  (openTimes(room.times).length === 0 ? (
                    <Text className="text-sm text-gray-700 dark:text-gray-200">{noGamesText}</Text>
                  ) : (
                    <View className="gap-2">
                      <Text className="text-sm text-gray-700 dark:text-gray-200">
                        Choose your game time. What you typed below is kept.
                      </Text>
                      <TimeGrid
                        times={openTimes(room.times)}
                        onPick={(t) => void chooseTime(t)}
                      />
                    </View>
                  ))}
              </View>

              {formLoading || !form ? (
                <View className="items-center rounded-xl border border-gray-100 bg-white px-6 py-10 dark:border-neutral-800 dark:bg-neutral-900">
                  <ActivityIndicator color="#1D4ED8" />
                  <Text className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                    Loading your waiver...
                  </Text>
                </View>
              ) : (
                <KioskWaiverForm
                  key={formKey}
                  form={form.form}
                  status={status}
                  submitting={submitting}
                  onSubmit={(submission) => void handleSubmit(submission)}
                />
              )}
            </>
          )}
        </>,
      )}

      {/* With an ad, the ad beat is the confirmation; it closes by itself. */}
      <KioskAdModal
        visible={justCompleted && !!completedAd}
        ad={completedAd}
        waiverId={completedWaiverId}
        signerFirstName={completedName}
        waiverReference={completedRef}
        closeLabel="Done"
        closingText="Returning to the room list"
        onClose={resetAll}
      />

      <WaiverSuccessModal
        visible={justCompleted && !completedAd}
        waiverReference={completedRef}
        signerFirstName={completedName}
        note="Your group photo will be emailed to you after the game."
        closeLabel="Next player for this game"
        onClose={startNextPlayer}
        autoCloseSeconds={SUCCESS_HOLD_SECONDS}
        onAutoClose={resetAll}
        closingText="Returning to the room list"
      />

      <StatusModal {...status.props} />
    </>
  );
}
