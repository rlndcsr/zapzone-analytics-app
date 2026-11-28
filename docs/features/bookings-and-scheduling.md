# Bookings and Scheduling

> **Purpose:** Describe what the mobile app's booking, calendar, space-schedule, location-request and day-off (availability block) modules actually do today, with evidence.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e` (cited sections only); Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Static source inspection only — nothing was run, built or tested. Mobile booking routes, the booking list cache, the booking service layer and the global change-reason / blocked-period handlers were read in detail; very large screens (create/manual/edit booking, both calendars, space schedule, day-offs) were read selectively (entry points, data calls, guards, submit paths). Backend was checked only where cited. Payment internals (ProcessPaymentSheet, Authorize.Net, checkout tokens, rollback) belong to the payments baseline and are only referenced here.
> **Related:** [Feature catalog](../FEATURE_CATALOG.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Architecture](../ARCHITECTURE.md) · [Bookings & scheduling business rules](../business-rules/bookings-and-scheduling.md)

## Module map

| Module | Main route(s) | Section |
| --- | --- | --- |
| Bookings hub | `src/app/bookings/bookings-hub.tsx` | [Bookings hub](#bookings-hub) |
| Manage Bookings (list) | `src/app/bookings/bookings.tsx` | [Manage Bookings](#manage-bookings) |
| Booking details (quick view + full view) | `BookingDetailSheet` / `BookingFullView` (opened from lists & calendars) | [Booking details](#booking-details-quick-view-and-full-view) |
| Edit Booking | `src/app/bookings/edit-booking.tsx` | [Edit Booking](#edit-booking) |
| Create Booking (wizard) | `src/app/bookings/create-booking.tsx` | [Create Booking](#create-booking-step-by-step-wizard) |
| Manual Booking (incl. Custom Package) | `src/app/bookings/manual-booking.tsx` | [Manual Booking](#manual-booking-including-custom-package) |
| Booking data layer | `src/lib/bookings/bookingListCache.ts`, `src/services/bookingsService.ts` | [Booking data layer](#booking-data-layer-shared-cache) |
| Change-reason & blocked-period prompts | `src/lib/api.ts`, `ChangeReasonHost`, `BlockedPeriodHost` | [Cross-cutting prompts](#cross-cutting-prompts-change-reason-blocked-period-overlap-override) |
| Booking Calendar | `src/app/bookings/calendar.tsx` | [Booking Calendar](#booking-calendar-bookingscalendar) |
| Dashboard Calendar tab | `src/app/(tabs)/calendar.tsx` | [Dashboard Calendar tab](#dashboard-calendar-tab-tabscalendar) |
| Space Schedule | `src/app/bookings/space-schedule.tsx` | [Space Schedule](#space-schedule) |
| Location Requests | `src/app/bookings/location-requests.tsx` | [Location Requests](#location-requests) |
| Day Offs / availability blocks | `src/app/user-managements/day-offs.tsx` | [Day Offs](#day-offs--availability-blocks) |

---

# Booking management

## Bookings hub

- **Purpose:** Landing page for the Bookings module; routes staff to the list, calendar, space schedule and location requests.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
| --- | --- |
| `src/app/bookings/bookings-hub.tsx` (`BookingsHub`) | Picks Manage Bookings, Calendar View, Space Schedule or Location Requests; quick links to Manual Booking, Create Booking and Packages. |
| `src/app/bookings/check-in.tsx` (`BookingCheckInRedirect`) | Legacy route; immediately `<Redirect href="/check-in">` to the shared check-in desk (documented in the check-in baseline). Kept so old links/pushes still land. |

- **Roles:** No role check in the hub itself; entry gating lives in the app's navigation (not assessed here).
- **Web Admin counterpart:** None as a page (mobile adaptation — the web uses its sidebar).
- **Source references:** `src/app/bookings/bookings-hub.tsx` (`QUICK_LINKS`, `MODULES`), `src/components/ui/ModuleHub.tsx` (`ModuleHubScreen`).

## Manage Bookings

- **Purpose:** Search, filter and act on every booking in scope (status changes, check-in, payment, notes, location/duration edits, delete/restore, export, report, CSV import).
- **Implementation status:** Implemented · **Verification:** Source-verified (UI behaviour on device: Device verification required)
- **Routes / screens**

| Route file | What the user does |
| --- | --- |
| `src/app/bookings/bookings.tsx` (`Bookings`) | Views KPIs; searches; filters by status/date/category; switches table ⇄ cards; selects rows for bulk status/delete; opens per-row actions; toggles the Deleted (trash) view; Export / Generate Report / Bulk Import; `New` opens Manual Booking. Deep link `?openId=<id>` auto-opens that booking's details (used by notifications). |

- **Roles:** Reachable by any signed-in staff via the hub. `company_admin` sees a Location column and the workspace location selector (`isCompanyAdmin`). Backend: all mutating booking routes sit in the `staff` middleware group (`EnsureStaff::ROLES` = company_admin, admin, location_manager, attendant) — `zapzone-backend@ae877e2:routes/api.php`; `app/Http/Middleware/EnsureStaff.php`. No mobile per-action role gating was found.
- **Location scoping:** List follows the global active location (`useActiveLocation`; `"all"` → unscoped). Export, Generate Report, Bulk Import and the Deleted view instead use `currentUser.location_id` (`scopeLocationId`) — for a company admin that is normally empty, so those run company-wide; the Deleted view is then narrowed client-side by **location name** to the active location (`deletedScoped`). See KL-BOOK-006.
- **Main workflows & operations**
  - **List & KPIs:** Total, Package Bookings (same number as Total), Participants, Revenue (sum of `amountPaid`, cancelled excluded), Possible Revenue (sum of `totalAmount`, cancelled excluded). All computed client-side from the cached list.
  - **Filtering (client-side):** search over customer name, package name, reference and location name only; Status (5 statuses); Date (All / Upcoming / Today / Past against the device's local date); category chips built from package display label. Default sort: checked-in last, then date desc, then time desc (`compareBookingsDefault`, web `applyDefaultSort` parity). Client pagination 5/10/15 per page.
  - **Views:** Table (default) or cards (`ViewToggle`); column chooser (`ColumnsSheet`, web defaults). Deleted view always uses cards.
  - **Bulk (table only, current page only):** status → pending/confirmed/checked-in/completed/cancelled via `bulkSetBookingStatus` (checked-in goes through `POST /api/bookings/check-in` when a reference exists, else `PATCH /status`); Completed asks for confirmation first (guest emails). Bulk delete asks for one change reason, then soft-deletes each id individually with it (`deleteBooking` × N) rather than calling `/bookings/bulk-delete`.
  - **Row actions (table):** Process Payment (`$`, only when not settled), Check-in (only when payment state is `paid` and status ≠ checked-in — web parity, `BookingsTable` actions column), Internal Notes log, Set Status sheet (any of 5 statuses via `PATCH /status`), Change Location sheet, Edit Duration sheet, View, Edit (→ `/bookings/edit-booking?id=`), Delete (soft delete).
  - **Card "More" sheet (`BookingActionsSheet`):** View Details (hub mode), Check In (only `confirmed` **and** fully paid **and** has reference), Delete (soft), Restore (deleted view).
  - **Export:** `GET /api/bookings/export` → CSV built on device with the web's column order → system share sheet (`expo-file-system/legacy` + `expo-sharing`).
  - **Generate Report:** `BookingsReportSheet` builds a `GET /api/bookings/details-report` URL (today/monthly/custom, individual/list, include cancelled).
  - **Bulk Import:** `BookingsImportSheet` uploads CSV via multipart `POST /api/bookings/bulk-import-csv` (requires a `location_id`).
  - **Deleted view:** `GET /api/bookings/trashed`; restore via `POST /api/bookings/{id}/restore`.
    - **Restore outcome (spec 002, 2026-11-28):** `restoreBooking` → `executeRestore`, classified only from the server's answer (`classifyRestoreOutcome`, `src/lib/bookings/restoreOutcome.ts`):
      - **Restored:** "Booking restored".
      - **Restored with a clash** (`space_warning`; the server permits the overlap and re-books the slots): "Booking restored — time clash" with the server's full warning.
      - **Confirmed rejection:** only the pre-change shapes (403 `success:false`; 422 `success:false`; 422 `errors.change_reason`; 409 `code:"BLOCKED_PERIOD"`). Shows "Restore failed" (today's text) and does not refresh.
      - **Unknown:** no answer, 5xx, any 404, a malformed 2xx, or other shapes. Shows "The booking restoration could not be confirmed. Please check the booking status before attempting to restore it again."
      - **Refresh:** confirmed and unknown outcomes reload the Deleted list **and** run the incremental active-list sync (`refetch`), because the active list does not re-sync when View Deleted closes. A failed refresh never changes the alert.
      - **Prompts:** the shared client's change-reason and blocked-period prompts and their single authorized continuation are unchanged.
      - **No retry and no stale feedback:** the feature never retries after an outcome. A session-owned single-flight guard stops duplicate confirmations.
- **Data sources:** `useBookings` → `syncBookingList` (see data layer) → `GET /api/bookings` (`sync=1`, `updated_since`); `PATCH /api/bookings/{id}/status`; `POST /api/bookings/check-in`; `DELETE /api/bookings/{id}`; `GET /api/bookings/trashed`; `POST /api/bookings/{id}/restore`; `GET /api/bookings/export`; `GET /api/bookings/details-report`; `POST /api/bookings/bulk-import-csv`; `GET /api/bookings/{id}` (payment sheet amounts); `GET /api/mobile/locations` (Change Location, lazily on first open).
- **Validation & business rules:** BR-BOOKING-001, BR-BOOKING-002, BR-BOOKING-003, BR-BOOKING-004, BR-BOOKING-005, BR-BOOKING-006, BR-BOOKING-007.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/bookings/Bookings.tsx` (`Bookings`). Parity: **Partial** — check-in gate (`paymentStatus === 'paid'` && not checked-in), default sort, CSV columns and per-id bulk delete with reason (`handleBulkDelete`) verified as matching; web keeps its list in `BookingCacheService` (persistent, 30-min full re-sync with jitter, `FULL_MAX_PAGES` 5000) while mobile's cache is in-memory with a 100-page cap (mobile adaptation; see KL-BOOK-002). Remaining web filters not compared (Not assessed).
- **Shared components & utilities:** `BookingsTable`, `BookingsBulkBar`, `BookingActionsSheet`, `BookingDetailSheet`, `ProcessPaymentSheet` (payments baseline), `ChangeLocationSheet`, `EditDurationSheet`, `InternalNotesLog`, `BookingsReportSheet`, `BookingsImportSheet`, `ColumnsSheet`, `ViewToggle`, `CategoryChips`, `PaginationControls`, `LocationWorkspaceSelector`, `src/lib/calendar/categoryFilter.ts` (`categoryKeyOf`), `src/lib/payments/paymentState.ts` (`resolvePaymentState`).
- **Loading / empty / error / refresh:** skeletons while loading; stale cached list painted instantly and refreshed quietly; red error card with "Try again"; distinct empty states (no bookings → Manual Booking CTA; filtered empty → "Clear search & filters"); pull-to-refresh forces a sync; `useFocusEffect` refetches once after any screen called `markBookingsStale()`.
- **Platform-specific behaviour:** No `Platform.OS` branches in the screen. Export passes both `mimeType` (Android) and `UTI` (iOS) to `Sharing.shareAsync`. Sheets are RN `Modal`s without keyboard avoidance (see KL-BOOK-010).
- **Tests:** `src/lib/bookings/bookingSearch.test.ts` (search helper), `src/lib/bookings/bookingCheckIn.test.ts` (`isCheckInEligible`, `outstandingBalanceOf`), `src/lib/bookings/importSummary.test.ts` (CSV import result summary), `src/lib/bookings/patchBooking.test.ts`, `src/lib/calendar/categoryFilter.test.ts`. The screen itself has no tests.
- **Known limitations:** KL-BOOK-001 (three different check-in gates), KL-BOOK-002 (10,000-booking cap), KL-BOOK-003 (Set Status can force `checked-in` on any status), KL-BOOK-004 (reasons requested reactively after a 422), KL-BOOK-006 (export/report/import/deleted ignore active location), KL-BOOK-007 (Package Bookings KPI duplicates Total), KL-BOOK-010 (sheet keyboard / iOS stacking), KL-BOOK-018 (remembered blocked-period confirmations not cleared on sign-out).
- **Source references:** `src/app/bookings/bookings.tsx` (`Bookings`, `compareBookingsDefault`, `buildBookingsCsv`, `runBulkStatus`, `confirmBulkDelete`, `rowHandlers`), `src/components/ui/BookingsTable.tsx` (actions column `canCheckIn`), `src/components/ui/BookingActionsSheet.tsx` (`canCheckIn`), `src/services/bookingsService.ts` (`bulkSetBookingStatus`, `exportBookings`, `buildBookingsReportUrl`, `bulkImportBookingsCsv`, `fetchTrashedBookings`, `restoreBooking`).

## Booking details (quick view and full view)

- **Purpose:** Inspect one booking and act on it without leaving the list/calendar: summary hub, full web-parity details, check-in, payment, status, QR, notes, change history, delete.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** Not a route — `BookingDetailSheet` (bottom sheet, modes `hub` | `details`) hosting `BookingFullView`. Opened from Manage Bookings (card tap → details, More → hub), both calendars and the space schedule.
- **Roles:** Same as the hosting screen; no in-sheet role checks found.
- **Main workflows & operations**
  - Hub: summary + Edit (→ `/bookings/edit-booking?id=`) + Process Payment (`ProcessPaymentSheet`).
  - Check-in (quick view): offered whenever `isCheckInEligible` (status `confirmed`) and a reference exists — **payment not required**. If a balance is owed the confirm dialog says so ("Check in with a balance due?", "Check in anyway") and states that check-in records no payment.
  - Full view (`BookingFullView`): all booking fields, payments, fees/discounts, custom-field answers, connected waivers (read-only), View QR Code (`BookingQRModal`, encodes reference), **Internal Staff Notes log — writable** (add / correct via `InternalNotesLog`; corrections keep revisions), immutable Change History (`BookingChangeHistory` → `GET /api/bookings/{id}/change-logs`), Delete Booking (soft delete → `onDeleted` refresh).
- **Data sources:** `GET /api/bookings/{id}`; `POST /api/bookings/check-in`; `GET|POST /api/bookings/{id}/internal-notes`; `PUT /api/bookings/{id}/internal-notes/{noteId}`; `GET /api/bookings/{id}/change-logs`; `DELETE /api/bookings/{id}`; waivers endpoint (waivers baseline).
- **Validation & business rules:** BR-BOOKING-001, BR-BOOKING-002, BR-BOOKING-008 (notes are an append-only log).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/bookings/ViewBooking.tsx` — parity **Not assessed** in detail beyond field mapping claims in `mapBookingDetail` comments.
- **Loading / empty / error / refresh:** in-sheet loading and error text; check-in errors shown inline; `onChanged` triggers the host's refetch.
- **Platform-specific behaviour:** None found; RN `Alert` used for confirmations.
- **Tests:** `src/lib/bookings/bookingDetailFields.test.ts` (address line, add-on unit price), `src/lib/bookings/bookingNotes.test.ts`, `src/lib/bookings/bookingSummaryLines.test.ts`, `src/lib/bookings/bookingCheckIn.test.ts`.
- **Known limitations:** KL-BOOK-001.
- **Source references:** `src/components/ui/BookingDetailSheet.tsx` (check-in confirm block), `src/components/ui/BookingFullView.tsx`, `src/components/ui/InternalNotesLog.tsx`, `src/services/bookingsService.ts` (`mapBookingDetail`, `fetchInternalNotes`, `addInternalNote`, `updateInternalNote`, `fetchBookingChangeLogs`).

## Edit Booking

- **Purpose:** Change an existing booking (customer, package, space, date/time, participants, status, guest of honour, customer notes, add-ons, location) with a server-computed price.
- **Implementation status:** Implemented (package bookings); custom-package terms are not editable (Partially implemented for custom bookings) · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
| --- | --- |
| `src/app/bookings/edit-booking.tsx` (`?id=`) | Edits fields; picks a slot from live availability (with day-off closures); sees a server quote; saves; adds internal notes; views change history; non-admins can submit a location-change request instead of moving the booking. |

- **Roles:** `company_admin` gets a location picker (move directly); other roles get a "request location change" form (`createLocationChangeRequest`). Backend: `PUT /api/bookings/{id}` is `staff`-only and checks record scope (`denyForeignRecord`) and, when `location_id` changes, access to both locations (`guardLocationAccess`) — `BookingController::update`.
- **Location scoping:** Package/space pickers reload for the selected location; day-offs for that location are loaded.
- **Main workflows & operations**
  - Load: `GET /api/bookings/{id}` seeds the form once per `bookingId` (effect keyed on `bookingId`, cancelled via an `active` flag); locations and package detail fetches use `AbortController`.
  - Availability: `GET /api/mobile/packages/{id}/availability?date=` for slots; `GET /api/packages/{id}/availability-schedules` restricts the calendar; `GET /api/day-offs/location/{id}` for closures (`editBookingAvailability`).
  - Pricing: `useBookingQuote` → `POST /api/bookings/{id}/reprice` (300 ms debounce, abortable). Save is blocked while a quote is loading or failed. Total, discount, persisted fees and (when the special changed) `applied_discounts` come from the quote; `amount_paid` is never sent.
  - Save: `PUT /api/bookings/{id}` (`updateBooking`) → `markBookingsStale()` → back. Completed status shows follow-up email notice. `send_notification` follows the "Customer will receive update" toggle (`bookingUpdateEmailWanted`).
  - Overlap: a 409 that needs a manager PIN opens `OverlapOverrideModal`; the retry resends the same input with the minted `overlap_override_token` and the already-given change reason.
- **Data sources:** see above, plus `GET /api/mobile/packages`, `GET /api/rooms`, `GET /api/packages/{id}`, `POST /api/bookings/{id}/location-change-requests`.
- **Validation & business rules:** BR-BOOKING-009 (server quote drives edit totals), BR-BOOKING-010 (participant min/max), BR-BOOKING-011 (overlap / manager override), BR-AVAIL-001 (blocked periods), BR-BOOKING-012 (change reason).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/bookings/EditBooking.tsx` — parity **Partial / Not assessed in detail** (mobile comments cite the web's debounce and summary split; not independently compared).
- **Shared components & utilities:** `BookingSummaryPanel`, `InternalNotesLog`, `BookingChangeHistory`, `OverlapOverrideModal`, `src/lib/bookings/editBookingAvailability.ts`, `src/lib/bookings/onlineSlotsLost.ts`, `src/lib/bookings/guestOfHonorPayload.ts`, `src/lib/bookings/bookingSummaryLines.ts`, `src/lib/overridePin.ts` (`overlapGateConflicts`).
- **Loading / empty / error / refresh:** load error screen ("Missing booking id.", fetch errors); "Pricing not ready" alert as a backstop; save errors via `Alert`.
- **Platform-specific behaviour:** None found in the inspected parts.
- **Tests:** `src/lib/bookings/editBookingAvailability.test.ts`, `src/lib/bookings/onlineSlotsLost.test.ts`, `src/lib/bookings/guestOfHonorPayload.test.ts`, `src/lib/bookings/bookingSummaryLines.test.ts`, `src/lib/bookings/durationEditor.test.ts`.
- **Known limitations:** KL-BOOK-008 (custom-package bookings: no quote, terms not editable).
- **Source references:** `src/app/bookings/edit-booking.tsx` (load/seed effect, `submitUpdate`, `handleSave`), `src/lib/hooks/useBookingQuote.ts`, `src/services/bookingsService.ts` (`updateBooking`, `repriceBooking`).

## Create Booking (step-by-step wizard)

- **Purpose:** Five-step staff checkout for a package booking: Package → Space, Date & Time → Add-ons/Attractions → Customer → Review & Payment.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/bookings/create-booking.tsx` (`STEP_LABELS`, `STEP_HEADINGS`).
- **Main workflows & operations**
  - Slots from `GET /api/mobile/packages/{id}/availability`; fees/special pricing resolved fresh at submit; promo and gift-card codes sent for server redemption.
  - Submit `POST /api/bookings` with `checkout_key` (new key when package/date/time/space/party size changes), optional `overlap_override_token`. In-store → `status: confirmed` + payment status; pay-later → `payment_status: pending`; card → neither (charge endpoint sets them).
  - After create: in-store records a payment (`POST /api/payments`, capped at the server-saved total); card charges **what the server says is still due** (`serverDue`), stores the QR when the server already confirmed (e.g. gift card covered it), and rolls back on decline/failure but keeps the booking when the charge outcome is unknown.
- **Data sources:** `POST /api/bookings`, `POST /api/payments`, `POST /api/bookings/{id}/qrcode`, payment charge + rollback (payments baseline).
- **Validation & business rules:** BR-BOOKING-013 (checkout idempotency), BR-BOOKING-014 (staff totals not server-enforced by default), BR-BOOKING-011, BR-AVAIL-001.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/bookings/OnsiteBooking.tsx` (mobile comments cite "web OnsiteBooking") — parity **Not assessed** beyond cited comments.
- **Tests:** `src/lib/bookings/packageCandidates.test.ts`, `src/lib/bookings/walkInCustomer.test.ts`, `src/lib/bookings/onsiteCodes.test.ts`, `src/lib/bookings/bookingPrefill.test.ts` (helpers only).
- **Known limitations:** KL-BOOK-009 (Manual Booking does not use server-saved amounts; Create Booking does).
- **Source references:** `src/app/bookings/create-booking.tsx` (submit block around `createBooking`, `serverDue`), `src/services/bookingsService.ts` (`createBooking`, `storeBookingQrCode`, `recordBookingPayment`).

## Manual Booking (including Custom Package)

- **Purpose:** Desk entry of a booking in one form — either for a catalog package (Standard mode = live slots; Flexible mode = any date/time/space) or for a **Custom Package** whose terms staff type in.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/bookings/manual-booking.tsx`; `src/components/bookings/CustomPackageFields.tsx`.
- **Roles:** Company admin can pick the location (for custom packages, `canPickCustomLocation = isCompanyAdmin`); others use their own location. Backend: `custom_package` is refused unless the caller is staff (`CustomPackagePricer::STAFF_ONLY_MESSAGE`) — `BookingController::store`.
- **Main workflows & operations**
  - Status defaults to `confirmed` (picker offered); payment methods: in-store, Authorize.Net card, pay later.
  - Package booking: fees/special pricing re-resolved at submit (`resolveFreshPricing`); staff may override total and amount paid.
  - Custom Package: name, category, duration (1–1,440 min), min/max guests, pricing type (per booking/per guest), price, custom fees (flat/percent), one-time add-ons, plus catalog add-ons and a space; no attractions, no discounts. Total computed by a port of the web's `utils/customBooking.ts` so it matches `CustomPackagePricer` (else `CUSTOM_PRICE_MISMATCH`). Sends `package_id: null` + `custom_package` payload, `duration_unit: minutes`.
  - Both send `is_manual_entry: true`, `skip_date_validation` (Flexible mode), `checkout_key`, `overlap_override_token`, `sent_email_to_staff`, `send_email`.
  - After create: in-store records a payment of the client-computed amount; card charges the client-computed `paidNow` (not server-saved amounts), with rollback on decline and keep-on-unknown.
  - Day-offs for the location are loaded in Flexible/Custom mode to warn about closed slots (`isCustomSlotClosed`).
- **Data sources:** `POST /api/bookings`, `POST /api/payments`, `GET /api/day-offs/location/{id}`, packages/rooms/add-ons/categories lookups, payment charge (payments baseline).
- **Validation & business rules:** BR-BOOKING-015 (custom package rules), BR-BOOKING-013, BR-BOOKING-014, BR-BOOKING-016 (`skip_date_validation` ignored by backend), BR-BOOKING-011, BR-AVAIL-001.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/bookings/ManualBooking.tsx` — mobile `customBooking.ts` declares itself a port of web `utils/customBooking.ts`; parity **Partial (not compared line-by-line)**.
- **Tests:** `src/lib/bookings/customBooking.test.ts` (custom totals/validation), `src/lib/bookings/packageCandidates.test.ts`.
- **Known limitations:** KL-BOOK-009, KL-BOOK-011 (`skip_date_validation` / `is_manual_entry` have no server effect).
- **Source references:** `src/app/bookings/manual-booking.tsx` (`handleSubmit`), `src/lib/bookings/customBooking.ts` (`CUSTOM_PACKAGE_LIMITS`, `customPackagePayload`), `zapzone-backend@ae877e2:app/Services/Checkout/CustomPackagePricer.php`.

---

# Shared booking infrastructure

## Booking data layer (shared cache)

- **Purpose:** One in-memory source of truth for the booking list shared by Manage Bookings and both calendars.
- **Implementation status:** Implemented · **Verification:** Test-backed for the merge helpers (`src/lib/bookings/bookingSync.test.ts`, `src/lib/bookings/cacheOwner.test.ts`, `src/lib/bookings/patchBooking.test.ts`); cache module itself Source-verified.
- **Behaviour**
  - Full list: `GET /api/bookings?sync=1&per_page=100&sort_by=booking_date&sort_order=desc` paged to at most **100 pages (10,000 bookings)**; if the server refuses sync (403/422) it re-pages without `sync`. The sync cursor is kept only if the downloaded count equals `pagination.total`.
  - Incremental: within 30 min of the last full download, `GET /api/bookings?updated_since=<cursor>&per_page=500[&before_id]` (≤ 20 pages) merges changed rows and removes `deleted_ids`; if the scope string differs or merged count ≠ server `total`, a full download runs instead.
  - Freshness: entries are "fresh" for 5 minutes (`CACHE_TTL_MS`); stale data is shown instantly and refreshed quietly.
  - Range windows (calendars): `GET /api/bookings?date_from&date_to` kept in a separate LRU map (24 entries); a fresh full list is filtered instead of fetching.
  - Mutations: `markBookingsStale()` hard-clears everything (including in-flight joins; late results are discarded) and sets a one-shot flag consumed on focus; `patchCachedBooking` merges fields (e.g. the notes digest) into every cached copy and notifies subscribers.
  - Ownership: cache is reset whenever the session token changes (`createOwnerGuard(getToken())`).
- **Backend contract (verified):** `BookingController::index` supports `date_from`/`date_to`, `booking_date`, `status`, `search`, `reference_number`, `location_id`; caps `per_page` at 100 (500 for `updated_since`); sync is staff-only (403 otherwise), cannot be combined with filters (422), cursors older than 3 h or > `sync_max_changed_ids` changes return 422 (client then re-downloads). Note: the comment above `PER_PAGE` in `bookingsService.ts` ("there's no date-range filter") is stale.
- **Source references:** `src/lib/bookings/bookingListCache.ts` (`syncBookingList`, `loadBookingList`, `syncBookingRange`, `markBookingsStale`, `patchCachedBooking`), `src/lib/bookings/bookingSync.ts` (`applyBookingChanges`, `newestFirst`), `src/lib/hooks/useBookings.ts`, `src/lib/hooks/useCalendarBookings.ts`, `src/services/bookingsService.ts` (`fetchAllBookings`, `fetchBookingChanges`, `fetchBookingsInRange`, `fetchDayBookings`).
- **Known limitations:** KL-BOOK-002, KL-BOOK-005 (in-memory only, lost on app restart).

## Cross-cutting prompts (change reason, blocked period, overlap override)

- **Change reason:** any non-public request answered `422` with `errors.change_reason` (and no reason in the body) triggers `requestChangeReason` → `ChangeReasonHost` (bottom sheet with presets from `GET /api/bookings/change-reason-options`, min 3 chars) → one automatic retry with `change_reason`. The reason is kept on the thrown `ApiError` so a caller's own retry does not re-ask. (`src/lib/api.ts` `apiRequest`; `src/lib/changeReasonPrompt.ts`; `src/components/ui/ChangeReasonModal.tsx`.)
- **Blocked period:** a `409` with `code: BLOCKED_PERIOD` opens `BlockedPeriodHost` ("Book anyway" armed after 400 ms); on confirm the request is resent with `acknowledge_blocked_period: true` + `acknowledged_block_ids`; confirmations are remembered for 5 minutes per actor+target and one answer settles queued saves inside the same blocks (bulk). Declining throws "Not saved: that time is inside a blocked period." (`src/lib/blockedPeriodPrompt.ts`, `src/components/ui/BlockedPeriodHost.tsx`).
- **Overlap override:** a 409 requiring a manager PIN opens `OverlapOverrideModal` in the booking screens; the PIN mints a short-lived token sent as `overlap_override_token` once.
- **Hosts:** both hosts are mounted once after `<Stack>` in `src/app/_layout.tsx`. Because they are RN `Modal`s, presentation over an already-open sheet `Modal` on iOS needs device verification (KL-BOOK-010).
- **Rules:** BR-BOOKING-011, BR-BOOKING-012, BR-AVAIL-001.

---

# Calendars and scheduling

## Booking Calendar (bookings/calendar)

- **Purpose:** Month / week / day browse of bookings plus the day's attraction tickets and event registrations, filtered by search, package and category. Port of the Web Admin CalendarView.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/bookings/calendar.tsx` — default **month** view; Today jumps to day view; day cells open a day sheet listing bookings, attraction purchases (→ `/attractions/purchase-details`) and event purchases (→ `/events/purchase-details`); a booking opens `BookingDetailSheet`.
- **Roles:** Any staff reaching the Bookings hub; no role checks in the screen.
- **Location scoping:** Global active location (`useActiveLocation`; `"all"` = unscoped); `LocationWorkspaceSelector` rendered on the screen.
- **Main workflows & operations:** read-only browsing; filters = search (bookings only, `matchesDeskBookingSearch`) + multi-select packages (real package names only) + category tabs (`useCategoryFilter`, which also filters the ticket/registration overlay); package colour legend.
- **Data sources:** `useCalendarBookings` → `GET /api/bookings?date_from&date_to` for the visible window (or a fresh full list filtered); `useScheduledExtras` → attraction purchases (`scheduled_from`/`scheduled_to`) and event purchases (`start_date`/`end_date`) for the window (failures swallowed).
- **Validation & business rules:** BR-CAL-001, BR-CAL-004.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/bookings/CalendarView.tsx` — parity **Partial (claimed in code comments; not compared line-by-line)**.
- **Shared components & utilities:** `CalendarCategoryTabs`, `CalendarDaySections`, `src/lib/calendar/categoryFilter.ts`, `src/lib/calendar/packageColors.ts`, `src/lib/date/venueTime.ts` (`venueToday`).
- **Loading / empty / error / refresh:** month/week/day skeletons; pull-to-refresh forces a range sync; booking patches repaint via cache subscription.
- **Platform-specific behaviour:** The day sheet is closed before opening a booking because "stacking two native Modals crashes on Android" (comment in `openBooking`) — Device verification required.
- **Tests:** `src/lib/calendar/categoryFilter.test.ts`.
- **Known limitations:** KL-BOOK-010.
- **Source references:** `src/app/bookings/calendar.tsx` (`filtered`, `categories`, `visibleExtras`, `openBooking`), `src/lib/hooks/useCalendarBookings.ts`, `src/lib/hooks/useScheduledExtras.ts`.

## Dashboard Calendar tab ((tabs)/calendar)

- **Purpose:** Front-desk day board: spaces as columns over the venue's operating window, bookings and attraction purchases placed on a minute scale, free time, closures, overlap summary, and tap-to-book. Also week/month views. Ports the Web Admin **dashboard** calendar (not CalendarView).
- **Implementation status:** Implemented · **Verification:** Source-verified (grid maths Test-backed — see Tests); gesture behaviour Device verification required.
- **Routes / screens:** `src/app/(tabs)/calendar.tsx` — default **day** view; customer search (`CalendarCustomerSearch`) jumps to a booking's day; hide-empty-spaces toggle; long-press "pick" marker shows the minute a tap would book.
- **Roles:** Any signed-in staff (tab). Not assessed further.
- **Location scoping:** Global active location; only that location's spaces become columns when one is selected.
- **Main workflows & operations**
  - Tap a free band (not on past dates) → `/bookings/create-booking` pre-filled (location, date, minute snapped to a real start, space, candidate packages, free-until / next-booking minutes) via `buildBookingParams`.
  - Walk-in from a column header (today only): minute snapped down to 5 min, bypassing package start snapping; opens the form even if the gap is short (the form refuses what will not fit).
  - Tap a booking → `BookingDetailSheet`.
- **Data sources:** `useCalendarBookings` (`date_from`/`date_to`), `useAttractionPurchases`, `useSpaces` → `GET /api/rooms`, `useLocationOptions` → `GET /api/mobile/locations`, `useScheduleDayWindow` → `GET /api/schedule/day-window?date[&location_id]` (day view only; null on failure, never guessed), `useNotifications`.
- **Validation & business rules:** BR-CAL-001, BR-CAL-002, BR-CAL-004.
- **Web Admin counterpart:** web dashboard calendar — file **Not assessed** at `zappoint@5de9d9e`.
- **Shared components & utilities:** `src/lib/calendar/dayGrid.ts`, `src/lib/calendar/dayGridSlots.ts` (`resolveSlotTap`, `resolveWalkInTap`, `walkInFit`), `src/lib/bookings/freeTime.ts`, `src/lib/bookings/minuteScale.ts`, `src/lib/bookings/bookingCell.ts`, `BookingCellBody`, `src/lib/bookings/bookingPrefill.ts` (`CREATE_BOOKING_PATH`, `buildBookingParams`, `readBookingPrefill`).
- **Loading / empty / error / refresh:** pull-to-refresh refetches bookings, purchases and spaces together; "now" tick refreshes on focus.
- **Platform-specific behaviour:** None found in inspected parts.
- **Tests:** `src/lib/calendar/dayGrid.test.ts`, `src/lib/calendar/dayGridSlots.test.ts`, `src/lib/bookings/freeTime.test.ts`, `src/lib/bookings/minuteScale.test.ts`, `src/lib/bookings/bookingCell.test.ts`, `src/lib/bookings/bookingPrefill.test.ts`, `src/lib/rooms.test.ts`, `src/lib/participants.test.ts`.
- **Known limitations:** KL-BOOK-010.
- **Source references:** `src/app/(tabs)/calendar.tsx` (`openBookingForTap`, `openSlot`, `startWalkIn`, `isPastDate`), `src/services/scheduleWindowService.ts` (`fetchScheduleDayWindow`).
- **Not in booking scope:** `src/lib/nativeCalendar.ts` / `src/lib/calendarEvent.ts` (device-calendar export) are used by attraction purchase details, not by booking screens.

## Space Schedule

- **Purpose:** Per-space timeline (grid) or list for one day, with closures, breaks, out-of-service spaces, free time and a 7-day strip with booking counts; tap free time to start a booking.
- **Implementation status:** Implemented · **Verification:** Source-verified (grid maths Test-backed: `src/lib/bookings/spaceScheduleGrid.test.ts`)
- **Routes / screens:** `src/app/bookings/space-schedule.tsx` — grid/list toggle, zoom, category/status/search filters and hide-empty-spaces (persisted in in-memory view state), live "now" line (1-min interval + app-foreground refresh).
- **Roles:** Any staff via the hub; read-only except starting a new booking. No drag/move of bookings found.
- **Location scoping:** Active location for bookings/day window; day-offs use the active location or the user's own `location_id`.
- **Main workflows & operations:** view the day; tap a booking → `BookingDetailSheet`; tap free time → Create Booking pre-filled (marked walk-in when today or off the customer start grid).
- **Data sources:** `useSpaceSchedule` → `GET /api/rooms?include_unavailable=true` (display) and `GET /api/bookings?booking_date=` (5-min per-day cache); `useWeekBookingCounts` → `GET /api/bookings?date_from&date_to` counting only confirmed/checked-in/pending; `useScheduleDayWindow`; `GET /api/day-offs/location/{id}`.
- **Validation & business rules:** BR-CAL-003, BR-CAL-005, BR-CAL-002.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/bookings/SpaceSchedule.tsx` — parity **Not assessed** beyond code comments.
- **Loading / empty / error / refresh:** spinner only when nothing cached; pull-to-refresh refetches day + week counts.
- **Platform-specific behaviour:** `AppState` foreground listener; none OS-specific.
- **Tests:** `src/lib/bookings/spaceScheduleGrid.test.ts`, `src/lib/dayOffClosure.test.ts`.
- **Known limitations:** KL-BOOK-013 (day cache not invalidated by booking mutations).
- **Source references:** `src/app/bookings/space-schedule.tsx`, `src/lib/hooks/useSpaceSchedule.ts` (`clearSpaceScheduleCache`), `src/lib/hooks/useWeekBookingCounts.ts`, `src/services/bookingsService.ts` (`fetchDaySchedule`, `fetchSpaces`, `fetchBookingCountsByDate`).

## Location Requests

- **Purpose:** List location-change requests (pending/approved/rejected/all) and approve or reject them; requests are raised from Edit Booking by non-admins.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/bookings/location-requests.tsx` — status tabs, pull-to-refresh, Approve (409 conflicts shown inline → "Approve anyway" with `force`), Reject (reason required).
- **Roles:** Mobile `canReview` = pending **and** (company_admin **or** user's `location_id` = destination) — same as web `canReview`. **Backend allows approve/reject for `company_admin` only** (403 otherwise) — `LocationChangeRequestController::approve` / `reject`. Backend list is scoped: non-admins see requests touching their location.
- **Data sources:** `GET /api/location-change-requests[?status=]`, `PATCH …/{id}/approve` (`force`), `PATCH …/{id}/reject` (`review_notes`), `POST /api/bookings/{id}/location-change-requests`.
- **Validation & business rules:** BR-BOOKING-018, BR-AVAIL-001 (a blocked-period 409 on approve is handled by the global prompt, not as a conflict).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/bookings/LocationChangeRequests.tsx` — **Verified** for `canReview` logic (both disagree with backend).
- **Tests:** None.
- **Known limitations:** KL-BOOK-012.
- **Source references:** `src/app/bookings/location-requests.tsx` (`canReview`, `approve`), `src/services/locationChangeRequestsService.ts`.

---

# Availability

## Day Offs / availability blocks

- **Purpose:** Create, edit, bulk-add, delete and audit availability blocks (closed days or reduced opening hours) per location, scoped to the whole location or to chosen packages, rooms, attractions or events.
- **Implementation status:** Implemented · **Verification:** Source-verified (form rules Test-backed: `src/lib/dayOffs/blockForm.test.ts`, `src/lib/dayOffClosure.test.ts`)
- **Routes / screens:** `src/app/user-managements/day-offs.tsx` (reached from `src/app/user-managements/user-management-hub.tsx`) — paged server-side list with search (400 ms debounce), location / upcoming-vs-all / recurring filters and sort; add/edit form; multi-date bulk add; selection mode + bulk delete; change history (`DayOffHistoryList`, all blocks or one block).
- **Roles:** Mobile `canManage` = company_admin or location_manager (others view only). Backend: list/show `staff`; store/update/destroy/bulk-delete/change-log restricted to `staff:company_admin|admin|location_manager`, plus manager location checks (`outsideManagedLocations`) — `zapzone-backend@ae877e2:routes/api.php`, `DayOffController::store`.
- **Location scoping:** Company admin's location filter follows the global active location; others are scoped by the backend.
- **Main workflows & operations**
  - Block form: location, date (single), "Closed all day" (`full_day`) or "Open for set hours" (`operating_window` with `opens_at`/`closes_at` — the hours it stays **open**), exactly one scope (`location` | `packages` | `rooms` | `attractions` | `events`) with ≥1 item for non-location scopes, group/event name, reason, repeats every year.
  - Bulk add: one `POST /api/day-offs` per selected date (no batch endpoint); failed dates stay selected with their messages.
  - Delete single (`DELETE /api/day-offs/{id}`) or bulk (`POST /api/day-offs/bulk-delete`).
  - History: `GET /api/day-offs/change-log` (Blocked / Changed / Removed / Booked inside block / Booking removed).
- **Data sources:** `GET /api/day-offs`, `GET /api/day-offs/location/{id}` (used by booking screens and space schedule), the mutations above; resource pickers from packages, `GET /api/rooms`, attractions and events services.
- **Validation & business rules:** BR-AVAIL-002, BR-AVAIL-003, BR-AVAIL-004, BR-AVAIL-005; how blocks affect bookings: BR-AVAIL-001.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/dayoffs/DayOffs.tsx` — mobile code states parity (bulk-add loop, history labels); **Partial, not compared line-by-line**.
- **Shared components & utilities:** `src/lib/dayOffs/blockForm.ts` (`blockFormError`, `blockPayload`, `changedFieldRows`), `src/lib/dayOffClosure.ts` (`operatingWindowError`), `src/lib/hooks/useDayOffs.ts`, `DatePickerSheet`, `DayOffHistoryList`, `src/services/dayOffsService.ts`.
- **Loading / empty / error / refresh:** standard list states; pull-to-refresh; save errors via `Alert`.
- **Platform-specific behaviour:** None found.
- **Tests:** `src/lib/dayOffs/blockForm.test.ts`, `src/lib/dayOffClosure.test.ts`, `src/lib/attractions/dayOffAvailability.test.ts` (consumer side).
- **Known limitations:** KL-BOOK-014 (`admin` role allowed by backend but not by mobile `canManage`).
- **Source references:** `src/app/user-managements/day-offs.tsx` (`canManage`, bulk-add loop), `zapzone-backend@ae877e2:app/Http/Controllers/Api/DayOffController.php` (`rules`, `store`, `update`).

---

## Known limitations referenced in this file

Full register: [Known limitations](../KNOWN_LIMITATIONS.md).

| ID | Summary |
| --- | --- |
| KL-BOOK-001 | Three different client check-in gates (table, More sheet, detail sheet); server only requires `confirmed`. |
| KL-BOOK-002 | Full booking list capped at 100 pages (10,000 bookings); above that, sync is disabled and older bookings are missing. |
| KL-BOOK-003 | `PATCH /bookings/{id}/status` can set `checked-in` from any status; mobile Set Status sheet exposes it. |
| KL-BOOK-004 | Change reasons are requested reactively after a 422 round trip (except bulk delete). |
| KL-BOOK-005 | Booking cache is in-memory only; every cold start re-downloads the list. |
| KL-BOOK-006 | Export / Report / Import / Deleted view ignore the active global location for company admins. |
| KL-BOOK-007 | "Package Bookings" KPI always equals "Total Bookings". |
| KL-BOOK-008 | Edit Booking cannot quote or edit custom-package terms. |
| KL-BOOK-009 | Manual Booking charges/records client-computed amounts; Create Booking uses server-saved due. |
| KL-BOOK-010 | Sheets lack keyboard avoidance; root prompt modals over open sheets (iOS) and stacked modals (Android) need device verification. |
| KL-BOOK-011 | `skip_date_validation` / `is_manual_entry` have no server-side effect. |
| KL-BOOK-012 | Location-request review offered to destination staff, but backend allows company admins only. |
| KL-BOOK-013 | Space Schedule day cache is not invalidated by booking mutations. |
| KL-BOOK-014 | Day-offs: backend `admin` role can manage blocks; mobile hides management from it. |
| KL-BOOK-015 | Stale comment in `bookingsService.ts` says the index has no date-range filter. |
| KL-BOOK-016 | No tests for screens, `bookingListCache.ts` or `apiRequest` prompt/retry paths. |
| KL-BOOK-018 | Remembered blocked-period confirmations not cleared on sign-out (same account only; server re-authorizes). |
| KL-BOOK-017 | Staff-submitted totals are not server-enforced under default config. |
