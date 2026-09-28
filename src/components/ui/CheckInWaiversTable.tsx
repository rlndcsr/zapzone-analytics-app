import { Feather } from "@expo/vector-icons";
import { useMemo } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import {
  DESK_WAIVER_LABEL,
  deskWaiverState,
  peopleCovered,
  visitDateLabel,
  waiverLinkLabel,
  waiverSignerName,
  type DeskWaiverState,
} from "../../lib/checkin/checkInWaiverList";
import { formatDateTimeET } from "../../lib/date/venueTime";
import type { Waiver } from "../../services/waiversService";
import { PressableScale } from "./motion/PressableScale";
import { SelectableTable, type TableColumn } from "./SelectableTable";
import { StatusBadge } from "./StatusBadge";

/**
 * The check-in palette's colours for a waiver's state: green once checked in,
 * yellow while signed and waiting, the shared gray while unsigned — the web
 * table's pills.
 */
const PALETTE_KEY: Record<DeskWaiverState, string> = {
  "checked-in": "checked-in",
  signed: "confirmed",
  "not-signed": "not-signed",
};

export type CheckInWaiverRowHandlers = {
  onCheckIn: (waiver: Waiver) => void;
  onUndo: (waiver: Waiver) => void;
  onDetails: (waiver: Waiver) => void;
  /** The row with a check-in or undo in flight. */
  busyId: number | null;
  /** Show each row's location (the desk is looking at every location). */
  showLocation: boolean;
};

const ActionButton = ({
  icon,
  label,
  tone,
  disabled,
  onPress,
}: {
  icon?: React.ComponentProps<typeof Feather>["name"];
  label: string;
  tone: "success" | "primary" | "ghost";
  disabled?: boolean;
  onPress: () => void;
}) => (
  <PressableScale
    onPress={onPress}
    disabled={disabled}
    hitSlop={4}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`flex-row items-center gap-1.5 rounded-lg px-2.5 py-1.5 ${
      tone === "success"
        ? "bg-emerald-600"
        : tone === "primary"
          ? "bg-[#0644C7]"
          : "border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
    } ${disabled ? "opacity-50" : ""}`}
  >
    {!!icon && (
      <Feather
        name={icon}
        size={13}
        color={tone === "ghost" ? "#4B5563" : "#FFFFFF"}
      />
    )}
    <Text
      className={`text-[11px] font-semibold ${
        tone === "ghost" ? "text-gray-700 dark:text-gray-200" : "text-white"
      }`}
    >
      {label}
    </Text>
  </PressableScale>
);

/**
 * The check-in desk's Waivers tab — the web Check-In / Waivers table's columns
 * (Reference / Signer, Waiver, Visit Date, People Covered, Status, Actions) on
 * the app's shared table, beside the Bookings table.
 */
export function CheckInWaiversTable({
  rows,
  handlers,
}: {
  rows: Waiver[];
  handlers: CheckInWaiverRowHandlers;
}) {
  const { onCheckIn, onUndo, onDetails, busyId, showLocation } = handlers;

  const columns = useMemo<TableColumn<Waiver>[]>(
    () => [
      {
        key: "signer",
        label: "Reference / Signer",
        width: 230,
        render: (w) => (
          <View>
            <Text
              numberOfLines={1}
              className="font-mono text-[11px] font-medium text-gray-500 dark:text-gray-400"
            >
              {w.referenceNumber || `#${w.id}`}
            </Text>
            <Text
              numberOfLines={1}
              className="text-sm font-semibold text-gray-900 dark:text-white"
            >
              {waiverSignerName(w)}
            </Text>
            <Text
              numberOfLines={1}
              className="text-[11px] text-gray-500 dark:text-gray-400"
            >
              Email: {w.adultEmail || "N/A"}
            </Text>
            <Text
              numberOfLines={1}
              className="text-[11px] text-gray-500 dark:text-gray-400"
            >
              Phone: {w.adultPhone || "N/A"}
            </Text>
          </View>
        ),
      },
      {
        key: "waiver",
        label: "Waiver",
        width: 220,
        render: (w) => {
          const link = waiverLinkLabel(w);
          return (
            <View>
              <Text
                numberOfLines={2}
                className="text-sm text-gray-900 dark:text-white"
              >
                {w.templateTitle || "Waiver"}
              </Text>
              {!!link && (
                <Text
                  numberOfLines={1}
                  className="text-[11px] text-gray-500 dark:text-gray-400"
                >
                  {link}
                </Text>
              )}
              {showLocation && !!w.locationName && (
                <Text
                  numberOfLines={1}
                  className="text-[11px] text-gray-500 dark:text-gray-400"
                >
                  {w.locationName}
                </Text>
              )}
            </View>
          );
        },
      },
      {
        key: "visit",
        label: "Visit Date",
        width: 220,
        render: (w) => (
          <View>
            <Text className="text-sm text-gray-900 dark:text-white">
              {visitDateLabel(w.selectedDate)}
            </Text>
            <Text
              numberOfLines={2}
              className="text-[11px] text-gray-500 dark:text-gray-400"
            >
              {w.submittedAt
                ? `Signed ${formatDateTimeET(w.submittedAt)}`
                : "Not signed yet"}
            </Text>
          </View>
        ),
      },
      {
        key: "people",
        label: "People Covered",
        width: 150,
        render: (w) => {
          const people = peopleCovered(w);
          return (
            <Text className="text-sm text-gray-900 dark:text-white">
              {people.count}{" "}
              <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                {people.detail}
              </Text>
            </Text>
          );
        },
      },
      {
        key: "status",
        label: "Status",
        width: 130,
        render: (w) => {
          const state = deskWaiverState(w);
          return (
            <View>
              <View className="flex-row">
                <StatusBadge
                  status={PALETTE_KEY[state]}
                  palette="checkin"
                  label={DESK_WAIVER_LABEL[state]}
                />
              </View>
              {state === "checked-in" && (
                <Text
                  numberOfLines={2}
                  className="mt-1 text-[11px] text-gray-500 dark:text-gray-400"
                >
                  {formatDateTimeET(w.checkedInAt)}
                </Text>
              )}
            </View>
          );
        },
      },
      {
        key: "actions",
        label: "Actions",
        width: 200,
        render: (w) => {
          const state = deskWaiverState(w);
          const busy = busyId === w.id;
          return (
            <View className="flex-row items-center gap-1.5">
              {state === "signed" && (
                <ActionButton
                  icon="check-circle"
                  label="Check In"
                  tone="success"
                  disabled={busy}
                  onPress={() => onCheckIn(w)}
                />
              )}
              {state === "checked-in" && (
                <ActionButton
                  label="Undo"
                  tone="ghost"
                  disabled={busy}
                  onPress={() => onUndo(w)}
                />
              )}
              <ActionButton
                icon="eye"
                label="Details"
                tone="primary"
                onPress={() => onDetails(w)}
              />
              {busy && <ActivityIndicator size="small" color="#0644C7" />}
            </View>
          );
        },
      },
    ],
    [onCheckIn, onUndo, onDetails, busyId, showLocation],
  );

  return (
    <SelectableTable
      columns={columns}
      rows={rows}
      rowId={(w) => w.id}
      rowLabel={(w) => `waiver for ${waiverSignerName(w)}`}
    />
  );
}
