# Bookings and Scheduling — Business Rules

> **Purpose:** Record the booking, calendar and availability rules the mobile app relies on, and where each is actually enforced.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e` (cited sections only); Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Static source inspection only. "Backend (server-enforced)" is used only where the backend controller/service/middleware was read. Several backend behaviours depend on environment configuration (`config/booking_rules.php`, `config/checkout.php`) whose deployed values were not inspected — defaults are quoted. Web Admin was checked only where cited.
> **Related:** [Feature catalog](../FEATURE_CATALOG.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Architecture](../ARCHITECTURE.md) · [Bookings & scheduling features](../features/bookings-and-scheduling.md)

Backend paths below are in `zapzone-backend@ae877e2`; `BookingController` = `app/Http/Controllers/Api/BookingController.php`.

## Booking lifecycle and status

### BR-BOOKING-001 — Booking check-in endpoint accepts confirmed bookings only
- **Rule:** `POST /api/bookings/check-in` (by `reference_number`) moves a booking to `checked-in` (sets `checked_in_at`, `checked_in_by`) only when its status is `confirmed`; otherwise 400 "Only confirmed bookings can be checked in". No payment condition server-side. Record scope is checked (403 outside scope).
- **Workflow:** Check-in from Manage Bookings (table row, More sheet, bulk), BookingDetailSheet.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `src/services/bookingsService.ts` (`checkInBooking`); `BookingController::checkIn`
- **Exceptions:** `PATCH /status` path (BR-BOOKING-003). The mobile sends `user_id`, which `checkIn` does not read.
- **Verification:** Source-verified
- **Open questions:** None

### BR-BOOKING-002 — Client check-in gates differ by surface
- **Rule:** Table row shows Check-in when payment state is `paid` and status ≠ `checked-in` (any other status). More sheet requires `confirmed` **and** amount paid ≥ total **and** a reference. Quick view (BookingDetailSheet) requires only `confirmed` + reference and, if a balance is owed, asks "Check in with a balance due?" stating no payment is recorded.
- **Workflow:** Manage Bookings, booking details.
- **Enforcement layer:** Mobile UI-only; Web Admin reference behaviour (table gate)
- **Evidence:** `src/components/ui/BookingsTable.tsx` (actions column `canCheckIn`); `src/components/ui/BookingActionsSheet.tsx` (`canCheckIn`); `src/components/ui/BookingDetailSheet.tsx` (check-in `confirm`); `src/lib/bookings/bookingCheckIn.ts` (`isCheckInEligible`); `zappoint@5de9d9e:src/pages/admin/bookings/Bookings.tsx` (row renders check-in when `status !== 'checked-in' && paymentStatus === 'paid'`)
- **Exceptions:** None found
- **Verification:** Source-verified; `isCheckInEligible`/`outstandingBalanceOf` Test-backed (`src/lib/bookings/bookingCheckIn.test.ts`)
- **Open questions:** Which gate is intended? Mobile and backend disagree on whether payment is required (KL-BOOK-001).

### BR-BOOKING-003 — Status endpoint allows any transition, with reactivation guards
- **Rule:** `PATCH /api/bookings/{id}/status` accepts pending/confirmed/checked-in/completed/cancelled from any current status (no confirmed-only check for `checked-in`, and `checked_in_by` is not set). Reactivating a cancelled booking runs slot-capacity and availability-block checks; a cancelled booking whose gift card was reversed cannot be reactivated (422). Cancelling reverses membership benefits and gift-card redemption. Completing can trigger follow-up emails (mobile asks before bulk-completing).
- **Workflow:** Set Status sheet, bulk status, edit save.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (confirmation before Completed)
- **Evidence:** `src/app/bookings/bookings.tsx` (`ROW_STATUS_OPTIONS`, `runBulkStatus`); `src/services/bookingsService.ts` (`updateBookingStatus`, `bulkSetBookingStatus`); `BookingController::updateStatus`
- **Exceptions:** Bulk checked-in uses `/check-in` when a reference exists.
- **Verification:** Source-verified
- **Open questions:** Should `/status` → `checked-in` follow BR-BOOKING-001? (KL-BOOK-003)

### BR-BOOKING-004 — Deleting a booking is a soft delete; restore is separate
- **Rule:** Staff `DELETE /api/bookings/{id}` soft-deletes (`Booking` uses `SoftDeletes`), reverses gift-card redemption, removes the Google Calendar event; trashed bookings are listed by `GET /api/bookings/trashed` and restored by `POST /api/bookings/{id}/restore` (restore re-checks availability blocks). The route is public: a non-staff caller may only remove an **unpaid pending** booking presenting its checkout token (403 otherwise).
- **Workflow:** Row/More/Full view delete, bulk delete, Deleted view restore; checkout rollback.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `src/services/bookingsService.ts` (`deleteBooking`, `restoreBooking`, `fetchTrashedBookings`); `BookingController::destroy`, `::restore`; `app/Models/Booking.php` (`SoftDeletes`); `routes/api.php` (public `DELETE bookings/{booking}`)
- **Exceptions:** `force-delete` permanently deletes (payments baseline).
- **Verification:** Source-verified
- **Open questions:** None
- **Restore outcome (spec 002, 2026-11-28; `zapzone-backend@2bbd0fa`):**
  - **Overlap allowed:** a restore whose released slots were taken while it was deleted still **succeeds**. The server re-books the slots, permitting the overlap, and returns `space_warning` naming the clashing bookings. This is test-backed by `tests/Feature/AreaSimultaneousStartsTest.php`. Mobile shows the warning in full.
  - **Confirmed rejections** are only the pre-change shapes: 403 `success:false` (staff middleware), 422 `success:false` (gift card reversed, capacity, blocked for a non-staff caller), 422 `errors.change_reason`, and 409 `code:"BLOCKED_PERIOD"`.
  - **Unknown:** any 404 (pre-change, but usually an earlier attempt already restored the booking), 5xx (one can follow a committed restore), malformed answers and no answer. Confirmed and unknown outcomes refresh the Deleted list and sync the active list.
  - **Authorized continuation vs unsafe retry:** the shared client's single change-reason or blocked-period follow-up after a pre-change refusal is preserved. A remembered blocked-period confirmation is scoped to the account, booking and block ids for 5 minutes, and the server re-authorizes it. The feature itself never retries after an outcome.
  - **Evidence:** `src/lib/bookings/restoreOutcome.ts`, `src/lib/bookings/restoreFlow.ts`, `src/components/ui/BookingActionsSheet.tsx`; test-backed (`restoreOutcome.test.ts`, `restoreFlow.test.ts`).

### BR-BOOKING-005 — Bulk delete records one reason per booking
- **Rule:** Mobile bulk delete asks for one reason, then deletes each selected id with that `change_reason` (not `/bookings/bulk-delete`), so each booking's history records why; partial failures are reported.
- **Workflow:** Manage Bookings bulk bar.
- **Enforcement layer:** Mobile client logic; Web Admin reference behaviour
- **Evidence:** `src/app/bookings/bookings.tsx` (`confirmBulkDelete`); `zappoint@5de9d9e:src/pages/admin/bookings/Bookings.tsx` (`handleBulkDelete`)
- **Exceptions:** If no prompt host is mounted, the request goes without a reason and the server's 422 explains.
- **Verification:** Source-verified
- **Open questions:** None

### BR-BOOKING-006 — Bookings list sync contract
- **Rule:** `GET /api/bookings` caps `per_page` at 100 (500 with `updated_since`); supports `date_from`/`date_to`, `booking_date`, `status`, `search`, `reference_number`, `location_id`. `sync=1`/`updated_since` is staff-only (403), cannot be combined with filters other than `location_id` (422), and a cursor older than 3 h or with too many changes returns 422. Mobile keeps the cursor only when it downloaded the full total, merges the change feed (`deleted_ids`, `total`), and re-downloads every 30 min or on scope/total mismatch.
- **Workflow:** Manage Bookings, both calendars.
- **Enforcement layer:** Backend (server-enforced) for the contract; Mobile client logic for cache policy
- **Evidence:** `src/lib/bookings/bookingListCache.ts` (`loadBookingList`); `src/services/bookingsService.ts` (`fetchAllBookings`, `fetchBookingChanges`); `BookingController::index` (`SYNC_UNSUPPORTED_FILTERS`, per-page cap, 3-hour expiry)
- **Exceptions:** Mobile stops at 100 pages (KL-BOOK-002).
- **Verification:** Test-backed for merge (`src/lib/bookings/bookingSync.test.ts`, `src/lib/bookings/cacheOwner.test.ts`); rest Source-verified
- **Open questions:** None

### BR-BOOKING-007 — Location scoping of booking data
- **Rule:** Server-side, `location_manager`/`attendant` are restricted to their `location_id` for lists and records, and every user to their company (`applyAuthScope`, `authorizeRecordScope`, `guardLocationAccess`). Company admins are narrowed client-side by the global active location (`location_id` param) — "all" = company-wide.
- **Workflow:** All booking screens.
- **Enforcement layer:** Backend (server-enforced) for managers/attendants; Mobile client logic for company-admin workspace filter
- **Evidence:** `src/lib/location/activeLocationStore.ts` (`useActiveLocation`, used in `bookings.tsx`, calendars, space schedule); `app/Http/Traits/ScopesByAuthUser.php`; `BookingController::index`
- **Exceptions:** Export/report/import/deleted view use `currentUser.location_id` instead of the active location (KL-BOOK-006).
- **Verification:** Source-verified
- **Open questions:** None

### BR-BOOKING-008 — Internal notes are an append-only log
- **Rule:** Notes are added (`POST …/internal-notes`) or corrected (`PUT …/internal-notes/{note}`, previous version kept as a revision); never emptied/deleted. `PUT /api/bookings/{id}` does not accept `internal_notes`; the `internal_notes` column is a server-rebuilt digest. Any staff user may edit (`can_edit` = actor is a staff `User`). Notes are staff-only routes.
- **Workflow:** Internal Notes sheet, BookingFullView, Edit Booking.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `src/services/bookingsService.ts` (`addInternalNote`, `updateInternalNote`, `BookingUpdateInput` comment); `src/components/ui/InternalNotesLog.tsx`; `BookingController::update` validation, `::storeInternalNote`, note presenter (`can_edit`); `routes/api.php` staff group
- **Exceptions:** None found
- **Verification:** Source-verified; note helpers Test-backed (`src/lib/bookings/bookingNotes.test.ts`)
- **Open questions:** None

## Pricing, checkout and payment

### BR-BOOKING-009 — Edit totals come from the server reprice quote
- **Rule:** On edit, `POST /api/bookings/{id}/reprice` (300 ms debounce) prices the change; save is blocked while the quote is loading or failed; the saved `total_amount`, `discount_amount`, `applied_fees` and (if the special changed) `applied_discounts` are the quote's; `amount_paid` is never sent by the edit.
- **Workflow:** Edit Booking.
- **Enforcement layer:** Mobile client logic (backend reprice is read-only; update-total enforcement is config `checkout.enforce_server_total_on_update`, default false)
- **Evidence:** `src/lib/hooks/useBookingQuote.ts`; `src/app/bookings/edit-booking.tsx` (`handleSave`); `config/checkout.php`
- **Exceptions:** Custom-package bookings: quote disabled (no package) (KL-BOOK-008).
- **Verification:** Source-verified
- **Open questions:** Not assessed whether `BookingController::update` recomputes totals when the client omits them.

### BR-BOOKING-010 — Participant minimum/maximum
- **Rule:** When participants, date, time or package change (or a cancelled booking is reactivated) the server requires participants ≥ the package's effective minimum for that date (special pricing may raise it) and ≤ `max_participants` (422). Mobile clamps before save and uses the slot's `min_participants`.
- **Workflow:** Create, Manual, Edit Booking.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic
- **Evidence:** `src/app/bookings/edit-booking.tsx` (`clampParticipants`); `src/services/bookingsService.ts` (`AvailableSlot.minParticipants`); `BookingController::update` (`effectiveMinParticipants`), `::store`
- **Exceptions:** Custom packages use their own min/max guests (BR-BOOKING-015).
- **Verification:** Source-verified
- **Open questions:** None

### BR-BOOKING-011 — Overlapping bookings need a manager override
- **Rule:** With `booking_rules.slot_conflict = enforce` (default), a staff save that overlaps another booking in the space is refused 409 (`requires_override`, `conflicts`) when a manager at the location holds an override PIN; a PIN-minted `overlap_override_token` (single use) lets it through. If no approver exists it is allowed and logged; guests get a plain 409; bookings dated in the past are not refused.
- **Workflow:** Create, Manual, Edit Booking (`OverlapOverrideModal`).
- **Enforcement layer:** Backend (server-enforced); Mobile UI (override modal, token not resent)
- **Evidence:** `src/app/bookings/edit-booking.tsx` (`submitUpdate`); `src/app/bookings/manual-booking.tsx`; `BookingController::store` (slot-conflict block), `::update`; `config/booking_rules.php`
- **Exceptions:** As above.
- **Verification:** Source-verified
- **Open questions:** Deployed `slot_conflict` value Not assessed.

### BR-BOOKING-012 — Change reason required for staff booking changes
- **Rule:** Policy `booking_rules.change_reason` (config default `all`; trait fallback `guest_visible`; `off` possible). Under `all`, every staff booking change except check-in and internal notes (marked internal) needs `change_reason` ≥ 3 chars, checked before mutating (422 `errors.change_reason`). Customers/unauthenticated callers are never required. Mobile answers any such 422 globally by prompting (`ChangeReasonHost`, presets from `/bookings/change-reason-options`) and retrying once.
- **Workflow:** All booking mutations.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (prompt + retry)
- **Evidence:** `src/lib/api.ts` (`apiRequest`); `src/lib/changeReasonPrompt.ts`; `src/components/ui/ChangeReasonModal.tsx` (`MIN_LENGTH`); `app/Http/Traits/CapturesChangeReason.php`; `config/booking_rules.php`
- **Exceptions:** Bulk delete asks up front (BR-BOOKING-005).
- **Verification:** Source-verified
- **Open questions:** Deployed policy value Not assessed.

### BR-BOOKING-013 — Checkout idempotency key
- **Rule:** Create/Manual Booking send a `checkout_key` (`[A-Za-z0-9-]`, ≤ 64); the key is rotated when package/date/time/space/party size (or custom terms) change and after success; a repeat of a completed attempt is answered `ALREADY_BOOKED` with the booking id and rollback token, which the client remembers.
- **Workflow:** Create Booking, Manual Booking.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (key lifecycle)
- **Evidence:** `src/app/bookings/create-booking.tsx`, `src/app/bookings/manual-booking.tsx` (`checkoutKeyRef`, `checkoutAttemptRef`); `src/services/bookingsService.ts` (`createBooking`); `BookingController::store` (`checkout_key`, `ALREADY_BOOKED`)
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None

### BR-BOOKING-014 — Staff-submitted totals are not enforced by default
- **Rule:** `CheckoutTotalGuard` compares the client `total_amount` with the server expectation, but only rejects (`PRICE_MISMATCH`) when `checkout.enforce_server_total` is on and, for staff, `checkout.enforce_for_staff` is on — both default false (shadow/log mode). So staff prices (incl. manual overrides and special pricing) are what is saved.
- **Workflow:** Create/Manual Booking.
- **Enforcement layer:** Backend (logged, not enforced by default); Mobile client logic computes the total
- **Evidence:** `src/app/bookings/manual-booking.tsx` (`totalAmountOverride`, `resolveFreshPricing`); `app/Services/Checkout/CheckoutTotalGuard.php` (`check`); `config/checkout.php`
- **Exceptions:** Custom packages are always price-checked (BR-BOOKING-015).
- **Verification:** Source-verified
- **Open questions:** Deployed config Not assessed.

### BR-BOOKING-015 — Custom Package bookings
- **Rule:** A `custom_package` booking: staff only (422 `STAFF_ONLY`); `package_id` must be null; no attractions; no discounts/promo/gift card; terms limited (name ≤ 120, duration 1–1,440 min, guests ≤ 10,000, price ≤ 99,999.99, ≤ 20 fees, ≤ 50 one-time add-ons, percent fee 0–100); total must equal `CustomPackagePricer`'s (`CUSTOM_PRICE_MISMATCH`); amount paid ≤ total. On update a custom booking cannot be switched to a package and non-custom bookings cannot gain custom terms.
- **Workflow:** Manual Booking (Custom Package); Edit Booking.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (pre-validation, same total maths)
- **Evidence:** `src/lib/bookings/customBooking.ts` (`CUSTOM_PACKAGE_LIMITS`, `CUSTOM_PACKAGE_MESSAGES`, `customPackagePayload`); `src/app/bookings/manual-booking.tsx` (`handleSubmit`); `app/Services/Checkout/CustomPackagePricer.php` (constants); `BookingController::store`, `::update`
- **Exceptions:** None found
- **Verification:** Test-backed (`src/lib/bookings/customBooking.test.ts`) for client maths/validation; server Source-verified
- **Open questions:** None

### BR-BOOKING-016 — `skip_date_validation` and `is_manual_entry` flags
- **Rule:** Manual Booking sends `is_manual_entry: true` and `skip_date_validation` (Flexible mode). The backend never reads `skip_date_validation`; `is_manual_entry` is only passed as log context to the total guard.
- **Workflow:** Manual Booking.
- **Enforcement layer:** Not determined (no server effect found)
- **Evidence:** `src/app/bookings/manual-booking.tsx` (`bookingInput`); backend `app/` search: only `BookingController::store` (`'manual_entry' => $request->boolean('is_manual_entry')`)
- **Exceptions:** None
- **Verification:** Source-verified (absence via search)
- **Open questions:** Is Flexible mode expected to bypass server date rules? (KL-BOOK-011)

### BR-BOOKING-017 — Moving a booking to another location
- **Rule:** `PATCH /api/bookings/{id}/location` requires access to both source and destination (managers/attendants are pinned to their location, so in practice only company admins move bookings); the room must belong to the destination; a booking that has a room cannot be left without one (422); room/area/break conflicts return 409 `conflicts` unless `force`; availability blocks at the destination apply (BR-AVAIL-001).
- **Workflow:** Change Location sheet (company admin, Manage Bookings), Edit Booking (company admin).
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only (Location column/picker shown to company admin only)
- **Evidence:** `src/components/ui/ChangeLocationSheet.tsx`; `src/services/bookingsService.ts` (`updateBookingLocation`, `locationConflictsOf`); `BookingController::updateLocation`; `ScopesByAuthUser::guardLocationAccess`
- **Exceptions:** Custom packages have extra move rules (`CustomPackagePricer::moveRefusal`).
- **Verification:** Source-verified
- **Open questions:** None

### BR-BOOKING-018 — Location change requests
- **Rule:** Any staff with the booking in scope may request a move (`to_location_id` ≠ current, optional room at the destination, reason ≤ 1,000); only one pending request per booking (409). **Approve/reject are company-admin only** (403 otherwise); reject requires `review_notes`; approve returns 409 conflicts unless `force`. Mobile and web show Approve/Reject to destination-location staff too.
- **Workflow:** Edit Booking (request), Location Requests (review).
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only / Web Admin reference behaviour (`canReview`) — disagree with backend
- **Evidence:** `src/app/bookings/location-requests.tsx` (`canReview`); `src/services/locationChangeRequestsService.ts`; `app/Http/Controllers/Api/LocationChangeRequestController.php` (`store`, `approve`, `reject`); `zappoint@5de9d9e:src/pages/admin/bookings/LocationChangeRequests.tsx` (`canReview`)
- **Exceptions:** None
- **Verification:** Source-verified
- **Open questions:** Which side is intended? (KL-BOOK-012)

### BR-BOOKING-019 — Amount charged after creating a booking
- **Rule:** Create Booking charges the card for what the server saved as still due (`total_amount − amount_paid`, capped by the partial amount), skips the charge and stores the QR when the server already confirmed, and caps in-store payment records at the saved total. Manual Booking charges/records its own computed `paidNow`. Both roll back on decline/failure and keep the booking when the charge outcome is unknown.
- **Workflow:** Create Booking, Manual Booking.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/app/bookings/create-booking.tsx` (`serverDue`, `chargeAmount`); `src/app/bookings/manual-booking.tsx` (`paidNow`, `recordBookingPayment`)
- **Exceptions:** None
- **Verification:** Source-verified
- **Open questions:** Should Manual Booking follow the server-saved amounts? (KL-BOOK-009)

