/**
 * Presentation rules for the shared status modal — the accent colour and the
 * default glyph for each kind of message.
 *
 * Kept apart from the component (and free of runtime imports) so the mapping is
 * unit-testable and every screen gets the same colour for the same meaning
 * rather than picking one by hand.
 */

export type StatusVariant =
  | "error"
  | "success"
  | "warning"
  | "info"
  | "confirm"
  | "danger";

export type StatusStyle = {
  /** Accent for the icon, its tinted tile, and the primary button. */
  accent: string;
  /** Default Feather glyph; a caller can still override it. */
  icon: string;
};

const STYLES: Record<StatusVariant, StatusStyle> = {
  error: { accent: "#EF4444", icon: "alert-triangle" },
  // Destructive confirmations share the error red: both are "this is serious".
  danger: { accent: "#EF4444", icon: "trash-2" },
  success: { accent: "#059669", icon: "check-circle" },
  warning: { accent: "#D97706", icon: "alert-circle" },
  info: { accent: "#0644C7", icon: "info" },
  confirm: { accent: "#0644C7", icon: "help-circle" },
};

/** Accent and default glyph for a variant; unknown values fall back to info. */
export function statusStyle(variant: StatusVariant): StatusStyle {
  return STYLES[variant] ?? STYLES.info;
}

/**
 * The tile background behind the icon: the accent at ~10% opacity.
 *
 * Expressed as an 8-digit hex rather than an rgba() string because React
 * Native's style layer takes either, and appending to the accent keeps the two
 * colours provably in step.
 */
export function statusTileColor(accent: string): string {
  return `${accent}1A`;
}
