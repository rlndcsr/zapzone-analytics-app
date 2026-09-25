import * as Application from "expo-application";
import Constants from "expo-constants";

import { createReportGate } from "./errorReportGate";

/*
 * Tells the backend when something breaks on a phone (web parity:
 * utils/errorLogger.ts). Failed API calls, uncaught errors, unhandled promise
 * rejections and render crashes are sent to POST /api/client-errors, which
 * files them in the server's own log next to its record of the same request —
 * the X-Request-Id the server returned is sent back, so the two line up.
 *
 * It sends the message, the screen, the action and the status — never form
 * contents, never a token. A report that fails is dropped: reporting must never
 * break the app, and it never reports itself.
 */

export type ClientErrorKind = "api" | "render" | "window" | "promise";

export type ClientErrorReport = {
  message: string;
  kind: ClientErrorKind;
  /** "POST /api/bookings" — the request that failed. The server strips any query. */
  action?: string;
  status?: number;
  requestId?: string | null;
  stack?: string;
};

// Read here rather than from lib/api, which imports this module.
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
const REPORT_PATH = "/api/client-errors";

const gate = createReportGate();

/** The screen on show, kept current by the root layout (the web's location.pathname). */
let currentPage = "";

export function setReportingPage(page: string | null | undefined): void {
  currentPage = page ?? "";
}

/** Same rule as the update check: the installed binary, or app.json inside Expo Go. */
function appVersion(): string {
  try {
    if (Constants.expoGoConfig != null) {
      return Constants.expoConfig?.version ?? "dev";
    }
    return (
      Application.nativeApplicationVersion ??
      Constants.expoConfig?.version ??
      "dev"
    );
  } catch {
    return "dev";
  }
}

export function isReportingEndpoint(path?: string): boolean {
  return !!path && path.includes("client-errors");
}

export function reportClientError(report: ClientErrorReport): void {
  if (!API_BASE_URL) return;

  const page = currentPage;
  const message = (report.message || "Unknown error").slice(0, 500);
  const key = `${report.kind}|${report.status ?? ""}|${message}|${page}`;
  if (!gate.admit(key)) return;

  const body = JSON.stringify({
    message,
    kind: report.kind,
    page: page || undefined,
    action: report.action?.slice(0, 200),
    status: report.status,
    request_id: report.requestId || undefined,
    stack: report.stack?.slice(0, 2000),
    app_version: appVersion(),
  });

  try {
    void fetch(`${API_BASE_URL}${REPORT_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
    }).catch(() => undefined);
  } catch {
    /* reporting must never break the app */
  }
}

type GlobalErrorHandler = (error: unknown, isFatal?: boolean) => void;

type RNErrorUtils = {
  getGlobalHandler: () => GlobalErrorHandler;
  setGlobalHandler: (handler: GlobalErrorHandler) => void;
};

type HermesRejectionTracker = {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, rejection: unknown) => void;
    onHandled: (id: number) => void;
  }) => void;
};

const describe = (value: unknown): { message: string; stack?: string } => {
  const err = value as { message?: unknown; stack?: unknown } | null;
  const message =
    typeof err?.message === "string" && err.message
      ? err.message
      : String(value ?? "Unknown error");
  return {
    message: message.slice(0, 500),
    stack: typeof err?.stack === "string" ? err.stack : undefined,
  };
};

let installed = false;

/**
 * The phone's equivalents of the web's window "error" and "unhandledrejection"
 * listeners. The existing global handler still runs after the report, so a
 * fatal error behaves exactly as it did (red box in development, the native
 * crash path in a release build).
 */
export function installGlobalErrorReporting(): void {
  if (installed) return;
  installed = true;

  const errorUtils = (globalThis as { ErrorUtils?: RNErrorUtils }).ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      try {
        reportClientError({ kind: "window", ...describe(error) });
      } catch {
        /* never stand between the app and its own handler */
      }
      previous?.(error, isFatal);
    });
  }

  const hermes = (globalThis as { HermesInternal?: HermesRejectionTracker })
    .HermesInternal;
  hermes?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id, rejection) => {
      const described = describe(rejection);
      reportClientError({ kind: "promise", ...described });
      // This replaces React Native's development tracker, so keep its warning.
      if (__DEV__) {
        console.warn(`Possible unhandled promise rejection: ${described.message}`);
      }
    },
    onHandled: () => {},
  });
}
