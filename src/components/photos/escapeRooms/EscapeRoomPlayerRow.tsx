import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { EXCLUDED_LABELS, plural } from "../../../lib/escapeRooms/escapeRooms";
import {
  canResendThanks,
  REMOVE_PLAYER_QUESTION,
  reviewBadge,
  thanksBadge,
} from "../../../lib/escapeRooms/gameFollowUp";
import type {
  EscapeRoomDay,
  EscapeRoomGame,
  EscapeRoomPlayer,
} from "../../../services/escapeRoomService";
import { FieldLabel } from "../../ui/FormControls";
import { SheetSelect } from "../../ui/SheetSelect";
import { ActionButton, Pill, TextAction } from "./kit";

type Panel = "resend" | "remove" | "move" | null;

/** Each action resolves true when it succeeded, so the row can close its panel. */
export type PlayerActions = {
  resend: (player: EscapeRoomPlayer, email: string | null) => Promise<boolean>;
  remove: (player: EscapeRoomPlayer) => Promise<boolean>;
  move: (player: EscapeRoomPlayer, roomId: number, time: string) => Promise<boolean>;
  linkBooking: (player: EscapeRoomPlayer, bookingId: number | null) => Promise<boolean>;
  /** Send now / cancel one of the player's follow-up emails. */
  followUp: (rowId: number, action: "send" | "cancel") => Promise<void>;
};

function deliveryPill(player: EscapeRoomPlayer) {
  const d = player.delivery;
  if (!player.sent || !d) return null;
  if (d.isDuplicate) return <Pill label="Same email as another player" tone="gray" />;
  if (d.status === "sent") return <Pill label="Photo sent" tone="green" />;
  if (d.status === "failed") {
    return (
      <Pill
        label={d.gaveUp ? "Could not be delivered" : "Send failed, retrying"}
        tone="red"
      />
    );
  }
  return <Pill label="Sending" tone="gray" />;
}

