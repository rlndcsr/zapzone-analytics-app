import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

const COLORS = [
  "#2563eb",
  "#facc15",
  "#10b981",
  "#f97316",
  "#ec4899",
  "#8b5cf6",
  "#ef4444",
];
const DURATION_MS = 2800;
const FADE_MS = 700;
const FRAME_MS = 16.67;
const GRAVITY = 0.32;
const DRAG = 0.985;

type Piece = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
  round: boolean;
};

const launch = (width: number, height: number, count: number): Piece[] =>
  Array.from({ length: count }, (_, index) => {
    const direction = index % 2 === 0 ? 1 : -1;
    const speed = height * (0.018 + Math.random() * 0.012);
    const spread = 0.3 + Math.random() * 0.55;
    return {
      x: direction === 1 ? width * 0.06 : width * 0.94,
      y: height * 0.98,
      vx: direction * Math.sin(spread) * speed,
      vy: -Math.cos(spread) * speed,
      size: 6 + Math.random() * 7,
      rotation: Math.random() * 180,
      spin: (Math.random() - 0.5) * 20,
      color: COLORS[index % COLORS.length],
      round: index % 5 === 0,
    };
  });

const ConfettiPiece = ({
  piece,
  progress,
}: {
  piece: Piece;
  progress: SharedValue<number>;
}) => {
  const style = useAnimatedStyle(() => {
    const elapsed = progress.value * DURATION_MS;
    const frames = elapsed / FRAME_MS;
    const travel = (1 - Math.pow(DRAG, frames)) / (1 - DRAG);
    const x = piece.x + piece.vx * travel;
    const y =
      piece.y + piece.vy * travel + (GRAVITY * (frames - travel)) / (1 - DRAG);
    const fade =
      elapsed > DURATION_MS - FADE_MS
        ? Math.max(0, (DURATION_MS - elapsed) / FADE_MS)
        : 1;
    return {
      opacity: fade,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${piece.rotation + piece.spin * frames * 0.1}deg` },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        {
          width: piece.size,
          height: piece.round ? piece.size * 0.8 : piece.size * 0.6,
          borderRadius: piece.round ? piece.size : 1,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
};

/** A short confetti burst over its parent (web celebrate()); nothing at all under reduced motion. */
export function Confetti() {
  const reduceMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const [done, setDone] = useState(false);
  const pieces = useMemo(
    () => launch(width, height, width < 640 ? 70 : 120),
    [width, height],
  );

  useEffect(() => {
    if (reduceMotion) return;
    progress.value = withTiming(1, {
      duration: DURATION_MS,
      easing: Easing.linear,
    });
    const timer = setTimeout(() => setDone(true), DURATION_MS + 50);
    return () => clearTimeout(timer);
  }, [progress, reduceMotion]);

  if (reduceMotion || done) return null;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      {pieces.map((piece, index) => (
        <ConfettiPiece key={index} piece={piece} progress={progress} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { position: "absolute", left: 0, top: 0 },
});
