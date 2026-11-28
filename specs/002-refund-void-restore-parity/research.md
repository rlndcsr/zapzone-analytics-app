# Research: Refund-to-Void Feedback and Restore Clash Warnings

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-11-28

**Inspected revisions**: Mobile `main` @ `f8b06cc` (plus the uncommitted spec 002); Backend
`zapzone-backend@2bbd0fa`; Web Admin `zappoint@701e09c`. All findings come from static inspection. Nothing was run
against an API.

The spec left no `NEEDS CLARIFICATION` items. This document records the source facts the design depends on (R-1 to
R-15) and the decisions taken from them, including the developer decisions D-1 to D-3 and the final review
corrections, all approved on 2026-11-28. Line numbers are supplementary.

---

## R-1. Does an HTTP error keep the structured fields the outcome table needs?

**Finding**: yes. `apiRequest` (`src/lib/api.ts` ~L265–369) parses the body with `response.json().catch(() => null)`
and throws `new ApiError(message, response.status, data?.errors, data)`. `ApiError.body` (~L98–123) holds the
**whole parsed body**, so `success`, `error_code`, `is_unsettled`, `message` and `data` all survive. A body that is
not JSON (a proxy HTML page) gives `body === null`. On a transport failure (timeout, dropped connection),
`status === 0` and `body` holds the original exception (~L247–259), not a response.

**Decision**: no shared-infrastructure change. The refund service catches `ApiError` and passes `status` and `body`
to a pure classifier.

**Alternatives rejected**: adding a "raw response" mode to `apiRequest`. It is unnecessary, because the fields are
already preserved, and it would touch shared infrastructure.

## R-2. What does a 2xx give the caller?

**Finding**: `apiRequest` returns `data as T` (~L376), the parsed body, or `null` if the body was not JSON. **The
exact status code is not returned**, only that `response.ok` held.

**Decision**: the classifier receives `{ kind: "ok", body }`. Success requires `body.success === true` (FR-001, spec
edge cases). A 2xx with any other body is unknown (U6). The design needs no distinction between 200 and 201.

## R-3. Do any automatic re-send paths in `apiRequest` apply to a refund?

**Finding**: `apiRequest` re-sends a request in two cases only:
- `requiresChangeReason`: status 422 with `errors.change_reason` (`src/lib/changeReasonPrompt.ts` L28–32);
- `blockedPeriodWarning`: status 409 with `code: "BLOCKED_PERIOD"` (`src/lib/blockedPeriodPrompt.ts` L71–87).

`PaymentController::refund` emits neither shape. Its only 422s are request validation (`amount`/`notes`/`cancel`,
none of which Mobile sends) and the gift-card hold. Neither has `errors.change_reason`. **No automatic re-send can
reach the refund endpoint.** Both helpers have no imports and can be loaded under Node.

**Decision**: add a unit test asserting that every refund-response fixture in the contract yields
`requiresChangeReason(...) === false` and `blockedPeriodWarning(...) === null` (VR-006 evidence). No change to
`apiRequest`.

## R-4. What happens on a 401 or session teardown?

**Finding**: a 401 (or a request made after the session was invalidated) returns `neverSettles()` (~L190–194,
~L293–300). The caller's `await` never resolves and no `catch` runs. `AuthGuard` redirects to login. Authentication
middleware rejects before `PaymentController::refund` runs, so no financial operation happened.

**Decision**: preserve as is (spec row A1). The classifier never sees a 401. Defensively, any status it does not
list (including 401) maps to unknown (U6). The busy state staying set until unmount is existing behaviour.

## R-5. Backend refund response shapes (authoritative)

**Finding** (`zapzone-backend@2bbd0fa:app/Http/Controllers/Api/PaymentController.php` `refund`, ~L856–1499):

