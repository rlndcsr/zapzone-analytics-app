import { Download, QrCode as QrCodeIcon, X } from "lucide-react-native";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { captureRef } from "react-native-view-shot";

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The value encoded in the QR (the booking reference number). */
  reference: string;
  /** Optional context line shown under the title (e.g. customer • package). */
  subtitle?: string;
};

/**
 * QR overlay for a booking. Renders the reference as a scannable QR code and
 * saves a framed card (QR + reference number) to the device gallery.
 */
export function BookingQRModal({ visible, onClose, reference, subtitle }: Props) {
  // Off-screen card that becomes the downloaded image (captured as a PNG).
  const cardRef = useRef<View>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Capture the framed card (QR + reference) exactly as designed.
      const uri = await captureRef(cardRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });

      // Lazy-import so expo-media-library's Expo Go notice never fires at load.
      // saveToLibraryAsync writes straight to MediaStore and, on Android 13+,
      // needs no runtime permission — so it works in Expo Go too. Older Android
      // needs WRITE_EXTERNAL_STORAGE, so request it and retry only if needed.
      const MediaLibrary = await import("expo-media-library");
      try {
        await MediaLibrary.saveToLibraryAsync(uri);
      } catch {
        const perm = await MediaLibrary.requestPermissionsAsync(true);
        if (!perm.granted) {
          Alert.alert(
            "Permission needed",
            "Allow photo access so the QR code can be saved to your gallery.",
          );
          return;
        }
        await MediaLibrary.saveToLibraryAsync(uri);
      }
      Alert.alert("Saved", "The QR code was saved to your gallery.");
    } catch (e) {
      Alert.alert(
        "Save failed",
        e instanceof Error ? e.message : "Could not save the QR code.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: "rgba(20,20,20,0.6)" }}
      >
        <Pressable className="absolute inset-0" onPress={onClose} />

        <View className="w-full max-w-sm bg-white dark:bg-neutral-900 rounded-3xl p-6 items-center">
          <Pressable
            onPress={onClose}
            className="absolute right-4 top-4 p-1 z-10"
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={20} color="#9ca3af" />
          </Pressable>

          <View className="w-11 h-11 rounded-2xl bg-[#0644C7]/10 items-center justify-center mb-3">
            <QrCodeIcon size={22} color="#0644C7" />
          </View>
          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            Booking QR Code
          </Text>
          {subtitle ? (
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 text-center">
              {subtitle}
            </Text>
          ) : null}

          {/* White plate keeps the QR scannable in dark mode too. */}
          <View className="bg-white rounded-2xl p-4 my-5 border border-gray-100">
            <QRCode
              value={reference}
              size={200}
              backgroundColor="#FFFFFF"
              color="#111827"
            />
          </View>

          <Text className="text-xs text-gray-400 dark:text-gray-500 mb-4">
            {reference}
          </Text>

          <Pressable
            onPress={handleSave}
            disabled={saving}
            className="w-full py-3 rounded-xl bg-[#0644C7] items-center flex-row justify-center gap-2 active:opacity-80"
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Download size={16} color="#fff" />
                <Text className="text-sm font-semibold text-white">
                  Save to Gallery
                </Text>
              </>
            )}
          </Pressable>
        </View>

        {/* Off-screen: the exact image that gets saved (dark frame + white card
            with the QR and reference number). Kept laid out but out of view. */}
        <View
          ref={cardRef}
          collapsable={false}
          pointerEvents="none"
          style={{ position: "absolute", left: -10000, top: 0 }}
        >
          <View style={{ backgroundColor: "#1e2430", padding: 28 }}>
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 20,
                paddingVertical: 32,
                paddingHorizontal: 32,
                alignItems: "center",
              }}
            >
              <QRCode
                value={reference}
                size={240}
                backgroundColor="#FFFFFF"
                color="#111827"
              />
              <Text
                style={{
                  marginTop: 24,
                  fontSize: 14,
                  color: "#374151",
                }}
              >
                Reference: {reference}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
