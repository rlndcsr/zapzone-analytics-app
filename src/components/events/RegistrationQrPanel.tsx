import { Feather } from "@expo/vector-icons";
import { useRef, useState, type ComponentProps } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import {
  fileSlug,
  kioskUrl,
  locationDisplayName,
  previewUrl,
  signDateLine,
} from "../../lib/registrationForms/registrationForms";
import type { RegistrationFormRow } from "../../services/registrationFormsService";
import type { ToastType } from "../ui/Toast";

const PRIMARY = "#0644C7";

/** The web's download/print resolution. */
const PRINT_SIZE = 1024;

type SvgHandle = { toDataURL: (callback: (data: string) => void) => void };

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const PanelButton = ({
  label,
  icon,
  loading,
  disabled,
  onPress,
}: {
  label: string;
  icon: ComponentProps<typeof Feather>["name"];
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:opacity-70 ${
      disabled ? "opacity-50" : ""
    }`}
  >
    {loading ? (
      <ActivityIndicator size="small" color={PRIMARY} />
    ) : (
      <Feather name={icon} size={14} color={PRIMARY} />
    )}
    <Text
      numberOfLines={1}
      className="shrink-0 text-xs font-semibold text-gray-700 dark:text-gray-200"
    >
      {label}
    </Text>
  </Pressable>
);

export function RegistrationQrPanel({
  form,
  onNotify,
}: {
  form: RegistrationFormRow;
  onNotify: (message: string, type: ToastType) => void;
}) {
  // A hidden full-size copy, so the saved and printed code is sharp.
  const printRef = useRef<SvgHandle | null>(null);
  const [busy, setBusy] = useState<"save" | "print" | null>(null);
  const kiosk = kioskUrl(form.publicUrl);

  const readPng = () =>
    new Promise<string | null>((resolve) => {
      const handle = printRef.current;
      if (!handle) return resolve(null);
      handle.toDataURL((data) => resolve(data || null));
    });

  const copy = async (value: string, done: string) => {
    try {
      const Clipboard = await import("expo-clipboard");
      await Clipboard.setStringAsync(value);
      onNotify(done, "success");
    } catch {
      onNotify(
        "The link could not be copied. Press and hold it to select it.",
        "info",
      );
    }
  };

  const save = async () => {
    if (busy) return;
    setBusy("save");
    try {
      const base64 = await readPng();
      if (!base64) throw new Error();
      const FileSystem = await import("expo-file-system/legacy");
      const uri = `${FileSystem.cacheDirectory}${fileSlug(form.name, "registration-form")}-qr.png`;
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
      onNotify("QR code saved to your gallery", "success");
    } catch {
      onNotify("The QR code could not be created. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const print = async () => {
    if (busy) return;
    setBusy("print");
    try {
      const base64 = await readPng();
      if (!base64) throw new Error();
      const where = [
        signDateLine(form),
        form.locationName ? locationDisplayName(form.locationName) : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const Print = await import("expo-print");
      await Print.printAsync({
        html: `<html><body style="font-family: Arial, Helvetica, sans-serif; text-align: center; padding: 40px; color: #111827;">
<h1 style="font-size: 30px; margin: 0 0 12px;">${escapeHtml(form.name)}</h1>
<p style="font-size: 18px; margin: 0 0 8px;">Scan to register</p>
<p style="font-size: 18px; margin: 0 0 8px;">${escapeHtml(where)}</p>
<img src="data:image/png;base64,${base64}" alt="QR code" style="width: 360px; height: 360px; margin-top: 16px;" />
<p style="font-size: 12px; color: #6b7280; word-break: break-all; margin-top: 16px;">${escapeHtml(form.publicUrl)}</p>
</body></html>`,
      });
    } catch {
      onNotify("The QR code could not be created. Please try again.", "error");
    } finally {
      setBusy(null);
    }
  };

  const preview = async () => {
    const WebBrowser = await import("expo-web-browser");
    void WebBrowser.openBrowserAsync(previewUrl(form.publicUrl));
  };

  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 border border-gray-100 dark:border-neutral-800">
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: -10000, top: 0, opacity: 0 }}
      >
        <QRCode
          value={form.publicUrl}
          size={PRINT_SIZE}
          quietZone={32}
          ecl="M"
          backgroundColor="#FFFFFF"
          color="#000000"
          getRef={(handle: SvgHandle | null) => {
            printRef.current = handle;
          }}
        />
      </View>

      <Text className="text-base font-semibold text-gray-900 dark:text-white">
        QR code and link
      </Text>
      <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
        Guests scan this code to open this form on their phone. It never
        changes, even if you rename the form.
      </Text>

      {/* White plate keeps the code scannable in dark mode. */}
      <View className="self-center my-4 rounded-2xl border border-gray-100 bg-white p-3">
        <QRCode
          value={form.publicUrl}
          size={176}
          quietZone={8}
          ecl="M"
          backgroundColor="#FFFFFF"
          color="#000000"
        />
      </View>

      <View className="flex-row items-center gap-2">
        <Text
          selectable
          numberOfLines={2}
          className="flex-1 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 px-3 py-2 text-xs text-gray-700 dark:text-gray-300"
        >
          {form.publicUrl}
        </Text>
        <Pressable
          onPress={() => void copy(form.publicUrl, "Link copied")}
          accessibilityRole="button"
          accessibilityLabel="Copy link"
          className="flex-row items-center gap-1.5 px-3 py-2.5 rounded-xl bg-[#0644C7] active:opacity-90"
        >
          <Feather name="copy" size={14} color="#FFFFFF" />
          <Text className="text-xs font-semibold text-white">Copy</Text>
        </Pressable>
      </View>

      <View className="flex-row gap-2 mt-3">
        <PanelButton
          label="Save QR"
          icon="download"
          loading={busy === "save"}
          disabled={busy !== null}
          onPress={() => void save()}
        />
        <PanelButton
          label="Print sign"
          icon="printer"
          loading={busy === "print"}
          disabled={busy !== null}
          onPress={() => void print()}
        />
        <PanelButton
          label="Preview"
          icon="eye"
          onPress={() => void preview()}
        />
      </View>
      {/* Web 64a9eee previews only for a browser signed in to the admin; the app's browser usually isn't. */}
      <Text className="text-xs text-gray-400 dark:text-gray-500 mt-2">
        {
          "Preview shows exactly what guests see but never saves a registration. It opens in your browser and only previews when you're signed in to the ZapZone admin there; otherwise it shows a note and the real form."
        }
      </Text>

      <View className="mt-4 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800 p-3 gap-2">
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-2 flex-1">
            <Feather name="tablet" size={15} color="#6B7280" />
            <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
              Sign-up tablet at the venue
            </Text>
          </View>
          <Pressable
            onPress={() => void copy(kiosk, "Kiosk link copied")}
            accessibilityRole="button"
            accessibilityLabel="Copy kiosk link"
            hitSlop={6}
            className="flex-row items-center gap-1 active:opacity-70"
          >
            <Feather name="copy" size={13} color={PRIMARY} />
            <Text className="text-xs font-semibold text-[#0644C7]">
              Copy kiosk link
            </Text>
          </Pressable>
        </View>
        <Text
          selectable
          className="rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300"
        >
          {kiosk}
        </Text>
        <Text className="text-xs text-gray-500 dark:text-gray-400">
          {
            "The kiosk link clears each guest's details after they register. Open it in a browser that is not signed in to ZapZone, turn off the browser's autofill, and use Guided Access (iPad) or screen pinning (Android)."
          }
        </Text>
      </View>
    </View>
  );
}
