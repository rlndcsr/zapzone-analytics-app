# Implementation Plan: Refund-to-Void Feedback and Restore Clash Warnings

**Branch**: none (spec directory `002-refund-void-restore-parity`; Git is on `main`; branch creation not authorized)
| **Date**: 2026-11-28 | **Spec**: [spec.md](spec.md) (approved, amended, final review corrections 2026-11-28)

**Input**: Feature specification from `specs/002-refund-void-restore-parity/spec.md`

**Status**: plan approved 2026-11-28 (D-1 to D-3). Final review corrections integrated on 2026-11-28:
- FR-022 server-only amounts;
- the module inventory reduced to five, with void and manual refund untouched;
- the restore rejection allowlist re-derived from Backend paths.

**Final remediation (2026-11-28)**: I1 resolved by Option A (FR-015: authorized continuation vs unsafe retry). U1, P1,
A1, I2, D1 and T1 are resolved. Neutral amount-free wording. Session-owned, synchronous single-flight with session
checks (FR-023). No open decisions.

## Summary

Mobile discards the responses of two endpoints it already calls:
- **Refund**: Mobile shows nothing on success, and it reports every error, timeouts included, as "Refund failed".
- **Restore**: Mobile always says "restored", even when the server attached a clash warning.

Five small pure modules, following the existing `chargeOutcome` pattern and Node-testable through an injected request
function:
- classify the server's answer (or its absence) into the spec's outcomes;
- issue the refund or restore request exactly once, with the refund-only 60 s wait;
- orchestrate feedback, refresh, the single-flight guard and the advisory retry warning.

Only `refundPayment` and `restoreBooking` change in the services. The two screens and the sheet are rewired. The
shared API client, the void and manual-refund functions, eligibility rules, request bodies, confirmations and busy
guards are unchanged.

**Integrity scope**: Mobile mitigates misleading feedback and accidental staff retries only. The single-flight guard
is client-side duplicate-submission protection. **No server-side concurrency protection is claimed.** O-3 and O-7
remain separate, unverified Backend concerns.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React Native via Expo SDK 55, Expo Router
**Primary Dependencies**: existing only: `src/lib/api.ts` (`apiRequest`, `ApiError`), `src/lib/session.ts`
(`getCurrentUser`), React Native `Alert`, `src/lib/payments/paymentDisplay.ts` (`money`). **No new dependencies.**
**Storage**: none. The D-1 warning is component state in memory.
**Testing**: `node --test --no-warnings "src/**/*.test.ts"` (Node 24 type stripping, `.ts` sibling imports),
`npx tsc --noEmit`, `expo lint`. The verification categories are kept distinct (spec, Verification requirements).
**Target Platform**: Android (established). iOS is not supported yet (spec 001).
**Project Type**: mobile app (single Expo project)
**Performance Goals**: not applicable. A refund waits up to 60 s before it is declared unknown (FR-017).
**Constraints**: no Backend, Web, API, dependency, native, configuration or release change. No extra or automatic
financial request. No message-text parsing. No change to `apiRequest`, `voidPayment`, `manualRefundPayment` or
`runAction`.
**Scale/Scope**: 5 new pure modules with 5 test files; 5 modified source files; 5 documentation files at
implementation.

## Constitution Check

*Re-checked after the final review corrections. Constitution v1.0.0.*

