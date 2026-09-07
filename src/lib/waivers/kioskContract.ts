export type KioskSettings = {
  inactivityTimeoutSeconds: number;
  disableAutofill: boolean;
  gpsCaptureEnabled: boolean;
  returningEnabled: boolean;
};

const DEFAULT_INACTIVITY_SECONDS = 120;

export function mapKioskSettings(raw: unknown): KioskSettings {
  const s = (raw ?? {}) as Record<string, unknown>;
  const timeout = Number(s.inactivity_timeout_seconds);
  return {
    inactivityTimeoutSeconds:
      Number.isFinite(timeout) && timeout > 0
        ? timeout
        : DEFAULT_INACTIVITY_SECONDS,
    disableAutofill: s.disable_autofill !== false,
    gpsCaptureEnabled: s.gps_capture_enabled === true,
    returningEnabled: s.returning_enabled === true,
  };
}

export type KioskAd = {
  id: number;
  name: string | null;
  imagePath: string;
  displaySeconds: number;
  hasLink: boolean;
};

const DEFAULT_AD_SECONDS = 5;

export function mapKioskAd(raw: unknown): KioskAd | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const id = Number(d.id);
  const imagePath = typeof d.image_path === "string" ? d.image_path : "";
  if (!Number.isFinite(id) || id <= 0 || !imagePath) return null;
  const seconds = Number(d.display_seconds);
  return {
    id,
    name: typeof d.name === "string" && d.name ? d.name : null,
    imagePath,
    displaySeconds:
      Number.isFinite(seconds) && seconds > 0 ? seconds : DEFAULT_AD_SECONDS,
    hasLink: d.has_link === true,
  };
}

export const CONFIRM_BEAT_SECONDS = 2;

export function adHoldSeconds(ad: Pick<KioskAd, "displaySeconds">): number {
  return CONFIRM_BEAT_SECONDS + ad.displaySeconds;
}

export type ReturningDependent = {
  id: number;
  firstName: string;
  lastName: string;
  age: number | null;
  relationship: string | null;
};

export type ReturningProfile = {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  /** True when the server holds an email for this profile, even if `email`
   *  itself is withheld — lets the UI say "On file" instead of leaving the
   *  row looking empty. */
  hasEmail: boolean;
  phone: string | null;
  /**
   * Server-computed age, never the exact date of birth — the kiosk must not
   * disclose a looked-up guest's DOB. The signer confirms their own DOB by
   * typing it on the form instead of having it shown back to them.
   */
  age: number | null;
  dependents: ReturningDependent[];
};

const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;

export function mapReturningProfile(raw: unknown): ReturningProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const id = Number(d.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const rawDependents = Array.isArray(d.dependents) ? d.dependents : [];
  const age = Number(d.age);
  return {
    id,
    firstName: str(d.first_name) ?? "",
    lastName: str(d.last_name) ?? "",
    email: str(d.email),
    hasEmail: d.has_email === true,
    phone: str(d.phone),
    age: Number.isFinite(age) ? age : null,
    dependents: rawDependents.flatMap((entry) => {
      const r = (entry ?? {}) as Record<string, unknown>;
      const depId = Number(r.id);
      if (!Number.isFinite(depId) || depId <= 0) return [];
      const age = Number(r.age);
      return [
        {
          id: depId,
          firstName: str(r.first_name) ?? "",
          lastName: str(r.last_name) ?? "",
          age: Number.isFinite(age) ? age : null,
          relationship: str(r.relationship),
        },
      ];
    }),
  };
}

export type ReturningLookupStatus =
  "found" | "not_found" | "needs_staff" | "rate_limited" | "error";

export type ReturningLookupResult = {
  status: ReturningLookupStatus;
  profile: ReturningProfile | null;
  message: string | null;
  /**
   * Binds this lookup to the submission that follows it. Opaque to the
   * client — held in memory only for the active flow, never persisted.
   */
  lookupToken: string | null;
};

export function classifyLookupResponse(
  status: unknown,
  profile: unknown,
  lookupToken?: unknown,
): ReturningLookupResult {
  const token = str(lookupToken);
  if (status === "found") {
    const mapped = mapReturningProfile(profile);
    return mapped
      ? { status: "found", profile: mapped, message: null, lookupToken: token }
      : { status: "not_found", profile: null, message: null, lookupToken: null };
  }
  if (status === "needs_staff") {
    return { status: "needs_staff", profile: null, message: null, lookupToken: null };
  }
  return { status: "not_found", profile: null, message: null, lookupToken: null };
}

export const RATE_LIMITED_MESSAGE =
  "Too many lookups from this kiosk. Please wait a moment or ask the front desk for help.";

const LOOKUP_FAILED_MESSAGE =
  "We could not check that number. Please try again.";

export function classifyLookupFailure(
  httpStatus: number,
  message?: string | null,
): ReturningLookupResult {
  if (httpStatus === 429) {
    return {
      status: "rate_limited",
      profile: null,
      message: RATE_LIMITED_MESSAGE,
      lookupToken: null,
    };
  }
  return {
    status: "error",
    profile: null,
    message: message || LOOKUP_FAILED_MESSAGE,
    lookupToken: null,
  };
}

/**
 * True for a US phone number with exactly 10 digits once a leading "1"
 * country code is stripped — the same shape the web kiosk's lookup requires.
 */
export function isValidKioskPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return digits.length === 10;
}

export function minorCapReached(
  maxMinors: number,
  savedSelectedCount: number,
  newMinorCount: number,
): boolean {
  if (!Number.isFinite(maxMinors) || maxMinors <= 0) return true;
  return savedSelectedCount + newMinorCount >= maxMinors;
}