| Path | Status | Body keys |
|---|---|---|
| Refund approved | 200 | `success: true`, `message`, `data.{original_payment, refund_payment}`, `refund_transaction_id`, `refund_amount`, `total_refunded`, `remaining_balance`, `is_full_refund`, `payable_cancelled`, `payable` |
| Void fallback approved | 200 | `success: true`, `message`, `data.{original_payment, void_payment}`, `void_amount`, `was_void_fallback: true`, `payable_cancelled`, `payable` |
| Pre-checks (status, method, balance) | 400 | `success: false`, `message` (+ `data` for the balance check). No `is_unsettled` key |
| `MISSING_CARD_LAST_FOUR` | 400 | `success`, `message`, `error_code`. No `is_unsettled`. Only a read-only detail lookup ran |
| Gateway answered, transaction errors | 400 | `success`, `message`, `error_code` (may be null). No `is_unsettled` |
| Gateway result code not Ok, or no gateway response | 400 | `success`, `message`, `error_code`, `transaction_error_code`, `is_unsettled` |
| No active account | 503 | `success: false`, `message` |
| Credential decryption | 500 | `success: false`, `message`, `error_code: "DECRYPTION_FAILED"` |
| Any other exception | 500 | `success: false`, `message: "Refund processing failed: …"` |
| Foreign payment | 403 | `denyForeignPayment` JSON |
| Validation, gift-card hold | 422 | Laravel validation JSON or `holdGiftCardValue` JSON |

- **Amounts are decimal strings.** `Payment` casts `amount` as `decimal:2` (`app/Models/Payment.php` L102). So
  `void_amount`, and `refund_amount` when no amount was sent (always, on Mobile), serialize as for example
  `"50.00"`.
- **No gateway answer**: the Authorize.Net SDK's `HttpClient::_sendRequest` returns the cURL result, which is `false`
  or null on a transport failure, and `ApiOperationBase::execute` then leaves `apiResponse = null`
  (`vendor/authorizenet/authorizenet/lib/net/authorize/…`). For the refund call that gives the 400 "Unknown error"
  row with `error_code: null` and `is_unsettled: false` (U4). For the void call inside the fallback, it gives the
  400 `is_unsettled: true` row (U5).
- **Post-approval exceptions**: `Payment::create` and the payable updates after an approval run outside any
  transaction, inside the outer `try` whose `catch (\Exception)` returns the generic 500 (U3, O-7).

**Decision**: the classifier implements the spec's outcome table exactly (contract in
[contracts/refund-response.md](contracts/refund-response.md)). F rows require recognized JSON shapes. Anything else
is unknown.

**F3 path analysis (U1, final remediation)**: the refund's 403, 404 and 422 producers all run before the handler's
`try` block:
- 403: `EnsureStaff` (`success: false`, three variants), `denyForeignPayment` and `denyForeignRecord` (both
  `success: false`);
- 404: route-model binding of `{payment}` (a Laravel JSON `{ message }`);
- 422: request validation (`{ message, errors }`) and `holdGiftCardValue` (`{ success: false, … }`).

Inside the `try`, `catch (\Exception)` turns every exception, including `ModelNotFoundException`,
`ValidationException` and HTTP exceptions, into the generic 500. So a 403, 404 or 422 can never follow a gateway
call. F3 is tightened to exactly these shapes. Any other 403/404/422 shape is U6.

## R-6. Current Mobile refund path

**Finding**:
- `src/services/paymentsService.ts` `refundPayment` (L442–453) calls `apiRequest` with `PATCH`, the `{}` body and
  the default 15 s timeout, and returns `Promise<void>`, discarding the body.
- `src/app/payments/payments.tsx` → `PaymentActionsSheet.onRefund` (L1100–1107) → `confirmAction` (L692–704,
  `Alert` with Cancel and Refund) → `runAction` (L672–689).
- `runAction`: `setActionBusy(true)`, `await fn()`, then on success `setActionsPayment(null)` and `await load()`. It
  shows **no message** on success. On a throw it shows an `Alert` "`<label>` failed" with `err.message`, keeps the
  sheet open, and does not reload.
- The sheet hides its actions behind a spinner while `actionBusy` is set (L1320–1323), and `onClose` is ignored
  while busy (L1099).
- `runAction` is shared by Refund, Manual refund, Void and Delete.

**Decision**: route only Refund through a dedicated handler, which wires `runRefundFlow` (R-13). Leave `runAction`,
`voidPayment` and `manualRefundPayment` **completely untouched** (final review correction, 2026-11-28).

## R-7. Refresh and feedback

**Finding**: `load()` (L301–318) catches every error into the screen's `error` state and **never throws**.
`selectedPayment` (the detail sheet) is derived from `payments` (L296–299), so it refreshes with the list. Feedback
uses the native `Alert`, which is independent of the screen's `loading` and `error` rendering. A `useFocusEffect`
re-load only happens when `consumePaymentsStale()` is set (L359–363).

