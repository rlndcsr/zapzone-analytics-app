---
description: "Task list for 002 — Refund-to-Void Feedback and Restore Clash Warnings"
---

# Tasks: Refund-to-Void Feedback and Restore Clash Warnings

**Input**: Design documents from `specs/002-refund-void-restore-parity/`: [spec.md](spec.md) (approved, amended, final
review corrections 2026-11-28), [plan.md](plan.md) (approved; five-module inventory), [research.md](research.md)
(R-1 to R-15), [contracts/refund-response.md](contracts/refund-response.md),
[contracts/restore-response.md](contracts/restore-response.md), [quickstart.md](quickstart.md).
**Not present**: `data-model.md`, which is not applicable (plan.md).

**Tests**: **required**. Spec VR-001 to VR-011 and constitution Principle VII ask for them. Test tasks come first
and must **fail** before implementation. Every verification task names its **category**:
- **[C1]** classifier test;
- **[C2]** injected-request or flow test;
- **[C3]** static source inspection;
- **[C4]** actual API request-path verification (D-3 stub log);
- **[C5]** manual Android verification.

One category never stands in for another.

**Organization**: US1 = Story 1 (refund outcome, P1, MVP); US2 = Story 2 (restore outcome, P2). Participant pricing
(FR-016) has **no implementation tasks**, only regression checks.

**Safety rules for every task**:
- No real or sandbox refund, void, charge, cancellation or production booking change.
- No live API calls. No credential access.
- No Git action (branch, stage, commit, push, reset, stash) without explicit developer authorization.
- No build or publish.
- No change to `src/lib/api.ts`, `voidPayment`, `manualRefundPayment`, `runAction`, dependencies, native or app
  configuration, Web Admin, Backend, the constitution, Spec Kit infrastructure or feature 001.
- The D-3 fake server lives **outside** the tracked repository.
- F-5, F-6, O-3 and O-7 are **not** fixed here.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (a different file, and no dependency on an incomplete task)
- **[Story]**: US1 or US2. Setup, Foundational and Polish tasks carry no story label.

---

## Phase 1: Setup (preflight, no source changes)

- [x] T001 Preflight the repository (`.specify/feature.json`, `tailwind.config.js`, `babel.config.js`,
  `metro.config.js`, `eslint.config.js`):
  - record `git status`, the branch and staged changes, and preserve unrelated work;
  - confirm `.specify/feature.json` points to `specs/002-refund-void-restore-parity`;
  - confirm the root configs are unchanged and free of injected loaders. Stop and report if not (constitution III);
  - record baseline results of `npm test`, `npx tsc --noEmit` and `npm run lint`.
- [x] T002 Re-verify the Backend contracts read-only, comparing current `HEAD` with `zapzone-backend@2bbd0fa`.
  Check `app/Http/Controllers/Api/PaymentController.php` (`refund`), `app/Http/Controllers/Api/BookingController.php`
  (`restore`, `retakeSpaceAfterRestore`, `followUpAfterRestore`), `app/Http/Middleware/EnsureStaff.php`,
  `app/Services/AvailabilityBlockGuard.php` (`refusal`), `app/Http/Traits/CapturesChangeReason.php` and
  `bootstrap/app.php`. If any shape or execution order relied on by
  `specs/002-refund-void-restore-parity/contracts/refund-response.md` or
  `specs/002-refund-void-restore-parity/contracts/restore-response.md` changed (including any new post-commit 4xx
  source), stop and report.
- [x] T003 [P] Confirm the caller sets by search:
  - `refundPayment` is called only from `src/app/payments/payments.tsx`;
  - `restoreBooking` is called only from `src/components/ui/BookingActionsSheet.tsx`.

  Record any other caller and stop if one exists (the signatures change in T014 and T021).

---

## Phase 2: Foundational (blocking prerequisites)

