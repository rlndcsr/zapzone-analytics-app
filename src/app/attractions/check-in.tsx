import { Redirect } from "expo-router";

/**
 * Attraction ticket check-in used to live here. Its scanner ran `/\d+/` over
 * any payload, so a membership token or a photo link resolved to whichever
 * attraction purchase happened to share those digits — a stranger's ticket.
 *
 * The unified desk at `/check-in` refuses anything it cannot identify. This
 * route stays as a redirect so existing links still land somewhere correct.
 */
export default function AttractionCheckInRedirect() {
  return <Redirect href="/check-in" />;
}
