import { Redirect } from "expo-router";

/**
 * Membership check-in used to live here as a third copy of the same scanner
 * lifecycle. The unified desk at `/check-in` reads member tokens alongside
 * every other code, so this route stays only as a redirect.
 */
export default function MembershipCheckInRedirect() {
  return <Redirect href="/check-in" />;
}
