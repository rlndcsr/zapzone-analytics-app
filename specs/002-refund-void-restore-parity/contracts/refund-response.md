# Contract: Refund Response Classification

**Endpoint consumed (unchanged)**: `PATCH /api/payments/{payment}/refund`. Middleware `staff`. Location-scoped by
`PaymentController::denyForeignPayment`.
**Source of truth**: `zapzone-backend@2bbd0fa:app/Http/Controllers/Api/PaymentController.php` (`refund`) and the
vendored Authorize.Net SDK (see [research.md](../research.md) R-5).
**Request (unchanged)**: body `{}` (a full refund; `cancel` defaults server-side). Wait: 60 s (`REFUND_TIMEOUT_MS`).

Mobile invents no fields. A Backend change to any shape below requires this contract and its tests to be
re-verified before release.

## Classifier input

The service turns the request into exactly one of these:

| Input | Produced when |
|---|---|
| `{ kind: "ok", body }` | `apiRequest` resolved (HTTP 2xx). `body` is the parsed JSON, or `null` if it was not JSON |
| `{ kind: "error", status, body }` | `ApiError` with `status > 0`. `body` is the parsed error JSON, or `null` |
| `{ kind: "no_answer" }` | `ApiError` with `status === 0` (timeout or transport), or **any other thrown value** (conservative) |
| *(never produced)* | 401 or an invalidated session: `apiRequest` never settles (existing; row A1) |

A pure helper builds the input from a thrown value by duck typing (a numeric `status` property), so it is
unit-testable without importing `api.ts`.

## Rules (evaluated in order; the first match wins)

"Object body" means a non-null, non-array JSON object. "Has key K" means `K in body`.

| # | Condition | Outcome |
|---|---|---|
| U1 | `kind === "no_answer"` | `unknown` |
| S* | `kind === "ok"`, object body, `body.success === true`, and `was_void_fallback` absent | **S3** `refunded` |
| S* | `kind === "ok"`, object body, `body.success === true`, and `body.was_void_fallback === true` | **S1** `voided` (`cancelled: true`) when `body.payable_cancelled === true`; otherwise **S2** `voided` (`cancelled: false`) |
| U6 | `kind === "ok"` and any other body: null, non-object, `success !== true`, or `was_void_fallback` present but not `true` | `unknown` |
| U2 | `kind === "error"` and status 502 or 504 | `unknown` |
| F4 / U2 | status 503: object body with `success === false` → **F4** `failed`; otherwise **U2** `unknown` | |
| F5 / U3 | status 500: object body with `error_code === "DECRYPTION_FAILED"` → **F5** `failed`; otherwise **U3** `unknown` | |
| U5 | status 400, object body, has key `is_unsettled`, and `is_unsettled === true` | `unknown` |
| U4 | status 400, object body, has key `is_unsettled`, `is_unsettled === false`, and `error_code` null or absent | `unknown` |
| F2 | status 400, object body, has key `is_unsettled`, `is_unsettled === false`, and `error_code` a non-empty string | `failed` |
| U6 | status 400, object body, has key `is_unsettled` with a non-boolean value | `unknown` |
| F1 | status 400, object body with `success === false`, and no `is_unsettled` key | `failed` |
| F3 | status 403 with `success === false`; **or** status 404, object body with a string `message` and no `success` key; **or** status 422 with `success === false` or an object `errors` | `failed` (all pre-gateway; see "F3 reasoning" in spec.md) |
| U6 | status 403/404/422 with any other shape | `unknown` |
| U6 | anything else (other statuses, 401 if it ever arrived, a non-object body on a 400/403/404/422) | `unknown` |

Every contradictory or malformed combination falls through to `unknown`. **No row infers anything from `message`
text.** For `failed`, `message` is displayed only.

## Extracted values

