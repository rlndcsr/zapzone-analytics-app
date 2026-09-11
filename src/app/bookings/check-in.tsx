import { Redirect } from "expo-router";

/**
 * Package-booking check-in used to live here, with its own scanner lifecycle
 * and its own QR dialect. That dialect read any JSON `id` as a booking id, so
 * scanning an attraction ticket loaded a different guest's booking and offered
 * to check them in.
 *
 * There is now one desk at `/check-in` that identifies every code by its
 * declared shape. This route stays as a redirect so existing links, deep links
 * and push notifications still land somewhere correct.
 */
export default function BookingCheckInRedirect() {
  return <Redirect href="/check-in" />;
}
