# Customers, Waivers & Memberships — Feature Baseline

> **Purpose:** Describe what the Mobile app's Customers, Waivers and Memberships modules actually do today, with evidence.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e` (cited sections only); Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Static source inspection of Mobile routes under `src/app/customers`, `src/app/waivers`, `src/app/memberships`, their services, hooks-level call sites, `src/lib/{waivers,concerns,customers,visitors,visitFollowUp}` and `src/lib/payments/membershipChargeGate.ts`. Backend: `routes/api.php` plus the controllers cited below (targeted sections, not whole files). Web Admin: router (`zappoint@5de9d9e:src/App.tsx`) and targeted sections of `WaiversSearch.tsx` and `Memberships.tsx` only — other web pages are **Not assessed** feature-by-feature. Nothing was run; no device testing. Screens were read selectively; where a screen's internals were not read, behaviour is marked *Inferred*.
> **Related:** [Feature catalog](../FEATURE_CATALOG.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Architecture](../ARCHITECTURE.md) · [Customers, waivers & memberships business rules](../business-rules/customers-waivers-and-memberships.md)

---

## How these modules are reached

- All three hubs are in the main nav for **every** signed-in role (`src/components/navigation/navMenuItems.ts` — `BASE_NAV_MENU_ITEMS`: `/customers/customers-hub`, `/waivers/waivers-hub`, `/memberships/memberships-hub`). There is no role filtering of these entries.
- Each hub is a `ModuleHubScreen` (`src/components/ui/ModuleHub`) with quick links and module cards. Role gating inside the modules is **client-side UI only** unless a backend reference is cited.
- Backend: every staff endpoint cited here sits inside `Route::middleware('auth:sanctum')` (`zapzone-backend@ae877e2:routes/api.php`, group opened at ~L263) and carries `staff` or `staff:<roles>` middleware unless noted as public.
- Global active location: company admins choose a workspace location via `src/lib/location/activeLocationStore.ts` (`useActiveLocation`). Each module below states whether it honours it.

### Status legend
Implementation: Implemented · Partially implemented · Not implemented · Not applicable · Not assessed. Verification: Source-verified · Test-backed · Device verification required · Inferred · Unknown.

---

# Part A — Customers

## Customers Hub
- **Purpose:** Landing screen for the Customers module.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/customers/customers-hub.tsx` | Quick links: Add Customer (`/customers/customers?add=1`), Customer Concerns, Add Member (`/memberships/memberships?add=1`); module cards: Customer Analytics, Customers, Customer Concerns, Visitor Tracking (order mirrors the web sidebar per code comment). |

- **Roles:** No role gating on the hub or its cards.
- **Source references:** `src/app/customers/customers-hub.tsx` (`CustomersHub`, `QUICK_LINKS`, `MODULES`).

## Customers (CRM contacts list)
- **Purpose:** Search, add, edit, tag, delete and export CRM contacts ("customers").
- **Implementation status:** Implemented · **Verification:** Source-verified (screen/service read selectively)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/customers/customers.tsx` | Browse every contact (table/card), filter via `CustomerFiltersSheet`, open a contact (`?openId=` deep link from notifications), add (`?add=1`), toggle Active/Inactive status from the status pill, delete one or many, export CSV of on-screen rows, run the server "Campaign Export" (`CampaignExportSheet`). |
| `src/app/customers/edit-customer.tsx` | Edit one contact (`?id=`): names, email/phone, DOB, address, company/job, source, notes, status, SMS consent, tags. |

- **Roles:** No client role checks in either screen (Grep of `src/app/customers` finds none). Backend: `contacts/*` routes are `staff` (all staff roles) — `routes/api.php` L688–702. Contact show/update/destroy call `denyContact` (record scope) — `ContactController::show/update/destroy`.
- **Location scoping:** The screen does **not** use the global active location; it loads the role-scoped set. Backend `ContactController::index` applies `applyAuthScope` then optional `company_id`/`location_id` filters (L20–33). Exact scope semantics of the shared trait were not read (*Inferred*: company admin = company, location roles = own location, per mobile comment in `contactsService.ts`). See KL-CUST-005.
- **Main workflows & operations**
  - Load-all: `fetchAllContacts` pages `GET /api/contacts` at 200/page up to 500 pages, then filters/sorts/paginates client-side (mirrors web per comment). See KL-CUST-004.
  - Create (`createContact` → `POST /api/contacts`), update (`updateContact` → `PUT /api/contacts/{id}`), status toggle (PUT with `status`), delete (`deleteContact` → `DELETE /api/contacts/{id}`; bulk = parallel single deletes, `customers.tsx` ~L581 — see KL-CUST-009), tags (`POST /api/contacts/{id}/add-tag|remove-tag`), stats (`GET /api/contacts/statistics`), tag list (`GET /api/contacts/tags`), campaign export (`POST /api/contacts/export-for-campaign`).
  - CSV export of on-screen rows is generated on device (expo-file-system legacy + expo-sharing).
