/**
 * The token the server hands back when a checkout creates a booking, purchase
 * or cart order (web `utils/checkoutTokens`).
 *
 * The server only lets a checkout roll back or charge the record it created if
 * the request carries that token, so nobody can cancel or pay against another
 * shopper's fresh record by guessing its id. It lives in memory only: it is
 * needed for the few seconds between the create and the charge or rollback.
 *
 * Keys are `${payable_type}:${id}`, using the payment morph names (`booking`,
 * `attraction_purchase`, `event_purchase`, `ticket_order`).
 */

const tokens: Record<string, string> = {};

export const rememberCheckoutToken = (
  type: string,
  id: number | undefined,
  token: unknown,
): void => {
  if (id && typeof token === "string" && token !== "") {
    tokens[`${type}:${id}`] = token;
  }
};

export const checkoutTokenFor = (type: string, id: number): string | undefined =>
  tokens[`${type}:${id}`];

export const checkoutTokenBody = (
  type: string,
  id: number,
): { checkout_token: string } | undefined => {
  const token = checkoutTokenFor(type, id);
  return token ? { checkout_token: token } : undefined;
};
