import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import type { CameraView } from "expo-camera";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useMemo, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";

import { ApiError } from "../../../lib/api";
import { formatFullDate, toKey } from "../../../lib/date/calendar";
import { formatTimeET, venueToday } from "../../../lib/date/venueTime";
import {
  BOOKING_STATUS_LABELS,
  digitsOnly,
  evaluateCorrection,
  evaluateFinishTime,
  plural,
  splitMinutesInput,
  timeUsedExample,
  type EntryMode,
} from "../../../lib/escapeRooms/escapeRooms";
import {
  completeAndSendExtras,
  completeAndSendQuestion,
  EMAIL_LATER_NOTE,
  emailedLaterToast,
  emailPlayersOptionLabel,
  followUpInfoParts,
  gameDayLabel,
  gameFollowUpState,
  newPlayersSummary,
  PAST_GAME_EMAIL_NOTE,
  pastGameEmailConfirm,
  recordedResultToast,
  recordOnlyQuestion,
  reviewCountsLine,
  sendToNewLabel,
  thanksFailedLine,
  withoutPhotoSummary,
} from "../../../lib/escapeRooms/gameFollowUp";
import { getCurrentUser, getToken } from "../../../lib/session";
import { checkInBooking } from "../../../services/bookingsService";
import {
  completeEscapeRoomGame,
  correctEscapeRoomResult,
  linkEscapeRoomBooking,
  moveEscapeRoomPlayer,
  removeEscapeRoomPlayer,
  resendEscapeRoomPhoto,
  sendEscapeRoomToNewPlayers,
  startEscapeRoomPhoto,
  type EscapeRoomDay,
  type EscapeRoomGame,
  type EscapeRoomPlayer,
} from "../../../services/escapeRoomService";
import {
  addCapturedPhoto,
  removeSessionPhoto,
  reorderSessionPhotos,
  setPhotoOnSlideshow,
  uploadSessionPhoto,
  type PhotoSession,
  type SessionPhoto,
} from "../../../services/photosService";
import { cancelFollowUp, sendFollowUpNow } from "../../../services/visitFollowUpService";
import type { ToastType } from "../../ui/Toast";
import { CheckboxRow, RadioRow, SegmentedToggle } from "../../ui/FormControls";
import { PhotoCameraView, type PhotoCameraState } from "../PhotoCameraView";
import type { EscapeRoomQr } from "./EscapeRoomQrModal";
import { EscapeRoomPlayerRow, type PlayerActions } from "./EscapeRoomPlayerRow";
import {
  ActionButton,
  Card,
  Notice,
  Pill,
  PRIMARY,
  TextAction,
  noticeTextClass,
} from "./kit";

const errorMessage = (e: unknown, fallback: string): string =>
  e instanceof Error && e.message ? e.message : fallback;

const players = (count: number) => plural(count, "player", "players");

/** Big mm / ss box used by the finish-time and correction forms. */
function TimeBox({
  value,
  onChange,
  placeholder,
  label,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  inputRef?: React.RefObject<TextInput | null>;
}) {
  return (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor="#9CA3AF"
      keyboardType="number-pad"
      accessibilityLabel={label}
      className="h-12 w-20 rounded-lg border border-gray-300 bg-white text-center text-lg font-semibold text-gray-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white"
    />
  );
}

export type GameViewProps = {
  game: EscapeRoomGame;
  day: EscapeRoomDay | null;
  /** False while another screen is on top — the camera is released. */
  focused: boolean;
  /** A fresh game from an action: reloads the day board and shows the game. */
  onApply: (game: EscapeRoomGame) => void;
  /** New photo-session state from a photo action; the game is refetched after. */
  onPhotoSession: (session: PhotoSession) => void;
  onRefresh: () => void;
  onDayStale: () => void;
  onClose: () => void;
  showToast: (message: string, type: ToastType) => void;
  onShowQr: (qr: EscapeRoomQr) => void;
};

/**
 * One escape-room game — the web page's right-hand panel: who signed, the group
 * photo, the finish time and the one-time send, and the after-send tools
 * (resend, send to new players, photo QR, correct the result). Keyed by game id
 * by its parent, so opening another game starts every input fresh.
 */