**Decision**: show the outcome `Alert` **before** awaiting the reload, so feedback is neither delayed by the list
download nor affected by a reload failure (FR-020). The reload is the existing read-only `load()`. Nothing in the
outcome is re-derived from reloaded rows (FR-019).

## R-8. Timeout precedent

**Finding**: `CHARGE_TIMEOUT_MS = 60000` is passed as `timeoutMs` to `apiRequest` (`paymentsService.ts` L624–647). The
`membershipsService.ts` retry-payment call also passes 60000 (L686). `DEFAULT_TIMEOUT_MS = 15000` (`api.ts` L140) is
unchanged by both.

**Decision**: a refund-only `REFUND_TIMEOUT_MS = 60_000`, exported from `src/lib/payments/refundFlow.ts` and passed
by `executeRefund` on its single request. `voidPayment`, `manualRefundPayment` and every other request are not
modified, so they keep the shared default. That is evidenced by static source inspection and by
request-path verification against the D-3 stub (R-13).

**Alternatives rejected**: reusing `CHARGE_TIMEOUT_MS`, which would couple the refund wait to charge tuning; raising
`DEFAULT_TIMEOUT_MS`, which the spec forbids.

## R-9. Retry safety after an unknown outcome (FR-018 assessment)

**Finding**: after an unknown outcome, the design closes the sheet and reloads. If the server has not yet committed
(for example, the gateway call outlived the client's 60 s), the reloaded row can still be `completed`. `canRefund`
then still offers Refund from the row's More menu. A second attempt passes through the existing confirmation
`Alert`. Server-side, nothing serializes concurrent refunds (O-3). Authorize.Net's credit limits are a probable but
unverified backstop.

What existing UI discourages: the sheet is closed, so Refund is not one tap away; the unknown-outcome wording says to
verify first; and every attempt still needs the confirmation dialog.

**Decision (D-1, approved 2026-11-28; spec FR-021)**: add an advisory warning.
- **State**: a component-local, in-memory set of keys `"<userId>:<paymentId>"`. The user id comes from the session's
  current user at the moment the unknown outcome is recorded, and again when the confirmation is built. So an
  account switch can never surface another account's warning, even if the screen stayed mounted. With no known user
  id, nothing is recorded.
- **Lifecycle**:
  - Added on U1–U6.
  - Kept through reloads, F outcomes and further U outcomes.
  - Removed for that key only by a later S1–S3.
  - Discarded when the Payments screen unmounts or the app process ends.
  - Never written to SecureStore, files or any other storage.
- **Effect**: that payment's next Refund confirmation appends "The outcome of a previous refund attempt could not be
  confirmed. Verify the transaction before proceeding with another refund." It never blocks, never changes
  `canRefund`, and never retries.
- **Logic**: pure helpers in `src/lib/payments/refundFlow.ts`, the module that owns post-outcome effects, so the
  keying and lifecycle are unit-tested (VR-011) without a separate module.

**Correction**: these measures reduce misleading feedback and **accidental staff retries** only. They do **not**
resolve or reduce the server-side concurrency weakness O-3, which remains a separate, unverified Backend concern.

## R-10. Restore path and refresh

**Finding**:
- `bookingsService.ts` `restoreBooking` (L2464–2467) discards the body.
- `BookingActionsSheet.tsx` `runRestore` (L182–211): confirmation `Alert`, `busy` guard, then on success
  `onChanged()`, `onClose()` and "Booking restored". On a throw it shows "Restore failed" with `err.message`.
- `bookings.tsx` passes `onChanged={showDeleted ? loadDeleted : refetch}` (L1743). So a restore reloads only the
  Deleted list.
- The active list (`useBookings`) re-syncs only on mount, on pull-to-refresh (`refetch`), or on focus after
  `markBookingsStale()` (L691–693). Leaving "View Deleted" triggers no sync.
- `refetch()` is `sync({ force: true })` → `syncBookingList` → `loadBookingList`. That is an **incremental**
  `updated_since` change-feed merge while the last full download is under 30 minutes old, otherwise a full download
  (`src/lib/bookings/bookingListCache.ts` L159–229).
- Backend: `restore()` updates `deleted_at`, and Eloquent touches `updated_at`. `bookingIdsChangedSince` selects
  `updated_at >= since` (`BookingController.php` ~L168–190). So the change feed **does** return a restored booking,
  but only once something syncs.
- Restore has two existing re-send paths in `apiRequest` (the change-reason prompt and the blocked-period prompt).
  Both act on rejections made before any change (BR-BOOKING-004, KL-BOOK-004), and they are preserved.

**Decision (FR-013)**: when the sheet reports a confirmed restore in the Deleted view, run **both** `loadDeleted()`
and `refetch()`. That is the smallest step that makes the restored booking appear in the active list, using the
existing incremental sync. `markBookingsStale()` is not used, because it hard-clears the cache and forces a full
download.

**Decision (classification, D-2 approved 2026-11-28; spec FR-010 to FR-015 as amended)**: restore uses a small pure
classifier (contract in [contracts/restore-response.md](contracts/restore-response.md)):
- `success: true` on a 2xx with a non-empty trimmed `space_warning` → restored with warning;
- `success: true` on a 2xx otherwise → restored;
- a confirmed rejection only for the four body shapes that pre-change code alone produces: 403 `success: false`,
  422 `success: false`, 422 `errors.change_reason`, and 409 `code: "BLOCKED_PERIOD"`. These were re-derived from
  the Backend paths in the final review (R-15). Status plus JSON is not sufficient;
- everything else → **unknown**. That covers no answer, 502/504, **any 404**, a generic 500 (which can follow a
  committed restore, because `ActivityLog::log` after the transaction is unguarded), a 2xx without `success: true`,
  other 403/409/422 shapes, and unlisted statuses or non-JSON bodies.

Confirmed and unknown outcomes refresh the Deleted list and sync the active list. A rejection refreshes nothing.
There is no retry. A refresh failure never alters the feedback.

## R-11. Participant pricing

**Finding**: no change is authorized. The zero-surcharge behaviour is covered by
`src/lib/bookings/bookingSummaryLines.test.ts` (including `pricePerAdditional: 0` → `null`) and
`src/lib/packages/packagePricing.test.ts`.

**Decision**: no source change. Both suites run unmodified as regression evidence (VR-010).

## R-12. Manual verification without live operations

**Finding**: the repository has no mock or fake-server tooling (no msw, nock, json-server or similar in
`package.json`, and no `scripts/` directory).

**Decision (D-3, approved 2026-11-28)**: a dependency-free local Node `http` stub, **outside the tracked
repository** (for example in a developer temp folder).
- It serves **only** synthetic data: a synthetic login and account, the user record, the version check, and the
  payments list, bookings list, trashed-bookings list and locations needed by these two screens. It also serves the
  refund and restore endpoints with outcome-table scenarios, including delayed or dropped answers.
- Any other path gets a synthetic JSON 404.
- It **never forwards** to the real Backend or to Authorize.Net. It uses no production credentials, customers or
  payment data.

The connection is made without editing tracked files: start Metro with `EXPO_PUBLIC_API_URL` set **in the shell
session only**. Expo's env loading does not override an already-set process variable (to be confirmed at
verification time). Use `adb reverse` so the device reaches the stub on `localhost`.

