import * as SecureStore from "expo-secure-store";
import { colorScheme } from "nativewind";

const THEME_KEY = "zapzone_theme";

export type ThemePref = "light" | "dark";

/** Read the saved theme preference; defaults to light when unset/unavailable. */
export async function loadTheme(): Promise<ThemePref> {
  try {
    const stored = await SecureStore.getItemAsync(THEME_KEY);
    return stored === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/** Persist the theme preference (best-effort). */
export async function saveTheme(pref: ThemePref): Promise<void> {
  try {
    await SecureStore.setItemAsync(THEME_KEY, pref);
  } catch {
    // Secure storage unavailable — preference holds for this run only.
  }
}

/** Apply the stored preference to NativeWind. Call once on launch. */
export async function applyStoredTheme(): Promise<void> {
  const pref = await loadTheme();
  colorScheme.set(pref);
}
