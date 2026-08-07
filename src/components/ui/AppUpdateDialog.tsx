import { Download, ShieldAlert } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import type { ApkInstall } from "../../lib/hooks/useApkInstall";
import type { AppUpdateStatus } from "../../services/appUpdateService";
import {
  formatBytes,
  type InstallErrorKind,
} from "../../services/appUpdateInstaller";
import { UI_REACTION_DURATION } from "../navigation/navMotion";
import { CenterModal } from "./CenterModal";
import { UpdateProgressBar } from "./UpdateProgressBar";

const BRAND = "#0644C7";
/** amber-700 — signals "you can't continue" without the alarm of red. */
const BLOCKING_ACCENT = "#B45309";

/**
 * Reserved height for the action area, sized to its tallest state.
 *
 * This is what keeps the card from resizing as the flow moves from buttons to a
 * progress bar to an error. The shorter states are bottom-aligned inside the
 * reserve, so the spare room reads as padding above the buttons rather than as a
 * gap that appears and disappears.
 */
const ACTION_MIN_HEIGHT = 104;

/** What each failure means, in the user's terms rather than the code's. */
const ERROR_COPY: Record<InstallErrorKind, string> = {
  invalid_url:
    "The update link isn't valid. Please contact your administrator.",
  offline: "No internet connection. Check your network and try again.",
  http_error: "The update file couldn't be downloaded. Please try again.",
  no_space:
    "Not enough storage to download the update. Free up some space and try again.",
  not_an_apk: "The downloaded file wasn't a valid update. Please try again.",
  cancelled: "Download cancelled.",
  install_failed: "Android needs permission to install apps from ZapZone.",
  unknown: "Something went wrong while updating. Please try again.",
};

type Props = {
  visible: boolean;
  status: AppUpdateStatus;
  /** Begins the in-app download. */
  onUpdate: () => void;
  /**
   * Dismiss handler for an optional update. Ignored when
   * `status.requiresUpdate` is true — a forced update has no dismiss path.
   */
  onLater: () => void;
  /** Live download/install state; drives everything below the release notes. */
  install: ApkInstall;
};

/**
 * The update prompt, in its two forms:
 *
 * • Optional — a newer build exists. Dismissible via "Later", the backdrop, or
 *   the Android back button.
 * • Forced — the installed build is unsupported. No close affordance, no
 *   backdrop dismiss, and `onRequestClose` swallows the Android back button, so
 *   "Update Now" is the only way out.
 *
 * The header, message and release notes stay mounted through the entire
 * download; only the action area changes. That is deliberate — the card is
 * already on screen when the user taps Update, so replacing the whole thing
 * would read as a new dialog rather than the same one making progress.
 *
 * Presentational only: `appUpdateService` decides which form to show, and
 * `useApkInstall` decides which phase the action area is in.
 */
