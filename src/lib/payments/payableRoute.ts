/** The mobile screens a payment's payable can be opened on. */
type PayablePathname =
  | "/bookings/bookings"
  | "/attractions/purchase-details"
  | "/events/purchase-details"
  | "/attractions/order-details";

export type PayableRoute = {
  pathname: PayablePathname;
  params: Record<string, string>;
};

/**
 * Where a payment's "open what this paid for" action goes — the mobile port of
 * the web Payments page's `navigateToPayable`. A `ticket_order` payment resolves
 * to Bulk Order Details, so an order's payment is managed on the order itself.
 * Returns null when there is nothing safe to open (no id, or an unknown type).
 */
export function payableRoute(
  payableType: string | null | undefined,
  payableId: number | null | undefined,
): PayableRoute | null {
  if (payableId == null || !Number.isFinite(payableId) || payableId <= 0) {
    return null;
  }
  const id = String(payableId);

  switch (payableType) {
    case "booking":
      return { pathname: "/bookings/bookings", params: { openId: id } };
    case "attraction_purchase":
      return { pathname: "/attractions/purchase-details", params: { id } };
    case "event_purchase":
      return { pathname: "/events/purchase-details", params: { id } };
    case "ticket_order":
      return { pathname: "/attractions/order-details", params: { id } };
    default:
      return null;
  }
}
