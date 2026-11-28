# Feature Specification: Refund-to-Void Feedback and Restore Clash Warnings (Web Admin Parity)

**Feature Branch**: None created. Spec directory `002-refund-void-restore-parity`. Git branch creation was not
authorized, and no `before_specify` hook is registered (`.specify/extensions.yml` does not exist).

**Created**: 2026-11-28

**Status**: **Approved by the developer on 2026-11-28**, including clarified FR-008, the refund-only 60 s wait
(FR-017) and U5 as an unknown outcome. **Amended on 2026-11-28 at plan approval** (D-1 advisory retry warning, FR-021;
D-2 unknown restore outcomes, FR-012/FR-013/FR-015; D-3 fake-server verification, VR-010). The plan is approved, and
task generation is authorized. **Final review corrections on 2026-11-28**: FR-022 (server-confirmed amounts only),
FR-012 (rejection allowlist re-derived from Backend paths), and VR-008 (void and manual refund left untouched). No
`[NEEDS CLARIFICATION]` markers remain.

**Track**: Full SDD, approved by the developer on 2026-11-28 (constitution v1.0.0, Principle II, Principle IV and
the "Tracks" table: "payment-affecting changes"). The refund work changes how a gateway refund's outcome is
classified and reported to staff. Its smallest part, the restore warning, would alone be at least Lightweight SDD,
because it changes how an API response is used.

**Input**: Developer brief "ZapZone Mobile — Web Admin Parity" (2026-11-28) for Web Admin commit
`701e09c682cd82b86d1ba78cacbd45f3869454c8`: "Refunds that become voids say so, restoring a booking warns when its
time was taken, and the booking site hides +$0 per additional."

This specification authorizes no application, Web Admin, Backend, dependency, native, release or Spec Kit change.
It authorizes no live refund, void, charge, cancellation or production booking change, during investigation or
testing.

---

## Context and Evidence Baseline

**Inspected revisions**

| Repository | Revision | Notes |
|---|---|---|
| Mobile | `main` @ `f8b06cc` | Clean working tree at inspection |
| Web Admin | `zappoint@701e09c` (parent `73818ef`); `HEAD` `47b70b1` | Commit is on `main`; clean working tree |
| Backend | `zapzone-backend@2bbd0fa` (`HEAD`) | Clean working tree. Void fallback introduced in `c5e22f7`; restore space warnings in `09e2ff7` |

All findings below come from static source inspection. Nothing was run against a live or sandbox environment.

### Web Admin commit `701e09c` — what actually changed

Eight files, +41/−8. The commit adds no tests.

| File | Change |
|---|---|
| `src/types/Payment.types.ts` | New `RefundVoidedInsteadResponse` = `VoidResponse` + `was_void_fallback: true` |
| `src/services/PaymentService.ts` | `refundPayment` now returns `RefundResponse \| RefundVoidedInsteadResponse`. The request is unchanged (`PATCH /payments/{id}/refund`, `{ amount, notes, cancel }`) |
| `src/components/admin/payments/RefundModal.tsx` | If `'was_void_fallback' in response`, shows a success toast: "This payment had not settled yet, so it was voided instead of refunded. The full $X goes back to the card[ and the booking\|purchase was cancelled]." X is `void_amount`, or the payment amount when `void_amount` is absent. The clause appears only when `payable_cancelled` is truthy. The label is "booking" when `payable_type === 'booking'` and "purchase" otherwise. Then calls the new `onVoidedInstead` and closes. Otherwise the existing refund toast runs |
| `src/pages/admin/payments/Payments.tsx` | `onVoidedInstead={handleVoidComplete}`: the list marks the original row voided and inserts the void record (the same path as a direct void) |
| `src/pages/admin/payments/ViewPayment.tsx` | `onVoidedInstead`: close the modal and `reloadPayment()` |
| `src/services/bookingService.ts` | `restoreBooking` type gains `space_warning?: string \| null`. `bulkRestore` type gains `space_warnings?: {id, reference_number, message}[]` |
| `src/pages/admin/bookings/Bookings.tsx` | Single restore: `alert(response.space_warning \|\| 'Booking restored successfully')`. Bulk restore: count line plus one `"<ref>: <message>"` line per warning. Refresh behaviour is unchanged |
| `src/pages/admin/bookings/BookPackage.tsx` | Flat-priced packages: show `"N included, +$P per additional (Max: M)"` only when `Number(price_per_additional) > 0`, otherwise `"N included (Max: M)"`. This page is the **public booking site** route `/book/package/:location/:slug` (`zappoint@701e09c:src/App.tsx`), although the file sits under `pages/admin` |

### Backend contracts (authoritative)

**Gateway refund**: `PATCH /api/payments/{payment}/refund`. Middleware `staff`
(`zapzone-backend@2bbd0fa:routes/api.php`). Location-scoped by `denyForeignPayment`.
`PaymentController::refund`.

- Validation: `amount` (optional, ≥ 0.01), `notes`, `cancel` (optional boolean). The payment must be `completed` and
  `authorize.net`, and the amount must not exceed the remaining refundable balance. All of these return 400 before
  any gateway call.
- **Refund success** (HTTP 200): `success: true`, `message` ("Full/Partial refund processed successfully"),
  `data.original_payment`, `data.refund_payment`, `refund_transaction_id`, `refund_amount`, `total_refunded`,
  `remaining_balance`, `is_full_refund`, `payable_cancelled`, `payable`. `cancel` defaults to `is_full_refund`.
- **Void fallback** (HTTP 200): taken only when Authorize.Net rejects the refund with `E00027` (transaction not
  settled), the refund is for the **full** amount, and nothing was refunded before. The server then sends a
  `voidTransaction`. If the void succeeds, it marks the original payment `voided`, creates a `VOID-…` payment
  record, and updates the payable. It responds `success: true`, `message: "Transaction was unsettled — voided
  successfully instead of refunded"`, `data.original_payment`, `data.void_payment`, `void_amount` (= full payment
  amount), `was_void_fallback: true`, `payable_cancelled` (`payable !== null && payable.status === 'cancelled'`),
  and `payable` (`PaymentController.php` ~L1312–1431).
  - The payable update **ignores the `cancel` flag**. Booking → `cancelled`, `payment_status voided`, space
    released. Event purchase → `cancelled`. Attraction purchase → status **`refunded`** (so `payable_cancelled` is
    `false`). Ticket order → `TicketOrderService::applyRefund(…, 'void')`. Gift card → unchanged.
- **Failure responses**: no failure path returns 2xx. The server message is in `message`. Not every error proves
  that no money moved. Inspection at `2bbd0fa` found:
  - **Before any money can move**: 403 (foreign payment); 404; 422 (validation, gift-card hold); 400 for the
    status, method and refundable-balance checks and for `MISSING_CARD_LAST_FOUR` (after a read-only detail
    lookup); 503 "No active Authorize.Net account"; 500 `error_code: DECRYPTION_FAILED` (credentials are decrypted
    before any gateway call). These are confirmed failures.
  - **Gateway answered and refused**: 400 "Refund transaction failed" (the gateway's result code was Ok but the
    transaction carried errors; no `is_unsettled` key), and 400 with a non-null `error_code` and
    `is_unsettled: false`. These are confirmed failures.
  - **Gateway did not answer the refund**: the Authorize.Net SDK returns `null` on a transport failure, including a
    timeout after the request was sent (`vendor/authorizenet/…/HttpClient.php` `_sendRequest`,
    `ApiOperationBase::execute`). The handler then returns **400 `message: "Unknown error"`, `error_code: null`,
    `is_unsettled: false`**, even though the gateway may have processed the refund. Outcome unknown.
  - **Unsettled, and the void fallback "failed"**: 400 `is_unsettled: true`. The body does not say whether the
    gateway refused the void or never answered it (`$voidResponse == null` takes the same path). Outcome unknown.
  - **Exception after gateway approval**: the database writes that follow an approved refund or void
    (`Payment::create`, payable updates and the rest) are not in a transaction, and the outer `catch (\Exception)`
    also wraps the gateway call. A generic **500** "Refund processing failed: …" can therefore follow money that has
    already moved. Outcome unknown (O-7).
