# Business Rules — Attractions, Events, Bulk Orders, Registration Forms and Check-In

> **Purpose:** Record the important business rules the Mobile app applies (or relies on the backend for) in the attractions, ticket purchase, bulk order, events, registration form and check-in areas.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e` (cited sections only); Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Static inspection only. "Backend (server-enforced)" is used only where the cited controller/middleware was read. Backend config values (e.g. `checkout.enforce_server_total`) were not inspected. Unit tests listed were not reviewed or run, so no rule is marked Test-backed.
> **Related:** [Feature catalog](../FEATURE_CATALOG.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Architecture](../ARCHITECTURE.md) · [Feature doc for this area](../features/attractions-events-and-checkin.md)

---

## Attractions

### BR-ATTR-001 — Required attraction fields
- **Rule:** Create requires name, description, category, price ≥ 0, max capacity ≥ 1 and a location; no availability window may start and end at the same time.
- **Workflow:** Create (and edit) attraction.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced)
- **Evidence:** `src/app/attractions/create-attraction.tsx` (`validate`, `handleSubmit`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/AttractionController.php` (`store` rules, `rejectSameClockAvailability`, `scopedLocation`)
- **Exceptions:** Backend `location_id` is `nullable` on store; mobile always requires it.
- **Verification:** Source-verified
- **Open questions:** Edit-screen validation not assessed.

### BR-ATTR-002 — Tickets-per-slot cap
- **Rule:** A blank cap is sent as `null` (= unlimited); when set it must be 1–10000.
- **Workflow:** Attraction create/edit; drives purchase quantity limits (BR-PURCH-001).
- **Enforcement layer:** Mobile client logic; Backend (server-enforced)
- **Evidence:** `src/app/attractions/create-attraction.tsx` (`slotCapNum`); `AttractionController::store` (`max_tickets_per_slot` rule)
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None

