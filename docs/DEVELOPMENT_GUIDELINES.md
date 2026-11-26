# ZapZone Mobile — Development Guidelines (Existing Practice)

> **Purpose:** Records the development conventions **already used** in ZapZone Mobile, so both developers and AI
> assistants can follow them, and separates them from inconsistencies and from proposals.
> **Status:** Baseline (descriptive). **Nothing here is a new mandatory policy.** Mandatory principles are in the
> ratified constitution (`.specify/memory/constitution.md`, v1.0.0, 2026-11-26). Items marked **Proposed** stay
> proposals unless the constitution adopts them.
> **Last reviewed:** 2026-11-26
> **Inspected revisions:** Mobile `973d281`
> **Scope & limitations:** Derived from static inspection, including search-based counts. Lint, type-check and
> tests were not run.
> **Related:** [Index](README.md) · [Architecture](ARCHITECTURE.md) ·
> [UI, navigation & styling](architecture/ui-navigation-and-styling.md) ·
> [Testing & quality](architecture/testing-and-quality.md) · [Known limitations](KNOWN_LIMITATIONS.md)

**Labels used below**

| Label | Meaning |
|---|---|
| **Established** | Clearly followed in the code. |
| **Explicit** | An existing written developer instruction. |
| **Inconsistent** | Mixed practice; don't assume either variant is the rule. |
| **Proposed** | A recommendation that **requires approval** (a constitution amendment or a separate decision). |

## 1. Development environment

- **Established:**
  - two developers on Windows (PowerShell), VS Code and Claude Code;
  - npm with `package-lock.json` (v3);
  - Expo SDK 55.
  - Builds and OTA updates go through EAS cloud. There are no native `ios/` or `android/` folders; they're
    generated, and gitignored.
