/**
 * The phase/tone vocabulary every check-in flow speaks.
 *
 * Lives here rather than inside one flow's hook so the booking half and the
 * entity half of the unified desk share one definition instead of one importing
 * the other's types for the sake of it.
 */

/**
 * Where a check-in flow currently stands:
 * - `idle`       — camera off, waiting for "Start Camera" (the landing state).
 * - `scanning`   — camera live, waiting for a QR.
 * - `processing` — a code was read; verifying it with the backend.
 * - `review`     — a valid record is loaded, awaiting staff approval.
 * - `order`      — a scanned multi-item order is loaded, with its lines.
 * - `result`     — a terminal outcome (success / blocked / error) is shown.
 */
export type CheckInPhase =
  | "idle"
  | "scanning"
  | "processing"
  | "review"
  | "order"
  | "result";

/** How a terminal outcome reads: admitted, admitted-with-a-caveat, refused. */
export type ResultTone = "success" | "warning" | "error";
