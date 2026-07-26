import { useCallback, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";

const CANVAS_HEIGHT = 200;

/**
 * Finger-drawn signature capture — the mobile counterpart of the web
 * `SignatureCapture`. Strokes are SVG paths (react-native-svg) and the finished
 * drawing is exported as a `data:image/png;base64,...` string via
 * react-native-view-shot, the same format the web canvas `toDataURL` produces,
 * so the API receives an identical `signature_image`. Undo drops the last
 * stroke, Reset clears everything — both mirroring the web buttons.
 */
export function SignaturePad({
  onSignatureChange,
  required = true,
  error,
}: {
  /** Receives the PNG data URL, or null when the pad is empty. */
  onSignatureChange: (signatureBase64: string | null) => void;
  required?: boolean;
  error?: string;
}) {
  const canvasRef = useRef<View>(null);
  const [strokes, setStrokes] = useState<string[]>([]);
  const [current, setCurrent] = useState<string>("");
  const pointsRef = useRef<string>("");
  const widthRef = useRef(0);

  const onLayout = (e: LayoutChangeEvent) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  // Capture after the stroke has painted, so the PNG includes it.
  const emit = useCallback(
    (nextStrokes: string[]) => {
      if (nextStrokes.length === 0) {
        onSignatureChange(null);
        return;
      }
      requestAnimationFrame(async () => {
        try {
          const base64 = await captureRef(canvasRef, {
            format: "png",
            quality: 1,
            result: "base64",
          });
          onSignatureChange(`data:image/png;base64,${base64}`);
        } catch {
          onSignatureChange(null);
        }
      });
    },
    [onSignatureChange],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          pointsRef.current = `M${locationX.toFixed(2)},${locationY.toFixed(2)}`;
          setCurrent(pointsRef.current);
        },
        onPanResponderMove: (e) => {
          const { locationX, locationY } = e.nativeEvent;
          pointsRef.current += ` L${locationX.toFixed(2)},${locationY.toFixed(2)}`;
          setCurrent(pointsRef.current);
        },
        onPanResponderRelease: () => {
          const stroke = pointsRef.current;
          pointsRef.current = "";
          setCurrent("");
          if (!stroke) return;
          setStrokes((prev) => {
            const next = [...prev, stroke];
            emit(next);
            return next;
          });
        },
      }),
    [emit],
  );

  const handleUndo = () => {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      emit(next);
      return next;
    });
  };

  const handleReset = () => {
    pointsRef.current = "";
    setCurrent("");
    setStrokes([]);
    onSignatureChange(null);
  };

  const paths = current ? [...strokes, current] : strokes;

  return (
    <View>
      <Text className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
        Signature
        {required ? <Text className="text-red-500"> *</Text> : null}
      </Text>

      <View
        ref={canvasRef}
        collapsable={false}
        onLayout={onLayout}
        {...panResponder.panHandlers}
        style={{ height: CANVAS_HEIGHT }}
        className={`rounded-xl border-2 border-dashed bg-white overflow-hidden ${
          error ? "border-red-400" : "border-gray-300 dark:border-neutral-600"
        }`}
      >
        <Svg width="100%" height={CANVAS_HEIGHT}>
          {paths.map((d, i) => (
            <Path
              key={i}
              d={d}
              stroke="#000000"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
        </Svg>
      </View>

      <View className="flex-row items-center justify-between mt-2">
        <Text className="text-xs text-gray-400 dark:text-gray-500 flex-1 mr-3">
          Use your finger to draw your signature above.
        </Text>
        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={handleUndo}
            className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 active:opacity-70"
          >
            <Text className="text-xs font-medium text-blue-600 dark:text-blue-400">
              Undo
            </Text>
          </Pressable>
          <Pressable
            onPress={handleReset}
            className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 active:opacity-70"
          >
            <Text className="text-xs font-medium text-red-600 dark:text-red-400">
              Reset
            </Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <Text className="text-xs text-red-500 mt-1.5">{error}</Text>
      ) : null}
    </View>
  );
}