export function AppUpdateDialog({
  visible,
  status,
  onUpdate,
  onLater,
  install,
}: Props) {
  const blocking = status.requiresUpdate;
  const accent = blocking ? BLOCKING_ACCENT : BRAND;
  const canDownload = !!status.apkUrl;
  const { phase } = install;

  const renderActions = () => {
    if (phase === "downloading" || phase === "paused") {
      const paused = phase === "paused";
      const percent =
        install.fraction === null ? null : Math.round(install.fraction * 100);

      return (
        <View>
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              {paused ? "Paused" : "Downloading update…"}
            </Text>
            {percent !== null && (
              <Text className="text-xs font-bold" style={{ color: accent }}>
                {percent}%
              </Text>
            )}
          </View>

          <UpdateProgressBar fraction={install.fraction} color={accent} />

          <View className="mt-2 flex-row items-center justify-between">
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              {install.totalBytes
                ? `${formatBytes(install.bytesWritten)} / ${formatBytes(install.totalBytes)}`
                : formatBytes(install.bytesWritten)}
              {install.bytesPerSecond && !paused
                ? ` · ${formatBytes(install.bytesPerSecond)}/s`
                : ""}
            </Text>

            <View className="flex-row items-center gap-4">
              <Pressable
                onPress={paused ? install.resume : install.pause}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text
                  className="text-xs font-semibold"
                  style={{ color: accent }}
                >
                  {paused ? "Resume" : "Pause"}
                </Text>
              </Pressable>
              <Pressable
                onPress={install.cancel}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500">
                  Cancel
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    if (phase === "verifying" || phase === "launching" || phase === "installing") {
      const label =
        phase === "verifying"
          ? "Verifying download…"
          : phase === "launching"
            ? "Opening installer…"
            : "Installing…";

      return (
        <View>
          <Text className="mb-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
            {label}
          </Text>
          {/* Indeterminate: these steps have no measurable progress. */}
          <UpdateProgressBar fraction={null} color={accent} />
          {phase === "installing" && (
            <Text className="mt-2 text-xs leading-4 text-gray-400 dark:text-gray-500">
              Follow the Android prompt to finish installing.
            </Text>
          )}
        </View>
      );
    }

    if (phase === "error") {
      const kind = install.error ?? "unknown";
      return (
        <View>
          <Text className="mb-3 text-center text-xs leading-4 text-gray-500 dark:text-gray-400">
            {ERROR_COPY[kind]}
          </Text>
          <View className="flex-row gap-3">
            {/* Only an install failure has a settings remedy. There is
                deliberately no browser fallback anywhere in this flow. */}
            {kind === "install_failed" && (
              <Pressable
                onPress={install.openSettings}
                accessibilityRole="button"
                className="flex-1 items-center rounded-xl border border-gray-200 py-3 active:opacity-70 dark:border-neutral-700"
              >
                <Text className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                  Open Settings
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={install.retry}
              accessibilityRole="button"
              className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] py-3 active:opacity-80"
            >
              <Download size={16} color="#fff" />
              <Text className="text-sm font-semibold text-white">Retry</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    // idle — the original buttons, untouched.
    if (blocking) {
      return (
        <View>
          <Pressable
            onPress={onUpdate}
            disabled={!canDownload}
            accessibilityRole="button"
            className={`flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] py-3 active:opacity-80 ${
              canDownload ? "" : "opacity-50"
            }`}
          >
            <Download size={16} color="#fff" />
            <Text className="text-sm font-semibold text-white">Update Now</Text>
          </Pressable>
          {!canDownload && (
            // Blocking with nothing to download is a backend
            // misconfiguration; say so instead of leaving a dead button.
            <Text className="mt-3 text-center text-xs leading-4 text-gray-400 dark:text-gray-500">
              A download link isn&apos;t available yet. Please contact your
              administrator to get the latest version.
            </Text>
          )}
        </View>
      );
    }

    return (
      <View className="flex-row gap-3">
        <Pressable
          onPress={onLater}
          accessibilityRole="button"
          className="flex-1 items-center rounded-xl border border-gray-200 py-3 active:opacity-70 dark:border-neutral-700"
        >
          <Text className="text-sm font-semibold text-gray-600 dark:text-gray-300">
            Later
          </Text>
        </Pressable>
        <Pressable
          onPress={onUpdate}
          accessibilityRole="button"
          className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] py-3 active:opacity-80"
        >
          <Download size={16} color="#fff" />
          <Text className="text-sm font-semibold text-white">Update</Text>
        </Pressable>
      </View>
    );
  };

  return (
    // A forced update has no dismiss path, and neither does an update that is
    // mid-download: `dismissable={false}` removes the backdrop press target and
    // swallows the hardware back button, so a stray tap can't discard a transfer.
    <CenterModal
      visible={visible}
      onClose={onLater}
      dismissable={!blocking && !install.busy}
    >
      <View className="rounded-3xl bg-white p-6 dark:bg-neutral-900">
        <View className="items-center">
          <View
            className="mb-3 h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${accent}1A` }}
          >
            {blocking ? (
              <ShieldAlert size={22} color={accent} />
            ) : (
              <Download size={22} color={accent} />
            )}
          </View>

          <Text className="text-lg font-bold text-gray-900 dark:text-white">
            {blocking ? "Update Required" : "Update Available"}
          </Text>

          {!!status.currentVersion && !!status.latestVersion && (
            <View className="mt-1 flex-row items-center gap-1.5">
              <Text className="text-xs text-gray-400 dark:text-gray-500">
                v{status.currentVersion}
              </Text>
              <Text className="text-xs text-gray-300 dark:text-gray-600">
                →
              </Text>
              <Text className="text-xs font-semibold" style={{ color: accent }}>
                v{status.latestVersion}
              </Text>
            </View>
          )}
        </View>

        <Text className="mt-3 text-center text-sm leading-5 text-gray-500 dark:text-gray-400">
          {status.updateMessage}
        </Text>

        {status.releaseNotes.length > 0 && (
          <View className="mt-4 rounded-2xl bg-gray-50 p-4 dark:bg-neutral-800">
            <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              What&apos;s new
            </Text>
            {/* Capped height so a long changelog scrolls inside the card
                instead of pushing the action buttons off-screen. */}
            <ScrollView
              style={{ maxHeight: 160 }}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {status.releaseNotes.map((note, index) => (
                <View
                  key={`${index}-${note}`}
                  className="flex-row gap-2 pb-1.5"
                >
                  <Text className="text-sm leading-5 text-gray-400 dark:text-gray-500">
                    •
                  </Text>
                  <Text className="flex-1 text-sm leading-5 text-gray-600 dark:text-gray-300">
                    {note}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Fixed-height, bottom-aligned action area: the phases swap inside it
            without ever changing the card's height. Keyed on `phase` so each
            one fades in rather than replacing the last abruptly. */}
        <View
          className="mt-5 justify-end"
          style={{ minHeight: ACTION_MIN_HEIGHT }}
        >
          <Animated.View
            key={phase}
            entering={FadeIn.duration(UI_REACTION_DURATION)}
          >
            {renderActions()}
          </Animated.View>
        </View>
      </View>
    </CenterModal>
  );
}