- **Explicit:** `CLAUDE.md` → `AGENTS.md`: *read the exact versioned Expo docs
  (https://docs.expo.dev/versions/v55.0.0/) before writing code.*
- **Explicit:** `.vscode/settings.json` sets the workspace TypeScript SDK, hides `node_modules` from the editor, and
  notes that `npx tsc --noEmit` is the type-check.
- **Inconsistent:** the Node version isn't pinned (no `engines`, no `.nvmrc`). `npm test` relies on Node's built-in
  TypeScript type-stripping (`KL-TEST-003`).
- **Security practice (Established since the injection incident):** root JS configs (`tailwind.config.js`,
  `babel.config.js`, `metro.config.js`, `eslint.config.js`) run during every bundle or build. Review any diff to them
  before running Metro, Expo or EAS (`KL-SEC-006`).

### Repository layout and cross-repository references

**Shared rules (apply to every developer):**

- Clone the three repositories as siblings under one parent folder of your choice. Use these exact folder names:

  | Repository | Folder | Origin |
  |---|---|---|
  | Mobile | `zapzone-analytics-app` | `github.com/rlndcsr/zapzone-analytics-app` |
  | Web Admin | `zappoint` | `github.com/webmaster-big/zappoint` |
  | Backend | `zapzone-backend` | `github.com/webmaster-big/zapzone-backend` |

- Shared instructions (`AGENTS.md`) refer to the reference repositories as `../zappoint` and
  `../zapzone-backend`. These paths are resolved from the **Mobile repository root**, not from the terminal's
  current directory. Documentation cites them by name and commit (`zappoint@<sha>:<path>`), never by an absolute
  path.
- No committed file may contain a developer's absolute path.
- If your layout differs, don't edit shared files. Do one of the following instead:
  - tell Claude the location at the start of the session; or
  - record it in your personal `~/.claude/CLAUDE.md`, which lives outside the repository.
- To give Claude Code read access to the sibling repositories, use `/add-dir` or
  `permissions.additionalDirectories` in `.claude/settings.local.json`. That file is git-ignored by the `.claude/*`
  rule.
- Don't use `CLAUDE.local.md` for this: this repository's `.gitignore` does not exclude it.

**Developer environments (examples, not configuration):**

| Developer | Parent folder | Status |
|---|---|---|
| Orlando | `C:\Users\Orlando\OneDrive\Documents\ZapZone` | All three repositories confirmed at the folder names above (2026-11-26) |
| Co-developer | `C:\Users\User\Code\zapzone` | Parent folder confirmed by the team; repository folder names **assumed** to match, not verified |

## 2. Repository organisation

| Location | Convention (Established) |
|---|---|
| `src/app/<module>/` | Kebab-case route files, one folder per module, usually a `<module>-hub.tsx` landing page built with `ModuleHubScreen`. |
| `src/components/ui/` | PascalCase shared components (design kit, sheets, tables, badges, forms). |
| `src/components/<domain>/` | Domain components (`checkin/`, `photos/`, `events/`, `waivers/`, `navigation/`). |
| `src/services/<thing>Service.ts` | Thin API wrappers: they call `apiRequest` with an explicit token, map snake_case responses, and usually name the endpoint in a doc comment. |
| `src/lib/<domain>/` | Pure business logic and formatting, with a `*.test.ts` alongside. **No runtime import of native modules**, so Node can test them. |
| `src/lib/hooks/use*.ts` | Data hooks (46). They own fetching, module caches and request sequencing. |
| `src/lib/*Stale.ts`, module caches | `mark*Stale()` after mutations; `consume*Stale()` on focus to refetch. |

- **Inconsistent:** a few hubs are named `attractions.tsx`, `events.tsx` or `photos.tsx` rather than `*-hub.tsx`.
- **Inconsistent:** imports are mostly relative even though an `@/*` alias exists.

## 3. TypeScript

- **Established:** `strict` mode. Tests import siblings with explicit `.ts` extensions
  (`allowImportingTsExtensions`). The open-ended union `UserRole` (`(string & {})`) leaves room for future roles.
- **Inconsistent:** typed routes are enabled, but many navigations cast route strings `as never` (e.g. `ModuleHub.tsx`).

## 4. Navigation (Expo Router)

- **Established:**
  - `router.push` to drill down;
  - `router.replace` for auth and account hand-offs (splash → home or login, switch-account bridge);
  - `router.dismissTo` to return to an existing list (registration flow);
  - `headerShown: false` everywhere, so screens render their own headers.
- **Established:** role-specific tabs and menus come from `src/lib/navigation/navConfig.ts` (plus the Quick Nav menu
  items). Bottom overlays check `isTabRoute` / `isPublicRoute`.
- **Established:** all motion constants live in `src/components/navigation/navMotion.ts`. Don't hard-code durations
  or springs on screens.
- **Established:** app-wide overlays and global prompt hosts mount once in `src/app/_layout.tsx`. `QuickNavFab` mounts
  inside `(tabs)/_layout.tsx`.

## 5. Shared components and screen layout

- **Established (current design kit, "flat module"):**
  - `ModuleHeader`
  - `SearchField`
  - `RowActionGroup`
  - from `SummaryPanel.tsx`: `FilterChipGroup`, `ToneDotBadge`, `FiltersButton`, `ListEmptyState`,
    `ListErrorBanner`
  - `ViewToggle` + `SelectableTable`, where the screen owns a `Set<number>` selection
  - `BottomSheet` / `CenterModal` for overlays

  Typical layout: status filters as chips, other filters in a sheet, Refresh in the More menu.
- **Inconsistent:** the migration is partial. 22 screens use `ModuleHeader`, while older `ScreenHeader`,
  `DashboardHeader`, `ScreenTitleCard` and hand-rolled headers remain. There are two pagination components, about
  30 one-off tables, and both `StatusBadge` and `ToneDotBadge`.
- **Established:** open one modal at a time. Close the current sheet, then open the next after a short timeout
  (`KL-UI-010`).
- **Proposed:** keep a list of which screens use the current kit, and prefer the kit for new or touched screens.

## 6. Styling and theming (NativeWind)

- **Established:**
  - NativeWind `className` for static styling; inline `style` or Reanimated for animated, computed and shadow
    values;
  - `dark:` variants written on each element;
  - press feedback via `PRESS_SCALE_CLASS`.
- **Established:** the theme is app-controlled light/dark, persisted in SecureStore (`src/lib/theme.ts`), independent
  of the OS. Montserrat is applied globally by `src/lib/fonts.ts`.
- **Established (code-comment gotchas):**
  - Adding `shadow`, `dark:` or `active:` classes to an element **after it has mounted** can crash NativeWind. Remount
    with a `key`, or move the value into `style`.
  - Don't put `flex-1` on `SkeletonBlock`; wrap it instead.
  - `bg-background` is undefined and does nothing.
- **Established:** tab screens pad their bottom content by about `insets.bottom + 96` to clear the floating tab bar.
- **Inconsistent:** there are no colour tokens. The brand colour `#0644C7` is hard-coded in about 1,100 places.
  Three icon systems are in use: `@expo/vector-icons`, `lucide-react-native` and PNG.
- **Inconsistent:** top safe area. `ScreenHeader` uses `insets.top`; `ModuleHeader`, `ModuleHub` and `DashboardHeader`
  use a fixed `pt-12` (`KL-UI-001`).

## 7. Data fetching, state and API services

- **Established:** **all HTTP calls go through `apiRequest`** (`src/lib/api.ts`), except the documented bypass paths
  (multipart uploads, file downloads, Authorize.Net tokenisation, account-switch validation, push unregister, error
  reports). See [api-layer §6](architecture/api-layer-and-data-flow.md).
- **Established:** services get the token explicitly (`getToken()`). Only `src/lib/session.ts` owns the token.
- **Established:** module stores use `useSyncExternalStore`; hooks use a request-id ref so that only the latest
  response writes state; requests are abortable where possible.
- **Established:** most lists are loaded in full (`fetchAllPages`, a pool of 6 requests), then filtered, sorted and
  paginated on the device.
- **Established:** use the slim endpoints `GET /api/mobile/packages` and `GET /api/mobile/locations` for lists and
  pickers. The heavy `/api/packages` and `/api/locations` have caused memory crashes.
- **Established:** the location scope for company admins comes from `activeLocationStore`; for managers, from the
  server-side token location.
- **Inconsistent:** module caches aren't always keyed by user, date range or location (`KL-ARCH-007`,
  `KL-ANALYTICS-001`, `KL-BOOK-013`).

