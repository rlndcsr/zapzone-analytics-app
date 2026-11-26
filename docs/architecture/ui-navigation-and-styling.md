# UI Architecture, Navigation and Styling

> **Purpose:** Describe how screens, navigation, overlays, shared UI components and styling are structured in the mobile app today.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`
> **Scope & limitations:** Static inspection of `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx`, `src/components/navigation/*`, the shared kit in `src/components/ui/*` (headers, hubs, sheets, modals, tables, badges, skeletons, feedback), `src/lib/theme.ts`, `src/lib/fonts.ts`, `tailwind.config.js`, plus repo-wide pattern counts via search. Individual module screens were sampled, not read in full. No device or simulator runs; visual and gesture behaviour is unverified.
> **Related:** [Architecture overview](../ARCHITECTURE.md) · [Development guidelines](../DEVELOPMENT_GUIDELINES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Native integrations](native-integrations.md) · [Platform & release](platform-and-release.md) · [Testing & quality](testing-and-quality.md)

---

## 1. Route structure (Expo Router, file-based)

- Entry: `package.json` `main: "expo-router/entry"`. Routes live in `src/app/` — **129 `.tsx` files**, every one with a default export (2 layouts + 127 screens). No non-route helper files live under `src/app/`.
- `typedRoutes` is enabled, but many pushes cast with `as never` (e.g. `src/components/ui/ModuleHub.tsx` `router.push(route as never)`), bypassing typed-route checking.
- **Only two layouts exist:** `src/app/_layout.tsx` (root `Stack`) and `src/app/(tabs)/_layout.tsx` (`Tabs`). Module folders (`attractions/`, `bookings/`, `customers/`, `email-campaign/`, `events/`, `memberships/`, `packages/`, `payments/`, `photos/`, `pricing/`, `user-managements/`, `waivers/`, `analytics-reports/`, `custom-fields/`, `notification/`, `profile/`, `settings/`) have **no `_layout.tsx`**; their screens are pushed onto the single root stack.
- Root-level routes: `index.tsx` (login), `splash.tsx`, `check-in.tsx`, `switch-account.tsx`, `(tabs)/`.

### Root layout — `src/app/_layout.tsx` (`RootLayout`)

Module scope: `SplashScreen.preventAutoHideAsync()`, `applyMontserratDefault()`, `installGlobalErrorReporting()`; `unstable_settings.initialRouteName = "splash"`.

Render returns `null` until hydration (`restoreSavedAccounts` → `restoreSession` → `restoreTimeframeSelection` → `validateStoredSession`, plus `applyStoredTheme`, `restoreActiveLocation`) **and** Montserrat fonts are loaded. Then:

```
GestureHandlerRootView
└─ ErrorBoundary
   ├─ StatusBar style="auto"
   ├─ AuthGuard               (redirects to "/" when signed out)
   ├─ PushDeviceRegistrar     (renders null)
   ├─ PushNotificationRouter  (renders null)
   ├─ Stack screenOptions=stackScreenOptions(colorScheme) screenLayout=screenEnterLayout
   │    splash / index / (tabs) → AUTH_SCREEN_OPTIONS (fade 300ms)
   │    switch-account          → AUTH_SCREEN_OPTIONS + gestureEnabled:false
   ├─ AppUpdateGate
   ├─ ChangeReasonHost        (422 "reason required" prompt; lib/changeReasonPrompt.ts)
   └─ BlockedPeriodHost       (409 BLOCKED_PERIOD confirm; lib/blockedPeriodPrompt.ts)
```

A temporary `authDebug` instrumentation import is still present (`// TEMP: investigation instrumentation`, `src/lib/debug/authDebug.ts`, `docs/MAX_UPDATE_DEPTH_DEBUG_REPORT.md`).

### Tabs — `src/app/(tabs)/_layout.tsx` (`TabLayout`, `FloatingTabBar`)

- Registered tabs: `home`, `location`, `activity`, `navigation`, `calendar`, `accounts`. The visible subset/order comes from `src/lib/navigation/navConfig.ts` (`getRoleTabs`): company_admin and unlisted roles → home/location/navigation/calendar/accounts; location_manager → home/activity/navigation/calendar/accounts. Role is read reactively (`useCurrentUserRole`).
- `FloatingTabBar` is an absolutely positioned rounded bar (`absolute inset-x-0 bottom-0`, height `TAB_BAR_HEIGHT` 64, top strip `TAB_BAR_TOP_INSET` 28, bottom padding `tabBarBottomPadding(insets.bottom)` = inset or 14). Hard-coded colours `#0644C7` / `#9AA0A6`.
- Tab press/focus animations use **Reanimated** (`useSharedValue`, `withTiming`, `withSpring`, `interpolateColor`) in `TabIcon`/`TabButton`. Scene switches are `animation: "none"` with no `freezeOnBlur` (`tabScreenOptions`), deliberately; heavy tabs defer work with `useTabSettled` / `TAB_SETTLE_MS` (150 ms).
- The centre slot `navigation` renders an empty `View`; **`QuickNavFab` is mounted inside `TabLayout` as a sibling of `<Tabs>`** — not in the root layout. It is therefore absent on every pushed screen and on splash/login, and hides itself while the keyboard is visible. `src/app/(tabs)/navigation.tsx` is a placeholder screen with debug text, reachable only by deep link (KL-UI).
- `QuickNavFab` opens `MorphingFabMenu` (a full-window `Modal`, `statusBarTranslucent` + `navigationBarTranslucent`) anchored with `measureInWindow`; on Android it adds `insets.top` (`modalYOffset`) to measured Y. Menu items: `navMenuItems.ts` (`getNavMenuItems(role)`), `quickActionItems.ts`. Motion constants: `fabMenuMotion.ts`. Geometry shared via `fabLayout.ts` (`fabBottomOffset`).

### Module hubs and peer navigation

- `ModuleHubScreen` (`src/components/ui/ModuleHub.tsx`) is the landing pattern: header (`pt-12`, back button), intro, optional `LocationWorkspaceSelector` (company_admin or `canSwitchLocation`, read via non-reactive `getCurrentUser()`), `HubShortcuts` (≤4 visible, then horizontal snap scroll), "Manage" shortcuts, and a two-column `ModuleCard` grid. Used by `*-hub.tsx` screens plus `attractions/attractions.tsx`, `events/events.tsx`, `photos/photos.tsx`.
- **There is no `ModuleTopTabs` component at this revision** (searched: no matches). Peer/sub-screen navigation uses `router.push` from hub cards/shortcuts. `router.replace` is used for auth hand-offs (splash/login/switch-account/logout/AuthGuard), self-replacement after create/duplicate (e.g. `email-campaign/create-template.tsx`, `packages/create-packages.tsx`, `events/registration-*.tsx`) and `/switch-account` remounts. `router.dismissTo("/events/registration-forms")` is used in the registration-forms flow to pop back to an existing list instead of pushing a duplicate. Push-notification taps use `router.navigate`.

## 2. Navigation motion (centralised)

`src/components/navigation/navMotion.ts` holds every navigation/overlay constant:

- `stackScreenOptions(theme)` → `headerShown:false`, `animation: "ios_from_right"`, `contentStyle.backgroundColor = surfaceFor(theme)` (`SURFACE` light `#F9FAFB`, dark `#000000`). Per `react-native-screens` types, `ios_from_right` is **Android-only and resolves to the default transition on iOS**.
- `AUTH_SCREEN_OPTIONS` (fade, `AUTH_FADE_DURATION` 300).
- Tab, sheet (`SHEET_OPEN_SPRING`, `SHEET_CLOSE_SPRING`, `SHEET_CLOSE_DISTANCE` 120, `SHEET_CLOSE_VELOCITY` 800), centre-modal (`MODAL_*`), progress and appear (`APPEAR_*`) constants.
- `PRESS_SCALE_CLASS` / `PRESS_DIM_CLASS` — NativeWind `active:` classes **without** a `transition` class, documented in-file as avoiding css-interop shared-value reads during render. Requires the custom `scale-97` key in `tailwind.config.js`.
- `ScreenEnter` (`src/components/navigation/ScreenEnter.tsx`) is applied to every root-stack screen via `screenLayout={screenEnterLayout}`: a Reanimated scale from 1.02 → 1 over 280 ms on mount, `overflow: hidden`. Its comment refers to "the rule at the top of navMotion.ts", which no longer exists there (KL-DOC).
- Exceptions to centralisation: `SkeletonBlock` (`usePulse`, 850 ms inline), `BottomSheet` backdrop colour `rgba(20,20,20,0.5)` vs `MODAL_BACKDROP_COLOR` 0.6, and ~44 hard-coded `setTimeout(…, 2xx–4xx)` waits (mostly 280 ms) used to sequence sibling modals.

## 3. Overlays: bottom sheets, centre modals, global prompt hosts

| Primitive | Implementation | Notes |
|---|---|---|
| `BottomSheet` (`src/components/ui/BottomSheet.tsx`) | RN `Modal` (`transparent`, `statusBarTranslucent`, `navigationBarTranslucent`, `animationType="none"`) + its own `GestureHandlerRootView`; Reanimated `translateY` spring; pan-to-dismiss on the handle/header only; `max-h-[80%]`; bottom padding `insets.bottom` | Props: `visible`, `onClose`, `title`, `subtitle`, `icon`, `children`. **No keyboard avoidance.** Close "✕" is a `PressableScale` with no `accessibilityLabel`/role. `SCREEN_HEIGHT` captured at module load via `Dimensions`. Used in **103 files (160 JSX sites)**. |
| `CenterModal` (`CenterModal.tsx`) | RN `Modal` + Reanimated scale/opacity; `dismissable` flag blocks backdrop/back; `offscreen` slot for view-shot capture cards; `accessibilityViewIsModal` | Used by QR modals, update dialog, status/confirm modals. |
| `StatusModal` + `useStatusModal` (`src/lib/hooks/useStatusModal.ts`) | success/error/info/confirm(destructive) variants; closes before running `onConfirm` | Hook doc says it "replaces `Alert.alert`", but it is used in **6 files** while `Alert.alert(` appears **768 times in 116 files** (KL-UI). |
| `ConfirmationModal`, `ChangeReasonModal`, `OverridePinModal`, `OverlapOverrideModal`, `WaiverDeleteConfirm` | Feature modals | The last three wrap content in iOS-only `KeyboardAvoidingView`. |
| Global hosts | `ChangeReasonHost`, `BlockedPeriodHost` mounted once in root layout; register a promise-returning handler with `lib/changeReasonPrompt.ts` / `lib/blockedPeriodPrompt.ts` that `lib/api` awaits | `BlockedPeriodHost` uses a plain RN `Modal` and a 400 ms arm delay on "Book anyway". |

**Sibling-modal sequencing (convention):** two RN Modals must not be open simultaneously; screens close one sheet, then open the next after `setTimeout(…, 280)` (comments in `attractions/manage-attractions.tsx` and `attractions/purchases.tsx`: "two stacked native Modals crash Android's new architecture"). Global hosts can still open over a screen-level sheet that is visible at the time of a 409/422 — interaction *Not assessed* (Device verification required).

## 4. Shared design kit

### Flat module kit (newer)

| Component | File | Role |
|---|---|---|
| `ModuleHeader` (+ `ModuleHeaderAction`) | `ModuleHeader.tsx` | Flat white header, `pt-12`, back button (`router.back()` default), optional blue "New" action |
| `SearchField` | `ModuleHeader.tsx` | Search input with clear button |
| `RowActionGroup` / `RowAction` | `RowActions.tsx` | Segmented icon actions per row, busy/disabled states, labelled |
| `SummaryPanel`, `FilterChip`, `FilterChipGroup`, `FilterSheetFooter`, `ToneDotBadge` (`DotTone`), `StatusDotBadge`, `SpecCell`, `ListHeader`, `FiltersButton`, `AppliedFiltersHint`, `ToolbarIconButton`, `ListErrorBanner`, `ListEmptyState` | `SummaryPanel.tsx` | Summary figures, single-choice filter chips, filters button with count badge, error/empty states |
| `ViewToggle` (`ViewMode` = table/cards) | `ViewToggle.tsx` | Table/cards switch |
| `SelectableTable` (`TableColumn<T>`) | `SelectableTable.tsx` | Generic horizontally scrolling table; parent owns selection (`rowId` → number); optional `flat` look; checkbox cells with `accessibilityRole="checkbox"` |

Adoption: `ModuleHeader` is imported by **22 screens**; ~19 screens use the older headers (`ScreenHeader`, `ScreenTitleCard`, `DashboardHeader`, `ModuleHubScreen`); many others hand-roll headers (see §6 counts of `pt-12`). ~30 entity-specific tables (`*Table.tsx`) exist beside `SelectableTable`; bulk bars (`*BulkBar.tsx`) per module. Older/parallel primitives remain: `StatusBadge` (palettes default/event/checkin), `PaymentStatusBadge`, `FilterPill`/`PillSegment`, `CategoryChips`, `FilterOptionSheet`, `SheetSelect`, `FormControls` (`TextField`, `SelectField`, `SegmentedToggle`, `ToggleRow`, `RadioRow`, `CheckboxRow`), `InputField`, `PrimaryButton` (`CONTROL_RADIUS`), `DetailKit` (`DetailSection`, `InfoRow`, `DetailActionButton`), `KpiCard`, `Pagination` and `PaginationControls` (two pagination components).

### Loading, empty, error, feedback

- Skeletons: `src/components/ui/skeleton/` (20 files) — `SkeletonBlock` (`usePulse` shared value + `SkeletonSurface`), `SkeletonShimmer`, and per-screen skeletons. **Gotcha:** `SkeletonBlock` applies `className` to the inner `SkeletonSurface`; the outer `Animated.View` has no flex, so `flex-1` in `className` collapses the bar — wrap in a `flex-1` parent instead.
- Empty/error: `ListEmptyState`, `ListErrorBanner` (flat kit); screens also hand-roll states keyed per state (comments: "Each state is keyed so switching remounts cleanly").
- Feedback: `Toast` (`ToastType`, positioned `insets.top + 56`), `UndoSnackbar`, `useTransientAlert` (auto-dismiss value), `StatusModal`, and pervasive `Alert.alert`.
- Motion helpers: `src/components/ui/motion/` — `PressableScale` (honours `useReducedMotion`), `Appear` (staggered entrance, reduced-motion aware), `Confetti`.

## 5. Styling (NativeWind v4)

- `tailwind.config.js`: `content: ./src/**/*.{js,jsx,ts,tsx}`, `darkMode: "class"`, `nativewind/preset`, single extension `scale.97`. No colour tokens are defined, so brand colours are literal: `#0644C7` appears **1,103 times in 267 files** (class strings like `bg-[#0644C7]` and JS constants).
- `src/global.css` contains only the three `@tailwind` directives; imported once by the root layout. `metro.config.js` wraps with `withNativeWind`; `babel.config.js` sets `jsxImportSource: "nativewind"`.
- Convention: `className` for static styling; `style`/Reanimated `useAnimatedStyle` for animated or computed values (shadows, measured sizes, insets). Shadows are mostly inline `style` objects.
- `bg-background` is used once (`src/app/notification/notification-details.tsx`) but no such token exists (no-op class).
- Icons: three systems coexist — `@expo/vector-icons` (Feather, Ionicons), `lucide-react-native`, and PNG icons in `assets/zapzone-assests/icon/`.
- **Known gotcha — css-interop post-mount upgrade:** conditionally adding `shadow-*`, `dark:` or pseudo (`active:`) classes to an already-mounted element makes react-native-css-interop upgrade the component in place, which throws (redbox frames in `render-component.js`). In-code mitigations: remount with a `key` tied to the state, or move the value into `style` (comments in `attractions/create-purchase.tsx`, `attractions/orders.tsx`, `bookings/manual-booking.tsx`, `events/registration-form-details.tsx`).