- No per-payment lock or idempotency key protects the refund endpoint. The only lock is a gift-card
  `lockForUpdate` (see O-3).
- **No Backend automated test covers the void fallback.** Its only evidence is source-level.

**Single restore**: `POST /api/bookings/{id}/restore`. Middleware `staff`. Scoped to the caller's staff locations.
`BookingController::restore` (~L5258–5337).

- Rejections, all before any change: 422 when the gift card was already reversed; 422 when
  `SlotCapacityGuard::assertBookingFits` fails; an availability-block refusal (handled by Mobile's existing global
  blocked-period prompt); 422 `change_reason` when a reason is required (handled by Mobile's existing global
  reason prompt); 404 when the booking is not trashed or out of scope. *(The Backend's 404 is pre-change for that
  request, but Mobile conservatively classifies any restore 404 as **unknown**, because the booking may already have
  been restored by an earlier attempt; see FR-012.)*
- **Success** (HTTP 200): `success: true`, `message` (= the warning when there is one, otherwise "Booking restored
  successfully"), `space_warning` (string or `null`), `data` (the restored booking).
- `space_warning` is non-null only when the booking's released slots were taken by bookings created **after** it
  was deleted, for a non-past date. Example: "Booking restored, but its time was taken while it was deleted: Room B
  is also booked then by REF-123. Move one of the bookings so they do not clash." (`retakeSpaceAfterRestore`,
  ~L3322–3375).
- **Overlap is permitted.** The restored slots are set back to `booked` whether or not they clash. The warning
  accompanies a completed restore, not a rejection. This is test-backed (`tests/Feature/AreaSimultaneousStartsTest.php`:
  `test_restoring_warns_when_another_booking_took_the_space` asserts that the booking is restored and that both
  slots are booked).

**Bulk restore**: `POST /api/bookings/bulk-restore` returns `data.restored_count`, `data.blocked[]` and
`data.space_warnings[]`. Mobile has no bulk restore (see the parity table).

### Mobile today

- **Refund**: the only gateway refund entry point is the Payments list, under the row's More sheet → "Refund
  (Authorize.Net)" (`src/app/payments/payments.tsx`: `PaymentActionsSheet` → `confirmAction` → `runAction`).
  `refundPayment` (`src/services/paymentsService.ts`) always sends `{}`, which means a full refund with the
  default `cancel`, and **discards the response** (`Promise<void>`). On success, `runAction` closes the sheet and
  reloads the list, and **shows no message at all**, for a refund or a void. On a thrown error it shows
  "Refund failed" with the server message, keeps the sheet open, and does not reload. Because Mobile refunds are
  always full and first-time, the void fallback **can apply to every Mobile refund**.
- Duplicate submission: an `Alert` confirmation, then `actionBusy` swaps the sheet's actions for a spinner and
  blocks closing while the request is in flight.
- Transport: `apiRequest` default timeout of **15 s**. A timeout or network failure throws `ApiError` status 0
  ("Request timed out after 15s. Please try again."), which is reported as "Refund failed". By comparison, Mobile
  card charges use 60 s and treat status 0/502/504 as an unknown outcome (`src/lib/payments/chargeOutcome.ts`).
  The Web Admin refund call has no client timeout.
- No other Mobile surface calls the refund endpoint. Booking, attraction, event and membership details have no
  gateway refund. Membership payment refunds use separate endpoints that the Web commit did not touch.
- **Restore**: the only entry point is Bookings → "View Deleted" → row More → "Restore Booking"
  (`src/components/ui/BookingActionsSheet.tsx` `runRestore`). `restoreBooking` (`src/services/bookingsService.ts`)
  discards the response. On success it reloads the Deleted list (`onChanged={showDeleted ? loadDeleted : refetch}`
  in `src/app/bookings/bookings.tsx`) and **always** alerts "Booking restored — <ref> was restored.". Failures show
  "Restore failed" with the server message. Mobile has no bulk restore and no calendar restore.
- **Participant pricing**: staff booking flows already hide zero surcharges. Create Booking's participant picker
  shows only "N included • Max: M" and never a per-additional price (`src/app/bookings/create-booking.tsx` ~L2633).
  Its summary rows render "Additional Participants" only when `pricePerAdditional > 0` (~L3694, ~L4064). Manual
  Booking's breakdown does the same (`src/app/bookings/manual-booking.tsx` ~L2798). The summary-line helper returns
  nothing for a zero price, and this is test-backed (`src/lib/bookings/bookingSummaryLines.test.ts`). Missing values
  map to 0 (`bookingsService.ts` `Number(raw.price_per_additional ?? 0)`).

### Parity classification

| Web change | Classification | Basis |
|---|---|---|
| A. Refund that became a void is reported as a void, with cancellation mentioned only when confirmed | **Applicable — gap** | Mobile discards the refund response and gives no outcome feedback, so staff are never told that a void happened instead |
| A′. Refresh after a void-instead-of-refund | **Already aligned** | Mobile already reloads the whole payment list after any successful refund call |
| B. Single restore shows the Backend clash warning | **Applicable — gap** | Mobile discards `space_warning` and always shows an unconditional success message |
| B′. Bulk restore lists per-booking warnings | **Not applicable** | Mobile has no bulk restore. Adding one would be a new feature |
| C. Public booking site hides "+$0 per additional" | **Not applicable — Web-only** | Public storefront page with no Mobile counterpart. The analogous staff displays on Mobile already hide zero surcharges (see above) |

---

## Clarifications

### Session 2026-11-28

- Q: How should Mobile present and handle a refund whose outcome it cannot confirm (a timeout, a lost connection,
  an ambiguous gateway or server response)? → A: Option A, with safeguards.
  - Report the outcome as **unknown**: neither a definitive failure nor a success, of either a refund or a void.
  - Tell staff to verify the payment status before attempting another refund.
  - Refresh payment data with the existing read-only reload.
  - Never automatically retry, and never start any other financial operation.
  - Never treat an unchanged record after the refresh as proof of failure.
  - Classify confirmed failures and unknown outcomes from the inspected API and error-handling contracts. Not every
    HTTP error proves that no money moved.
  - Raise the refund request's wait to 60 s (refund only). The global timeout and every other request stay
    unchanged. The longer wait reduces premature client timeouts. It does not guarantee completion or address
    server-side concurrency (O-3).
  - Keep the existing confirmation and busy-state protections. The planning stage assesses whether the existing UI
    discourages unsafe retries enough, without new eligibility rules or permanent client-side blocks, and raises
    any policy decision for developer approval.
  - Void feedback uses only server-confirmed amount and cancellation information, infers nothing missing, and makes
    no promise about when funds reach the card.
  - O-1 is out of scope. O-3 is a separate high-priority payment-integrity investigation, with exploitability not
    confirmed. O-4 is a separate Backend test-coverage concern. O-6 is mitigated here, not eliminated.
  - Suggested wording: "The refund result could not be confirmed. The transaction may still have been processed.
    Please verify the payment status before attempting another refund."
  - Recorded in FR-006, FR-008, FR-017 to FR-020, the outcome table, Story 1, Edge Cases, SC-004, SC-008, SC-009,
    and VR-001 to VR-010.
- Approval (developer, 2026-11-28): the specification is approved, and **U5 is confirmed as an unknown outcome**.
  U3, U4 and U5 remain unknown, according to the documented Backend response contracts. Mobile shows no definitive
  failure when the Backend cannot establish whether the financial operation occurred. The confirmed-failure
  allowlist stays conservative: unrecognized, malformed, contradictory or ambiguous responses are never treated as
  confirmed success or confirmed failure without sufficient evidence. The Backend observations (O-1 to O-7) remain
  source-derived findings, not runtime-confirmed incidents.