### BR-ATTR-003 — Duplicate is a client-side copy
- **Rule:** Duplicate reads the attraction and creates "<name> (Copy)" as **inactive** in the same location; there is no duplicate endpoint.
- **Workflow:** Attraction Actions sheet and table row.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/services/attractionsService.ts` (`duplicateAttraction`); `src/components/ui/AttractionActionsSheet.tsx` (`handleDuplicate`)
- **Exceptions:** Falls back to `location_id: 0` when the original has no location (see KL-ATTR-005).
- **Verification:** Source-verified
- **Open questions:** Web duplicate flow not opened.

### BR-ATTR-004 — Attraction delete is permanent; bulk delete skips foreign records
- **Rule:** Deleting removes the attraction (model has no soft delete) and its image files; bulk delete silently skips attractions outside the caller's scope and reports `deleted_count`.
- **Workflow:** Row/sheet delete, bulk delete.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only confirmation
- **Evidence:** `src/app/attractions/manage-attractions.tsx` (`confirmBulkDelete`, `handleRowDelete`); `AttractionController::destroy` (`denyForeignRecord`), `AttractionController::bulkDelete` (`authorizeRecordScope`); `app/Models/Attraction.php` (no `SoftDeletes`)
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** Mobile shows success even if some ids were skipped.

### BR-ATTR-005 — Activation is per record
- **Rule:** Activate/deactivate use per-id `PATCH …/activate|deactivate`; bulk is a parallel fan-out that rejects on the first failure.
- **Workflow:** Status pill, bulk bar.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced) for scope
- **Evidence:** `attractionsService.ts` (`setAttractionActive`, `bulkSetAttractionsActive`); `routes/api.php` attractions `staff` group
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None

---

## Purchases and bulk orders

### BR-PURCH-001 — Per-slot ticket capacity
- **Rule:** When an attraction/event has `max_tickets_per_slot`, quantity is clamped to tickets left (floor 1) and sold-out slots are unselectable; the server re-checks inside a locked transaction and refuses with 422 ("Only N tickets left…"/"That time just sold out"). A capped attraction also requires a visit date and time.
- **Workflow:** Create Purchase, bulk order lines, event onsite purchase; purchase edits that move slot/quantity.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced)
- **Evidence:** `src/lib/ticketLimits.ts` (`buildSlotRemainingMap`, `remainingForSlot`, `quantityCeiling`, `clampToRemaining`, `isSoldOut`); `src/app/attractions/create-purchase.tsx`; `src/app/events/create-purchase.tsx`; `AttractionPurchaseController::store` (~L513–532), `::update` (~L1094); `EventPurchaseController::store` (~L249–265, ~L402–415); `AttractionController::slotAvailability`; `EventController::getAvailableTimeSlots`
- **Exceptions:** Uncapped items have no limit (map `null`). Event slots that are full are dropped by the server rather than shown as full.
- **Verification:** Source-verified
- **Open questions:** Which web pages clamp quantity was only partly checked (CreatePurchase, OnsitePurchaseEvent read remaining counts).

### BR-PURCH-002 — Day-offs block visit dates/times
- **Rule:** Full day-offs are not selectable and partial closures remove affected slots in the mobile calendar; the server refuses blocked periods with code `BLOCKED_PERIOD` (staff acknowledgement field `acknowledged_block_ids` exists).
- **Workflow:** Attraction purchase date/time selection; purchase create/edit/reactivate.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced)
- **Evidence:** `src/lib/attractions/dayOffAvailability.ts` (`computeDayOffAvailability`); `create-purchase.tsx` (`fetchDayOffsByLocation`); `zapzone-backend@ae877e2:app/Services/AvailabilityBlockGuard.php` (`forAttraction`, `CODE`, `ACKNOWLEDGED_IDS_FIELD`); `AttractionPurchaseController::store`/`update` (`blockGuard`)
- **Exceptions:** Staff override path handled by shared API layer (documented elsewhere).
- **Verification:** Source-verified
- **Open questions:** None

### BR-PURCH-003 — Payment method sets status; card is create-then-charge
- **Rule:** `in-store`/`card` purchases are created `confirmed`; `paylater`/`authorize.net` are `pending`; `authorize.net` is saved with `amount_paid = 0` and then charged. A proven charge failure rolls the record back (force-delete / order rollback); an unknown outcome keeps it. Unauthenticated callers asking for in-store/card are downgraded to pay-later.
- **Workflow:** Create Purchase, bulk order checkout, event onsite purchase.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (rollback decisions)
- **Evidence:** `AttractionPurchaseController::store` (~L341–460); `create-purchase.tsx` (`submitOrder`, `handleSubmit`); `src/services/ticketOrdersService.ts` (`rollbackTicketOrder`); `attractionPurchasesService.ts` (`forceDeleteAttractionPurchase`)
- **Exceptions:** Bulk orders with in-store payment record a separate payment (`recordPayment`); a recording failure leaves the order unpaid with an alert.
- **Verification:** Source-verified
- **Open questions:** Charge internals belong to the payments documentation.

### BR-PURCH-004 — Checkout idempotency
- **Rule:** Each checkout attempt sends a `checkout_key`; the server answers a repeat of an attempt that already went through with 409 `ALREADY_PURCHASED`. Mobile also applies a submit lock and a 3-second cooldown.
- **Workflow:** All staff purchase/order checkouts.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic
- **Evidence:** `create-purchase.tsx` (`checkoutKeyFor`, `submitLockRef`, `lastSubmitAtRef`); `AttractionPurchaseController::store` (~L315–370); `EventPurchaseController::store` (~L194–326)
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None

### BR-PURCH-005 — Gift cards on staff checkouts
- **Rule:** One gift card may be applied; its code is sent as `gift_card_code` and redeemed by the server. With a card payment and a gift card, `amount_paid` is sent as 0 and the server-reported balance is reconciled before charging.
- **Workflow:** Staff attraction purchase, bulk order, event onsite purchase.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced) for redemption
- **Evidence:** `src/lib/giftCards/checkoutGiftCard.ts` (`giftCardCodeField`, `amountDueAfterGiftCard`, `reconcileGiftCardPurchase`); `AttractionPurchaseController::store` (`gift_card_code`, `$hasCode`)
- **Exceptions:** Web staff pages have no gift-card field (KL-ATTR-006).
- **Verification:** Source-verified
- **Open questions:** Whether this divergence is intended is not recorded in code.

### BR-PURCH-006 — Who computes the price
- **Rule:** Single purchases are priced on the device (fees + special pricing re-resolved at submit) and the client total is posted; bulk orders are priced by the server quote. The server's total guard (`CheckoutTotalGuard`) enforces only when configured, and for staff only if `enforce_for_staff` is set.
- **Workflow:** Create Purchase, event onsite purchase, bulk order.
- **Enforcement layer:** Mobile client logic; Backend (config-dependent)
- **Evidence:** `create-purchase.tsx` (`resolveFreshPricing`); `ticketOrdersService.ts` (`quoteTicketOrder`); `zapzone-backend@ae877e2:app/Services/Checkout/CheckoutTotalGuard.php` (`check`)
- **Exceptions:** None found
- **Verification:** Source-verified (config values Not assessed)
- **Open questions:** Production config for total enforcement.

### BR-PURCH-007 — Bulk-order lines are managed through the order
- **Rule:** A purchase that is a line of a ticket order may change only its schedule and notes (events: date/time/notes/special requests); it cannot be deleted on its own, and event lines cannot change status individually.
- **Workflow:** Edit purchase, delete purchase, event status changes.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced)
- **Evidence:** `attractionPurchasesService.ts` (`UpdateOrderLineInput`); `eventPurchasesService.ts` (`UpdateEventOrderLineInput`); `AttractionPurchaseController::update` (~L1122), `::destroy` (~L1276); `EventPurchaseController::updateStatus` (~L1292)
- **Exceptions:** Attraction lines CAN be checked in individually through `PATCH …/check-in` (KL-CHECKIN-002).
- **Verification:** Source-verified
- **Open questions:** None

### BR-PURCH-008 — Purchase delete is a soft delete; public delete only rolls back own pending checkout
- **Rule:** Staff delete soft-deletes (shown in the Deleted view). Without staff auth, only an unpaid, unchecked-in pending purchase presenting its checkout token can be removed.
- **Workflow:** Row/bulk delete, card rollback.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `AttractionPurchaseController::destroy`, `::publicForceDelete`; `app/Models/AttractionPurchase.php`, `EventPurchase.php` (`SoftDeletes`); `attractionPurchasesService.ts` (`checkoutTokenBody`)
- **Exceptions:** Order lines refused (BR-PURCH-007).
- **Verification:** Source-verified
- **Open questions:** Restore is not offered on mobile (KL-ATTR-003, KL-EVENT-007).

### BR-PURCH-009 — Customer details required at checkout
- **Rule:** A customer name (or selected customer) is required; for a single purchase an email is required when "Send email receipt" is on; a single attraction purchase needs date and time.
- **Workflow:** Create Purchase.
- **Enforcement layer:** Mobile UI-only (blockers); Backend requires `guest_name` without `customer_id`
- **Evidence:** `create-purchase.tsx` (`orderBlockers`, `purchaseBlockers`); `AttractionPurchaseController::store` (`guest_name` rule)
- **Exceptions:** Staff may omit email server-side.
- **Verification:** Source-verified
- **Open questions:** None

### BR-PURCH-010 — A bulk order counts as one transaction
- **Rule:** In purchase KPIs, all lines of one ticket order count as a single transaction.
- **Workflow:** Attraction and event purchase KPIs.
- **Enforcement layer:** Mobile client logic; Backend statistics use the same grouping
- **Evidence:** `src/lib/purchaseMetrics.ts` (`countTransactions`); `AttractionPurchaseController` statistics (`COUNT(DISTINCT COALESCE(...ticket_order_id...))`, ~L1586–1603)
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None

### BR-PURCH-011 — "Completed" attraction purchases display as "Confirmed"
- **Rule:** Backend `completed` is normalised to `confirmed` for display and filtering.
- **Workflow:** Attraction purchase lists, details, check-in verify.
- **Enforcement layer:** Mobile client logic; Web Admin reference behaviour
- **Evidence:** `attractionPurchasesService.ts` (`mapPurchase`); `zappoint@5de9d9e:src/pages/admin/attractions/AttractionPurchases.tsx` (~L126)
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None

### BR-PURCH-012 — Money field bounds on create/edit
- **Rule:** Typed amounts clamp to [0, total]; on edit the paid ceiling is max(total, already recorded paid), so a lowered total shows a credit due rather than reducing recorded payment.
- **Workflow:** Create/edit purchase.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/orderAmounts.ts` (`clampAmount`, `editPaidCeiling`, `editBalance`)
- **Exceptions:** Card payments always post the full total (or 0 with a gift card).
- **Verification:** Source-verified
- **Open questions:** None