- [x] T004 [C2] Write the failing tests in `src/lib/singleFlight.test.ts` (FR-023, VR-007):
  - **Synchronous acquire**: two `run(key, ownerA, fn)` calls in the same tick → `fn` called once, and the second
    returns `null`;
  - different keys run concurrently;
  - the key is released after `fn` resolves **and** after it rejects, with the rejection propagated, and the same
    owner can then run again;
  - **Owner takeover**: while `ownerA` holds the key with a never-settling `fn`, `run(key, ownerB, fn2)` calls
    `fn2`. After `fn2` settles, the key is free;
  - **Ticket**: if `ownerA`'s `fn` settles **after** `ownerB` took over, `ownerB`'s hold is not released early (a
    third `ownerB` run is still blocked while `fn2` is pending);
  - `isRunning(key, owner)` reflects the state.
- [x] T005 Implement `createSingleFlight()` in `src/lib/singleFlight.ts` (pure, no imports) per plan.md Design §1
  until T004 passes.

**Checkpoint**: foundation ready. US1 and US2 can proceed independently.

---

## Phase 3: User Story 1 — Staff are told what a refund actually did (Priority: P1) 🎯 MVP

**Goal**:
- Refund outcomes are classified from the server's answer (or its absence): refunded, voided with or without
  cancellation, confirmed failure, or unknown.
- Only valid server amounts are shown.
- The single refund request waits 60 s.
- The list refreshes without retries.
- An advisory warning follows an unknown outcome.

**Independent Test**: [C1] and [C2] suites in quickstart §1; [C3] items 1–5 in quickstart §2; [C4] and [C5] matrix
M1–M10 and M16–M18.

### Tests for User Story 1 (write first; they must fail)

- [x] T006 [P] [US1] [C1] Write the failing classification tests in `src/lib/payments/refundOutcome.test.ts`
  (VR-001, VR-004). Use fixtures shaped exactly as `zapzone-backend@2bbd0fa` (contracts/refund-response.md "Rules"),
  one test per row:
  - **S rows**: S3 (`success: true`, with and without `data.refund_payment.id`); S1 (`was_void_fallback: true`,
    `payable_cancelled: true`); S2 (`payable_cancelled` false, absent and `"yes"`).
  - **F rows**: F1 (400 `success: false`, no `is_unsettled` key; also with `MISSING_CARD_LAST_FOUR`); F2 (400
    `is_unsettled: false`, `error_code: "E00040"`); **F3 recognized shapes only**: 403 `{success:false,message}`;
    404 `{message:"No query results…"}` (no `success` key); 422 `{success:false,message}`; 422
    `{message, errors:{amount:[…]}}`; F4 (503 `success: false`); F5 (500 `DECRYPTION_FAILED`).
  - **F3 negatives → U6**: 403 `{message}` without `success`; 404 `{success:false}`; 404 with a non-string
    `message`; 422 `{message}` with neither `success:false` nor `errors`.
  - **U rows**: U1 (`no_answer`); U2 (502, 504, 503 with a null body); U3 (500 generic); U4 (400 `is_unsettled:
    false`, `error_code` null or absent); U5 (400 `is_unsettled: true`); U6 (a 2xx with null body, an array,
    `success: false`, `success: "true"`, `was_void_fallback: false`, `was_void_fallback: "true"`; 400 with a
    non-boolean `is_unsettled`; 400/403/404/422 with a null body; 401; 418).
  - **`refundAttemptFromError`**: `{status:0}` → `no_answer`; `{status:400, body}` → `error`; `new Error()` and
    `undefined` → `no_answer`.