| # | Gate | Result | Evidence |
|---|---|---|---|
| 1 | Parity (I) | PASS | Web `701e09c` and Backend `2bbd0fa` are cited. The restore allowlist is derived from inspected execution paths (R-15). Approved Web Admin divergences are recorded in the spec (the unknown outcomes, no amount fallback, the advisory warning). No cross-repository change |
| 2 | Track and scope (II) | PASS | Full SDD, approved and amended. No `NEEDS CLARIFICATION`. The FR-015 scope was decided by the developer (I1 Option A) |
| 3 | Security (III) | PASS | Server-side authorization is unchanged. The D-1 state is keyed by account and payment and held in memory. No card data. 401 and teardown stay in `apiRequest`. O-3 and O-7 are not claimed resolved or reduced |
| 4 | Contracts and integrity (IV) | PASS | The shared `apiRequest` is used through its existing `timeoutMs` option. Contracts are inspected and pinned. Failure, timeout, unknown and partial-failure paths are specified. One request per attempt. The single-flight guard plus the existing confirmation and busy guards cover duplicate submission. No fabricated amounts |
| 5 | Platforms (V) | PASS | Shared JavaScript. Android device verification (D-3) stays outstanding until performed |
| 6 | Architecture and UX (VI) | PASS | Five modules, each justified (inventory below). The injection seam exists only where tests need it. Void and manual refund are not touched. No unrelated refactor |
| 7 | Verification (VII) | PASS | Five verification categories, mapped per VR in the tasks. Reports keep them separate |
| 8 | Release (VIII) | PASS | JavaScript-only, potentially OTA-compatible. No build or publish |
| 9 | Documentation (IX) | PASS (at implementation) | Documentation tasks are listed |
| 10 | Collaboration (X) | PASS | No Git, build or publish action is planned. The fake server stays outside the repository |

**Result**: all gates pass. Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-refund-void-restore-parity/
├── spec.md · plan.md · research.md (R-1 to R-15) · quickstart.md · tasks.md
├── contracts/refund-response.md · contracts/restore-response.md
└── checklists/requirements.md
```

`data-model.md` is **not applicable**: there are no persisted entities, schema or API resources. The outcome unions
and the warning key are defined in the contracts.

### Module inventory (final)

| # | Module (new) | Contents | Justification | Test file |
|---|---|---|---|---|
| 1 | `src/lib/singleFlight.ts` | `createSingleFlight()`: per-key in-flight guard | Closes the double-confirmation gap (R-14) for **both** approved workflows. Domain-neutral, so the bookings code does not import payments code. Tiny and testable in isolation | `src/lib/singleFlight.test.ts` |
| 2 | `src/lib/payments/refundOutcome.ts` | `RefundAttempt`/`RefundOutcome` types, `parseAmount`, `refundAttemptFromError`, `classifyRefundOutcome`, `refundOutcomeNotice` | The core of the spec's outcome table and FR-022. Pure functions with no I/O. Mirrors `chargeOutcome.ts` | `src/lib/payments/refundOutcome.test.ts` |
| 3 | `src/lib/payments/refundFlow.ts` | `REFUND_TIMEOUT_MS`, `RequestFn`, `executeRefund` (the injection seam: one request with 60 s), `runRefundFlow` (orchestration), and the D-1 helpers `retryWarningKey`, `nextRetryWarnings`, `hasRetryWarning`, `refundConfirmMessage`, `REFUND_RETRY_WARNING` | The **only** way to test request count, `timeoutMs`, ordering, refresh-failure handling and single flight without React Native test tooling or loading `api.ts` (R-13). The D-1 helpers live here because the warning is a post-outcome effect of the flow, which avoids a separate module | `src/lib/payments/refundFlow.test.ts` |
| 4 | `src/lib/bookings/restoreOutcome.ts` | `RestoreAttempt`/`RestoreOutcome`, `restoreAttemptFromError`, `classifyRestoreOutcome`, `restoreOutcomeNotice` | The FR-012 allowlist derived from Backend paths (R-15). Pure | `src/lib/bookings/restoreOutcome.test.ts` |
| 5 | `src/lib/bookings/restoreFlow.ts` | `executeRestore` (one request, default wait), `runRestoreFlow` | The same testability need as module 3, for FR-013 to FR-015. It is separate from module 4 to keep the classification tests pure | `src/lib/bookings/restoreFlow.test.ts` |

**Removed in the final review**:
- `paymentRequests.ts`: void and manual refund are no longer extracted. Their timeouts are evidenced by static
  inspection and by request-path verification instead.
- `refundRetryWarning.ts`: merged into module 3.

**Considered and rejected**: merging modules 4 and 5, or 2 and 3. Pure classification tests would then sit beside
orchestration fakes in one file, with no reduction in logic. Keeping the outcome and flow modules separate also
mirrors the existing `chargeOutcome` (pure) versus service split.

### Modified source files

```text
src/services/paymentsService.ts          # refundPayment only → executeRefund(apiRequest, token, id). voidPayment/manualRefundPayment untouched
src/services/bookingsService.ts          # restoreBooking only → executeRestore(apiRequest, token, id)
src/app/payments/payments.tsx            # onRefund → confirmRefund + runRefundFlow; warning state; single-flight ref. runAction untouched
src/components/ui/BookingActionsSheet.tsx # runRestore → runRestoreFlow; single-flight ref. Check In / Delete untouched
src/app/bookings/bookings.tsx            # Deleted-view onChanged = Promise.allSettled([loadDeleted(), refetch()])
```

## Design

### 1. `singleFlight.ts`

`createSingleFlight()` returns
`{ run<T>(key: string, owner: unknown, fn: () => Promise<T>): Promise<T | null>; isRunning(key: string, owner: unknown): boolean }`.
- **Synchronous acquire**: `run` checks and records `{ owner, ticket }` for the key before calling `fn`, with no
  `await` before the record.
- While a key is held by the **same** owner, `run` returns `null` immediately, without calling `fn`.
- A **different** owner (a newer session) takes the key over and proceeds.
- `finally` deletes the key only if its own ticket still holds it, then any rejection propagates.
- A `fn` that never settles (a request from an ended session) keeps only that owner's entry, and it never blocks a
  newer owner (FR-023).
- One instance per Payments screen and per `BookingActionsSheet`, held in a `useRef`. It is used only by the two
  flows.
- `owner` is opaque to the module. The screens pass the current session token: in memory, never logged, never
  persisted (R-14).

### 2. `refundOutcome.ts`

```ts
export type RefundAttempt = { kind: "ok"; body: unknown } | { kind: "error"; status: number; body: unknown } | { kind: "no_answer" };
export type RefundOutcome =
  | { kind: "refunded"; row: "S3"; amount: number | null; refundPaymentId: number | null }
  | { kind: "voided"; row: "S1" | "S2"; amount: number | null; cancelled: boolean }
  | { kind: "failed"; row: "F1" | "F2" | "F3" | "F4" | "F5"; message: string }
  | { kind: "unknown"; row: "U1" | "U2" | "U3" | "U4" | "U5" | "U6" };