## 8. Forms, validation and mutations

- **Established:** validation rules live in pure, tested helpers in `src/lib` (e.g. `customBooking`, `blockFormError`,
  `validateEventEdit`, `staffPins`). `FormControls` and `InputField` are the shared inputs.
- **Established:** full-screen forms use `KeyboardAvoidingView` with `behavior="padding"` on iOS only (34 sites).
- **Established:** duplicate submissions are prevented with submit-lock refs and busy states. Checkouts use a
  `checkout_key` per sale (reused across retries of the same sale), keep the record when the charge outcome is
  unknown, and roll back only on a proven failure. **Exception:** the gift-card counter sale sends no `checkout_key`
  (KL-PKG-017).
- **Established:** a 422 `change_reason` and a 409 `BLOCKED_PERIOD` are handled **globally** by `apiRequest`. Screens
  should not re-implement them.
- **Established:** edits use server quotes for pricing where available (Edit Booking). `amount_paid` isn't sent on
  edit.
- **Inconsistent:** bulk actions often fire parallel single requests and report one combined error (KL-ATTR-002,
  KL-CUST-009, KL-MEMBER-007).

## 9. Errors, loading, empty states and refresh

- **Established:**
  - per-screen skeletons;
  - empty and error states keyed per state, so switching remounts cleanly;
  - `useTransientAlert` for banners that dismiss themselves;
  - `ErrorBoundary` with "This page stopped working";
  - uncaught errors and failed API calls reported to `POST /api/client-errors`, rate-limited.
- **Established:** pull to refresh, refetch on focus via stale flags, and refresh on AppState `active` where it
  matters (dashboard, space schedule).
- **Inconsistent:** `useStatusModal` is documented as the replacement for `Alert.alert`, but 768 `Alert.alert` calls
  remain against 6 adopters (`KL-UI-004`).

## 10. Permissions, roles and security conventions

- **Established:** Mobile role checks **only control visibility**. Authorisation is the Backend's job. Treat any
  client-side gate as UX, and cite Backend code before calling something enforced.