- [x] T007 [US1] [C1] Add the failing amount and notice tests to `src/lib/payments/refundOutcome.test.ts` (VR-001,
  VR-002, FR-002 to FR-004, FR-022, corrected).
  - **`parseAmount`**: `"50.00"` → 50; `50` → 50; `"0"`, `0`, `""`, `" 5"`, `"abc"`, `"-1"`, `"1e3"`, `Infinity`,
    `NaN`, `null`, `undefined` → `null`.
  - **No substitution**: S1, S2 and S3 with `void_amount`/`refund_amount` absent, `null` or invalid → outcome still
    confirmed with `amount: null`. The classifier signature takes **no** row or payment amount.
  - **`refundOutcomeNotice`**:
    - S3 "Refund processed" / "Refund of $50.00 processed successfully. Refund Payment #9"; neutral variant
      "Payment refunded successfully." (+ " Refund Payment #9" when known);
    - S1/S2 "Payment voided": with an amount, the exact Web Admin sentences, with the clause "and the booking was
      cancelled" only when `cancelled` and "purchase" for other payable types or `null`. Neutral variants exactly
      "Payment voided instead of refunded." and "Payment voided instead of refunded, and the associated booking was
      cancelled." (or "purchase");
    - F "Refund failed" with the server message, or "The refund was not processed.";
    - U "Refund result unknown" with exactly the approved sentence.
  - **Negative assertions**:
    - S3 contains no "void". S1/S2 contain no "refunded successfully" and none of "days"/"within"/"business".
    - U contains no "failed", "voided" or "refunded successfully".
    - No notice contains "$" or "full payment amount" when `amount` is `null`.
- [x] T008 [US1] [C1] Add the failing re-send-safety test to `src/lib/payments/refundOutcome.test.ts` (VR-006, research
  R-3): for every T006 fixture that has a status, `requiresChangeReason(status, body) === false`
  (`src/lib/changeReasonPrompt.ts`) and `blockedPeriodWarning(status, body) === null`
  (`src/lib/blockedPeriodPrompt.ts`).
- [x] T009 [P] [US1] [C2] Write the failing request-level tests for `executeRefund` in
  `src/lib/payments/refundFlow.test.ts` (VR-003, VR-006, VR-008), with an injected fake `RequestFn` that records calls:
  - exactly one call: path `/api/payments/9/refund`, method `PATCH`, body `{}`, the token passed through,
    `timeoutMs === REFUND_TIMEOUT_MS === 60000`;
  - resolving with S1/S3 bodies → the matching outcome;
  - rejecting with `{status:0}` → `unknown` (U1); a 500 generic body → `unknown` (U3); a 400 F2 body → `failed`;
  - one call in every case, and no void, status or other path requested;
  - a fake that never settles leaves `executeRefund` pending (401 is not intercepted).
- [x] T010 [US1] [C2] Add the failing orchestration tests for `runRefundFlow` to `src/lib/payments/refundFlow.test.ts`
  (VR-005 to VR-007, FR-018 to FR-020), with spies and a real `createSingleFlight()`:
  - **S/U outcomes**: the call order is `setBusy(true)` → `refund` → `closeSheet` → `notify` (once) →
    `applyWarning` (once) → `reload` → `setBusy(false)`;
  - **F outcomes**: `notify` once, with no `closeSheet` and no `reload`; `applyWarning` called;
  - **A rejecting `reload`**: no throw, `notify` still once with the same arguments, `applyWarning` once, busy reset;
  - **A U outcome followed by a reload "showing the payment unchanged"**: no further `notify`, `refund` or
    `applyWarning`;
  - **Single flight**: two starts with the same key and owner in the same tick → `refund` once, and the second
    returns `null` without `notify` or `setBusy`; different keys run independently; after completion, including
    after a rejecting reload, the same key can start again;
  - **Session safety (FR-023)**: with `isSessionCurrent` returning false when the answer arrives → no `closeSheet`,
    `notify`, `applyWarning` or `reload`, and busy is reset. A start by a new owner while an old owner's `refund`
    never settles → proceeds;
  - `refund` is called exactly once per started flow.
