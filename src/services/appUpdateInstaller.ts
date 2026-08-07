import * as Application from "expo-application";
import { Platform } from "react-native";

export type InstallErrorKind =
  | "invalid_url"
  | "offline"
  | "http_error"
  | "no_space"
  | "not_an_apk"
  | "cancelled"
  | "install_failed"
  | "unknown";

export class InstallError extends Error {
  readonly kind: InstallErrorKind;

  constructor(kind: InstallErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "InstallError";
    this.kind = kind;
  }
}

export type DownloadTick = {
  bytesWritten: number;
  totalBytes: number | null;
};

export type DownloadedApk = {
  uri: string;
  httpStatus: number;
};

export type ApkDownload = {
  start: () => Promise<DownloadedApk | null>;
  resume: () => Promise<DownloadedApk | null>;
  pause: () => Promise<void>;
  cancel: () => Promise<void>;
};

const APK_MIME = "application/vnd.android.package-archive";
const APK_PREFIX = "zapzone-update-";
const FLAG_GRANT_READ_URI_PERMISSION = 1;
const MIN_APK_BYTES = 1_000_000;
const ZIP_MAGIC_BASE64 = "UEsD";
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
  fileUri: string,
  httpStatus: number,
): Promise<void> {
  const FileSystem = await loadFileSystem();

  const discard = async (kind: InstallErrorKind): Promise<never> => {
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    throw new InstallError(kind);
  };

  if (httpStatus !== 200) {
    await discard("http_error");
  }

  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists || info.size < MIN_APK_BYTES) {
    await discard("not_an_apk");
  }

  const header = await FileSystem.readAsStringAsync(fileUri, {
    encoding: "base64",
    position: 0,
    length: 8,
  }).catch(() => "");

  if (!header.startsWith(ZIP_MAGIC_BASE64)) {
    await discard("not_an_apk");
  }
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
    const free = await FileSystem.getFreeDiskStorageAsync();
    if (free >= totalBytes * SPACE_HEADROOM) return;
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
  ): DownloadedApk | null => {
    if (outOfSpace) throw new InstallError("no_space");
    if (cancelledByUser) return null;
    if (pausedByUser) return null;
    if (!result) throw new InstallError("unknown");
    return { uri: result.uri, httpStatus: result.status };
  };

  const wrapFailure = (error: unknown): never => {
    if (error instanceof InstallError) throw error;
    if (outOfSpace) throw new InstallError("no_space");
    throw new InstallError("offline");
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
        return settle(await task.downloadAsync());
      } catch (error) {
        return wrapFailure(error);
      }
    },

    async resume() {
      if (!task) throw new InstallError("unknown");
      pausedByUser = false;
      try {
        return settle(await task.resumeAsync());
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
    throw new InstallError("install_failed");
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
      throw new InstallError("install_failed");
    }
  } catch (error) {
    if (error instanceof InstallError) throw error;
    console.warn("[app-update] could not launch the installer:", error);
    throw new InstallError("install_failed");
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