- **Data sources:** `src/services/contactsService.ts` (`fetchContacts`, `fetchAllContacts`, `fetchContact`, `createContact`, `updateContact`, `deleteContact`, `addContactTag`/`removeContactTag`, `exportContactsForCampaign`); stale flag `src/lib/contactsStale.ts`.
- **Validation & business rules:** email or phone required (BR-CUST-001); delete is a hard delete (BR-CUST-003); list scope (BR-CUST-002).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/customer/Customers.tsx` (`CustomerListing`, route `/customers`) — parity **Not assessed** feature-by-feature (only the route was verified).
- **Shared components:** `CustomersTable`, `CustomerFiltersSheet`, `ContactActionsSheet`, `CampaignExportSheet`, `ViewToggle`.
- **Loading / empty / error / refresh:** progressive paint as pages arrive (`onPage` callback); `?openId` waits for full load (`complete`). Stale-on-return via `contactsStale`. Other states *Inferred*.
- **Platform-specific:** No `Platform.OS` branches in the route files. Export uses the OS share sheet (`UTI` set for iOS).
- **Tests:** None for contacts logic.
- **Known limitations:** KL-CUST-004, KL-CUST-005, KL-CUST-006, KL-CUST-009, KL-CUST-010.
- **Source references:** `src/app/customers/customers.tsx`, `src/app/customers/edit-customer.tsx`, `src/services/contactsService.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/ContactController.php` (`index`, `store`, `update`, `destroy`).

## Customer Analytics
- **Purpose:** KPIs, trends, segments and top-customer rankings, with file export.
- **Implementation status:** Implemented · **Verification:** Source-verified; display helpers Test-backed (`src/lib/customers/customerAnalyticsDisplay.test.ts`)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/customers/analytics.tsx` | Pick a period (presets or custom), read KPI cards with "vs previous period" change, status/segment breakdowns, ranked lists and charts; export selected sections. |

- **Roles:** No client gate. Backend `GET /api/customers/analytics` and `POST /api/customers/analytics/export` are `staff` (`routes/api.php` L395–396).
- **Location scoping:** Company admin → active global location sent as `location_id`; other roles send none. Backend `CustomerController::analytics` honours `location_id` only for `company_admin`, otherwise forces the user's own location (L602–609). **Note:** the backend resolves the user from a `user_id` query param (falls back to the token user) — mobile sends the current user's id. See KL-CUST-002.
- **Main workflows:** view analytics; export (`exportCustomerAnalytics` posts `format`, `include_sections`, `date_range`, optional dates/location, reads the file as base64 and shares it). Export blocked with no sections or an incomplete custom range (`exportBlockReason`, test-backed).
- **Data sources:** `src/services/customersService.ts` (`fetchCustomerAnalytics` → `GET /api/customers/analytics`; `exportCustomerAnalytics` → `POST /api/customers/analytics/export`).
- **Validation & business rules:** BR-CUST-004 (scope), BR-CUST-005 (which metrics honour the date range).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/customer/CustomerAnalytics.tsx` (route `/customers/analytics`) — same endpoints per mobile service comment; parity **Not assessed** in the web source.
- **Shared components / utilities:** `src/lib/customers/customerAnalyticsDisplay.ts` (KPI colouring, status/segment rows, ranked rows, chart helpers, stale-data rules, export block reason).
- **Loading / empty / error / refresh:** skeleton on first load; full error only when nothing has loaded; previous figures dimmed/marked stale while a new period loads; banner if the new period fails (Test-backed).
- **Platform-specific:** none found.
- **Tests:** `src/lib/customers/customerAnalyticsDisplay.test.ts` — change parsing, KPI display, status/segment/ranked rows, chart helpers, period labels/request keys, stale rules, export block reasons, colour validation.
- **Known limitations:** KL-CUST-001, KL-CUST-002, KL-CUST-003.
- **Source references:** `src/app/customers/analytics.tsx`, `src/services/customersService.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/CustomerController.php` (`analytics` L576+, `exportAnalytics`).

## Customer Concerns (checkout concerns / leads)
- **Purpose:** Follow up guests who asked for help or abandoned checkout.
- **Implementation status:** Implemented · **Verification:** Source-verified; lead filter Test-backed (`src/lib/concerns/leadFilter.test.ts`)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/customers/customer-concerns.tsx` | Load all concerns for scope, filter by timeframe / Lead / status / kind / search, see KPI stats, mark New / Contacted / Resolved (with optional resolution note), export. |

- **Roles:** No client gate. Backend `checkout-concerns` GET/PUT routes are `staff` (`routes/api.php` L681–686); `show`/`update` check `authorizeRecordScope`. `POST /api/checkout-concerns` and `/abandoned` are **public** (storefront) with throttles (L214–215).
- **Location scoping:** Honours the active global location (`fetchAllCheckoutConcerns({ locationId })`, `fetchCheckoutConcernStats`); backend index applies auth scope then `location_id`.
- **Main workflows:** status update (`PUT /api/checkout-concerns/{id}` with `status` ∈ new/contacted/resolved). The list row's `completed_booking` flag is carried over after an update because the PUT response does not include it (`customer-concerns.tsx` ~L290; backend `CheckoutConcernController::update` returns the bare model, L246–273).
- **Data sources:** `src/services/checkoutConcernsService.ts` (`GET /api/checkout-concerns`, `GET /api/checkout-concerns/statistics`, `GET|PUT /api/checkout-concerns/{id}`; `POST /api/checkout-concerns` used by other flows).
- **Validation & business rules:** BR-CUST-006 (status transitions), BR-CUST-007 (Lead filter / Booked?).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/concerns/CustomerConcerns.tsx` (route `/customer-concerns`) — mobile lead options are asserted to match the web's order in tests; web source itself **Not assessed**.
- **Shared components:** `ConcernsTable`, `ConcernCard`.
- **Tests:** `src/lib/concerns/leadFilter.test.ts` — each Lead option's semantics, combination with status filter, strict `true` for booked, option wording/order, Booked? label.
- **Known limitations:** KL-CUST-007.
- **Source references:** `src/app/customers/customer-concerns.tsx`, `src/lib/concerns/leadFilter.ts`, `src/services/checkoutConcernsService.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/CheckoutConcernController.php` (`index` L179–233 sets `completed_booking`; `update` L246–273).

## Visitor Tracking
- **Purpose:** Website visitor sessions (one visitor per day per session) with stats, export and per-session timeline.
- **Implementation status:** Implemented · **Verification:** Source-verified (service level); SMS display Test-backed
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/customers/visitor-tracking.tsx` | Load the scoped session set in one request, filter client-side, see four counters, export (server-side), open a session timeline. |

