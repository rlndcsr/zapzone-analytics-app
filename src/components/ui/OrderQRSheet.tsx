import { Download, QrCode as QrCodeIcon, X } from "lucide-react-native";
import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { captureRef } from "react-native-view-shot";

import { ticketOrderQrValue } from "../../lib/payments/useQrDataUri";
import { CenterModal } from "./CenterModal";

type Props = {
  visible: boolean;
  onClose: () => void;
  orderId: number;
  referenceNumber: string;
  ticketCount: number;
  customerName: string;
};

/**
 * Order QR overlay — the mobile equivalent of the web TicketOrderDetails
 * "Order QR Code" modal. One code admits the whole order.
 */
export function OrderQRSheet({
  visible,
  onClose,
  orderId,
  referenceNumber,
  ticketCount,
  customerName,
}: Props) {
  const cardRef = useRef<View>(null);
  const [saving, setSaving] = useState(false);

  const value = ticketOrderQrValue(orderId);

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
    <CenterModal
      visible={visible}
      onClose={onClose}
      offscreen={
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
                Order {referenceNumber} · {ticketCount} tickets
              </Text>
            </View>
          </View>
        </View>
      }
    >
      <View className="items-center rounded-3xl bg-white p-6 dark:bg-neutral-900">
        <Pressable
          onPress={onClose}
          className="absolute right-4 top-4 z-10 p-1"
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <X size={20} color="#9ca3af" />
        </Pressable>

        <View className="mb-3 h-11 w-11 items-center justify-center rounded-2xl bg-[#0644C7]/10">
          <QrCodeIcon size={22} color="#0644C7" />
        </View>
        <Text className="text-lg font-bold text-gray-900 dark:text-white">
          Order QR Code
        </Text>

        {/* White plate keeps the QR scannable in dark mode too. */}
        <View className="my-5 rounded-2xl border border-gray-100 bg-white p-4">
          <QRCode
            value={value}
            size={200}
            backgroundColor="#FFFFFF"
            color="#111827"
          />
        </View>

        <View className="mb-4 w-full gap-1.5">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Order
            </Text>
            <Text className="text-sm font-semibold text-gray-900 dark:text-white">
              {referenceNumber}
            </Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Customer
            </Text>
            <Text
              className="ml-3 flex-1 text-right text-sm font-medium text-gray-900 dark:text-white"
              numberOfLines={1}
            >
              {customerName}
            </Text>
          </View>
        </View>

        <Text className="mb-4 text-center text-xs text-gray-500 dark:text-gray-400">
          One code for the whole order — {ticketCount} tickets
        </Text>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          className="w-full flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] py-3 active:opacity-80"
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
    </CenterModal>
  );
}