export function EscapeRoomGameView({
  game,
  day,
  focused,
  onApply,
  onPhotoSession,
  onRefresh,
  onDayStale,
  onClose,
  showToast,
  onShowQr,
}: GameViewProps) {
  const [busy, setBusy] = useState(false);
  const lockRef = useRef(false);

  const [consent, setConsent] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraState, setCameraState] = useState<PhotoCameraState>("starting");
  const [cameraRetry, setCameraRetry] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const [removingPhotoId, setRemovingPhotoId] = useState<number | null>(null);
  const [slideshowConfirm, setSlideshowConfirm] = useState<{ photoId: number; note: string } | null>(null);

  const [escaped, setEscaped] = useState(true);
  const [entryMode, setEntryMode] = useState<EntryMode>("used");
  const [finishMinutes, setFinishMinutes] = useState("");
  const [finishSeconds, setFinishSeconds] = useState("");
  const secondsRef = useRef<TextInput>(null);
  const [confirming, setConfirming] = useState(false);
  const [recordingOnly, setRecordingOnly] = useState(false);
  const [emailPlayersOnly, setEmailPlayersOnly] = useState(true);

  const [confirmResendAll, setConfirmResendAll] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [correctEscaped, setCorrectEscaped] = useState(true);
  const [correctMinutes, setCorrectMinutes] = useState("");
  const [correctSeconds, setCorrectSeconds] = useState("");

  const photoSession = game.photoSession;
  const photos = useMemo(() => photoSession?.photos ?? [], [photoSession]);
  const readyPhotos = useMemo(
    () => photos.filter((p) => p.processingStatus === "ready"),
    [photos],
  );
  const maxPhotos = photoSession?.maxPhotos ?? 3;
  const atCap = photos.length >= maxPhotos;
  const roomMinutes = game.room.durationMinutes;

  const finish = evaluateFinishTime({
    minutes: finishMinutes,
    seconds: finishSeconds,
    escaped,
    mode: entryMode,
    roomMinutes,
  });
  const correction = evaluateCorrection(correctEscaped, correctMinutes, correctSeconds);

  const recipientPlayers = game.players.filter((p) => p.hasEmail && !p.sent);
  const noEmailPlayers = game.players.filter((p) => !p.hasEmail && !p.sent);
  const declinedRelease = game.players.filter((p) => p.photoRelease === false).length;
  const resendTargets = game.players.filter(
    (p) =>
      p.sent &&
      (p.hasEmail || p.delivery?.status === "sent") &&
      !p.delivery?.isDuplicate,
  );
  const recipients = recipientPlayers.length;
  const people = game.counts.people ?? game.counts.players;
  const followUp = gameFollowUpState(game);
  const thanksName = followUp.thanksName;
  const isTodayGame = game.sessionDate === toKey(venueToday());
  const dayLabel = gameDayLabel(game.sessionDate);
  const reviewsLine = reviewCountsLine(game.followUp?.reviews);
  const example = timeUsedExample(roomMinutes);

  const room = day?.rooms.find((r) => r.id === game.room.id);
  const slot = room?.slots.find((s) => s.time === game.sessionTime);

  /** Runs one request at a time; resolves null on failure after toasting. */
  const run = async <T,>(
    action: (token: string) => Promise<T>,
    fallback: string,
  ): Promise<T | null> => {
    const token = getToken();
    if (!token || lockRef.current) return null;
    lockRef.current = true;
    setBusy(true);
    try {
      return await action(token);
    } catch (e) {
      showToast(errorMessage(e, fallback), "error");
      return null;
    } finally {
      lockRef.current = false;
      setBusy(false);
    }
  };

  /* ----------------------------------------------------------- photo -- */

  const startPhoto = async () => {
    if (!consent) return;
    const data = await run(
      (token) => startEscapeRoomPhoto(token, game.id),
      "The group photo could not be started.",
    );
    if (data) {
      onApply(data);
      setCameraOn(true);
    }
  };

  const applyPhotoSession = (updated: PhotoSession | null) => {
    if (!updated) {
      onRefresh();
      return;
    }
    onPhotoSession(updated);
    onDayStale();
  };

  const takePhoto = async () => {
    if (!photoSession || atCap) return;
    const updated = await run(async (token) => {
      const shot = await cameraRef.current?.takePictureAsync({ quality: 0.7, base64: true });
      if (!shot?.base64) throw new Error("The camera did not return an image. Try again.");
      return addCapturedPhoto(token, photoSession.id, `data:image/jpeg;base64,${shot.base64}`);
    }, "That photo could not be added.");
    applyPhotoSession(updated);
  };

  const uploadPhoto = async () => {
    if (!photoSession || atCap || lockRef.current) return;
    // Re-encoded to JPEG, which also keeps an iPhone HEIC out of the backend's
    // jpg/png/webp/gif allow-list.
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      quality: 0.7,
    });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset?.uri) return;
    const updated = await run(
      (token) =>
        uploadSessionPhoto(token, photoSession.id, {
          uri: asset.uri,
          name: asset.fileName ?? "photo.jpg",
          type: asset.mimeType ?? "image/jpeg",
        }),
      "That file could not be uploaded.",
    );
    applyPhotoSession(updated);
  };

  const removePhoto = async (photoId: number) => {
    if (!photoSession) return;
    const updated = await run(
      (token) => removeSessionPhoto(token, photoSession.id, photoId),
      "That photo could not be removed.",
    );
    if (updated) applyPhotoSession(updated);
  };

  const movePhoto = async (photoId: number, direction: -1 | 1) => {
    if (!photoSession) return;
    const order = photos.map((p) => p.id);
    const from = order.indexOf(photoId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    const updated = await run(
      (token) => reorderSessionPhotos(token, photoSession.id, order),
      "The photos could not be reordered.",
    );
    if (updated) onPhotoSession(updated);
  };

  const setSlideshow = async (photo: SessionPhoto, include: boolean, confirmRelease = false) => {
    const token = getToken();
    if (!token || lockRef.current) return;
    lockRef.current = true;
    setBusy(true);
    try {
      const message = await setPhotoOnSlideshow(token, photo.id, include, confirmRelease);
      setSlideshowConfirm(null);
      showToast(message, "success");
      onRefresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setSlideshowConfirm({
          photoId: photo.id,
          note: e.message || "Some players were not asked about a photo release.",
        });
      } else {
        showToast(errorMessage(e, "That change could not be saved."), "error");
      }
    } finally {
      lockRef.current = false;
      setBusy(false);
    }
  };

  /* ---------------------------------------------------------- result -- */

  const typeMinutes = (raw: string) => {
    const split = splitMinutesInput(raw);
    setFinishMinutes(split.minutes);
    if (split.seconds !== null) {
      setFinishSeconds(split.seconds);
      secondsRef.current?.focus();
    }
  };

  const complete = async () => {
    const data = await run(
      (token) =>
        completeEscapeRoomGame(token, game.id, escaped, escaped ? finish.label : null),
      "The photo could not be sent.",
    );
    setConfirming(false);
    if (!data) {
      onRefresh();
      return;
    }
    onApply(data);
    const notYet = data.counts.retrying + data.counts.failed;
    showToast(
      notYet === 0
        ? `Emailed the ${thanksName} email with the group photo to ${players(data.counts.emailed)}.`
        : data.counts.emailed === 0
          ? `The photo has not gone through yet for ${players(notYet)}. See below.`
          : `Emailed the ${thanksName} email with the group photo to ${players(data.counts.emailed)}. ${plural(notYet, "email has", "emails have")} not gone through yet; see below.`,
      notYet === 0 ? "success" : "info",
    );
  };

  const recordWithoutPhoto = async () => {
    const emailing = emailPlayersOnly && followUp.canEmailPlayers && recipients > 0;
    const data = await run(
      (token) =>
        completeEscapeRoomGame(
          token,
          game.id,
          escaped,
          escaped ? finish.label : null,
          true,
          emailing,
        ),
      "The result could not be recorded.",
    );
    setRecordingOnly(false);
    if (!data) {
      onRefresh();
      return;
    }
    onApply(data);
    const toast = recordedResultToast(data.players, thanksName);
    showToast(toast.message, toast.type);
  };

  const followUpAction = async (rowId: number, action: "send" | "cancel") => {
    const token = getToken();
    if (!token || lockRef.current) return;
    lockRef.current = true;
    setBusy(true);
    try {
      if (action === "send") {
        const result = await sendFollowUpNow(token, rowId);
        showToast(result.message || "Email sent.", "success");
      } else {
        await cancelFollowUp(token, rowId);
        showToast("The email will not be sent.", "success");
      }
    } catch (e) {
      showToast(errorMessage(e, "That did not work. Please try again."), "error");
    } finally {
      lockRef.current = false;
      setBusy(false);
      onRefresh();
    }
  };

  // A game recorded without a photo emails its players later instead of sending a photo.
  const emailPlayersLater = async (confirmed = false) => {
    if (!isTodayGame && !confirmed) {
      Alert.alert("", pastGameEmailConfirm(dayLabel, game.counts.newPlayers), [
        { text: "Cancel", style: "cancel" },
        { text: "OK", onPress: () => void emailPlayersLater(true) },
      ]);
      return;
    }
    const data = await run(
      (token) => sendEscapeRoomToNewPlayers(token, game.id),
      "The players could not be emailed.",
    );
    if (!data) {
      onRefresh();
      return;
    }
    onApply(data);
    showToast(emailedLaterToast(game.players, data.players, followUp), "success");
  };

  const sendToNew = async () => {
    if (game.completedWithoutPhoto) {
      await emailPlayersLater();
      return;
    }
    const before = game.counts.sent;
    const notYetBefore = game.counts.retrying + game.counts.failed + game.counts.stuck;
    const data = await run(
      (token) => sendEscapeRoomToNewPlayers(token, game.id),
      "The photo could not be sent.",
    );
    if (!data) {
      onRefresh();
      return;
    }
    onApply(data);
    const more = Math.max(0, data.counts.sent - before);
    const notYet = Math.max(
      0,
      data.counts.retrying + data.counts.failed + data.counts.stuck - notYetBefore,
    );
    showToast(
      notYet > 0
        ? `${more > 0 ? `Emailed ${more} more ${more === 1 ? "player" : "players"}. ` : ""}${plural(notYet, "email has", "emails have")} not gone through yet; see below.`
        : more > 0
          ? `Emailed the group photo to ${more} more ${more === 1 ? "player" : "players"}.`
          : "Everyone in this game now has the photo.",
      notYet > 0 ? "info" : "success",
    );
  };

  const resendToEveryone = async () => {
    const token = getToken();
    if (!token || lockRef.current) return;
    lockRef.current = true;
    setBusy(true);
    setConfirmResendAll(false);
    let sent = 0;
    let retrying = 0;
    const refused: string[] = [];
    let stopped: string | null = null;
    let latest: EscapeRoomGame | null = null;
    // One at a time, as on the web: each call returns the game with that
    // player's delivery, and a hard failure stops the rest.
    for (const player of resendTargets) {
      try {
        latest = await resendEscapeRoomPhoto(token, game.id, player.waiverId, null);
        const row = latest.players.find((p) => p.waiverId === player.waiverId);
        if (row?.delivery?.status === "sent") sent++;
        else retrying++;
      } catch (e) {
        if (
          e instanceof ApiError &&
          ((e.status === 422 && e.fieldErrors?.email) || e.status === 404)
        ) {
          refused.push(player.name || "a player");
          continue;
        }
        stopped = errorMessage(e, "The photo could not be sent.");
        break;
      }
    }
    if (latest) onApply(latest);
    else onRefresh();
    const parts = [
      sent > 0 ? `Sent the group photo again to ${players(sent)}.` : "",
      retrying > 0
        ? `${plural(retrying, "email has", "emails have")} not gone through yet and will be retried automatically.`
        : "",
      refused.length > 0
        ? `Not sent to ${refused.join(", ")}: no valid address, or no longer in this game. Use Resend next to them if needed.`
        : "",
      stopped ? `Stopped: ${stopped}` : "",
    ].filter(Boolean);
    showToast(
      parts.join(" ") || "Nothing was sent.",
      stopped ? "error" : retrying > 0 || refused.length > 0 ? "info" : "success",
    );
    lockRef.current = false;
    setBusy(false);
  };

  const beginCorrect = () => {
    const [minutes = "", seconds = ""] =
      game.escaped === false ? [] : (game.completionLabel ?? "").split(":");
    setCorrectEscaped(game.escaped !== false);
    setCorrectMinutes(minutes);
    setCorrectSeconds(seconds);
    setCorrecting(true);
  };

  const saveCorrection = async () => {
    if (!correction.valid) return;
    const data = await run(
      (token) =>
        correctEscapeRoomResult(token, game.id, correctEscaped, correctEscaped ? correction.label : null),
      "The result could not be corrected.",
    );
    if (!data) return;
    onApply(data);
    setCorrecting(false);
    showToast(
      game.canResend
        ? "Recorded result corrected. Emails already sent can't be changed; use Resend to send players the corrected time."
        : "Recorded result corrected. Emails already sent can't be changed.",
      "success",
    );
  };

  const copyPhotoLink = async () => {
    if (!game.photoLink) return;
    try {
      await Clipboard.setStringAsync(game.photoLink);
      showToast("Photo link copied.", "success");
    } catch {
      showToast("Copying is blocked on this device. Use Show photo QR instead.", "info");
    }
  };

  const checkIn = async (reference: string) => {
    const done = await run(
      async (token) => {
        await checkInBooking(token, reference, getCurrentUser()?.id);
        return true;
      },
      "That booking could not be checked in.",
    );
    if (!done) return;
    showToast(`Checked in booking ${reference}.`, "success");
    onRefresh();
    onDayStale();
  };

  /* --------------------------------------------------------- players -- */

  const playerActions: PlayerActions = {
    resend: async (player: EscapeRoomPlayer, email: string | null) => {
      const data = await run(
        (token) => resendEscapeRoomPhoto(token, game.id, player.waiverId, email),
        "The photo could not be sent.",
      );
      if (!data) return false;
      onApply(data);
      const updated = data.players.find((p) => p.waiverId === player.waiverId);
      const delivered = updated?.delivery?.status === "sent";
      showToast(
        delivered
          ? email
            ? `Sent the group photo to ${email}.`
            : `Sent the group photo to ${player.name || "the player"} again.`
          : "The photo has not gone through yet. It will be retried automatically.",
        delivered ? "success" : "info",
      );
      return true;
    },
    remove: async (player) => {
      const data = await run(
        (token) => removeEscapeRoomPlayer(token, game.id, player.waiverId),
        "That player could not be removed.",
      );
      if (!data) return false;
      onApply(data);
      showToast(`Removed ${player.name || "the player"} from this game.`, "success");
      return true;
    },
    move: async (player, roomId, time) => {
      const target = day?.rooms
        .find((r) => r.id === roomId)
        ?.slots.find((s) => s.time === time);
      const data = await run(
        (token) => moveEscapeRoomPlayer(token, game.id, player.waiverId, roomId, time),
        "That player could not be moved.",
      );
      if (!data) return false;
      onApply(data);
      showToast(
        target?.completed
          ? "Moved the player. That game was already sent: open it and press Send to new players to email them."
          : "Moved the player to the other game.",
        target?.completed ? "info" : "success",
      );
      return true;
    },
    followUp: followUpAction,
    linkBooking: async (player, bookingId) => {
      const data = await run(
        (token) => linkEscapeRoomBooking(token, game.id, player.waiverId, bookingId),
        "That booking could not be linked.",
      );
      if (!data) return false;
      onApply(data);
      return true;
    },
  };

  const showCheckInQr = () => {
    const kioskUrl = day?.kioskUrl ?? game.kioskUrl;
    if (!kioskUrl) return;
    const guestsCanPick = Boolean(
      day?.isToday && room?.isActive && room?.hasWaiver && slot?.checkInOpen && !game.completedWithoutPhoto,
    );
    if (guestsCanPick) {
      onShowQr({
        title: `Check in to ${game.room.name} · ${game.sessionTimeLabel}`,
        description:
          "Players scan this to sign for this game on their own phones. The room and time are already picked.",
        note: "For the venue tablet, use Open on this device. That version clears itself between guests.",
        url: `${kioskUrl}?room=${game.room.id}&time=${game.sessionTime}&date=${game.sessionDate}`,
        fileName: `${game.room.name ?? "escape-room"}-${game.sessionTime}`,
        print: {
          title: `${game.room.name} · ${game.sessionTimeLabel}`,
          note: "Scan to sign your waiver for this game.",
        },
        openOnDevice: {
          locationId: game.locationId,
          room: game.room.id,
          time: game.sessionTime,
          date: game.sessionDate,
        },
      });
    } else {
      onShowQr(checkInQr(kioskUrl, game.locationId));
    }
  };

  const kioskUrl = day?.kioskUrl ?? game.kioskUrl;
  const firstReady = readyPhotos[0];

  return (
    <View className="gap-4">
      {/* ---------------------------------------------------------- header -- */}
      <Card>
        <View className="flex-row items-start gap-3">
          <View className="flex-1">
            <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {formatFullDate(game.sessionDate)}
            </Text>
            <Text className="text-xl font-bold text-gray-900 dark:text-white">
              {game.room.name} · {game.sessionTimeLabel}
            </Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="rounded-full p-1.5 active:bg-gray-100 dark:active:bg-neutral-800"
            accessibilityRole="button"
            accessibilityLabel="Close game"
          >
            <Feather name="x" size={20} color="#6B7280" />
          </Pressable>
        </View>

        {game.bookings.length > 0 ? (
          <View className="mt-2 gap-2">
            {game.bookings.map((booking) => (
              <View key={booking.id} className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
                <Text
                  onPress={() =>
                    router.push({
                      pathname: "/bookings/bookings",
                      params: { openId: String(booking.id) },
                    } as never)
                  }
                  className="text-sm font-semibold text-[#0644C7] underline dark:text-blue-400"
                  accessibilityRole="link"
                >
                  {booking.name}
                </Text>
                <Text className="text-sm text-gray-600 dark:text-gray-300">
                  {booking.referenceNumber} · {booking.participants} booked
                </Text>
                <Pill label={BOOKING_STATUS_LABELS[booking.status] ?? booking.status} tone="gray" />
                {booking.status === "confirmed" && day?.isToday && (
                  <TextAction
                    label="Check in booking"
                    disabled={busy}
                    onPress={() => void checkIn(booking.referenceNumber)}
                  />
                )}
              </View>
            ))}
          </View>
        ) : (
          <Text className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            No booking at this time.
          </Text>
        )}

        {game.completed && (
          <Notice tone="green" icon="check-circle" className="mt-4">
            <Text className={`text-sm font-semibold ${noticeTextClass("green")}`}>
              Completed ·{" "}
              {game.escaped === false ? "Did not escape" : `Finish time ${game.completionLabel}`}
            </Text>
            <Text className={`text-sm ${noticeTextClass("green")}`}>
              {game.completedWithoutPhoto
                ? withoutPhotoSummary(game.players, thanksName)
                : `Photo emailed to ${players(game.counts.emailed)}`}
              {game.completedByName ? ` · completed by ${game.completedByName}` : ""}
              {game.completedAt ? ` at ${formatTimeET(game.completedAt, { showZone: false })}` : ""}.
            </Text>
            {game.completedWithoutPhoto && game.counts.thanksFailed > 0 && (
              <Text className="text-sm text-red-700 dark:text-red-300">
                {thanksFailedLine(game.counts.thanksFailed)}
              </Text>
            )}
            {game.counts.retrying > 0 && (
              <Text className="text-sm text-amber-800 dark:text-amber-300">
                {plural(game.counts.retrying, "email has", "emails have")} not gone through
                yet and will be retried automatically.
              </Text>
            )}
            {game.counts.failed > 0 && (
              <Text className="text-sm text-red-700 dark:text-red-300">
                {plural(game.counts.failed, "email could", "emails could")} not be delivered
                after several tries.
                {game.canResend
                  ? " Use Resend next to the player to send it to a corrected address."
                  : ""}
              </Text>
            )}
            {game.counts.sending > 0 && game.counts.stuck === 0 && (
              <Text className={`text-sm ${noticeTextClass("green")}`}>
                {game.counts.sending} still sending.
              </Text>
            )}
            {!!reviewsLine && (
              <Text className="text-sm text-emerald-800 dark:text-emerald-300">{reviewsLine}</Text>
            )}
          </Notice>
        )}
        {game.completed && game.counts.stuck > 0 && (
          <Notice tone="amber" className="mt-3">
            {`${plural(game.counts.stuck, "email did", "emails did")} not finish sending. Press the send button below to try again.`}
          </Notice>
        )}
      </Card>

      {/* --------------------------------------------------------- players -- */}
      <Card>
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="font-semibold text-gray-900 dark:text-white">
            Players ({game.counts.players})
          </Text>
          {kioskUrl && (
            <Pressable
              onPress={showCheckInQr}
              className="flex-row items-center gap-1 py-1"
              accessibilityRole="button"
            >
              <Feather name="maximize" size={13} color={PRIMARY} />
              <Text className="text-xs font-semibold text-[#0644C7] dark:text-blue-400">
                Show check-in QR
              </Text>
            </Pressable>
          )}
        </View>
        <Text className="mb-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
          {
            "Everyone who signed the waiver for this room and time. Only these players can receive this game's photo."
          }
        </Text>
        {game.players.length === 0 ? (
          <Text className="py-3 text-sm text-gray-500 dark:text-gray-400">
            Nobody has signed for this game yet.
          </Text>
        ) : (
          game.players.map((player, i) => (
            <EscapeRoomPlayerRow
              key={player.waiverId}
              player={player}
              first={i === 0}
              game={game}
              day={day}
              busy={busy}
              actions={playerActions}
            />
          ))
        )}
        {game.counts.unsigned > 0 && (
          <Notice tone="amber" className="mt-3">
            <Text className={`text-xs ${noticeTextClass("amber")}`}>
              {game.counts.unsigned} waiver {game.counts.unsigned === 1 ? "link" : "links"} from
              the booking {game.counts.unsigned === 1 ? "has" : "have"} not been signed yet.
            </Text>
          </Notice>
        )}
        {game.excludedPlayers.length > 0 && (
          <View className="mt-4">
            <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Left out of this game
            </Text>
            {game.excludedPlayers.map((player, i) => (
              <EscapeRoomPlayerRow
                key={player.waiverId}
                player={player}
                excluded
                first={i === 0}
                game={game}
                day={day}
                busy={busy}
                actions={playerActions}
              />
            ))}
          </View>
        )}
      </Card>

      {/* ----------------------------------------------------- group photo -- */}
      <Card>
        <View className="mb-1 flex-row items-center gap-2">
          <Feather name="camera" size={15} color={PRIMARY} />
          <Text className="font-semibold text-gray-900 dark:text-white">Group photo</Text>
        </View>

        {!photoSession ? (
          game.completed ? (
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              No photo was taken for this game.
            </Text>
          ) : (
            <View className="gap-4">
              <Text className="text-sm text-gray-600 dark:text-gray-300">
                {"The room's overlay and today's date are added to the photo automatically."}
              </Text>
              {declinedRelease > 0 && (
                <Notice tone="amber" icon="alert-triangle">
                  {`${players(declinedRelease)} declined the photo release on their waiver. Ask them before taking the group photo.`}
                </Notice>
              )}
              <CheckboxRow
                alignTop
                checked={consent}
                onToggle={() => setConsent((v) => !v)}
                label="I asked the group and they agreed to have their photo taken."
              />
              <ActionButton
                label="Start group photo"
                icon="camera"
                loading={busy}
                disabled={!consent || busy}
                onPress={() => void startPhoto()}
              />
            </View>
          )
        ) : (
          <View className="gap-4">
            {!game.completed && (
              <>
                {cameraOn && focused ? (
                  <PhotoCameraView
                    cameraRef={cameraRef}
                    onStateChange={setCameraState}
                    retryToken={cameraRetry}
                  />
                ) : (
                  <View className="aspect-[4/3] w-full items-center justify-center rounded-2xl bg-gray-900 px-6">
                    <Feather name="camera" size={28} color="#D1D5DB" />
                    <Text className="mt-2 text-center text-sm text-gray-300">
                      Turn on the camera, or upload a photo.
                    </Text>
                  </View>
                )}
                <View className="gap-3">
                  {cameraOn ? (
                    <ActionButton
                      label="Take photo"
                      icon="camera"
                      loading={busy}
                      disabled={cameraState !== "live" || atCap || busy}
                      onPress={() => void takePhoto()}
                    />
                  ) : (
                    <ActionButton
                      label="Turn on camera"
                      icon="camera"
                      disabled={atCap || busy}
                      onPress={() => setCameraOn(true)}
                    />
                  )}
                  <ActionButton
                    label="Upload from device"
                    icon="upload"
                    variant="secondary"
                    disabled={atCap || busy}
                    onPress={() => void uploadPhoto()}
                  />
                  {cameraOn && cameraState !== "live" && cameraState !== "starting" && (
                    <TextAction
                      label="Retry camera"
                      tone="primary"
                      onPress={() => setCameraRetry((n) => n + 1)}
                    />
                  )}
                </View>
                {atCap && (
                  <Notice tone="amber">
                    {`${maxPhotos} photos is the most one game can hold. Remove one to swap it out.`}
                  </Notice>
                )}
              </>
            )}

            {photos.length === 0 ? (
              <View className="items-center py-6">
                <Feather name="image" size={28} color="#9CA3AF" />
                <Text className="mt-2 text-sm text-gray-400">No photos yet</Text>
              </View>
            ) : (
              <View className="-mx-1.5 flex-row flex-wrap">
                {photos.map((photo, index) => (
                  <View key={photo.id} className="w-1/3 px-1.5">
                    {photo.thumbnailUrl ? (
                      <Image
                        source={{ uri: photo.thumbnailUrl }}
                        style={{
                          width: "100%",
                          aspectRatio: 1,
                          borderRadius: 8,
                          borderWidth: removingPhotoId === photo.id ? 2 : 0,
                          borderColor: "#EF4444",
                        }}
                        contentFit="cover"
                        accessibilityLabel={`Group photo ${index + 1}`}
                      />
                    ) : (
                      <View className="aspect-square w-full items-center justify-center rounded-lg bg-gray-100 dark:bg-neutral-800">
                        <Feather name="image" size={18} color="#9CA3AF" />
                      </View>
                    )}
                    {photo.processingStatus === "failed" && (
                      <Text className="mt-1 text-xs text-red-600">Processing failed</Text>
                    )}

                    {game.completed &&
                      game.photoLink &&
                      photo.processingStatus === "ready" &&
                      game.slideshow?.enabled &&
                      (photo.slideshowEligible &&
                      (photo.showsInSlideshow || photo.slideshowApprovalStatus === "pending") ? (
                        <View className="items-center">
                          <Text className="mt-1 text-center text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                            {photo.showsInSlideshow
                              ? "On the venue slideshow"
                              : "Waiting for slideshow approval"}
                          </Text>
                          <TextAction
                            label="Take off slideshow"
                            disabled={busy}
                            onPress={() => void setSlideshow(photo, false)}
                          />
                        </View>
                      ) : (
                        <Pressable
                          onPress={() => void setSlideshow(photo, true)}
                          disabled={busy || (game.slideshow?.declined ?? 0) > 0}
                          className={`min-h-[36px] flex-row items-center justify-center gap-1 ${
                            busy || (game.slideshow?.declined ?? 0) > 0 ? "opacity-40" : ""
                          }`}
                          accessibilityRole="button"
                          accessibilityHint={
                            (game.slideshow?.declined ?? 0) > 0
                              ? "A player declined the photo release"
                              : undefined
                          }
                        >
                          <Feather name="monitor" size={12} color={PRIMARY} />
                          <Text className="text-[11px] font-semibold text-[#0644C7] underline dark:text-blue-400">
                            Add to slideshow
                          </Text>
                        </Pressable>
                      ))}

                    {!game.completed && (
                      <View className="mt-1 flex-row items-center justify-center">
                        <Pressable
                          onPress={() => void movePhoto(photo.id, -1)}
                          disabled={index === 0 || busy}
                          hitSlop={4}
                          className={`rounded p-1.5 ${index === 0 || busy ? "opacity-30" : ""}`}
                          accessibilityRole="button"
                          accessibilityLabel="Move earlier"
                        >
                          <Feather name="arrow-left" size={16} color="#6B7280" />
                        </Pressable>
                        <Pressable
                          onPress={() => void movePhoto(photo.id, 1)}
                          disabled={index === photos.length - 1 || busy}
                          hitSlop={4}
                          className={`rounded p-1.5 ${
                            index === photos.length - 1 || busy ? "opacity-30" : ""
                          }`}
                          accessibilityRole="button"
                          accessibilityLabel="Move later"
                        >
                          <Feather name="arrow-right" size={16} color="#6B7280" />
                        </Pressable>
                        <Pressable
                          onPress={() => setRemovingPhotoId(photo.id)}
                          disabled={busy}
                          hitSlop={4}
                          className={`rounded p-1.5 ${busy ? "opacity-30" : ""}`}
                          accessibilityRole="button"
                          accessibilityLabel="Remove photo"
                        >
                          <Feather name="trash-2" size={16} color="#DC2626" />
                        </Pressable>
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {removingPhotoId !== null && !game.completed && (
              <View className="gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/20">
                <Text className="text-sm text-red-900 dark:text-red-200">
                  Remove photo{" "}
                  {Math.max(1, photos.findIndex((p) => p.id === removingPhotoId) + 1)}? This
                  cannot be undone.
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <ActionButton
                    label="Remove photo"
                    variant="danger"
                    size="sm"
                    disabled={busy}
                    onPress={() => {
                      const target = removingPhotoId;
                      setRemovingPhotoId(null);
                      void removePhoto(target);
                    }}
                  />
                  <ActionButton
                    label="Keep"
                    variant="ghost"
                    size="sm"
                    onPress={() => setRemovingPhotoId(null)}
                  />
                </View>
              </View>
            )}

            {game.completed && game.photoLink && game.slideshow && (
              <Text
                className={`text-xs ${
                  game.slideshow.declined > 0
                    ? "text-amber-800 dark:text-amber-300"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {game.slideshow.declined > 0
                  ? `${players(game.slideshow.declined)} declined the photo release, so this game's photo can't go on the venue slideshow.`
                  : !game.slideshow.enabled
                    ? "The venue slideshow is switched off for this location, so it has no Add button here."
                    : "Photos stay off the venue slideshow unless you add them."}
              </Text>
            )}

            {slideshowConfirm && (
              <View className="gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/20">
                <Text className="text-sm text-amber-900 dark:text-amber-200">
                  {slideshowConfirm.note}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <ActionButton
                    label="The group agreed, show it"
                    size="sm"
                    disabled={busy}
                    onPress={() => {
                      const target = photos.find((p) => p.id === slideshowConfirm.photoId);
                      if (target) void setSlideshow(target, true, true);
                    }}
                  />
                  <ActionButton
                    label="Keep it off"
                    variant="ghost"
                    size="sm"
                    onPress={() => setSlideshowConfirm(null)}
                  />
                </View>
              </View>
            )}

            {firstReady?.deliveryUrl && (
              <View>
                <Text className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                  {game.completed ? "What players got" : "What players will get"}
                  {readyPhotos.length > 1
                    ? ` (all ${readyPhotos.length} photos are sent; the first is shown here)`
                    : ""}
                </Text>
                <Image
                  source={{ uri: firstReady.deliveryUrl }}
                  style={{
                    width: "100%",
                    aspectRatio:
                      firstReady.width && firstReady.height
                        ? firstReady.width / firstReady.height
                        : 4 / 3,
                    borderRadius: 8,
                    backgroundColor: "#F3F4F6",
                  }}
                  contentFit="contain"
                  accessibilityLabel="Branded preview"
                />
              </View>
            )}
          </View>
        )}
      </Card>

      {/* ----------------------------------------------- finish and send -- */}
      {!game.completed ? (
        <Card className="gap-4">
          <View className="flex-row items-center gap-2">
            <Feather name="clock" size={15} color={PRIMARY} />
            <Text className="font-semibold text-gray-900 dark:text-white">Finish time</Text>
          </View>
          <View className="flex-row flex-wrap gap-x-6">
            <RadioRow label="They escaped" selected={escaped} onPress={() => setEscaped(true)} />
            <RadioRow
              label="They didn't escape"
              selected={!escaped}
              onPress={() => setEscaped(false)}
            />
          </View>

          {escaped && (
            <View>
              <Text className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {finish.countingDown ? "Time left on the clock" : "How long they took"}
              </Text>
              {roomMinutes !== null && (
                <View className="mt-2">
                  <SegmentedToggle
                    options={[
                      { value: "used", label: "Time used" },
                      { value: "left", label: "Time left on clock" },
                    ]}
                    value={entryMode}
                    onChange={setEntryMode}
                  />
                </View>
              )}
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {finish.countingDown
                  ? `Type what the clock showed when they got out. The time used is worked out from the room's ${roomMinutes} minutes.`
                  : "Time used, not time left on the clock."}
                {!finish.countingDown && example
                  ? ` In a ${roomMinutes}-minute room with 12:48 left, enter ${example}, or switch to Time left on clock.`
                  : ""}
              </Text>
              <View className="mt-2 flex-row items-start gap-2">
                <View className="items-center">
                  <TimeBox
                    value={finishMinutes}
                    onChange={typeMinutes}
                    placeholder="mm"
                    label="Minutes"
                  />
                  <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">minutes</Text>
                </View>
                <Text className="mt-2.5 text-lg font-semibold text-gray-700 dark:text-gray-300">
                  :
                </Text>
                <View className="items-center">
                  <TimeBox
                    value={finishSeconds}
                    onChange={(v) => setFinishSeconds(digitsOnly(v, 2))}
                    placeholder="ss"
                    label="Seconds"
                    inputRef={secondsRef}
                  />
                  <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">seconds</Text>
                </View>
              </View>
              {finish.entered && !finish.valid && (
                <Text className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {finish.countingDown && finish.typedValid
                    ? `The time left must be less than the room's ${roomMinutes} minutes.`
                    : "Enter minutes, and seconds from 0 to 59."}
                </Text>
              )}
              {finish.countingDown && finish.valid && !!finish.label && (
                <Text className="mt-1 text-sm text-gray-800 dark:text-gray-200">
                  They took <Text className="font-bold">{finish.label}</Text>.
                </Text>
              )}
              {finish.veryFast && (
                <Text className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  {`That is under a quarter of this room's ${roomMinutes} minutes. `}
                  {finish.countingDown
                    ? "Check you typed the time left on the clock, not the time used."
                    : "Check it is the time used, not the time left."}
                </Text>
              )}
              {finish.longerThanRoom && (
                <Text className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  {`That is longer than this room's ${roomMinutes} minutes. Check the time before sending.`}
                </Text>
              )}
            </View>
          )}

          {(game.blockers.length > 0 || (escaped && !finish.entered)) && (
            <View className="gap-1">
              {[
                ...game.blockers,
                ...(escaped && !finish.entered
                  ? ["Enter how long the group took, or choose They didn't escape."]
                  : []),
              ].map((blocker) => (
                <View key={blocker} className="flex-row items-start gap-2">
                  <View className="mt-0.5">
                    <Feather name="alert-triangle" size={14} color="#F59E0B" />
                  </View>
                  <Text className="flex-1 text-sm text-gray-600 dark:text-gray-300">
                    {blocker}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {followUp.available && (
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {followUpInfoParts(followUp).before}
              <Text
                className="underline"
                onPress={() =>
                  router.push(
                    followUp.thanksEmailId
                      ? ({
                          pathname: "/email-campaign/create-notification",
                          params: { id: String(followUp.thanksEmailId) },
                        } as never)
                      : ("/email-campaign/email-notification" as never),
                  )
                }
              >
                {thanksName}
              </Text>
              {followUpInfoParts(followUp).after}
            </Text>
          )}

          {confirming ? (
            <View className="gap-3 rounded-xl border border-[#0644C7] p-4">
              <Text className="text-sm text-gray-900 dark:text-white">
                {completeAndSendQuestion(
                  thanksName,
                  recipients,
                  game.room.name,
                  game.sessionTimeLabel,
                  escaped ? finish.label : null,
                )}
              </Text>
              {!!completeAndSendExtras(followUp) && (
                <Text className="text-sm text-gray-600 dark:text-gray-300">
                  {completeAndSendExtras(followUp)}
                </Text>
              )}
              {recipientPlayers.length > 0 && (
                <View className="gap-0.5">
                  {recipientPlayers.map((p) => (
                    <Text key={p.waiverId} className="text-sm text-gray-700 dark:text-gray-300">
                      <Text className="font-medium text-gray-900 dark:text-white">
                        {p.name || "Unnamed signer"}
                      </Text>
                      {"  "}
                      <Text className="text-gray-500 dark:text-gray-400">{p.emailMasked}</Text>
                    </Text>
                  ))}
                </View>
              )}
              {noEmailPlayers.length > 0 && (
                <Text className="text-sm text-amber-800 dark:text-amber-300">
                  No email on the waiver, so no photo:{" "}
                  {noEmailPlayers.map((p) => p.name || "Unnamed signer").join(", ")}.
                </Text>
              )}
              {(game.playersBooked ?? 0) > people && (
                <Text className="text-sm text-amber-800 dark:text-amber-300">
                  {`Booked for ${game.playersBooked} people. Signed waivers cover ${people}. The others won't get the photo unless they sign first.`}
                </Text>
              )}
              {finish.longerThanRoom && (
                <Text className="text-sm text-amber-800 dark:text-amber-300">
                  {`${finish.label} is longer than this room's ${roomMinutes} minutes. Make sure it is right.`}
                </Text>
              )}
              <View className="flex-row flex-wrap gap-2">
                <ActionButton
                  label="Yes, complete and send"
                  icon="send"
                  loading={busy}
                  disabled={busy || !finish.valid}
                  onPress={() => void complete()}
                />
                <ActionButton
                  label="Not yet"
                  variant="ghost"
                  disabled={busy}
                  onPress={() => setConfirming(false)}
                />
              </View>
            </View>
          ) : recordingOnly ? (
            <View className="gap-3 rounded-xl border border-gray-300 p-4 dark:border-neutral-700">
              <Text className="text-sm text-gray-900 dark:text-white">
                {recordOnlyQuestion(
                  game.room.name,
                  game.sessionTimeLabel,
                  escaped ? finish.label : null,
                )}
              </Text>
              {followUp.canEmailPlayers && recipients > 0 ? (
                <>
                  <CheckboxRow
                    key={String(emailPlayersOnly)}
                    alignTop
                    checked={emailPlayersOnly}
                    onToggle={() => setEmailPlayersOnly((v) => !v)}
                    label={
                      <Text className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                        {emailPlayersOptionLabel(followUp, recipients)}
                      </Text>
                    }
                  />
                  {!isTodayGame && (
                    <Text className="text-xs text-amber-800 dark:text-amber-300">
                      {PAST_GAME_EMAIL_NOTE}
                    </Text>
                  )}
                  <Text className="text-xs text-gray-500 dark:text-gray-400">
                    {EMAIL_LATER_NOTE}
                  </Text>
                </>
              ) : (
                <Text className="text-sm text-gray-600 dark:text-gray-300">
                  No email is sent.
                </Text>
              )}
              <View className="flex-row flex-wrap gap-2">
                <ActionButton
                  label="Yes, record result only"
                  variant="secondary"
                  loading={busy}
                  disabled={busy || !finish.valid}
                  onPress={() => void recordWithoutPhoto()}
                />
                <ActionButton
                  label="Not yet"
                  variant="ghost"
                  disabled={busy}
                  onPress={() => setRecordingOnly(false)}
                />
              </View>
            </View>
          ) : (
            <View className="gap-2">
              <ActionButton
                label="Complete & Send"
                icon="send"
                disabled={!game.canComplete || busy || !finish.valid}
                onPress={() => setConfirming(true)}
              />
              {game.canCompleteWithoutPhoto && (
                <TextAction
                  label="Group didn't want a photo? Record the result only"
                  disabled={busy || !finish.valid || (escaped && !finish.entered)}
                  onPress={() => {
                    setEmailPlayersOnly(isTodayGame);
                    setRecordingOnly(true);
                  }}
                />
              )}
            </View>
          )}
        </Card>
      ) : (
        <Card className="gap-4">
          {!!game.sendBlocker && (
            <Notice tone="amber" icon="alert-triangle">
              {game.sendBlocker}
            </Notice>
          )}
          {!game.sendBlocker && (game.counts.newPlayers > 0 || game.counts.stuck > 0) && (
            <View className="gap-3">
              <Text className="text-sm text-gray-800 dark:text-gray-200">
                {newPlayersSummary({
                  newPlayers: game.counts.newPlayers,
                  stuck: game.counts.stuck,
                  completedWithoutPhoto: game.completedWithoutPhoto,
                  isToday: isTodayGame,
                  dayLabel,
                })}
              </Text>
              <ActionButton
                label={sendToNewLabel({
                  newPlayers: game.counts.newPlayers,
                  stuck: game.counts.stuck,
                  completedWithoutPhoto: game.completedWithoutPhoto,
                  thanksOn: followUp.thanksOn,
                })}
                icon="send"
                loading={busy}
                disabled={!game.canSendNew || busy}
                onPress={() => void sendToNew()}
              />
            </View>
          )}
          {!!game.photoLink && (
            <View className="flex-row flex-wrap gap-2">
              <ActionButton
                label="Show photo QR"
                icon="maximize"
                variant="secondary"
                size="sm"
                onPress={() =>
                  onShowQr({
                    title: "Group photo page",
                    description: `Players can scan this to open and download ${game.room.name}'s group photo on their own phones.`,
                    url: game.photoLink ?? "",
                    fileName: `${game.room.name ?? "escape-room"}-photo`,
                  })
                }
              />
              <ActionButton
                label="Copy photo link"
                icon="copy"
                variant="secondary"
                size="sm"
                onPress={() => void copyPhotoLink()}
              />
              {game.canResend && resendTargets.length > 1 && !confirmResendAll && (
                <ActionButton
                  label="Resend to everyone"
                  icon="send"
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onPress={() => setConfirmResendAll(true)}
                />
              )}
            </View>
          )}
          {confirmResendAll && (
            <View className="gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/60">
              <Text className="text-sm text-gray-800 dark:text-gray-200">
                Email the group photo again to all {resendTargets.length} players who got it
                {game.escaped === false ? "" : `, with the finish time ${game.completionLabel}`}?
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <ActionButton
                  label="Send again"
                  icon="send"
                  size="sm"
                  loading={busy}
                  disabled={busy}
                  onPress={() => void resendToEveryone()}
                />
                <ActionButton
                  label="Cancel"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onPress={() => setConfirmResendAll(false)}
                />
              </View>
            </View>
          )}
          {correcting ? (
            <View className="gap-3 rounded-xl border border-gray-200 p-4 dark:border-neutral-700">
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                Correct the recorded result
              </Text>
              <View className="flex-row flex-wrap gap-x-6">
                <RadioRow
                  label="They escaped"
                  selected={correctEscaped}
                  onPress={() => setCorrectEscaped(true)}
                />
                <RadioRow
                  label="They didn't escape"
                  selected={!correctEscaped}
                  onPress={() => setCorrectEscaped(false)}
                />
              </View>
              {correctEscaped && (
                <View className="flex-row items-center gap-2">
                  <TimeBox
                    value={correctMinutes}
                    onChange={(v) => setCorrectMinutes(digitsOnly(v, 3))}
                    placeholder="mm"
                    label="Corrected minutes"
                  />
                  <Text className="text-lg font-semibold text-gray-700 dark:text-gray-300">:</Text>
                  <TimeBox
                    value={correctSeconds}
                    onChange={(v) => setCorrectSeconds(digitsOnly(v, 2))}
                    placeholder="ss"
                    label="Corrected seconds"
                  />
                </View>
              )}
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {`This fixes the record only. Emails already sent can't be changed${
                  game.canResend ? "; use Resend to send the corrected time" : ""
                }.`}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <ActionButton
                  label="Save result"
                  size="sm"
                  loading={busy}
                  disabled={busy || !correction.valid}
                  onPress={() => void saveCorrection()}
                />
                <ActionButton
                  label="Cancel"
                  variant="ghost"
                  size="sm"
                  onPress={() => setCorrecting(false)}
                />
              </View>
            </View>
          ) : (
            <TextAction label="Correct the recorded result" onPress={beginCorrect} />
          )}
        </Card>
      )}
    </View>
  );
}

/** The location-wide guest check-in QR (header button, and closed games). */
export function checkInQr(kioskUrl: string, locationId: number): EscapeRoomQr {
  return {
    title: "Escape-room check-in",
    description:
      "Players scan this to choose their room and time and sign on their own phones.",
    note: "For the venue tablet, use Open on this device. That version clears itself between guests.",
    url: kioskUrl,
    fileName: "escape-room-check-in",
    print: {
      title: "Escape Room Check-In",
      note: "Scan to choose your room and time and sign your waiver. Your group photo is emailed after the game.",
    },
    openOnDevice: { locationId },
  };
}
