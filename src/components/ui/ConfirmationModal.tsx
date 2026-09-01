import { Feather } from "@expo/vector-icons";

import { StatusModal } from "./StatusModal";

type ConfirmationModalProps = {
  visible: boolean;
  title: string;
  message: string;
  warning?: string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: keyof typeof Feather.glyphMap;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * A yes/no question.
 *
 * Kept as its own name because that is what its call sites mean, but rendered
 * by {@link StatusModal} so confirmations, errors and successes are one design
 * with one implementation.
 */
export function ConfirmationModal({
  visible,
  title,
  message,
  warning,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  icon,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  return (
    <StatusModal
      visible={visible}
      variant={destructive ? "danger" : "confirm"}
      title={title}
      message={message}
      warning={warning}
      icon={icon}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