- **Approved specification amendment (developer, 2026-11-28, at plan approval)**:
  - **D-1, advisory retry warning (new FR-021)**: after an unknown refund outcome, remember that payment, for the
    authenticated account, for the current screen session, and add a warning to that payment's next Refund
    confirmation. It is not persisted, not an eligibility rule, never disables Refund, and never retries. It is not
    cleared because a refresh shows the record unchanged. It reduces the risk of an accidental staff retry. It
    **does not** resolve or reduce the server-side concurrency weakness (O-3).
  - **D-2, unknown restore outcomes (amends FR-012, FR-013, FR-015)**: a generic server error, a timeout, a lost
    connection, a malformed success response, or any other response that cannot establish the result is an unknown
    restore outcome. Confirmed restore, confirmed restore with a clash warning, confirmed rejection, and unknown are
    distinguished. Confirmed and unknown outcomes refresh the Deleted list and sync the active list through existing
    read-only mechanisms. There is no automatic retry. An unchanged record after a refresh is not proof of failure, a
    refresh failure never overwrites the feedback, and no new scheduling, conflict or restore-eligibility rule is
    added.
  - **D-3, manual verification**: a dependency-free local Node stub, outside the tracked repository, serving only
    synthetic accounts, payments, bookings and responses. It never forwards to the real Backend or to Authorize.Net,
    and no production credentials or customer or payment data are used. No permanent application-configuration or
    release change is made. Any configuration change needed to reach the stub must be reported and authorized first.
    It is planned only; not created or run before implementation.
  - **Planning corrections**: Mobile mitigates misleading feedback and accidental staff retries only. O-3 (server-side
    concurrency) and O-7 (Backend response and transaction consistency) remain separate, unverified Backend
    concerns. Amount fields are validated strictly (FR-022). The classifiers do not handle authentication: 401 and
    session teardown stay with the shared client.
- **Final review corrections (developer, 2026-11-28)**:
  - **FR-022**: only valid, server-confirmed amounts are displayed. A missing or invalid amount is omitted, and the
    original payment amount is **never** substituted. An otherwise confirmed outcome is preserved. This deliberately
    diverges from the Web Admin's fallback to the payment amount.
  - **FR-012**: the confirmed-rejection allowlist is re-derived from Backend execution paths (research R-15).
    Status plus JSON is not enough. Each rejection case is tied to a body shape that only pre-change code produces.
    A 404 is now **unknown**: it most often follows an earlier attempt that already restored the booking.
  - **Architecture**: five pure modules (plan.md). Void and manual refund stay untouched, and their timeouts are
    evidenced by static source inspection and the device stub, not by extraction.
  - **Verification categories** are kept distinct (see the Verification requirements).
  - **Not in scope**: F-5, F-6, O-3 and O-7 remain separate follow-up investigations.
