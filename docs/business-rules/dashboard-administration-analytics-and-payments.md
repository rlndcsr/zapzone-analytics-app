# Dashboard, Administration, Analytics & Payments — Business Rules

> **Purpose:** Record the important business rules behind the dashboard, login/accounts, profile, staff management, analytics, payments and app-update areas, with where each is enforced.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e` (cited sections only); Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Rules derived from static reading of the cited Mobile code and targeted Backend/Web Admin files. "Backend (server-enforced)" is used only where the backend code was read. Nothing was executed; "Test-backed" means a `node:test` file exists for the logic, not that it was run.
> **Related:** [Feature catalog](../FEATURE_CATALOG.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Architecture](../ARCHITECTURE.md) · [Feature baseline for this area](../features/dashboard-administration-analytics-and-payments.md)

## Dashboard

### BR-DASH-001 — Dashboard layout is chosen by role, least privilege by default
- **Rule:** company_admin, location_manager and attendant each get a fixed card set and breakdown style; an unknown or missing role gets the attendant dashboard.
- **Workflow:** Home tab.
- **Enforcement layer:** Mobile client logic (data scope additionally Backend — see BR-DASH-002)
- **Evidence:** `src/lib/dashboard/dashboardConfig.ts` (`ROLE_DASHBOARDS`, `getDashboardConfig`, `DEFAULT_DASHBOARD_CONFIG`); Web Admin reference `zappoint@5de9d9e:src/pages/admin/{CompanyDashboard,ManagerDashboard,AttendantDashboard}.tsx` (existence only)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/dashboard/dashboardConfig.test.ts`)
- **Open questions:** Card-by-card parity with the three web dashboards not assessed.

