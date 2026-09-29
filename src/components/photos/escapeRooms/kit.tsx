import { Feather } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import type { BadgeTone } from "../../../lib/escapeRooms/escapeRooms";

export const PRIMARY = "#0644C7";

type FeatherName = ComponentProps<typeof Feather>["name"];

/** Card surface used for every panel on the Escape Rooms screen. */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`rounded-2xl border border-gray-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 ${className}`}
    >
      {children}
    </View>
  );
}

const PILL_TONES: Record<BadgeTone, { wrap: string; text: string }> = {
  gray: {
    wrap: "bg-gray-100 dark:bg-neutral-800",
    text: "text-gray-600 dark:text-gray-300",
  },
  muted: {
    wrap: "bg-gray-100 dark:bg-neutral-800",
    text: "text-gray-500 dark:text-gray-400",
  },
  faint: {
    wrap: "bg-gray-50 dark:bg-neutral-800/60",
    text: "text-gray-500 dark:text-gray-400",
  },
  amber: {
    wrap: "bg-amber-100 dark:bg-amber-900/30",
    text: "text-amber-800 dark:text-amber-300",
  },
  blue: {
    wrap: "bg-blue-100 dark:bg-blue-900/30",
    text: "text-blue-800 dark:text-blue-300",
  },
  green: {
    wrap: "bg-emerald-100 dark:bg-emerald-900/30",
    text: "text-emerald-800 dark:text-emerald-300",
  },
  red: {
    wrap: "bg-red-100 dark:bg-red-900/30",
    text: "text-red-700 dark:text-red-300",
  },
  slate: {
    wrap: "bg-slate-200 dark:bg-slate-800",
    text: "text-slate-700 dark:text-slate-300",
  },
};

/** Small rounded status chip — the web's `text-[11px] rounded-full` spans. */
export function Pill({ label, tone }: { label: string; tone: BadgeTone }) {
  const style = PILL_TONES[tone];
  return (
    <View className={`self-start rounded-full px-2 py-0.5 ${style.wrap}`}>
      <Text className={`text-[11px] font-semibold ${style.text}`}>{label}</Text>
    </View>
  );
}

const NOTICE_TONES = {
  amber: {
    wrap: "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20",
    text: "text-amber-800 dark:text-amber-300",
    icon: "#B45309",
  },
  red: {
    wrap: "border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20",
    text: "text-red-800 dark:text-red-300",
    icon: "#B91C1C",
  },
  gray: {
    wrap: "border-gray-200 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800/60",
    text: "text-gray-800 dark:text-gray-200",
    icon: "#6B7280",
  },
  green: {
    wrap: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-900/20",
    text: "text-emerald-900 dark:text-emerald-200",
    icon: "#059669",
  },
} as const;

export type NoticeTone = keyof typeof NOTICE_TONES;

/** Bordered message box; `icon` adds the leading warning glyph the web uses. */
export function Notice({
  tone,
  icon,
  children,
  className = "",
}: {
  tone: NoticeTone;
  icon?: FeatherName;
  children: ReactNode;
  className?: string;
}) {
  const style = NOTICE_TONES[tone];
  return (
    <View
      className={`flex-row items-start gap-2 rounded-lg border px-3 py-2 ${style.wrap} ${className}`}
    >
      {icon && (
        <View className="mt-0.5">
          <Feather name={icon} size={14} color={style.icon} />
        </View>
      )}
      <View className="flex-1">
        {typeof children === "string" ? (
          <Text className={`text-sm ${style.text}`}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export const noticeTextClass = (tone: NoticeTone) => NOTICE_TONES[tone].text;

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_STYLES: Record<ButtonVariant, { wrap: string; text: string; icon: string }> = {
  primary: { wrap: "bg-[#0644C7]", text: "text-white", icon: "#FFFFFF" },
  secondary: {
    wrap: "border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900",
    text: "text-gray-700 dark:text-gray-200",
    icon: "#6B7280",
  },
  danger: { wrap: "bg-red-600", text: "text-white", icon: "#FFFFFF" },
  ghost: { wrap: "", text: "text-gray-600 dark:text-gray-300", icon: "#6B7280" },
};

/** The web's StandardButton: filled, outlined, danger or plain. */
export function ActionButton({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  loading = false,
  size = "md",
  className = "",
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: FeatherName;
  disabled?: boolean;
  loading?: boolean;
  size?: "sm" | "md";
  className?: string;
}) {
  const style = BUTTON_STYLES[variant];
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      className={`flex-row items-center justify-center gap-1.5 rounded-xl active:opacity-80 ${
        size === "sm" ? "h-10 px-3" : "h-12 px-4"
      } ${style.wrap} ${off ? "opacity-50" : ""} ${className}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={style.icon} />
      ) : (
        icon && <Feather name={icon} size={size === "sm" ? 14 : 16} color={style.icon} />
      )}
      <Text className={`font-semibold ${size === "sm" ? "text-xs" : "text-sm"} ${style.text}`}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Underlined inline action — the web's small text buttons ("Resend", "Remove"). */
export function TextAction({
  label,
  onPress,
  tone = "gray",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  tone?: "gray" | "red" | "primary";
  disabled?: boolean;
}) {
  const color =
    tone === "red"
      ? "text-red-600 dark:text-red-400"
      : tone === "primary"
        ? "text-[#0644C7] dark:text-blue-400"
        : "text-gray-600 dark:text-gray-300";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      className={`min-h-[36px] justify-center px-1 ${disabled ? "opacity-40" : ""}`}
      accessibilityRole="button"
    >
      <Text className={`text-xs font-semibold underline ${color}`}>{label}</Text>
    </Pressable>
  );
}
