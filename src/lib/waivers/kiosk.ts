import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";

import {
  createKioskSession,
  type KioskSourceType,
} from "../../services/waiversService";
import { getToken } from "../session";

/**
 * Open the waiver kiosk for a booking / attraction purchase / event purchase.
 *
 * Mirrors the web `WaiverConnectionPanel.launchKiosk`: ask the backend for a
 * prefilled session bound to the record, then open the returned
 * `/waiver/kiosk-session/{token}` page. The URL must come from the API — the
 * kiosk routes are keyed by access token, so there is no client-side path we
 * can build from an entity id.
 *
 * Failures the backend reports (no template assigned to the activity, attendant
 * role, out-of-scope record) surface as an Alert; resolves to whether the kiosk
 * was opened.
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
    if (!session.kioskUrl) {
      throw new Error("No kiosk session was returned for this record.");
    }
    await WebBrowser.openBrowserAsync(session.kioskUrl);
    return true;
  } catch (e) {
    Alert.alert(
      "Unable to open kiosk",
      e instanceof Error ? e.message : "Could not open the waiver kiosk.",
    );
    return false;
  }
}