/** One signer in a game — the web's `renderPlayer`. */
export function EscapeRoomPlayerRow({
  player,
  excluded = false,
  first,
  game,
  day,
  busy,
  actions,
}: {
  player: EscapeRoomPlayer;
  excluded?: boolean;
  first: boolean;
  game: EscapeRoomGame;
  day: EscapeRoomDay | null;
  busy: boolean;
  actions: PlayerActions;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [email, setEmail] = useState("");
  const [moveRoomId, setMoveRoomId] = useState<number | null>(null);
  const [moveTime, setMoveTime] = useState("");

  const name = player.name || "Unnamed signer";
  const canMoveOrRemove = !player.sent && (player.isSignIn || !player.bookingId);
  const canResend =
    player.sent && !excluded && game.canResend && !player.delivery?.isDuplicate;
  const showBookingPicker =
    !player.sent &&
    player.isSignIn &&
    (game.bookings.length > 0 || player.bookingId !== null);

  const moveRoom = day?.rooms.find((room) => room.id === moveRoomId) ?? null;
  const moveTimes = (moveRoom?.slots ?? []).filter(
    (slot) => !(moveRoom?.id === game.room.id && slot.time === game.sessionTime),
  );

  const bookingOptions = [
    { label: "Not linked", value: "" },
    ...(player.bookingId !== null &&
    !game.bookings.some((b) => b.id === player.bookingId)
      ? [
          {
            label: `${player.bookingReference ?? "Earlier booking"} (cancelled or moved)`,
            value: player.bookingId,
          },
        ]
      : []),
    ...game.bookings.map((b) => ({
      label: `${b.name} · ${b.referenceNumber}`,
      value: b.id,
    })),
  ];

  const toggle = (next: Panel) => {
    setPanel((current) => (current === next ? null : next));
    setEmail("");
    if (next === "move") {
      setMoveRoomId(game.room.id);
      setMoveTime("");
    }
  };

  return (
    <View
      className={`gap-2 py-3 ${first ? "" : "border-t border-gray-100 dark:border-neutral-800"}`}
    >
      <View>
        <Text className="text-sm font-semibold text-gray-900 dark:text-white">
          {name}
          {player.minors > 0 && (
            <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {"  "}+ {plural(player.minors, "minor", "minors")}
            </Text>
          )}
        </Text>
        <View className="mt-0.5 flex-row flex-wrap items-center gap-x-3 gap-y-0.5">
          <View className="flex-row items-center gap-1">
            <Feather name="mail" size={11} color="#6B7280" />
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {player.hasEmail ? player.emailMasked : "No email on this waiver"}
            </Text>
          </View>
          {!!player.bookingReference && (
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Booking {player.bookingReference}
            </Text>
          )}
          {!!player.referenceNumber && (
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              {player.referenceNumber}
            </Text>
          )}
        </View>
        {excluded && player.excludedReason && (
          <Text className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
            {EXCLUDED_LABELS[player.excludedReason]}. They will not be sent this photo.
            {player.isSignIn &&
            player.excludedReason !== "other_location" &&
            !player.sent
              ? " If they played this game, set Booking to Not linked to include them."
              : ""}
          </Text>
        )}
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        {player.photoRelease === false && (
          <Pill label="Declined photo release" tone="amber" />
        )}
        {deliveryPill(player)}
        {!excluded && player.thanksEmail && (
          <Pill label={thanksBadge(player.thanksEmail).label} tone={thanksBadge(player.thanksEmail).tone} />
        )}
        {!excluded && player.thanksEmail && canResendThanks(player.thanksEmail) && (
          <TextAction
            label="Send thank-you again"
            disabled={busy}
            onPress={() => player.thanksEmail && void actions.followUp(player.thanksEmail.id, "send")}
          />
        )}
        {!excluded && player.review && (
          <Pill label={reviewBadge(player.review).label} tone={reviewBadge(player.review).tone} />
        )}
        {!excluded && player.review && player.review.rating === null && player.review.status === "scheduled" && (
          <>
            <TextAction
              label="Send review now"
              disabled={busy}
              onPress={() => player.review && void actions.followUp(player.review.id, "send")}
            />
            <TextAction
              label="Don't ask for a review"
              disabled={busy}
              onPress={() => player.review && void actions.followUp(player.review.id, "cancel")}
            />
          </>
        )}
        {!excluded && player.review && player.review.rating === null && player.review.status === "failed" && (
          <TextAction
            label="Send review again"
            disabled={busy}
            onPress={() => player.review && void actions.followUp(player.review.id, "send")}
          />
        )}
        {canResend && <TextAction label="Resend" onPress={() => toggle("resend")} />}
        {canMoveOrRemove && (
          <>
            <TextAction label="Wrong game? Move" onPress={() => toggle("move")} />
            <TextAction label="Remove" tone="red" onPress={() => toggle("remove")} />
          </>
        )}
      </View>
      {player.sent && !!player.delivery?.error && player.delivery.status === "failed" && (
        <Text className="text-xs text-red-600 dark:text-red-400">
          {player.delivery.error}
        </Text>
      )}

      {panel === "resend" && (
        <View className="gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/60">
          <FieldLabel>Send to</FieldLabel>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={
              player.delivery?.status === "sent" || player.emailMasked
                ? "Leave empty for the last address it went to"
                : "Email address"
            }
            placeholderTextColor="#9CA3AF"
            className="h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white"
          />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {
              "Leave it empty to send to the last address the photo went to (or the waiver's address). The waiver itself is not changed."
            }
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <ActionButton
              label="Send photo"
              icon="send"
              size="sm"
              loading={busy}
              disabled={
                busy ||
                (!player.hasEmail &&
                  player.delivery?.status !== "sent" &&
                  email.trim() === "")
              }
              onPress={async () => {
                if (await actions.resend(player, email.trim() || null)) setPanel(null);
              }}
            />
            <ActionButton
              label="Cancel"
              variant="ghost"
              size="sm"
              onPress={() => setPanel(null)}
            />
          </View>
        </View>
      )}

      {panel === "remove" && (
        <View className="gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/20">
          <Text className="text-sm text-red-900 dark:text-red-200">
            {REMOVE_PLAYER_QUESTION(player.name)}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <ActionButton
              label="Remove"
              variant="danger"
              size="sm"
              loading={busy}
              disabled={busy}
              onPress={async () => {
                if (await actions.remove(player)) setPanel(null);
              }}
            />
            <ActionButton
              label="Keep"
              variant="ghost"
              size="sm"
              onPress={() => setPanel(null)}
            />
          </View>
        </View>
      )}

      {showBookingPicker && (
        <View>
          <FieldLabel>Booking</FieldLabel>
          <SheetSelect
            title="Link to a booking"
            value={player.bookingId ?? ""}
            options={bookingOptions}
            disabled={busy}
            onSelect={(value) => {
              const next = value === "" ? null : Number(value);
              if (next === player.bookingId) return;
              void actions.linkBooking(player, next);
            }}
          />
        </View>
      )}

      {panel === "move" && day && (
        <View className="gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/60">
          <View>
            <FieldLabel>Room</FieldLabel>
            <SheetSelect
              title="Room"
              value={moveRoomId}
              options={day.rooms.map((room) => ({ label: room.name, value: room.id }))}
              onSelect={(value) => {
                setMoveRoomId(Number(value) || null);
                setMoveTime("");
              }}
            />
          </View>
          <View>
            <FieldLabel>Time</FieldLabel>
            <SheetSelect
              title="Time"
              placeholder="Choose a time"
              value={moveTime || null}
              disabled={moveTimes.length === 0}
              options={moveTimes.map((slot) => ({
                label: `${slot.timeLabel}${
                  slot.completed ? " (sent)" : slot.isPast ? " (finished)" : ""
                }`,
                value: slot.time,
              }))}
              onSelect={(value) => setMoveTime(String(value))}
            />
          </View>
          <View className="flex-row flex-wrap gap-2">
            <ActionButton
              label="Move player"
              size="sm"
              loading={busy}
              disabled={!moveTime || !moveRoomId || busy}
              onPress={async () => {
                if (!moveRoomId) return;
                if (await actions.move(player, moveRoomId, moveTime)) setPanel(null);
              }}
            />
            <ActionButton
              label="Cancel"
              variant="ghost"
              size="sm"
              onPress={() => setPanel(null)}
            />
          </View>
        </View>
      )}
    </View>
  );
}