## Availability

### BR-AVAIL-001 — Saving inside an availability block
- **Rule:** When a booking save (create, update, location move, reactivation via status, restore, bulk restore, CSV import) falls inside day-off/availability blocks, staff of the block's company get 409 `code: BLOCKED_PERIOD` with `blocked_periods`; the save succeeds only if resent with `acknowledge_blocked_period: true` and `acknowledged_block_ids` covering every block (recorded as "Booked inside block"). Non-staff get a plain 422. Mobile prompts once ("Book anyway", armed after 400 ms), resends, remembers confirmations 5 min per actor+target, and settles queued saves inside the same blocks together.
- **Workflow:** All booking mutations; location-request approval.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (global prompt)
- **Evidence:** `src/lib/api.ts` (`apiRequest`); `src/lib/blockedPeriodPrompt.ts`; `src/components/ui/BlockedPeriodHost.tsx`; `app/Services/AvailabilityBlockGuard.php` (`refusal`, `acknowledged`, `isStaffForAll`); `BookingController` (`store`, `update`, `updateLocation`, `updateStatus`, `restore`, `bulkRestore`, `bulkImportCsv`)
- **Exceptions:** The guard also covers attraction/event purchases (other baselines).
- **Verification:** Source-verified
- **Open questions:** None

### BR-AVAIL-002 — Shape of an availability block
- **Rule:** A block has `location_id`, `date`, `block_type` (`full_day` | `operating_window` with `opens_at`/`closes_at` = hours it stays open), exactly one `scope` (`location` | `packages` | `rooms` | `attractions` | `events`) with the matching id list required for non-location scopes, `reason` (≤ 255) and `group_name` (≤ 150) required, optional `is_recurring` (yearly). `time_start`/`time_end` are prohibited (legacy format, read-only).
- **Workflow:** Day Offs.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (pre-validation)
- **Evidence:** `src/lib/dayOffs/blockForm.ts` (`blockFormError`, `blockPayload`); `DayOffController::rules`, `::store`, `::update`
- **Exceptions:** Legacy closures must be converted before date/scope edits (`DayOffController::update`).
- **Verification:** Test-backed (`src/lib/dayOffs/blockForm.test.ts`) client side; server Source-verified
- **Open questions:** None

