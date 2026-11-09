import { Feather } from "@expo/vector-icons";
import { memo, type ComponentProps } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { bookedLabel } from "../../lib/concerns/leadFilter";
import type {
  ConcernRow,
  ConcernStatus,
} from "../../services/checkoutConcernsService";
import {
  ContactLine,
  KIND_META,
  STATUS_META,
  describeWanted,
  formatReceived,
} from "./ConcernsTable";

type FeatherIconName = ComponentProps<typeof Feather>["name"];

/** Same labelled action button as the table's Actions cell. */
const ActionButton = ({
  icon,
  label,
  tone,
  onPress,
}: {
  icon: FeatherIconName;
  label: string;
  tone: "primary" | "neutral";
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl active:opacity-70 ${
      tone === "primary"
        ? "bg-[#0644C7]"
        : "border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
    }`}
  >
    <Feather
      name={icon}
      size={14}
      color={tone === "primary" ? "#FFFFFF" : "#6B7280"}
    />
    <Text
      numberOfLines={1}
      className={`text-sm font-semibold ${
        tone === "primary" ? "text-white" : "text-gray-700 dark:text-gray-200"
      }`}
    >
      {label}
    </Text>
  </Pressable>
);

/** One labelled cell of the card's spec strip. */
const SpecCell = ({
  label,
  value,
  divider = false,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) => (
  <View
    className={`flex-1 px-3 py-2.5 ${
      divider ? "border-l border-gray-200 dark:border-neutral-800" : ""
    }`}
  >
    <Text className="text-[11px] text-gray-500 dark:text-gray-400">{label}</Text>
    <Text
      numberOfLines={2}
      className="text-sm font-semibold mt-0.5 text-gray-900 dark:text-white"
    >
      {value}
    </Text>
  </View>
);

/**
 * Card layout for Customer Concerns, in the Manage Attractions card style:
 * guest + status on top, the why badge and their words, a Wanted / Booked
 * strip, contact links, then the same status actions as the table.
 */
export const ConcernCard = memo(function ConcernCard({
  concern: c,
  busy,
  onSetStatus,
}: {
  concern: ConcernRow;
  busy: boolean;
  onSetStatus: (concern: ConcernRow, status: ConcernStatus) => void;
}) {
  const kind = KIND_META[c.kind] ?? KIND_META.schedule_help;
  const status = STATUS_META[c.status] ?? STATUS_META.new;

  return (
    <View
      accessibilityLabel={`Concern from ${c.name}`}
      className="mb-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
    >
      {/* Guest · status */}
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text
            numberOfLines={1}
            className="text-base font-semibold text-gray-900 dark:text-white"
          >
            {c.name}
          </Text>
          {!!c.locationName && (
            <Text
              numberOfLines={1}
              className="mt-0.5 text-xs text-gray-500 dark:text-gray-400"
            >
              {c.locationName}
            </Text>
          )}
        </View>
        <View className="items-end">
          <View className={`px-2 py-0.5 rounded-full ${status.bg}`}>
            <Text className={`text-[11px] font-semibold ${status.fg}`}>
              {status.label}
            </Text>
          </View>
          {!!c.handlerName && (
            <Text
              numberOfLines={1}
              className="mt-1 text-xs text-gray-400 dark:text-gray-500"
            >
              by {c.handlerName}
            </Text>
          )}
        </View>
      </View>

      {/* Why + their words */}
      <View
        className={`mt-2.5 flex-row items-center gap-1 self-start px-2 py-0.5 rounded-full ${kind.bg}`}
      >
        <Feather name={kind.icon} size={11} color="#6B7280" />
        <Text className={`text-[11px] font-semibold ${kind.fg}`}>
          {kind.label}
        </Text>
      </View>
      {!!c.message && (
        <Text
          numberOfLines={4}
          className="mt-2 text-sm leading-5 text-gray-600 dark:text-gray-300"
        >
          “{c.message}”
        </Text>
      )}

      {/* Wanted / Booked strip */}
      <View className="mt-3 flex-row rounded-xl border border-gray-200 dark:border-neutral-800">
        <SpecCell label="What they wanted" value={describeWanted(c)} />
        <SpecCell label="Booked?" value={bookedLabel(c)} divider />
      </View>
      {!!c.stepLabel && (
        <Text
          numberOfLines={1}
          className="mt-1.5 text-xs text-gray-400 dark:text-gray-500"
        >
          Reached: {c.stepLabel}
        </Text>
      )}

      {/* Reach them on */}
      {(!!c.phone || !!c.email) && (
        <View className="mt-3 gap-1">
          {!!c.phone && (
            <ContactLine icon="phone" value={c.phone} url={`tel:${c.phone}`} />
          )}
          {!!c.email && (
            <ContactLine
              icon="mail"
              value={c.email}
              url={`mailto:${c.email}`}
              small
            />
          )}
        </View>
      )}

      {/* Footer: when + actions */}
      <View className="mt-3 border-t border-gray-100 pt-3 dark:border-neutral-800">
        <View className="mb-2.5 flex-row items-center gap-1.5">
          <Feather name="clock" size={12} color="#9CA3AF" />
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            {formatReceived(c.createdAt)}
          </Text>
        </View>
        {busy ? (
          <View className="items-center py-2">
            <ActivityIndicator size="small" color="#0644C7" />
          </View>
        ) : (
          <View className="flex-row gap-2">
            {c.status === "new" && (
              <ActionButton
                icon="phone-call"
                label="Mark contacted"
                tone="neutral"
                onPress={() => onSetStatus(c, "contacted")}
              />
            )}
            {c.status !== "resolved" && (
              <ActionButton
                icon="check-circle"
                label="Resolve"
                tone="primary"
                onPress={() => onSetStatus(c, "resolved")}
              />
            )}
            {c.status === "resolved" && (
              <ActionButton
                icon="rotate-ccw"
                label="Reopen"
                tone="neutral"
                onPress={() => onSetStatus(c, "new")}
              />
            )}
          </View>
        )}
      </View>
    </View>
  );
});