Restoring normal configuration: stop the stub, close or reset the shell, and restart Metro with `-c` so the inlined
URL is rebuilt from `.env`. The verifier confirms the base-URL log line (`[api] base URL = …`) before and after.

If the build in use blocks cleartext HTTP, or the variable cannot be set without a file change, that configuration
change is **reported and needs authorization**. It is never made silently.

The stub is planned only. It is created and run at implementation time, and its absence leaves manual Android
verification an outstanding acceptance item. Automated tests do not depend on it.

## R-13. How can request-level behaviour be tested with the existing infrastructure?

**Finding**: `npm test` runs `node --test --no-warnings "src/**/*.test.ts"`, with no module-mocking flag. No existing
test loads a service or `src/lib/api.ts` at runtime. Tests that touch services use `import type` only, because
`api.ts` imports the session module (native SecureStore), which cannot be loaded under Node. There is no mocking
dependency, and no test reads source files.

**Decision**: use **dependency injection** in pure modules. This needs no new tooling, flag or dependency.
- `src/lib/payments/refundFlow.ts` holds:
  - `executeRefund(request, …)`, which takes the request function (the service passes `apiRequest`), issues the
    single refund request with `REFUND_TIMEOUT_MS`, and classifies the result;
  - `runRefundFlow(deps)`, which orchestrates the outcome, notification, reload and warning through injected
    callbacks.

  Tests count requests, check the path, method, body and `timeoutMs`, order the calls, and make reloads reject
  (VR-005 to VR-008).
