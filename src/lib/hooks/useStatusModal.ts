import { useCallback, useMemo, useState } from "react";

import type { StatusVariant } from "../ui/statusModal";

type State = {
  visible: boolean;
  variant: StatusVariant;
  title: string;
  message?: string;
  warning?: string | null;
  confirmLabel?: string;
  cancelLabel?: string | null;
  /** Runs on the primary button; the modal closes first either way. */
  onConfirm?: () => void;
};

const CLOSED: State = { visible: false, variant: "info", title: "" };

/**
 * Drives a `<StatusModal />` without each screen hand-rolling the state.
 *
 * Replaces `Alert.alert` for reporting the outcome of an action — saving
 * settings, saving changes, a failed request — so those all look like the app
 * rather than like the OS, and read the same from screen to screen.
 *
 *   const status = useStatusModal();
 *   ...
 *   status.success("Settings saved");
 *   status.error("Save failed", err.message);
 *   status.confirm({ title: "Clear all?", onConfirm: clearAll, destructive: true });
 *   ...
 *   <StatusModal {...status.props} />
 */
export function useStatusModal() {
  const [state, setState] = useState<State>(CLOSED);

  const close = useCallback(() => {
    setState((s) => ({ ...s, visible: false }));
  }, []);

  const show = useCallback((next: Omit<State, "visible">) => {
    setState({ ...next, visible: true });
  }, []);

  const success = useCallback(
    (title: string, message?: string) =>
      show({ variant: "success", title, message, confirmLabel: "Done" }),
    [show],
  );

  const error = useCallback(
    (title: string, message?: string) =>
      show({ variant: "error", title, message, confirmLabel: "Try Again" }),
    [show],
  );

  const info = useCallback(
    (title: string, message?: string) =>
      show({ variant: "info", title, message }),
    [show],
  );

  /** A question. Destructive ones go red and default to a "Delete" verb. */
  const confirm = useCallback(
    ({
      title,
      message,
      warning,
      confirmLabel,
      cancelLabel = "Cancel",
      destructive = false,
      onConfirm,
    }: {
      title: string;
      message?: string;
      warning?: string | null;
      confirmLabel?: string;
      cancelLabel?: string;
      destructive?: boolean;
      onConfirm: () => void;
    }) =>
      show({
        variant: destructive ? "danger" : "confirm",
        title,
        message,
        warning,
        confirmLabel: confirmLabel ?? (destructive ? "Delete" : "Confirm"),
        cancelLabel,
        onConfirm,
      }),
    [show],
  );

  const props = useMemo(
    () => ({
      visible: state.visible,
      variant: state.variant,
      title: state.title,
      message: state.message,
      warning: state.warning,
      confirmLabel: state.confirmLabel,
      cancelLabel: state.cancelLabel,
      onCancel: close,
      onConfirm: () => {
        // Close first: the action may navigate away, and a modal left mounted
        // over a departing screen is the classic way this goes wrong.
        close();
        state.onConfirm?.();
      },
    }),
    [state, close],
  );

  return { props, show, success, error, info, confirm, close };
}
