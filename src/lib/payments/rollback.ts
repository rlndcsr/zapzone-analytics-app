/**
 * Rollback for the "record created, card never charged" window.
 *
 * Every card flow creates its record first so the charge has a payable to link
 * to. If tokenization, the network, or the gateway then fails, that record is a
 * booking/purchase nobody paid for — the web force-deletes it and so do we.
 *
 * These wrappers never throw: the caller is already reporting a payment failure,
 * and a failed cleanup must not replace that message with a confusing second
 * error. A rollback that fails leaves an unpaid record staff can delete by hand,
 * which is strictly better than losing the decline message.
 *
 * Never call these when the charge's outcome is unknown (`chargeOutcomeUnknown`):
 * the card may have been charged, and the record must be kept.
 */

import { forceDeleteAttractionPurchase } from "../../services/attractionPurchasesService";
import { forceDeleteBooking } from "../../services/bookingsService";
import { forceDeleteEventPurchase } from "../../services/eventPurchasesService";
import { forceDeleteOrKeep, type BookingRollbackOutcome } from "./bookingRollback";

async function quietly(what: string, remove: () => Promise<void>): Promise<void> {
  try {
    await remove();
  } catch (err) {
    if (__DEV__) console.warn(`[payments] ${what} rollback failed`, err);
  }
}

export const rollbackAttractionPurchase = (token: string, id: number) =>
  quietly("attraction purchase", () => forceDeleteAttractionPurchase(token, id));

export const rollbackEventPurchase = (token: string, id: number) =>
  quietly("event purchase", () => forceDeleteEventPurchase(token, id));

/**
 * Booking rollback for a failed card payment (web `bookingService.rollbackBooking`).
 * Only the permanent force-delete is tried — a soft delete alone would leave the
 * slot's room looking reserved, and falling back to one after the server refused
 * the force-delete could trash a booking that had already been paid. A refused
 * rollback keeps the booking for staff to check.
 */
export async function rollbackBooking(
  token: string,
  id: number,
): Promise<BookingRollbackOutcome> {
  const outcome = await forceDeleteOrKeep(() => forceDeleteBooking(token, id));
  if (outcome === "kept" && __DEV__) {
    console.warn("[payments] booking rollback refused or failed, so the booking was kept");
  }
  return outcome;
}