## 6. Safe areas, keyboard, layout

- `useSafeAreaInsets()` is called in 116 files; there is no `SafeAreaView` usage. The provider comes from Expo Router (*Inferred*).
- **Top inset is inconsistent:** `ModuleHeader`, `ModuleHubScreen`, `DashboardHeader`, `EmailComposerKit` use a fixed `pt-12` (48 dp); `ScreenHeader` uses `insets.top + 10`; fixed `pt-10/12/14/16` classes appear 68 times in 67 route files (hand-rolled headers); only 8 route files read `insets.top`. On devices whose status-bar/notch inset exceeds 48 dp the header content could sit under it (Device verification required; KL-UI).
- **Bottom inset with the floating tab bar:** tab screens pad scroll content manually — `home`, `activity`, `calendar`, `location` use `insets.bottom + 96`; `accounts` uses `TAB_BAR_HEIGHT + tabBarBottomPadding(insets.bottom) + gap`. `settings/settings.tsx` (a pushed screen, no tab bar) also uses `+ 96`. Bottom overlays decide their offset with `isTabRoute(pathname)`.
- **Keyboard:** full-screen forms wrap in `KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}` (34 sites); Android relies on default window resize (*Inferred*). `BottomSheet` and `CenterModal` have no keyboard handling, yet sheets with text inputs are common (24 `src/components/ui` files render `TextInput`, many inside sheets). `keyboardShouldPersistTaps` appears 116 times. ~195 `keyboardType` props in 57 files (numeric/decimal/phone/computed) and **no `InputAccessoryView`**, so iOS numeric keypads have no built-in dismiss (Device verification required).
- Portrait only (`app.json`); layouts use `useWindowDimensions` in places (e.g. `HubShortcuts`) but `BottomSheet` caches height at module load.

