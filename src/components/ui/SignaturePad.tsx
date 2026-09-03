import { useCallback, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import {
  strokesToSvgDataUri,
  strokeToPath,
  type Point,
  type Stroke,
} from "../../lib/waivers/signaturePath";

/**
 * Draw-with-your-finger signature capture.
 *
 * Built on PanResponder and react-native-svg rather than a native canvas: the
 * app has no rasteriser, and the consumers only need a `data:image/…` string,
 * so strokes are emitted as an SVG data URI.
 *
 * Two callback names are accepted because two screens use this with their own
 * vocabulary — the attraction purchase page (`onSignatureChange`, where the
 * signature is required) and the waiver kiosk (`onChange`, where it is
 * optional because the typed legal name is the binding signature).
 */
export function SignaturePad({
  onChange,
  onSignatureChange,
  required = false,
  error,
  height = 180,
  hint = "Your typed name above is your signature. You may also draw one here.",
}: {
  /** Fires with the SVG data URI, or null once the pad is cleared/empty. */
  onChange?: (dataUri: string | null) => void;
  /** The same callback under the name the purchase page already passes. */
  onSignatureChange?: (dataUri: string | null) => void;
  /** Drops "(optional)" from the placeholder and lets the caller show `error`. */
  required?: boolean;
  /** Validation message rendered beneath the pad. */
  error?: string;
  height?: number;
  hint?: string;
}) {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke>([]);
  const [width, setWidth] = useState(0);

  // The responder is created once, so it reads live values through refs rather
  // than closing over stale state.
  const strokesRef = useRef<Stroke[]>([]);
  const currentRef = useRef<Stroke>([]);
  const widthRef = useRef(0);

  const emit = useCallback(
    (all: Stroke[]) => {
      const uri = strokesToSvgDataUri(all, widthRef.current, height);
      onChange?.(uri);
      onSignatureChange?.(uri);
    },
    [onChange, onSignatureChange, height],
  );

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        // Hold the gesture once it starts, so a scrolling parent cannot steal
        // the stroke halfway through a signature.
        onPanResponderTerminationRequest: () => false,

        onPanResponderGrant: (e) => {
          const p: Point = {
            x: e.nativeEvent.locationX,
            y: e.nativeEvent.locationY,
          };
          currentRef.current = [p];
          setCurrent([p]);
        },
        onPanResponderMove: (e) => {
          const p: Point = {
            x: e.nativeEvent.locationX,
            y: e.nativeEvent.locationY,
          };
          currentRef.current = [...currentRef.current, p];
          setCurrent(currentRef.current);
        },
        onPanResponderRelease: () => {
          if (currentRef.current.length === 0) return;
          const all = [...strokesRef.current, currentRef.current];
          strokesRef.current = all;
          currentRef.current = [];
          setStrokes(all);
          setCurrent([]);
          emit(all);
        },
      }),
    [emit],
  );

  const clear = () => {
    strokesRef.current = [];
    currentRef.current = [];
    setStrokes([]);
    setCurrent([]);
    onChange?.(null);
    onSignatureChange?.(null);
  };

  const drawn = strokes.length > 0 || current.length > 0;

  return (
    <View>
      <View
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          widthRef.current = w;
          setWidth(w);
        }}
        {...responder.panHandlers}
        style={{ height }}
        className={`items-center justify-center overflow-hidden rounded-xl border bg-gray-50 dark:bg-neutral-800 ${
          error
            ? "border-red-400"
            : "border-gray-200 dark:border-neutral-700"
        }`}
      >
        {width > 0 && (
          <Svg width={width} height={height} style={{ position: "absolute" }}>
            {[...strokes, current].map((s, i) =>
              s.length ? (
                <Path
                  key={i}
                  d={strokeToPath(s)}
                  stroke="#111827"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              ) : null,
            )}
          </Svg>
        )}
        {!drawn && (
          <Text className="text-sm text-gray-400 dark:text-gray-500">
            {required ? "Sign here" : "Sign here (optional)"}
          </Text>
        )}
      </View>

      <View className="mt-2 flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-xs text-gray-500 dark:text-gray-400">
          {hint}
        </Text>
        {drawn && (
          <Pressable
            onPress={clear}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear signature"
          >
            <Text className="text-xs font-semibold text-[#0644C7]">Clear</Text>
          </Pressable>
        )}
      </View>

      {error ? <Text className="mt-1 text-xs text-red-500">{error}</Text> : null}
    </View>
  );
}
