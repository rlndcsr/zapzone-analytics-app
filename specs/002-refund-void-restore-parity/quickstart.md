# Quickstart: Validating Feature 002

**Plan**: [plan.md](plan.md) | **Contracts**: [refund](contracts/refund-response.md), [restore](contracts/restore-response.md)

> **Safety.** Use only synthetic responses. No real refund, void, charge, cancellation or production booking change
> is authorized. Never point the app at the real Backend or at Authorize.Net during these checks. Sandbox gateway use
> needs separate developer authorization.

The evidence comes in five **distinct categories**, which reports must keep separate (spec, Verification
requirements):
1. classifier tests;
2. injected-request and flow tests;
3. static source inspection;
4. actual API request-path verification (the D-3 stub log);
5. manual Android verification.

## 1. Automated checks: categories 1 and 2 (no device, no network)

```bash
npm test                    # node --test over src/**/*.test.ts
npx tsc --noEmit
npm run lint
git diff --check
```

| Suite (new) | Category | Proves |
|---|---|---|
| `src/lib/singleFlight.test.ts` | 2 | One in-flight run per key; release after resolve and reject |
| `src/lib/payments/refundOutcome.test.ts` | 1 | Every row (S1–S3, F1–F5, U1–U6); malformed and contradictory bodies; FR-022 (server amounts only, no substitution); wording; no fixture triggers the shared client's re-send conditions |
| `src/lib/payments/refundFlow.test.ts` | 2 (+1 for the D-1 helpers) | One `request` call per attempt with `PATCH /api/payments/:id/refund`, body `{}`, `timeoutMs: 60000`; status 0 → unknown; alert before reload; a rejecting reload leaves the feedback and warning untouched; single flight; D-1 keying and lifecycle |
| `src/lib/bookings/restoreOutcome.test.ts` | 1 | R1–R4c: warning trimming; the four rejection shapes; any 404, other 4xx shapes, 5xx and malformed 2xx → unknown; wording |
| `src/lib/bookings/restoreFlow.test.ts` | 2 | One `POST` with no `timeoutMs`; confirmed and unknown → refresh; rejected → none; a rejecting refresh leaves the feedback; single flight |

Regression suites that must pass unmodified: `bookingSummaryLines.test.ts`, `packagePricing.test.ts`,
`chargeOutcome.test.ts`, `changeReasonPrompt.test.ts` and `blockedPeriodPrompt.test.ts`.

## 2. Static source inspection: category 3 (from the diff)

1. `src/lib/api.ts` (including `DEFAULT_TIMEOUT_MS`), `src/lib/changeReasonPrompt.ts` and
   `src/lib/blockedPeriodPrompt.ts` are unchanged.
2. `voidPayment` and `manualRefundPayment` in `src/services/paymentsService.ts` are **byte-for-byte unchanged**.
   Only `refundPayment` changed.
3. `runAction` and `confirmAction` in `payments.tsx` are unchanged. Check In and Delete in `BookingActionsSheet.tsx`
   are unchanged.
4. The confirmation `Alert` still precedes Refund and Restore. The busy guards are intact.
5. The D-1 state is React state only. There is no SecureStore, AsyncStorage or file API in the diff.
6. Participant-pricing files are unchanged (`create-booking.tsx`, `manual-booking.tsx`, `bookingSummaryLines.ts`,
   `packagePricing.ts`).
7. Only the files in plan.md's inventory and the five documentation files changed.

## 3. D-3 stub: categories 4 and 5, outstanding acceptance items until performed

### Environment and isolation

- **The stub** is a single dependency-free Node file using the built-in `http` module. It is created at
  implementation time **outside the tracked repository** (for example `%TEMP%\zapzone-fake-server\server.mjs`).
- **What it serves**: synthetic data only, consisting of:
  - a synthetic login and two synthetic accounts;
  - `/api/user`, and `/api/mobile/version` with no forced update;
  - the payments list, the bookings list, trashed bookings, and locations;
  - the scenario endpoints `PATCH /api/payments/:id/refund|void|manual-refund` and `POST /api/bookings/:id/restore`.

  Every other path gets a synthetic JSON 404.
- **No forwarding** to the real Backend or to Authorize.Net. No production credentials, customers or payment data.
- **Scenario selection**: chosen per run, through a stub-only control endpoint or a startup argument. Delays (20 s,
  more than 60 s) and dropped sockets are supported.
- **Request log** (required evidence): each refund, void, manual-refund and restore request is logged with its time,
  method, path and body keys (no secrets exist; all data is synthetic). The log shows one request per confirmed
  attempt, labels any shared-client prompt resend (change reason or blocked period) as such, and shows the void and
  manual-refund timeout timing.