- `src/lib/bookings/restoreFlow.ts` does the same for restore.
- **Void and manual refund are not extracted** (final review correction, 2026-11-28; this supersedes an earlier
  descriptor-module proposal). Their unchanged 15 s default is evidenced by **static source inspection** (the diff
  leaves `voidPayment`, `manualRefundPayment` and `src/lib/api.ts` untouched) and by **actual API request-path
  verification** against the D-3 stub (synthetic 20 s delays time out at about 15 s).

**Limitation (stated honestly)**: `apiRequest` itself cannot be executed under Node. So injected-request tests prove
what the flow *passes*, not what `apiRequest` *does*. The evidence that its re-send paths cannot fire for a refund
is:
- the predicate test (R-3), a classifier-level check;
- static inspection that `api.ts` is unchanged;
- the D-3 stub's request log, which is request-path verification and **outstanding** until performed.

**Alternatives rejected**:
- `node --test --experimental-test-module-mocks`: changes the shared test script, and the flag is experimental.
- A mocking library: a new dependency.
- Source-text assertions: an unfamiliar pattern, and brittle.

## R-14. Rapid repeated confirmations

**Finding**: the sheets hide their actions while busy, but the busy state is set only after the confirmation
`Alert`'s button runs. Two very quick taps on the sheet entry can open two confirmations. Confirming both would
start a second request while the first is in flight. Today's `runAction` and `runRestore` share this gap.

**Decision**: `runRefundFlow` and `runRestoreFlow` take an injected single-flight guard keyed by payment id or booking
id. A second start for the same key while one is in flight returns immediately, without any request (FR-014,
VR-007, SC-012). The guard is a tiny, domain-neutral pure helper (`createSingleFlight`, in `src/lib/singleFlight.ts`),
used by both flows. It is held per screen or sheet instance in a ref. The same gap in Void, Manual refund and Delete
(`runAction`) is out of scope and recorded as a follow-up.

**Lock semantics (final, FR-023)**:
- `run(key, owner, fn)` checks and records the lock **synchronously**, before `fn` is called or anything is awaited,
  so two confirmations in the same tick produce one request.
- `owner` is an opaque session identity supplied by the screen: the current session token, held in memory only and
  never logged or persisted, which is the same identity `isStaleSessionReply` uses.
- A held key blocks only the **same** owner. An attempt from a different (newer) session proceeds. Each acquisition
  gets a ticket, and `finally` releases the key only if its ticket is still the holder, so a late settlement from an
  old session never releases a newer session's lock.
- The key is released in `finally` on success, failure, a thrown error, and a reload that rejects (the flow swallows
  that rejection before `finally`).

**Why**: session teardown (`AuthGuard`: `router.dismissAll()` then `replace("/")`) unmounts pushed screens, but
`/switch-account` only replaces itself (`src/app/switch-account.tsx`), so a Payments screen lower in the stack may
survive an account switch. A request that never settles (a 401, or a reply to a token the app has left, both of
which `apiRequest` turns into a never-settling promise) would otherwise hold a key indefinitely.

**Stale feedback**: `apiRequest` suppresses stale **401** replies only. A **2xx or other** reply for an old session's
request is still delivered. So the flows take `isSessionCurrent()`, evaluated after the answer arrives
(`!isStaleSessionReply(startToken, getToken())`). If it is false, there is no notify, no warning and no refresh.
The warning key uses the user id captured **when the attempt started**.

**Scope**: the guard is used only by `runRefundFlow` and `runRestoreFlow`. It is client-side duplicate-submission
protection and **not** server-side concurrency protection (O-3 unchanged). There is no new session policy and no
change to `session.ts`, `api.ts` or `AuthGuard`.

## R-15. Restore rejection allowlist: Backend path analysis (final review, 2026-11-28)

**Question**: which restore errors prove that no restore-related state changed?

**Finding** (`zapzone-backend@2bbd0fa`; full table in [contracts/restore-response.md](contracts/restore-response.md)):

