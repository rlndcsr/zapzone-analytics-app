# Core Platform Business Rules

> **Purpose:** Catalogue the authentication, session, role, location and API-contract rules the existing app relies on, with where each is enforced.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Derived from the evidence in the linked architecture documents. Only rules a future spec is likely to need are listed. "Backend (server-enforced)" is used only where backend code was read; per-controller scoping was not audited.
> **Related:** [Architecture overview](../ARCHITECTURE.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Startup, auth & session](../architecture/startup-auth-and-session.md) · [API layer & data flow](../architecture/api-layer-and-data-flow.md) · [Location & role access](../architecture/location-and-role-access.md) · [Caching & synchronization](../architecture/caching-and-synchronization.md) · [Security & data handling](../architecture/security-and-data-handling.md)

---

## Authentication

### BR-AUTH-001 — Only staff users can sign in
- **Rule:** Login succeeds only for a `User` whose password matches and whose role is not `customer`; otherwise 401 "The provided credentials are incorrect."
- **Workflow:** Login screen → `POST /api/login`.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `zapzone-backend@ae877e2:app/Http/Controllers/Api/AuthController.php` (`AuthController::login`).
- **Exceptions:** Mobile has no role allow-list of its own; any staff role (`company_admin`, `admin`, `location_manager`, `attendant`) may sign in.
- **Verification:** Source-verified
- **Open questions:** Should mobile reject roles it has no UI for (e.g. `admin`)?

### BR-AUTH-002 — Inactive accounts are locked out
- **Rule:** `status === 'inactive'` → login 403; existing tokens of inactive users stop authenticating (401). Saved-account switch also treats a non-`active` status as unusable and marks the account `signin_required`.
- **Workflow:** Login; every authenticated request; account switch.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic for the switch check.
- **Evidence:** `AuthController::login`; `zapzone-backend@ae877e2:app/Providers/AppServiceProvider.php` (`authenticateAccessTokensUsing`); `src/services/auth.ts` (`fetchUserWithToken`), `src/lib/accounts/switchAccount.ts` (`prepareAccountSwitch`).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None.

### BR-AUTH-003 — Login input validation
- **Rule:** Email must be a valid address; password required and ≥ 8 characters. Throttled sign-in (429) shows a dedicated message.
- **Workflow:** Login form submit.
- **Enforcement layer:** Mobile client logic + Backend (server-enforced) (`validate(['email' => 'required|string|email|max:255', 'password' => 'required|min:8'])`, `throttle:sign-in`).
- **Evidence:** `src/components/auth/LoginForm.tsx` (`validate`, `handleSubmit`); `AuthController::login`; `routes/api.php` (`login` route).
- **Exceptions:** Wrong credentials return 401, which the mobile client mishandles (KL-ARCH-001).
- **Verification:** Source-verified
- **Open questions:** None.

### BR-AUTH-004 — Sign-out ordering
- **Rule:** Sign Out unregisters the push device, then revokes the token (`POST /api/logout`), then marks the saved account `signin_required`, then clears the local session. Both network steps are best-effort with 8 s caps and cannot block sign-out.
- **Workflow:** Profile / Accounts → Sign Out.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/services/auth.ts` (`signOut`, `revokeToken`); `src/services/pushDeviceService.ts` (`unregisterPushDevice`); `src/lib/hooks/useLogout.ts`.
- **Exceptions:** Involuntary teardown (401/expiry) skips unregister and revoke (KL-SEC-005).
- **Verification:** Source-verified
- **Open questions:** None.

### BR-AUTH-005 — Sign Out keeps the account; Remove erases it
- **Rule:** Sign Out leaves the saved-account entry (password required next time). Remove revokes the stored token (if linked) and deletes the entry; removing the active account also clears the session.
- **Workflow:** Accounts tab / login-screen saved-accounts strip.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/accounts/savedAccountsStore.ts` (`markAccountSignInRequired`, `removeSavedAccount`); `src/app/(tabs)/accounts.tsx` (`removeAccount`); `src/components/auth/SavedAccountsStrip.tsx`.
- **Exceptions:** A 401 teardown downgrades to `signin_required`; an inactivity expiry leaves the account `linked` (KL-SEC-002).
- **Verification:** Source-verified
- **Open questions:** Is password-less resume after inactivity intended?

