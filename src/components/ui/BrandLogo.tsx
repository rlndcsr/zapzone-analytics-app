import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { mediaUrl } from "../../lib/api";

const DEFAULT_LOGO = require("../../../assets/zapzone-assests/zapzone.png");

/** Web parity: every logo renders in one fixed 5:2 box, never stretched. */
const BOX_RATIO = 2.5;

export type BrandLogoSize = "xs" | "sm" | "md" | "lg";

const HEIGHTS: Record<BrandLogoSize, number> = {
  xs: 24,
  sm: 32,
  md: 44,
  lg: 60,
};

type BrandLogoProps = {
  /** Raw storage path (e.g. a location/company `logo_path`) or null/undefined for the bundled default. */
  src?: string | null;
  size?: BrandLogoSize;
  className?: string;
};

/**
 * The one place a brand logo renders: a fixed 5:2 box with `contain` fitting
 * (portrait and landscape marks stay fully visible, never stretched/cropped),
 * falling back to the bundled ZapZone mark when there's no configured logo or
 * the remote image fails to load.
 */
export function BrandLogo({ src, size = "md", className }: BrandLogoProps) {
  const resolved = src ? mediaUrl(src) : null;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  const height = HEIGHTS[size];
  const width = Math.round(height * BOX_RATIO);

  return (
    <View style={{ width, height }} className={className}>
      <Image
        source={!resolved || failed ? DEFAULT_LOGO : { uri: resolved }}
        style={{ width: "100%", height: "100%" }}
        contentFit="contain"
        onError={() => setFailed(true)}
        accessibilityRole="image"
        accessibilityLabel="Company logo"
      />
    </View>
  );
}