- **Execution order**:
  1. `auth:sanctum`, then the `staff` middleware (`EnsureStaff`: three `403 { success: false, message }` variants);
  2. the gift-card-reversed check (`422 { success: false }`);
  3. `onlyTrashed()->whereIn(location)->findOrFail` (404, Laravel default rendering);
  4. `resolveChangeReason` (`ValidationException` → `422 { message, errors.change_reason }`);
  5. for non-cancelled bookings, the slot capacity guard (`422 { success: false }`) and
     `AvailabilityBlockGuard::refusal`. That returns `409 { success: false, code: "BLOCKED_PERIOD", … }` for staff,
     or **`422 { success: false, message }`** when the caller is not staff for every block;
  6. only then `DB::transaction(restore + retakeSpaceAfterRestore)`;
  7. after the commit: `recordBookedInside`, `load`, `followUpAfterRestore` (try/catch), Google Calendar (try/catch),
     and `ActivityLog::log` (unguarded).
- **No post-commit 4xx**: searches for `abort(`, `authorize(`, `*OrFail(`, `->validate(` and `throw` in `restore()`,
  `retakeSpaceAfterRestore` and the follow-up found only the pre-change `findOrFail`. The Booking model registers no
  restore hooks. Exception rendering is Laravel's default except for 401 (`bootstrap/app.php`), and default-rendered
  errors carry **no** `success` key. A post-commit failure is therefore a 500.
- **Status alone is insufficient**, as the developer instructed. A 403, 404, 409 or 422 could in principle be
  rendered from an exception. Only the specific body shapes above are produced exclusively by pre-change code.

**Decision**: confirmed rejection = `403 success:false` | `422 success:false` | `422 errors.change_reason` |
`409 code:"BLOCKED_PERIOD"`. **Any 404 is unknown**: it is pre-change for this request, but it usually means an
earlier attempt already restored the booking, so "Restore failed" would mislead. Everything else is unknown.

**Shared client interaction** (`src/lib/api.ts`, `src/lib/changeReasonPrompt.ts`, `src/lib/blockedPeriodPrompt.ts`;
unchanged):
- A 422 `errors.change_reason` triggers the reason prompt and one user-initiated resend.
- A 409 `BLOCKED_PERIOD` triggers the confirmation and a resend with acknowledged ids. **If the same block ids were
  acknowledged for the same target in the last 5 minutes (`REMEMBER_FOR_MS`, memory only), it resends without
  prompting.**

Both resends follow a pre-change refusal, so they cannot cause a second restore mutation.

**Resolution (I1, Option A, developer 2026-11-28; spec FR-015)**: these are **authorized continuations**, preserved
unchanged. The feature itself never sends a restore request after classifying an outcome.

**Scoping verification**:
- **Client** (`src/lib/blockedPeriodPrompt.ts`, `src/lib/api.ts` ~L333–363):
  - the remembered key is `targetKey(getCurrentUser()?.id, method, path, picked target fields)`. For restore the
    path is `/api/bookings/{id}/restore`, so the key is per account and per booking;
  - a silent continuation happens only if **every** block id in the new refusal is among the remembered ids;
  - entries expire after 5 minutes (`REMEMBER_FOR_MS`) and live in memory only.
- **Server** (`AvailabilityBlockGuard::refusal`/`acknowledged`):
  - a continuation is accepted only with `acknowledge_blocked_period` and **every** block id
    (`acknowledged_block_ids`);
  - staff permission is re-checked at each block's location (`isStaffForAll`), and a non-staff caller gets a 422
    regardless;
  - `resolveChangeReason` runs earlier in `restore()`, so the change reason is enforced on every continuation.
- **Cross-account reuse**: not possible, because the key embeds the user id.

**Observation (not a weakness)**: `forgetAcknowledgements()` is never called by app code. Its comment mentions
sign-out, but it is not wired up. Because the key embeds the actor id, this allows reuse only by the **same** account
within 5 minutes (for example, after re-signing in), and the server re-authorizes every continuation. Recorded as
follow-up **F-7**. Not fixed, since it is shared infrastructure.

**What is never a continuation**: anything after a timeout, a lost connection, a generic 500, a 404, a malformed
response or an unknown outcome. The shared client's re-send triggers are only a 422 with `errors.change_reason` or a
409 with `code: "BLOCKED_PERIOD"`.

**Refund**: unaffected. The refund endpoint never emits either trigger shape (R-3).