### BR-AUTH-006 — Saved-account limit
- **Rule:** At most 5 saved accounts per device; adding a 6th evicts a `signin_required` account first, else the least recently used, deleting its token. The Accounts tab blocks "add another" at the limit.
- **Workflow:** Any successful sign-in; Accounts → add account.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/accounts/savedAccountsStore.ts` (`MAX_SAVED_ACCOUNTS`, `upsertSavedAccount`); `src/app/(tabs)/accounts.tsx` (`handleAddAnother`).
- **Exceptions:** Every session is auto-saved; there is no opt-out.
- **Verification:** Source-verified
- **Open questions:** None.

## Session

### BR-SESSION-001 — Sliding inactivity window
- **Rule:** A session is valid while `now < expiresAt`; successful authenticated requests and route changes slide the window; foregrounding the app starts a fresh window; only idle time while the app is open and foregrounded can expire it (checked every 60 s).
- **Workflow:** Any authenticated use.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/session.ts` (`SESSION_TTL_MS`, `touchSession`, `registerAppResume`, `isAuthenticated`); `src/components/AuthGuard.tsx`.
- **Exceptions:** TTL is currently a TEMP 30 days (documented intent 1 h) (KL-SEC-001). Server tokens never expire (`config/sanctum.php`).
- **Verification:** Source-verified
- **Open questions:** Intended production TTL.

### BR-SESSION-002 — One teardown per 401 storm; 403 is not a logout
- **Rule:** Any HTTP 401 on an authenticated, non-public `apiRequest` for the current token ends the session once (latched), marks the account `signin_required`, and silently drops further authenticated requests until a new session. 403 is surfaced as an error and never logs out.
- **Workflow:** Any API call.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/api.ts` (`apiRequest` 401 branch, latch check); `src/lib/session.ts` (`invalidateSession`, `handleUnauthorized`).
- **Exceptions:** Requests bypassing `apiRequest` don't participate (see API doc §6). Unauthenticated 401s (login) also trigger teardown (KL-ARCH-001).
- **Verification:** Source-verified
- **Open questions:** None.

### BR-SESSION-003 — Stale-token 401s are ignored
- **Rule:** A 401 for a request sent with a token that is no longer the current session token does not affect the current session.
- **Workflow:** Account switch / re-login with requests in flight.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/staleSessionReply.ts` (`isStaleSessionReply`), `src/lib/api.ts`.
- **Exceptions:** Unauthenticated requests are not covered.
- **Verification:** Test-backed (`src/lib/staleSessionReply.test.ts`)
- **Open questions:** None.

### BR-SESSION-004 — Launch validation is fail-open on network errors
- **Rule:** On launch with a stored token, `GET /api/user` (8 s) runs before first paint: 401 → sign out; network error/timeout → keep the session.
- **Workflow:** Cold start.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/services/auth.ts` (`validateStoredSession`); `src/app/_layout.tsx`.
- **Exceptions:** None.
- **Verification:** Source-verified
- **Open questions:** None.

### BR-SESSION-005 — Per-account state resets on account change
- **Rule:** When the signed-in user id changes, the workspace location resets to "All Locations", dashboard metrics caches are cleared, the booking cache empties (token change), and the per-user dashboard timeframe is reloaded. Sign-out also resets the workspace location.
- **Workflow:** Login, add account, switch account, sign-out.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/session.ts` (`setSession`, `clearSession`); `src/lib/bookings/bookingListCache.ts` (`ownBookingCache`); `src/lib/dashboard/timeframeStore.ts` (`restoreTimeframeSelection`).
- **Exceptions:** Other memory caches keyed only by location rely on the `(tabs)` remount via `/switch-account` (Inferred); metrics cache files persist on sign-out (KL-SEC-004).
- **Verification:** Source-verified; booking owner guard Test-backed (`src/lib/bookings/cacheOwner.test.ts`)
- **Open questions:** None.

## Roles