- [x] T011 [US1] [C1] Add the failing D-1 helper tests to `src/lib/payments/refundFlow.test.ts` (VR-011, FR-021):
  - `retryWarningKey(5, 9) === "5:9"`; `retryWarningKey(null, 9) === null`;
  - `nextRetryWarnings` adds the key on every U row; keeps it on F rows and repeated U; removes only that key on
    S1/S2/S3; leaves other keys alone; records nothing when `userId` is null; never mutates its input;
  - `hasRetryWarning(set, 5, 9)` is true, while `(6, 9)`, `(5, 10)` and `(null, 9)` are false;
  - `refundConfirmMessage(base, false) === base`; with `true`, it ends with the exact `REFUND_RETRY_WARNING`.

### Implementation for User Story 1

- [x] T012 [US1] Implement `src/lib/payments/refundOutcome.ts` per plan.md Design §2 and
  contracts/refund-response.md until T006 to T008 pass.
  - It imports only `money` from `./paymentDisplay.ts`.
  - `classifyRefundOutcome(attempt)` takes **no** amount context.
  - No message-text parsing and no authentication handling.
- [x] T013 [US1] Implement `src/lib/payments/refundFlow.ts` (`REFUND_TIMEOUT_MS`, `RequestFn`, `executeRefund`,
  `runRefundFlow`, and the D-1 helpers) per plan.md Design §3 until T009 to T011 pass.
  - It depends on T005 (`../singleFlight.ts`) and T012.
  - One `request` call per `executeRefund`.
  - `runRefundFlow` takes `owner` and `isSessionCurrent` (FR-023).
  - A rejecting reload is swallowed, never re-notified.
  - No storage APIs.
- [x] T014 [US1] Update **only** `refundPayment` in `src/services/paymentsService.ts` (depends on T013):
  `refundPayment(token, id)` returns `executeRefund(apiRequest, token, id)`, so the return type becomes
  `Promise<RefundOutcome>`. `voidPayment`, `manualRefundPayment`, `CHARGE_TIMEOUT_MS` and every other function stay
  byte-for-byte unchanged.
- [x] T015 [US1] Wire `src/app/payments/payments.tsx` per plan.md Design §5 (depends on T013 and T014):
  - add `retryWarnings` state and a `useRef(createSingleFlight())`;
  - replace only the `onRefund` handler with `confirmRefund` (today's title, base text and buttons, passed through
    `refundConfirmMessage`/`hasRetryWarning` with `getCurrentUser()?.id ?? null`);
  - on confirm, capture `startToken = getToken()` and `startUserId = getCurrentUser()?.id ?? null`, then call
    `runRefundFlow` with the callbacks in plan.md Design §5: `owner: startToken`, `isSessionCurrent` via
    `isStaleSessionReply` from `src/lib/staleSessionReply.ts`, `applyWarning` keyed to `startUserId`, and
    `reload: load`;
  - import `getCurrentUser` from `src/lib/session.ts`;
  - leave `runAction`, `confirmAction`, Manual refund, Void and Delete untouched.
- [x] T016 [US1] Checkpoint: run `npm test`, `npx tsc --noEmit` and `npm run lint`. `src/lib/singleFlight.test.ts`,
  `src/lib/payments/refundOutcome.test.ts` and `src/lib/payments/refundFlow.test.ts` pass, with no new type or lint
  errors versus the T001 baseline.

**Checkpoint**: US1 is complete and testable on its own (the MVP).

---

## Phase 4: User Story 2 — Restoring a booking warns when its time was taken (Priority: P2)

**Goal**:
- Restore outcomes are classified per FR-010 to FR-015, with the allowlist derived from Backend paths (R-15):
  restored, restored with a clash warning, confirmed rejection, or unknown.
- Confirmed and unknown outcomes refresh both lists.
- No retry by the feature, and a refresh failure never alters the feedback.

**Independent Test**: [C1] and [C2] suites in quickstart §1; [C3] items 1, 3 and 4; [C4] and [C5] matrix M10–M15.
This story depends only on Phase 2.

### Tests for User Story 2 (write first; they must fail)

