# Contract: Booking Restore Response Classification

**Endpoint consumed (unchanged)**: `POST /api/bookings/{id}/restore`. Middleware `auth:sanctum` + `staff`. Scoped
by `staffLocationIds`.
**Source of truth**: `zapzone-backend@2bbd0fa`:
- `app/Http/Controllers/Api/BookingController.php` (`restore` ~L5258–5337, `retakeSpaceAfterRestore` ~L3322–3375,
  `followUpAfterRestore` ~L3408);
- `app/Http/Middleware/EnsureStaff.php`;
- `app/Services/AvailabilityBlockGuard.php` (`refusal` ~L374–404);
- `app/Http/Traits/CapturesChangeReason.php` (`resolveChangeReason`);
- `bootstrap/app.php` (exception rendering).

It is test-backed by `tests/Feature/AreaSimultaneousStartsTest.php`. The path analysis is in
[research.md](../research.md) R-15.
**Request (unchanged)**: no body, default 15 s wait.
**Spec**: FR-010 to FR-015 (D-2, plus the final review correction of 2026-11-28).

## Backend execution order and response shapes

| # | Step | Possible response | Before any state change? |
|---|---|---|---|
| 1 | `auth:sanctum` | 401 (custom JSON) → handled by `apiRequest`; never reaches the classifier | Yes |
| 2 | `staff` middleware | **403 `{ success: false, message }`** (3 variants) | Yes, before the controller |
| 3 | `giftCardWasReversedFor` | **422 `{ success: false, message }`** | Yes |
| 4 | `onlyTrashed()->whereIn(location)->findOrFail` | 404 Laravel JSON `{ message }` | Yes, for **this** request. But it also occurs when an earlier attempt **already restored** the booking |
| 5 | `resolveChangeReason` | **422 `{ message, errors: { change_reason } }`** | Yes |
| 6 | `SlotCapacityGuard::assertBookingFits` (non-cancelled) | **422 `{ success: false, message }`** | Yes |
| 7 | `AvailabilityBlockGuard::refusal` (non-cancelled) | **409 `{ success: false, code: "BLOCKED_PERIOD", requires_acknowledgement, message, blocked_periods }`** (staff), or **422 `{ success: false, message }`** (not staff for every block) | Yes |
| 8 | `DB::transaction(restore + retakeSpaceAfterRestore)` | An exception rolls back, then a Laravel-rendered 500 | Rolled back, but classified unknown (conservative) |
| 9 | Post-commit: `recordBookedInside`, `load`, `followUpAfterRestore` (try/catch), Google Calendar (try/catch), `ActivityLog::log` (**unguarded**) | An exception → Laravel-rendered **500** (a restore **already committed**) | **No** |
| 10 | Success | 200 `{ success: true, message, space_warning, data }` | After the commit |

No step after the commit produces a 403, 404, 409 or 422. The searches covered `abort(`, `authorize(`, `*OrFail(`,
`validate(` and `throw`, and found nothing in the restore body or the post-commit helpers. Exception rendering is
Laravel's default apart from 401 (`bootstrap/app.php`). Laravel-rendered errors **never** carry `success`.

## Shared client behaviour before classification (`src/lib/api.ts`, unchanged)

- **422 with `errors.change_reason`** (step 5): `apiRequest` asks staff for a reason. If staff give one, it re-sends
  **once** with `change_reason`, and the reply of that resend is what the caller receives. If staff cancel, it
  throws `ApiError(serverMessage, 422, errors, serverBody)`.
- **409 `BLOCKED_PERIOD`** (step 7): `apiRequest` asks staff to confirm (`confirmBlockedPeriod`) and re-sends with the
  acknowledged block ids. **Exception**: if staff acknowledged the same block ids for the same target in the last 5
  minutes (`rememberedBlockIds`, memory only, `REMEMBER_FOR_MS`), it re-sends **without prompting**. If staff
  decline, it throws `ApiError(BLOCKED_PERIOD_DECLINED, 409, …, serverBody)`.
- Both re-sends follow a refusal that the Backend made **before any change** (steps 5 and 7), so at most one restore
  mutation can result.

## Authorized continuation vs unsafe retry (FR-015, I1 Option A, 2026-11-28)