- **Final remediation (developer, 2026-11-28; analysis findings I1, U1, P1, A1, I2, D1, T1)**:
  - **I1 (Option A, FR-015 amended)**: the shared client's existing blocked-period continuation is an **authorized
    continuation**, not a retry. It is permitted only after a source-confirmed pre-change refusal, through the
    existing confirmation workflow, with remembered confirmations scoped to the account, the booking and the exact
    block ids. The Backend re-validates staff permission and every block id on the continuation, after the
    change-reason check (research R-15). The feature itself never retries after classifying an outcome. No
    continuation follows a timeout, a server error, a malformed response or an unknown outcome.
  - **U1**: refund F3 is tightened to recognized shapes, with the reasoning documented.
  - **A1**: SC-003 applies when the automatic refresh succeeds.
  - **I2**: a restore 404 is pre-change at the Backend, but Mobile classifies it as unknown.
  - **D1**: FR-007 and FR-018 are cross-referenced.
  - **T1**: a glossary was added.
  - **Wording**: when no valid server amount exists, feedback is neutral ("Payment refunded successfully.", "Payment
    voided instead of refunded.", "Payment voided instead of refunded, and the associated booking was cancelled.").
    "The full payment amount goes back to the card" is no longer used.
  - **Session safety (new FR-023)**: single-flight locks are owned per session and acquired synchronously. Feedback,
    the warning and refreshes are suppressed if the session that started the attempt is no longer current. No new
    session policy and no change to the shared authentication code.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Staff are told what a refund actually did (Priority: P1)

A staff member refunds a recent card payment from the Payments list. If the card payment had not settled, the
server voids it instead. The staff member is told plainly that the payment was voided, not refunded, that the full
amount goes back to the card, and whether the booking or purchase was cancelled. When a refund really happens, they
are told that it was refunded. When the server confirms a rejection, they see the server's reason. When the
outcome cannot be confirmed, they are told exactly that: the refund may still have been processed, and they must
verify the payment before trying again. They are never told that it succeeded or that it definitively failed.

**Why this priority**: it is payment integrity. Staff relay this to customers ("refunded" and "voided" differ in
timing and in how they appear on the card statement), and today Mobile says nothing at all on success.

**Independent Test**: with the refund request answered by a fake server or a synthetic response (no gateway
involved), run each row of the outcome table, including no answer at all. Check the message shown, the absence of
any extra or repeated financial request, the 60 s refund wait, and the list refresh.

**Acceptance Scenarios**:

1. **Given** a completed Authorize.Net payment, **When** staff confirm Refund and the server answers success with
   `was_void_fallback: true` and `payable_cancelled: true` for a booking, **Then** staff see a success message
   saying the payment was voided instead of refunded and that the booking was cancelled. The amount is named only
   when the server's `void_amount` is valid; otherwise the message reads "Payment voided instead of refunded, and the
   associated booking was cancelled." The payment list then reloads and shows the original payment as voided.
2. **Given** the same, **When** the server answers `was_void_fallback: true` with `payable_cancelled: false` (for
   example, an attraction purchase), **Then** the message says the payment was voided instead of refunded and says
   nothing about cancellation.
3. **Given** a settled payment, **When** the server answers a refund success without `was_void_fallback`, **Then**
   staff see a refund confirmation stating the server's valid `refund_amount`. If it is missing or invalid, the
   confirmation is neutral: "Payment refunded successfully." Nothing in it mentions a void.
4. **Given** a refund the server confirms as rejected (a confirmed-failure row of the outcome table, for example a
   gateway decline with an error code, or a 422), **When** it answers, **Then** staff see "Refund failed" with the
   server's message. No success message appears, and no further refund or void request is sent.
5. **Given** the refund request receives no answer within 60 s, or the connection drops, **When** the request
   ends, **Then** staff see the unknown-outcome message (FR-008), not "Refund failed" and not a success. The payment
   list reloads, and no refund, void or other financial request is sent.
6. **Given** the server answers 502 or 504, a generic 500, 400 "Unknown error" (`error_code: null`,
   `is_unsettled: false`), or 400 `is_unsettled: true`, **When** it answers, **Then** staff see the unknown-outcome
   message, as in scenario 5.
7. **Given** an unknown outcome, **When** the reloaded list still shows the payment as completed, **Then** the
   app does not report or imply that the refund failed, and the unknown-outcome message stands.
8. **Given** a confirmed or unknown outcome, **When** the list reload itself fails, **Then** the outcome message
   already shown stands unchanged, the list shows its existing load-error state, and nothing is retried.
9. **Given** a refund in flight, **When** staff try to trigger it again or close the sheet, **Then** they cannot,
   as today. Even a rapid second confirmation sends no second refund request.
10. **Given** an earlier unknown outcome for payment P under the current account, **When** staff choose Refund on P
    again in the same screen session, **Then** the confirmation also shows "The outcome of a previous refund attempt
    could not be confirmed. Verify the transaction before proceeding with another refund." Staff may still proceed
    or cancel, and nothing is blocked or retried automatically.
11. **Given** that warning exists for payment P, **When** staff open Refund on a different payment, or a different
    account uses the screen, **Then** no warning appears.
12. **Given** a refund in flight under account A, **When** the session changes (account switch, or sign-out and sign
    in) before the answer arrives, **Then** the late answer shows no feedback, records no warning and triggers no
    refresh. An unresolved request from the old session does not block a Refund started by the new session (FR-023).

---

### User Story 2 — Restoring a booking warns when its time was taken (Priority: P2)

A manager restores a deleted booking from the Deleted view. If another booking took the same space or a
too-close start while it was deleted, the restore still completes, as the server allows overlap. The manager sees
the server's warning naming the clashing booking(s), so they know to move one. When there is no clash, they see
the existing "restored" confirmation. When the result cannot be established, they are told that it could not be
confirmed and that they should check the booking before restoring it again.

**Why this priority**: it prevents silent double-bookings of a room. It is not payment-affecting, so it ranks
below Story 1.

**Independent Test**: with a fake server or synthetic responses, restore with `space_warning` null, with
`space_warning` set, with a 422, with a generic 500, with a malformed 2xx, and with no answer. Check the message,
the Deleted-list refresh and the active-list sync in each case.

**Acceptance Scenarios**:

1. **Given** a deleted booking whose time is still free, **When** staff confirm Restore and the server answers
   `success: true` with `space_warning: null`, **Then** staff see the existing "Booking restored" confirmation. The
   Deleted list reloads without that booking, and the active list syncs to include it.
2. **Given** a deleted booking whose space was taken, **When** the server answers `success: true` with a non-empty
   `space_warning`, **Then** staff see the server's warning text in full, presented as a completed restore that
   needs attention, never as the generic success message alone. Both lists refresh, as in scenario 1.
3. **Given** a restore the server rejects before any change (FR-012 rejection shapes: staff-only 403; 422 gift card,
   capacity or blocked-for-guest; 422 missing change reason after staff cancel the prompt; 409 blocked period after
   staff decline it), **When** it answers, **Then** staff see "Restore failed" with the message. Nothing claims a
   restore, and nothing reloads (today's behaviour).
4. **Given** the server requires a change reason or warns of an availability block, **When** staff restore,
   **Then** the existing reason and blocked-period prompts behave exactly as today, and the final outcome follows
   scenarios 1 to 3 or 5 (continuations: scenarios 7 and 8).
5. **Given** the restore gets no answer, a 502/504, a generic 500, a 404, a 2xx without `success: true`, or a
   403/409/422 whose body is not one of the FR-012 rejection shapes, **When** the request ends, **Then** staff see "The booking restoration could not be confirmed. Please check the booking status
   before attempting to restore it again." Both lists refresh, nothing is retried, and neither "restored" nor
   "Restore failed" is shown.
6. **Given** a confirmed or unknown restore, **When** the Deleted-list reload or the active-list sync fails,
   **Then** the restore feedback stands unchanged, each list shows its existing error state, and an unchanged record
   after the refresh is not treated as proof of failure.
7. **Given** a restore refused with 409 `BLOCKED_PERIOD`, **When** staff confirm the existing blocked-period prompt,
   **Then** the shared client sends exactly one authorized continuation carrying the acknowledged block ids (two
   requests in total), and its answer is classified by FR-010 to FR-012.
8. **Given** staff confirmed the same block ids for the same booking within the last 5 minutes, **When** the server
   refuses again with 409 for those blocks, **Then** the shared client sends one continuation without re-prompting
   (two requests in total), and the Backend re-checks staff permission and every block id. No continuation is sent
   for another account, another booking, or blocks that were not confirmed.
9. **Given** a restore whose outcome is unknown (no answer, a 500, a 404, a malformed 2xx), **When** it is
   classified, **Then** no further restore request is sent by the feature or the shared client (exactly one
   request).

---

### Edge Cases

- `was_void_fallback` is present but `void_amount` is missing, null or invalid: the void is still confirmed, and the
  message is the neutral "Payment voided instead of refunded." (plus the cancellation clause when confirmed). The
  payment's own amount is never substituted (FR-022; a deliberate divergence from the Web Admin).
- `refund_amount` is missing, null or invalid on a confirmed refund: the refund is still confirmed, and the message
  is the neutral "Payment refunded successfully." (FR-022).
- An amount field is present but malformed (empty, non-numeric, negative, zero, or non-finite): no dollar figure is
  derived from it and none is fabricated. The outcome (decided by `success` and `was_void_fallback`) is unchanged.
- `payable_cancelled` is absent or non-boolean: it is treated as not cancelled, and no cancellation is mentioned.
- The payable type is not a booking (event purchase, ticket order): the cancellation clause says "purchase",
  matching the Web Admin.
- A 2xx answer with `success: true` but neither the void marker nor a refund record: treated as a refund success.
  The refund-record number is shown only when present.
- A 2xx answer whose body is missing, unreadable or lacks `success: true`: unknown outcome. The server answered,
  but Mobile cannot tell a refund from a void.
- A response status or body shape that is not in the outcome table: unknown outcome, never a confirmed failure.
- `space_warning` is an empty or whitespace-only string: treated as no warning (Web Admin uses `||`).
- A restore answered with a status that is neither a confirmed success nor a listed rejection (for example a
  generic 500): unknown restore outcome (D-2).
- The list reload after a confirmed or unknown refund outcome fails: the outcome message has already been shown.
  The list keeps its existing load-error behaviour, and the outcome message is not withdrawn, contradicted or
  re-classified.
- The gateway completes the refund just after Mobile's 60 s wait expires: staff saw the unknown-outcome message,
  and the payment's true status appears on a later reload. The longer wait reduces how often this happens but
  cannot prevent it.
- The session expires mid-request (401): the existing global sign-out handling applies, and no outcome message is
  shown.
- A restored booking is cancelled or completed: the server never warns (`space_warning: null`), and the existing
  confirmation applies.
- The signed-in account changes while the Payments screen still holds a retry warning: the warning is keyed to the
  account that saw the unknown outcome, so it is never shown to another account (FR-021).

---

## Requirements *(mandatory)*

### Functional Requirements — refund outcome (Story 1)

- **FR-001**: Mobile MUST read the refund endpoint's response and classify the outcome **only** from the presence or
  absence of an answer, the HTTP status, and these explicit fields: `success`, `was_void_fallback`,
  `payable_cancelled`, `is_unsettled` (including whether the key is present) and `error_code`, exactly as set out in
  the outcome table. It MUST NOT infer an outcome from message text.
- **FR-002**: Server success with `was_void_fallback === true` → Mobile MUST show a success message that the payment
  was **voided instead of refunded**. When the server's `void_amount` is valid, the message MAY add that the
  payment had not settled and that the full $X goes back to the card (the Web Admin wording). Otherwise it MUST be
  the neutral "Payment voided instead of refunded." (FR-022). The message MUST NOT describe the operation as a
  refund. It MUST NOT promise when funds become available on the card, and it MUST NOT state any transaction detail
  the server did not return.
- **FR-003**: The FR-002 message MUST state that the booking (when the payment's payable type is booking) or the
  purchase (any other type) was cancelled **if and only if** `payable_cancelled === true`. In the neutral form this
  reads "Payment voided instead of refunded, and the associated booking was cancelled." (or "associated purchase").
- **FR-004**: Server success without the void marker → Mobile MUST show a refund confirmation stating the refunded
  amount (the server's `refund_amount`, only when it is valid; FR-022) and, when present, the refund record's
  number. Without a valid amount, the confirmation is the neutral "Payment refunded successfully." This replaces
  today's silent success. A `success: true` response with no refund record or no valid amount is still a confirmed
  refund; only the missing detail is omitted.
- **FR-005**: After any FR-002 or FR-004 outcome, Mobile MUST close the actions sheet and reload the payment list,
  as it does today, so the original payment's new status and the new refund or void record are shown without
  manual action.
- **FR-006**: **Confirmed failure** → Mobile MUST show "Refund failed" with the server's message, no success
  message, and no list change claimed, as today. A response counts as a confirmed failure **only** when it matches a
  confirmed-failure row of the outcome table. That covers the server-written rejections made before any money can
  move, and the gateway refusals that carry the gateway's answer. Every other non-2xx response is an unknown outcome
  under FR-008.
- **FR-007**: Mobile MUST NOT send any additional refund, void or status request to determine or confirm an
  outcome. (FR-007 governs requests made to *learn* an outcome. FR-018 governs *retries and other financial
  operations* after an outcome. Both apply.)
- **FR-008**: **Unknown outcome** (an unknown row of the outcome table: no answer, a timeout, a lost connection,
  502/504, a generic 500, 400 "Unknown error" with `error_code: null` and `is_unsettled: false`, 400
  `is_unsettled: true`, a 2xx without a readable `success: true`, or any response the table does not list) →
  Mobile MUST:
  - say that the result could not be confirmed and that the transaction may still have been processed;
  - instruct staff to verify the payment status before attempting another refund;
  - **not** describe the outcome as a failure, a refund or a void;
  - reload the payment list with the existing read-only reload.

  Suggested wording: "The refund result could not be confirmed. The transaction may still have been processed.
  Please verify the payment status before attempting another refund."
- **FR-009**: Mobile MUST preserve the existing confirmation dialog, refund eligibility (`canRefund`,
  BR-PAYMENT-006), the full-amount request body, the in-flight guard that blocks re-submission and closing, and
  global 401 handling. A 401 is returned by authentication before the refund handler runs.
- **FR-017**: The refund request MUST wait up to **60 s** for an answer, following the card-charge approach. This
  applies to the refund request only. The global default timeout and every other request, including void and manual
  refund, MUST stay unchanged. The longer wait mitigates premature client timeouts (O-6). It does not guarantee
  that the transaction completes, and it does not address server-side concurrency (O-3).
- **FR-018**: Mobile MUST NOT automatically retry a refund and MUST NOT start any other financial operation after
  any outcome (see also FR-007, which forbids requests made to determine an outcome). After an unknown outcome, it MUST NOT encourage an immediate retry. The planning stage MUST assess
  whether the existing UI (the closed sheet, the reloaded list, the verification wording) discourages unsafe retries
  enough. It MUST do so without new refund eligibility rules or permanent client-side restrictions, and MUST raise
  any material policy decision for developer approval. **Assessed at planning** (research R-9, R-14). The
  developer approved the advisory warning (FR-021, D-1). A per-payment single-flight guard against rapid repeated
  confirmations falls within FR-009 and FR-014.
- **FR-019**: After an unknown outcome, Mobile MUST NOT re-classify the outcome from the reloaded data. In
  particular, a payment still shown as completed immediately after the reload MUST NOT be reported or implied as
  proof that the refund failed.
- **FR-020**: If the payment-list reload after a confirmed or unknown outcome fails, the outcome message MUST stand
  unchanged. The list MUST show its existing load-error state, and nothing financial is retried.
- **FR-021** (D-1, approved amendment): after an unknown refund outcome, Mobile MUST remember that payment for the
  authenticated account, for the current Payments screen session. That payment's next Refund confirmation MUST then
  also show: "The outcome of a previous refund attempt could not be confirmed. Verify the transaction before
  proceeding with another refund." The warning MUST:
  - be keyed to both the account and the payment, so it never appears for another account or another payment;
  - be held in memory only, never persisted to device storage;
  - not change refund eligibility, not disable Refund, and not trigger any retry;
  - leave the existing confirmation and duplicate-submission protections intact;
  - **not** be cleared because a refresh shows the payment record unchanged.

  **Lifecycle**:
  - Created on an unknown outcome (U1–U6).
  - Kept through reloads, confirmed failures (F1–F5) and further unknown outcomes.
  - Cleared for that account and payment only by a later confirmed success (S1–S3).
  - Discarded entirely when the Payments screen unmounts, or when the app process ends.

  It reduces accidental staff retries. It does not resolve or reduce the server-side concurrency weakness (O-3).
- **FR-022** (corrected 2026-11-28): Mobile MUST display only valid, **server-confirmed** amounts.
  - A server amount (`void_amount`, `refund_amount`) is valid only as a finite number greater than zero, or a string
    of digits with an optional decimal fraction (the Backend's `decimal:2` form, for example `"50.00"`) whose value
    is greater than zero.
  - If the field is absent, null, or invalid (empty, non-numeric, signed, exponent form, zero, negative or
    non-finite), the message MUST be the neutral confirmed-outcome form, with no amount and no amount-related
    phrase:
    - "Payment refunded successfully." (S3);
    - "Payment voided instead of refunded." (S2);
    - "Payment voided instead of refunded, and the associated booking was cancelled." (S1; "purchase" for other
      payable types).

    A refund record number MAY follow when present.
  - Mobile MUST NOT substitute the original payment amount, the row amount or any client value. It MUST NOT promise
    when funds will become available. Cancellation and the affected entity are mentioned only as FR-003 allows.
  - Amount validity MUST NOT change the outcome classification. An otherwise confirmed refund or void stays
    confirmed.
- **FR-023** (session safety, 2026-11-28): for refund and restore attempts, Mobile MUST:
  - acquire the duplicate-confirmation lock **synchronously** at the start of an attempt, so a rapid second
    confirmation for the same record sends no request;
  - release the lock when the attempt settles, whether it succeeds, fails, throws, or its refresh fails;
  - own each lock per session, so an unresolved request from an earlier or expired session never blocks an attempt
    by the current session;
  - show feedback, record a retry warning (keyed to the account that **started** the attempt), and refresh **only**
    if the session that started the attempt is still current when the answer arrives. Otherwise, all three are
    suppressed, so stale feedback never reaches another account.

  The session's identity is the one the shared client already uses to detect stale replies (`isStaleSessionReply`).
  No new session policy and no change to the shared authentication code.

### Functional Requirements — restore warning (Story 2)

- **FR-010**: Mobile MUST read the restore response. A restore is **confirmed** only by a 2xx whose body has
  `success: true`. When it is confirmed and `space_warning` is a string that is non-empty after trimming, Mobile MUST
  show that text in full as the restore outcome. It MUST NOT show the generic success message alone in that case.
- **FR-011**: When the restore is confirmed and `space_warning` is null, absent, non-string, empty or whitespace
  only, Mobile MUST show the existing "Booking restored" confirmation.
- **FR-012** (amended by D-2; allowlist re-derived from Backend paths on 2026-11-28, research R-15): a **confirmed
  rejection** is **only** one of the following answers. Each is produced solely by inspected code that runs
  **before** any restore-related state change (`zapzone-backend@2bbd0fa`):
  - **(a)** 403 with `success: false`: the `staff` middleware (`EnsureStaff`), before the controller runs.
  - **(b)** 422 with `success: false`: gift card already reversed, slot capacity, or the availability-block guard's
    non-staff refusal. All are controller-written before the restore transaction.
  - **(c)** 422 with `errors.change_reason`: the change reason is missing or too short (`resolveChangeReason`, before
    the transaction). It reaches the classifier only after staff cancel the existing reason prompt, or when the
    retried reason is also rejected.
  - **(d)** 409 with `code: "BLOCKED_PERIOD"`: the availability-block refusal, before the transaction. It reaches the
    classifier only after staff decline the existing blocked-period confirmation, or after a further unacknowledged
    refusal.

  For a confirmed rejection, Mobile MUST keep today's "Restore failed" with today's message, and no reload. **Every
  other outcome is an unknown restore outcome.** That covers no answer, a timeout, a lost connection, 502/504, a
  generic 500, **any 404**, a 2xx without `success: true`, a 403/409/422 with any other body shape, and any unlisted
  status or non-JSON body. For an unknown outcome, Mobile MUST show "The booking restoration could not be confirmed.
  Please check the booking status before attempting to restore it again." It MUST NOT show "restored" or "Restore
  failed".
- **FR-013** (amended by D-2): after a confirmed restore (with or without a warning) **or** an unknown restore
  outcome, Mobile MUST reload the Deleted list and sync the active bookings list, using the existing read-only
  mechanisms (the Deleted-list reload and the existing incremental list sync). Planning confirmed that the active
  list does not re-sync on its own when leaving the Deleted view (research R-10). A failure of either refresh MUST
  NOT overwrite or alter the restore feedback. An unchanged record after the refresh MUST NOT be treated as proof of
  failure.
- **FR-014**: Mobile MUST preserve the existing restore confirmation dialog, the change-reason and blocked-period
  prompts, and the in-flight guard. A rapid second confirmation MUST NOT send a second restore request. It MUST NOT
  add any scheduling restriction, conflict resolution, restore-eligibility rule, forced restore or automatic move.
- **FR-015** (amended by D-2; amended again by I1 Option A, 2026-11-28): Mobile MUST distinguish an **authorized
  continuation** from an **unsafe retry**.
  - **Authorized continuation (preserved; existing shared-client behaviour)**: after a source-confirmed
    **pre-change** refusal (FR-012 (c) or (d)), the shared client MAY send one continuation through the existing
    workflow:
    - the change-reason prompt with the reason staff enter; or
    - the blocked-period confirmation with the acknowledged block ids, including a confirmation staff gave within the
      last 5 minutes for the **same account, the same booking and every one of the same block ids**.

    The Backend re-validates staff permission, the change reason and every block id on the continuation (research
    R-15), so the continuation cannot bypass authorization, change-reason requirements or blocked-period
    restrictions.
  - **Unsafe retry (forbidden)**: the feature MUST NOT send any restore request after it has classified an outcome
    (restored, with warning, rejected or unknown). No restore request is sent after a timeout, a lost connection, a
    generic server error, a 404, a malformed response or any unknown outcome. Mobile MUST NOT add a new retry
    mechanism or change the shared client.

  A manual retry of a restore that already went through returns 404, which Mobile classifies as unknown (FR-012).

### Functional Requirements — participant pricing (no change)

- **FR-016**: Mobile MUST NOT change participant pricing displays, calculations, limits, validation or submitted
  booking data under this specification. The existing zero-surcharge hiding in Create Booking and Manual Booking is
  already aligned and MUST remain covered by its existing tests.

### Payment outcome and failure-path requirements (Principle IV)

Derived from `zapzone-backend@2bbd0fa` `PaymentController::refund` and the Authorize.Net SDK's null-response
behaviour. A Backend contract change requires this table to be re-verified.

| # | Server answer | Outcome | Staff see | Refresh |
|---|---|---|---|---|
| S1 | 2xx, `success: true`, `was_void_fallback: true`, `payable_cancelled: true` | Voided, record cancelled | Voided-instead message + "booking/purchase was cancelled" | Reload list |
| S2 | 2xx, `success: true`, `was_void_fallback: true`, cancelled false or absent | Voided, not cancelled | Voided-instead message only | Reload list |
| S3 | 2xx, `success: true`, no void marker | Refunded | Refund confirmation (amount, record # when present) | Reload list |
| F1 | 400 without an `is_unsettled` key (status, method or balance checks; `MISSING_CARD_LAST_FOUR`; gateway-answered "Refund transaction failed") | Failed, confirmed | "Refund failed: <server message>" | Unchanged (today) |
| F2 | 400 with `is_unsettled: false` and a non-null `error_code` (gateway returned an explicit error) | Failed, confirmed | "Refund failed: <server message>" | Unchanged |
| F3 | Recognized pre-gateway shapes only: **403** with `success: false` (`staff` middleware, `denyForeignPayment`, `denyForeignRecord`); **404** with a JSON object body that has a string `message` and no `success` key (route-model binding of `{payment}`); **422** with `success: false` (gift-card hold) **or** with an `errors` object (request validation). Any other 403/404/422 shape → U6 | Failed, confirmed | "Refund failed: <server message>" | Unchanged |
| F4 | 503 with the server's JSON (`success: false`, "No active Authorize.Net account") | Failed, confirmed | "Refund failed: <server message>" | Unchanged |
| F5 | 500 with `error_code: DECRYPTION_FAILED` | Failed, confirmed | "Refund failed: <server message>" | Unchanged |
| U1 | No answer: a timeout after 60 s or a lost connection | Unknown | Unknown-outcome message | Reload list |
| U2 | 502, 504, or a 503 without the server's JSON | Unknown | Unknown-outcome message | Reload list |
| U3 | 500 other than `DECRYPTION_FAILED` | Unknown (may follow an approved refund or void; O-7) | Unknown-outcome message | Reload list |
| U4 | 400 `is_unsettled: false`, `error_code: null` ("Unknown error": the gateway did not answer the refund) | Unknown | Unknown-outcome message | Reload list |
| U5 | 400 `is_unsettled: true` (the void fallback's own outcome is not reported) | Unknown | Unknown-outcome message | Reload list |
| U6 | 2xx without a readable `success: true` body; any status or shape not listed | Unknown | Unknown-outcome message | Reload list |
| A1 | 401 | Session ended; authentication rejected the request before the handler ran | Global sign-out (existing) | — |

The U5 classification follows the developer's 2026-11-28 rule that an error is not proof that no money moved. It
replaces the server's "could not be voided automatically" text, which the server cannot know to be true when the
gateway did not answer the void. The developer confirmed U5 at specification approval (2026-11-28).

**Contradictory or malformed answers** (for example, `was_void_fallback: true` on a non-2xx response, or
`success: false` on a 2xx) match no S or F row, so they are unknown (U6).

**F3 reasoning (U1, source-backed, `zapzone-backend@2bbd0fa`)**: every 403, 404 and 422 producer on the refund path
runs **before** the handler's `try` block, and so before any gateway call:
- 403: `staff` middleware, `denyForeignPayment` and `denyForeignRecord`, all `success: false`;
- 404: route-model binding;
- 422: request validation (`errors`) and `holdGiftCardValue` (`success: false`).

Inside the `try`, `catch (\Exception)` converts **any** exception, including `ModelNotFoundException`,
`ValidationException` and HTTP exceptions, into the generic 500 (U3). A 403, 404 or 422 therefore cannot follow money
movement. A refund 404 (the payment record is missing) cannot mean an earlier refund succeeded, because refunds never
delete the payment. Only the recognized shapes count, and everything else is unknown.

- **Record-level vs charge-level idempotency** (Principle IV): this feature creates no records. The Backend creates
  the refund or void record. Charge-level protection against a second refund depends on (a) Mobile's in-flight
  guard, (b) the Backend's `completed`-status precondition once the first request commits, and (c) Authorize.Net's
  own limits. There is no server-side lock (O-3). This feature MUST NOT weaken (a). It adds no automatic retry
  (FR-018), its unknown-outcome wording and the advisory warning (FR-021) steer staff to verify before any manual
  retry, and a single-flight guard keeps one request per payment in flight. These measures address misleading
  feedback and accidental retries only. **They do not resolve or reduce O-3 or O-7**, which remain separate,
  unverified Backend concerns.

### Verification requirements (to be executed at implementation; nothing run now)

All verification uses mocked or synthetic responses. **No real refund, void, charge, cancellation or production
booking change is authorized.** Any sandbox gateway use requires separate developer authorization.

**Verification categories** are kept distinct in tasks and reports, and one category never stands in for another:

| Category | What it proves | What it cannot prove |
|---|---|---|
| **Classifier tests** | Pure response-to-outcome and message rules | Anything about real requests |
| **Injected-request tests** | What the pure flow passes to a fake request function (call count, path, method, body, `timeoutMs`), ordering, and refresh-failure handling | That `apiRequest` behaves the same way |
| **Static source inspection** | Untouched code (`src/lib/api.ts`, `voidPayment`, `manualRefundPayment`, `runAction`) and the absence of storage APIs, from the diff | Runtime behaviour |
| **Actual API request-path verification** | The real `apiRequest`, against the D-3 stub, with its request log | Behaviour against the real Backend (not authorized) |
| **Manual Android verification** | On-device UI and feedback, against the D-3 stub | iOS |

- **VR-001**: Focused unit tests in a pure, Node-testable module for the refund outcome classifier, covering every
  outcome-table row S1–S3, F1–F5 and U1–U6. A1 is covered by evidence that the classifier is never reached for a 401
  (the shared client never settles). Edge inputs: missing `void_amount`, missing or non-boolean
  `payable_cancelled`, a non-booking payable label, an empty or unreadable 2xx body, contradictory bodies, an
  unlisted status, and the FR-022 amount cases (`"50.00"`, `50`, absent, null, `""`, `"abc"`, `"-1"`, `"1e3"`, `0`,
  `Infinity`, `NaN`). These are classifier tests; no case substitutes a non-server amount.
- **VR-002**: Unit tests for the message builder. The refund wording never mentions a void. The void wording never
  says "refunded" and makes no promise about when funds arrive. The cancellation clause appears exactly when
  `payable_cancelled === true`. The unknown-outcome wording never says failed, refunded or voided, and tells staff
  to verify before another refund.
- **VR-003**: Timeout and lost-connection cases (U1) are simulated without a gateway, and the unknown-outcome
  handling is confirmed.
- **VR-004**: Ambiguous-response cases (U2–U6) are confirmed to give the unknown outcome and never a confirmed
  failure.
- **VR-005**: Refresh-failure cases, tested at the flow level with an injected reload that rejects. After an S, F or
  U outcome, the outcome message is unchanged and is not re-notified (FR-020). After a U outcome, a reload that still
  shows the payment as completed does not change the message or clear the warning (FR-019, FR-021).
- **VR-006**: No automatic financial retries. Request-level tests with an injected request function show exactly one
  refund request per confirmed attempt for every outcome, and no other financial request. A unit test shows that no
  refund-response fixture satisfies the shared client's two re-send conditions (`requiresChangeReason`,
  `blockedPeriodWarning`). Review evidence confirms the shared client is unchanged (FR-007, FR-018).
- **VR-007**: Duplicate submission and session safety (FR-009, FR-014, FR-023).
  - **C2 tests**:
    - a second start for the same record and session, while one is in flight, sends no request, and the lock is
      taken synchronously (two starts in the same tick → one request);
    - the lock is released after success, failure, a thrown error and a failing refresh;
    - an unresolved attempt owned by an earlier session does not block the current session, and its late
      settlement does not release the current session's lock;
    - a late answer for a session that is no longer current produces no notify, no warning and no refresh.
  - **C3 review**: the confirmation dialog still precedes every refund and restore, and the sheets keep their busy
    guards.
- **VR-008**: Refund-specific timeout (FR-017).
  - **Injected-request test**: the refund flow passes `timeoutMs: 60000`.
  - **Static source inspection**: `voidPayment`, `manualRefundPayment`, `DEFAULT_TIMEOUT_MS` and `src/lib/api.ts`
    are unchanged in the diff. Void and manual refund are **not** extracted or modified.
  - **Actual API request-path verification**: against the D-3 stub, a refund answered after 20 s still succeeds,
    while a void and a manual refund answered after 20 s time out at about 15 s. All responses are synthetic.
- **VR-009**: Restore. Classifier tests for the restore rules and messages: R1–R4 (confirmed, with warning,
  rejected, unknown); a trimmed or whitespace warning; each FR-012 rejection shape (a)–(d) → rejected; any 404, and
  403/409/422 with other body shapes, a generic 500, 502/504, a malformed 2xx and an unlisted status → unknown.
  Flow-level (C2) tests: confirmed and unknown outcomes trigger both refreshes; a rejected outcome triggers none; a
  failing refresh does not alter the feedback; exactly one request per started flow (FR-010 to FR-015). **C4 (D-3
  stub log)**:
  - a newly confirmed blocked period → exactly 2 requests (the 409 refusal plus one continuation with
    `acknowledge_blocked_period` and every block id);
  - a remembered confirmation (same account, booking and blocks within 5 minutes) → exactly 2 requests, with no
    prompt;
  - a declined confirmation → exactly 1 request;
  - another account, another booking, or a new block id → a prompt again, never a silent continuation;
  - an unknown outcome (no answer, 500, 404, malformed 2xx) → exactly 1 request.
- **VR-010**: Regression and checks. Existing suites still pass, including `bookingSummaryLines.test.ts` and
  `packagePricing.test.ts` (FR-016), plus `npm test`, `npm run lint`, `npx tsc --noEmit` and `git diff --check`.
  **Manual Android verification (D-3)** uses a dependency-free local Node stub kept outside the tracked repository.
  It uses only synthetic accounts, payments, bookings and responses, never forwards to the real Backend or to
  Authorize.Net, and uses no production credentials or customer or payment data. It covers every outcome-table row,
  the restore cases, the advisory warning and refresh failures. The **stub request logs** (one request per confirmed
  attempt; no automatic resend; void and manual-refund timeouts) are required evidence for actual API request-path
  verification. Manual verification and the stub logs remain **outstanding acceptance items** until actually
  performed. Reports keep source-verified, unit-tested, runtime and device
  evidence separate (Principle VII). iOS device verification is not applicable until iOS support exists (spec 001).
- **VR-011**: Advisory retry warning (FR-021). Unit tests show that the warning is recorded only on U outcomes; that
  it is keyed to account and payment (it does not appear for another account or payment); that it survives F and U
  outcomes and reloads; that it is cleared by an S outcome for the same account and payment; that it is not recorded
  when no account is known; and that the confirmation text appends the approved sentence only when the warning
  applies. Review confirms the state is in memory only, with no SecureStore or file I/O.

### Glossary

- **Confirmed payment failure** (refund rows F1–F5): the server confirmed the refund was **not** processed, because
  it refused before any money could move or the gateway answered with a refusal. Shown as "Refund failed".
- **Confirmed restoration rejection** (restore, FR-012 (a)–(d)): the server refused the restore **before** any
  restore-related state change. Shown as "Restore failed".
- **Unknown outcome**: the result cannot be established from the answer, or there was no answer. It is never shown
  as success or failure.
- **Authorized continuation** (FR-015): the shared client's single follow-up after a pre-change change-reason or
  blocked-period refusal, through its existing confirmation workflow.
- **Unsafe retry** (FR-015, FR-018): any request repeating an operation after the feature classified an outcome.
  Forbidden.

### Key Entities

- **Refund outcome**: refunded, voided-instead (with or without a cancelled payable), confirmed failure (with the
  server reason), or unknown (the transaction may or may not have been processed). It is derived only from the
  server response, or from the absence of one, as set out in the outcome table.
- **Restore outcome**: restored, restored with a clash warning (the server text naming the clashing references),
  confirmed rejection (with the server reason), or unknown (the restore may or may not have happened).
- **Refund retry warning** (FR-021): an in-memory marker for one account and one payment, recording that a refund
  attempt for that payment had an unknown outcome during this Payments screen session.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of verification cases where the server reports a void instead of a refund, staff see wording
  that says the payment was voided, and in 0 cases wording that says it was refunded.
- **SC-002**: Cancellation is mentioned in exactly the cases where the server confirms it: 0 false mentions and 0
  omissions across the outcome table.
- **SC-003**: After every confirmed refund or void-instead **whose automatic refresh succeeds**, the payment's new
  status is visible without any manual refresh. When the refresh fails, the confirmed outcome message stands
  unchanged (FR-020).
- **SC-004**: 0 verification cases show a success message for a failed or unknown refund outcome, and 0 cases show
  "Refund failed" for an unknown outcome (rows U1–U6).
- **SC-005**: 0 extra refund, void or status requests are sent to determine an outcome.
- **SC-006**: In 100% of restore-with-clash cases, staff see the full server warning. In 0 cases they see only the
  generic success.
- **SC-007**: Participant-pricing totals and submitted booking data are unchanged. Existing pricing tests pass
  unmodified.
- **SC-008**: In 100% of unknown-outcome cases (U1–U6), staff are told that the result could not be confirmed and
  that they must verify the payment before another refund, and the payment list reloads.
- **SC-009**: A refund waits up to 60 s for an answer before it is treated as unknown. Every other request's wait
  is unchanged.
- **SC-010**: In 100% of unknown restore cases, staff see the unknown-restore message and both lists refresh. In 0
  cases they see "restored" or "Restore failed" for an unknown outcome.
- **SC-011**: The advisory retry warning appears on the next Refund confirmation in 100% of same-account,
  same-payment cases after an unknown outcome, and in 0% of cases for another account or another payment.
- **SC-012**: 0 duplicate refund or restore requests result from rapid repeated confirmations.
- **SC-013**: 0 cases where a late answer from an earlier session shows feedback, records a warning or triggers a
  refresh in the current session. 0 cases where such an answer blocks a new attempt.

---

## Assumptions

- The Web Admin wording is the reference. Mobile MAY adapt presentation (an alert title, line breaks), but MUST keep
  the substance required by FR-002 to FR-004 and FR-010.
- The direct "Void Transaction" action, which also gives no success message on Mobile today, is unchanged. It was
  not part of the Web commit (follow-up F-1).
- Partial refunds and the "cancel booking" choice are not offered on Mobile and are not added. The void fallback
  only applies to full, first-time refunds, which is the only kind Mobile sends.
- Cross-module freshness after a void-instead (for example, the Bookings list showing the booking as cancelled)
  follows the existing incremental-sync behaviour, as it does today for direct voids and refunds.

---

## Scope Boundaries

**In scope**:
- refund outcome classification and feedback on the Payments list, including unknown outcomes, the refund-only
  60 s wait, the advisory retry warning, amount validation and session safety (FR-001 to FR-009, FR-017 to
  FR-023);
- single-restore outcome feedback, including clash warnings and unknown outcomes (FR-010 to FR-015, as amended by
  D-2);
- the verification above, including the planned D-3 fake-server check.

**Out of scope**:
- New refund eligibility rules, partial refunds, a cancel-on-refund option, or changes to the payment processor or
  cancellation policy.
- Direct void feedback (F-1), manual-refund feedback, and membership payment refunds.
- Bulk restore (Mobile has none) and any calendar restore.
- Any participant-pricing change (already aligned; Web change C is Web-only).
- Changing the global request timeout, or the void and manual-refund waits.
- Creating or running the fake server before implementation, and any application-configuration change to reach
  it without separate authorization.
- New refund eligibility rules, or permanent client-side refund blocks.
- Acting on Backend observations O-1 to O-7. O-6 is mitigated on the Mobile side only (FR-008, FR-017).
- `KL-PAYMENT-005` (the 2-day void heuristic) and other existing payment limitations.

---

---

## Dependencies and Cross-Repository Observations

No Web Admin or Backend change is required for this specification. The following are recorded for developer
attention (constitution Principle I and Principle III evidence levels):

- **O-1** (source-level evidence; **out of scope** for this task, per the developer on 2026-11-28): the Backend void
  fallback ignores `cancel`. In the Web Admin, a refund with "cancel booking" unticked that falls back to a void
  still cancels the booking or event purchase. Mobile is unaffected, because it never sends `cancel: false`.
- **O-2** (source-level evidence): an attraction purchase voided by fallback becomes `refunded`, not `cancelled`, so
  `payable_cancelled` is `false` and no cancellation is mentioned. This is server truth, and Mobile mirrors it.
- **O-3** (suspected weakness; **exploitability not confirmed**): the refund endpoint has no per-payment lock, so
  concurrent requests are not serialized server-side. Authorize.Net over-credit limits are a probable but
  unverified backstop. The developer has designated this a **separate high-priority payment-integrity
  investigation**. Candidate `KL-PAYMENT-*` entry.
- **O-4** (source-level evidence): no Backend automated test covers the void fallback. This is a **separate Backend
  test-coverage concern**.
- **O-5** (Web-only): the Web Admin bulk restore ignores `data.blocked`. Not applicable to Mobile.
- **O-6** (source-level evidence; runtime unverified): a single refund request can make up to three sequential
  gateway calls (a card-detail lookup when `card_last_four` is missing, the refund, then the void). Mobile's 15 s
  timeout can therefore expire on a request that later succeeds. It is **mitigated in this specification** by the
  refund-only 60 s wait (FR-017) and the unknown-outcome handling (FR-008). The underlying uncertainty is **not
  eliminated**.
- **O-7** (source-level evidence; runtime unverified): the refund handler can return an error after money moved, or
  when it cannot know whether money moved:
  - a generic 500 when an exception follows gateway approval (the database writes are not in a transaction and sit
    inside the outer `catch (\Exception)`);
  - 400 "Unknown error" when the gateway did not answer the refund (the SDK returns `null` on transport failure);
  - 400 `is_unsettled: true` with "could not be voided automatically" even when the void went unanswered.

  Mobile treats all three as unknown (U3–U5). The Web Admin shows them as errors. This is a cross-repository
  observation, and no Backend or Web change is proposed here.

---

## Constitution Alignment

- **I. Parity**: Web `701e09c` and Backend `2bbd0fa` are cited. The classification is recorded per change, and the
  discrepancies are recorded as O-1 to O-7. These approved divergences from the Web Admin are recorded under
  Clarifications (2026-11-28): the unknown refund outcomes, the omission of missing amounts (no fallback to the
  payment amount), the unknown restore outcomes, and the advisory warning.
- **II. Track**: Full SDD, approved by the developer. Scope is bounded, and the Q1 decision is recorded under
  Clarifications.
- **III. Security**: both endpoints are `staff` and location-scoped server-side (`denyForeignPayment`,
  `staffLocationIds`). The messages show amounts and booking references that staff can already see. No card data is
  involved, and no new data is exposed or logged. Mobile gating remains a UX control only.
- **IV. Contracts and integrity**: outcomes come only from the server response or its absence (outcome table).
  Decline, timeout, unknown-outcome and partial-failure paths (O-7) are specified. There are no extra or automatic
  financial requests, and the duplicate-submission guard is kept. The refund-only wait follows the existing
  card-charge pattern. The shared API client is kept, using its existing per-request timeout option, which is not a
  bypass.
- **V. Platforms**: shared code with no platform-specific behaviour. Android regression verification is required;
  iOS is not applicable yet.
- **VI. Architecture**: the shared API client and existing sheets and alerts are reused. Outcome logic goes in a
  pure `src/lib` module for testing.
- **VII. Verification**: VR-001 to VR-011.
- **VIII. Release**: a JavaScript-only change, potentially OTA-compatible (confirmed in the plan). No publish is
  authorized.
- **IX. Documentation impact** (at implementation): the Payments feature section (outcome feedback, the unknown
  outcome, the advisory warning, the 60 s wait), the Manage Bookings Deleted view (restore outcomes, active-list
  sync), BR-PAYMENT-006 (void fallback note), a new `BR-PAYMENT-*` entry for refund outcome classification,
  BR-BOOKING-004 (restore warning, overlap, unknown outcome), and new `KL-PAYMENT-*` entries for O-3 and O-7.
- **X. Collaboration**: no Git, build or publish action is planned without authorization.

## Referenced Business Rules and Known Limitations

- **BR-PAYMENT-006**: refund, void and manual-refund eligibility. Unchanged; preserved by FR-009.
- **BR-BOOKING-004**: soft delete and restore. Extended by the warning feedback; the rule is unchanged.
- **KL-PAYMENT-005**: the 2-day void heuristic. Unchanged; explains why staff may choose Refund on an unsettled
  payment.
- **KL-PAYMENT-006**: charge handler not reviewed. Not affected; the refund handler was inspected for this
  specification.
- **KL-BOOK-004**: the change reason is requested only after a 422. Preserved.

## Follow-ups (not in scope)

- **F-1**: the direct Void action gives no success message on Mobile. The Web Admin shows a toast.
- **F-2** (high priority): a separate payment-integrity investigation of the refund endpoint's missing server-side
  serialization (O-3). Exploitability is not confirmed. This is a Backend decision.
- **F-3**: Backend test coverage for the void fallback (O-4).
- **F-4**: Backend handling of post-approval exceptions and unanswered gateway calls (O-7), which also affects how
  the Web Admin reports these outcomes.
- **F-5** (found during planning; source-derived, runtime unverified): Mobile's manual refund sends `{}`, but
  `PaymentController::manualRefund` requires `notes`. Manual refund likely always returns 422 today. Not changed by
  this feature; the request is kept identical.
- **F-6**: the shared `runAction` path (Void, Manual refund, Delete) lacks the single-flight guard added here for
  Refund and Restore.
- **F-7** (found during remediation; not a weakness): `forgetAcknowledgements()` in `src/lib/blockedPeriodPrompt.ts`
  is never called on sign-out. Remembered blocked-period confirmations are keyed by user id, so there is no
  cross-account reuse. The same account can reuse a confirmation within 5 minutes after re-signing in, and the
  server re-authorizes it. This is shared infrastructure and is not changed here.