**Valid amount (FR-022)**: a finite JSON number greater than 0, **or** a string matching `^\d+(\.\d+)?$` whose
numeric value is greater than 0 (the Backend's `decimal:2` serialization, for example `"50.00"`). Empty strings,
whitespace, signs, exponents, `"NaN"`, `Infinity`, zero and negative values are invalid. Amount validity never
changes the outcome.

| Value | Rule (FR-022, corrected 2026-11-28) |
|---|---|
| Voided amount | `void_amount` valid → use it. Absent, `null` or invalid → **no amount**. The row or payment amount is **never** substituted (a deliberate divergence from the Web Admin's fallback) |
| Refunded amount | `refund_amount` valid → use it. Absent, `null` or invalid → **no amount**. No substitution |
| Refund record no. | `body.data.refund_payment.id`, if a positive integer; otherwise omitted |
| Cancelled label | The row's `payableType === "booking"` → "booking"; otherwise "purchase" (Web Admin parity) |
| Failure text | `body.message`, if a non-empty string; otherwise "The refund was not processed." |

## Feedback

| Outcome | Title | Message |
|---|---|---|
| S3 (valid amount) | Refund processed | `Refund of $X processed successfully.` + ` Refund Payment #N` when N is known |
| S3 (no valid amount) | Refund processed | `Payment refunded successfully.` + ` Refund Payment #N` when N is known |
| S1 (valid amount) | Payment voided | `This payment had not settled yet, so it was voided instead of refunded. The full $X goes back to the card and the <booking\|purchase> was cancelled.` |
| S1 (no valid amount) | Payment voided | `Payment voided instead of refunded, and the associated <booking\|purchase> was cancelled.` |
| S2 (valid amount) | Payment voided | `This payment had not settled yet, so it was voided instead of refunded. The full $X goes back to the card.` |
| S2 (no valid amount) | Payment voided | `Payment voided instead of refunded.` |
| F1–F5 | Refund failed | The failure text |
| U1–U6 | Refund result unknown | `The refund result could not be confirmed. The transaction may still have been processed. Please verify the payment status before attempting another refund.` |

Constraints, all asserted by tests:
- S3 never contains "void".
- S1 and S2 never contain "refunded successfully", and never promise timing ("days", "within", "business").
- The unknown wording never contains "failed", "refunded successfully" or "voided".

## Screen behaviour per outcome

| Outcome | Sheet | Alert | Reload `load()` | Retry warning (FR-021) | Further requests |
|---|---|---|---|---|---|
| S1–S3 | Close | Yes, shown before the reload | Yes | Cleared for this account and payment | None |
| F1–F5 | Stays open (today) | Yes | No (today) | Unchanged | None |
| U1–U6 | Close | Yes, shown before the reload | Yes | Recorded for this account and payment | None |

- **Single flight (FR-023)**: the lock is acquired **synchronously** and owned by the session that started the
  attempt. A second start for the same payment by the same session while one is in flight returns immediately,
  with no request, no alert and no state change. A start from a newer session is never blocked by an older
  session's unresolved attempt. The lock is released when the attempt settles, by success, failure, a throw or a
  failed reload, and a late settlement never releases a newer session's lock.
- **Session check (FR-023)**: when the answer arrives, if the session that started the attempt is no longer current
  (`isStaleSessionReply(startToken, getToken())`), there is no close, no alert, no warning and no reload. The
  warning key uses the user id captured at the start.
- **Refresh failure**: `load()` never throws today. The flow also tolerates a rejecting reload. Either way, the
  alert is not repeated or altered, and the warning state is not changed by the reload.
- **Authentication**: a 401 or an invalidated session is handled entirely by `apiRequest` (it never settles, then
  the global sign-out). Neither the classifier nor the flow intercepts it.

## Advisory retry warning (FR-021)

| Item | Rule |
|---|---|
| Key | `"<userId>:<paymentId>"`, with `userId` read from the session's current user when recording **and** when building the confirmation. With no user id, nothing is recorded and no warning is shown |
| Storage | Component state (memory) only. No SecureStore, no files |
| Added | On any U1–U6 outcome |
| Kept | Through reloads (whatever they show), F1–F5 outcomes and further U outcomes |
| Cleared | For that key, by a later S1–S3 outcome. Everything is discarded when the Payments screen unmounts or the app process ends |
| Effect | The Refund confirmation (same title, text and buttons as today) appends: "The outcome of a previous refund attempt could not be confirmed. Verify the transaction before proceeding with another refund." It never blocks, never changes eligibility, and never retries |
| Limits | It reduces accidental staff retries only. It does not resolve or reduce O-3 |