### BR-AVAIL-003 — Who manages blocks
- **Rule:** Creating/updating/deleting blocks and reading the change log require `company_admin`, `admin` or `location_manager`; managers only for their managed locations. Any staff can list/show. Mobile shows management controls to company_admin and location_manager only.
- **Workflow:** Day Offs.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only (`canManage`)
- **Evidence:** `src/app/user-managements/day-offs.tsx` (`canManage`); `routes/api.php` (`staff:company_admin|admin|location_manager` group); `DayOffController::store` (`outsideManagedLocations`)
- **Exceptions:** `admin` role differs (KL-BOOK-014).
- **Verification:** Source-verified
- **Open questions:** None

### BR-AVAIL-004 — Operating-window hours validation
- **Rule:** An operating window needs an opening time, a closing time or both; closing must be after opening or no later than 6:00 AM next morning; hours that keep the whole day open are refused.
- **Workflow:** Day Offs form and bulk add.
- **Enforcement layer:** Mobile client logic; Backend `scheduleError` (exact server messages Not assessed)
- **Evidence:** `src/lib/dayOffClosure.ts` (`operatingWindowError`); `DayOffController::store` (`scheduleError`)
- **Exceptions:** None found
- **Verification:** Test-backed (`src/lib/dayOffClosure.test.ts`)
- **Open questions:** None