- **Roles:** No client gate. Backend `visitor-sessions/*` are `staff` (`routes/api.php` L350–355, inside the auth group).
- **Location scoping:** Honours the active global location (`location_id` on list/stats).
- **Data sources:** `src/services/visitorTrackingService.ts` — `GET /api/visitor-sessions?all=1` (`fetchAllVisitorSessions`; a `capped` flag is surfaced), `GET /api/visitor-sessions/statistics`, `GET /api/visitor-sessions/export`, `GET /api/visitor-sessions/detail`.
- **Validation & business rules:** BR-CUST-008 (SMS opt-in display).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/visitors/VisitorTracking.tsx` (route `/visitor-tracking`) — parity **Not assessed**.
- **Shared components:** `VisitorSessionsTable`; `src/lib/visitors/smsConsent.ts`.
- **Tests:** `src/lib/visitors/smsConsent.test.ts` — SMS column/CSV value (Opted In / No / blank for anonymous) and detail opt-in line.
- **Known limitations:** KL-CUST-010 (testing gap). Backend controller internals **Not assessed**.
- **Source references:** `src/app/customers/visitor-tracking.tsx` (`VisitorTracking`), `src/services/visitorTrackingService.ts`.

## Visit Follow-up Emails (cross-cutting)
- **Purpose:** After a visit is completed, show/drive the thank-you and review-request emails and guest ratings.
- **Implementation status:** Implemented (surfaced inside other modules, no own route) · **Verification:** Source-verified (service); helper logic Test-backed
- **Routes / screens:** No dedicated route. Rendered via `src/components/ui/VisitFollowUpCard.tsx`, `VisitEmailSettings.tsx`, `GuestRatingsPanel.tsx`; used from bookings (`src/app/bookings/bookings.tsx`, `edit-booking.tsx`), event purchases (`src/app/events/purchases.tsx`, `edit-purchase.tsx`), escape rooms (`EscapeRoomGameView.tsx`) and email notification screens.
- **Roles:** No client gate found in the service. Backend `visit-follow-ups/*` are `staff` (`routes/api.php` L727–733).
- **Data sources:** `src/services/visitFollowUpService.ts` — `GET /api/visit-follow-ups/visit?visit_type=&visit_id=`, `POST /api/visit-follow-ups/send-thanks`, `POST /api/visit-follow-ups/{id}/send-now`, `POST /api/visit-follow-ups/{id}/cancel`, `GET /api/visit-follow-ups/ratings` (page, per_page, `max_rating`, `location_id`).
- **Validation & business rules:** BR-CUST-009.
- **Web Admin counterpart:** **Not assessed**.
- **Tests:** `src/lib/visitFollowUp/visitFollowUp.test.ts` (wording, `describeFollowUp`, Send now / Don't send availability, bulk Complete messaging, reading `follow_up` off responses, ratings); `src/lib/visitFollowUp/statusEdit.test.ts` (send status only when changed; completing a booking sends no booking-update email).
- **Known limitations:** Backend controller **Not assessed**; response-shape differences between visit types not re-verified in this pass.
- **Source references:** `src/lib/visitFollowUp/visitFollowUp.ts`, `src/lib/visitFollowUp/statusEdit.ts`, `src/services/visitFollowUpService.ts`.

---

# Part B — Waivers

## Waivers Hub
- **Purpose:** Landing screen for Waivers.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/waivers/waivers-hub.tsx` | Quick links: Assign Waiver, Create Template, Create Group Invite; Manage row; module cards: Waiver Records, Templates, Groups Invite, Reports. |

- **Roles (UI-only):** Manage row (`manageLinksFor`): Templates / Group Invites / Returning Customers for company_admin + location_manager; Reports and Deletion Log for everyone; Settings for company_admin only. **Quick links and module cards are not role-filtered** (an attendant sees "Assign Waiver", "Create Template", "Create Group Invite" quick links and the Templates / Groups Invite cards; the backend rejects their writes — see BR-WAIVER-005/006/013).
- **Source references:** `src/app/waivers/waivers-hub.tsx` (`QUICK_LINKS`, `manageLinksFor`, `MODULES`).

## Waiver Records
- **Purpose:** Find signed/pending waivers for a visit period, check guests in, print, delete, export, and launch the kiosk.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/waivers/waivers.tsx` | Status select (Completed default / All / Pending / Expired / Replaced), Visit Period (default Today, custom range), search (name/email/phone/reference/id — server-side), Filters sheet, column chooser, period summary panel, paginated table (5/10/25/50), row actions (check-in, print, delete), detail sheet (`?openId=`), "More" shortcuts (Launch Kiosk, sub-modules, Export CSV, Refresh). |
| `src/app/waivers/create-waiver.tsx` | Assign a waiver: template + visit date + contact, optionally linked to a booking / attraction purchase / event purchase found via search. *(Internals read at service level only.)* |

- **Roles (Mobile UI):** `canAssign` / `canCheckIn` = company_admin or location_manager; `canPrint` = company_admin, or location_manager when `managerPrintExportEnabled`; `canDelete` = `canDeleteWaivers(role, adminDeleteEnabled)` → company_admin only and only when the company switch is on (default on before settings load); Export CSV and Launch Kiosk have **no** role gate.
- **Roles (Backend, verified):** list/show/print/delete/check-in routes are `staff` (`routes/api.php` L890–902). `WaiverController::destroy` → `guardAdmin` (company_admin/admin) + record scope; `print`/`export` → `guardPrintExport`; `assign` → `guardManager`; `kioskSession` → `guardStaff`; `checkIn` → any staff in record scope (no role guard, L961–992).
- **Location scoping:** Global active location is applied **client-side over the fetched page only** (`displayed` filter compares `locationName` to the active location name) — the list request sends no `location_id`, although `WaiverController::index` supports it (`applyLocationScope`, L1101–1108). The period summary *does* send `location_id` for company admins. See KL-WAIVER-001.
- **Main workflows & operations**
  - List: `useWaivers` → `GET /api/waivers?status=&timeframe|date=&search=&source=&marketing_consent_status=&page=&per_page=`. Check-In / Template / Location / Submitted-range filters are client-side over the current page.
  - Period summary: `GET /api/waivers/period-summary` (ignores the status filter by design, matches the dashboard).
  - Check-in: `POST /api/waivers/{id}/check-in`; undo: `POST /api/waivers/{id}/undo-check-in` (detail sheet).
  - Print: downloads `GET /api/waivers/{id}/print` (PDF, bearer header) then `expo-print`; 403 shown as a permission message.
  - Delete: unified `WaiverDeleteSheet` (`src/components/ui/WaiverDeleteConfirm.tsx`) → `deleteWaiver` → `DELETE /api/waivers/{id}` with optional trimmed `reason`; single-flight lock (`submitWaiverDeletion`).
  - Export CSV: built on device from the **displayed page** (ID, name, email, phone, template, location, source, minors count, marketing, dates, status). Not routed through `GET /api/waivers/export`. See KL-WAIVER-002.
  - Assign: `POST /api/waivers/assign` (`assignWaiver`); linking search uses `GET /api/bookings/search`, `GET /api/attraction-purchases`, `GET /api/event-purchases`.
- **Data sources:** `src/services/waiversService.ts`; hooks `src/lib/hooks/useWaivers` (`useWaivers`, `useWaiverStats`, `useWaiverPeriodSummary`, `clearWaiverCache`, `markWaiversStale`/`consumeWaiversStale`), `useWaiverSettings`.
- **Validation & business rules:** BR-WAIVER-001 … BR-WAIVER-005, BR-WAIVER-015.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/waivers/WaiversSearch.tsx` (`/waivers`). **Partial** parity: web sends `location_id` server-side and loads `per_page: 200` (L188–201); web Export is also a client-side CSV of filtered rows and includes more PII columns (DOB, minor details) (`handleExport` L542–563); web hides Assign for attendants (L677) and sets `canPrint={!isAttendant}` (L847). Web check-in visibility for attendants **Not assessed**.
- **Shared components:** `WaiversTable`, `WaiverFiltersSheet`, `WaiverDetailSheet`, `WaiverDeleteConfirm` (`WaiverDeleteSheet`), `LaunchKioskSheet`, `WaiverCoverageLine`, `DateRangeSheet` (sheets sequenced with 280 ms delays because stacked native sheets crash Android — comment in `waivers.tsx`).
- **Loading / empty / error / refresh:** table skeleton, `ListErrorBanner`, `ListEmptyState`, pull-to-refresh (list + stats), refetch on focus when marked stale.
- **Platform-specific:** sheet sequencing is an Android crash workaround applied on all platforms; print via `expo-print` (iOS print sheet behaviour: Device verification required).
- **Tests:** `src/lib/waivers/waiverDeletion.test.ts` (admin-only + company switch, subject fallback, reason trimming, single-flight, failure message); `src/lib/waivers/visitPeriod.test.ts` (visit-period scope); `src/lib/waivers/waiverCoverage.test.ts` (coverage line); `src/lib/waivers/templateDisplay.test.ts` (escape-room template separation).
- **Known limitations:** KL-WAIVER-001, KL-WAIVER-002, KL-WAIVER-003, KL-WAIVER-008.
- **Source references:** `src/app/waivers/waivers.tsx` (`Waivers`, `exportCsv`, `handleCheckIn`, `handlePrint`, `displayed`), `src/lib/waivers/waiverDeletion.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/WaiverController.php` (`index` L100–192, `destroy` L617–676, `checkIn` L961–992, guards L1198–1235).

## Waiver Kiosk (in-app)
- **Purpose:** Let a guest read and sign a waiver on the staff device, for a specific booking/purchase or as a walk-in against a template.
- **Implementation status:** Implemented · **Verification:** Source-verified; contract helpers Test-backed; on-device behaviour Device verification required
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/waivers/kiosk.tsx` | Entry by `token` (session bound to a record, prefilled), `templateId` (+ optional `locationId`; walk-in) or `templateId&preview=1` (draft preview via staff endpoint). Optional New/Returning Guest start, returning lookup, form, post-submit ad and success QR. |

- **How it launches:** Records "Launch Kiosk" → `LaunchKioskSheet` (standard templates only; escape-room templates excluded via `standardTemplatesOnly`) → walk-in route. Booking / purchase screens → `launchKioskSession` (`src/lib/waivers/kiosk.ts`) → `POST /api/waivers/kiosk-session` → token parsed from the returned URL (`kioskAccessTokenFrom`) → `/waivers/kiosk?token=`.
- **Roles:** launching is unrestricted in the app (comment cites backend `guardStaff`, verified at `WaiverController::kioskSession` L363–366). The kiosk form endpoints are **public** (no auth) and throttled (`routes/api.php` L85–91).
- **Main workflows:** load form (`GET /api/waivers/access/{token}` or `GET /api/waivers/kiosk/{templateId}`); submit (`POST …/access/{token}/submit` or `POST …/kiosk/{templateId}/submit`); returning lookup (`POST /api/waivers/kiosk/{templateId}/lookup`, walk-in only and only when the server reports `returning_enabled`); ad "learn more" (`POST /api/waivers/ads/learn-more`); `already completed` short-circuit.
- **Form (`src/components/waivers/KioskWaiverForm.tsx`):** signer first/last name, email, phone (validated unless returning), full DOB, minors (name, DOB, relationship; capped at template `maxMinors`), typed legal name, electronic-signature consent (when enabled), terms agreement, optional photo/video and marketing consent (when enabled), optional drawn signature (`SignaturePad`, PanResponder + react-native-svg → SVG data URI), `read_seconds`.
- **Staff exit:** `StaffReturnControl` press-and-hold (~1 s) control at the top of the form; no PIN. No keep-awake, orientation lock, back-button/gesture blocking or OS lock-down found (Grep of `kiosk.tsx`).
- **Kiosk settings:** `mapKioskSettings` maps `inactivity_timeout_seconds` (default 120), `disable_autofill`, `gps_capture_enabled`, `returning_enabled`, but only `returningEnabled` is used by the waiver kiosk; inactivity timeout is used only by the escape-room kiosk (`src/app/photos/escape-room-kiosk.tsx`). See KL-WAIVER-006.
- **Validation & business rules:** BR-WAIVER-010, BR-WAIVER-011, BR-WAIVER-012.
- **Web Admin counterpart:** the web kiosk page is a public web route — **Not assessed**. Mobile adaptation: in-app rendering of the same public endpoints (comment in `kiosk.tsx`).
- **Platform-specific:** `KeyboardAvoidingView` with `padding` on iOS only. Lock-down would rely on OS features (e.g. iOS Guided Access / Android screen pinning) — Device verification required.
- **Tests:** `src/lib/waivers/kioskContract.test.ts` (settings mapping, ad mapping, returning-profile mapping, lookup classification incl. 429, phone shape, minor cap); `src/lib/waivers/kioskToken.test.ts` (token extraction); `src/lib/waivers/signaturePath.test.ts` (stroke → SVG path/data URI); `src/lib/waivers/adPresentation.test.ts` (ad timing).
- **Known limitations:** KL-WAIVER-006, KL-WAIVER-007, KL-WAIVER-010.
- **Source references:** `src/app/waivers/kiosk.tsx` (`WaiverKiosk`), `src/components/waivers/KioskWaiverForm.tsx` (`firstProblem`, `handleSubmit`), `src/components/ui/KioskReturningPanel.tsx`, `src/components/ui/StaffReturnControl.tsx`, `src/lib/waivers/{kiosk,kioskContract,kioskToken,signaturePath}.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/WaiverPublicController.php` (`kioskLookup` L463–513, `validateSubmission` L1497–1544).

## Waiver Templates & Template Builder
- **Purpose:** Maintain the legal waiver text and its activity assignment; launch/test the kiosk per template.
- **Implementation status:** Implemented · **Verification:** Source-verified (list screen + backend guards); builder internals Inferred
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/waivers/templates.tsx` | Search / status filter; per-template sheet: Launch kiosk (active) / Test kiosk (draft), Edit, Post-waiver ads, Set active/inactive, Delete; escape-room templates route to Escape Rooms instead; deleted templates list with Restore / Delete permanently. |
| `src/app/waivers/create-template.tsx` | Create/edit a template (content, clauses such as electronic-signature consent, activities, locations via `TemplateLocationsPicker`, content tokens). |

- **Roles:** Mobile `canManage` = company_admin, or location_manager when `managerCanBuildTemplates` (L184–187); force delete is company_admin only (L645). Backend `guardCanManageTemplates` (company_admin/admin, or location_manager with `manager_can_build_templates`) guards store/update/destroy/restore/forceDestroy/updateStatus/kioskPreview (`WaiverTemplateController` L77–256, L559–575).
- **Data sources:** `GET /api/waiver-templates`, `GET /api/waiver-templates/{id}`, `POST /api/waiver-templates`, `PUT /api/waiver-templates/{id}`, `DELETE /api/waiver-templates/{id}` (soft delete — `WaiverTemplate` uses SoftDeletes), `POST …/{id}/restore`, `DELETE …/{id}/force-delete`, `PATCH …/{id}/status`, `GET …/available-activities`, `GET …/content-tokens`, `GET …/{id}/kiosk-preview`.
- **Validation & business rules:** BR-WAIVER-006.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/waivers/WaiverTemplates.tsx` and `WaiverBuilder.tsx` (`/waivers/templates`, `/create`, `/:id/edit`) — **Not assessed**.
- **Tests:** `src/lib/waivers/templateDisplay.test.ts`.
- **Known limitations:** KL-WAIVER-012.
- **Source references:** `src/app/waivers/templates.tsx` (`Templates`), `src/app/waivers/create-template.tsx`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/WaiverTemplateController.php`.

## Template Ads (post-waiver ads)
- **Purpose:** Configure image ads shown after a kiosk signature.
- **Implementation status:** Implemented · **Verification:** Source-verified (routes/roles); screen internals Inferred
- **Routes / screens:** `src/app/waivers/template-ads.tsx` — list, add/edit (multipart image upload), delete, reorder, ad settings.
- **Roles:** Mobile: reachable from templates when `canManage`; targeting and reorder only for company_admin (`template-ads.tsx` L106–108). Backend: all ad routes are `staff:company_admin|admin|location_manager` (`routes/api.php` L850–857) — not tied to `manager_can_build_templates`.
- **Data sources:** `GET|POST /api/waiver-templates/{id}/ads`, `POST /api/waiver-ads/{id}` (update, multipart), `DELETE /api/waiver-ads/{id}`, `PUT /api/waiver-templates/{id}/ads/reorder`, `PATCH /api/waiver-templates/{id}/ad-settings`.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/waivers/WaiverAds.tsx` (`/waivers/templates/:id/ads`) — **Not assessed**.
- **Tests:** `src/lib/waivers/adPresentation.test.ts`.
- **Source references:** `src/app/waivers/template-ads.tsx`, `src/services/waiversService.ts` (ads section ~L2141–2293).

## Group Invites (bulk / chaperone invites)
- **Purpose:** Send one chaperone a management link to collect a whole group's waivers.
- **Implementation status:** Implemented (staff side); chaperone and group signing pages are web-only · **Verification:** Source-verified; feedback/recipient helpers Test-backed
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/waivers/group-invites.tsx` | List invites, view recipients (`GroupInviteRecipientsSheet`), copy chaperone link / group link, resend to chaperone (admin/manager). |
| `src/app/waivers/create-group-invite.tsx` | Create an invite: template, date, chaperone name + optional email/phone, optional booking/event, allow shareable group link. |

- **Roles:** Mobile `canManage` = company_admin or location_manager (`group-invites.tsx` L183–185). Backend: routes `staff`; `store` and `resend` → `guardManager` (company_admin/admin/location_manager) (`WaiverBulkInviteController` L97–196).
- **Location scoping:** backend forces `location_id` to the user's location for location_manager/attendant and rejects bookings/events from another location (L128–143).
- **Data sources:** `GET /api/waiver-bulk-invites`, `GET /api/waiver-bulk-invites/{id}`, `POST /api/waiver-bulk-invites`, `POST /api/waiver-bulk-invites/{id}/resend`. Links are built client-side from tokens: `/waiver/bulk/{manage_token}` and `/waiver/group/{shareable_token}` on the web origin (`src/lib/waivers/chaperoneLink.ts`, `groupInvites.ts`).
- **No per-recipient resend on Mobile:** per-recipient resend/edit exist only as **public, chaperone-token** routes (`POST /api/waivers/bulk/{manageToken}/recipients/{id}/resend`, `PATCH …/recipients/{id}`; `routes/api.php` L96–102) used by the web chaperone page.
- **Validation & business rules:** BR-WAIVER-013.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/waivers/WaiverBulkInvites.tsx` (`/waivers/bulk`) — **Not assessed** beyond link shapes quoted in mobile comments.
- **Tests:** `src/lib/waivers/groupInvites.test.ts` — link paths and Copy availability, recipient ordering and counts (undelivered never counted as reached/signed), status labels incl. dark-mode colours, contact line, create-invite feedback (success only when `chaperone_notified`; missing flag treated as notified).
- **Known limitations:** KL-WAIVER-009.
- **Source references:** `src/app/waivers/group-invites.tsx`, `src/app/waivers/create-group-invite.tsx`, `src/lib/waivers/groupInvites.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/WaiverBulkInviteController.php`.

## Returning Customers (waiver profiles)
- **Purpose:** Review and correct saved signer profiles and their dependents used by the kiosk's returning-guest flow.
- **Implementation status:** Implemented · **Verification:** Source-verified (routes/service); mapping/forms Test-backed
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/waivers/returning-customers.tsx` | Search/filter profiles, see review flags. |
| `src/app/waivers/returning-customer.tsx` | One profile: edit details, add/edit/remove dependents, waiver history, other records on the same phone. |

- **Roles:** Mobile shows entry points only to company_admin/location_manager (hub + Records shortcuts). Backend routes are `staff:company_admin|admin|location_manager` (`routes/api.php` L882–889). There is no profile delete endpoint.
- **Data sources:** `src/services/waiverProfilesService.ts` — `GET /api/waiver-profiles`, `GET|PATCH /api/waiver-profiles/{id}`, `POST /api/waiver-profiles/{id}/dependents`, `PATCH|DELETE /api/waiver-profile-dependents/{id}`; stale flag `src/lib/waivers/returningCustomersStale.ts`.
- **Validation & business rules:** BR-WAIVER-014.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/waivers/WaiverProfiles.tsx` (`/waivers/profiles`, `ProtectedRoute` company_admin + location_manager, `App.tsx` L288) — route gating **Verified**; page **Not assessed**.
- **Tests:** `src/lib/waivers/returningCustomers.test.ts`.
- **Source references:** `src/lib/waivers/returningCustomers.ts`, `src/services/waiverProfilesService.ts`.

## Waiver Reports
- **Purpose:** Read-only waiver report tables.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/waivers/reports.tsx` — report type picker: completed-by-date, missing, bulk-completion, by-event, by-template, by-source, marketing-consent, deleted.
- **Roles:** No client gate (visible to attendants). Backend `GET /api/waivers/reports/{type}` is `staff`; only `ad-performance` is role-restricted (`WaiverReportController::report` L25–49). The `deleted` report returns deletion-log rows **including the snapshot** (L199–216) to any in-scope staff — see KL-WAIVER-005.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/waivers/WaiverReports.tsx` (`/waivers/reports`) — **Not assessed**. Backend types `by-escape-room` and `ad-performance` are not offered on Mobile (KL-WAIVER-011).
- **Source references:** `src/app/waivers/reports.tsx`, `src/services/waiversService.ts` (`WaiverReportType`).

## Waiver Deletion Log
- **Purpose:** Audit list of deleted waivers.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/waivers/deletion-log.tsx` — paginated log via `GET /api/waivers/deletion-log`; shows an error message on failure.
- **Roles:** Mobile shows the shortcut to every role. Backend `WaiverController::deletionLog` allows company_admin/admin, or location_manager when `manager_can_view_deletion_log`; others get 403 (L804–825). See KL-WAIVER-004.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/waivers/WaiverDeletionLog.tsx` (`/waivers/deletion-log`) — **Not assessed**.

## Waiver Settings
- **Purpose:** Company-wide waiver policy switches.
- **Implementation status:** Implemented · **Verification:** Source-verified (gates); field coverage Not assessed
- **Routes / screens:** `src/app/waivers/waiver-settings.tsx` — view settings; edit only when company_admin (`canEdit`, L112).
- **Roles:** Backend `show` any staff with a company; `update` company_admin/admin only (`WaiverSettingController` L15–67). Settings include validity/expiry days, duplicate rule, reminder window, kiosk inactivity timeout (10–600 s), kiosk autofill, GPS capture, admin delete, manager print/export, manager template building, manager deletion-log access, marketing consent options.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/waivers/WaiverSettings.tsx` (`/waivers/settings`, `ProtectedRoute` company_admin, `App.tsx` L289) — gating **Verified**.

---

# Part C — Memberships

## Memberships Hub
- **Purpose:** Landing screen for Memberships.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/memberships/memberships-hub.tsx` — quick links Add Member (`?add=1`), New Plan (`/memberships/membership-plan?create=1`); cards: Memberships, Membership Plans, Membership Reports.
- **Roles:** none in the hub.

## Memberships (members list)
- **Purpose:** Find, sell and manage member subscriptions.
- **Implementation status:** Implemented · **Verification:** Source-verified; charge gate Test-backed
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/memberships/memberships.tsx` | Search + status filter, table (default) or card view, multi-select bulk Freeze / Unfreeze / Cancel-at-term / Delete, open a member, Add Member sheet (`?add=1`, `?openId=` deep link). |
| `src/app/memberships/membership-details.tsx` | Member detail: visits, payments, notes, audit log, benefit redemptions; Freeze / Unfreeze / Reactivate (status → active) / Cancel (immediate or end of term) / Delete / Extend term / Add note / Update payment-method label / Upload photo. |
| `src/app/memberships/membership-check-in.tsx` | (Brief) scan a member QR (`POST /api/memberships/scan`) and check in (`POST /api/memberships/{id}/check-in`). |

- **Roles (Mobile):** no role checks in `src/app/memberships/memberships.tsx`, `membership-details.tsx` or `MembershipsBulkBar` (Grep). All actions are shown to all roles.
- **Roles (Backend, verified in `MembershipController`):** `destroy` company_admin only and only when status is `canceled` (422 otherwise) (L920–939); `updateStatus` and `extend` company_admin/location_manager only (L842–853, L900–914); `freeze`/`cancel` owner-or-in-scope-staff (L855–894, `ownerOrStaff` L1694–1710); `uploadPhoto`/`addNote` any authenticated staff (L956–977); `show` has no scope check in the method (L343–377) — see KL-MEMBER-002.
- **Location scoping:** list honours the active global location (`useMemberships({ locationId })`). Backend `index` restricts location_manager/attendant to memberships whose home **or** sold-at location is theirs, and `location_id` filters by home location (L266–286).
- **Main workflows & operations**
  - Add Member: customer must be picked from `GET /api/customers/search` (≥2 chars, debounced, staff-only server check); plan; optional holder name and home location; payment type `charge` / `external` / `comp` (free plans need no card). For `charge`, the merchant is resolved server-side (`GET /api/memberships/gateway-key?plan_id=&home_location_id=`), the card is tokenized with Accept.js, test card numbers are refused, then `POST /api/memberships`. The submit button is disabled until `isMembershipChargeReady` passes.
  - Bulk actions call per-id endpoints in parallel (`Promise.all`), including `DELETE /api/memberships/{id}`.
  - Detail: `GET /api/memberships/{id}` (relations: customer, plan + approved locations + active benefits, home location, last 50 visits, last 50 payments, notes, last 50 audit logs, up to 100 unreversed redemptions; computed `visits_used_this_term`); mutations `PATCH …/cancel|freeze|unfreeze|extend|status`, `POST …/notes`, `PATCH …/payment-method`, `POST …/retry-payment`, `POST …/photo` (multipart), `DELETE …`.
- **Data sources:** `src/services/membershipsService.ts`, `src/services/membershipPlansService.ts`; hooks `useMemberships`, `useMembershipPlans`; stale flag `src/lib/membershipsStale.ts`.
- **Validation & business rules:** BR-MEMBER-001 … BR-MEMBER-005, BR-MEMBER-007.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/memberships/Memberships.tsx` (`/memberships`) and `MembershipDetails.tsx` (`/memberships/:id`). **Partial**: web has a CSV export (all filtered rows and selected rows via `BulkActionsBar`, `exportCsv` L858–892); Mobile has none (KL-MEMBER-004). Other web features **Not assessed**.
- **Shared components:** `MembershipsTable`, `MembershipsBulkBar`, `ViewToggle`, `BottomSheet`.
- **Platform-specific:** Add Member card fields live in the shared `BottomSheet` (a `Modal` without keyboard avoidance) — iOS keyboard overlap is Device verification required (KL-WAIVER-013 covers the shared sheet).
- **Tests:** `src/lib/payments/membershipChargeGate.test.ts` — no gate for cash/comp/free; fails closed with no gateway, stale plan/location signature, invalid card, missing month/year/CVV.
- **Known limitations:** KL-MEMBER-001, KL-MEMBER-002, KL-MEMBER-004, KL-MEMBER-005, KL-MEMBER-006, KL-MEMBER-007.
- **Source references:** `src/app/memberships/memberships.tsx` (`Memberships`, Add Member sheet `handleCreate` ~L906–957, `runBulkStatus`, `confirmBulkDelete`), `src/app/memberships/membership-details.tsx`, `src/lib/payments/membershipChargeGate.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/MembershipController.php`.

## Membership Plans
- **Purpose:** Create and maintain plans (pricing, billing cadence, access rules, benefits).
- **Implementation status:** Implemented · **Verification:** Source-verified (roles/routes); form internals Inferred
- **Routes / screens:** `src/app/memberships/membership-plan.tsx` — plan list (table), create/edit (`?create=1`), toggle status, delete, benefits add/remove, billing account picker.
- **Roles:** Mobile `canManage` = company_admin or location_manager (L420–422). Backend: index/show `staff`; store/update/destroy/toggle-status and benefit writes `staff:company_admin|admin|location_manager` (`routes/api.php` L787–795). `MembershipPlan` is soft-deleted.
- **Data sources:** `src/services/membershipPlansService.ts` — `GET|POST /api/membership-plans`, `PUT|DELETE /api/membership-plans/{id}`, `PATCH /api/membership-plans/{id}/toggle-status`, `GET|POST /api/membership-plans/{id}/benefits`, `DELETE /api/membership-plans/{planId}/benefits/{benefitId}`, `GET /api/authorize-net/accounts/all` (`auth:sanctum` + `staff`, L154; response fields **Not assessed**).
- **Validation & business rules:** BR-MEMBER-006.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/memberships/MembershipPlans.tsx` (`/memberships/plans`) — **Not assessed**. Backend also exposes `GET /api/membership-plans/export` (not used on Mobile).
- **Source references:** `src/app/memberships/membership-plan.tsx`, `src/services/membershipPlansService.ts`.

## Membership Reports
- **Purpose:** KPIs, revenue and engagement for a date range.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/memberships/membership-reports.tsx` — date range (default: one month back to today), KPI cards (e.g. New (range), Canceled (range)), revenue/engagement sections.
- **Roles:** no client gate; backend `GET /api/membership-reports/summary` is `staff` (L797).
- **Location scoping:** the screen does **not** pass a location; `fetchMembershipReport` supports `location_id` but it is not wired (KL-MEMBER-003).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/memberships/MembershipReports.tsx` (`/memberships/reports`) — **Not assessed**.
- **Source references:** `src/app/memberships/membership-reports.tsx`, `src/services/membershipsService.ts` (`fetchMembershipReport`).

---

## Cross-module observations
- **Role gating is mostly UI-only and inconsistent across screens.** Waivers gates many actions client-side; Customers and Memberships gate almost nothing and rely on backend 403s (memberships) or allow the action for all staff (contacts).
- **Client-side CSV exports** (waivers, contacts) bypass server-side export permissions; this mirrors the web for waivers.
- **Load-all + client filtering** is used for contacts, concerns and visitor sessions; waiver records use server paging but apply some filters client-side to the current page only.
- **Shared `BottomSheet`** (`src/components/ui/BottomSheet.tsx`) is a `Modal` with no keyboard avoidance — forms inside it (Add Member card entry, dependents, filters) need iOS device verification.
- **Test coverage** is limited to pure helpers under `src/lib/**`; no screen, hook or service tests exist for these modules.
