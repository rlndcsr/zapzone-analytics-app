# Platform and Release

> **Purpose:** Describe how the app is configured, built, versioned and updated per platform, as the repository actually defines it.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`
> **Scope & limitations:** Static inspection of `app.json`, `eas.json`, `package.json`, root JS configs, installed `node_modules/*/package.json` versions and the update-gate source. EAS dashboard settings (remote app version, credentials, channel/branch mappings), store listings and real builds were **not** inspected. Nothing was built, run or installed. One backend controller (mobile version endpoint) was read for contract context.
> **Related:** [Architecture overview](../ARCHITECTURE.md) · [Development guidelines](../DEVELOPMENT_GUIDELINES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [UI, navigation & styling](ui-navigation-and-styling.md) · [Native integrations](native-integrations.md) · [Testing & quality](testing-and-quality.md)

---

## 1. Installed toolchain (from `node_modules/<pkg>/package.json`)

| Package | Declared (`package.json`) | Installed |
|---|---|---|
| expo | ~55.0.28 | 55.0.28 |
| react-native | 0.83.10 | 0.83.10 |
| react | 19.2.0 | 19.2.0 |
| typescript (dev) | ~5.9.2 | 5.9.3 |
| expo-router | ~55.0.17 | 55.0.17 |
| @react-navigation/native | ^7.1.33 | 7.3.14 |
| @react-navigation/bottom-tabs | ^7.15.5 | 7.18.14 |
| react-native-screens | ~4.23.0 | 4.23.0 |
| react-native-safe-area-context | ~5.6.2 | 5.6.2 |
| react-native-gesture-handler | ~2.30.0 | 2.30.1 |
| react-native-reanimated | 4.2.1 | 4.2.1 |
| react-native-worklets | 0.7.4 | 0.7.4 |
| nativewind | ^4.2.6 | 4.2.6 |
| react-native-css-interop (transitive) | — | 0.2.6 |
| tailwindcss | ^3.4.17 | 3.4.19 |
| eslint-config-expo (dev) | ~55.0.1 | 55.0.1 |
| lucide-react-native | ^1.23.0 | 1.28.0 |

Native-module versions are listed in [Native integrations](native-integrations.md). `babel-plugin-react-compiler` is present in `node_modules` (pulled in for the `reactCompiler` experiment). `expo-dev-client` is **not** installed (no `node_modules/expo-dev-client`).

**Minimum iOS:** 15.1 — *Inferred* from `node_modules/react-native/scripts/cocoapods/helpers.rb` (`min_ios_version_supported` returns `'15.1'`); no app-level override exists. Minimum Android API: **Not assessed**.

Node.js version: not pinned (no `engines`, `.nvmrc` or `.node-version`). The test command relies on Node's built-in TypeScript type-stripping, which needs a recent Node — see [Testing & quality](testing-and-quality.md).

## 2. `app.json` (Expo config)

| Key | Value / observation |
|---|---|
| `name` / `slug` | "ZapZone Admin" / `zapzone-analytics-app` |
| `version` | `1.2.3` |
| `orientation` | `portrait` (no landscape layouts found) |
| `scheme` | `zapzoneanalyticsapp` (deep links resolve via Expo Router file routes) |
| `userInterfaceStyle` | `automatic` — but the in-app theme is app-controlled (see [UI doc](ui-navigation-and-styling.md#7-theming)) |
| `icon` | `./assets/zapzone-assests/ZZ-icon.png` (note the folder typo "assests") |
| `ios` | Only `{ "icon": "./assets/expo.icon" }`. `assets/expo.icon/` is the create-expo-app template icon bundle (`expo-symbol 2.svg`, `grid.png`). **No `bundleIdentifier`, no `buildNumber`, no `supportsTablet`, no `infoPlist`, no `associatedDomains`, no `config.usesNonExemptEncryption`.** |
| `android.package` | `com.zapzone.analytics` |
| `android.versionCode` | `14` (but `eas.json` uses `appVersionSource: "remote"`, so EAS-managed values may supersede it — *Inferred*) |
| `android.adaptiveIcon` | ZZ icon foreground + template background/monochrome images from `assets/images/` |
| `android.predictiveBackGestureEnabled` | `false` |
| `android.googleServicesFile` | `./google-services.json` (committed file at repo root; contents not opened) |
| `android.permissions` | CAMERA, READ/WRITE_EXTERNAL_STORAGE, READ_MEDIA_VISUAL_USER_SELECTED, READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, READ_MEDIA_AUDIO, REQUEST_INSTALL_PACKAGES, POST_NOTIFICATIONS. Config plugins add more (e.g. `expo-calendar` adds READ/WRITE_CALENDAR). |
| `web` | `bundler: metro`, `output: static` — a web target is declared but not maintained (several modules are native-only); *Not assessed*. |
| `plugins` | `expo-router`; `expo-splash-screen` (white bg, ZZ icon, 200px); `expo-secure-store`; `expo-sharing`; `expo-calendar` (calendar string set, `remindersPermission: false`); `expo-camera` (camera string; `recordAudioAndroid: false`); `expo-media-library` (photos + save-photos strings; `isAccessMediaLocationEnabled: false`); `expo-web-browser`; `expo-notifications` (no options: no custom icon/colour/sounds). |
| `experiments` | `typedRoutes: true`, `reactCompiler: true` |
| `extra.eas.projectId`, `owner` | Configured (values intentionally not reproduced) |
| `runtimeVersion` | `{ "policy": "appVersion" }` |
| `updates.url` | Configured (EAS Update). No `checkAutomatically` / `fallbackToCacheTimeout` overrides → library defaults. |

Permission strings present: camera (QR scan + customer photos), calendar, photo library / save photos. **No `NSPhotoLibraryUsageDescription` is supplied by an image-picker plugin** — `expo-image-picker` is not listed in `plugins`, so iOS photo-library read relies on the `expo-media-library` `photosPermission` string or Expo defaults (*Inferred*; Device verification required). There is no microphone usage, and none is requested.

## 3. `eas.json`

```text
cli: version >= 20.3.0, appVersionSource: remote
build.development: developmentClient: true, distribution: internal, channel: development
build.preview:     distribution: internal, channel: preview
build.production:  autoIncrement: true, channel: production
submit.production: {}
```

Observations (Source-verified unless stated):

- **`development` profile sets `developmentClient: true` but `expo-dev-client` is not a dependency.** A development build would not contain the dev launcher; behaviour of such a build is *Not assessed*.
- No per-platform blocks (`android`/`ios`) in any profile; no `buildType` (so Android production builds default to AAB and preview to whatever EAS defaults — *Inferred*). The in-app updater downloads an **APK** URL configured on the backend, so a sideload APK pipeline exists outside this file (*Not assessed*).
- `submit.production` is empty: no store submission config.
- Channels are shared across platforms. With `runtimeVersion.policy = appVersion`, an EAS Update published to `production` for runtime `1.2.3` would be offered to **both** Android and iOS builds of 1.2.3 unless the publish is platform-scoped (*Inferred*; publishing practice not documented).

## 4. OTA (EAS Update) vs native build compatibility

Implied by `runtimeVersion.policy: "appVersion"`:

| Change | Ships via EAS Update? |
|---|---|
| JS/TS, styles, JS-only assets, while `version` stays `1.2.3` | Yes (same runtime) |
| Any `app.json` native change (permissions, plugins, icons, splash, `android.*`, `ios.*`) | **No** — needs a new native build; also bump `version` so the runtime changes |
| Adding/upgrading a package with native code | **No** — native build + `version` bump |
| Bumping `version` | Creates a new runtime; existing installs stop receiving updates published for the new runtime until they install the new binary |

Risk: the `appVersion` policy keys only on `version`; a native change shipped **without** bumping `version` leaves old binaries and new binaries on the same runtime, so a later OTA could load JS that expects native code the old binary lacks (*Inferred*, standard Expo semantics). Example called out in source: `REQUEST_INSTALL_PACKAGES` (needed by the in-app APK installer) cannot be delivered via OTA.

`expo-updates` is used in code only for `Updates.reloadAsync()` in `src/components/ErrorBoundary.tsx` (`ErrorBoundary.reload`, falls back to `DevSettings.reload()` in dev). There is no in-app `checkForUpdateAsync`/`fetchUpdateAsync` flow; OTA fetch relies on launch-time defaults.

## 5. In-app version gate (binary updates)

- **Check:** `src/services/appUpdateService.ts` (`checkForAppUpdate`, memoised once per launch) calls `GET /api/mobile/version?platform=android|ios` with `publicEndpoint: true` (a 401 must not log the user out) and a timeout; any failure resolves `null` (never blocks).
- **Installed version:** `getInstalledAppVersion` — `expo-application` `nativeApplicationVersion`; in Expo Go it reads the manifest version instead.
- **Verdict:** `evaluateUpdateStatus` — below `minimum_version` always blocks; `force_update` blocks only when a newer build actually exists (`requiresUpdate = belowMinimum || (forceUpdate && hasUpdate)`).
- **UI:** `src/components/AppUpdateGate.tsx` (mounted once in the root layout) renders `AppUpdateDialog` (blocking when required; never over `/splash`; optional prompt kept off public routes) or the deferred `AppUpdateNotice` bar.
- **Install (Android only):** `src/services/appUpdateInstaller.ts` downloads the APK with `expo-file-system/legacy` `DownloadResumable` into `cacheDirectory` (HTTPS-only URL check `assertHttpsApkUrl`, free-space check, size verification), then `launchApkInstaller` fires an `android.intent.action.VIEW` intent via `expo-intent-launcher` with a content URI. `openUnknownSourcesSettings` opens the per-app "install unknown apps" toggle. `launchApkInstaller` throws `InstallError("install_failed")` on any non-Android platform. Attempt breadcrumbs: `src/services/appUpdateAttemptStore.ts`; stale APKs swept by `sweepStaleApks`.
- **Backend contract:** `MobileVersionController@index` (backend) supports `android` and `ios`, returns 404 when no active row exists for the platform (client then shows nothing).

**iOS gap (KL-PLAT):** if an active `ios` version row is ever configured with a `minimum_version` above the installed build, the dialog would block the app while its only action calls the Android-only installer — there is no App Store / TestFlight path in code (*Inferred*; Device verification required).

## 6. `Platform.OS` usage inventory (50 occurrences / 40 files)

| Purpose | Where |
|---|---|
| `KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}` | 34 sites in 31 files — full-screen create/edit forms under `src/app/**` and `src/components/ui/{OverlapOverrideModal,OverridePinModal,WaiverDeleteConfirm}.tsx`; `bookings/create-booking.tsx` and `manual-booking.tsx` also set an iOS `keyboardVerticalOffset` of 8 |
| Monospace font | `src/app/waivers/create-template.tsx` (`Menlo` vs `monospace`) |
| Shadow / elevation split | `src/components/ui/CalendarCustomerSearch.tsx` (`Platform.select`) |
| Modal Y offset for measured anchors | `src/components/navigation/MorphingFabMenu.tsx` (`modalYOffset` = `insets.top` on Android only) |
| Calendar choice | `src/lib/nativeCalendar.ts` (iOS uses `getDefaultCalendarAsync`) |
| Push | `src/lib/notifications/pushDevice.ts` (Android channel creation; Expo Go on Android excluded; platform tag) |
| Update gate | `src/services/appUpdateService.ts`, `appUpdateInstaller.ts` (Android-only install), `appUpdateAttemptStore.ts` (API level) |

## 7. Root JS configs execute at bundle/tool time

`tailwind.config.js`, `babel.config.js`, `metro.config.js` and `eslint.config.js` are CommonJS modules executed by Metro, Babel, Tailwind/NativeWind and ESLint on every bundle, build and lint. At `973d281` they contain only expected configuration (NativeWind preset + `scale-97`, `babel-preset-expo` with `jsxImportSource: "nativewind"` + `nativewind/babel`, `withNativeWind(..., { input: "./src/global.css" })`, `eslint-config-expo/flat` ignoring `dist/*`). Commit history (`8c44904`) records that an injected, obfuscated loader was previously removed from `tailwind.config.js`. Any unexpected diff to these files is a supply-chain/security concern and should be reviewed before running tooling. No CI guard exists for this (see [Testing & quality](testing-and-quality.md)).

`.gitignore` excludes `/ios`, `/android` (Continuous Native Generation), `.env*`, keystores/provisioning files. `google-services.json` is committed (contents not opened).

## 8. iOS readiness concerns (summary)

The app is Android-first in practice. A separate iOS readiness audit exists; it is the place for decisions. Facts from this inspection only — none of these is an approved plan:

| Concern | Evidence | Verification |
|---|---|---|
| No `ios.bundleIdentifier` / `buildNumber` | `app.json` | Source-verified |
| iOS icon is the Expo template icon | `app.json` `ios.icon` → `assets/expo.icon` | Source-verified |
| No `supportsTablet` (iPad behaviour = Expo default) | `app.json` | Source-verified |
| Dev profile expects a dev client that is not installed | `eas.json` vs `node_modules` | Source-verified |
| Shared channels/runtime across platforms | `eas.json`, `app.json` | Inferred |
| Update gate has no iOS install path | `appUpdateInstaller.ts` `launchApkInstaller` | Source-verified (behaviour: Device verification required) |
| Fixed `pt-12` header padding vs notch/Dynamic Island | `ModuleHeader`, `ModuleHub`, `DashboardHeader`, `EmailComposerKit` | Device verification required |
| Bottom sheets have no keyboard avoidance; numeric keypads have no "Done" accessory | `BottomSheet.tsx`; 0 `InputAccessoryView` | Device verification required |
| Push needs APNs credentials + entitlement on EAS | `expo-notifications` plugin, no iOS config | Not assessed |
| `ScreenEnter` scale-from-1.02 + `ios_from_right` (Android-only value; iOS uses default push) | `navMotion.ts`, `react-native-screens` types | Source-verified |

## 9. Known limitations referenced

`KL-PLAT-*` items covering: missing iOS identity/icon, dev-client mismatch, shared OTA channels, iOS update-gate dead end, unpinned Node, `README.md` still the create-expo-app template (references a non-existent `reset-project` script), stale comment in `AppUpdateGate.tsx` claiming the Quick Nav FAB is mounted in the root shell. See [Known limitations](../KNOWN_LIMITATIONS.md).
