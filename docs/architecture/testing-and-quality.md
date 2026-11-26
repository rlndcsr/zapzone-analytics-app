# Testing and Quality

> **Purpose:** Record the test, type-check and lint tooling that exists, what the automated tests cover, and what is not covered.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`
> **Scope & limitations:** Static inspection of `package.json`, `tsconfig.json`, `eslint.config.js`, `.vscode/settings.json`, and the 143 test files (file list + top-level `describe` names; a sample read in full). **No test, type-check or lint command was run** — nothing here asserts that any of them pass. CI services outside the repo were not inspected.
> **Related:** [Architecture overview](../ARCHITECTURE.md) · [Development guidelines](../DEVELOPMENT_GUIDELINES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [UI, navigation & styling](ui-navigation-and-styling.md) · [Native integrations](native-integrations.md) · [Platform & release](platform-and-release.md)

---

## 1. Tooling

| Concern | Command / config | Notes |
|---|---|---|
| Unit tests | `npm test` → `node --test --no-warnings "src/**/*.test.ts"` | Node's built-in runner (`node:test` + `node:assert/strict`), executing `.ts` directly via Node's TypeScript type-stripping. No Jest, no React Native Testing Library, no E2E (Detox/Maestro), no coverage tooling. |
| Import style in tests | Relative imports with explicit `.ts` extension (e.g. `./navConfig.ts`) | Enabled by `tsconfig.json` `allowImportingTsExtensions: true`. Modules under test must avoid runtime imports of React Native / Expo native modules (type-only imports are erased) — e.g. `src/lib/notifications/foregroundPresentation.ts` imports `expo-notifications` types only "so it stays testable in bare Node". |
| Node version | Not pinned (no `engines`, `.nvmrc`) | Type-stripping needs a modern Node (built-in by default in recent releases); the required minimum is undocumented (KL-TEST). |
| Type-check | `npx tsc --noEmit` | Not an npm script; referenced only in a comment in `.vscode/settings.json`. `tsconfig.json` extends `expo/tsconfig.base`, `strict: true`, paths `@/*` → `src/*` (imports in code are mostly relative). |
| Lint | `npm run lint` → `expo lint` | `eslint.config.js` = `eslint-config-expo/flat` + ignore `dist/*`. Code contains targeted `eslint-disable-next-line` comments (e.g. `react-hooks/exhaustive-deps` in `BottomSheet.tsx`/`CenterModal.tsx`, `@typescript-eslint/no-require-imports` in `fonts.ts`/`pushDevice.ts`). |
| Formatter | `prettier-plugin-tailwindcss` is a **runtime dependency**, but there is no Prettier config or script | Editor-only practice; VS Code `codeActionsOnSave` runs fixAll / organizeImports / sortMembers (explicit). |
| CI | None — no `.github/` directory or other CI config in the repo | Nothing enforces tests, types or lint before merge (KL-TEST). |
| Spec tooling | `.specify/` + `.claude/skills/speckit-*` (Spec Kit v1.4.3, commit `973d281`) | Process tooling only; not a test harness. |

## 2. Test inventory (143 files, all under `src/lib/`)

All tests are pure-logic unit tests. No mocks, spies or `fetch` stubs were found (`mock`/`t.mock` search: 0). Grouped by area (file names under `src/lib/`):

| Area | Files | What the `describe` blocks cover |
|---|---|---|
| Bookings (`bookings/`, 22) | bookingCell, bookingCheckIn, bookingDetailFields, bookingNotes, bookingPrefill, bookingSearch, bookingSummaryLines, bookingSync, cacheOwner, customBooking, durationEditor, editBookingAvailability, freeTime, guestOfHonorPayload, importSummary, minuteScale, onlineSlotsLost, onsiteCodes, packageCandidates, patchBooking, spaceScheduleGrid, walkInCustomer | Calendar cell text/colours/clash summaries, check-in eligibility & balances, prefill round-trips, search ranking, change-feed sync ordering, cache owner guard, custom-package quotes/validation, availability/closures/slot rules, free-time geometry, schedule grid lanes/columns/closures, on-site codes, walk-in validation |
| Calendar & date (`calendar/`, `date/`, `calendarEvent`, `time`, 7) | categoryFilter, dayGrid, dayGridSlots, calendar, timeAgo, calendarEvent, time | Day/week grid layout & variable timeline, slot windows and walk-in rules, date keys, relative time, add-to-calendar draft durations |
| Payments & checkout (`payments/`, 10) | acceptJsLocation, bookingRollback, cardLabel, chargeOutcome, checkoutKey, checkoutTokens, membershipChargeGate, payableRoute, paymentState, (+ `orderAmounts` at lib root) | Accept.js location match, force-delete-or-keep rollback, card labels, unknown-charge handling, idempotency keys/tokens, payment-state derivation, payment deep-link routes, money field clamping |
| Pricing, packages, gift cards (`pricing/`, `packages/`, `giftCards/`, root, 15) | combineFreshPricing, specialPricing, bookingWindow, globalNotePayload, onlineAvailability, packagePricing, patchLog, scheduleDays, scheduleSlots, checkoutGiftCard, giftCardExpiry, sellGiftCard, addOnQuantity, packageSetup, participants, ticketLimits | Special-pricing visit/day rules & payment gate, package pricing/schedules/slots, online availability, gift-card apply/expiry/sell, add-on minimums, participant clamps, per-slot ticket caps |
| Check-in & scanning (`checkin/`, 7) | checkInOrder, checkInWaiverList, deskDate, eventCheckInRefusal, parseTicketQr, resolveScannedCode, ticketBalance | QR payload parsing (orders, tickets, bookings, membership/photo tokens, JSON), refusal cases, desk date stepping, waiver list merge |
| Waivers (`waivers/`, 10) | adPresentation, groupInvites, kioskContract, kioskToken, returningCustomers, signaturePath, templateDisplay, visitPeriod, waiverCoverage, waiverDeletion | Kiosk token/contract, signature path, coverage lines, group invites, ad scheduling, deletion |
| Email / SMS / follow-ups (`email/`, `sms/`, `visitFollowUp/`, `escapeRooms/`, `visitors/`, 15) | campaignSchedule, campaignSendOutcome, emailTemplateOptions, eventRecipients, excludedEmails, notificationSettings, safeEmailHtml, visitEmail, smsText, statusEdit, visitFollowUp, escapeRooms, gameFollowUp, smsConsent, (+ `emailDomains`, `htmlBlocks` at root) | Campaign scheduling and refusal outcome, template options, recipient pickers, HTML sanitising, SMS segments, follow-up state/wording, escape-room game flow |
| Photos (`photos/`, 8) | captureSize, deliveryOutcome, frameVersions, libraryDays, messageLinks, overlayEvents, photoRecipients, (+ `mediaPath`) | Camera capture-size choice, delivery states/retry, frame versions per shape, library windows, recipient helpers |
| Registration forms (`registrationForms/`, 4) | registrationEvents, registrationForms, registrationLinking, registrationPayload | Event/location form grouping, validation, CSV export, linking, multipart payloads |
| Analytics & dashboard (`analytics/`, `dashboard/`, `customers/`, `concerns/`, 10) | accountingScope, companyExport, pageAnalyticsDisplay, performanceDisplay, activityCategories, breakdowns, dashboardConfig, dashboardTimeframe, customerAnalyticsDisplay, leadFilter | Export CSV/JSON, display formatting, activity bucketing, role dashboards, timeframe filters, lead filter |
| Navigation & notifications (`navigation/`, `notifications/`, 6) | navConfig, foregroundPresentation, notificationGroups, notificationIcon, notificationRouteMapper, pushNavigationQueue | Role tabs and `isTabRoute`; foreground presentation; push/notification route resolution (incl. "every backend PUSHABLE_TITLE resolves"); tap queue gating, startup redirect chain survival, duplicate-tap prevention |
| App update & session (root, 7) | appUpdateAttempt, appUpdateInstall, appUpdateNotice, appUpdatePrompt, errorReportGate, staleSessionReply, requestError | Install controller states (success, duplicate taps, progress, failures, pause/cancel), attempt breadcrumbs, notice/prompt deferral, error-report throttling, stale-session detection, error messages |
| Other domain helpers (root + `location/`, `branding/`, `dayOffs/`, `events/`, `attractions/`, `ui/`, ≈19) | staffLocation, brandLogo, blockForm, dayOffClosure, eventEditForm, eventSaleDates, dayOffAvailability, purchaseEditPayload, statusModal, blockedPeriodPrompt, changeReasonPrompt, overridePin, staffPins, staffDeleteMessage, rooms, venueCategories, phone, bulkOrder, purchaseMetrics, fetchAllPages | Location switching state, brand logo resolution, day-off block forms/closures, event edit/sale dates, status-modal variants, global prompt registries, PIN validation, phone formatting, pagination walker |

(Counts per row are approximate where marked ≈; the total is 143.)

## 3. What is not covered

- **No tests for any `src/app/**` screen, `src/components/**` component, `src/lib/hooks/**` hook, or `src/services/**` module** (0 test files outside `src/lib`). API clients, caching services (e.g. `metricsCacheService.ts`), auth/session (`lib/session.ts`, `services/auth`), `AuthGuard`, `PushNotificationRouter`, `AppUpdateGate` are untested except for the pure helpers they call.
- No native-integration tests (camera, media library, file system, sharing, print, calendar, notifications, secure store, intent launcher); these require device verification.
- No rendering/snapshot, navigation, theming (dark mode), accessibility, keyboard or safe-area tests.
- No iOS-specific verification of any kind.

## 4. Manual / device verification practice

None is documented in the repo (no test plan, checklist, release QA notes or device matrix). `README.md` is the unmodified create-expo-app template. `docs/MAX_UPDATE_DEPTH_DEBUG_REPORT.md` is an incident write-up, not a test procedure.

## 5. Regression risk areas (highest first)

1. **Root layout / auth hand-offs** — hydration gate, `AuthGuard`, `router.replace` chains, `initialRouteName: "splash"`, switch-account remounts (history of "Maximum update depth" loops; temporary `authDebug` instrumentation still present).
2. **Push tap routing on cold start** — `PushNotificationRouter` + `pushNavigationQueue` (logic tested; the component wiring is not).
3. **NativeWind css-interop** — conditional `shadow`/`dark:`/`active:` classes on mounted elements can throw at runtime; no automated detection.
4. **Stacked native modals** — sequencing relies on 280 ms timeouts; global prompt hosts may open over an open sheet.
5. **Payments / checkout idempotency** — helpers tested; the screens that call the charge endpoint are not.
6. **In-app APK installer** — controller logic tested; download/intent on real Android versions requires devices.
7. **Root JS config tampering** — configs execute at build time; no CI diff guard.

## 6. Known limitations referenced

`KL-TEST-*`: no CI; no component/screen/hook/service tests; Node version unpinned; type-check not scripted; no device-verification record; Prettier dependency without config. See [Known limitations](../KNOWN_LIMITATIONS.md).
