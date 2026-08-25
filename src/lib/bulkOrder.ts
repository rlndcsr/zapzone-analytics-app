import { payableRoute, type PayableRoute } from "./payments/payableRoute.ts";

export type BulkOrderNoticeInfo = {
  /** Bold lead text of the banner. */
  title: string;
  /** " — line 3", or "" when the API gave no line position. */
  lineSuffix: string;
  /** Where "View order" goes — always the order's id, never the purchase's. */
  route: PayableRoute;
};

/**
 * The "Part of bulk order" banner an individual purchase shows when it is one
 * line of a ticket order, or null when it stands alone (web PurchaseDetails /
 * ViewEventPurchase).
 */
export function bulkOrderNotice(
  ticketOrderId: number | null | undefined,
  linePosition: number | null | undefined,
): BulkOrderNoticeInfo | null {
  const route = payableRoute("ticket_order", ticketOrderId);
  if (!route) return null;

  return {
    title: "Part of bulk order",
    lineSuffix: linePosition != null ? ` — line ${linePosition}` : "",
    route,
  };
}