- [x] T017 [P] [US2] [C1] Write the failing tests in `src/lib/bookings/restoreOutcome.test.ts` (VR-009,
  contracts/restore-response.md "Rules"):
  - **R1**: `success: true`, `space_warning: "  Booking restored, but … REF-1 …  "` → `restored_with_warning`
    (trimmed).
  - **R2**: `space_warning` null, absent, `""`, `"   "` or `42` → `restored`.
  - **R3a**: 403 `{success:false,message}` → rejected.
  - **R3b**: 422 `{success:false,message}` → rejected.
  - **R3c**: 422 `{message, errors:{change_reason:[…]}}` → rejected.
  - **R3d**: 409 `{success:false, code:"BLOCKED_PERIOD", …}` with the `ApiError` message `BLOCKED_PERIOD_DECLINED`
    → rejected, with that message.
  - **R4**: `no_answer`; a 2xx with null body, an array or `success:false`; **404 with a Laravel JSON body**; 403
    `{message}` without `success`; 409 without the code; 422 `{message}` without `success` or `errors.change_reason`;
    500 JSON; 502; 504; 418; 422 with a null body → `unknown`.
  - **Rejected message**: the `ApiError` message, then the fallback "The booking was not restored."
  - **`restoreAttemptFromError`**: status 0, status > 0 (carries the message), a plain `Error`, `undefined`.
  - **`restoreOutcomeNotice(o, "BK-1")`**: the four title and message pairs from the contract. The unknown text is
    exactly the approved sentence, with no "was restored." and no "failed".
- [x] T018 [P] [US2] [C2] Write the failing tests in `src/lib/bookings/restoreFlow.test.ts` (VR-007, VR-009,
  FR-012 to FR-015), with an injected fake request function and spies:
  - **`executeRestore`**: exactly one call, `POST /api/bookings/12/restore`, no body, **no** `timeoutMs`; R1, R2, R3x
    and R4 responses map correctly; one call in every case.
  - **`runRestoreFlow`**:
    - restored, with warning, or unknown → `closeSheet` → `notify` (once) → `refresh` (once);
    - rejected → `notify` only;
    - a rejecting `refresh` → no throw, `notify` once with the same arguments, busy reset;
    - single flight, same key and owner in the same tick → one `restore`, and the same key can start again after
      completion;
    - a stale session (`isSessionCurrent` false at answer time) → no `closeSheet`, `notify` or `refresh`;
    - `restore` is never called twice for one started flow. The feature itself never sends a restore request after
      classification (FR-015 unsafe retry).

### Implementation for User Story 2

- [x] T019 [P] [US2] Implement `src/lib/bookings/restoreOutcome.ts` per plan.md Design §4 and
  contracts/restore-response.md until T017 passes. Pure, no imports, no message-text parsing.
- [x] T020 [US2] Implement `src/lib/bookings/restoreFlow.ts` (`executeRestore`, `runRestoreFlow` with `owner` and
  `isSessionCurrent`, and a local `RestoreRequestFn` type) per plan.md Design §4 until T018 passes. It depends on T005
  (`../singleFlight.ts`) and T019.
- [x] T021 [US2] Update **only** `restoreBooking` in `src/services/bookingsService.ts` (depends on T020):
  `restoreBooking(token, id)` returns `executeRestore(apiRequest, token, id)`, so the return type becomes
  `Promise<RestoreOutcome>`. The change-reason and blocked-period prompts stay in `apiRequest` untouched.
- [x] T022 [US2] Wire `runRestore` in `src/components/ui/BookingActionsSheet.tsx` per plan.md Design §5 (depends on
  T021):
  - keep the confirmation `Alert`, the token check and the `busy` guard;
  - call `runRestoreFlow` with `owner: token`, `isSessionCurrent: () => !isStaleSessionReply(token, getToken())`,
    `refresh: async () => { await onChanged(); }` and a per-sheet `useRef(createSingleFlight())`;
  - **own the prop-type change** (P1): widen `onChanged` to `() => void | Promise<unknown>` in this file;
  - leave Check In and Delete untouched.