| | Authorized continuation (preserved) | Unsafe retry (forbidden) |
|---|---|---|
| Trigger | A source-confirmed **pre-change** refusal: 422 `errors.change_reason` or 409 `code: "BLOCKED_PERIOD"` | Any classified outcome: restored, with warning, rejected or unknown, including a timeout, lost connection, 500, 404 or malformed 2xx |
| Sender | The shared `apiRequest`, existing code, unchanged | — (the feature never sends one; no new mechanism) |
| Consent | Staff enter a reason or confirm the blocked period, **or** they confirmed the **same block ids** for the **same booking** under the **same account** within 5 minutes (memory only) | — |
| Server re-validation | `resolveChangeReason`; `AvailabilityBlockGuard::acknowledged`, which requires `acknowledge_blocked_period` plus every block id and re-checks staff permission per block location (`isStaffForAll`) | — |
| Requests | 2 in total (the refusal plus one continuation). A further unacknowledged refusal prompts again | — |

Scoping was verified (research R-15): the key is the user id, method, path (booking) and target fields, and every
block id must already be remembered. **No cross-account reuse.** `forgetAcknowledgements` is not wired to sign-out
(F-7), so only same-account reuse within 5 minutes is possible, and the server re-authorizes it.

## Classifier input

`{ kind: "ok", body }`; `{ kind: "error", status, body, message }` (from an `ApiError` with `status > 0`; `message` is
`ApiError.message`); `{ kind: "no_answer" }` (status 0 or any other thrown value).

## Rules (in order; the first match wins)

"Object body" means a non-null, non-array JSON object.

| # | Condition | Outcome | Backend source |
|---|---|---|---|
| R4a | `no_answer` | `unknown` | — |
| R1 | `ok`, object body, `success === true`, and `space_warning` a string non-empty after trimming | `restored_with_warning` (the trimmed text) | Step 10 |
| R2 | `ok`, object body, `success === true`, and `space_warning` null, absent, non-string, empty or whitespace | `restored` | Step 10 |
| R4b | `ok` with any other body | `unknown` | — |
| R3a | `error`, status 403, object body with `success === false` | `rejected` | Step 2 |
| R3b | `error`, status 422, object body with `success === false` | `rejected` | Steps 3, 6, 7 (non-staff) |
| R3c | `error`, status 422, object body whose `errors.change_reason` is present | `rejected` | Step 5 (after staff cancelled the prompt, or the retried reason was rejected) |
| R3d | `error`, status 409, object body with `code === "BLOCKED_PERIOD"` | `rejected` | Step 7 (after staff declined, or a further unacknowledged refusal) |
| R4c | `error` with anything else: **any 404**, 403/409/422 with other shapes, 500, 502, 504, unlisted statuses, non-object bodies | `unknown` | Steps 4, 8, 9, proxies |

- **Why 404 is unknown**: it is pre-change for this request, but its usual cause is an earlier attempt that already
  restored the booking (for example, a retry after an unknown outcome). "Restore failed" would mislead. Unknown,
  plus the refresh, shows the true state.
- **Rejected message**: `ApiError.message`, today's text. For server-written errors this equals `body.message`, and
  for a declined blocked-period confirmation it is `BLOCKED_PERIOD_DECLINED`. Fallback: "The booking was not
  restored."
- No rule reads message text to decide an outcome.

## Feedback and refresh

| Outcome | Alert title | Alert message | Refresh |
|---|---|---|---|
| R2 | Booking restored | `<ref> was restored.` (today's text) | Reload the Deleted list **and** sync the active list |
| R1 | Booking restored — time clash | The server's `space_warning`, in full | Same as R2 |
| R3 | Restore failed | The rejection message (today) | None (today) |
| R4 | Restore result unknown | `The booking restoration could not be confirmed. Please check the booking status before attempting to restore it again.` | Same as R2 |

- The **order** is: close the sheet, show the alert, then refresh. The refreshes are existing read-only mechanisms:
  `loadDeleted()` and `useBookings().refetch()`, an incremental `updated_since` sync. A refresh that fails or
  rejects never alters or repeats the alert. An unchanged record after the refresh is not re-interpreted.
- **Single flight (FR-023)**: the lock is synchronous and session-owned. A second start for the same booking by
  the same session while one is in flight sends no request. A newer session is never blocked. The lock is released
  when the attempt settles.
- **Session check (FR-023)**: if the session that started the restore is no longer current when the answer arrives,
  there is no close, no alert and no refresh.
- No automatic retry by the feature, no bulk restore, no new scheduling, conflict or eligibility rule, and no
  automatic move. The confirmation dialog, the `busy` guard and both shared-client prompts are unchanged.
