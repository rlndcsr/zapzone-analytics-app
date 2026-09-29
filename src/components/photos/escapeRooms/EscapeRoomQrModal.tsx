import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { X } from "lucide-react-native";
import { useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { CenterModal } from "../../ui/CenterModal";
import { ActionButton, PRIMARY } from "./kit";

type SvgHandle = { toDataURL: (callback: (data: string) => void) => void };

export type EscapeRoomQr = {
  title: string;
  description: string;
  /** Extra small-print line under the description. */
  note?: string;
  url: string;
  /** File name stem for the saved PNG. */
  fileName: string;
  /** Heading and line printed on the sign; no Print button when absent. */
  print?: { title: string; note: string };
  /**
   * Adds "Open on this device": the app's own check-in screen (which clears
   * itself between guests), for this location and optionally one game.
   */
  openOnDevice?: {
    locationId: number;
    room?: number | null;
    time?: string;
    date?: string;
  };
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "escape-room";

/**
 * The web page's QR dialog (check-in, one game's check-in, or the group photo
 * page): the code, its URL, Download QR, Print sign and Open on this device.
 * Both the download and the sign use the QR's own PNG, so they match.
 */
export function EscapeRoomQrModal({
  qr: requested,
  onClose,
}: {
  qr: EscapeRoomQr | null;
  onClose: () => void;
}) {
  // Keep drawing the last code while the dialog fades out.
  const lastRef = useRef<EscapeRoomQr | null>(null);
  if (requested) lastRef.current = requested;
  const qr = requested ?? lastRef.current;
  const svgRef = useRef<SvgHandle | null>(null);
  const [working, setWorking] = useState<"save" | "print" | null>(null);

  const readPng = () =>
    new Promise<string | null>((resolve) => {
      const handle = svgRef.current;
      if (!handle) return resolve(null);
      handle.toDataURL((data) => resolve(data || null));
    });

  const save = async () => {
    if (!qr || working) return;
    setWorking("save");
    try {
      const base64 = await readPng();
      if (!base64) throw new Error("The QR code could not be read.");
      const FileSystem = await import("expo-file-system/legacy");
      const uri = `${FileSystem.cacheDirectory}${slug(qr.fileName)}-qr.png`;
      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
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
      setWorking(null);
    }
  };

  const print = async () => {
    if (!qr?.print || working) return;
    setWorking("print");
    try {
      const base64 = await readPng();
      if (!base64) throw new Error("The QR code could not be read.");
      const Print = await import("expo-print");
      await Print.printAsync({
        html: `<html><body style="font-family: Arial, Helvetica, sans-serif; text-align: center; padding: 40px; color: #111827;">
<h1 style="font-size: 30px; margin: 0 0 12px;">${escapeHtml(qr.print.title)}</h1>
<p style="font-size: 18px; margin: 0 0 24px;">${escapeHtml(qr.print.note)}</p>
<img src="data:image/png;base64,${base64}" alt="QR code" style="width: 340px; height: 340px;" />
<p style="font-size: 12px; color: #6b7280; word-break: break-all; margin-top: 16px;">${escapeHtml(qr.url)}</p>
</body></html>`,
      });
    } catch (e) {
      Alert.alert(
        "Print failed",
        e instanceof Error ? e.message : "Could not open the print dialog.",
      );
    } finally {
      setWorking(null);
    }
  };

  /** Opens the in-app check-in — the web's `?staff=1` kiosk — not a browser. */
  const openHere = () => {
    const target = qr?.openOnDevice;
    if (!target) return;
    onClose();
    router.push({
      pathname: "/photos/escape-room-kiosk",
      params: {
        locationId: String(target.locationId),
        ...(target.date ? { date: target.date } : {}),
        ...(target.room ? { room: String(target.room) } : {}),
        ...(target.time ? { time: target.time } : {}),
      },
    } as never);
  };

  return (
    <CenterModal visible={requested !== null} onClose={onClose}>
      {qr && (
        <View className="items-center rounded-3xl bg-white p-6 dark:bg-neutral-900">
          <Pressable
            onPress={onClose}
            className="absolute right-4 top-4 z-10 p-1"
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={20} color="#9ca3af" />
          </Pressable>

          <Text className="mt-4 text-center text-lg font-bold text-gray-900 dark:text-white">
            {qr.title}
          </Text>
          <Text className="mt-2 text-center text-sm text-gray-600 dark:text-gray-300">
            {qr.description}
          </Text>
          {!!qr.note && (
            <Text className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
              {qr.note}
            </Text>
          )}

          {/* White plate keeps the code scannable in dark mode. */}
          <View className="my-4 rounded-2xl border border-gray-100 bg-white p-3">
            <QRCode
              value={qr.url}
              size={200}
              quietZone={8}
              backgroundColor="#FFFFFF"
              color="#000000"
              getRef={(handle: SvgHandle | null) => {
                svgRef.current = handle;
              }}
            />
          </View>

          <Text
            selectable
            className="text-center text-xs text-gray-500 dark:text-gray-400"
          >
            {qr.url}
          </Text>

          <View className="mt-4 flex-row flex-wrap justify-center gap-2">
            <ActionButton
              label="Download QR"
              icon="download"
              variant="secondary"
              size="sm"
              loading={working === "save"}
              disabled={working !== null}
              onPress={() => void save()}
            />
            {qr.print && (
              <ActionButton
                label="Print sign"
                icon="printer"
                variant="secondary"
                size="sm"
                loading={working === "print"}
                disabled={working !== null}
                onPress={() => void print()}
              />
            )}
          </View>

          {qr.openOnDevice && (
            <Pressable
              onPress={openHere}
              className="mt-3 flex-row items-center gap-1 py-1"
              accessibilityRole="button"
            >
              <Feather name="tablet" size={15} color={PRIMARY} />
              <Text className="text-sm font-semibold text-[#0644C7]">
                Open on this device
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </CenterModal>
  );
}