- [x] T023 [US2] Update `src/app/bookings/bookings.tsx` (FR-013, R-10), **after T022** (it relies on T022's prop
  type; it is not parallel). Change the Deleted-view `onChanged` to
  `() => Promise.allSettled([loadDeleted(), refetch()])`. Do not use `markBookingsStale()`. This task edits **only**
  `src/app/bookings/bookings.tsx`.
- [x] T024 [US2] Checkpoint: run `npm test`, `npx tsc --noEmit` and `npm run lint`.
  `src/lib/bookings/restoreOutcome.test.ts` and `src/lib/bookings/restoreFlow.test.ts` pass, with no new errors
  versus the T001 baseline.

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: Polish, documentation and cross-cutting verification

- [x] T025 [P] Update the Payments section of `docs/features/dashboard-administration-analytics-and-payments.md`:
  - refund outcomes;
  - server-only amounts (no substitution);
  - the unknown outcome and wording;
  - the advisory warning lifecycle;
  - the 60 s refund wait and the single-flight guard;
  - test references and revisions.
- [x] T026 [P] Update the Deleted view section of `docs/features/bookings-and-scheduling.md`: restore outcomes
  (clash warning, the rejection shapes, unknown including 404) and the active-list sync.
- [x] T027 [P] Update `docs/business-rules/dashboard-administration-analytics-and-payments.md`:
  - a note under BR-PAYMENT-006 (the void fallback applies to full first-time refunds and ignores `cancel`; source
    `zapzone-backend@2bbd0fa`);
  - a new `BR-PAYMENT-*` entry, at the next free number, for refund outcome classification and server-only amounts.
- [x] T028 [P] Update BR-BOOKING-004 in `docs/business-rules/bookings-and-scheduling.md`:
  - a restore may succeed with an overlap warning;
  - the pre-change rejection shapes;
  - the unknown restore outcome (including 404);
  - the distinction between an **authorized continuation** (the shared client's change-reason and blocked-period
    follow-up, scoped and re-authorized) and an **unsafe retry** (forbidden) (FR-015, R-15).
- [x] T029 [P] Add entries at the next free `KL-PAYMENT-*` numbers in `docs/KNOWN_LIMITATIONS.md`, with their
  evidence levels:
  - O-3 (suspected weakness, exploitability not confirmed);
  - O-7 (source-derived);
  - F-5 (manual refund omits `notes`; source-derived, runtime unverified);
  - F-6 (`runAction` lacks single flight).

  Add F-7 (`forgetAcknowledgements` not wired to sign-out; same-account reuse only) at the next free `KL-BOOK-*`
  number. No renumbering, and no fixes.
- [x] T030 [C1][C3] Participant-pricing regression (FR-016, SC-007):
  - `npm test` passes `src/lib/bookings/bookingSummaryLines.test.ts` and `src/lib/packages/packagePricing.test.ts`
    **unmodified**;
  - `git diff` shows no change to `src/app/bookings/create-booking.tsx`, `src/app/bookings/manual-booking.tsx`,
    `src/lib/bookings/bookingSummaryLines.ts` or `src/lib/packages/packagePricing.ts`.
- [x] T031 Run the full automated suite (the `test` and `lint` scripts in `package.json`): `npm test`,
  `npx tsc --noEmit`, `npm run lint` and `git diff --check`. Record the results against the T001 baseline, naming
  any pre-existing failure.
- [x] T032 [C3] Static source inspection against `specs/002-refund-void-restore-parity/quickstart.md` §2, items 1–7.
  Confirm in particular that `voidPayment` and `manualRefundPayment` in `src/services/paymentsService.ts` and all of
  `src/lib/api.ts` are byte-for-byte unchanged, and that only the plan.md inventory files and T025 to T029
  documentation changed.
