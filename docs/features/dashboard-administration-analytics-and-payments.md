# Dashboard, Administration, Analytics & Payments — Feature Baseline

> **Purpose:** Describe what the Mobile app's dashboard/tab screens, login & saved-accounts UI, profile, settings, staff/user management, analytics reports, payments module, payment processing and in-app update UI actually do today.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e` (cited sections only); Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Static source inspection of the Mobile files listed per module, plus targeted reads of the cited Backend controllers/middleware/routes and Web Admin pages. Nothing was run; no device or test execution. Session mechanics (token storage, inactivity timeout, 401 handling, login backend), bookings/calendar, day-offs and per-module checkout screens belong to other baseline files and are only referenced. Items marked "Not assessed" were not inspected.
> **Related:** [Feature catalog](../FEATURE_CATALOG.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Architecture](../ARCHITECTURE.md) · [Business rules for this area](../business-rules/dashboard-administration-analytics-and-payments.md)

**Contents:** 1 Shell & tabs · 2 Dashboard (Home) · 3 Location & Activity tabs · 4 Login, Accounts & switching · 5 Profile · 6 Settings & integrations · 7 In-app update · 8 User management · 9 Analytics & reports · 10 Payments · 11 Payment processing core

---

# 1. Shell & tabs

## Bottom tabs & Quick Navigation menu
- **Purpose:** Role-aware app shell — a floating bottom tab bar plus a centre Quick Navigation FAB that opens the module menu.
- **Implementation status:** Implemented · **Verification:** Source-verified; tab sets Test-backed (`src/lib/navigation/navConfig.test.ts`)

| Route file | What the user does there |
|---|---|
| `src/app/(tabs)/_layout.tsx` | `FloatingTabBar` renders the role's tab subset; `QuickNavFab` is drawn over the centre slot |
| `src/app/(tabs)/navigation.tsx` | Placeholder centre route (never shown as a tab) |

- **Roles (UI gating only):** `getRoleTabs` (`src/lib/navigation/navConfig.ts`): company_admin, attendant and unknown roles → Home · Location · FAB · Calendar · Accounts; location_manager → Home · Activity · FAB · Calendar · Accounts. Every tab screen stays registered; the bar only hides them. `getNavMenuItems` (`src/components/navigation/navMenuItems.ts`) inserts "User Management" (company_admin) or "Attendants Management" (location_manager) — both route to `/user-managements/user-management-hub` — and nothing for attendants. Payments and Analytics & Reports entries are shown to every role. "Profile & Support" items: Profile, Accounts (tab), Settings, Notifications.
- **Location scoping:** none at shell level (see `LocationWorkspaceSelector` under Dashboard).
- **Platform-specific behaviour:** none found in the tab layout.
- **Known limitations:** KL-ADMIN-001 (attendants get a Location tab whose data source is company-admin-only).
- **Source references:** `src/app/(tabs)/_layout.tsx` (`TabLayout`, `FloatingTabBar`); `src/lib/navigation/navConfig.ts` (`getRoleTabs`, `isTabRoute`); `src/components/navigation/navMenuItems.ts` (`getNavMenuItems`, `PROFILE_SUPPORT_ITEMS`).

---

# 2. Dashboard (Home tab)

## Home dashboard
- **Purpose:** Role-specific KPI dashboard (metric cards with breakdowns), Activity by Category, Recent Event Purchases and (managers) Customer Concerns.
- **Implementation status:** Implemented · **Verification:** Source-verified; config/derivations Test-backed (`src/lib/dashboard/dashboardConfig.test.ts`, `breakdowns.test.ts`, `dashboardTimeframe.test.ts`, `activityCategories.test.ts`)

| Route file | What the user does there |
|---|---|
| `src/app/(tabs)/home.tsx` (`Home`) | Pick a timeframe (All Time / Today / Last 24 Hours / Last 7 Days / Last 30 Days / Custom Range); company admins pick a workspace location; show/hide cards; toggle 1- or 2-column layout; tap a card for its breakdown sheet, tap ⓘ for what it counts; pull to refresh; "View All" → `/events/purchases` |

- **Roles:** One screen driven by `ROLE_DASHBOARDS` (`src/lib/dashboard/dashboardConfig.ts`, `getDashboardConfig`):
  - company_admin — Packages, Party Participants, Attractions Sold, Events Sold, Memberships, Unique Customers, Confirmed Sales, Waivers; breakdown sheet from server `breakdowns`; timeframe appended to every card sub-line.
  - location_manager — Packages, New Bookings, Total Revenue, Unique Customers, Confirmed Bookings, Avg Booking, Waivers; per-card breakdown *sections*; Customer Concerns panel.
  - attendant — Packages, New Bookings, Pending Approvals, Confirmed Bookings, Total Revenue, Ticket Sales; uses the attendant endpoint.
  - Unknown/missing role → attendant config (least privilege).
  - Backend (verified): `GET /api/metrics/dashboard/{user}` and `GET /api/metrics/attendant` sit behind `auth:sanctum` + `staff` (`zapzone-backend@ae877e2:routes/api.php`). `MetricsController::dashboard` ignores the `{user}` path segment and always uses the authenticated user; `MetricsController::resolveMetricsLocationId` forces non-admin roles to their own `location_id` and honours `location_id` only for company_admin/admin.
