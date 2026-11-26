# ZapZone Mobile — Known Limitations & Technical Debt Register

> **Purpose:** A transparent register of known limitations, technical debt, parity gaps, suspected defects and
> security concerns, each with evidence. **Nothing here has been fixed.**
> **Status:** Baseline (descriptive)
> **Last reviewed:** 2026-11-26
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e`; Backend `zapzone-backend@ae877e2` (cited
> sections only)
> **Scope & limitations:** Found by static source inspection. **"Confirmed defect" means confirmed by reading the
> code, not reproduced at runtime.** Every item still needs runtime or device confirmation before it is fixed.
> **Related:** [Index](README.md) · [Feature catalog](FEATURE_CATALOG.md) · [Business rules](BUSINESS_RULES.md) ·
> [Architecture](ARCHITECTURE.md)

## Legend

| Field | Values |
|---|---|
| **Type** | **Defect** = confirmed by static evidence · **Suspected** = suspected issue · **Limitation** · **Parity gap** (vs Web Admin) · **Debt** (technical debt) · **Test gap** · **Doc gap** · **Security** (needs separate review) |
| **Conf.** | Confidence: H / M / L |
| **Verif.** | SV = Source-verified · DVR = Device verification required · Inf = Inferred · NA = Not assessed |

Item IDs are stable. When an item is resolved, mark it `Resolved (date, commit)` rather than deleting it. Duplicate
reports from different investigation areas are kept as pointers.

**Register size (2026-11-26):** 203 IDs: 193 distinct items plus 10 duplicate pointers (KL-ARCH-006, KL-UI-013,
KL-PLAT-011, KL-BOOK-010, KL-ATTR-007, KL-PRICE-005, KL-PRICE-008, KL-WAIVER-013, KL-ADMIN-004, KL-UPDATE-001).
`KL-PRICE-009` was never assigned. A **Security** type means "needs a dedicated security review". It does not
mean exploitability was confirmed. No security item here was tested against a running server.

## Priority summary

### Security concerns requiring a dedicated review

These are **not** remediated in this phase. They come from static reading, and most involve Backend code, so they
are external dependencies for the Backend owner.

| Priority | Items |
|---|---|
| **Review first** | **KL-ARCH-001** (a failed login tears down the live session) · **KL-SEC-001/002** (inactivity lock effectively off: TEMP 30-day TTL, resume without password) · **KL-SEC-003** (public, unscoped `GET /api/mobile/locations`) · **KL-CUST-002** (analytics scope taken from a client-sent `user_id`) · **KL-WAIVER-005** (deleted-waiver snapshots with contact details visible to any staff) |
| **Tenant scoping (Backend)** | KL-PKG-021/022/023/024, KL-PRICE-010/011, KL-CUST-003/008, KL-MEMBER-002, KL-ANALYTICS-002, KL-PAYMENT-002, KL-EVENT-009 |
| **Other** | KL-WAIVER-003 (`admin_delete_enabled` toggle enforced only in the UI; deletion itself is admin-only on the server) · KL-BOOK-017 (staff totals not enforced by default) · KL-WAIVER-002 (CSV export of PII ungated) · KL-WAIVER-010 (public walk-in kiosk endpoints) · KL-PHOTO-002 (guest kiosk can escape to the staff app) · KL-COMMS-003/004/005 (SMS templates editable by every role; unthrottled test SMS; raw exception text in responses) · KL-PAYMENT-004 (part of an app key written to logs) · KL-SEC-004/005 (PII files and push registration outlive sign-out) · KL-SEC-006 (build-time config injection vector) |

### Defects confirmed by static evidence (device check still needed)

KL-ARCH-001, KL-BOOK-012, KL-WAIVER-001, KL-PKG-001, KL-PKG-002, KL-PKG-004, KL-PKG-018, KL-PRICE-001, KL-PRICE-002,
KL-PRICE-003, KL-PHOTO-001, KL-ADMIN-005, KL-PLAT-002, KL-PLAT-003, KL-UI-005.

## Cross-cutting: architecture and security

| ID | Title | Type | Evidence | Impact | Conf. | Verif. | Follow-up |
|---|---|---|---|---|---|---|---|
| KL-ARCH-001 | A wrong-password login triggers the global 401 teardown and never settles | Defect | `src/services/auth.ts` (`login` sends no token and is not `publicEndpoint`); `src/lib/api.ts` 401 branch (`isStaleSessionReply(undefined, …)` is false → `handleUnauthorized()` → `neverSettles`); `LoginForm.handleSubmit` (`finally` never runs); Backend `AuthController::login` returns 401 for bad credentials and for `customer` accounts | Login spinner hangs (the exact on-screen result still needs a device check); on the add-account path the live account is marked `signin_required` and its session cleared | H | SV, DVR | Treat login 401 as an ordinary error |
| KL-ARCH-002 | About 18 request paths bypass `apiRequest` | Debt | [api-layer §6](architecture/api-layer-and-data-flow.md) | Inconsistent timeout, 401 and error reporting; hung uploads | H | SV | Shared helpers for multipart and downloads |
| KL-ARCH-003 | `neverSettles` can leave submit locks and spinners set; one stuck page stalls `fetchAllPages` | Limitation | `src/lib/api.ts`, `src/lib/fetchAllPages.ts` | Stuck UI states | M | SV | Review callers |
| KL-ARCH-004 | `admin` role not modelled in Mobile types, navigation or location selector | Doc gap / Suspected | `src/services/auth.ts` (`UserRole`), `navConfig.ts`, `LocationWorkspaceSelector.tsx` | Admin users get the base UI with no location selector | M | SV | Confirm whether `admin` accounts exist |
| KL-ARCH-005 | TEMP auth-debug instrumentation still wired in (also KL-ADMIN-004, KL-UI-013) | Debt | `src/lib/debug/authDebug.ts` plus call sites in `_layout.tsx`, `session.ts`, `api.ts`, `AuthGuard`, `index.tsx`, `switch-account.tsx` | Noise and complexity (`__DEV__`-only) | H | SV | Remove after the loop fix is confirmed |
| KL-ARCH-006 | Duplicate of **KL-BOOK-006** | — | — | — | — | — | — |
| KL-ARCH-007 | Special-pricing cache not keyed by user (also KL-PRICE-008) | Suspected | `src/lib/hooks/useSpecialPricings.ts` | Previous account's rows may show after a switch | M | DVR | Add the user to the key |
| KL-ARCH-008 | No tests for session, api, accounts or `AuthGuard` | Test gap | — | Regressions undetected | H | SV | Unit tests |
| KL-SEC-001 | `SESSION_TTL_MS` is a TEMP 30 days (comments say 1 h); Home polling keeps sliding it | Security | `src/lib/session.ts`; `src/app/(tabs)/home.tsx` | The inactivity lock is effectively off | H | SV | Decide and restore the TTL |
| KL-SEC-002 | A saved account resumes without a password after the inactivity lock | Security | `session.ts` (`invalidateSession("expired")` keeps the token linked); `SavedAccountsStrip` | The lock is not a re-authentication | H | SV | Policy decision |
| KL-SEC-003 | `GET /api/mobile/locations` is public and returns every company's locations | Security | Backend `routes/api.php` (`mobile` prefix); `MobileAvailabilityController::getLocations` | Unauthenticated callers get every company's active locations (name, address, phone, email, timezone, logo): business contact data, not customer PII. Mobile pickers built on it (`fetchLocations`, `useLocationOptions`) are not company-filtered either, which matters if the deployment holds more than one company. | H | SV | Backend review |
| KL-SEC-004 | Files containing PII stay in the cache directory after sign-out | Security | `src/services/metricsCacheService.ts` (customer names); export and PDF files | Residual PII on the device | M | SV | Purge on sign-out |
| KL-SEC-005 | An involuntary teardown doesn't unregister push or revoke the token | Limitation | `session.ts` (`invalidateSession`); `pushDeviceService.ts` | Pushes can reach a signed-out device | M | SV | Best-effort unregister |
| KL-SEC-006 | Root JS configs run at bundle time; an obfuscated loader was injected before (also KL-PLAT-011) | Security | `tailwind.config.js` (clean at `973d281`); history up to `8c44904` | Supply-chain risk | M | SV | Diff guard or review step for root configs |

## Cross-cutting: UI, platform, testing, documentation, operations

| ID | Title | Type | Evidence | Impact | Conf. | Verif. | Follow-up |
|---|---|---|---|---|---|---|---|
| KL-UI-001 | Fixed `pt-12` headers instead of the safe-area top inset | Suspected | `ModuleHeader`, `ModuleHub`, `DashboardHeader`, `EmailComposerKit`, about 67 route files | Content under the notch or Dynamic Island on iOS | M | DVR | Inset-aware headers without changing Android spacing |
| KL-UI-002 | `BottomSheet` has no keyboard avoidance (also KL-BOOK-010, KL-WAIVER-013, KL-PRICE-005) | Suspected | `src/components/ui/BottomSheet.tsx` | Inputs hidden by the keyboard, especially on iOS | M | DVR | Fix centrally |
| KL-UI-003 | No numeric-keypad accessory (about 195 numeric `keyboardType`, 0 `InputAccessoryView`) | Limitation | Repository search | iOS number pads can't be dismissed | M | DVR | Add a Done accessory |
| KL-UI-004 | `Alert.alert` (768 uses) vs `useStatusModal` (6 files) | Debt | Repository search | Inconsistent feedback UX | H | SV | Migration plan |
| KL-UI-005 | Placeholder `navigation` tab screen with debug text, reachable by deep link | Defect | `src/app/(tabs)/navigation.tsx` | Stray screen | H | SV | Guard or redirect |
| KL-UI-006 | NativeWind crash when `shadow`, `dark:` or `active:` classes are added after mount | Limitation | Comments in `orders.tsx`, `manual-booking.tsx` and others | Runtime redbox | H | SV | Lint rule or documented pattern (remount via `key`) |
| KL-UI-007 | `flex-1` on `SkeletonBlock` collapses the bar | Limitation | `SkeletonBlock.tsx` | Broken skeletons | H | SV | Wrap in a `flex-1` view |
| KL-UI-008 | Montserrat applied by patching React Native `Text`/`TextInput` | Debt | `src/lib/fonts.ts` | Fragile across React Native upgrades | M | SV | Revisit |
| KL-UI-009 | No colour tokens; `bg-background` is a no-op; three icon systems | Debt | `tailwind.config.js`; repository search | Inconsistency | H | SV | Introduce tokens |
| KL-UI-010 | Modal sequencing relies on about 44 hard-coded timeouts | Debt | e.g. `manage-attractions.tsx`, `purchases.tsx` | Races on slow devices | M | DVR | Centralise |
| KL-UI-011 | Root prompt hosts may present over an open sheet | Suspected | `ChangeReasonHost`, `BlockedPeriodHost` in `_layout.tsx` | Prompt may not appear on iOS, leaving the save hanging | L–M | DVR | Device test |
| KL-UI-012 | Accessibility gaps: unlabelled `BottomSheet` close button, no font-scaling policy, 1 `testID` | Limitation | Repository search | Screen-reader and large-font issues | M | SV | Accessibility audit |
| KL-UI-013 | Duplicate of **KL-ARCH-005** | — | — | — | — | — | — |
| KL-PLAT-001 | No iOS bundle identifier, build number or tablet setting | Limitation | `app.json` `ios` | iOS builds not ready | H | SV | iOS spec |
| KL-PLAT-002 | iOS icon is the Expo template | Defect | `ios.icon` → `assets/expo.icon` | Wrong branding on iOS | H | SV | Replace |
| KL-PLAT-003 | Development profile expects `expo-dev-client`, which isn't installed | Defect | `eas.json`; no package | Development builds broken | H | SV | Add the package or change the profile |
| KL-PLAT-004 | EAS channels and the `appVersion` runtime are shared across platforms | Suspected | `eas.json`, `app.json` | Android OTAs would reach iOS builds | M | Inf | Platform-scoped publishing decision |
| KL-PLAT-005 | Forced update on iOS has no install path (also KL-UPDATE-001) | Suspected | `appUpdateInstaller.ts` (`launchApkInstaller`); Backend accepts `ios` | iOS users locked out if an `ios` version row is activated | M | Inf | Store path, or keep iOS rows inactive |
| KL-PLAT-006 | A native change without a version bump shares the runtime | Limitation | `appVersion` policy | An OTA could crash an older binary | M | Inf | Release checklist |
| KL-PLAT-007 | Image-picker plugin not listed; iOS photo usage string set implicitly | Suspected | `app.json` plugins | App Review or runtime prompt issues | M | DVR | Verify `Info.plist` |
| KL-PLAT-008 | Two file-system APIs (legacy and new) | Debt | `metricsCacheService.ts` vs about 25 legacy uses | Maintenance cost | H | SV | Consolidate |
| KL-PLAT-009 | Installed but unused native packages (blur, glass-effect, symbols, system-ui, linking) | Debt | No imports in `src/` | Binary size | H | SV | Review |
| KL-PLAT-010 | iOS push (APNs) not configured or verified | Limitation | Plugin has no options; credentials NA | No iOS push | M | NA | EAS credentials |
| KL-PLAT-011 | Duplicate of **KL-SEC-006** | — | — | — | — | — | — |
| KL-TEST-001 | No CI | Test gap | No `.github/` | Regressions unchecked | H | SV | Add CI |
| KL-TEST-002 | No screen, component, hook or service tests | Test gap | 0 tests outside `src/lib` | UI wiring untested | H | SV | Prioritise risk areas |
| KL-TEST-003 | Node version not pinned (tests rely on TypeScript type-stripping) | Test gap | `package.json` (no `engines`, no `.nvmrc`) | Tests may fail on older Node | M | Inf | Pin Node |
| KL-TEST-004 | No type-check script; Prettier plugin but no config | Test gap | `.vscode/settings.json`, `package.json` | Not enforced | H | SV | Add scripts |
| KL-TEST-005 | No device or manual QA record | Test gap | — | Device behaviour unverified | H | SV | QA checklist |
| KL-DOC-001 | Root `README.md` is create-expo-app boilerplate (mentions a missing `reset-project` script) | Doc gap | `README.md` | Misleading onboarding | H | SV | Rewrite (outside `docs/`) |
| KL-DOC-002 | Stale comments (e.g. `AppUpdateGate` says the FAB is in the root shell; `ScreenEnter` refers to a rule no longer in `navMotion.ts`) | Doc gap | Those files | Misleading | H | SV | Fix comments |
| KL-DOC-003 | Pre-baseline docs contradicted the code (read-only scope, outdated progress) | Doc gap | `docs/MOBILE_APP_OVERVIEW.md`, `docs/MOBILE_APP_PROGRESS.md` | Wrong assumptions | H | SV | **Mitigated:** status banners added; superseded by this baseline |
| KL-DOC-004 | Conventions known to developers were not written down in the repository | Doc gap | — | Knowledge silo | M | Inf | Partly addressed by [DEVELOPMENT_GUIDELINES.md](DEVELOPMENT_GUIDELINES.md) |
| KL-DOC-005 | Generated reference overviews of Backend and Web Admin are 5 months old, with no recorded revision | Doc gap | `docs/reference/*` | Stale contract information | H | SV | Banners added; treat as snapshots |
| KL-DOC-006 | A pre-existing reference snapshot names a deployed Backend host URL | Doc gap | `docs/reference/FRONTEND_OVERVIEW.md` (Environment notes) | Infrastructure detail in shared docs; not a secret | H | SV | Owner decision: redact in a docs-cleanup commit |
| KL-OPS-001 | Historical note says testing was limited because the app used a live production database; the current target environment is unknown | Limitation | `docs/MOBILE_APP_PROGRESS.md`; `EXPO_PUBLIC_API_URL` baked in at bundle time with no in-app switch | Testing mutations risks production data | M | Inf | Confirm environments; define a safe test target |

## Bookings and scheduling

| ID | Title | Type | Evidence | Impact | Conf. | Verif. | Follow-up |
|---|---|---|---|---|---|---|---|
| KL-BOOK-001 | Three different check-in gates | Parity gap | `BookingsTable` and `BookingActionsSheet` (`canCheckIn`), `BookingDetailSheet`; `BookingController::checkIn` | Table offers check-in that the server refuses (400) | H | SV | Decide one rule |
| KL-BOOK-002 | Full list capped at 100 pages (10,000 bookings) | Limitation | `bookingsService.ts` (`SYNC_MAX_PAGES`); Web uses 5000 pages | Older bookings missing; incremental sync disabled | H | SV | Raise the cap or re-page |
| KL-BOOK-003 | `/status` can set checked-in from any status | Suspected (policy) | `BookingController::updateStatus` (accepts `checked-in` from any status; sets `checked_in_at` only). Reachable from Mobile's per-row Set Status sheet (`bookings.tsx` `ROW_STATUS_OPTIONS` → `updateBookingStatus`). Bulk "checked-in" routes through `/check-in` instead (`bulkSetBookingStatus`). | Bypasses the confirmed-only rule; `checked_in_by` not set | H | SV | Decide whether Set Status is an intended override; otherwise align with `/check-in` |
| KL-BOOK-004 | Change reason requested only after a 422 round trip | Debt | `api.ts` (`apiRequest`) | Extra request; relies on the root prompt host | M | SV | Low priority |
| KL-BOOK-005 | Booking cache is in memory only | Limitation | `bookingListCache.ts` | Full re-download on every cold start | H | SV | Consider persisting |
| KL-BOOK-006 | Export, report, import and deleted view ignore the active location | Parity gap | `bookings.tsx` (`scopeLocationId`; `deletedScoped` matches by name) | Company admin exports every location | H | SV | Use `activeLocationId` |
| KL-BOOK-007 | "Package Bookings" KPI always equals Total | Limitation | `bookings.tsx` KPIs | Misleading figure | H | SV | Fix or remove |
| KL-BOOK-008 | Edit can't quote or edit custom-package terms | Parity gap | `edit-booking.tsx` | Custom bookings can't be repriced on Mobile | M | SV | Compare with Web `EditBooking` |
| KL-BOOK-009 | Manual Booking charges its own computed amount, not the server-saved due | Suspected | `manual-booking.tsx` (`paidNow`) vs `create-booking.tsx` (`serverDue`) | Possible over-charge or over-record | M | SV | Use server amounts |
| KL-BOOK-010 | Duplicate of **KL-UI-002** / **KL-UI-011** | — | — | — | — | — | — |
| KL-BOOK-011 | `skip_date_validation` / `is_manual_entry` are unused by the Backend | Parity gap | Backend search | Flexible mode bypasses nothing server-side | H | SV | Clarify intent |
| KL-BOOK-012 | Location-request review shown to destination staff; Backend allows company admin only | Defect | `location-requests.tsx` (`canReview`); `LocationChangeRequestController::approve`/`reject` | 403 for destination managers | H | SV | Align UI or Backend |
| KL-BOOK-013 | Space Schedule day cache not cleared by booking changes | Suspected | `useSpaceSchedule.ts` | Up to 5 minutes stale | M | SV | Clear in `markBookingsStale` |
| KL-BOOK-014 | Backend `admin` role can manage blocks; Mobile can't | Parity gap | `day-offs.tsx` (`canManage`); route middleware | Minor | M | SV | See KL-ARCH-004 |
| KL-BOOK-015 | Stale "no date-range filter" comment | Doc gap | `bookingsService.ts` | Misleads developers | H | SV | Fix the comment |
| KL-BOOK-016 | No tests for screens, the cache module, or the reason/blocked retry | Test gap | — | Regressions | H | SV | Unit tests |
| KL-BOOK-017 | Staff totals not enforced under default configuration (also KL-ATTR-007) | Security | `CheckoutTotalGuard::check`; `config/checkout.php` | A staff client can save any price | M | SV | Review deployed config |

## Attractions, events and check-in

| ID | Title | Type | Evidence | Impact | Conf. | Verif. | Follow-up |
|---|---|---|---|---|---|---|---|
| KL-ATTR-001 | Bulk or row "checked-in" uses a generic `PUT`, not the check-in endpoint (Web does the same) | Suspected | `purchases.tsx` (`runBulkStatus`); `AttractionPurchaseController::update` vs `checkIn` | No audit fields; waivers not checked in; unpaid tickets not refused | H | SV | Route through check-in |
| KL-ATTR-002 | Parallel bulk status/delete reports a single error | Limitation | `purchases.tsx` | Partial changes with an unclear result | M | SV | Report per item |
| KL-ATTR-003 | Deleted-purchases view is read-only (Web can restore) | Parity gap | Web `handleBulkRestore` | Must use Web | H | SV | Port restore |
| KL-ATTR-004 | Copied links fall back to the API host if `EXPO_PUBLIC_WEB_URL` is unset | Limitation | `src/lib/api.ts` (`webUrl`) | Broken links | M | SV | Require the variable |
| KL-ATTR-005 | Duplicating with no location sends `location_id: 0` | Suspected | `duplicateAttraction` | Server rejects | M | SV | Guard |
| KL-ATTR-006 | Gift-card fields on staff checkouts have no Web staff equivalent | Parity gap | Staff checkout screens | Intentional (owner's call, per notes) | H | SV | Confirm |
| KL-ATTR-007 | Duplicate of **KL-BOOK-017** | — | — | — | — | — | — |
| KL-ATTR-008 | Full-list downloads stop silently at fixed caps (2k attractions, 20k purchases, 10k orders) | Limitation | Services | Silent truncation | L | SV | Surface the truncation |
| KL-EVENT-001 | Empty or failed slot list falls back to the raw schedule without counts | Suspected | `events/create-purchase.tsx` (`loadTimeSlots`) | Staff pick a full slot; server refuses with 422 | M | SV | Distinguish sold-out from error |
| KL-EVENT-002 | Backend counts booked tickets by exact date-string match | Debt | `Event::getBookedTicketsBySlot` | Correct only while Mobile sends Y-m-d | H | SV | Normalise server-side |
| KL-EVENT-003 | Event check-in refusals exist only in the clients; bulk status bypasses them | Suspected | `EventPurchaseController::updateStatus` | Re-check-in or completed/cancelled check-in possible | H | SV | Server rules |
| KL-EVENT-004 | Tickets with a balance owed can be checked in (matches Web) | Limitation | Check-in logic | Business question | H | SV | Product decision |
| KL-EVENT-005 | QR falls back to `event-purchase-{id}`, which the desk doesn't recognise | Suspected | `EventPurchaseQRSheet` | Unscannable QR | M | SV | Align the formats |
| KL-EVENT-006 | `GET /event-purchases` ignores page size | Limitation | Backend controller | Large downloads | H | SV | Server paging |
| KL-EVENT-007 | Deleted event purchases view has no restore | Parity gap | — | Must use Web | H | SV | Port |
| KL-EVENT-008 | Registration screens not role-guarded on deep links; `admin` hidden on Mobile | Limitation | Registration routes | 403s | M | SV | Self-guard screens |
| KL-EVENT-009 | `GET /api/events` is public; no company scope when unauthenticated | Security | Backend route | May list every company's events | M | SV | Backend review |
| KL-CHECKIN-001 | Confirmed ticket with a balance due can be approved after a warning; server doesn't check | Suspected | Check-in desk; Backend | Unpaid admissions | M | SV | Policy decision |
| KL-CHECKIN-002 | An attraction ticket that's a bulk-order line can be checked in on its own | Limitation | Attraction check-in endpoint | Order state drift | H | SV | Align with events |
| KL-CHECKIN-003 | Membership check-in falls back to the home location or refuses | Limitation | Check-in desk | Desk friction | H | SV | — |
| KL-CHECKIN-004 | QR decode from image and camera permissions unverified on devices | Limitation | `scanFromURLAsync`, `QrScannerView` | — | — | DVR | Device test |
| KL-CHECKIN-005 | No tests for `useEntityCheckIn` or the approve gate | Test gap | — | — | H | SV | Tests |

## Packages and pricing

| ID | Title | Type | Evidence | Impact | Conf. | Verif. | Follow-up |
|---|---|---|---|---|---|---|---|
| KL-PKG-001 | Add-on image sent as an array; Backend requires a string | Defect | `add-ons.tsx` (`saveForm`); `AddOnController::store/update` | Image save fails | H | SV, DVR | Send a string |
| KL-PKG-002 | Bulk promo payload uses the wrong keys | Defect | `promos.tsx` (`submitBulk`); `PromoController::generateBulk` | Bulk generation always rejected | H | SV, DVR | Align keys |
| KL-PKG-003 | `display_order: null` sent into a NOT NULL column | Suspected | `create-packages.tsx`, `edit-packages.tsx`; migration; `UpdatePackageRequest` | Saves may fail or reset order | M | SV, DVR | Send a number |
| KL-PKG-004 | Edit can't clear all schedules but reports success | Defect / Parity gap | `edit-packages.tsx` (`handleSubmit`) | Old schedules stay live | H | SV, DVR | Send the empty list |
| KL-PKG-005 | Interval over 240 min passes Mobile, fails the server | Limitation | `StorePackageAvailabilityScheduleRequest` | "Partly saved" | H | SV | Client max check |
| KL-PKG-006 | Promo and gift-card IDs in the package payload are dropped by the server | Debt | Store/Update requests | None | H | SV | Remove |
| KL-PKG-007 | Package location filter matches by name, not ID | Debt | `packages.tsx` | Same-name locations merge | L | SV | Use the ID |
| KL-PKG-008 | "Cannot be undone" copy, but delete is soft; no restore on Mobile | Doc gap | `PackageController::destroy` | Misleads staff | H | SV | Fix copy |
| KL-PKG-009 | Reorder, bulk min-notice and trash are Web-only | Parity gap | Web `Packages.tsx` | Must use Web | H | SV | Product call |
| KL-PKG-010 | Duplicate skips schedules and the escape-room flag | Limitation | `duplicatePackage` | Copy not bookable until scheduled | M | SV | — |
| KL-PKG-011 | `create-custom-packages.tsx` is a placeholder stub | Debt | File | Dead route | H | SV | Remove or implement |
| KL-PKG-012 | Forced add-ons lack per-package pricing; blank price saves $0 | Parity gap | Web `AddOns.tsx` | Forced flag has no effect | H | SV | Add fields |
| KL-PKG-013 | No add-on import | Parity gap | Web `AddOns.tsx` | Low | M | SV | — |
| KL-PKG-014 | Space list never sends `include_unavailable` | Suspected | `fetchSpaceList`; `RoomController::index` | Inactive filter empty; disabled spaces vanish | M | SV, DVR | Verify |
| KL-PKG-015 | Area-group update is per-room PUTs; no bulk space delete | Debt / Parity gap | `updateAreaGroupInterval` | Partial updates | H | SV | Use the area-group endpoint |
| KL-PKG-016 | No gift-card edit/deactivate/reactivate; Balance field ignored by server | Parity gap | Web `GiftCard.tsx`; `GiftCardController::store` | Must use Web | H | SV | Add actions |
| KL-PKG-017 | Gift-card sale sends no `checkout_key`; limits 10–500 hard-coded | Limitation | `sellGiftCard.ts`; `config/gift_cards.php` | Config drift; duplicate sale risk | M | SV | — |
| KL-PKG-018 | Promo batch list reads the wrong fields; no batch actions | Defect / Parity gap | `fetchPromoBatches`; `listBatches` | Always shows "0 used" | H | SV | Fix mapping |
| KL-PKG-019 | Edit rejects a same-day promo window that the server allows | Limitation | `submitEdit` | Minor | M | SV | — |
| KL-PKG-020 | Global note display order not editable | Parity gap | Web `GlobalNotes.tsx` | Ordering is Web-only | M | SV | — |
| KL-PKG-021 | Global notes have no tenant scope | Security | `GlobalNoteController` (no scoping or role checks; `staff` middleware only); the `global_notes` table has **no `company_id` or `location_id` column** (migration `2026_01_26_171705`) | Install-wide notes: any staff role in any company, attendants included, can read, create, edit and delete every note. Real exposure depends on whether more than one company shares the deployment. | H | SV | Security review (schema change needed) |
| KL-PKG-022 | Gift-card delete unscoped; create doesn't scope locations; client sets `created_by` | Security | `GiftCardController` | Cross-tenant changes | M | SV | Review |
| KL-PKG-023 | No ownership check on promo update/delete/toggle; `listBatches` unscoped | Security | `PromoController` | Cross-tenant | M | SV | Review |
| KL-PKG-024 | `GET /api/mobile/packages` lacks `staff` middleware | Security | `routes/api.php`; `MobilePackageController` | A non-staff token may list every company's packages | M | SV | Add `staff` |
| KL-PRICE-001 | Special-pricing create omits the required `company_id` | Defect | `create-special-pricing.tsx`; `SpecialPricingController::store` | Every Mobile create rejected | H | SV, DVR | Add the field |
| KL-PRICE-002 | No one-time date or monthly-day picker | Defect / Parity gap | Same | One-time and monthly creates rejected | H | SV, DVR | Add pickers |
| KL-PRICE-003 | Fee create omits the required `company_id` | Defect | `create-fee-support.tsx`; `FeeSupportController::store` | Every Mobile create rejected | H | SV, DVR | Add the field |
| KL-PRICE-004 | Special-pricing and fee lists load only the first 100 rows | Limitation | Services (`PER_PAGE`) | Silent truncation | M | SV | Paginate |
| KL-PRICE-005 | Duplicate of **KL-UI-002** | — | — | — | — | — | — |
| KL-PRICE-006 | No special-pricing bulk delete | Parity gap | Web `SpecialPricings.tsx` | Low | M | SV | — |
| KL-PRICE-007 | Server enforcement of charged totals not checked here (see KL-BOOK-017) | Test gap | — | Unknown | M | NA | — |
| KL-PRICE-008 | Duplicate of **KL-ARCH-007** | — | — | — | — | — | — |
| KL-PRICE-010 | Special-pricing writes not tenant-scoped; client chooses `company_id` | Security | `SpecialPricingController` | Cross-tenant edits | H | SV | Review |
| KL-PRICE-011 | Fee-support update not scoped (delete/toggle partly) | Security | `FeeSupportController` | Cross-tenant | M | SV | Review |

`KL-PRICE-009` was not assigned.

## Customers, waivers and memberships

| ID | Title | Type | Evidence | Impact | Conf. | Verif. | Follow-up |
|---|---|---|---|---|---|---|---|
| KL-CUST-001 | Some analytics KPIs ignore the date range | Limitation | `CustomerController::analytics` | KPIs may mislead | H | SV | Label the windows |
| KL-CUST-002 | Analytics scope derived from a client-sent `user_id` | Security | `CustomerController::analytics` (`$request->get('user_id') ?? auth()->id()` then `User::find`; unlike `ScopesByAuthUser::resolveAuthUser`, nothing checks the id against the bearer token) | Staff may widen their scope | M | SV | Backend review |
| KL-CUST-003 | No company filter for an unscoped company admin | Security | Same; no model global scopes | Possible cross-company totals | L–M | SV | Backend review |
| KL-CUST-004 | Loads every contact (up to 100k) onto the device | Debt | `fetchAllContacts` | Memory and speed | M | SV | Server-side paging |
| KL-CUST-005 | Customers list ignores the global active location | Parity gap | `customers.tsx` | Scope mismatch | L–M | SV | Confirm intent with Web |
| KL-CUST-006 | Any staff role can permanently delete contacts; no UI gate | Suspected | `ContactController::destroy` (no soft deletes) | Data loss | M | SV | Product decision |
| KL-CUST-007 | Concern PUT response lacks `completed_booking` (handled on the client) | Debt | `CheckoutConcernController::update` | Workaround needed | H | SV | Return the field |
| KL-CUST-008 | `customers/search` has no company scoping | Security | `CustomerController::search` | Cross-tenant lookups | L | SV | Backend review |
| KL-CUST-009 | Bulk delete fires parallel single DELETEs; partial failures not reported | Debt | `customers.tsx` | Unclear outcome | H | SV | Use `/contacts/bulk-delete` |
| KL-CUST-010 | No service, hook or screen tests | Test gap | — | — | H | SV | Tests |
| KL-WAIVER-001 | Records location filter runs client-side on the current page only | Defect / Parity gap | `waivers.tsx` (`displayed`); Backend `applyLocationScope`; Web sends `location_id` | Wrong rows and counts | H | SV | Send `location_id` |
| KL-WAIVER-002 | CSV export of PII not gated by role or the export setting (Web the same) | Security | `exportCsv`, `guardPrintExport` | PII exfiltration | M–H | SV | Gate it, or use the server export |
| KL-WAIVER-003 | `admin_delete_enabled` enforced only in the UI | Limitation (security-adjacent) | `WaiverController::destroy` (`guardAdmin`: `company_admin`/`admin` only; the setting is never read); `WaiverSettingController::update` (admin-only) | An admin calling the API directly can delete while the company toggle is off. Low impact: only admins can delete, and only admins can change the toggle. *Reclassified from Security in the 2026-11-26 review.* | H | SV | Enforce server-side, or document it as a UI preference |
| KL-WAIVER-004 | Deletion Log shown to roles the server refuses | Limitation | `deletionLog` | 403 UX | H | SV | Hide by role and setting |
| KL-WAIVER-005 | `reports/deleted` returns deletion snapshots (name, email, phone) to any staff | Security | `WaiverReportController` | PII exposure | H | SV | Align with deletion-log rules |
| KL-WAIVER-006 | Kiosk ignores the inactivity-timeout, autofill and GPS settings | Parity gap / Suspected | `kioskContract.ts`; `kiosk.tsx` | PII stays on screen | H | SV | Implement the timeout |
| KL-WAIVER-007 | No kiosk lock-down or keep-awake; exit is press-and-hold without a PIN | Limitation | `StaffReturnControl` | Kiosk escape | M | DVR | Guided Access or pinning guidance |
| KL-WAIVER-008 | Records check-in limited to admin/manager; server allows any staff | Parity gap | `canCheckIn`; `checkIn` | Inconsistent | M | SV | Decide |
| KL-WAIVER-009 | Chaperone and group signing pages are Web-only | Limitation | `chaperoneLink.ts` | — | H | SV | Document |
| KL-WAIVER-010 | Walk-in kiosk endpoints are public, keyed by template ID (throttled) | Security | `routes/api.php` | Design review | L | SV | Review |
| KL-WAIVER-011 | `by-escape-room` and `ad-performance` reports missing on Mobile | Parity gap | `reports.tsx` | — | M | SV | Confirm with Web |
| KL-WAIVER-012 | Template force delete admin-only on Mobile; permitted managers allowed on server | Parity gap | `templates.tsx` | — | H | SV | Decide |
| KL-WAIVER-013 | Duplicate of **KL-UI-002** | — | — | — | — | — | — |
| KL-MEMBER-001 | Actions shown to roles the server refuses | Limitation | No role checks; `MembershipController` | Attendants get 403s | H | SV | Gate the UI |
| KL-MEMBER-002 | `show`, `updateStatus`, `extend`, `destroy`, `uploadPhoto` and `addNote` lack a scope check | Security | `MembershipController` | Cross-tenant | M | SV | Backend review |
| KL-MEMBER-003 | Reports don't use the active location | Parity gap | `membership-reports.tsx` | Wrong scope | H | SV | Pass `location_id` |
| KL-MEMBER-004 | No CSV export (Web has one) | Parity gap | Web `Memberships.tsx` | Must use Web | H | SV | Port |
| KL-MEMBER-005 | Add Member needs an existing customer; Backend accepts a new name | Limitation | `MembershipController::store` | Friction | H | SV | Decide |
| KL-MEMBER-006 | `admin` role excluded from status/extend on the server | Suspected | `MembershipController` | Role inconsistency | M | SV | Backend review |
| KL-MEMBER-007 | Bulk actions don't report partial failures | Debt | `memberships.tsx` | Unclear outcome | H | SV | Report per item |

## Photos, communications and notifications

| ID | Title | Type | Evidence | Impact | Conf. | Verif. | Follow-up |
|---|---|---|---|---|---|---|---|
| KL-PHOTO-001 | Delivery Log shows only the first 30 rows | Defect | `fetchPhotoDeliveryLog` (no page); `PhotoDeliveryController::index` paginates | Older sends hidden | H | SV | Add paging |
| KL-PHOTO-002 | Guest escape-room kiosk has no back or swipe lock | Security | `escape-room-kiosk.tsx` | Guest can reach the signed-in staff app | M | DVR | Block back and gestures |
| KL-PHOTO-003 | Slideshow release-confirmation exists only in the game view | Parity gap | `library.tsx` (`toggleSlideshow`); `SlideshowQueueController` | Plain error on 409 | M | SV | Add the confirm flow |
| KL-PHOTO-004 | No slideshow approve/reject | Parity gap | Web `PhotoService` | Approvals are Web-only | H | SV | Port |
| KL-PHOTO-005 | Bulk save is sequential; no zip download | Limitation | `downloadSelected` | Slow; partial saves | M | SV | Zip endpoint |
| KL-PHOTO-006 | iOS photo-library permission text mentions only QR codes | Doc gap | `app.json` (expo-media-library strings) | App Review or user confusion | M | DVR | Reword |
| KL-PHOTO-007 | 4K photo held in memory as base64 | Suspected | `takePhoto` (`base64: true`) | Memory and upload pressure | M | DVR | Profile on low-end devices |
| KL-PHOTO-008 | Multipart uploads bypass `apiRequest` (instance of KL-ARCH-002) | Debt | `uploadSessionPhoto`, `postOverlayForm` | No timeout or 401 teardown | H | SV | Shared client |
| KL-PHOTO-009 | HEIC handling relies on the picker re-encoding | Suspected | `uploadPhoto`; Backend MIME list | Rejected uploads | L | DVR | Test with an iPhone |
| KL-PHOTO-010 | iOS landscape shots may save as portrait (`responsiveOrientationWhenOrientationLocked` unset) | Suspected | `PhotoCameraView.tsx` | Wrong frame version | M | DVR | Device test |
| KL-PHOTO-011 | Role lists omit `admin` on Mobile | Debt | `photos.tsx`, `settings.tsx`, `custom-fields.tsx` | `admin` blocked from screens the server allows | M | SV | Align (see KL-ARCH-004) |
| KL-PHOTO-012 | iOS swipe pops Escape Rooms instead of closing the open game | Limitation | `escape-rooms.tsx` (Android `BackHandler`) | UX difference | M | DVR | Review |
| KL-PHOTO-013 | Delivery-log mapper accepts many field-name guesses | Debt | `mapDeliveryLogRow` | Fragile | H | SV | Type it |
| KL-PHOTO-014 | Reports rendered generically | Debt | `fetchPhotoReport` | Drifts with server changes | M | SV | Typed reports |
| KL-PHOTO-015 | Only pure helpers are tested | Test gap | — | — | H | SV | Service and hook tests |
| KL-COMMS-001 | Create Campaign lacks template, location, send-test, images and attachments | Parity gap | Web `CreateEmailCampaign.tsx` vs `create-campaign.tsx` | Web-only features | H | SV | Port |
| KL-COMMS-002 | Mobile never sends a campaign location | Limitation | `campaignRecipientBody` | Company-admin campaigns always company-wide | H | SV | Send the active location |
| KL-COMMS-003 | Any staff role (including attendants) can edit company SMS templates | Security | `SmsNotificationController::authorizeCompany` | Company-wide changes | M | SV | Product decision |
| KL-COMMS-004 | SMS send-test has no throttle | Security | `routes/api.php`; `sendTest` | Cost and abuse | M | SV | Throttle |
| KL-COMMS-005 | Raw exception text in API responses | Security | `EmailCampaignController::store`, `SmsNotificationController::sendTest` | Information disclosure | M | SV | Generic messages |
| KL-COMMS-006 | Custom Fields visible to attendants (Web hides it) | Parity gap | `navMenuItems.ts`; Web sidebar | Minor | H | SV | Decide |
| KL-COMMS-007 | No custom-fields tests | Test gap | — | — | H | SV | Tests |
| KL-NOTIF-001 | Mark all read / Clear all use the home location; silent no-op without one | Suspected | `useNotifications` | No effect for some company admins | M | SV | Use the active location; show feedback |
| KL-NOTIF-002 | Read state shared per location, not per user | Limitation | `NotificationController::markAsRead` | One user's action affects all | H | SV | Confirm intent |
| KL-NOTIF-003 | Search covers the loaded page only | Limitation | `notification.tsx` | Missed rows | H | SV | Server search |
| KL-NOTIF-004 | Badges cost 4 requests; failures show 0 | Debt | `fetchNotificationCounts` | Load; misleading badges | H | SV | Count endpoint |
| KL-NOTIF-005 | Purchase filter differs (`payment` vs `purchase`) | Parity gap | Web `Notifications.tsx`; `fetchNotifications` | Counts differ | M | SV | Align |

## Dashboard, administration, analytics, payments and app update

| ID | Title | Type | Evidence | Impact | Conf. | Verif. | Follow-up |
|---|---|---|---|---|---|---|---|
| KL-ADMIN-001 | Location tab always empty for attendants | Parity gap | `navConfig.getRoleTabs`; `MetricsController::dashboard` | Dead tab | H | SV | Hide, or source the data |
| KL-ADMIN-002 | Home title says "Company Dashboard" for every role | Limitation | `home.tsx` | Wording | H | SV | Role-specific title |
| KL-ADMIN-003 | Forgot password and Remember me are non-functional | Parity gap | `LoginForm.tsx` | No password recovery | H | SV | Implement or remove |
| KL-ADMIN-004 | Duplicate of **KL-ARCH-005** | — | — | — | — | — | — |
| KL-ADMIN-005 | Company form shown to all roles | Defect | `edit-profile.tsx`; company update route; Web `CompanyAdminProfile` | Attendants get a 403 after personal data saves; managers can edit company details Web reserves for admins | H | SV | Gate by role |
| KL-ADMIN-006 | Override PIN accepts 4–6 digits; server requires the exact configured length | Suspected | `overridePin.validateOverridePin`; `StaffPinService::pinRule` | 422 on short PINs | H | SV | Use the server length |
| KL-ADMIN-007 | User-management screens rely on menu gating only | Limitation | Hub, `manage-accounts` | 403s on deep links | M | SV | Self-guard screens |
| KL-ADMIN-008 | Staff load-all stops at 20 pages × 100 | Limitation | `fetchAllStaffUsers`, `fetchAllPages` | Silent truncation | M | SV | Surface it |
| KL-ADMIN-009 | Can't set up a shared PIN terminal on Mobile (Web can) | Parity gap | Web `StaffPins.tsx` | Missing feature | H | SV | Decide scope |
| KL-ADMIN-010 | Backend users list scopes managers by home location | Suspected | `UserController::index` | Possible over- or under-listing | L | SV | Backend review |
| KL-ANALYTICS-001 | Custom-range dashboard cache ignores the dates | Suspected | `metricsCacheService.getCacheKey` | Shows another range's data | H | SV | Include dates in the key |
| KL-ANALYTICS-002 | Company-admin metrics not company-filtered; `location_id` not validated | Security | `MetricsController::buildScopedPayload`, `getLocationStats` | Cross-tenant exposure if multi-company | M | SV | Security review |
| KL-ANALYTICS-003 | "Today" uses the device timezone for metrics but the venue day for New Bookings | Suspected | `metricsService`, `dashboardTimeframe` | Numbers disagree | M | SV | Align |
| KL-ANALYTICS-004 | Attendants see the company Performance Analytics UI | Parity gap | `performance-analytics.tsx` | Confusing (data server-narrowed) | M | SV | Confirm intent |
| KL-PAYMENT-001 | Can't disconnect another location's Authorize.Net account from Mobile | Parity gap | `authorizeNetService` vs Backend `destroy` | Missing capability | H | SV | Use the per-account delete |
| KL-PAYMENT-002 | Authorize.Net all-accounts list not company-scoped | Security | `AuthorizeNetAccountController::allAccounts` | Metadata leak (no secrets) | M–H | SV | Company scope |
| KL-PAYMENT-003 | Restore and permanent delete offered to all roles | Limitation | `deleted-payments.tsx` | 403s for attendants | M | SV | Gate the UI |
| KL-PAYMENT-004 | Backend public-key error log records part of the application key | Security | `getPublicKey` | Secret material in logs | H | SV | Remove |
| KL-PAYMENT-005 | Void eligibility uses a device-clock "2 days = settled" guess | Limitation | `canVoid` | Wrong action offered | H | SV | Server-side flag |
| KL-PAYMENT-006 | Charge handler internals not reviewed (public `POST /api/payments/charge`) | Doc gap | `PaymentController` | Unknown idempotency and authorisation | — | NA | Dedicated review |
| KL-UPDATE-001 | Duplicate of **KL-PLAT-005** | — | — | — | — | — | — |
| KL-UPDATE-002 | Block-vs-prompt verdict (`evaluateUpdateStatus`) untested | Test gap | `appUpdateService.ts` | Regressions | H | SV | Tests |
| KL-UPDATE-003 | APK integrity is HTTPS + size + ZIP header only; no checksum | Limitation | `apkFileProblem` | Relies on the Android signature | M | SV | Checksum |