- [x] T033 [C3] Payment-integrity and security review of the diff (constitution III/IV) across
  `src/lib/singleFlight.ts`, `src/lib/payments/refundOutcome.ts`, `src/lib/payments/refundFlow.ts`,
  `src/lib/bookings/restoreOutcome.ts`, `src/lib/bookings/restoreFlow.ts`, `src/services/paymentsService.ts`,
  `src/services/bookingsService.ts`, `src/app/payments/payments.tsx`, `src/app/bookings/bookings.tsx` and
  `src/components/ui/BookingActionsSheet.tsx`. Confirm:
  - no card data, tokens or customer data;
  - no fabricated or substituted amounts;
  - no automatic retry or extra financial request by the feature;
  - authentication untouched;
  - no claim that O-3 or O-7 is resolved or reduced;
  - the single-flight guard is used only by the two flows.
- [x] T034 Create the D-3 fake server **outside the tracked repository** (for example
  `%TEMP%\zapzone-fake-server\server.mjs`) per `specs/002-refund-void-restore-parity/quickstart.md` §3:
  - dependency-free Node `http`, with synthetic data and two synthetic accounts;
  - the refund, void, manual-refund and restore scenario endpoints, including 20 s and more-than-60 s delays and
    dropped sockets;
  - restore 409 `BLOCKED_PERIOD` scenarios that accept the continuation only when `acknowledge_blocked_period` and
    every block id are present (mirroring `AvailabilityBlockGuard::acknowledged`);
  - synthetic JSON 404 for other paths;
  - **no forwarding**;
  - a request log that labels shared-client prompt resends.

  Confirm that `git status` is unaffected.
  *Status (2026-11-28): created at `C:\Users\Orlando\AppData\Local\Temp\zapzone-fake-server\server.mjs`. It binds to
  127.0.0.1 only. A standalone smoke test of the stub passed: 401 without auth; refund S1/F2/U4/502; restore 409
  without acknowledgement, 409 with a partial acknowledgement and 200 with the full one; continuations labelled in
  the log. This is stub verification, **not** C4 evidence. `git status` is unaffected.*
- [ ] T035 **OUTSTANDING (2026-11-28)**: no Android device or `adb` was available in the implementation session.
  Connect a development build per `specs/002-refund-void-restore-parity/quickstart.md` §3 "Connecting
  without changing tracked configuration". **If** cleartext HTTP is blocked, or any tracked configuration would need
  to change, **stop and request developer authorization**.
- [ ] T036 [C4][C5] Run matrix M1–M22 (`specs/002-refund-void-restore-parity/quickstart.md` §3), including M19
  (session switch), M20 (newly confirmed block: 2 requests), M21 (remembered block: 2 requests, no prompt) and M22
  (new block, booking or account: prompt; declined → 1 request). Record the device
  evidence and the **stub request logs**, including one request per confirmed attempt, the labelled prompt resends,
  and the void and manual-refund timeouts at about 15 s versus refund past 15 s. **These remain outstanding
  acceptance items until actually performed.** If they are not performed, report what was not run, why, and that
  acceptance is affected.
- [ ] T037 Restore normal configuration per `specs/002-refund-void-restore-parity/quickstart.md` §3 "Restoring normal
  configuration". Confirm the original base URL. `git status` must show no verification artifacts.
- [x] T038 Write the completion report for the developer (in the session report, not a repository file), checked
  against `specs/002-refund-void-restore-parity/spec.md` (VR-010) and `.specify/memory/constitution.md` (VII, VIII):
  - files changed;
  - evidence per category C1 to C5, kept separate, with iOS not applicable;
  - the release classification (JavaScript-only, potentially OTA-compatible; no publish);
  - the documentation impact;
  - outstanding items (T036 if not done; F-5, F-6, O-3, O-7 as follow-ups; the FR-015 scope decision if still
    open).

  No Git action without authorization.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (T001–T003)**: start immediately. T002 can stop the feature.