- **Location scoping:** company admin reads the global active location (`useActiveLocation`, `src/lib/location/activeLocationStore.ts`) and sends `location_id` unless "all"; `LocationWorkspaceSelector` (`src/components/ui/LocationWorkspaceSelector.tsx`) lets a company admin pick a location and lets a multi-location manager switch working location (`switchStaffLocation` → remount via `/switch-account`). Activity by Category uses the picked location for admins (none = all) and the user's own location otherwise.
- **Main workflows:** Cache-then-network load (`useDashboardMetrics`): paints a ≤5-minute cached snapshot, then overwrites with the live response. "New Bookings" and its breakdown are derived on the device from the full booking list (`fullBookingList`, `filterNewBookings`: created within the timeframe by venue day, not cancelled); "Avg Booking" = `bookingRevenue / totalBookings` (`computeAvgBooking`). Recent Purchases refresh silently every 30 s while focused and the app is active, and on returning to the tab/app (`LIVE_REFRESH_MS`). Waivers card shows "—" and "Could not be counted — see the server log" when `metrics.waiverMetricsAvailable === false` (`metricUncounted`).
- **Data sources:** `fetchDashboardMetrics` → `GET /api/metrics/dashboard/{userId}?timeframe=…[&date_from&date_to][&location_id][&timezone]` (30 s timeout; `timezone` = device IANA zone only for `today`); `fetchAttendantMetrics` → `GET /api/metrics/attendant?timeframe=…&location_id=…`; bookings list via `src/lib/bookings/bookingListCache.ts` (`fullBookingList`; owned by the bookings baseline); Activity by Category via `fetchDayBookings`, `fetchAttractionPurchases`, `fetchEventPurchases` (`src/components/ui/CategoryActivityPanel.tsx`); concerns via `fetchCheckoutConcerns` / `fetchCheckoutConcernStats` (`src/components/ui/LocationConcernsPanel.tsx`); unread count via `useNotifications`.
- **Validation & business rules:** BR-DASH-001 … BR-DASH-007.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/CompanyDashboard.tsx`, `ManagerDashboard.tsx`, `AttendantDashboard.tsx` — **Mobile adaptation** (one config-driven screen instead of three components; card lists, wording and cache semantics are documented in code as web ports; card-by-card parity Not assessed).
- **Shared components & utilities:** `DashboardHeader`, `FilterPill`, `DateRangeSheet`, `BottomSheet`, `MetricCardsSkeleton`, `StatusBadge`, `CategoryActivityPanel`, `LocationConcernsPanel`; `src/lib/dashboard/{dashboardConfig,breakdowns,dashboardTimeframe,activityCategories,timeframeStore,metricCardStyle}.ts`; `src/services/metricsCacheService.ts`.
- **Loading / empty / error / refresh:** skeleton grid on first/visible load; when a cold booking list is slow, other cards paint first and New Bookings shows "—"; error card only when nothing is on screen (a failed refresh keeps last-good data); "All cards hidden" empty state; pull-to-refresh bypasses the device cache (`force`). Hidden cards and grid layout are in-memory only (reset on remount). Timeframe persists per user in SecureStore (`dashboard_timeframe_<userId>`, `timeframeStore.ts`).
- **Platform-specific behaviour:** none in `home.tsx`; cache files use `expo-file-system` (`Paths.cache`).
- **Tests:** `dashboardConfig.test.ts` (role configs, value fallback, subtitles, sections); `breakdowns.test.ts` (breakdown building/rescaling); `dashboardTimeframe.test.ts` (venue-day "today", New Bookings filter); `activityCategories.test.ts` (category bucketing, Rage Room precedence).
- **Known limitations:** KL-ANALYTICS-001 (custom-range cache key ignores dates), KL-ANALYTICS-002 (company-wide metrics not company-scoped on the backend — security review), KL-ANALYTICS-003 (`today` uses device timezone for metrics but venue day for New Bookings), KL-ADMIN-002 (title reads "Company Dashboard" for every role).
- **Source references:** `src/app/(tabs)/home.tsx` (`Home`, `MetricCard`, `RecentEventPurchases`); `src/lib/hooks/useDashboardMetrics.ts` (`useDashboardMetrics`); `src/services/metricsService.ts`; `src/services/metricsCacheService.ts` (`getCacheKey`, `clearAllCaches`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/MetricsController.php` (`dashboard`, `attendant`, `resolveMetricsLocationId`, `getLocationStats`).

---

# 3. Location & Activity tabs

## Location tab (location performance)
- **Purpose:** Per-location performance table (bookings, tickets, events, waivers, revenue, utilization) with Top 3 by revenue.
- **Implementation status:** Implemented (company admin) · **Verification:** Source-verified

| Route file | What the user does there |
|---|---|
| `src/app/(tabs)/location.tsx` (`Location`) | Choose a timeframe; the global active location filters the list client-side; paginate (5 per page default); pull to refresh |

- **Roles:** Tab shown to company_admin and attendant (UI). Data comes from `locationStats`, which `MetricsController::dashboard` adds **only for company_admin**; for any other role the screen shows "No location data" (KL-ADMIN-001).
- **Location scoping:** always requests `locationId: "all"`; filters `locationStats` client-side by the active location.
- **Data sources:** `useDashboardMetrics` → `GET /api/metrics/dashboard/{userId}` (shares the dashboard cache).
- **Web Admin counterpart:** comments reference the web company dashboard's location table (sort by revenue desc, `attractionTickets ?? purchases`) — **Partial / Not assessed** in detail.
- **Loading / empty / error / refresh:** load deferred until the tab settles (`useTabSettled`); skeleton, "Something went wrong", "No location data", pull-to-refresh.
- **Known limitations:** KL-ADMIN-001; utilization is a backend estimate (`daysInRange × 100` capacity in `MetricsController::getLocationStats`).
- **Source references:** `src/app/(tabs)/location.tsx`.

## Activity tab (location manager)
- **Purpose:** Manager's operational feed: up to 10 New Bookings (with total count badge), recent attraction ticket purchases and recent event purchases for the dashboard timeframe.
- **Implementation status:** Implemented · **Verification:** Source-verified

| Route file | What the user does there |
|---|---|
| `src/app/(tabs)/activity.tsx` | Review recent activity; tap a booking to open `BookingDetailSheet`; pull to refresh |

- **Roles:** tab shown only to location_manager (UI). Backend scopes metrics to the manager's location (`resolveMetricsLocationId`).
- **Location scoping:** user's own `location_id` for the bookings list; metrics backend-scoped.
- **Data sources:** `useManagerActivity` → `GET /api/metrics/dashboard/{userId}` (`recentPurchases`, `recentEventPurchases`) + `fullBookingList` in parallel; timeframe shared with Home via `useTimeframeSelection`.
- **Loading / empty / error / refresh:** pulse skeleton, error text, pull-to-refresh; load deferred until tab settles. Unlike Home there is no device metrics cache read here.
- **Source references:** `src/app/(tabs)/activity.tsx`; `src/lib/hooks/useManagerActivity.ts` (`NEW_BOOKINGS_LIMIT = 10`).

---

# 4. Login, Accounts & switching (UI)

Session mechanics (token storage, launch validation, inactivity timeout, 401 teardown, `prepareAccountSwitch`/`commitPendingSwitch` internals) are covered by the session/auth baseline; this section covers what the screens let users do.

## Login screen
- **Purpose:** Staff sign-in; also the "Sign in to another account" screen when adding an account.
- **Implementation status:** Implemented (Forgot password / Remember me not implemented) · **Verification:** Source-verified

| Route file | What the user does there |
|---|---|
| `src/app/index.tsx` (`HomeScreen`) | Sign in with email + password; pick a saved account from `SavedAccountsStrip` (prefills email or signs straight in); with `?addAccount=1` add another account while the current one stays signed in; sees "Your session expired" notice when arriving from an expired session |