### BR-ROLE-001 — Authorization is server-side; mobile role checks are presentation only
- **Rule:** Staff endpoints require `auth:sanctum` + `staff` (role in `company_admin|admin|location_manager|attendant` and a company), optionally narrowed by `staff:<roles>`; mobile tab/menu/button visibility does not protect anything.
- **Workflow:** All staff features.
- **Enforcement layer:** Backend (server-enforced) where middleware is applied; Mobile UI-only for visibility.
- **Evidence:** `zapzone-backend@ae877e2:app/Http/Middleware/EnsureStaff.php`; `routes/api.php`; `src/lib/navigation/navConfig.ts`, `src/components/navigation/navMenuItems.ts`.
- **Exceptions:** Some authenticated routes lack route-level `staff` middleware (e.g. `ticket-orders` index/show, `categories` index, `mobile/packages`, `mobile/push-devices`).
- **Verification:** Source-verified (middleware); per-route completeness Not assessed
- **Open questions:** Are the un-gated routes guarded inside their controllers?

### BR-ROLE-002 — Role-based tab set
- **Rule:** `location_manager` sees Activity instead of Location; every other role (incl. `attendant`, `admin`) gets the base set; management menu entry only for `company_admin` (User Management) and `location_manager` (Attendants Management).
- **Workflow:** Main tab bar and quick-nav menu.
- **Enforcement layer:** Mobile UI-only
- **Evidence:** `src/lib/navigation/navConfig.ts` (`ROLE_TABS`); `src/components/navigation/navMenuItems.ts` (`getNavMenuItems`).
- **Exceptions:** Deep links/pushes can still reach hidden screens.
- **Verification:** Test-backed (`src/lib/navigation/navConfig.test.ts`) for tabs
- **Open questions:** Intended attendant/admin experience.