### BR-AVAIL-005 — Bulk add creates one block per date
- **Rule:** Bulk add sends one `POST /api/day-offs` per selected date; failures do not stop the rest, and failed dates remain selected with their messages.
- **Workflow:** Day Offs bulk add.
- **Enforcement layer:** Mobile client logic; Web Admin reference behaviour (per code comment; not verified)
- **Evidence:** `src/app/user-managements/day-offs.tsx` (bulk-add loop)
- **Exceptions:** None
- **Verification:** Source-verified
- **Open questions:** None

## Calendars

### BR-CAL-001 — Calendars fetch only the visible window
- **Rule:** Calendars request `GET /api/bookings?date_from&date_to` for the visible day/week/month (any status), cached per scope+range (24 windows); a fresh full list (≤ 5 min) is filtered instead of fetched.
- **Workflow:** Booking Calendar, Dashboard Calendar.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/hooks/useCalendarBookings.ts`; `src/lib/bookings/bookingListCache.ts` (`syncBookingRange`); `BookingController::index` (date filters)
- **Exceptions:** Space Schedule uses `booking_date` paging instead.
- **Verification:** Source-verified
- **Open questions:** None

### BR-CAL-002 — Tap-to-book from the day grid
- **Rule:** Tapping free time on a non-past day opens Create Booking pre-filled with location, date, a minute snapped to a real package start, space and candidate packages; walk-ins are today-only, snapped down to 5 minutes and not snapped to package starts. Closed ranges and occupancy come from `/api/schedule/day-window`, day-offs and bookings; if the day window fails, the grid is not tappable.
- **Workflow:** Dashboard Calendar (day view), Space Schedule.
- **Enforcement layer:** Mobile client logic (server validation applies on submit)
- **Evidence:** `src/app/(tabs)/calendar.tsx` (`openSlot`, `startWalkIn`); `src/app/bookings/space-schedule.tsx`; `src/lib/calendar/dayGridSlots.ts`; `src/lib/bookings/bookingPrefill.ts`
- **Exceptions:** Space Schedule marks off-grid taps as walk-ins.
- **Verification:** Test-backed (`src/lib/calendar/dayGridSlots.test.ts`, `src/lib/bookings/bookingPrefill.test.ts`)
- **Open questions:** None

### BR-CAL-003 — Week strip counts space-occupying statuses only
- **Rule:** Space Schedule's 7-day strip counts bookings with status confirmed, checked-in or pending.
- **Workflow:** Space Schedule.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/services/bookingsService.ts` (`COUNTED_SCHEDULE_STATUSES`, `fetchBookingCountsByDate`)
- **Exceptions:** None
- **Verification:** Source-verified
- **Open questions:** None