- **Inconsistent:** UI role gates are scattered, and in several modules they disagree with the Backend, in both
  directions. See the discrepancy table in [BUSINESS_RULES.md](BUSINESS_RULES.md).
- **Established:**
  - SecureStore for the session, saved accounts and preferences;
  - push tokens are only logged in dev builds, and masked;
  - the APK URL must be HTTPS;
  - the version check is a `publicEndpoint`, so a 401 there never logs the user out;
  - push taps only follow internal routes.
- **Established:** never send card data to the ZapZone Backend. Card data goes from the device to Authorize.Net, and
  only the opaque nonce reaches the Backend.
- **Watch:** a generated password is copied to the clipboard in `manage-accounts.tsx`, and client-side CSV exports
  contain PII (`KL-WAIVER-002`).

## 11. Platform adaptations

- **Established:** platform differences are handled inline with `Platform.OS` / `Platform.select`. There are no
  `.ios.*` / `.android.*` files.
- **Established:** native modules are mostly lazy-imported where they're used (`await import(...)`), and
  `expo-notifications` is guarded for Expo Go.
- **Established:** Android-only paths are guarded: the APK installer and notification channels. The guard for
  opening the unknown-sources settings screen is incomplete, but its error is caught.
- **Inconsistent:** bottom sheets have no keyboard handling, there's no numeric-keypad accessory, and headers use a
  fixed top inset (`KL-UI-001`–`003`). These matter for iOS.

## 12. Testing and verification

- **Established:** `npm test` runs `node --test --no-warnings "src/**/*.test.ts"`. That's 143 pure-logic test files
  using `node:test` and `node:assert/strict`, with plain-English `describe` names. Business logic is pulled out
  specifically so it can be tested this way.
- **Established:** lint is `npm run lint` (`expo lint`); the type-check is `npx tsc --noEmit` (not scripted).
- **Not established:**
  - no CI;
  - no component, hook, service or end-to-end tests;
  - no recorded device QA (`KL-TEST-*`).
- **Proposed:** add CI (test, lint and type-check), a type-check npm script, a pinned Node version, and a short
  device QA checklist for Android and, later, iOS.

## 13. Web Admin parity practice

- **Established:** many Mobile changes port a Web Admin commit (code comments often cite the Web commit or page).
  Mobile adapts the UI (hubs, sheets, native camera and share) rather than copying desktop layouts.
- **Established practice for investigation:**
  1. find the Web Admin page and service in `zappoint`;
  2. confirm the contract in `zapzone-backend` (route, middleware, controller, validation);
  3. note any intended Mobile deviation.

  Treat Web code comments that claim parity as **claims to verify**.
- **Proposed:** record the Web and Backend commit SHAs in SDD specs and lite specs; see the reference format in
  [README.md](README.md#reference-format).

## 14. Git, release and collaboration

- **Established:** conventional-style commit subjects (`feat:`, `chore:`, `fix:`). Work lands on `main`, sometimes
  through merges from feature branches. Native folders, env files and signing artifacts are gitignored.
- **Not documented:**
  - no release procedure;
  - no OTA publishing procedure (which platforms, which channel);
  - no version-bump rules for native changes.

  Because of the `appVersion` runtime policy, **native changes need a version bump** before an OTA can safely target
  them (`KL-PLAT-006`).
- **Spec Kit (Established, Phase 2):**
  - v1.4.3 with Claude skills in `.claude/skills/speckit-*`;
  - skills are user-invoked only (`disable-model-invocation: true`);
  - PowerShell scripts in `.specify/scripts/powershell/`;
  - the core never creates git branches, and features resolve via `SPECIFY_FEATURE_DIRECTORY` or
    `.specify/feature.json`;
  - branch creation and commits stay manual.
- **Proposed (two developers):**
  1. Announce which module or files you're working on to avoid overlapping edits.
  2. Keep each documentation update in the same commit as the behaviour change.
  3. Review the other developer's changes to shared infrastructure (`src/lib/api.ts`, `session.ts`, `navConfig.ts`,
     `BottomSheet`, `navMotion.ts`, root configs) before merging.
  4. Don't run Metro or EAS on a branch whose root config files you haven't reviewed.
