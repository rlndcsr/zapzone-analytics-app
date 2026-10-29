import * as Application from "expo-application";
import { Platform } from "react-native";

import {
  apkFileProblem,
  InstallError,
  type ApkDownload,
  type DownloadedApk,
  type DownloadTick,
} from "../lib/appUpdateInstall";

export {
  InstallError,
  type ApkDownload,
  type DownloadedApk,
  type DownloadTick,
  type InstallErrorKind,
} from "../lib/appUpdateInstall";

const APK_MIME = "application/vnd.android.package-archive";
const APK_PREFIX = "zapzone-update-";
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const SPACE_HEADROOM = 1.3;
const MIN_FREE_BYTES = 50 * 1024 * 1024;

type LegacyFileSystem = typeof import("expo-file-system/legacy");

const loadFileSystem = (): Promise<LegacyFileSystem> =>
  import("expo-file-system/legacy");

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(1)} MB`;
}

export function assertHttpsApkUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InstallError("invalid_url");
  }
  if (parsed.protocol !== "https:") {
    throw new InstallError("invalid_url");
  }
}

function apkFileName(version: string): string {
  const safe = version.replace(/[^A-Za-z0-9._-]/g, "_") || "latest";
  return `${APK_PREFIX}${safe}.apk`;
}

export async function verifyApkFile(
  file: DownloadedApk,
  expectedBytes: number | null,
): Promise<void> {
  const FileSystem = await loadFileSystem();

  const info = await FileSystem.getInfoAsync(file.uri);
  const header = info.exists
    ? await FileSystem.readAsStringAsync(file.uri, {
        encoding: "base64",
        position: 0,
        length: 8,
      }).catch(() => "")
    : "";

  const size = info.exists ? info.size : 0;
  const problem = apkFileProblem({
    httpStatus: file.httpStatus,
    resumed: file.resumed,
    exists: info.exists,
    size,
    expectedBytes,
    header,
  });
  if (!problem) return;

  await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {});
  throw new InstallError(
    problem,
    `HTTP ${file.httpStatus}${file.resumed ? " (resumed)" : ""}, ${size} of ${expectedBytes ?? "unknown"} bytes`,
  );
}

export function createApkDownload(options: {
  url: string;
  version: string;
  onTick: (tick: DownloadTick) => void;
}): ApkDownload {
  const { url, version, onTick } = options;

  let task: import("expo-file-system/legacy").DownloadResumable | null = null;
  let fileUri: string | null = null;
  let pausedByUser = false;
  let cancelledByUser = false;
  let outOfSpace = false;
  let spaceChecked = false;

  const guardSpace = async (totalBytes: number): Promise<void> => {
    const FileSystem = await loadFileSystem();
    // An unreadable free-space figure is not a reason to stop the download.
    const free = await FileSystem.getFreeDiskStorageAsync().catch(() => null);
    if (free === null || free >= totalBytes * SPACE_HEADROOM) return;
    outOfSpace = true;
    await task?.cancelAsync().catch(() => {});
  };

  const handleProgress = (progress: {
    totalBytesWritten: number;
    totalBytesExpectedToWrite: number;
  }) => {
    const expected = progress.totalBytesExpectedToWrite;
    const totalBytes = expected > 0 ? expected : null;

    if (!spaceChecked && totalBytes !== null) {
      spaceChecked = true;
      void guardSpace(totalBytes);
    }

    onTick({ bytesWritten: progress.totalBytesWritten, totalBytes });
  };

  const settle = (
    result:
      import("expo-file-system/legacy").FileSystemDownloadResult | undefined,
    resumed: boolean,
  ): DownloadedApk | null => {
    if (outOfSpace) throw new InstallError("no_space");
    if (cancelledByUser) return null;
    // A result means the transfer finished, even if Pause was tapped as it did.
    if (result) return { uri: result.uri, httpStatus: result.status, resumed };
    if (pausedByUser) return null;
    throw new InstallError("unknown", "download ended without a result");
  };

  const wrapFailure = (error: unknown): never => {
    if (error instanceof InstallError) throw error;
    if (outOfSpace) throw new InstallError("no_space", error);
    throw new InstallError("offline", error);
  };

  return {
    async start() {
      assertHttpsApkUrl(url);
      const FileSystem = await loadFileSystem();
      const dir = FileSystem.cacheDirectory;
      if (!dir) throw new InstallError("unknown");

      const free = await FileSystem.getFreeDiskStorageAsync().catch(() => null);
      if (free !== null && free < MIN_FREE_BYTES) {
        throw new InstallError("no_space");
      }

      pausedByUser = false;
      cancelledByUser = false;
      outOfSpace = false;
      spaceChecked = false;

      fileUri = `${dir}${apkFileName(version)}`;
      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(
        () => {},
      );

      task = FileSystem.createDownloadResumable(
        url,
        fileUri,
        {},
        handleProgress,
      );

      try {
        return settle(await task.downloadAsync(), false);
      } catch (error) {
        return wrapFailure(error);
      }
    },

    async resume() {
      if (!task) throw new InstallError("unknown", "nothing to resume");
      pausedByUser = false;
      // Without resumeData (the pause never landed) the native side restarts from byte 0.
      const resumed = !!task.savable().resumeData;
      try {
        return settle(await task.resumeAsync(), resumed);
      } catch (error) {
        return wrapFailure(error);
      }
    },

    async pause() {
      pausedByUser = true;
      await task?.pauseAsync().catch(() => {});
    },

    async cancel() {
      cancelledByUser = true;
      await task?.cancelAsync().catch(() => {});
      if (fileUri) {
        const FileSystem = await loadFileSystem();
        await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(
          () => {},
        );
      }
      task = null;
    },
  };
}

export async function launchApkInstaller(fileUri: string): Promise<void> {
  if (Platform.OS !== "android") {
    throw new InstallError("install_failed", `unsupported platform ${Platform.OS}`);
  }

  try {
    const FileSystem = await loadFileSystem();
    const IntentLauncher = await import("expo-intent-launcher");

    const contentUri = await FileSystem.getContentUriAsync(fileUri);
    const result = await IntentLauncher.startActivityAsync(
      "android.intent.action.VIEW",
      {
        data: contentUri,
        type: APK_MIME,
        flags: FLAG_GRANT_READ_URI_PERMISSION,
      },
    );

    if (result.resultCode === IntentLauncher.ResultCode.Canceled) {
      throw new InstallError("install_failed", "installer returned RESULT_CANCELED");
    }
  } catch (error) {
    if (error instanceof InstallError) throw error;
    throw new InstallError("install_failed", error);
  }
}

/**
 * Open the per-app "Install unknown apps" toggle. The `package:` data pre-selects
 * this app, so the user lands on the switch itself instead of a list.
 */
export async function openUnknownSourcesSettings(): Promise<void> {
  const IntentLauncher = await import("expo-intent-launcher");
  await IntentLauncher.startActivityAsync(
    IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES,
    { data: `package:${Application.applicationId}` },
  );
}

export async function sweepStaleApks(
  keepVersion?: string | null,
): Promise<void> {
  try {
    const FileSystem = await loadFileSystem();
    const dir = FileSystem.cacheDirectory;
    if (!dir) return;

    const keep = keepVersion ? apkFileName(keepVersion) : null;
    const entries = await FileSystem.readDirectoryAsync(dir);

    await Promise.all(
      entries
        .filter(
          (name) =>
            name.startsWith(APK_PREFIX) &&
            name.endsWith(".apk") &&
            name !== keep,
        )
        .map((name) =>
          FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true }).catch(
            () => {},
          ),
        ),
    );
  } catch {}
}
