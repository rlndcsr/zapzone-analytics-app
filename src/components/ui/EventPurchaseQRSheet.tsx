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

import type { EventPurchaseStatus } from "../../services/eventPurchasesService";
import { StatusBadge } from "./StatusBadge";

type Props = {
  visible: boolean;
  onClose: () => void;
  purchaseId: number;
  /** Event ticket reference number — the value encoded in the QR. */
  reference: string;
  customerName: string;
  eventName: string;
  status: EventPurchaseStatus;
};

/**
 * Internal QR overlay for an event ticket — the mobile equivalent of a
 * "View QR Code" action. Encodes the ticket `reference_number` (events are
 * identified by reference, unlike attraction purchases) and saves a framed card
 * to the gallery (reuses the BookingQRModal capture pattern). No browser.
 */
export function EventPurchaseQRSheet({
  visible,
  onClose,
  purchaseId,
  reference,
  customerName,
  eventName,
  status,
}: Props) {
  const cardRef = useRef<View>(null);
  const [saving, setSaving] = useState(false);

  // Reference number is the scannable value; fall back to the id if absent.
  const value = reference || `event-purchase-${purchaseId}`;

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const uri = await captureRef(cardRef, {
        format: "png",
        quality: 1,
        result: "tmpfile",
      });
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
            Event Ticket QR Code
          </Text>

          {/* White plate keeps the QR scannable in dark mode too. */}
          <View className="bg-white rounded-2xl p-4 my-5 border border-gray-100">
            <QRCode
              value={value}
              size={200}
              backgroundColor="#FFFFFF"
              color="#111827"
            />
          </View>

          <View className="w-full gap-1.5 mb-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Reference
              </Text>
              <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                {reference || `#${purchaseId}`}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Customer
              </Text>
              <Text
                className="text-sm font-medium text-gray-900 dark:text-white flex-1 text-right ml-3"
                numberOfLines={1}
              >
                {customerName}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Event
              </Text>
              <Text
                className="text-sm font-medium text-gray-900 dark:text-white flex-1 text-right ml-3"
                numberOfLines={1}
              >
                {eventName}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                Status
              </Text>
              <StatusBadge status={status} />
            </View>
          </View>

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

        {/* Off-screen: the framed image that gets saved. */}
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
                value={value}
                size={240}
                backgroundColor="#FFFFFF"
                color="#111827"
              />
              <Text style={{ marginTop: 24, fontSize: 14, color: "#374151" }}>
                {reference ? `Ref: ${reference}` : `Purchase #${purchaseId}`}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
