# Security and Data Handling

> **Purpose:** Record how the app authenticates, what it stores on the device, what it logs and reports, how payment and customer data flow, and the security-relevant limitations visible in source.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Static review of the session, saved-account, API, error-reporting, push, payments-tokenization and cache modules; repo-wide searches for storage APIs, `EXPO_PUBLIC_*`, raw `fetch`, file-system use; targeted pattern search of root JS config files. `.env`, `.env.example`, `google-services.json` and credential files were **not opened**. Not assessed: Android backup/`allowBackup` behaviour, native build config (`app.json` plugins beyond names), backend handling of client error reports, backend payment controller internals, TLS/pinning, jailbreak/root detection, waiver/photo screens in depth. This is not a penetration test and makes no claim that any control is effective.
> **Related:** [Architecture overview](../ARCHITECTURE.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Startup, auth & session](startup-auth-and-session.md) · [API layer & data flow](api-layer-and-data-flow.md) · [Location & role access](location-and-role-access.md) · [Caching & synchronization](caching-and-synchronization.md) · [Core platform rules](../business-rules/core-platform-rules.md)

---

## 1. Authentication mechanism

- Laravel Sanctum **personal access tokens** sent as `Authorization: Bearer <token>`. Issued by `POST /api/login` (`AuthController::login` → `createToken`), revoked one-at-a-time by `POST /api/logout` (`zapzone-backend@ae877e2:app/Http/Controllers/Api/AuthController.php`).
- Server-side token lifetime: unlimited (`'expiration' => null`, `zapzone-backend@ae877e2:config/sanctum.php`). Tokens for `inactive` users stop authenticating (`AppServiceProvider::boot` `authenticateAccessTokensUsing`). Login is rate-limited (`throttle:sign-in`).
- The client-side "session window" (`SESSION_TTL_MS`) is a **local lock only**; it does not revoke the token. See [startup-auth-and-session.md §3](startup-auth-and-session.md).
- Login credentials are sent once over the configured base URL and are not stored by the app (Source-verified: `LoginForm` keeps the password in component state only).

## 2. Data stored on the device

