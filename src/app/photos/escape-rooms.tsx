import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useColorScheme } from "nativewind";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  EscapeRoomGameView,
  checkInQr,
} from "../../components/photos/escapeRooms/EscapeRoomGameView";
import { EscapeRoomDayBoard } from "../../components/photos/escapeRooms/EscapeRoomDayBoard";
import {
  EscapeRoomQrModal,
  type EscapeRoomQr,
} from "../../components/photos/escapeRooms/EscapeRoomQrModal";
import {
  ActionButton,
  Card,
  Notice,
  Pill,
  noticeTextClass,
} from "../../components/photos/escapeRooms/kit";
import { DatePickerSheet } from "../../components/ui/DatePickerSheet";
import { CheckboxRow } from "../../components/ui/FormControls";
import { LocationWorkspaceSelector } from "../../components/ui/LocationWorkspaceSelector";
import { Toast, type ToastType } from "../../components/ui/Toast";
import { formatFullDate, formatShortDate, parseKey, toKey } from "../../lib/date/calendar";
import { venueToday } from "../../lib/date/venueTime";
import {
  DATE_KEY,
  plural,
  shiftDateKey,
  slotBadge,
} from "../../lib/escapeRooms/escapeRooms";
import { useTransientAlert } from "../../lib/hooks/useTransientAlert";
import { useActiveLocation } from "../../lib/location/activeLocationStore";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  fetchEscapeRoomDay,
  fetchEscapeRoomGame,
  openEscapeRoomGame,
  type EscapeRoomDay,
  type EscapeRoomDayRoom,
  type EscapeRoomGame,
  type EscapeRoomSlot,
} from "../../services/escapeRoomService";
import type { PhotoSession } from "../../services/photosService";

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

/** The web keeps this in localStorage; here it lasts for the app session. */
let busyOnlyPreference = false;

const DAY_POLL_MS = 60000;
const GAME_POLL_MS = 30000;