- **Roles:** any account the backend accepts (`POST /api/login`, throttled `throttle:sign-in` per `zapzone-backend@ae877e2:routes/api.php`); role checks on login itself Not assessed here.
- **Main workflows:** `LoginForm` (`src/components/auth/LoginForm.tsx`) validates client-side (email regex; password required and ≥ 8 characters), calls `login` → resolves the staff location (`resolveStaffLocation`) → `setSession` → restores the per-user dashboard timeframe → `replace("/home")`, or hands off to `/switch-account` when adding an account. Error mapping: 429 → "Too many sign-in attempts…", 422 → field errors, other API errors → server message.
- **Data sources:** `src/services/auth.ts` (`login` → `POST /api/login`).
- **Validation & business rules:** BR-PROFILE-001.
- **Web Admin counterpart:** web Login page — **Not assessed** beyond the 429 wording the code cites.
- **Loading / empty / error / refresh:** submit button disabled until both fields are non-empty and while submitting; transient (3 s) banner for auth errors.
- **Platform-specific behaviour:** `automaticallyAdjustKeyboardInsets` (iOS only; Android resizes the window); header shrinks with the keyboard (`useAnimatedKeyboard`).
- **Known limitations:** KL-ADMIN-003 (Forgot password / Remember me are empty pressables), KL-ADMIN-004 (temporary auth-debug instrumentation left in login/switch screens).
- **Source references:** `src/app/index.tsx`; `src/components/auth/LoginForm.tsx` (`validate`, `handleSubmit`); `src/components/auth/SavedAccountsStrip.tsx`; `src/components/auth/LogoSection.tsx`.

## Accounts tab (saved accounts)
- **Purpose:** List accounts saved on this device, switch between them without re-entering credentials, add or remove accounts.
- **Implementation status:** Implemented · **Verification:** Source-verified

| Route file | What the user does there |
|---|---|
| `src/app/(tabs)/accounts.tsx` (`Accounts`) | Tap a saved account to switch (or re-enter the password if its token is no longer usable); "More" on a row → confirm Remove; "Add another account" (blocked at 5 saved accounts) |
| `src/app/switch-account.tsx` (`SwitchAccount`) | Full-screen "switching" bridge: commits the pending switch, waits a minimum dwell, then `replace("/home")` (or back to `/` if nothing is signed in); hardware back is swallowed; also reused to remount after a manager's location switch and can reopen a record (`safeReturnPath`) |

- **Roles:** all signed-in roles.
- **Main workflows:** Switch → `prepareAccountSwitch` returns `ready` (go to bridge), `needs_password` (open login with `addAccount=1&prefill=<id>`), or `error`. Remove → revokes the account's token server-side when one is held (`revokeToken` → `POST /api/logout`; for the active account the push device is unregistered first), deletes the saved entry, and clears the session if it was the active account. Saved accounts carry `tokenState` `linked` | `signin_required` (`src/lib/accounts/savedAccountsStore.ts`); "Sign Out" (via `useLogout`) and "Remove" are distinct operations.
- **Validation & business rules:** BR-PROFILE-002.
- **Data sources:** SecureStore-backed saved-accounts store; `POST /api/logout`.
- **Loading / empty / error / refresh:** per-row busy spinner; other rows disabled during an operation; transient error banner.
- **Platform-specific behaviour:** status bar forced light while focused; `BackHandler` blocked on the bridge (Android).
- **Source references:** `src/app/(tabs)/accounts.tsx` (`handleSelect`, `removeAccount`, `handleAddAnother`); `src/lib/accounts/savedAccountsStore.ts` (`MAX_SAVED_ACCOUNTS = 5`); `src/lib/accounts/switchAccount.ts`; `src/app/switch-account.tsx`.

---

# 5. Profile

## Profile & Edit Profile
- **Purpose:** View own profile, role, company and business overview; change avatar; company admins manage location logos; edit personal and company details.
- **Implementation status:** Implemented · **Verification:** Source-verified

| Route file | What the user does there |
|---|---|
| `src/app/profile/index.tsx` | View profile; change avatar (picking is the commit); company admin: replace/remove each location's logo and see Business Overview (locations, Total Employees, active users, recent bookings); links to Edit Profile and Settings; app version footer; pull to refresh |
| `src/app/profile/edit-profile.tsx` | Edit first/last name, email, phone, position, employee ID, department; and — for **any** user whose profile has a company — company name, contact, website, industry, size (fixed list), founded date, tax/registration IDs, address and logo; Save |