### BR-PURCH-013 — Event purchase edit contract
- **Rule:** Only `paid`/`partial`/`pending` payment statuses round-trip; `status` is sent only when changed; add-ons are always sent (pivot synced). The server emails on date/time change or cancellation and runs follow-ups on completion.
- **Workflow:** Edit event purchase, status changes.
- **Enforcement layer:** Backend (server-enforced) validation; Mobile client logic
- **Evidence:** `eventPurchasesService.ts` (`mapEditRecord`, `UpdateEventPurchaseInput`, `updateEventPurchase`); `EventPurchaseController::update` (~L851–852), `::updateStatus`
- **Exceptions:** None found
- **Verification:** Source-verified (email side-effects only partly read)
- **Open questions:** None

---

## Events

### BR-EVENT-001 — Event dates must be sent as Y-m-d
- **Rule:** `start_date`/`end_date` arrive as ISO timestamps (Laravel `date` cast); the app converts them to `YYYY-MM-DD` before slot lookups and order lines. The server counts booked tickets with an exact `purchase_date = $date` match.
- **Workflow:** Event onsite purchase, bulk-order event lines.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/events/eventSaleDates.ts` (`eventSaleDates`, `dateKeyOf`); `app/Models/Event.php` (`$casts`, `getBookedTicketsBySlot`); `EventController::getAvailableTimeSlots`
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** See KL-EVENT-002.

### BR-EVENT-002 — Full slots disappear; counts only when capped
- **Rule:** The slot endpoint drops full/blocked slots and returns `remaining_tickets` only when the event has a ticket cap.
- **Workflow:** Event slot picker.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `EventController::getAvailableTimeSlots`; `eventsService.ts` (`fetchEventAvailableTimeSlots`)
- **Exceptions:** Mobile falls back to the raw schedule when the list is empty (KL-EVENT-001).
- **Verification:** Source-verified
- **Open questions:** None

### BR-EVENT-003 — Event create validation
- **Rule:** Location, name, `date_type` required; `end_date ≥ start_date` and required for date ranges; start/end times paired, different, interval ≥ 5 minutes and not longer than the window; ticket cap 1–10000.
- **Workflow:** Create event.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `EventController::store` (rules ~L45–78, `scopedLocation`)
- **Exceptions:** None found
- **Verification:** Source-verified (mobile form validation Not assessed)
- **Open questions:** None

### BR-EVENT-004 — Event edit semantics
- **Rule:** Null times mean "Call to Book"; `image: null` removes the image (absent keeps it); `add_on_ids` is always sent so an empty list detaches all add-ons.
- **Workflow:** Edit event.
- **Enforcement layer:** Mobile client logic (payload contract)
- **Evidence:** `eventsService.ts` (`UpdateEventInput` doc comment); `src/lib/events/eventEditForm.ts`
- **Exceptions:** None found
- **Verification:** Source-verified (backend update rules Not assessed)
- **Open questions:** None

### BR-EVENT-005 — Toggle and delete
- **Rule:** Status toggle flips `is_active`; delete is a soft delete (model `SoftDeletes`) although the UI warns it "can't be undone".
- **Workflow:** Manage Events.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `EventController::toggleStatus`, `::destroy`; `app/Models/Event.php`; `manage-events.tsx` (`handleDelete`)
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** Is there any restore path? None seen in routes.

### BR-EVENT-006 — Event purchase status changes
- **Rule:** Status changes go through `PATCH /event-purchases/{id}/status` (`pending|confirmed|checked-in|completed|cancelled`); moving to `checked-in` stamps `checked_in_at` and checks in connected waivers; cancelling reverses gift card/membership benefits; reactivating a cancelled purchase re-checks capacity and blocks.
- **Workflow:** Event purchase list/details, check-in desk.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `EventPurchaseController::updateStatus`
- **Exceptions:** Ticket-order lines refused (BR-PURCH-007). No refusal for completed/cancelled → checked-in (KL-EVENT-003).
- **Verification:** Source-verified
- **Open questions:** None

---

## Registration forms

### BR-REG-001 — Registration events own location forms
- **Rule:** A registration event (group) holds one form per location; group saves send the full location set plus `expected_location_ids`, and the server refuses if the set changed meanwhile.
- **Workflow:** Registration event editor.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic
- **Evidence:** `registrationFormsService.ts` (`createRegistrationEventGroup`, `updateRegistrationEventGroup`, `deleteRegistrationEventGroup`); `src/lib/registrationForms/registrationPayload.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/RegistrationEventGroupController.php` (~L172, ~L415)
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None

### BR-REG-002 — Who can manage registration forms
- **Rule:** Backend admits `company_admin`, `admin`, `location_manager`; a group can be managed only if every form's location is within the staff member's locations. Mobile shows the module only to `company_admin`/`location_manager` (same as web routes).
- **Workflow:** All registration screens.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only; Web Admin reference behaviour
- **Evidence:** `routes/api.php` (~L859, ~L873); `app/Http/Traits/ManagesRegistrationForms.php` (`accessibleEvent`, `canManageGroup`); `src/app/events/events.tsx`; `zappoint@5de9d9e:src/App.tsx` (`allowedRoles`)
- **Exceptions:** Mobile screens are not guarded on deep link (KL-EVENT-008).
- **Verification:** Source-verified
- **Open questions:** Should `admin` see the module on mobile?

### BR-REG-003 — Deleting forms and events
- **Rule:** Deleting a grouped form removes that location from the event and the last one deletes the event; deleting a whole event requires matching `expected_location_ids` and is refused while a form outside it links to one of its forms as last year's edition.
- **Workflow:** Form editor delete, event editor delete.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `registrationFormsService.ts` (`deleteRegistrationForm` → `group_deleted`); `RegistrationEventGroupController` destroy (~L397–443)
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None

### BR-REG-004 — Hidden entries stop counting
- **Rule:** Hiding an entry removes it from counts but keeps it restorable in a Hidden list.
- **Workflow:** Form details registrations.
- **Enforcement layer:** Backend (server-enforced) endpoints; Mobile UI-only confirmation
- **Evidence:** `registration-form-details.tsx` (`toggleEntry`, `applyEntryToggle`); `routes/api.php` (`entries/{id}/hide|restore`)
- **Exceptions:** None found
- **Verification:** Source-verified (controller body Not assessed)
- **Open questions:** None

### BR-REG-005 — Location lock
- **Rule:** A form's location is locked once it has entries, is linked as a previous edition, or has photo overlays.
- **Workflow:** Form editor.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `ManagesRegistrationForms::locationLocked`; `RegistrationFormDetail.locationLocked` in `registrationFormsService.ts`
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None

### BR-REG-006 — Public registration is web-only
- **Rule:** Guests register at the web `/register/:code` page (API `registration-forms/{code}`, throttled); mobile only shows/shares the link and QR.
- **Workflow:** Registration QR panel.
- **Enforcement layer:** Web Admin reference behaviour
- **Evidence:** `zappoint@5de9d9e:src/App.tsx` (`/register/:code`); `routes/api.php` (~L220–221); `src/components/events/RegistrationQrPanel.tsx`
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None

---

## Check-in

### BR-CHECKIN-001 — Scan codes are classified, never guessed
- **Rule:** Precedence: membership token `mbr_…` → photo-delivery URL → JSON payload (declared `type` with `id`/`reference_number`, else a recognised `reference_number`) → bare reference (`BK…` booking, `ORD…` order, `EVT-XXXXXXXX` event, `WV…` waiver). Anything else is "not recognised"; there is no digit fallback.
- **Workflow:** Camera scan and image upload at the desk.
- **Enforcement layer:** Mobile client logic; Web Admin reference behaviour (stated port of web `utils/scanCode.ts`, not opened)
- **Evidence:** `src/lib/checkin/resolveScannedCode.ts` (`resolveScannedCode`); `src/lib/checkin/parseTicketQr.ts`; `src/app/check-in.tsx` (`dispatchScan`)
- **Exceptions:** Photo-delivery codes are refused with a named message.
- **Verification:** Source-verified (unit tests exist: `resolveScannedCode.test.ts`, `parseTicketQr.test.ts`, not reviewed)
- **Open questions:** None

### BR-CHECKIN-002 — Attraction ticket check-in
- **Rule:** The desk offers Approve only for `confirmed` tickets. The server refuses already checked-in, cancelled, refunded and pending (unpaid) tickets (400), records `checked_in_at`/`checked_in_by`, checks in connected waivers and syncs the parent order's status.
- **Workflow:** Desk ticket surface.
- **Enforcement layer:** Mobile UI-only; Backend (server-enforced)
- **Evidence:** `src/app/check-in.tsx` (`canApprove`); `src/lib/hooks/useEntityCheckIn.ts` (`confirm`); `AttractionPurchaseController::checkIn`, `::verify`
- **Exceptions:** Balance due on a confirmed ticket is a warning only (KL-CHECKIN-001); bulk-order lines are not refused (KL-CHECKIN-002).
- **Verification:** Source-verified
- **Open questions:** None

### BR-CHECKIN-003 — Event ticket check-in
- **Rule:** Refuse when the ticket belongs to a bulk order ("scan the order instead"), is `completed`, `cancelled`, or already checked in; otherwise set status `checked-in`. Outstanding balance is shown but does not block.
- **Workflow:** Desk event surface.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced) for order lines only; Web Admin reference behaviour
- **Evidence:** `src/lib/checkin/eventCheckInRefusal.ts`; `useEntityCheckIn.ts` (`confirm` event branch); `check-in.tsx` (`canApprove`); `EventPurchaseController::updateStatus`; `zappoint@5de9d9e:src/pages/admin/bookings/CheckIn.tsx` (`confirmEventCheckIn`)
- **Exceptions:** List bulk status can bypass the client refusals (KL-EVENT-003).
- **Verification:** Source-verified
- **Open questions:** Should unpaid event tickets be admitted?

### BR-CHECKIN-004 — Bulk order check-in
- **Rule:** Approve ("Check In All") is offered when the order's remaining balance ≤ 0, it is not cancelled/refunded and a line remains. The server refuses cancelled/refunded orders, skips lines not fully paid or already checked in (reported as `skipped`), and marks the order checked-in once every line is in.
- **Workflow:** Desk order surface, Bulk Orders list/details.
- **Enforcement layer:** Mobile UI-only; Backend (server-enforced)
- **Evidence:** `check-in.tsx` (`canApprove`); `src/components/checkin/VerifyOrderDetails.tsx`; `ticketOrdersService.ts` (`checkInTicketOrder`, `remainingBalance`); `TicketOrderController::checkIn`
- **Exceptions:** Lists' "Check in all" has no client gate; the server decides.
- **Verification:** Source-verified
- **Open questions:** None

### BR-CHECKIN-005 — Membership check-in location and override
- **Rule:** A location is required (active location, else the user's home location); an ineligible member can be admitted only as a recorded override ("Manual override by staff").
- **Workflow:** Desk membership surface.
- **Enforcement layer:** Mobile client logic; Web Admin reference behaviour; Backend Not assessed
- **Evidence:** `useEntityCheckIn.ts` (`checkInLocationId`, `confirm` membership branch); `CheckIn.tsx` (`handleMembershipScan`)
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** Membership endpoint enforcement belongs to the memberships investigator.

### BR-CHECKIN-006 — Waiver check-in at the desk
- **Rule:** A scanned waiver can be approved only if signed and not already checked in; row check-in/undo is available in the day's waiver list.
- **Workflow:** Desk waiver surface and list.
- **Enforcement layer:** Mobile UI-only; Backend Not assessed (routes behind `staff`)
- **Evidence:** `check-in.tsx` (`canApprove`); `src/lib/hooks/useDeskWaivers.ts`; `routes/api.php` (~L895–897)
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None

### BR-CHECKIN-007 — Desk day, scope and lookup
- **Rule:** The desk day is the venue (Michigan) date; any date from 2020-01-01 is allowed; lists follow the active location; bookings list latest slot first (ties by id); guest lookup needs ≥ 2 characters and searches five sources independently.
- **Workflow:** Desk lists and guest lookup.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/checkin/deskDate.ts` (`deskTodayKey`); `src/lib/checkin/checkInOrder.ts` (`compareCheckInRows`); `src/lib/hooks/useGuestLookup.ts` (`MIN_GUEST_QUERY`); `check-in.tsx` (`EARLIEST_CHECK_IN_DATE`)
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None

### BR-CHECKIN-008 — Check-in is open to every staff role
- **Rule:** No role restriction beyond being staff: the desk is offered to all roles and the check-in/verify endpoints use plain `staff`.
- **Workflow:** Desk.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only; Web Admin reference behaviour
- **Evidence:** `quickActionItems.ts`; `routes/api.php` (~L320, ~L468–469, ~L754–762, ~L895–897); `EnsureStaff::ROLES`; `AdminSidebar.tsx`
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None

### BR-CHECKIN-009 — One desk route
- **Rule:** Legacy attraction, booking and membership check-in routes redirect to `/check-in`, as on the web.
- **Workflow:** Navigation.
- **Enforcement layer:** Mobile client logic; Web Admin reference behaviour
- **Evidence:** `src/app/attractions/check-in.tsx`, `src/app/memberships/membership-check-in.tsx`, `src/app/bookings/check-in.tsx`; `zappoint@5de9d9e:src/App.tsx`
- **Exceptions:** None found
- **Verification:** Source-verified
- **Open questions:** None