- **Phase 2 (T004–T005)**: after Phase 1. It blocks both stories.
- **Phase 3, US1 (T006–T016)** and **Phase 4, US2 (T017–T024)**: each depends only on Phase 2, and they are
  independent of each other.
- **Phase 5**: documentation T025–T029 after the story each describes. T030–T033 after both stories. T034–T037 after
  T031–T033. T038 last.

### Within-story order

- **US1**:
  - tests T006 and T009 in parallel (different files);
  - T007 and T008 after T006 (same file); T010 and T011 after T009 (same file);
  - then T012 → T013 (after T005 and T012) → T014 → T015 → T016.
- **US2**:
  - tests T017 and T018 in parallel;
  - then T019 → T020 (after T005 and T019) → T021 → T022 → T023 (after T022, which owns the shared prop type)
    → T024.

### Parallel examples

```text
# US1 tests
Task: "T006 [C1] src/lib/payments/refundOutcome.test.ts"
Task: "T009 [C2] src/lib/payments/refundFlow.test.ts"
# US2 tests (may also run alongside US1 work); T022 and T023 are sequential (shared prop type)
Task: "T017 [C1] src/lib/bookings/restoreOutcome.test.ts"
Task: "T018 [C2] src/lib/bookings/restoreFlow.test.ts"
# Docs
Task: "T025–T029 docs/…"
```

---

## Requirement coverage

| Requirement | Tasks |
|---|---|
| FR-001 | T006, T012, T033 |
| FR-002, FR-003 | T007, T012, T015 |
| FR-004 | T007, T012, T015 |
| FR-005 | T010, T013, T015 |
| FR-006 | T006, T012 |
| FR-007 | T008, T009, T010, T013, T033, T036 |
| FR-008 | T006, T007, T010, T012, T013 |
| FR-009 | T009, T015, T032 |
| FR-010, FR-011 | T017, T019, T022 |
| FR-012 | T002, T017, T019 |
| FR-013 | T018, T020, T022, T023 |
| FR-014 | T018, T020, T022, T032 |
| FR-015 (authorized continuation vs unsafe retry) | T002, T018, T020, T028, T032, T036 |
| FR-016 | T030 |
| FR-017 | T009, T013, T014, T032, T036 |
| FR-018 | T009, T010, T013, T033 |
| FR-019, FR-020 | T010, T013 |
| FR-021 | T011, T013, T015 |
| FR-022 | T007, T012, T033 |
| FR-023 (session safety) | T004, T005, T010, T013, T015, T018, T020, T022, T036 |
| SC-013 | T010, T018, T036 |
| SC-001 to SC-004, SC-008 | T006, T007, T010, T036 |
| SC-005, SC-012 | T008, T009, T010, T018, T036 |
| SC-006, SC-010 | T017, T018, T036 |
| SC-007 | T030 |
| SC-009 | T009, T032, T036 |
| SC-011 | T011, T036 |
| VR-001, VR-002, VR-004 | T006, T007 |
| VR-003 | T009, T036 |
| VR-005 | T010, T036 |
| VR-006 | T008, T009, T010, T032, T036 |
| VR-007 | T004, T010, T018, T032, T036 |
| VR-008 | T009, T032, T036 |
| VR-009 | T017, T018, T036 |
| VR-010 | T030, T031, T034 to T037 |
| VR-011 | T011, T032, T036 |
| Documentation (IX) | T025 to T029 |
| Release (VIII) | T038 |

---

## Implementation Strategy

1. **MVP**: Phase 1 → Phase 2 → US1 (tests first) → the T016 checkpoint.
2. **Then**: US2 → the T024 checkpoint.
3. **Then**: Phase 5, ending with the outstanding D-3 evidence (T036).
4. No commit, build or OTA without explicit developer authorization.

## Notes

- [P] tasks touch different files and have no incomplete dependencies.
- Test tasks must fail before their implementation tasks.
- Stop and ask on contract drift (T002), a configuration need (T035), or any new policy question.