### BR-DASH-002 — Metrics are scoped to the signed-in user, not the requested user
- **Rule:** The metrics endpoint ignores the `{user}` path value and computes for the authenticated user; non-admin roles are forced to their own `location_id`; only company_admin/admin may pass `location_id`; `locationStats` is returned only to company_admin.
- **Workflow:** Home, Location tab, Activity tab.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `src/services/metricsService.ts` (`fetchDashboardMetrics`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/MetricsController.php` (`dashboard`, `attendant`, `resolveMetricsLocationId`)
- **Exceptions:** Company-wide totals are not filtered by company and an admin's `location_id` is not checked against their company (KL-ANALYTICS-002).
- **Verification:** Source-verified
- **Open questions:** Is the deployment multi-company? If so, see KL-ANALYTICS-002.

### BR-DASH-003 — Dashboard snapshot cache (5 minutes, per user)
- **Rule:** A metrics response is cached in memory and as a file for 5 minutes, keyed by dashboard type, user id, location and timeframe (plus the venue date for "today"); a cached snapshot is painted first and replaced by the live response; pull-to-refresh skips the cache; `clearAllCaches` drops all snapshots after mutations.
- **Workflow:** Home dashboard.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/services/metricsCacheService.ts` (`getCacheKey`, `CACHE_EXPIRY_MS`); `src/lib/hooks/useDashboardMetrics.ts` (`loadMetrics`)
- **Exceptions:** Custom ranges share one key regardless of dates (KL-ANALYTICS-001); a result missing New Bookings is not cached.
- **Verification:** Source-verified
- **Open questions:** None.

### BR-DASH-004 — "New Bookings" means created in the period (venue day), not cancelled
- **Rule:** New Bookings and its by-status/by-package split are computed on the device from the full booking list: created within the timeframe compared as venue calendar days, excluding cancelled bookings; blank status counts as pending, no package as "Other".
- **Workflow:** Home (manager/attendant cards), Activity tab (first 10 rows + total).
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/dashboard/dashboardTimeframe.ts` (`createdWithinTimeframe`, `filterNewBookings`); `src/lib/dashboard/dashboardConfig.ts` (`newBookingBreakdowns`); `src/lib/hooks/useManagerActivity.ts`
- **Exceptions:** Metrics "today" uses the device timezone (KL-ANALYTICS-003).
- **Verification:** Test-backed (`src/lib/dashboard/dashboardTimeframe.test.ts`)
- **Open questions:** None.

### BR-DASH-005 — Avg Booking is collected booking revenue ÷ bookings
- **Rule:** Avg Booking = `bookingRevenue / totalBookings` (0 when no bookings), computed on the device.
- **Workflow:** Location manager dashboard.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/dashboard/dashboardConfig.ts` (`computeAvgBooking`)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** Whether the web computes identically was not assessed.

### BR-DASH-006 — An uncountable waiver metric shows "—", never 0
- **Rule:** When the server sets `waiverMetricsAvailable === false`, the Waivers card shows "—" with "Could not be counted — see the server log" and opens no breakdown.
- **Workflow:** Home dashboard.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/dashboard/dashboardConfig.ts` (`metricUncounted`, `waiverSections`)
- **Exceptions:** Missing flag (attendant endpoint/older server) = counted.
- **Verification:** Source-verified
- **Open questions:** None.

### BR-DASH-007 — Activity by Category: category decides first; Rage Room always wins
- **Rule:** Each day's activity is bucketed by category (party packages, attractions, escape rooms, rage rooms, events); a package's escape-room switch only claims it when its category is neither Rage Room nor Escape Room; rage/smash-room aliases map to Rage Room; cancelled rows are excluded.
- **Workflow:** Home "Activity by Category" panel.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/dashboard/activityCategories.ts` (`dashboardCategory`, `bucketForCategory`, `bucketForBooking`)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/dashboard/activityCategories.test.ts`)
- **Open questions:** None.

## Login, accounts & profile

### BR-PROFILE-001 — Sign-in form validation and error mapping
- **Rule:** Email must match a basic address pattern and the password must be ≥ 8 characters before the request is sent; 429 shows a plain "too many attempts" message, 422 maps to field errors.
- **Workflow:** Login / add account.
- **Enforcement layer:** Mobile client logic (sign-in throttle: Backend route `throttle:sign-in`)
- **Evidence:** `src/components/auth/LoginForm.tsx` (`validate`, `handleSubmit`); `zapzone-backend@ae877e2:routes/api.php` (`POST login`)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** The backend's own login validation and role restrictions were not assessed; an existing account with a shorter password could not sign in from Mobile.

### BR-PROFILE-002 — Saved accounts: at most 5; Remove ≠ Sign Out
- **Rule:** Up to 5 accounts per device. Removing an account revokes its token server-side when one is held (unregistering push first for the active account), deletes it from the device, and ends the session if it was active. A saved account is `linked` or `signin_required`; the latter needs the password again.
- **Workflow:** Accounts tab, login strip, switch bridge.
- **Enforcement layer:** Mobile client logic (token revocation: Backend `POST /api/logout`)
- **Evidence:** `src/lib/accounts/savedAccountsStore.ts` (`MAX_SAVED_ACCOUNTS`, `markAccountSignInRequired`); `src/app/(tabs)/accounts.tsx` (`removeAccount`, `handleAddAnother`)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None.

### BR-PROFILE-003 — Users cannot change their own role, location or status
- **Rule:** Self-edits may change personal details; changing one's own role/location/status, deactivating oneself, or moving an account to another company is refused.
- **Workflow:** Edit Profile, staff edit forms.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `src/services/profileService.ts` (`updateUserProfile`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/UserController.php` (`guardUserAdministration`, `guardPrivilegedUserFields`)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None.

### BR-PROFILE-004 — Company details and location logos are company-admin data
- **Rule:** Web Admin exposes company editing only on the company-admin profile; location logos change only for company_admin/admin (backend). Mobile gates logos to company admins but shows the company form to any user with a company; the backend allows company_admin/admin/location_manager to update their own company.
- **Workflow:** Profile, Edit Profile.
- **Enforcement layer:** Backend (server-enforced) for logos and company update roles; Mobile UI-only for the logo section; Web Admin reference behaviour for company editing
- **Evidence:** `src/app/profile/index.tsx` (`isCompanyAdmin`, `LocationLogos`); `src/app/profile/edit-profile.tsx` (`hasCompany`, `handleSave`); `zapzone-backend@ae877e2:routes/api.php` (`companies` update, `locations/{location}/logo`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/CompanyController.php` (`update`); `zappoint@5de9d9e:src/pages/admin/profile/CompanyAdminProfile.tsx`
- **Exceptions:** Mobile, Web and Backend disagree for location managers and attendants (KL-ADMIN-005).
- **Verification:** Source-verified
- **Open questions:** Should managers be able to edit company details?

## Staff management

### BR-STAFF-001 — Who may manage other staff accounts
- **Rule:** Only company_admin or location_manager (effective role) may view/edit/toggle/delete other accounts; accounts must be in the same company; a location manager cannot manage company admins or accounts at another location. Anyone may act on their own account within BR-PROFILE-003.
- **Workflow:** Manage Accounts, Attendants Management.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only navigation gating
- **Evidence:** `src/components/navigation/navMenuItems.ts` (`getNavMenuItems`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/UserController.php` (`guardUserAdministration`)
- **Exceptions:** Listing (`index`) is open to any staff role, scoped to company (admins) or company + home location (managers/attendants).
- **Verification:** Source-verified
- **Open questions:** `index` uses the account role rather than the PIN-narrowed effective role (KL-ADMIN-010).

### BR-STAFF-002 — Which roles each creator may create
- **Rule:** company_admin may create company_admin, location_manager or attendant; location_manager may create only location_manager or attendant, always at their own location; manager/attendant accounts require a location; the location must belong to the creator's company.
- **Workflow:** Create staff account.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic offers matching role options
- **Evidence:** `src/services/usersService.ts` (`createStaff`); `src/app/user-managements/attendants.tsx` (role options); `zapzone-backend@ae877e2:app/Http/Controllers/Api/UserController.php` (`createWithCredentials`, `guardStaffCreate`)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None.

### BR-STAFF-003 — Privileged changes to location managers are company-admin only
- **Rule:** Only a company admin may change a location manager's role, status, email or password, or delete a location manager; a manager can never grant company_admin or move an account to another location.
- **Workflow:** Edit / status toggle / delete / bulk delete.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `zapzone-backend@ae877e2:app/Http/Controllers/Api/UserController.php` (`guardPrivilegedUserFields`, `destroy`, `toggleStatus`, `bulkDelete`)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None.

### BR-STAFF-004 — Accounts that own records are deactivated, not deleted
- **Rule:** Deleting yourself is refused; deleting an account that created records which would be deleted with it returns 409 "Deactivate the account instead". Mobile shows the server's 4xx message, otherwise a generic fallback.
- **Workflow:** Delete staff account (single and bulk).
- **Enforcement layer:** Backend (server-enforced); Mobile client logic for messaging
- **Evidence:** `src/lib/staffDeleteMessage.ts` (`staffDeleteMessage`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/UserController.php` (`destroy`, `recordsDeletedWithTheAccount`)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/staffDeleteMessage.test.ts`) for messaging; backend Source-verified
- **Open questions:** None.

### BR-STAFF-005 — The users index is active-only unless a status is sent
- **Rule:** `GET /api/users` returns only active accounts when no `status` is given; Mobile's load-all therefore runs separate active and inactive passes and merges them.
- **Workflow:** Manage Accounts, Attendants Management, staff KPIs.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic
- **Evidence:** `src/services/usersService.ts` (`fetchAllStaffUsers`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/UserController.php` (`index`)
- **Exceptions:** Bounded at 20 pages per pass (KL-ADMIN-008).
- **Verification:** Source-verified
- **Open questions:** None.

### BR-STAFF-006 — Invitation links respect the inviter's role
- **Rule:** Staff invitation links are minted with the inviter's company; location managers cannot invite company admins; attendant invitations need a location.
- **Workflow:** Send Invitation.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `src/services/usersService.ts` (`createStaffInvite`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/ShareableTokenController.php` (`store`)
- **Exceptions:** The route is public (no `auth:sanctum`); the controller resolves the staff caller from an optional token. Behaviour for unauthenticated callers was not assessed.
- **Verification:** Source-verified (partial)
- **Open questions:** Unauthenticated invite creation path.

### BR-STAFF-007 — Staff PINs and terminal auto-lock
- **Rule:** PIN management (roster, set/clear/unlock, terminals) is company_admin/location_manager only. A staff PIN must be exactly the server's configured length (default 6, bounded 4–10). Terminal "Lock after" must be 15–3600 seconds (Mobile refuses out-of-range values instead of letting the server clamp).
- **Workflow:** Employee PINs.
- **Enforcement layer:** Backend (server-enforced) for roles and PIN format; Mobile client logic for idle range
- **Evidence:** `src/lib/staffPins.ts` (`canManageStaffPins`, `validateStaffPin`, `parseIdleSeconds`); `zapzone-backend@ae877e2:routes/api.php` (`staff:company_admin|location_manager` group); `zapzone-backend@ae877e2:app/Services/StaffPinService.php` (`pinLength`, `pinRule`)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/staffPins.test.ts`)
- **Open questions:** None.

### BR-STAFF-008 — Overlap-override PIN holders and verification limits
- **Rule:** Only company_admin, admin and location_manager may hold an override PIN; any staff may ask for verification; verification is limited to 5 attempts with a 15-minute lockout per IP and location. Backend requires exactly the configured PIN length; Mobile accepts 4–6 digits.
- **Workflow:** Settings (set PIN); overlap approval dialogs in booking flows.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (format pre-check)
- **Evidence:** `src/lib/overridePin.ts` (`validateOverridePin`, `overlapGateConflicts`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/OverridePinController.php` (`APPROVER_ROLES`, `MAX_ATTEMPTS`, `LOCKOUT_SECONDS`, `store`, `verify`)
- **Exceptions:** Mobile/Backend length mismatch (KL-ADMIN-006).
- **Verification:** Test-backed (`src/lib/overridePin.test.ts`) for Mobile logic; backend Source-verified
- **Open questions:** None.

### BR-STAFF-009 — Activity logs are append-only and server-scoped
- **Rule:** Activity log rows cannot be edited or deleted; listing applies the caller's auth scope; company admins filter by the active location.
- **Workflow:** Activity Log.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic for the location filter
- **Evidence:** `src/app/user-managements/activity-logs.tsx`; `zapzone-backend@ae877e2:app/Models/ActivityLog.php` (`booted`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/ActivityLogController.php` (`index`)
- **Exceptions:** None found.
- **Verification:** Source-verified (scope trait internals Not assessed)
- **Open questions:** None.

## Analytics

### BR-ANALYTICS-001 — Performance Analytics is two reports split by role
- **Rule:** location_manager sees the location report; every other role sees the company report.
- **Workflow:** Performance Analytics.
- **Enforcement layer:** Mobile client logic; Web Admin reference behaviour (two pages)
- **Evidence:** `src/app/analytics-reports/performance-analytics.tsx` (role branch); `zappoint@5de9d9e:src/pages/admin/Analytics/{CompanyAnalytics,LocationManagerAnalytics}.tsx`
- **Exceptions:** Attendants get the company UI (KL-ANALYTICS-004); Web Admin attendant access Not assessed.
- **Verification:** Source-verified
- **Open questions:** Should attendants see Performance Analytics at all?

### BR-ANALYTICS-002 — Analytics endpoints stay inside the caller's company and location
- **Rule:** Company analytics require a `company_id` equal to the caller's company; managers/attendants are narrowed to their own location; location analytics refuse another location for managers/attendants.
- **Workflow:** Performance Analytics and exports.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `src/services/analyticsService.ts` (`fetchCompanyAnalytics`, `fetchLocationAnalytics`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/AnalyticsController.php` (`getCompanyAnalytics`, `getLocationAnalytics`)
- **Exceptions:** Export handler scoping Not assessed.
- **Verification:** Source-verified
- **Open questions:** None.

### BR-ANALYTICS-003 — Accounting report location scope
- **Rule:** Blank or "all" location means every location in the caller's company; managers/attendants get only their own location; a location from another company is refused (403).
- **Workflow:** Accounting Analytics.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `src/services/analyticsService.ts` (`fetchAccountingReport`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/AccountingAnalyticsController.php` (location resolution, `getReport`)
- **Exceptions:** None found.
- **Verification:** Test-backed for Mobile scope helper (`src/lib/analytics/accountingScope.test.ts`); backend Source-verified
- **Open questions:** None.

### BR-ANALYTICS-004 — Reports follow the global active location
- **Rule:** For company admins, Performance (company), Accounting, Page Analytics, Payments, Activity Log and the dashboard use the global active location; "all" sends no location filter.
- **Workflow:** All location-aware reports.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/location/activeLocationStore.ts` (`useActiveLocation`); callers in `src/app/analytics-reports/*.tsx`, `src/app/payments/payments.tsx`, `src/app/user-managements/activity-logs.tsx`
- **Exceptions:** Manage Accounts uses its own location filter; Location tab filters client-side.
- **Verification:** Source-verified
- **Open questions:** None.

### BR-ANALYTICS-005 — Page Analytics degrades panel by panel
- **Rule:** The overview call must succeed; each other panel falls back to an empty value when its request fails.
- **Workflow:** Page Analytics.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/app/analytics-reports/page-analytics.tsx` (parallel `fetch*` calls with `.catch` fallbacks)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None.

## Payments

### BR-PAYMENT-001 — Card data goes from the device straight to Authorize.Net
- **Rule:** Card details are tokenized by Authorize.Net's Accept service directly from the device using the location's public Accept credentials; the ZapZone backend receives only opaque payment data.
- **Workflow:** Every in-app card charge.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/services/paymentsService.ts` (`fetchAuthorizeNetPublicKey`, `tokenizeCard`, `processCardPayment`); `src/lib/payments/acceptTokenize.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/AuthorizeNetAccountController.php` (`getPublicKey`, public route)
- **Exceptions:** None found.
- **Verification:** Source-verified; Device verification required for live tokenization
- **Open questions:** None.

### BR-PAYMENT-002 — Charges are tied to a payable record and location
- **Rule:** `POST /api/payments/charge` carries `location_id`, amount, opaque data, `payable_type` (booking / attraction_purchase / event_purchase / ticket_order) and `payable_id`, plus the record's checkout token; Mobile allows 60 s.
- **Workflow:** Checkout screens using `processCardPayment`.
- **Enforcement layer:** Mobile client logic; Backend route throttle `payment-charge` (handler Not assessed)
- **Evidence:** `src/services/paymentsService.ts` (`PAYMENT_TYPE`, `chargePayment`); `src/lib/payments/checkoutTokens.ts`; `zapzone-backend@ae877e2:routes/api.php`
- **Exceptions:** None found.
- **Verification:** Source-verified (Mobile); backend handler Not assessed
- **Open questions:** How the backend resolves the merchant account and validates the token (KL-PAYMENT-006).

### BR-PAYMENT-003 — Unknown charge outcomes keep the record
- **Rule:** A decline or a definite failure rolls back the record the checkout created; a transport failure (status 0), 502, 504 or 409 `CHARGE_IN_PROGRESS` means the card may have been charged, so the record is kept and the operator is told to verify.
- **Workflow:** All card checkouts.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/payments/chargeOutcome.ts` (`isChargeOutcomeUnknown`, `chargeUnknownMessage`); `src/services/paymentsService.ts` (`chargeOutcomeUnknown`, `declineMessage`)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/payments/chargeOutcome.test.ts`)
- **Open questions:** None.

### BR-PAYMENT-004 — One checkout key per sale
- **Rule:** A checkout keeps the same `checkout_key` across retries of the same sale, so a retry finds its own record instead of creating a second one. It generates a new key when the sale changes. Keys are ≤ 64 chars of `[A-Za-z0-9-]`. Whether the charge endpoint also blocks a second *charge* against that record is Not assessed (KL-PAYMENT-006).
- **Workflow:** Record creation before charging.
- **Enforcement layer:** Mobile client logic. Backend record-create endpoints answer a repeated key with `ALREADY_BOOKED` / `ALREADY_PURCHASED` (seen in the Booking, AttractionPurchase, EventPurchase and TicketOrder controllers; not traced in depth). Charge-level idempotency: Not assessed.
- **Evidence:** `src/lib/payments/checkoutKey.ts` (`newCheckoutKey`, `checkoutKeyFor`)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/payments/checkoutKey.test.ts`)
- **Open questions:** None.

### BR-PAYMENT-005 — A booking rollback that finds nothing counts as done
- **Rule:** When rolling back a booking after a failed charge, a 404 means it is already gone; any other error means it was kept.
- **Workflow:** Booking checkouts.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/payments/bookingRollback.ts`; `src/lib/payments/rollback.ts`
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/payments/bookingRollback.test.ts`)
- **Open questions:** None.

### BR-PAYMENT-006 — Refund, void and manual-refund eligibility
- **Rule:** Only payments linked to a payable qualify. Gateway refund: completed Authorize.Net payments. Void: completed or pending Authorize.Net payments no older than 2 days. Manual refund: completed cash, in-store or card payments.
- **Workflow:** Payments list row actions.
- **Enforcement layer:** Mobile UI-only (mirrors web `canRefund`/`canVoid`); backend checks Not assessed
- **Evidence:** `src/services/paymentsService.ts` (`canRefund`, `canVoid`, `canManualRefund`)
- **Exceptions:** None found.
- **Verification:** Source-verified (no test)
- **Open questions:** Does the backend enforce the same eligibility?
- **Note (spec 002, 2026-11-28):** the backend's refund handler checks `completed` + `authorize.net` and the refundable balance (`zapzone-backend@2bbd0fa` `PaymentController::refund`). When Authorize.Net rejects a **full, first** refund as unsettled (`E00027`), the server voids the charge instead and still answers 200 with `was_void_fallback: true`. That fallback **ignores `cancel`**: it cancels a booking or event purchase, and marks an attraction purchase `refunded`. Mobile always sends full refunds, so any Mobile refund can become a void. See BR-PAYMENT-010.

### BR-PAYMENT-007 — Restoring and purging payments is manager-level
- **Rule:** Soft delete, refunds, voids and invoices are available to any staff role; restore and permanent delete require company_admin, admin or location_manager.
- **Workflow:** Payments, Deleted Payments.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `src/services/paymentsService.ts` (`restorePayment`, `forceDeletePayment`); `zapzone-backend@ae877e2:routes/api.php` (payments routes)
- **Exceptions:** Mobile offers both actions to all roles (KL-PAYMENT-003).
- **Verification:** Source-verified
- **Open questions:** None.

### BR-PAYMENT-008 — Payment lists are location-scoped
- **Rule:** Managers and attendants only see their location's payments; company admins may filter by location (Mobile sends the active location); creating a payment for another location's record is refused.
- **Workflow:** Payments list, record payment.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic for the filter
- **Evidence:** `src/app/payments/payments.tsx` (`useActiveLocation`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/PaymentController.php` (role scope in listing, `denyForeignRecord`)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None.

### BR-PAYMENT-009 — One Authorize.Net account per location
- **Rule:** Each location has at most one account (409 when connected). Non-admins connect only their own location; company admins choose any location or a centralized account. Disconnect: own location, or (company admin) any location in the same company.
- **Workflow:** Settings → Payment Integration.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic for the form
- **Evidence:** `src/components/settings/PaymentIntegrationCard.tsx`; `src/services/authorizeNetService.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/AuthorizeNetAccountController.php` (`store`, `destroy`)
- **Exceptions:** Mobile disconnects only the caller's own location (KL-PAYMENT-001).
- **Verification:** Source-verified
- **Open questions:** None.

### BR-PAYMENT-010 — A refund's outcome is reported only as the server confirmed it
- **Rule:** The gateway refund's result is classified only from the server's answer, or its absence, never from message text:
  - **refunded** (`success: true`, no void marker);
  - **voided instead** (`was_void_fallback: true`), with the booking or purchase named as cancelled only when `payable_cancelled === true`;
  - **confirmed failure:** pre-gateway shapes (400 without `is_unsettled`; 403 `success:false`; 404 route binding; 422 `success:false` or `errors`; 503 `success:false`; 500 `DECRYPTION_FAILED`), or a gateway refusal with an error code;
  - **unknown:** everything else, including no answer, 502/504, a generic 500 (it can follow an approved refund), 400 "Unknown error" (the gateway never answered), and 400 `is_unsettled: true`.

  An unknown outcome is never shown as success or failure, and staff are told to verify the payment. Only a valid server amount is displayed, never the payment's own amount. One request per confirmed tap, with a 60 s budget and no automatic retry. After an unknown outcome, an in-memory warning keyed by account and payment is added to that payment's next confirmation.
- **Workflow:** Payments list → More → Refund (Authorize.Net).
- **Enforcement layer:** Mobile UI (presentation of a Backend-decided outcome). The refund and void themselves are Backend and Authorize.Net.
- **Evidence:** `src/lib/payments/refundOutcome.ts` (`classifyRefundOutcome`, `refundOutcomeNotice`); `src/lib/payments/refundFlow.ts` (`executeRefund`, `runRefundFlow`, retry-warning helpers); `src/app/payments/payments.tsx` (`confirmRefund`); `zapzone-backend@2bbd0fa:app/Http/Controllers/Api/PaymentController.php` (`refund`); Web Admin `zappoint@701e09c` (`RefundModal.tsx`).
- **Exceptions:** Approved divergences from the Web Admin: unknown outcomes, no amount fallback, and the advisory warning (specs/002).
- **Verification:** Test-backed (`src/lib/payments/refundOutcome.test.ts`, `refundFlow.test.ts`). Device verification required.
- **Open questions:** None. Backend concerns: KL-PAYMENT-007 and KL-PAYMENT-008.

## App update

### BR-UPDATE-001 — Block vs prompt rule
- **Rule:** An update exists when the installed version is behind `latest_version` or below `minimum_version`. The app is blocked when below the minimum, or when `force_update` is on **and** an update exists (a forced flag never blocks an up-to-date build).
- **Workflow:** Launch version check.
- **Enforcement layer:** Mobile client logic (version records: Backend `MobileVersionController::index`)
- **Evidence:** `src/services/appUpdateService.ts` (`evaluateUpdateStatus`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/MobileVersionController.php` (`index`)
- **Exceptions:** None found.
- **Verification:** Source-verified (no test — KL-UPDATE-002)
- **Open questions:** None.

### BR-UPDATE-002 — A forced update blocks every screen except the splash
- **Rule:** The blocking dialog has no "Later" and shows over every route (login included) except the splash; without a download link the button is disabled and the user is told to contact an administrator.
- **Workflow:** Launch.
- **Enforcement layer:** Mobile UI-only
- **Evidence:** `src/components/AppUpdateGate.tsx`; `src/components/ui/AppUpdateDialog.tsx`
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None.

### BR-UPDATE-003 — Optional updates need a download and are deferred per launch
- **Rule:** An optional prompt appears only when a download link exists and never over public routes; "Later" defers it in memory for this launch and replaces it with a persistent, non-dismissable notice (also on public routes) until the update is installed.
- **Workflow:** Launch, Settings "App Update" row.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/appUpdateNotice.ts` (`shouldShowUpdateNotice`); `src/lib/appUpdatePrompt.ts`; `src/components/AppUpdateGate.tsx`
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/appUpdateNotice.test.ts`, `src/lib/appUpdatePrompt.test.ts`)
- **Open questions:** None.

### BR-UPDATE-004 — Only a verified HTTPS APK reaches the installer (Android only)
- **Rule:** The download URL must be HTTPS; the file must have the right HTTP status (206 when resumed), be ≥ 1 MB, match the expected size and start with a ZIP header; installation is attempted only on Android.
- **Workflow:** In-app update install.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/appUpdateInstall.ts` (`apkFileProblem`, `createInstallController`); `src/services/appUpdateInstaller.ts` (`assertHttpsApkUrl`, `verifyApkFile`, `launchApkInstaller`)
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/appUpdateInstall.test.ts`); Device verification required for the installer hand-off
- **Open questions:** None.

### BR-UPDATE-005 — A failed version check never blocks or signs out
- **Rule:** The check runs once per launch with an 8 s timeout and resolves to "unknown" on any failure; the endpoint is flagged public so a 401 cannot end the session.
- **Workflow:** Launch.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/services/appUpdateService.ts` (`checkForAppUpdate`, `requestVersionPayload`); `zapzone-backend@ae877e2:routes/api.php` (`mobile/version` public)
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None.