## 7. Theming

- `src/lib/theme.ts`: preference `"light" | "dark"` persisted in SecureStore key `zapzone_theme`, default light; `applyStoredTheme()` calls NativeWind `colorScheme.set`, which (in the installed css-interop) calls `Appearance.setColorScheme`, overriding the OS scheme. There is no "system" option even though `app.json` has `userInterfaceStyle: "automatic"`.
- Dark styles are written per element as `dark:` classes; JS colours branch on `useColorScheme()` from `nativewind` (e.g. header icon colours). Stack/tab scene backgrounds come from `surfaceFor(theme)`.
- `StatusBar style="auto"` in the root layout.

## 8. Typography

`src/lib/fonts.ts` loads nine Montserrat weights (`montserratFonts`, via `useFonts` in the root layout) and `applyMontserratDefault()` redefines `react-native`'s `Text`/`TextInput` export getters with wrappers that map `fontWeight` to the matching Montserrat family (clearing `fontWeight`) and re-register them with `cssInterop`. An explicit `fontFamily` wins. This monkey-patch depends on RN's export shape; failure only logs in `__DEV__` (KL-UI technical debt). `Animated.Text` (used in the tab bar) is not covered by the patch (*Inferred*).

## 9. Accessibility (as present)

- Density (repo-wide counts): 1,497 pressable openings (`Pressable`/`PressableScale`/`Touchable*`), 889 `accessibilityRole=`, 633 `accessibilityLabel=`. Shared kit components are mostly labelled (`ModuleHeader`, `SearchField`, `RowActionGroup`, `ViewToggle`, `FiltersButton`, `QuickNavFab`, tab buttons with `accessibilityState.selected`).
- Gaps seen: `BottomSheet` close button (no label/role), `FilterSheetFooter`/`ListEmptyState`/`ListErrorBanner` buttons have role but no explicit label (text child is read), skeletons are not hidden from screen readers.
- `accessibilityLiveRegion="polite"` in ~10 progress/outcome places (Android-only prop); `useReducedMotion` honoured by `PressableScale`, `Appear`, `Confetti`, `RoomPreviewImage`.
- No `allowFontScaling`/`maxFontSizeMultiplier` limits; large-font layout is unverified. Only one `testID` in `src/`.

## 10. Known limitations referenced

`KL-UI-*`: Alert vs StatusModal inconsistency; fixed `pt-12` headers; sheets without keyboard handling; no numeric-keypad accessory; placeholder `navigation` tab screen; `bg-background` no-op; css-interop upgrade crash class; SkeletonBlock flex collapse; Montserrat monkey-patch; mixed icon systems; hard-coded brand colour; magic `setTimeout` sequencing. `KL-DOC-*`: stale comments (`ScreenEnter` → navMotion rule; `AppUpdateGate` → FAB in root shell). See [Known limitations](../KNOWN_LIMITATIONS.md).
