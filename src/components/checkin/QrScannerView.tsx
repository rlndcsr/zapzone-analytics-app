import { Feather } from "@expo/vector-icons";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { useCallback } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";

const PRIMARY = "#0644C7";

// Soft blue lift for the permission action button.
const BUTTON_SHADOW = {
  shadowColor: PRIMARY,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.25,
  shadowRadius: 8,
  elevation: 4,
} as const;

type QrScannerViewProps = {
  /** When false, scanned codes are ignored (camera stays mounted/warm). */
  active: boolean;
  /** Called with the raw decoded string of a scanned QR code. */
  onScan: (data: string) => void;
};

/** Centered card used for the permission / loading states. */
function StateCard({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <View className="aspect-square w-full items-center justify-center rounded-3xl border border-gray-100 bg-white px-6 dark:border-neutral-800 dark:bg-neutral-900">
      <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-[#0644C7]/10">
        <Feather name={icon} size={26} color={PRIMARY} />
      </View>
      <Text className="text-center text-base font-bold text-gray-900 dark:text-white">
        {title}
      </Text>
      <Text className="mt-1.5 text-center text-sm text-gray-500 dark:text-gray-400">
        {body}
      </Text>
      {children}
    </View>
  );
}

/**
 * QR scanner surface backed by expo-camera's CameraView. Owns camera-permission
 * handling (request + "open settings" fallback) so the screen only cares about
 * decoded values. Only QR barcodes are scanned; `active` gates the callback so
 * the flow can pause scanning without tearing the camera down.
 */
export function QrScannerView({ active, onScan }: QrScannerViewProps) {
  const [permission, requestPermission] = useCameraPermissions();

  const handleBarcode = useCallback(
    (result: BarcodeScanningResult) => {
      if (result?.data) onScan(result.data);
    },
    [onScan],
  );

  // Permission state still resolving on first mount.
  if (!permission) {
    return (
      <StateCard
        icon="camera"
        title="Preparing camera"
        body="Just a moment…"
      >
        <ActivityIndicator className="mt-4" color={PRIMARY} />
      </StateCard>
    );
  }

  if (!permission.granted) {
    // canAskAgain === false means the OS won't show the prompt again; send the
    // user to Settings instead of firing a request that would silently no-op.
    const canAsk = permission.canAskAgain;
    return (
      <StateCard
        icon="camera-off"
        title="Camera access needed"
        body={
          canAsk
            ? "Allow camera access to scan ticket QR codes."
            : "Enable camera access for ZapZone in your device settings to scan tickets."
        }
      >
        <Pressable
          onPress={canAsk ? requestPermission : Linking.openSettings}
          className="mt-6 h-14 flex-row items-center justify-center self-stretch rounded-full bg-[#0644C7] px-6 active:opacity-90"
          style={BUTTON_SHADOW}
          accessibilityRole="button"
          accessibilityLabel={canAsk ? "Allow camera access" : "Open settings"}
        >
          <Feather
            name={canAsk ? "camera" : "settings"}
            size={18}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <Text
            numberOfLines={1}
            className="text-base font-semibold text-white"
          >
            {canAsk ? "Allow Camera Access" : "Open Settings"}
          </Text>
        </Pressable>
      </StateCard>
    );
  }

  return (
    <View className="aspect-square w-full overflow-hidden rounded-3xl bg-black">
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={active ? handleBarcode : undefined}
      />

      {/* Framing overlay — corner brackets to guide aim. */}
      <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
        <View className="h-3/5 w-3/5">
          <View className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-white" />
          <View className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-white" />
          <View className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-white" />
          <View className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-white" />
        </View>
      </View>
    </View>
  );
}
