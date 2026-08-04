import { Download, ShieldAlert } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";

import type { AppUpdateStatus } from "../../services/appUpdateService";
import { CenterModal } from "./CenterModal";

const BRAND = "#0644C7";
/** amber-700 — signals "you can't continue" without the alarm of red. */
const BLOCKING_ACCENT = "#B45309";

type Props = {
  visible: boolean;
  status: AppUpdateStatus;
  /** Opens the download link. */
  onUpdate: () => void;
  /**
   * Dismiss handler for an optional update. Ignored when
   * `status.requiresUpdate` is true — a forced update has no dismiss path.
   */
  onLater: () => void;
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
 * Presentational only: which form to show is decided by appUpdateService.
 */
export function AppUpdateDialog({ visible, status, onUpdate, onLater }: Props) {
  const blocking = status.requiresUpdate;
  const accent = blocking ? BLOCKING_ACCENT : BRAND;
  const canDownload = !!status.apkUrl;

  return (
    // A forced update has no dismiss path: `dismissable={false}` removes the
    // backdrop press target and swallows the hardware back button.
    <CenterModal
      visible={visible}
      onClose={onLater}
      dismissable={!blocking}
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

        {blocking ? (
          <>
            <Pressable
              onPress={onUpdate}
              disabled={!canDownload}
              accessibilityRole="button"
              className={`mt-5 flex-row items-center justify-center gap-2 rounded-xl bg-[#0644C7] py-3 active:opacity-80 ${
                canDownload ? "" : "opacity-50"
              }`}
            >
              <Download size={16} color="#fff" />
              <Text className="text-sm font-semibold text-white">
                Update Now
              </Text>
            </Pressable>
            {!canDownload && (
              // Blocking with nothing to download is a backend
              // misconfiguration; say so instead of leaving a dead button.
              <Text className="mt-3 text-center text-xs leading-4 text-gray-400 dark:text-gray-500">
                A download link isn&apos;t available yet. Please contact your
                administrator to get the latest version.
              </Text>
            )}
          </>
        ) : (
          <View className="mt-5 flex-row gap-3">
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
        )}
      </View>
    </CenterModal>
  );
}
