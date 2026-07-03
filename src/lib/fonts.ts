import {
  Montserrat_100Thin,
  Montserrat_200ExtraLight,
  Montserrat_300Light,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black,
} from "@expo-google-fonts/montserrat";
import { cssInterop } from "nativewind";
import * as React from "react";
import { StyleSheet, type StyleProp, type TextStyle } from "react-native";

/**
 * The Montserrat weights we ship. The object keys double as the registered
 * font-family names, so `useFonts(montserratFonts)` in the root layout makes
 * e.g. `"Montserrat_700Bold"` available as a fontFamily everywhere.
 */
export const montserratFonts = {
  Montserrat_100Thin,
  Montserrat_200ExtraLight,
  Montserrat_300Light,
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
  Montserrat_900Black,
} as const;

/** Map a resolved RN fontWeight onto the matching Montserrat family name. */
const familyForWeight = (weight: unknown): string => {
  switch (String(weight)) {
    case "100":
      return "Montserrat_100Thin";
    case "200":
      return "Montserrat_200ExtraLight";
    case "300":
      return "Montserrat_300Light";
    case "500":
      return "Montserrat_500Medium";
    case "600":
      return "Montserrat_600SemiBold";
    case "700":
    case "bold":
      return "Montserrat_700Bold";
    case "800":
      return "Montserrat_800ExtraBold";
    case "900":
      return "Montserrat_900Black";
    default:
      return "Montserrat_400Regular";
  }
};

/**
 * Given the *already-resolved* style (NativeWind has turned `className` into a
 * style object by the time our wrapper renders), inject the Montserrat family
 * that matches the requested fontWeight. We then clear fontWeight so the
 * platform doesn't synthesize a faux-bold on top of the already-weighted file.
 * An explicit fontFamily on the element is always respected.
 */
const withMontserrat = (style: StyleProp<TextStyle>): StyleProp<TextStyle> => {
  const flat = (StyleSheet.flatten(style) || {}) as TextStyle;
  if (flat.fontFamily) return style;
  const fontFamily = familyForWeight(flat.fontWeight);
  return [{ fontFamily }, style, { fontWeight: undefined }];
};

/** Build a Montserrat-defaulting wrapper around a core RN text component. */
const makeWrapped = (Original: any, displayName: string) => {
  const Wrapped = React.forwardRef<any, any>((props, ref) => {
    let style = props?.style;
    try {
      style = withMontserrat(props?.style);
    } catch {
      style = props?.style;
    }
    return React.createElement(Original, { ...props, style, ref });
  });
  Wrapped.displayName = displayName;
  return Wrapped;
};

/**
 * Make Montserrat the app-wide default for `<Text>`/`<TextInput>` without
 * touching a single screen. Done once, at import time, before the first render.
 *
 * How: RN's `index.js` exposes `Text`/`TextInput` as object-literal getters, and
 * the bundler compiles `<Text/>` to a live `_reactNative.Text` lookup on that
 * same exports object. So we redefine those getters to return wrappers that
 * default to Montserrat, and re-register the wrappers with NativeWind so
 * `className` keeps resolving. We redefine the getter (rather than assign the
 * deep module's `default`, which is a non-configurable getter) and require the
 * package root (not deprecated deep paths).
 */
let patched = false;
export function applyMontserratDefault() {
  if (patched) return;
  patched = true;

  const redefine = (
    RN: any,
    name: "Text" | "TextInput",
    interopConfig: Parameters<typeof cssInterop>[1],
  ) => {
    const descriptor = Object.getOwnPropertyDescriptor(RN, name);
    if (!descriptor || descriptor.configurable === false) return;
    const Original = RN[name]; // invoke the getter → the real component
    if (!Original) return;
    const Wrapped = makeWrapped(Original, name);
    cssInterop(Wrapped as any, interopConfig);
    Object.defineProperty(RN, name, {
      configurable: true,
      enumerable: true,
      get: () => Wrapped,
    });
  };

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RN = require("react-native");
    redefine(RN, "Text", { className: "style" });
    redefine(RN, "TextInput", {
      className: { target: "style", nativeStyleToProp: { textAlign: true } },
    });
  } catch (e) {
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn("[fonts] Montserrat default setup failed:", e);
    }
  }
}