export function parseAmount(value: unknown): number | null;               // FR-022: valid server amount or null
export function refundAttemptFromError(err: unknown): RefundAttempt;       // numeric status > 0 → error; else no_answer
export function classifyRefundOutcome(attempt: RefundAttempt): RefundOutcome;
export function refundOutcomeNotice(o: RefundOutcome, ctx: { payableType: string | null }): { title: string; message: string };
```

- The rules are exactly as in [contracts/refund-response.md](contracts/refund-response.md).
- `amount` comes **only** from the server field via `parseAmount`, so a missing or invalid value gives `null` and no
  amount is shown. There is **no** row or payment-amount input (FR-022).
- No authentication handling.

### 3. `refundFlow.ts`

```ts
export const REFUND_TIMEOUT_MS = 60_000;
export type RequestFn = (path: string, options: { method: "PATCH" | "POST"; body?: unknown; token?: string; timeoutMs?: number }) => Promise<unknown>;
export async function executeRefund(request: RequestFn, token: string, paymentId: number): Promise<RefundOutcome>;
export async function runRefundFlow(deps: {
  key: string; owner: unknown; guard: SingleFlight; refund: () => Promise<RefundOutcome>;
  isSessionCurrent(): boolean;
  setBusy(b: boolean): void; closeSheet(): void; notify(title: string, message: string): void;
  noticeFor(o: RefundOutcome): { title: string; message: string };
  applyWarning(o: RefundOutcome): void; reload(): Promise<unknown>;
}): Promise<RefundOutcome | null>;
// D-1 helpers (FR-021)
export const REFUND_RETRY_WARNING: string;   // the approved sentence
export function retryWarningKey(userId: number | null, paymentId: number): string | null;
export function nextRetryWarnings(prev: ReadonlySet<string>, o: RefundOutcome, userId: number | null, paymentId: number): ReadonlySet<string>;
export function hasRetryWarning(set: ReadonlySet<string>, userId: number | null, paymentId: number): boolean;
export function refundConfirmMessage(base: string, showWarning: boolean): string;
```

- **`executeRefund`** makes exactly one call:
  `request(\`/api/payments/${id}/refund\`, { method: "PATCH", body: {}, token, timeoutMs: REFUND_TIMEOUT_MS })`.
  - Resolve → `classifyRefundOutcome({ kind: "ok", body })`.
  - Catch → `classifyRefundOutcome(refundAttemptFromError(err))`.
  - It never throws for HTTP or transport failures. A never-settling request (401) stays pending.
- **`runRefundFlow`** order:
  1. synchronous single-flight acquire (`guard.run(key, owner, …)`); a declined start returns `null` with no side
     effects;
  2. `setBusy(true)`, then `refund()`;
  3. **session check**: if `!isSessionCurrent()`, skip steps 4 and 5 entirely (no close, notify, warning or reload);
  4. `failed` → `notify` only;
  5. otherwise → `closeSheet()`, `notify()`, `applyWarning()`, then `await reload()` in `try/catch`. A rejection is
     swallowed, with no second notify and no warning change;
  6. `finally` → `setBusy(false)`, and the guard releases this ticket.
- **D-1 lifecycle**: U adds, S removes this key, F leaves it unchanged, and a null user records nothing. The helpers
  return new sets.
- **Notices (FR-022)**: with a valid server amount, the Web Admin wording (`Refund of $X processed successfully.`;
  `This payment had not settled yet, so it was voided instead of refunded. The full $X goes back to the card[ and the
  booking|purchase was cancelled].`). Without one, the neutral forms (`Payment refunded successfully.`;
  `Payment voided instead of refunded.`; `Payment voided instead of refunded, and the associated booking|purchase was
  cancelled.`). The refund record number is appended when present.

### 4. `restoreOutcome.ts` and `restoreFlow.ts`

```ts
export type RestoreAttempt = { kind: "ok"; body: unknown } | { kind: "error"; status: number; body: unknown; message: string } | { kind: "no_answer" };
export type RestoreOutcome = { kind: "restored" } | { kind: "restored_with_warning"; warning: string } | { kind: "rejected"; message: string } | { kind: "unknown" };
export function restoreAttemptFromError(err: unknown): RestoreAttempt;
export function classifyRestoreOutcome(a: RestoreAttempt): RestoreOutcome;   // contracts/restore-response.md R1–R4c
export function restoreOutcomeNotice(o: RestoreOutcome, ref: string): { title: string; message: string };

export async function executeRestore(request: RestoreRequestFn, token: string, bookingId: number): Promise<RestoreOutcome>; // one POST, no timeoutMs
export async function runRestoreFlow(deps: { key; owner; guard; restore; isSessionCurrent(): boolean; setBusy; closeSheet; notify; noticeFor; refresh(): Promise<unknown> }): Promise<RestoreOutcome | null>;
```

- **Confirmed rejection** only for 403 `success:false`, 422 `success:false`, 422 `errors.change_reason`, and 409
  `code:"BLOCKED_PERIOD"`. **Any 404**, other 4xx shapes, 5xx, malformed 2xx and no answer are unknown (R-15).
- `RestoreRequestFn` is a local type, structurally compatible with `RequestFn`, so bookings code does not import
  payments code.
- `runRestoreFlow`: synchronous session-owned single flight, then the session check (skip all effects if the
  session is stale). A `rejected` outcome → notify only. Otherwise → `closeSheet()`, `notify()`, then
  `await refresh()` in `try/catch`. No retry. The shared client's authorized continuations (FR-015) happen inside
  the single `restore()` call, before classification, and are untouched.

### 5. Services and screens

- **`paymentsService.ts`**: `refundPayment(token, id)` returns `executeRefund(apiRequest, token, id)`. **Nothing else
  changes.**
- **`bookingsService.ts`**: `restoreBooking(token, id)` returns `executeRestore(apiRequest, token, id)`.
- **`payments.tsx`**:
  - add `retryWarnings: ReadonlySet<string>` state and a `useRef(createSingleFlight())`;
  - `onRefund={confirmRefund}`, which keeps today's title, base text and buttons. The message is
    `refundConfirmMessage(base, hasRetryWarning(retryWarnings, getCurrentUser()?.id ?? null, p.id))`;
  - "Refund" → capture `startToken = getToken()` and `startUserId = getCurrentUser()?.id ?? null`, then
    `runRefundFlow({ key: String(p.id), owner: startToken, guard, refund: () => refundPayment(startToken ?? "",
    p.id), isSessionCurrent: () => !isStaleSessionReply(startToken ?? undefined, getToken()), setBusy:
    setActionBusy, closeSheet: () => setActionsPayment(null), notify: Alert.alert, noticeFor: (o) =>
    refundOutcomeNotice(o, { payableType: p.payableType }), applyWarning: (o) => setRetryWarnings((s) =>
    nextRetryWarnings(s, o, startUserId, p.id)), reload: load })`. `isStaleSessionReply` comes from
    `src/lib/staleSessionReply.ts` (existing, unchanged);
  - `runAction`, `confirmAction`, and the Void, Manual refund and Delete entries are untouched.
- **`BookingActionsSheet.tsx`**: the confirmation `Alert`, token check and `busy` guard are kept. "Restore" →
  `runRestoreFlow({ key: String(booking.id), owner: token, guard, restore: () => restoreBooking(token, booking.id),
  isSessionCurrent: () => !isStaleSessionReply(token, getToken()), setBusy: (b) => setBusy(b ? "restore" : null),
  closeSheet: onClose, notify: Alert.alert, noticeFor: (o) => restoreOutcomeNotice(o, ref), refresh: async () => {
  await onChanged(); } })`. **This task also owns** widening the `onChanged` prop type to
  `() => void | Promise<unknown>` (P1).
- **`bookings.tsx`**: in the Deleted view, `onChanged={() => Promise.allSettled([loadDeleted(), refetch()])}`, the
  existing reload plus the incremental sync (FR-013). It depends on the sheet task for the prop type.

## Verification strategy (by category)

| VR | Classifier tests | Injected-request / flow tests | Static source inspection | Actual API request path (D-3 stub log) | Manual Android |
|---|---|---|---|---|---|
| VR-001/002/004 | `refundOutcome.test.ts`: every row, malformed and contradictory bodies, FR-022 amounts (no substitution), wording | — | — | — | M1–M6 |
| VR-003 | U1 via `no_answer` | `refundFlow.test.ts`: the fake rejects `{status:0}` → unknown, one call | — | Refund held for more than 60 s → unknown | M5 |
| VR-005 | — | `refundFlow.test.ts`: a rejecting reload → one notify, warning unchanged, busy reset | — | — | M7, M8 |
| VR-006 | Every refund fixture fails both re-send predicates | `refundFlow.test.ts`: exactly one `request` call per attempt, no other path | `api.ts` unchanged | One refund request per confirmed tap | M7, M10 |
| VR-007 | — | `singleFlight.test.ts` (sync acquire, owner takeover, ticket release); flow tests: concurrent same key and owner → one call; a stale session → no effects; a failing refresh releases the lock | Confirmations and busy guards intact | Double tap → one request | M10, M19 |
| VR-008 | — | `refundFlow.test.ts`: `timeoutMs: 60000` passed | `voidPayment`, `manualRefundPayment`, `DEFAULT_TIMEOUT_MS` and `api.ts` unchanged | Refund at 20 s succeeds; void and manual refund at 20 s time out at about 15 s | M16–M18 |
| VR-009 | `restoreOutcome.test.ts`: R1–R4c, each allowlist shape, 404 → unknown | `restoreFlow.test.ts`: refresh on confirmed and unknown, none on rejected, a rejecting refresh, single flight, a stale session | Prompts and `blockedPeriodPrompt.ts` untouched | Unknown → 1 request; newly confirmed block → 2; remembered block → 2 with no prompt; declined → 1; another account or booking or a new block id → prompt | M11–M15, M20–M22 |
| VR-010 | Full `npm test` (regression suites unmodified), `tsc`, lint, `git diff --check` | — | Participant-pricing files unchanged | Stub logs (outstanding) | Full matrix (outstanding) |
| VR-011 | `refundFlow.test.ts`: D-1 helpers | — | No storage APIs | — | M8, M9 |

## Security and payment-integrity considerations

- Authorization is unchanged (server-side). The D-1 state is scoped to account and payment, in memory, and discarded
  on unmount.
- Alerts show only server-provided or already-visible values. Amounts are never fabricated or substituted.
- One request per attempt and no automatic retry by the feature. The single-flight guard is **client-side only**.
- Residual and unchanged: O-3, O-6 (client-side mitigation only), O-7. The 60 s wait does not guarantee completion.
- Blocked-period continuation (FR-015, I1 Option A): an authorized continuation, preserved. It is scoped to the
  account, booking and block ids, and re-authorized server-side (R-15). F-7 (acknowledgements not cleared on
  sign-out) is recorded and not changed.
- Session safety (FR-023): stale-session answers produce no feedback, warning or refresh, and they never block the
  current session. There is no change to authentication infrastructure.

## Documentation impact (implementation tasks)

- `docs/features/dashboard-administration-analytics-and-payments.md`
- `docs/features/bookings-and-scheduling.md`
- `docs/business-rules/dashboard-administration-analytics-and-payments.md` (BR-PAYMENT-006 note and a new
  `BR-PAYMENT-*`)
- `docs/business-rules/bookings-and-scheduling.md` (BR-BOOKING-004)
- `docs/KNOWN_LIMITATIONS.md` (O-3, O-7, F-5, F-6 at the next free `KL-PAYMENT-*` numbers; F-7 at the next free
  `KL-BOOK-*` number)

## Approved decisions (2026-11-28)

| ID | Decision |
|---|---|
| D-1 | Advisory retry warning (FR-021): memory only, keyed by account and payment. It never blocks or retries, and it does not reduce O-3 |
| D-2 | Unknown restore outcomes (FR-012/FR-013/FR-015). The allowlist was re-derived in the final review (R-15). 404 → unknown |
| D-3 | A dependency-free local Node stub outside the repository, with synthetic data only and no forwarding. It is created and run only at implementation. Any configuration change needs authorization |
| Final review | FR-022 server-only amounts; five modules; void and manual refund untouched; verification categories kept distinct |
| Final remediation | I1 Option A (FR-015); U1 F3 shapes; P1 task ownership; A1 SC-003; I2; D1; T1 glossary; neutral wording; FR-023 session safety |

## Risks and limitations

| Risk | Impact | Mitigation |
|---|---|---|
| Backend shape drift (refund F1 vs U4/U5; the restore allowlist shapes) | Misclassification | The allowlists default to unknown. Fixtures pin `2bbd0fa`. T002 re-verifies before coding |
| Laravel debug mode adds `exception`/`trace` keys to rendered errors | None for classification | Absent-key rules (refund F1 "no `is_unsettled`", F3 404 "no `success`") concern keys debug mode never adds |
| Session token used as an in-memory lock owner | Sensitive value in memory | It is already held by the session store and request closures. It is never logged, persisted or rendered, and is compared only, as `isStaleSessionReply` already does |
| `apiRequest` cannot run under Node | Injected tests prove what the flow passes, not what `apiRequest` does | Static inspection plus the stub request logs (outstanding) |
| D-3 may need a configuration change | Manual verification blocked | Report it and request authorization |
| O-3, O-7 (Backend) | Duplicate attempts and partial records remain possible server-side | Out of scope; separate investigations (F-2, F-4) |
| More "unknown" outcomes than the Web Admin shows | Staff verify more often | Approved; the wording guides them |
| Omitted amounts in rare malformed responses | Less detail than the Web Admin | Approved (FR-022). The outcome is still accurate |
| `runAction` lacks single flight (F-6); manual refund omits `notes` (F-5); acknowledgements not cleared on sign-out (F-7) | Pre-existing | Out of scope; documented |

## Complexity Tracking

No constitution violations. Nothing to justify.