### BR-CAL-004 — Category filters come from the visible set
- **Rule:** Category chips/tabs are built from the currently visible (location-scoped, search/package-filtered) items; a selected category that disappears is reset to All so the list can never be filtered to nothing without a chip to clear it.
- **Workflow:** Manage Bookings, Booking Calendar, Dashboard Calendar.
- **Enforcement layer:** Mobile UI-only
- **Evidence:** `src/app/bookings/bookings.tsx` (category reset effect); `src/app/bookings/calendar.tsx` (`categories`); `src/lib/calendar/categoryFilter.ts`
- **Exceptions:** None
- **Verification:** Test-backed (`src/lib/calendar/categoryFilter.test.ts`)
- **Open questions:** None

### BR-CAL-005 — Out-of-service spaces are shown but never offered
- **Rule:** Space Schedule loads rooms with `include_unavailable=true` to display out-of-service spaces, in a cache kept separate from the bookable-only list used by booking forms and pickers; Change Location requests `is_available=1` rooms.
- **Workflow:** Space Schedule, booking forms, Change Location.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/hooks/useSpaceSchedule.ts` (`allSpacesCache` vs `spacesCache`); `src/services/bookingsService.ts` (`fetchSpaces`, `fetchRoomOptions`)
- **Exceptions:** None
- **Verification:** Source-verified
- **Open questions:** Whether the backend refuses bookings into unavailable rooms was Not assessed.
