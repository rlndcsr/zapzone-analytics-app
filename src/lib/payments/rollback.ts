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
 */

import { forceDeleteAttractionPurchase } from "../../services/attractionPurchasesService";
import { deleteBooking, forceDeleteBooking } from "../../services/bookingsService";
import { forceDeleteEventPurchase } from "../../services/eventPurchasesService";
import {
  forceDeleteThenSoftDelete,
  ROLLBACK_REASON,
} from "./forceDeleteThenSoftDelete";

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
 * Booking rollback for a failed card payment. Tries the permanent force-delete
 * first (a soft delete alone would leave the slot's room looking reserved); if
 * that fails, falls back to an ordinary soft delete with a fixed reason —
 * matching the web's `bookingService.rollbackBooking` — so a force-delete
 * failure (e.g. the booking already has a payment on it) doesn't silently
 * leave an unpaid booking with no trace at all. The reason also skips the
 * interactive change-reason prompt, since nobody is present to answer it here.
 */
export async function rollbackBooking(token: string, id: number): Promise<void> {
  const outcome = await forceDeleteThenSoftDelete(
    () => forceDeleteBooking(token, id),
    () => deleteBooking(token, id, { changeReason: ROLLBACK_REASON }),
  );
  if (outcome === "failed" && __DEV__) {
    console.warn(
      "[payments] booking rollback failed — both force-delete and soft-delete failed",
    );
  }
}