/** Weekday + short date for the date button, e.g. "Tue, Sep 29". */
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dateButtonLabel = (key: string) => {
  const d = parseKey(key);
  if (!d) return key;
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${formatShortDate(key).replace(/, \d{4}$/, "")}`;
};

/**
 * Photos → Escape Rooms — the web admin's EscapeRoomSessions page. The day's
 * games per room; opening one shows its players, the group photo, the finish
 * time and the one-time send to the players who signed for that game.
 *
 * Deep links: `?date=YYYY-MM-DD` opens that day, `&session=<id>` also opens
 * that game.
 */
export default function EscapeRoomsScreen() {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";

  const user = getCurrentUser();
  const role = user?.role ?? "";
  const isCompanyAdmin = role === "company_admin";
  const canManageSetup = ["company_admin", "admin", "location_manager"].includes(role);
  const activeLocation = useActiveLocation();
  const effectiveLocationId = isCompanyAdmin
    ? activeLocation.id === "all"
      ? null
      : activeLocation.id
    : (user?.location_id ?? null);

  const params = useLocalSearchParams<{ date?: string; session?: string }>();
  const linkedDate = params.date && DATE_KEY.test(params.date) ? params.date : null;
  const [date, setDate] = useState(() => linkedDate ?? toKey(venueToday()));
  // Until staff pick a day, follow the venue's "today" as the backend reports it.
  const followToday = useRef(!linkedDate);
  const pendingSession = useRef<number | null>(Number(params.session) || null);

  const [day, setDay] = useState<EscapeRoomDay | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [dayError, setDayError] = useState<string | null>(null);
  const [game, setGame] = useState<EscapeRoomGame | null>(null);
  const [openingKey, setOpeningKey] = useState<string | null>(null);
  const [busyOnly, setBusyOnly] = useState(busyOnlyPreference);
  const [qr, setQr] = useState<EscapeRoomQr | null>(null);
  const [pickingDate, setPickingDate] = useState(false);
  const [toast, setToastState] = useTransientAlert<{ message: string; type: ToastType }>(6000);
  const showToast = useCallback(
    (message: string, type: ToastType) => setToastState({ message, type }),
    [setToastState],
  );

  const [focused, setFocused] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  // Sequencing guards, as on the web: a slow response for an old day, game or
  // location must never overwrite what staff are looking at now.
  const daySequence = useRef(0);
  const openSequence = useRef(0);
  const refreshSequence = useRef(0);
  const scopeKey = `${effectiveLocationId ?? "none"}|${date}`;
  const liveScope = useRef(scopeKey);
  liveScope.current = scopeKey;
  const activeGameId = useRef<number | null>(null);
  activeGameId.current = game?.id ?? null;

  const loadDay = useCallback(async () => {
    const token = getToken();
    if (!effectiveLocationId || !token) return;
    const sequence = ++daySequence.current;
    setDayLoading(true);
    try {
      const data = await fetchEscapeRoomDay(token, effectiveLocationId, date);
      if (sequence !== daySequence.current) return;
      if (followToday.current && data.date !== data.today) {
        setDate(data.today);
        return;
      }
      setDay(data);
      setDayError(null);
    } catch (e) {
      if (sequence === daySequence.current) {
        setDayError(errorMessage(e, "The escape-room games could not be loaded."));
      }
    } finally {
      if (sequence === daySequence.current) setDayLoading(false);
    }
  }, [date, effectiveLocationId]);

  useEffect(() => {
    setDay(null);
    setGame(null);
    activeGameId.current = null;
    void loadDay();
  }, [loadDay]);

  const refreshGame = useCallback(async (sessionId: number) => {
    const token = getToken();
    if (!token) return;
    const sequence = ++refreshSequence.current;
    const scope = liveScope.current;
    try {
      const data = await fetchEscapeRoomGame(token, sessionId);
      if (
        sequence === refreshSequence.current &&
        scope === liveScope.current &&
        activeGameId.current === sessionId
      ) {
        setGame(data);
      }
    } catch {
      // A missed background refresh is retried by the next poll.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // Coming back from another screen (e.g. a booking) can have changed the day.
  const wasFocused = useRef(true);
  useEffect(() => {
    if (focused && !wasFocused.current) {
      void loadDay();
      if (activeGameId.current !== null) void refreshGame(activeGameId.current);
    }
    wasFocused.current = focused;
  }, [focused, loadDay, refreshGame]);

  useEffect(() => {
    if (!day?.isToday || !focused) return;
    const timer = setInterval(() => void loadDay(), DAY_POLL_MS);
    return () => clearInterval(timer);
  }, [day?.isToday, focused, loadDay]);

  const openGameId = game?.id ?? null;
  useEffect(() => {
    if (openGameId === null || !focused) return;
    const timer = setInterval(() => void refreshGame(openGameId), GAME_POLL_MS);
    return () => clearInterval(timer);
  }, [openGameId, focused, refreshGame]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [openGameId]);

  const applyGame = useCallback(
    (data: EscapeRoomGame) => {
      void loadDay();
      if (activeGameId.current !== data.id) return;
      refreshSequence.current++;
      setGame(data);
    },
    [loadDay],
  );

  const applyPhotoSession = useCallback(
    (updated: PhotoSession) => {
      const gameId = activeGameId.current;
      if (gameId === null) return;
      setGame((current) =>
        current && current.id === gameId && current.photoSession?.id === updated.id
          ? { ...current, photoSession: updated }
          : current,
      );
      void refreshGame(gameId);
    },
    [refreshGame],
  );

  const openSlot = useCallback(
    async (room: EscapeRoomDayRoom, slot: EscapeRoomSlot) => {
      const token = getToken();
      if (!effectiveLocationId || !token) return;
      setOpeningKey(slot.key);
      const sequence = ++openSequence.current;
      const scope = liveScope.current;
      try {
        const data = slot.sessionId
          ? await fetchEscapeRoomGame(token, slot.sessionId)
          : await openEscapeRoomGame(token, effectiveLocationId, room.id, date, slot.time);
        if (sequence !== openSequence.current || scope !== liveScope.current) return;
        refreshSequence.current++;
        activeGameId.current = data.id;
        setGame(data);
        if (!slot.sessionId) void loadDay();
      } catch (e) {
        showToast(errorMessage(e, "That game could not be opened."), "error");
      } finally {
        setOpeningKey(null);
      }
    },
    [date, effectiveLocationId, loadDay, showToast],
  );

  // A linked game (deep link, or "Open game" on an earlier unsent game).
  useEffect(() => {
    const target = pendingSession.current;
    if (!day || target === null) return;
    pendingSession.current = null;
    for (const room of day.rooms) {
      const slot = room.slots.find((s) => s.sessionId === target);
      if (slot) {
        void openSlot(room, slot);
        return;
      }
    }
    const token = getToken();
    if (!token) return;
    fetchEscapeRoomGame(token, target)
      .then((found) =>
        showToast(
          found.locationId !== day.location.id
            ? `That game is at ${found.locationName ?? "another location"}. Switch to that location to open it.`
            : "That game is not on this day any more.",
          "info",
        ),
      )
      .catch(() => showToast("That game could not be found.", "error"));
  }, [day, openSlot, showToast]);

  const closeGame = useCallback(() => {
    openSequence.current++;
    refreshSequence.current++;
    activeGameId.current = null;
    setGame(null);
  }, []);

  // Android back closes an open game before leaving the screen, like the web's
  // "Back to all games".
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (activeGameId.current === null) return false;
        closeGame();
        return true;
      });
      return () => sub.remove();
    }, [closeGame]),
  );

  const pickDate = (next: string) => {
    followToday.current = day ? next === day.today : false;
    setDate(next);
  };

  const toggleBusyOnly = () => {
    busyOnlyPreference = !busyOnly;
    setBusyOnly(busyOnlyPreference);
  };

  const openEarlierGame = (target: { sessionId: number; date: string }) => {
    pendingSession.current = target.sessionId;
    followToday.current = false;
    if (target.date === date) void loadDay();
    else setDate(target.date);
  };

  const header = (
    <View className="w-full border-b border-gray-100 bg-white px-5 pb-5 pt-12 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => (game ? closeGame() : router.back())}
          className="rounded-full bg-gray-100 p-2 dark:bg-neutral-800"
          accessibilityRole="button"
          accessibilityLabel={game ? "Back to all games" : "Go back"}
        >
          <Feather name="chevron-left" size={20} color={headerIcon} />
        </Pressable>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">Escape Rooms</Text>
        <View style={{ width: 36 }} />
      </View>
    </View>
  );

  if (!effectiveLocationId) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        {header}
        <ScrollView contentContainerStyle={{ padding: 20 }}>
          <Card className="items-center p-5">
            <Feather name="map-pin" size={34} color="#9CA3AF" />
            <Text className="mt-3 text-lg font-bold text-gray-900 dark:text-white">
              Choose a location first
            </Text>
            <Text className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              {isCompanyAdmin
                ? "Pick a location to work in. Escape-room games are listed per location."
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

  const kioskUrl = day?.kioskUrl ?? game?.kioskUrl ?? null;
  const roomsWithoutWaiver = (day?.rooms ?? []).filter((room) => !room.hasWaiver);
  const allSlots = (day?.rooms ?? []).flatMap((room) => room.slots);
  const notSentCount = allSlots.filter((slot) => slotBadge(slot).pastUnsent).length;
  const sendProblemCount = allSlots.filter((slot) => slot.status === "send_problem").length;
  const photoWaitingCount = allSlots.filter(
    (slot) => slot.status === "photo_ready" && !slot.isPast,
  ).length;
  const unsentEarlier = day?.isToday ? day.unsentEarlier : [];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {header}

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
        >
          {/* Location and day, then the day controls (web header row). */}
          <Text className="text-sm text-gray-600 dark:text-gray-300">
            {day?.location.name ?? "Loading"} · {formatFullDate(date)}
          </Text>

          <View className="mt-3 flex-row items-center gap-2">
            <Pressable
              onPress={() => pickDate(shiftDateKey(date, -1))}
              className="h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white active:opacity-80 dark:border-neutral-700 dark:bg-neutral-900"
              accessibilityRole="button"
              accessibilityLabel="Previous day"
            >
              <Feather name="chevron-left" size={16} color={headerIcon} />
            </Pressable>
            <Pressable
              onPress={() => setPickingDate(true)}
              className="h-10 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 active:opacity-80 dark:border-neutral-700 dark:bg-neutral-900"
              accessibilityRole="button"
              accessibilityLabel="Choose a day"
            >
              <Feather name="calendar" size={15} color="#0644C7" />
              <Text className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {dateButtonLabel(date)}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => pickDate(shiftDateKey(date, 1))}
              className="h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white active:opacity-80 dark:border-neutral-700 dark:bg-neutral-900"
              accessibilityRole="button"
              accessibilityLabel="Next day"
            >
              <Feather name="chevron-right" size={16} color={headerIcon} />
            </Pressable>
          </View>

          <View className="mb-4 mt-2 flex-row flex-wrap gap-2">
            {day && !day.isToday && (
              <ActionButton
                label="Today"
                variant="secondary"
                size="sm"
                onPress={() => pickDate(day.today)}
              />
            )}
            <ActionButton
              label="Refresh"
              icon="refresh-cw"
              variant="secondary"
              size="sm"
              disabled={dayLoading}
              onPress={() => {
                void loadDay();
                if (game) void refreshGame(game.id);
              }}
            />
            {kioskUrl && (
              <ActionButton
                label="Guest check-in"
                icon="maximize"
                size="sm"
                className="flex-1"
                onPress={() => setQr(checkInQr(kioskUrl, day?.location.id ?? effectiveLocationId))}
              />
            )}
          </View>

          {day && !day.emailAvailable && (
            <Notice tone="amber" icon="alert-triangle" className="mb-4">
              Email is not switched on for this site yet, so escape-room photos cannot be
              sent. You can still take the photo now and send it once email is on.
            </Notice>
          )}
          {roomsWithoutWaiver.length > 0 && (
            <Notice tone="amber" icon="alert-triangle" className="mb-4">
              {`No escape-room waiver covers ${roomsWithoutWaiver.map((r) => r.name).join(", ")} yet, so guests cannot check in to ${
                roomsWithoutWaiver.length === 1 ? "it" : "them"
              }. ${
                canManageSetup
                  ? "Create an escape-room waiver from Waivers → Templates on the website."
                  : "Ask a manager to create an escape-room waiver."
              }`}
            </Notice>
          )}
          {!!dayError && (
            <Notice tone="red" className="mb-4">
              {dayError}
            </Notice>
          )}
          {unsentEarlier.length > 0 && (
            <Notice tone="red" icon="alert-triangle" className="mb-4">
              <Text className={`text-sm font-semibold ${noticeTextClass("red")}`}>
                {unsentEarlier.length === 1
                  ? "A game from an earlier day was"
                  : `${unsentEarlier.length} games from earlier days were`}{" "}
                never sent or finished
              </Text>
              {unsentEarlier.map((earlier) => (
                <View key={earlier.sessionId} className="mt-1">
                  <Text className={`text-sm ${noticeTextClass("red")}`}>
                    {formatShortDate(earlier.date)} · {earlier.roomName ?? "Escape room"} ·{" "}
                    {earlier.timeLabel} · {plural(earlier.players, "player", "players")} signed
                    {earlier.hasPhoto ? ", photo started" : ""}
                  </Text>
                  <Text
                    onPress={() => openEarlierGame(earlier)}
                    className={`py-1 text-sm font-semibold underline ${noticeTextClass("red")}`}
                    accessibilityRole="button"
                  >
                    Open game
                  </Text>
                </View>
              ))}
            </Notice>
          )}

          {game ? (
            <>
              <Pressable
                onPress={closeGame}
                className="mb-2 flex-row items-center gap-1 self-start py-2"
                accessibilityRole="button"
              >
                <Feather name="chevron-left" size={16} color="#0644C7" />
                <Text className="text-sm font-semibold text-[#0644C7] dark:text-blue-400">
                  Back to all games
                </Text>
              </Pressable>
              <EscapeRoomGameView
                key={game.id}
                game={game}
                day={day}
                focused={focused}
                onApply={applyGame}
                onPhotoSession={applyPhotoSession}
                onRefresh={() => void refreshGame(game.id)}
                onDayStale={() => void loadDay()}
                onClose={closeGame}
                showToast={showToast}
                onShowQr={setQr}
              />
            </>
          ) : (
            <>
              {day &&
                (notSentCount > 0 ||
                  sendProblemCount > 0 ||
                  photoWaitingCount > 0 ||
                  day.rooms.some((room) => room.slots.length > 0)) && (
                  <View className="mb-4 gap-3">
                    {(notSentCount > 0 || sendProblemCount > 0 || photoWaitingCount > 0) && (
                      <View className="flex-row flex-wrap gap-2">
                        {notSentCount > 0 && (
                          <Pill
                            label={`${plural(notSentCount, "game", "games")} not sent yet`}
                            tone="red"
                          />
                        )}
                        {sendProblemCount > 0 && (
                          <Pill
                            label={`${plural(sendProblemCount, "game has", "games have")} emails that did not go through`}
                            tone="red"
                          />
                        )}
                        {photoWaitingCount > 0 && (
                          <Pill
                            label={`${plural(photoWaitingCount, "photo", "photos")} waiting to be sent`}
                            tone="blue"
                          />
                        )}
                      </View>
                    )}
                    <CheckboxRow
                      checked={busyOnly}
                      onToggle={toggleBusyOnly}
                      label="Only games with bookings or players"
                    />
                  </View>
                )}

              {!day && dayLoading && (
                <Card className="items-center py-8">
                  <ActivityIndicator color="#0644C7" />
                  <Text className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Loading games...
                  </Text>
                </Card>
              )}
              {day && (
                <EscapeRoomDayBoard
                  day={day}
                  busyOnly={busyOnly}
                  canManageSetup={canManageSetup}
                  openingKey={openingKey}
                  disabled={openingKey !== null}
                  onOpen={(room, slot) => void openSlot(room, slot)}
                  onShowAll={toggleBusyOnly}
                />
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <DatePickerSheet
        visible={pickingDate}
        value={date}
        minDate="2000-01-01"
        title="Choose a day"
        onClose={() => setPickingDate(false)}
        onSelect={(picked) => {
          setPickingDate(false);
          pickDate(picked);
        }}
      />

      <EscapeRoomQrModal qr={qr} onClose={() => setQr(null)} />

      {!!toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToastState(null)} />
      )}
    </View>
  );
}
