import { Feather } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import {
  statusStyle,
  statusTileColor,
  type StatusVariant,
} from "../../lib/ui/statusModal";
import { CenterModal } from "./CenterModal";

const CAUTION = "#B45309";

export type StatusModalProps = {
  visible: boolean;
  /** Decides the accent and the default glyph — see `lib/ui/statusModal`. */
  variant: StatusVariant;
  title: string;
  message?: string;
  /** Amber callout under the message, for a consequence worth spelling out. */
  warning?: string | null;
  /** Overrides the variant's default glyph. */
  icon?: keyof typeof Feather.glyphMap;
  /** Primary button label. */
  confirmLabel?: string;
  /**
   * Secondary button label. Omit for a one-button acknowledgement — which is
   * what a success or error report wants; a question needs the way out.
   */
  cancelLabel?: string | null;
  /** Spinner on the primary button; also blocks dismissal while in flight. */
  loading?: boolean;
  onConfirm: () => void;
  /** Close / secondary action. Also fires on the X and on backdrop tap. */
  onCancel: () => void;
};

/**
 * The app's one modal for reporting an outcome or asking a question: errors,
 * successes, and confirmations.
 *
 * A single component rather than three keeps the shape constant — same card,
 * same tinted round icon, same button geometry — so only the colour and wording
 * change with the message. Callers usually reach it through `useStatusModal`.
 */
export function StatusModal({
  visible,
  variant,
  title,
  message,
  warning,
  icon,
  confirmLabel = "OK",
  cancelLabel = null,
  loading = false,
  onConfirm,
  onCancel,
}: StatusModalProps) {
  const { accent, icon: defaultIcon } = statusStyle(variant);
  const glyph = (icon ?? defaultIcon) as keyof typeof Feather.glyphMap;

  return (
    <CenterModal visible={visible} onClose={onCancel} dismissable={!loading}>
      <View
        className="rounded-3xl bg-white p-6 dark:bg-neutral-900"
        style={{
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.18,
          shadowRadius: 24,
          elevation: 12,
        }}
      >
        {/* The backdrop dismisses too, but an explicit close is clearer. */}
        <Pressable
          onPress={onCancel}
          disabled={loading}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
          className="absolute right-4 top-4 z-10 active:opacity-60"
          style={{ opacity: loading ? 0.4 : 1 }}
        >
          <Feather name="x" size={18} color="#9CA3AF" />
        </Pressable>

        <View className="items-center">
          <View
            className="mb-3 h-14 w-14 items-center justify-center rounded-full"
            style={{ backgroundColor: statusTileColor(accent) }}
          >
            <Feather name={glyph} size={24} color={accent} />
          </View>
          <Text className="text-center text-lg font-bold text-gray-900 dark:text-white">
            {title}
          </Text>
        </View>

        {!!message && (
          <Text className="mt-2 text-center text-sm leading-5 text-gray-500 dark:text-gray-400">
            {message}
          </Text>
        )}

        {warning ? (
          <View className="mt-4 flex-row items-start rounded-2xl bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
            <Feather name="alert-triangle" size={14} color={CAUTION} />
            <Text className="ml-2.5 flex-1 text-[12px] leading-[18px] text-amber-700 dark:text-amber-500">
              {warning}
            </Text>
          </View>
        ) : null}

        <View className="mt-5 flex-row gap-3">
          {cancelLabel ? (
            <Pressable
              onPress={onCancel}
              disabled={loading}
              accessibilityRole="button"
              accessibilityState={{ disabled: loading }}
              className="flex-1 items-center rounded-xl border border-gray-200 py-3 active:opacity-70 dark:border-neutral-700"
              style={{ opacity: loading ? 0.5 : 1 }}
            >
              <Text className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                {cancelLabel}
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            onPress={onConfirm}
            disabled={loading}
            accessibilityRole="button"
            accessibilityState={{ disabled: loading, busy: loading }}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3 active:opacity-80"
            style={{ backgroundColor: accent, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text className="text-sm font-semibold text-white">
                {confirmLabel}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </CenterModal>
  );
}