### BR-ROLE-003 — Push notifications for admins and managers only
- **Rule:** Only `company_admin`, `admin`, `location_manager` register devices for push.
- **Workflow:** Post-login registration.
- **Enforcement layer:** Backend (server-enforced) via `MobilePushDeviceController::ALLOWED_ROLES`; mirrored by Mobile client logic.
- **Evidence:** `src/lib/notifications/pushDevice.ts` (`ELIGIBLE_ROLES`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/MobilePushDeviceController.php`.
- **Exceptions:** None.
- **Verification:** Source-verified (backend constant only)
- **Open questions:** None.

## Location

### BR-LOCATION-001 — Managers and attendants see only their (active) location
- **Rule:** For `location_manager`/`attendant`, scoped queries and record checks are restricted to `user.location_id` (for managers, the token's active location); all staff are restricted to their company.
- **Workflow:** All location-aware data.
- **Enforcement layer:** Backend (server-enforced) — mechanism in `ScopesByAuthUser`
- **Evidence:** `zapzone-backend@ae877e2:app/Http/Traits/ScopesByAuthUser.php` (`applyAuthScope`, `authorizeRecordScope`, `guardLocationAccess`, `guardCompanyAccess`); `app/Support/StaffLocationSession.php`.
- **Exceptions:** Unscoped when no `User` resolves (hence `staff` middleware). `GET /api/mobile/locations` is public and unscoped (KL-SEC-003).
- **Verification:** Source-verified (mechanism); per-controller use Not assessed
- **Open questions:** None.

### BR-LOCATION-002 — Only managers switch location, only to assigned ones
- **Rule:** `PUT /api/staff-locations/active` is allowed only for the multi-location role and only for a location the user can work at; the choice is stored on the token. Mobile reopens the last device choice on login if still assigned, and remounts the app after a switch.
- **Workflow:** Location selector (manager with >1 work location).
- **Enforcement layer:** Backend (server-enforced); Mobile client logic for reopen/remount.
- **Evidence:** `zapzone-backend@ae877e2:app/Http/Controllers/Api/StaffLocationController.php` (`activate`); `app/Models/User.php` (`canWorkAt`); `src/services/staffLocationService.ts` (`resolveStaffLocation`, `switchStaffLocation`).
- **Exceptions:** None.
- **Verification:** Source-verified; mobile helpers Test-backed (`src/lib/location/staffLocation.test.ts`)
- **Open questions:** None.

### BR-LOCATION-003 — Company-admin workspace location
- **Rule:** Company admins pick "All Locations" (default) or one location; the choice persists across launches, is sent as `location_id` by location-aware modules, and resets on sign-out/account change.
- **Workflow:** Location selector; every location-aware screen.
- **Enforcement layer:** Mobile client logic (server treats `location_id` as a filter for company admins)
- **Evidence:** `src/lib/location/activeLocationStore.ts`; `src/components/ui/LocationWorkspaceSelector.tsx`; `src/lib/session.ts`.
- **Exceptions:** Manage Bookings export/report/import ignore it (KL-ARCH-006).
- **Verification:** Source-verified
- **Open questions:** None.

### BR-LOCATION-004 — Default location for new records
- **Rule:** New records / on-site sales start on the workspace location if one is selected, else the user's own location, else the form asks.
- **Workflow:** Create forms.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/location/activeLocationStore.ts` (`defaultFormLocationId`).
- **Exceptions:** Not assessed per form.
- **Verification:** Source-verified
- **Open questions:** None.

## API contract

### BR-API-001 — Request timeouts
- **Rule:** `apiRequest` aborts after 15 s by default (per-call overrides for heavy/guest endpoints); session-critical raw calls use 8 s.
- **Workflow:** All requests.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/api.ts` (`DEFAULT_TIMEOUT_MS`); `src/services/auth.ts` (`VALIDATE_TIMEOUT_MS`).
- **Exceptions:** Multipart uploads, raw exports and `downloadAsync` calls have no timeout.
- **Verification:** Source-verified
- **Open questions:** None.

### BR-API-002 — Change reason prompt and single retry
- **Rule:** When the backend answers 422 with `errors.change_reason`, staff are asked for a reason and the same request is retried once with `change_reason`; cancelling surfaces the 422.
- **Workflow:** Booking mutations (status, payment status, cancel, delete, restore, edit, notes, location, check-in).
- **Enforcement layer:** Backend (server-enforced) requirement via `CapturesChangeReason` (policy `booking_rules.change_reason`); Mobile client logic for prompt/retry.
- **Evidence:** `src/lib/api.ts`; `src/lib/changeReasonPrompt.ts`; `zapzone-backend@ae877e2:app/Http/Traits/CapturesChangeReason.php`.
- **Exceptions:** Bypassing requests are not covered.
- **Verification:** Helpers Test-backed (`src/lib/changeReasonPrompt.test.ts`); flow Source-verified
- **Open questions:** None.

### BR-API-003 — Blocked-period confirmation
- **Rule:** A 409 `code: BLOCKED_PERIOD` asks staff to "Book anyway"; on confirm the request is resent with `acknowledge_blocked_period: true` and `acknowledged_block_ids`; confirmations are remembered per user+target for 5 minutes.
- **Workflow:** Saves inside availability blocks.
- **Enforcement layer:** Backend (server-enforced) via `AvailabilityBlockGuard`; Mobile client logic for confirm/resend.
- **Evidence:** `src/lib/api.ts`; `src/lib/blockedPeriodPrompt.ts`; `zapzone-backend@ae877e2:app/Services/AvailabilityBlockGuard.php`.
- **Exceptions:** Declining throws `ApiError(BLOCKED_PERIOD_DECLINED)`.
- **Verification:** Helpers Test-backed (`src/lib/blockedPeriodPrompt.test.ts`)
- **Open questions:** None.

### BR-API-004 — Public endpoints never touch the session
- **Rule:** Calls flagged `publicEndpoint` never log out on 401, never prompt, and never extend the session window.
- **Workflow:** Version check, guest kiosk/waiver flows, checkout concerns.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/api.ts` (`publicEndpoint`); `src/services/appUpdateService.ts`.
- **Exceptions:** `/api/login` is not flagged (KL-ARCH-001).
- **Verification:** Source-verified
- **Open questions:** None.

### BR-API-005 — Client error reporting limits
- **Rule:** At most 25 reports per app runtime and one per identical error per minute; reports never include tokens or request bodies.
- **Workflow:** Failed requests, uncaught errors, render crashes.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/errorReporting.ts`; `src/lib/errorReportGate.ts`.
- **Exceptions:** Server-provided messages are forwarded unscrubbed.
- **Verification:** Test-backed (`src/lib/errorReportGate.test.ts`)
- **Open questions:** Backend retention Not assessed.