| Data | Store / key | Lifetime | Evidence |
|---|---|---|---|
| Live bearer token | SecureStore `zapzone_auth_token` (default accessibility options) | until sign-out/teardown | `src/lib/session.ts` |
| Live user record (minus `profile_path`) — includes name, email, role, company/location ids, work locations | SecureStore `zapzone_auth_user` | same | `src/lib/session.ts` (`persistableUser`) |
| Session expiry timestamp | SecureStore `zapzone_auth_expires_at` | written, never read | `src/lib/session.ts` |
| Saved accounts index (≤5: name, email, role, company/location names, short avatar path, token state) | SecureStore `zapzone_saved_accounts` | until removed | `src/lib/accounts/savedAccountsStore.ts` |
| **Per-account bearer tokens** for every saved, linked account | SecureStore `zapzone_saved_token_<userId>`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY` | until Sign Out / Remove / 401 | same |
| Manager's last chosen location | SecureStore `zapzone_manager_location_<userId>` | indefinite | `src/services/staffLocationService.ts` |
| Workspace location, theme, dashboard timeframe | SecureStore `zapzone_active_location`, `zapzone_theme`, `dashboard_timeframe_<userId>` | indefinite | `activeLocationStore.ts`, `theme.ts`, `timeframeStore.ts` |
| Dashboard metrics snapshots (include `recentPurchases`/`recentEventPurchases` with **customer names**) | JSON files `metrics-cache-v1-*` in the app cache directory | 5-min validity, but expired files are only deleted when read or on `clearAllCaches()` (account change / location switch / some edits) — **not** on sign-out | `src/services/metricsCacheService.ts`, `src/services/metricsService.ts` (`RecentPurchase`) |
| Exported CSVs / downloaded PDFs / photos | app cache directory (`FileSystem.cacheDirectory`) | not deleted by the app after sharing (OS may evict) | e.g. `src/app/bookings/bookings.tsx` (`runExport`), `src/app/payments/payments.tsx` (`shareInvoicePdf`) |
| Booking lists and other module caches | memory only | JS runtime | see caching doc |

Notes:
- iOS Keychain items can survive app uninstall/reinstall unless explicitly cleared; nothing in source clears SecureStore on first launch after install (Inferred from absence; **Device verification required**). Saved-account tokens use `…THIS_DEVICE_ONLY` (not migrated to new devices via backup); the live-session keys use the library default (Not assessed).
- `profile_path` is dropped before persistence for size, not for privacy.

## 3. Environment and build configuration

- `EXPO_PUBLIC_API_URL` (required; import-time throw if missing) and `EXPO_PUBLIC_WEB_URL` (optional) are the only env vars read by `src/` (`src/lib/api.ts`, `src/lib/errorReporting.ts`). `EXPO_PUBLIC_*` values are **inlined into the JS bundle** and are not secrets.
- There is **no in-app environment switch**: one base URL per bundle. `eas.json` profiles (`development`, `preview`, `production`) set channels/distribution but no env values in that file; the URL comes from the build environment / local `.env` (gitignored per `.gitignore`). Which backend a given build or OTA update talks to cannot be determined from source — **check before testing against production data**.
- `__DEV__` builds log the resolved API base URL (`src/lib/api.ts`).
- `google-services.json` is committed at the repo root (Firebase client config; contents not reviewed).
- **Root JS config files are executed at bundle time** (`tailwind.config.js`, `babel.config.js`, `metro.config.js`, `eslint.config.js`). A past incident appended an obfuscated loader to `tailwind.config.js`. At `973d281` a targeted search of these files for loader-like constructs found none and `tailwind.config.js` is a 19-line NativeWind preset config. Treat any diff to these files as security-relevant (**KL-SEC-006**).

## 4. Logging

| Source | Guard | Content |
|---|---|---|
| `authDebug` (TEMP) | `__DEV__` | auth/navigation events + session snapshot; no token values (`src/lib/debug/authDebug.ts`). |
| Push device logs | `__DEV__` | Expo push token **masked** (`maskToken`), comment: "a push token is a credential" (`src/lib/notifications/pushDevice.ts`). |
| `apiRequest` | `__DEV__` | base URL; failing method + full URL (incl. query) on transport errors. |
| Booking cache logs | `__DEV__` | cache hit/miss keys. |
| `console.error` in hooks | **not guarded** | e.g. `useAsyncList` "List load error", `useBookings` "Bookings error" — error objects/messages reach device logs in release builds. |
| `console.warn` in bookings walk | not guarded | page-cap warning only. |
| `LoginForm` "Forgot password pressed" | not guarded | harmless string. |

## 5. Error reporting payload

`reportClientError` → unauthenticated `POST /api/client-errors`: `message` (≤500; for API failures the **server's** message), `kind`, `page` (pathname), `action` (`METHOD /path`, query stripped client-side), `status`, `request_id`, `stack` (≤2000), `app_version`. It never sends tokens, request bodies or user ids (`src/lib/errorReporting.ts`). Server messages and JS error messages could embed record names or other free text; content is not scrubbed. Throttled to 25 reports/runtime and 1/min per key (`src/lib/errorReportGate.ts`). Backend storage/retention: Not assessed.

## 6. Payment data

- Card data (number, expiry, CVV) is collected on device and sent **directly to Authorize.Net's Accept endpoint** (`api.authorize.net` / `apitest.authorize.net` by environment) as a `securePaymentContainerRequest`; the backend receives only the returned `opaqueData` nonce in `POST /api/payments/charge` (`src/lib/payments/acceptTokenize.ts`; `src/services/paymentsService.ts` `PaymentChargeRequest`; the helper at ~line 697 composes `tokenizeCard` → `chargePayment` with `opaqueData` only). Source-verified for the mobile request bodies; backend charge handling Not assessed here.
- The public client key / API login id are fetched per location from `GET /api/authorize-net/public-key/{locationId}` (public route) — these are Authorize.Net's publishable credentials by design.
- `POST /api/payments/charge` is a **public** route (`throttle:payment-charge`, no `auth:sanctum`) (`zapzone-backend@ae877e2:routes/api.php`). Mobile still sends the bearer. Server-side authorization of staff charges: Not assessed.
- Charge request may include customer contact details and a base64 signature image (`signature_image`).
- Duplicate-**sale** protection is record-level. Checkouts send a `checkout_key` when they create the booking or
  purchase, and the record-create endpoints recognise a repeat (`ALREADY_BOOKED` / `ALREADY_PURCHASED` in
  `BookingController`, `AttractionPurchaseController`, `EventPurchaseController`, `TicketOrderController`; not
  traced in depth). Whether `POST /api/payments/charge` itself refuses a second charge on the same record was **Not
  assessed** (KL-PAYMENT-006). Don't rely on it until the charge handler has been reviewed. Gift-card sales send no
  `checkout_key` (KL-PKG-017).

## 7. Customer, waiver and photo PII (category level)

- Staff screens load and display customer names, emails, phone numbers, booking/purchase history, waiver signatures/participants and photo sessions via authenticated endpoints. Lists are commonly loaded in full and held in memory (bookings: whole history per scope).
- PII leaves the app via: CSV exports and PDF/photo downloads written to the cache directory then shared through the OS share sheet; email/SMS campaign features (server-sent); error reports (free-text messages only).
- Guest-facing kiosk flows (waiver kiosk, escape-room waivers) call public endpoints with `publicEndpoint: true`. In-depth review of these flows: Not assessed.
- Media is loaded from unauthenticated `/storage/...` URLs resolved by `mediaUrl`; access control of stored files is a backend/web-server concern (Not assessed).

## 8. Security-relevant limitations (summary)

| KL | Summary |
|---|---|
| KL-SEC-001 | `SESSION_TTL_MS` is a TEMP 30-day value (was 1 h); comments still say 1 h. The inactivity lock is effectively disabled for most usage. |
| KL-SEC-002 | Saved accounts (every session is auto-saved) can be resumed from the login screen without a password after an inactivity lock, because `expired` teardown keeps the stored token `linked`. |
| KL-SEC-003 | `GET /api/mobile/locations` is public and unscoped across companies; mobile uses it for the company-admin picker. |
| KL-SEC-004 | Sensitive files persist in the cache directory after sign-out (metrics snapshots with customer names, exported CSVs, invoices). |
| KL-SEC-005 | Involuntary teardown (401 / expiry) does not unregister the push device or revoke tokens; push notifications may continue to arrive for a signed-out device until the next registration. |
| KL-SEC-006 | Bundle-time JS config files are an injection vector (past incident); no automated guard found in repo. |

Also related: KL-ARCH-001 (wrong-password login tears down the live session on the add-account path).
