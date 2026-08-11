import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  Text,
  View,
} from "react-native";

/** Mirrors the web `usePhotoCamera` states the capture screen reacts to. */
export type PhotoCameraState = "starting" | "live" | "denied" | "unavailable";

type Props = {
  cameraRef: RefObject<CameraView | null>;
  onStateChange: (state: PhotoCameraState) => void;
  retryToken: number;
};

export function PhotoCameraView({
  cameraRef,
  onStateChange,
  retryToken,
}: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mountFailed, setMountFailed] = useState(false);
  const [pictureSize, setPictureSize] = useState<string | undefined>();

  const denied = permission != null && !permission.granted;
  const state: PhotoCameraState = mountFailed
    ? "unavailable"
    : denied
      ? "denied"
      : "starting";

  // "live" is reported by onCameraReady instead — the preview is not usable
  // until the native session actually starts.
  useEffect(() => {
    onStateChange(state);
  }, [state, onStateChange]);

  const lastRetry = useRef(retryToken);
  useEffect(() => {
    if (retryToken === lastRetry.current) return;
    lastRetry.current = retryToken;
    setMountFailed(false);
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [retryToken, permission, requestPermission]);

  if (!permission) {
    return (
      <View className="aspect-[4/3] w-full items-center justify-center rounded-2xl bg-black">
        <ActivityIndicator color="#FFFFFF" />
        <Text className="mt-3 text-sm text-gray-300">Preparing camera…</Text>
      </View>
    );
  }

  if (denied || mountFailed) {
    const canAsk = permission.canAskAgain && !mountFailed;
    return (
      <View className="aspect-[4/3] w-full items-center justify-center rounded-2xl bg-gray-900 px-6">
        <Feather name="alert-triangle" size={30} color="#FBBF24" />
        <Text className="mt-2 text-base font-bold text-white">
          Camera unavailable
        </Text>
        <Text className="mt-1 max-w-xs text-center text-sm text-gray-300">
          {mountFailed
            ? "The camera could not be opened. Please try again."
            : canAsk
              ? "Allow camera access to take the customer's photo."
              : "Camera access is blocked. Enable it for ZapZone in your device settings, then try again."}
        </Text>
        <Text className="mt-2 text-center text-sm text-gray-300">
          You can still upload a photo from this device.
        </Text>

        {!mountFailed && (
          <Pressable
            onPress={
              canAsk ? () => void requestPermission() : Linking.openSettings
            }
            className="mt-5 flex-row items-center gap-2 rounded-full bg-[#0644C7] px-6 py-3 active:opacity-90"
            accessibilityRole="button"
            accessibilityLabel={
              canAsk ? "Allow camera access" : "Open settings"
            }
          >
            <Feather
              name={canAsk ? "camera" : "settings"}
              size={16}
              color="#FFFFFF"
            />
            <Text className="text-sm font-semibold text-white">
              {canAsk ? "Allow Camera Access" : "Open Settings"}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  // Match the web's 1920x1080 capture request: a full-resolution sensor frame
  // would be several megabytes of base64 on the wire for no visible gain.
  const handleReady = async () => {
    onStateChange("live");
    if (pictureSize) return;
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      const best = pickCaptureSize(sizes ?? []);
      if (best) setPictureSize(best);
    } catch {
      // Not supported on this platform — the default size is used.
    }
  };

  return (
    <View className="aspect-[4/3] w-full overflow-hidden rounded-2xl bg-black">
      <CameraView
        key={retryToken}
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
        pictureSize={pictureSize}
        onCameraReady={() => void handleReady()}
        onMountError={() => setMountFailed(true)}
      />
    </View>
  );
}

/** Smallest offered size at or above ~2MP, falling back to the largest. */
function pickCaptureSize(sizes: string[]): string | undefined {
  const parsed = sizes
    .map((size) => {
      const [w, h] = size.split("x").map(Number);
      return { size, area: w * h };
    })
    .filter((s) => Number.isFinite(s.area) && s.area > 0)
    .sort((a, b) => a.area - b.area);

  if (parsed.length === 0) return undefined;
  return (
    parsed.find((s) => s.area >= 1_800_000)?.size ??
    parsed[parsed.length - 1].size
  );
}