### Connecting without changing tracked configuration

1. Note the current base URL from the Metro log line `[api] base URL = …`.
2. Start the stub. Run `adb reverse tcp:4010 tcp:4010`.
3. In a **new shell only**, set `EXPO_PUBLIC_API_URL=http://localhost:4010`, then run `npx expo start -c`. Confirm the
   log shows the stub URL.
4. **If** the build in use rejects cleartext HTTP, or the variable is not picked up without editing `.env` or
   `app.json`: **stop and request authorization**. Nothing is changed silently.

### Restoring normal configuration

Stop the stub. Run `adb reverse --remove tcp:4010`. Close that shell. Restart Metro from a clean shell with
`npx expo start -c`. Confirm the base-URL log line shows the original value. `git status` must show no change caused
by the verification.

### Matrix (category 5, with the category 4 log checks noted)

| # | Scenario (stub response) | Expected on device | Stub log check |
|---|---|---|---|
| M1 | S3 refund (`refund_amount: "50.00"`) | "Refund processed", "Refund of $50.00…" with the record no.; the sheet closes; the list reloads | 1 refund request, observed with a 60 s client budget |
| M2 | S1 void, booking, cancelled | "Payment voided … and the booking was cancelled." | 1 request |
| M3 | S2 void; also with `void_amount` absent and with `"abc"`; S1 with `void_amount` absent; S3 with `refund_amount` absent | No cancellation clause for S2. With an absent or invalid amount: exactly "Payment voided instead of refunded." / "Payment voided instead of refunded, and the associated booking was cancelled." / "Payment refunded successfully." No dollar figure, and never the row amount | 1 request each |
| M4 | F2 (400, `error_code` set) | "Refund failed: <message>"; the sheet stays open; no reload | 1 request |
| M5 | U1: no answer for more than 60 s | After about 60 s, "Refund result unknown"; the sheet closes; the list reloads | 1 request; no resend |
| M6 | U3 (generic 500), U4, U5 | "Refund result unknown", never "Refund failed" | 1 request each |
| M7 | Unknown, then `GET /api/payments` fails | The alert stands; the list shows its load error | 1 refund request |
| M8 | Unknown, the row still `completed`, then Refund again on the same payment | The confirmation includes the advisory warning; Cancel and Refund are both available | 1 request per confirmed tap |
| M9 | As M8, on another payment, and as the second synthetic account | No warning | — |
| M10 | Rapid double tap or double confirm on Refund and on Restore | One operation each | Exactly 1 request each |
| M11 | Restore R2 | "Booking restored"; the Deleted list reloads; the booking is in the active list after leaving View Deleted | 1 restore request |
| M12 | Restore R1 (`space_warning`) | "Booking restored — time clash" with the full warning; both lists refresh | 1 request |
| M13 | Restore 422 `success:false`; 409 `BLOCKED_PERIOD` declined; 422 `errors.change_reason` with the prompt cancelled | "Restore failed: <message>"; no refresh | 1 request each (no resend after a decline or cancel) |
| M14 | Restore 404; generic 500; malformed 2xx; no answer; 422 with an unlisted shape | "Restore result unknown" with the approved sentence; both lists refresh | 1 request each |
| M15 | Restore confirmed, then the stub fails the trashed and bookings lists | The restore alert stands; the lists show their error states | 1 request |
| M16 | **Void** answered after 20 s | The existing failure alert ("Void failed: Request timed out after 15s…") at about 15 s | Client gave up at about 15 s (default unchanged) |
| M17 | **Manual refund** answered after 20 s | The existing failure alert at about 15 s | Client gave up at about 15 s (default unchanged) |
| M18 | Refund answered after 20 s (S3) | "Refund processed" | Client waited past 15 s (60 s budget) |
| M19 | Refund delayed 20 s; switch to the second synthetic account before it answers; then Refund the same payment id as the second account | No alert, warning or reload from the late answer. The second account's Refund is not blocked | 2 refund requests, one per session |
| M20 | Restore → 409 `BLOCKED_PERIOD`; staff **confirm** | Outcome per FR-010 to FR-012 on the continuation's answer | Exactly 2 requests; the second carries `acknowledge_blocked_period` and every block id |
| M21 | Within 5 minutes, same account, same booking, same block ids → 409 again | **No prompt**. Outcome per the continuation's answer | Exactly 2 requests (remembered continuation) |
| M22 | 409 for a **new** block id, another booking, or as the second account | The prompt appears again; declining → "Restore failed: Not saved: that time is inside a blocked period." | Declined → exactly 1 request; never a silent continuation |

Record the results per Principle VII, keeping the five categories separate. iOS is not applicable (spec 001).