- **Roles:** Location logos and Business Overview gated to company_admin in the UI (`useCurrentUserRole() === "company_admin"`); backend `PATCH /api/locations/{location}/logo` is `staff:company_admin|admin`. The company-details form is **not** role-gated in Mobile (`hasCompany` only); backend `PUT /api/companies/{id}` is `staff:company_admin|admin|location_manager` plus a same-company check in `CompanyController::update`; Web Admin exposes company editing only on `zappoint@5de9d9e:src/pages/admin/profile/CompanyAdminProfile.tsx` (KL-ADMIN-005). Own-profile edits go through `UserController::update` (`guardUserAdministration` allows self; `guardPrivilegedUserFields` blocks own role/location/status changes) — verified.
- **Main workflows:** Save sends `PATCH /api/users/{id}` then, if the user has a company, `PUT /api/companies/{id}` (logo only when newly picked); success dialog → back. Avatar: `PATCH /api/users/{id}/update-profile-path` with a base64 data URI. Images are rejected client-side above ~27 MB of base64 (~20 MB image).
- **Data sources:** `src/services/profileService.ts` (`fetchUserProfile` GET `/api/users/{id}`; `fetchCompanyStatistics` GET `/api/companies/{id}/statistics`; `updateUserProfile`; `updateProfilePicture`; `updateCompany`); `useProfile` also counts company admins via `fetchStaffCount` (GET `/api/users?role=company_admin&per_page=1`) to derive Total Employees; `updateLocationLogo` for logos; `useLocationOptions` (GET `/api/mobile/locations`).
- **Validation & business rules:** BR-PROFILE-003, BR-PROFILE-004.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/profile/{CompanyAdminProfile,LocationManagerProfile,AttendantProfile}.tsx` — **Partial** (one Mobile screen for three role pages; company editing exposed beyond company admins).
- **Loading / empty / error / refresh:** first load shows skeleton/spinner; later refreshes keep data; stats are best-effort (profile still renders).
- **Platform-specific behaviour:** `KeyboardAvoidingView` `padding` on iOS only (edit-profile); photo-library permission prompt via `expo-image-picker`.
- **Known limitations:** KL-ADMIN-005.
- **Source references:** `src/app/profile/index.tsx` (`pickImageDataUri`, `LocationLogos`, `changePhoto`); `src/app/profile/edit-profile.tsx` (`handleSave`); `src/lib/hooks/useProfile.ts`; `src/services/profileService.ts`.

---

# 6. Settings & integrations

## Settings
- **Purpose:** Account summary, dark mode, payment and Google Calendar integrations, overlap-override PIN, notifications link, app-update entry and version footer.
- **Implementation status:** Implemented · **Verification:** Source-verified

| Route file | What the user does there |
|---|---|
| `src/app/settings/settings.tsx` | Toggle Dark Mode (persisted via `saveTheme`); set/change own overlap-override PIN (`OverridePinModal`) when `canHoldPin`; manage Authorize.Net (`PaymentIntegrationCard`) and Google Calendar (`GoogleCalendarCard`); open Notifications; reopen the update dialog when an update with a download exists |

- **Roles:** Override-PIN row shown only when `GET /api/override-pin` reports `can_hold_pin` (backend `OverridePinController::APPROVER_ROLES` = company_admin, admin, location_manager — verified). Integration cards render for every role (see below).
- **Data sources:** `useProfile`; `getOverridePinStatus` (GET `/api/override-pin`); `useAppUpdateStatus` (no extra request; reuses the launch check).
- **Validation & business rules:** BR-STAFF-008 (override PIN format).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/Settings.tsx` — **Partial / Not assessed** in detail (cards cite the web's modals).
- **Platform-specific behaviour:** none found.
- **Known limitations:** KL-ADMIN-006 (override PIN length rule differs from backend).
- **Source references:** `src/app/settings/settings.tsx`; `src/lib/overridePin.ts` (`validateOverridePin`).

## Payment Integration card (Authorize.Net)
- **Purpose:** Show Authorize.Net connection status, list all connections, connect an account, disconnect the caller's own location's account.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Roles:** UI shows the card to everyone; company admins pick a location when connecting; other roles are pinned to their own location. Backend (verified): `GET /api/authorize-net/account` (`staff`) reads the caller's `location_id` (403 without one); `POST/PUT/DELETE /api/authorize-net/account` require `staff:company_admin|admin|location_manager`; non-admins are forced to their own location in `AuthorizeNetAccountController::store`; `DELETE account/{locationId?}` lets a company admin disconnect any location in their company (`AuthorizeNetAccountController::destroy`). Attendants therefore see Connect but the request is refused server-side.
- **Main workflows:** connect form requires API Login ID, Transaction Key and Public Client Key plus environment (Production/Sandbox); one account per location (409 when already connected); disconnect only offered on the row matching the user's own location.
- **Data sources:** `src/services/authorizeNetService.ts` — GET `/api/authorize-net/account`, GET `/api/authorize-net/accounts/all`, POST `/api/authorize-net/account`, DELETE `/api/authorize-net/account`; `fetchLocations` for the admin location picker.
- **Known limitations:** KL-PAYMENT-001 (company admins cannot disconnect other locations from Mobile although the backend supports it), KL-PAYMENT-002 (all-accounts list not company-scoped server-side — security review).
- **Source references:** `src/components/settings/PaymentIntegrationCard.tsx` (`submitConnect`, `confirmDisconnect`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/AuthorizeNetAccountController.php` (`allAccounts`, `show`, `store`, `destroy`, `getPublicKey`).

## Google Calendar card
- **Purpose:** Per-location Google Calendar sync: status, connect via Google consent in an in-app browser, disconnect, list connections.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Roles:** shown to every role; backend `google-calendar/*` routes are `staff`, and `GoogleCalendarController::getAuthUrl`/`disconnect` validate the location through `scopedLocation` (verified that the guard is called; its internals Not assessed).
- **Data sources:** `src/services/googleCalendarService.ts` — GET `/api/google-calendar/status?location_id=`, GET `/api/google-calendar/auth-url?location_id=`, POST/DELETE `/api/google-calendar/disconnect` (method Not assessed), connections list; `fetchLocations`.
- **Platform-specific behaviour:** `expo-web-browser` `openBrowserAsync`; the backend callback stores tokens, then the card re-reads status.
- **Source references:** `src/components/settings/GoogleCalendarCard.tsx` (`connect`, `runDisconnect`).

---

# 7. In-app update (version gate + Android APK install)

## App update gate, dialog, notice and installer
- **Purpose:** Once per launch, compare the installed version with the backend's published version; block unsupported builds; offer optional updates; download and hand the APK to Android's installer in-app.
- **Implementation status:** Implemented (Android); iOS install path not implemented · **Verification:** Source-verified; rules Test-backed (`src/lib/appUpdateNotice.test.ts`, `appUpdatePrompt.test.ts`, `appUpdateInstall.test.ts`, `appUpdateAttempt.test.ts`); actual download/installer hand-off: Device verification required

| File | Role |
|---|---|
| `src/components/AppUpdateGate.tsx` (`AppUpdateGate`) | Mounted once in the root shell; decides dialog vs notice vs nothing |
| `src/components/ui/AppUpdateDialog.tsx` | Update Now / Later, progress (pause/resume/cancel), error copy with Retry and "Open Settings" for install failures |
| `src/components/ui/AppUpdateNotice.tsx` | Persistent non-blocking reminder after "Later" (sits higher on tab routes) |
| `src/app/settings/settings.tsx` | "App Update" row → `reopenUpdatePrompt` |

- **Roles:** all users, including signed-out users for a forced update (dialog shows over login; the optional dialog is held off public routes; the notice shows on public routes).
- **Main workflows:** `checkForAppUpdate` (memoised, one request per launch, 8 s timeout, never rejects) → `evaluateUpdateStatus`: `hasUpdate` = behind latest or below minimum; `requiresUpdate` = below minimum, or `force_update` **and** `hasUpdate`. Forced: blocking dialog without "Later"; if no `apk_url`, Update is disabled with "contact your administrator". Optional: dialog only when an `apk_url` exists; "Later" defers for this launch (in-memory) and switches to the notice. Install: `createInstallController` state machine (download → verify → launch installer); verification rejects non-HTTPS URLs, wrong HTTP status (200 vs 206 on resume), files < 1 MB, size mismatch and non-ZIP headers; previous attempt outcome reviewed on next launch; stale APKs swept.
- **Data sources:** `src/services/appUpdateService.ts` — `GET /api/mobile/version?platform=android|ios` with `publicEndpoint: true` (a 401 here never tears down the session). Backend (verified): public route; `MobileVersionController::index` returns the newest active record for the platform or 404 (`zapzone-backend@ae877e2:app/Http/Controllers/Api/MobileVersionController.php`).
- **Validation & business rules:** BR-UPDATE-001 … BR-UPDATE-005.
- **Web Admin counterpart:** Web Admin edits version records (`GET /api/mobile/versions`, `PUT /api/mobile/version/{id}`, `staff:company_admin|admin|location_manager`); Mobile is read-only — **Not applicable** for parity.
- **Platform-specific behaviour:** `currentPlatform()` returns null on web (no check). `launchApkInstaller` throws `install_failed` unless `Platform.OS === "android"`; uses `expo-file-system/legacy` (`getContentUriAsync`) and `expo-intent-launcher`; "Open Settings" opens `MANAGE_UNKNOWN_APP_SOURCES`. In Expo Go the manifest version is used instead of the native version.
- **Tests:** `appUpdateNotice.test.ts` (`shouldShowUpdateNotice`), `appUpdatePrompt.test.ts` (defer/reopen store), `appUpdateInstall.test.ts` (`apkFileProblem`, controller transitions), `appUpdateAttempt.test.ts` (attempt breadcrumb outcomes). `evaluateUpdateStatus` itself has no test (KL-UPDATE-002).
- **Known limitations:** KL-UPDATE-001 (iOS would be offered an APK), KL-UPDATE-002 (version verdict untested), KL-UPDATE-003 (APK integrity relies on HTTPS + Android signature only).
- **Source references:** `src/services/appUpdateService.ts` (`evaluateUpdateStatus`, `checkForAppUpdate`, `getInstalledAppVersion`); `src/services/appUpdateInstaller.ts` (`assertHttpsApkUrl`, `verifyApkFile`, `launchApkInstaller`, `sweepStaleApks`); `src/lib/appUpdateInstall.ts` (`apkFileProblem`, `createInstallController`); `src/lib/appUpdateNotice.ts`; `src/lib/appUpdatePrompt.ts`; `src/lib/hooks/{useAppUpdateCheck,useApkInstall,useAppUpdateNotice}.ts`.

---

# 8. User management

Backend authorization for every `/api/users*` route (verified): route group `auth:sanctum` + `staff` (any staff role) in `zapzone-backend@ae877e2:routes/api.php`; per-action rules live in `UserController` (`guardUserAdministration`, `guardPrivilegedUserFields`, `guardStaffCreate`, `createWithCredentials`, `destroy`, `toggleStatus`, `bulkDelete`). Mobile role checks below are UI gating only.

## User Management hub
- **Purpose:** Entry point for staff accounts, Employee PINs, Activity Log and Day Offs.
- **Implementation status:** Implemented · **Verification:** Source-verified

| Route file | What the user does there |
|---|---|
| `src/app/user-managements/user-management-hub.tsx` | Company admin: "Manage Accounts" → `manage-accounts`; anyone else: "Manage Attendants" → `attendants`; quick links Send Invitation (`?invite=1`) / Staff Account (`?create=1`); Employee PINs; Activity Log; Day Offs (documented elsewhere) |

- **Roles:** reachable from Quick Nav only for company_admin and location_manager; the hub itself does not block an attendant (KL-ADMIN-007).
- **Source references:** `src/app/user-managements/user-management-hub.tsx`; `src/components/ui/ModuleHub`.

## Manage Accounts (company admin)
- **Purpose:** Every staff account in the company: browse, filter, create, invite, edit, activate/deactivate, resend credentials, delete, bulk actions, CSV export.
- **Implementation status:** Implemented · **Verification:** Source-verified

| Route file | What the user does there |
|---|---|
| `src/app/user-managements/manage-accounts.tsx` (`ManageAccounts`) | Search; filters (Status, User Type, Department, Location incl. a manager's extra work locations, Last Login, Created date range, Hire date range); table (default, with bulk select) or card view; per-row View / Edit / status picker / Resend credentials / Delete; Create staff account; Send invitation (share link); Export CSV |

- **Roles:** linked only for company_admin; the screen itself has no role guard. Backend: company admin may manage any account in the company; create allows company_admin / location_manager / attendant roles.
- **Location scoping:** own Location filter (not the global active location); location picker from `fetchLocations`.
- **Main workflows:** client-side **load-all**: `fetchAllStaffUsers` walks `GET /api/users` in two parallel passes (`status=active`, `status=inactive`; 100 per page, ≤ 20 pages each) and merges/re-sorts; all filtering, sorting and pagination are client-side; unset department displays as "Administration". Bulk Activate/Deactivate loops `toggle-status` per account (no bulk endpoint); bulk Delete uses `POST /api/users/bulk-delete`. Create supports generated or custom password, optional email, optional return of the password. Resend credentials rotates the password (confirmation required).
- **Data sources:** `src/services/usersService.ts` — GET `/api/users`, POST `/api/users/staff`, PUT `/api/users/{id}`, PATCH `/api/users/{id}/toggle-status`, DELETE `/api/users/{id}`, POST `/api/users/bulk-delete`, POST `/api/users/{id}/resend-credentials`, POST `/api/shareable-tokens` (invite link; public route that checks the caller's staff role in `ShareableTokenController::store`).
- **Validation & business rules:** BR-STAFF-001 … BR-STAFF-006.
- **Web Admin counterpart:** web Manage Accounts (code comments cite `ManageAccounts`, `CreateStaffAccountModal`, `ResendCredentialsModal`; file path Not assessed) — **Partial / Not assessed** in detail.
- **Shared components & utilities:** `ViewToggle`, `SelectableTable`-style table, `BottomSheet` forms, `staffDeleteMessage`, `fetchAllPages`.
- **Loading / empty / error / refresh:** spinner/skeleton, error text, pull-to-refresh, refetch on focus after a mutation (`markStaffStale` / `consumeStaffStale`).
- **Platform-specific behaviour:** CSV written to `cacheDirectory` (`expo-file-system/legacy`) and shared with `expo-sharing` (alert when sharing unavailable); invite link shared via `Share.share`.
- **Tests:** `src/lib/staffDeleteMessage.test.ts` (delete error wording); `src/lib/fetchAllPages.test.ts` (page walker).
- **Known limitations:** KL-ADMIN-007, KL-ADMIN-008.
- **Source references:** `manage-accounts.tsx` (`load`, `filtered`, `exportCsv`); `src/services/usersService.ts` (`fetchAllStaffUsers`, `createStaff`, `updateStaff`, `createStaffInvite`); `src/lib/hooks/useStaffAccounts.ts` (stale flag; server-paged `useStaffAccounts`/`useStaffStats` are not used by this screen).

## Attendants Management (location manager)
- **Purpose:** The manager's version of Manage Accounts for their location's attendants.
- **Implementation status:** Implemented · **Verification:** Source-verified

| Route file | What the user does there |
|---|---|
| `src/app/user-managements/attendants.tsx` | Same pattern as Manage Accounts scoped to attendants: search/filter/sort/paginate client-side, KPIs, create (attendant or location manager), edit, toggle status, delete, bulk actions, invite, CSV export |

- **Roles:** linked for location_manager (and any non-company-admin reaching the hub). Backend: managers can create managers/attendants only, pinned to their own `location_id`; cannot manage company admins, other locations, or (unless company admin) a manager's role/status/email/password or delete a manager.
- **Data sources:** `fetchAllStaffUsers({ role: "attendant" })` (both status passes) plus the same mutation endpoints as Manage Accounts.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/Attendants/ManageAttendants.tsx` — **Partial / Not assessed** in detail.
- **Known limitations:** KL-ADMIN-007, KL-ADMIN-008, KL-ADMIN-010.
- **Source references:** `src/app/user-managements/attendants.tsx`.

## Employee PINs (staff PINs & terminals)
- **Purpose:** Issue/clear/unlock staff PINs and manage shared PIN terminals' auto-lock.
- **Implementation status:** Partially implemented · **Verification:** Source-verified; rules Test-backed (`src/lib/staffPins.test.ts`)

| Route file | What the user does there |
|---|---|
| `src/app/user-managements/staff-pins.tsx` (`StaffPins`) | Search the roster; set a PIN (exactly the server length), remove a PIN, unlock a locked account; per terminal: set "Lock after" seconds (15–3600), disable idle lock, remove terminal |

- **Roles:** screen loads only when `canManageStaffPins(role)` (company_admin / location_manager); backend routes `staff-pin/roster`, `staff-pin/users/{user}*`, `staff-terminals*` are `staff:company_admin|location_manager` (verified).
- **Data sources:** `src/services/staffPinService.ts` — GET `/api/staff-pin/roster`, GET `/api/staff-pin/status` (PIN length), POST/DELETE `/api/staff-pin/users/{id}`, POST `/api/staff-pin/users/{id}/unlock`, GET `/api/staff-terminals`, PATCH/DELETE `/api/staff-terminals/{id}`. Revoked terminals are filtered client-side (`activeTerminals`).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/pins/StaffPins.tsx` — **Gap**: the web can set the current device up as a shared terminal ("This device"); Mobile has no terminal setup (KL-ADMIN-009).
- **Platform-specific behaviour:** `KeyboardAvoidingView` `padding` on iOS.
- **Source references:** `staff-pins.tsx` (`load`, `act`); `src/lib/staffPins.ts` (`validateStaffPin`, `parseIdleSeconds`, `activeTerminals`).

## Activity Log
- **Purpose:** Audit trail of staff actions with filters, details and CSV export.
- **Implementation status:** Implemented · **Verification:** Source-verified

| Route file | What the user does there |
|---|---|
| `src/app/user-managements/activity-logs.tsx` | Search; filter by Action, Resource Type (category), Attendant (user), Date Range; view entry details; export a 25-column CSV (with its own filter set and user picker) |

- **Roles:** linked from the hub (admin/manager). Backend `GET /api/activity-logs` is `staff` and applies `applyAuthScope` (`ActivityLogController::index`; trait internals Not assessed). Logs are append-only at model level (`ActivityLog::booted` throws on update/delete).
- **Location scoping:** company admin → global active location sent as `location_id`; others rely on server scope.
- **Data sources:** `src/services/activityLogsService.ts` — GET `/api/activity-logs` (search, category, action, user_role, location_id, date_from, date_to, paging).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/LocationActivityLogs.tsx`, `Attendants/AttendantActivityLogs.tsx` — **Partial / Not assessed** (code says filters and CSV mirror the web).
- **Source references:** `activity-logs.tsx`; `src/lib/hooks/useActivityLogs.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/ActivityLogController.php`.

---

# 9. Analytics & reports

## Analytics & Reports hub
- **Purpose:** Entry to Performance Analytics, Page Analytics and Accounting, plus quick links to Customer Analytics, Membership Reports, Waiver Reports and (admin/manager only) Photo Reports.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Route:** `src/app/analytics-reports/analytics-hub.tsx`. **Roles:** Quick Nav shows it to every role, attendants included; only Photo Reports is role-gated (UI).

## Performance Analytics (two reports)
- **Purpose:** Revenue, bookings and location performance for a period.
- **Implementation status:** Implemented · **Verification:** Source-verified (tests: `src/lib/analytics/performanceDisplay.test.ts`, `companyExport.test.ts`)

| Route file | What the user does there |
|---|---|
| `src/app/analytics-reports/performance-analytics.tsx` | location_manager → `LocationManagerAnalytics` (location report); every other role → company report with period selection and export (`CompanyExportSheet`) |

- **Roles:** branch is `role === "location_manager"` (`performance-analytics.tsx`); attendants therefore get the company report UI. Backend (verified): `GET /api/analytics/company` requires `company_id` matching the caller's company (403 otherwise) and narrows managers/attendants to their own location (`AnalyticsController::getCompanyAnalytics`); `GET /api/analytics/location` refuses another location for managers/attendants (`getLocationAnalytics`). Both routes are `staff`.
- **Location scoping:** company report follows the global active location (`useActiveLocation`).
- **Data sources:** `src/services/analyticsService.ts` — `fetchCompanyAnalytics` / `fetchCompanyAnalyticsRaw` (GET `/api/analytics/company`), `fetchLocationAnalytics` (GET `/api/analytics/location`), `exportLocationAnalytics` (POST `/api/analytics/location/export`, raw file body); company export is built on the device from the raw response (`src/lib/analytics/companyExport.ts`).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/Analytics/CompanyAnalytics.tsx` and `LocationManagerAnalytics.tsx` — two distinct web reports; Mobile branches the same way — **Partial** (section-level parity Not assessed).
- **Platform-specific behaviour:** exports written to the cache directory and shared with `expo-sharing` ("Sharing unavailable" alert otherwise).
- **Known limitations:** KL-ANALYTICS-004.
- **Source references:** `performance-analytics.tsx`; `src/components/analytics/{LocationManagerAnalytics,CompanyExportSheet,CustomerAnalyticsBlocks}.tsx`; `src/lib/analytics/performanceDisplay.ts`.

## Accounting Analytics
- **Purpose:** Purchases made on the dates picked, by location.
- **Implementation status:** Implemented · **Verification:** Source-verified (test: `src/lib/analytics/accountingScope.test.ts`)
- **Route:** `src/app/analytics-reports/accounting-analytics.tsx` — choose dates and view the report for the active location.
- **Data sources:** `fetchAccountingReport` → GET `/api/accounting-analytics/report`. Summary-trend and export endpoints exist on the backend; Mobile use Not assessed.
- **Backend scoping (verified):** `AccountingAnalyticsController` resolves locations: blank/"all" = every location in the caller's company; managers/attendants limited to their own location; a location in another company → 403.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/Analytics/AccountingAnalytics.tsx` — **Not assessed** in detail.

## Page Analytics
- **Purpose:** Storefront traffic: overview, live visitors, time series, top pages/entities, sources, devices, funnel, landing pages, conversions, attribution.
- **Implementation status:** Implemented · **Verification:** Source-verified (test: `src/lib/analytics/pageAnalyticsDisplay.test.ts`)
- **Route:** `src/app/analytics-reports/page-analytics.tsx`; follows the active location.
- **Data sources:** GET `/api/page-analytics/{overview,live,timeseries,top-pages,top-entities,sources,devices,funnel,landing-pages,conversions,attribution}` (all `staff`); overview is required, every other panel falls back to empty on failure.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/Analytics/PageAnalytics.tsx` — **Partial** (web extras such as entity detail modal, sessions, promo/gift-card performance are not called by Mobile's service).
- **Backend scoping:** `PageAnalyticsController` scoping Not assessed.

---

# 10. Payments module

## Payments hub, Payments list, Deleted Payments, Package Invoices
- **Purpose:** Review payment transactions and act on them (refund, void, manual refund, delete, invoices), restore or purge deleted payments, export package invoices.
- **Implementation status:** Implemented · **Verification:** Source-verified

| Route file | What the user does there |
|---|---|
| `src/app/payments/payments-hub.tsx` | Entry to Payments, Deleted Payments, Package Invoices |
| `src/app/payments/payments.tsx` | Browse/filter payments (`PaymentFiltersSheet`, `PaymentsTable`); row actions: gateway refund, void, manual refund, delete (soft), invoice PDF; bulk invoices PDF; CSV and invoices export from the header menu |
| `src/app/payments/deleted-payments.tsx` | Restore or permanently delete soft-deleted payments |
| `src/app/payments/package-invoices.tsx` | Pick a package (+ optional filters) and view/download all its invoices as one PDF |

- **Roles:** Quick Nav shows Payments to every role; no role checks found in the payments screens. Backend (verified from routes): list/show/store/destroy/refund/manual-refund/void/invoices are `staff`; `restore` and `force-delete` are `staff:company_admin|admin|location_manager`; `PaymentController` limits managers/attendants to their own location in listing (around line 417) and checks the payable's location on create (`denyForeignRecord`).
- **Location scoping:** company admin → global active location.
- **Main workflows:** action eligibility is computed client-side (`canRefund`: completed Authorize.Net charge; `canVoid`: completed/pending Authorize.Net within 2 days; `canManualRefund`: completed cash/in-store/card) — all require a linked payable. Refund/void bookkeeping rows are recognised by their notes. PDFs are fetched outside the JSON client and shared.
  - **Gateway refund outcome (spec 002, 2026-11-28):** Refund sends one full-refund request (`refundPayment` → `executeRefund`, 60 s budget `REFUND_TIMEOUT_MS`; every other request keeps the 15 s default) and shows what actually happened, classified only from the server's answer (`classifyRefundOutcome`, `src/lib/payments/refundOutcome.ts`):
    - **Refunded:** "Refund of $X processed successfully. Refund Payment #N".
    - **Voided instead** (`was_void_fallback: true`; an unsettled charge, which any full Mobile refund can become): "…voided instead of refunded…". The cancelled booking or purchase is mentioned only when `payable_cancelled === true`.
    - **Amounts:** only a valid server amount (`void_amount`/`refund_amount`) is ever shown, never the payment's own amount; otherwise the neutral "Payment refunded successfully." / "Payment voided instead of refunded[, and the associated booking was cancelled]."
    - **Confirmed failure:** recognised pre-gateway shapes or a gateway refusal; shows "Refund failed: <server message>", and the sheet stays open.
    - **Unknown:** no answer, 502/504, a generic 500, 400 "Unknown error", 400 `is_unsettled: true`, or anything unrecognised. Shows "The refund result could not be confirmed… Please verify the payment status before attempting another refund." and reloads the list; it is never reported as success or failure.
    - **Advisory retry warning:** after an unknown outcome, that payment's next Refund confirmation adds a warning, keyed by account and payment, held in memory for the screen session, and cleared only by a later confirmed refund or void. It never blocks.
    - **Duplicate confirmations and stale sessions:** a session-owned single-flight guard (`src/lib/singleFlight.ts`) stops duplicate confirmations. A late answer for a session that has ended shows nothing.
    - **Unchanged:** Void, Manual refund and Delete (`runAction`) are unchanged.
- **Data sources:** `src/services/paymentsService.ts` — GET `/api/payments`, GET `/api/payments/trashed`, PATCH `/api/payments/{id}/refund|manual-refund|void|restore`, DELETE `/api/payments/{id}`, DELETE `/api/payments/{id}/force-delete`, GET `/api/payments/{id}/invoice`, GET `/api/payments/invoices/export`, GET `/api/payments/package-invoices/export`, POST `/api/payments` (record a non-gateway payment).
- **Validation & business rules:** BR-PAYMENT-006 … BR-PAYMENT-008, BR-PAYMENT-010.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/payments/Payments.tsx`, `ViewPayment.tsx` — **Partial / Not assessed** (eligibility functions are documented as web ports).
- **Platform-specific behaviour:** PDFs/CSV written to `cacheDirectory` and shared via `expo-sharing`.
- **Tests:** `src/lib/payments/payableRoute.test.ts`, `cardLabel.test.ts`, `paymentState.test.ts` (display/state helpers); `refundOutcome.test.ts`, `refundFlow.test.ts`, `src/lib/singleFlight.test.ts` (refund outcome, request, feedback order, retry warning, duplicate guard). `canRefund`/`canVoid`/`canManualRefund` live in a service and are untested.
- **Known limitations:** KL-PAYMENT-003, KL-PAYMENT-005, KL-PAYMENT-007 to KL-PAYMENT-010.
- **Source references:** `src/app/payments/*.tsx`; `src/services/paymentsService.ts` (`canRefund`, `canVoid`, `canManualRefund`, `invoiceUrl`, `packageInvoicesUrl`); `src/components/ui/{PaymentFiltersSheet,PaymentsTable,PaymentStatusBadge}.tsx`; `src/lib/paymentsStale.ts`.

---

# 11. Payment processing core

## Card charge pipeline (shared by checkout screens)
- **Purpose:** Take a card payment for a booking, attraction purchase, event purchase or ticket order without card data touching the ZapZone backend.
- **Implementation status:** Implemented · **Verification:** Source-verified; outcome/key rules Test-backed (`chargeOutcome.test.ts`, `checkoutKey.test.ts`, `checkoutTokens.test.ts`, `bookingRollback.test.ts`, `membershipChargeGate.test.ts`, `acceptJsLocation.test.ts`); live gateway behaviour: Device verification required
- **Flow:** (1) `fetchAuthorizeNetPublicKey` → GET `/api/authorize-net/public-key/{locationId}` (public route; returns the location's public Accept credentials and environment). (2) `tokenizeCard` → `tokenizeCardWithAccept` (`src/lib/payments/acceptTokenize.ts`) posts the card directly from the device to Authorize.Net's Accept service, not through `apiRequest`. (3) `chargePayment` → POST `/api/payments/charge` with `location_id`, opaque data, amount, customer, `payable_type` (`booking` | `attraction_purchase` | `event_purchase` | `ticket_order`) and `payable_id`, plus the `checkout_token` the record's create returned (`checkoutTokens`); 60 s timeout. (4) Outcome: `success: false` = decline → caller rolls back the record it created; a thrown error rolls back too **unless** `isChargeOutcomeUnknown` (status 0, 502, 504, or 409 `CHARGE_IN_PROGRESS`) — then the record is kept and the operator is told to verify. Booking rollback treats a 404 as already gone (`bookingRollback`).
- **Idempotency:** `checkoutKeyFor` keeps one `checkout_key` per sale across retries and rotates it when the sale fingerprint changes (`src/lib/payments/checkoutKey.ts`). Callers and the server-side handling of keys/tokens: Not assessed here.
- **Backend:** `POST /api/payments/charge` is outside `auth:sanctum` with `throttle:payment-charge` (`zapzone-backend@ae877e2:routes/api.php`); merchant-account resolution, record creation, idempotency and force-delete behaviour inside the charge handler were **Not assessed** (KL-PAYMENT-006).
- **Web Admin counterpart:** web `PaymentService.processCardPayment` / Accept.js (`window.Accept.dispatchData`) cited in code — **Mobile adaptation** (direct Accept request instead of Accept.js).
- **Platform-specific behaviour:** none found in the shared libs.
- **Source references:** `src/services/paymentsService.ts` (`processCardPayment`, `chargePayment`, `chargeOutcomeUnknown`, `declineMessage`); `src/lib/payments/{acceptTokenize,acceptJsLocation,checkoutKey,checkoutTokens,chargeOutcome,rollback,bookingRollback,paymentState,payableRoute,membershipChargeGate,cardUtils,cardLabel}.ts`; `src/components/ui/ProcessPaymentSheet.tsx`.

---

## Known limitations referenced in this file

| ID | Summary |
|---|---|
| KL-ADMIN-001 | Attendants see a Location tab backed by company-admin-only `locationStats` → always "No location data" |
| KL-ADMIN-002 | Home title reads "Company Dashboard" for every role |
| KL-ADMIN-003 | Login "Forgot password" / "Remember me" are empty, non-functional pressables |
| KL-ADMIN-004 | Temporary auth-debug instrumentation remains in login/switch screens |
| KL-ADMIN-005 | Company details form shown to every role; attendants get a 403 after their personal details already saved; managers can edit company details the web reserves for company admins |
| KL-ADMIN-006 | Override PIN accepted as 4–6 digits on Mobile; backend requires exactly the configured PIN length |
| KL-ADMIN-007 | Hub/screen role gating is navigation-only; screens do not self-guard |
| KL-ADMIN-008 | Staff load-all silently stops at 20 pages × 100 per status pass |
| KL-ADMIN-009 | Mobile cannot set the device up as a shared PIN terminal (web can) |
| KL-ADMIN-010 | Backend users index scopes managers by account role/home `location_id`, not effective role |
| KL-ANALYTICS-001 | Custom-range dashboard cache key ignores the dates |
| KL-ANALYTICS-002 | Company-admin metrics/`locationStats` not company-filtered server-side; `location_id` not validated |
| KL-ANALYTICS-003 | "Today" metrics use device timezone; New Bookings use the venue day |
| KL-ANALYTICS-004 | Attendants are shown the company Performance Analytics UI |
| KL-PAYMENT-001 | Company admins cannot disconnect another location's Authorize.Net account from Mobile |
| KL-PAYMENT-002 | `GET /api/authorize-net/accounts/all` returns every company's accounts |
| KL-PAYMENT-003 | Restore/force-delete offered to all roles; backend refuses attendants |
| KL-PAYMENT-004 | Backend public-key error log records part of the application key |
| KL-PAYMENT-005 | Void eligibility uses a device-clock "2 days = settled" heuristic |
| KL-PAYMENT-006 | Charge handler internals (idempotency, rollback, merchant resolution) not assessed |
| KL-PAYMENT-007 | Refund requests not serialized server-side (suspected; exploitability not confirmed) |
| KL-PAYMENT-008 | Refund handler can error after money moved, or when it cannot know (Mobile reports unknown) |
| KL-PAYMENT-009 | Mobile manual refund omits the required `notes` (likely always 422) |
| KL-PAYMENT-010 | Void / Manual refund / Delete lack the duplicate-confirmation guard |
| KL-UPDATE-001 | iOS would be offered/forced to download an APK it cannot install if an active iOS record exists |
| KL-UPDATE-002 | `evaluateUpdateStatus` (block/prompt verdict) has no unit test |
| KL-UPDATE-003 | APK integrity checks are HTTPS + size + ZIP header; no checksum |
