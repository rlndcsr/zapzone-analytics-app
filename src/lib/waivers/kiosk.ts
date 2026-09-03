import { router } from "expo-router";
import { Alert } from "react-native";

import {
  createKioskSession,
  type KioskSourceType,
} from "../../services/waiversService";
import { getToken } from "../session";

/**
 * Open the waiver kiosk for a booking / attraction purchase / event purchase.
 *
 * Asks the backend for a prefilled session bound to the record — exactly as the
 * web `WaiverConnectionPanel.launchKiosk` does — then opens the kiosk **inside
 * the app** rather than handing the customer a browser. The session still has
 * to come from the API: the kiosk is keyed by access token, so there is no
 * client-side path that can be built from an entity id.
 *
 * Every staff role may launch it — company_admin, admin, location_manager and
 * attendant all pass the backend's `guardStaff` on POST /waivers/kiosk-session,
 * so there is no role gate here or at any call site (web parity).
 *
 * Failures the backend reports (no template assigned to the activity,
 * out-of-scope record) surface as an Alert; resolves to whether the kiosk
 * opened.
 */
export async function launchKioskSession(
  sourceType: KioskSourceType,
  sourceId: number,
): Promise<boolean> {
  const token = getToken();
  if (!token) {
    Alert.alert("Not signed in", "Sign in again to open the waiver kiosk.");
    return false;
  }
  try {
    const session = await createKioskSession(token, sourceType, sourceId);

    if (session.alreadyCompleted) {
      Alert.alert(
        "Already signed",
        "This waiver has already been completed for the booking date.",
      );
      return false;
    }

    // The screen addresses the public endpoints by token, so a session whose
    // URL we cannot parse is a hard stop — better than opening a blank form.
    if (!session.accessToken) {
      throw new Error("No kiosk session was returned for this record.");
    }

    router.push({
      pathname: "/waivers/kiosk",
      params: { token: session.accessToken },
    });
    return true;
  } catch (e) {
    Alert.alert(
      "Unable to open kiosk",
      e instanceof Error ? e.message : "Could not open the waiver kiosk.",
    );
    return false;
  }
}
