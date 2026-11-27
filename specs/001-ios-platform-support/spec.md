# Feature Specification: iOS Platform Support

**Feature Branch**: None created. Spec directory `001-ios-platform-support`. Git branch creation was not authorized,
and no `before_specify` hook is registered.

**Created**: 2026-11-27

**Status**: Draft — clarification in progress. Approved on 2026-11-27:
- initial coverage (RD-12, with refined tier F granularity, including all primary tabs);
- device scope (RD-04, and the RD-03 rule);
- kiosk scope (RD-10);
- push notifications (RD-13);
- reinstall clean start (RD-09);
- iOS update behaviour (RD-08);
- photo orientation (RD-11).

The `/speckit-clarify` session of 2026-11-27 is complete, with 5 of 5 questions asked. Every product decision
needed for specification approval is resolved. Two product decisions remain open, each with an inline
`[NEEDS CLARIFICATION]` marker, and both are needed before plan approval or the first build, not before
specification review: RD-01 (FR-010) and RD-05 (FR-015).

This specification prepares for **future** iOS development while the project validates its Spec-Driven Development
workflow. It authorizes no application, configuration, dependency, Backend, Web Admin or release-infrastructure
change, no credential access, and no build or publish.

Operational prerequisites (RD-02, RD-07) and planning items (RD-03 value, RD-06) are tracked in "Reserved
Decisions". The specification is **not approved for planning**. Nothing in it has been verified on iOS
yet (E-16).

**Track**: Full SDD (constitution v1.0.0, Principle II and the "Tracks" table: "iOS and other platform
initiatives"). The feature also touches native configuration, release configuration, session storage, payments UI
and app-update flows, and each of those alone rules out Direct maintenance.

**Input**: Developer brief "ZapZone Mobile — Phase 4: iOS Platform Support Feature Specification" (2026-11-27).
Summary: enable ZapZone Mobile to run on supported iOS devices from the existing shared codebase. Developers on
Windows with VS Code and Claude Code must be able to build it with a cloud build service and test it on physical
Apple devices without a Mac. Existing functionality, business rules, API contracts, authorization boundaries and
Web Admin parity must be preserved, and Android must not regress. Refined by the Phase 5 clarification brief
(2026-11-27).

---

## Context and Evidence Baseline

**Inspected revisions**: Mobile `main` @ `70c8c87`. Backend `zapzone-backend@9a445c1` (cited items only). Web
Admin `zappoint@73818ef` (identity only; see Parity classification).

**Evidence levels**: **SV** = source-verified at the revisions above. **Doc** = documented in the `docs/` baseline
(`973d281`) and not re-verified here. **Inf** = inferred. **DVR** = device verification required. **Approved** = a
developer-approved requirement or decision. **Unknown** = the developers have not yet confirmed it either way.

| # | Fact | Evidence |
|---|---|---|
| E-01 | Android identity: package `com.zapzone.analytics`, app name "ZapZone Admin", version `1.2.3`, branded icon. | SV |
| E-02 | iOS configuration has only an icon entry, and that icon is the Expo template. There is no bundle identifier, build number, device-family (tablet) setting or custom permission text block (KL-PLAT-001, KL-PLAT-002). | SV |
| E-03 | The whole app is locked to portrait orientation. | SV |
| E-04 | Updates use one runtime policy keyed on the app version. Three build profiles (development, preview, production) map to three update channels. No profile has a per-platform section, so channels are shared between platforms (KL-PLAT-004, KL-PLAT-006). | SV (configuration); Inf (cross-platform OTA reach) |
| E-05 | The development build profile expects a development client that is not installed (KL-PLAT-003). | Doc; configuration SV |
| E-06 | The in-app binary update installer is Android-only and fails on any other platform. On iOS, the launch version check asks the Backend for the `ios` record (KL-PLAT-005). | SV |
| E-07 | The Backend accepts `ios` for both the mobile version endpoint and push-device registration. | SV (`zapzone-backend@9a445c1`: `MobileVersionController::SUPPORTED_PLATFORMS`, `MobilePushDevice::PLATFORMS`) |
| E-08 | iOS push needs Apple push credentials. Whether they exist is unknown, and they have not been configured or verified for this app (KL-PLAT-010). | Doc (Not assessed); Unknown |
| E-09 | 71 source files use a fixed top padding instead of the safe-area inset (KL-UI-001). No input uses a keyboard accessory, so numeric keypads have no dismiss key (KL-UI-003). | SV (counts); behaviour DVR |
| E-10 | Bottom sheets have no keyboard avoidance (KL-UI-002). Root-level prompts may not appear over an open sheet on iOS (KL-UI-011). | Doc (Suspected; DVR) |
| E-11 | Two screens intercept Android hardware back: the Escape Rooms game board (KL-PHOTO-012) and the account-switch bridge. iOS swipe-back has no equivalent handling. | SV (interceptors); behaviour DVR |
| E-12 | The guest kiosks (waiver kiosk, escape-room kiosk) have no navigation lock-down (KL-PHOTO-002, KL-WAIVER-007). | Doc |
| E-13 | Camera capture does not opt in to physical-orientation reporting while portrait-locked, so iOS landscape shots may save as portrait (KL-PHOTO-010). The photo-library permission text mentions only QR codes (KL-PHOTO-006). | SV (absence); behaviour DVR |
| E-14 | The session inactivity window is a temporary 30-day value (KL-SEC-001). A saved account resumes without a password (KL-SEC-002). | SV |
| E-15 | Platform-relevant source has not changed since the documentation baseline. Code changes after `973d281` touch only packages, spaces and rooms. | SV (`git diff 973d281..HEAD`) |
| E-16 | The repository and docs hold no record of an iOS build, installation or device run. Nothing about iOS behaviour is runtime-verified. | Doc (KL-TEST-005) |
| E-17 | A minimum iOS version of 15.1 is an **inferred candidate** from the installed toolchain, not a verified requirement. | Doc (Inf) |
| E-18 | The target Backend environment is fixed at bundle time. It is unknown whether a non-production Backend, synthetic test data, a payment-processor sandbox or an approved environment for state-changing tests exists (KL-OPS-001). | Doc (Inf); Unknown (developer, 2026-11-27) |
| E-19 | Availability of Apple Developer Program membership, company account ownership, team access, signing credentials and registered test devices has not been verified. | Unknown (developer, 2026-11-27) |

**Parity classification**: This is a platform feature with **no Web Admin counterpart**. Its parity obligation is
indirect. Each existing Mobile workflow must produce the **same business outcome on iOS as on Android**, and so
keeps whatever Web Admin parity status it already has. This feature neither creates nor closes Web Admin parity
gaps. No Web Admin or Backend change is required or authorized.

---

## Clarifications

### Session 2026-11-27

The first four bullets record developer decisions supplied with the Phase 5 brief, which answer the three Phase 4
questions and the Apple account question. They were not asked in this session and do not count toward its
5-question limit.

- Q: Which iOS workflows need full physical-device verification for initial readiness, and which can be deferred? →
  A: Option A, tiered verification. Full physical-device verification covers authentication, sessions and saved
  accounts; role-based navigation and location scoping; the dashboard; check-in; bookings; onsite sales including
  card payment; customers; waivers; and memberships. Every other existing module gets a smoke check unless a
  developer approves a different level. Push notifications and guest kiosks remain **deferral candidates; their
  deferral is not approved** (both were later decided as tier F: see the RD-10 and push bullets below). Tiers set verification depth only. They do not authorize removing functionality, and
  smoke verification is not full verification. Every module must be classified, deferred, unsupported and
  unverified items are reported separately, and Android regression protection stays mandatory.
- Q: Which Apple devices and iOS versions does the initial release support? → A: Option A, iPhone only. iPad support
  and tablet layouts are out of scope. The minimum iOS version is the lowest version compatible with the existing
  Expo SDK, React Native version, native dependencies and approved build configuration, confirmed by technical
  verification during planning. 15.1 is an inferred candidate, not a requirement. No SDK or React Native upgrade
  without separate approval.
- Q: Which Backend environment do iOS test builds use, and can card payments be tested there? → A: **Unknown.** The
  developers have not confirmed that a non-production Backend, synthetic test data, a payment sandbox or an approved
  environment for state-changing tests exists or does not exist. The **preferred** approach is a non-production
  Backend with synthetic data and sandbox payment processing. This is a preference, not a confirmed capability.
  Availability is recorded as an unresolved operational prerequisite (RD-07).
- Q: Is a company Apple Developer account with team access, signing credentials and registered devices available?
  → A: **Unknown.** None of these is stated to exist or not to exist. A company-owned account is the recommended
  ownership model, subject to confirmation. Account, signing, provisioning and device-registration prerequisites
  are recorded as unverified (RD-02, E-19). They don't block clarification or conditional planning, but they must
  be satisfied before the corresponding authorized build and distribution activities.
- Q: For the first iPhone release, should the two guest kiosks (the waiver kiosk and the escape-room check-in
  kiosk) be fully verified on iPhone, or explicitly deferred? → A: Option B, fully verify both. Each kiosk gets full
  physical-iPhone verification of complete guest workflows plus iOS exit-gesture checks. Existing functionality and
  Android behaviour are preserved, and a comprehensive kiosk lock-down implementation stays out of scope. Any
  observed unauthorized access from a kiosk to staff functionality, customer data or another security-sensitive
  area is a **readiness blocker**, even if the same weakness exists on Android.
- Tier F granularity (developer correction of the interpretation reported after round 1; not a counted
  question):
  - the dashboard covers the Home, Location and Activity tabs;
  - bookings covers the list, details, create, edit, manual booking and the Booking Calendar, while Space Schedule,
    Location Requests and Day Offs stay at smoke level;
  - waivers covers waiver records, waiver details and waiver check-in, while template management, invitations and
    other secondary waiver workflows stay at smoke level;
  - both guest kiosks are tier F.
- Q: Are push notifications required for the first iPhone release, or explicitly deferred? → A: Option A, required
  and fully verified on a physical iPhone. Verification covers:
  - notification permission requests and denial handling;
  - device registration for eligible roles;
  - delivery in the foreground, background and terminated app states;
  - correct tap routing;
  - device unregistration on sign-out;
  - saved-account switching and account isolation;
  - no unauthorized access through notification routing;
  - no inappropriate delivery to previously signed-in accounts.

  Existing business rules, Backend authorization and Android notification behaviour are preserved. Apple push
  credentials are a required operational prerequisite whose availability is unverified. Security failures found
  are readiness blockers, and unrelated existing defects are not remediated by silently expanding scope.
- Tier F granularity, second correction (developer, not a counted question):
  - the Dashboard Calendar tab is tier F;
  - **all primary app tabs** (Home, Location, Activity, Calendar, Accounts, and the Quick Nav centre control) are
    tier F;
  - secondary analytics modules stay at smoke level;
  - the kiosk scope and the security blocker rule are unchanged, and comprehensive kiosk lock-down stays out of
    scope unless separately approved.
- Q: When the ZapZone app is deleted from an iPhone and installed again, should anything from the previous
  installation come back, such as a signed-in session or the saved-accounts list? → A: Option A, clean start after
  complete deletion and reinstallation. A fresh installation restores none of the following:
  - sessions or authentication tokens;
  - saved-account lists or credentials;
  - the active-location selection;
  - account-linked cached data or other account-linked state.

  The user must authenticate again before reaching protected functionality, and non-sensitive display preferences
  (for example the theme) may reset. This applies **only** to complete deletion and reinstallation. Normal
  restarts, backgrounding and resuming, native app updates, compatible OTA updates and iOS app offloading must not
  unnecessarily clear sessions or saved accounts. Existing session and re-authentication policies are unchanged.
  The equivalent Android behaviour must be verified, not assumed. How a fresh installation is detected and how
  persistent secure storage is handled is decided in planning.
- Q: When the server reports that a newer or required iOS app version exists, what should iPhone users see while
  there is no App Store or TestFlight path? → A: Option A, the same update rules with an iOS-appropriate action:
  - the existing optional and mandatory update policies are preserved on both platforms, and mandatory updates are
    never silently bypassed;
  - the Android APK installer is never shown or invoked on iOS;
  - iOS uses its own version record and an approved iOS-compatible distribution link;
  - before a mandatory iOS update is activated, the link and its accessibility to the intended users must be
    verified;
  - a required update whose link is missing, invalid or inaccessible keeps the mandatory policy, shows an
    administrator-contact message, and is reported as a release configuration failure;
  - Android update behaviour is unchanged.

  The distribution method, link handling and release configuration are left to later decisions and planning.
- Clarification of the RD-09 answer (developer, not a counted question): keeping the session and saved accounts
  across restarts, resuming and updates remains **subject to** the existing session-expiry, token-revocation and
  authorization policies. Preservation never overrides an expired session, a revoked token or a server refusal.
- Q: When staff hold an iPhone sideways to take a customer photo, should the saved photo come out landscape, as it
  was held, while the rest of the app stays portrait-only? → A: Option A.
  - The app interface stays portrait-locked.
  - Customer photos and escape-room group photos taken with the device horizontal are saved with correct landscape
    orientation; photos taken vertical are saved with correct portrait orientation.
  - The 16:9 ratio, up-to-4K resolution and existing fallback are preserved.
  - The saved orientation is correctly recognized by the existing Backend frame selection, so the matching
    portrait or landscape frame is applied.
  - Android camera behaviour is preserved and verified on a physical device. An Android discrepancy is documented
    and taken to the developers, not silently changed.
  - No rotating camera layouts and no unrelated camera changes. How orientation is detected, image metadata, image
    processing and camera configuration are decided in planning.

---

## User Scenarios & Testing *(mandatory)*

Actors: **Developer** (one of the two project developers, working on Windows); **Staff user** (a
`company_admin`, `location_manager` or `attendant` on an iPhone); **Android staff user** (an existing user who must
see no change); **Guest** (a member of the public using a kiosk screen on a staff device).

**Testing precondition for all stories**: device testing against any Backend environment needs developer
authorization for that environment (FR-064). Until an approved test environment is confirmed, no state-changing or
payment workflow may be exercised, and such workflows are reported as **blocked by prerequisite**, not as passed.

### User Story 1 — Build and install the iOS app without a Mac (Priority: P1)

A developer working on Windows produces an iOS build with the cloud build service, after explicitly authorizing
that build. They install it on a physical iPhone that is authorized for testing. No step requires a local macOS
machine.

**Why this priority**: Every other story depends on a signed, installable iOS build. Without it, no iOS behaviour
can be verified.

**Independent Test**: Once the prerequisites are confirmed (Apple developer access, the approved app identity, an
authorized test iPhone; all currently unverified, E-19), a developer triggers one authorized cloud build from
Windows, installs it on the test iPhone and launches it to the login screen.

**Acceptance Scenarios**:

1. **Given** the approved iOS app identity, confirmed Apple developer team access and a test iPhone authorized under
   the approved distribution method, **When** a developer authorizes and starts an iOS cloud build from a Windows
   workstation, **Then** the build completes and produces an installable artefact. No macOS machine is used.
2. **Given** a completed iOS build, **When** the tester installs it on an authorized iPhone with the approved
   distribution method, **Then** the app installs, shows the ZapZone name and branded icon (not a template icon),
   and opens to the splash screen and then the login screen.
3. **Given** an iPhone that is **not** authorized under the distribution method, **When** someone attempts to
   install the build, **Then** the installation is refused by the platform and no workaround bypasses signing or
   provisioning.
4. **Given** any build, signing, credential, device-registration or distribution action, **When** an AI assistant
   or a script would perform it, **Then** it proceeds only after explicit developer authorization for that specific
   action.
5. **Given** the iOS build exists, **When** the Android app identity and build configuration are compared with
   their pre-feature state, **Then** they are unchanged.

---

### User Story 2 — Staff sign in and use core navigation on iPhone (Priority: P1)

A staff user installs the iOS app, signs in, and sees the role-appropriate home dashboard, tabs and Quick Nav for
their active location, exactly as on Android. They can sign out, add and switch saved accounts, and are handled
correctly when their session expires or the server rejects their token. Eligible roles receive push notifications
for their own account only, and tapping one opens the right screen (FR-026).

**Why this priority**: Authentication, session handling, role navigation, location scoping and push registration
are the entry point to every module and its security boundary.

**Independent Test**: On a physical iPhone and against an authorized Backend environment (FR-064), run the
authentication, saved-account, role-navigation, location-scope and push scenarios below for one account of each
role. Compare the results with an Android device using the same accounts and environment. The push scenarios need
Apple push credentials (availability unverified), and scenarios that trigger notifications through state-changing
events need the approved test environment. Until those exist, the push scenarios are reported as blocked.

**Acceptance Scenarios**:

1. **Given** valid staff credentials, **When** the user signs in on iOS, **Then** they land on the same home
   dashboard and role-specific tab set as on Android (BR-AUTH-001, BR-ROLE-002).
2. **Given** a non-staff or inactive account, **When** it signs in, **Then** access is refused exactly as on
   Android (BR-AUTH-001, BR-AUTH-002).
3. **Given** a signed-in company admin, **When** they change the workspace location, **Then** every
   location-aware module reflects the new location (BR-LOCATION-003). **Given** a location manager with several
   assigned locations, **When** they switch location, **Then** data is re-scoped and no cached data from the
   previous location remains visible (BR-LOCATION-002, BR-SESSION-005).
4. **Given** two or more saved accounts, **When** the user switches, signs out or removes an account, **Then** the
   outcome follows BR-AUTH-004, BR-AUTH-005 and BR-AUTH-006, and no data from the previous account appears.
5. **Given** a session whose inactivity window has passed, or a server 401, **When** the user next interacts,
   **Then** the app tears down the session once and returns to the login screen as on Android (BR-SESSION-001 to
   BR-SESSION-003). A 403 is not treated as a logout.
6. **Given** the app is launched with no network, **When** session validation cannot reach the server, **Then**
   it behaves as on Android (fail-open on network errors, BR-SESSION-004).
7. **Given** the app is backgrounded and resumed (including after the OS terminates it), **When** the user
   returns, **Then** session state and the active location are restored consistently with Android behaviour.
8. **Given** an eligible role (BR-ROLE-003) signs in for the first time on the device, **When** the app asks for
   notification permission and the user grants it, **Then** the device is registered for that account. **When**
   the user denies it, **Then** sign-in and every other workflow work normally, there is no repeated prompt or
   error loop, and the app does not claim to be registered.
9. **Given** a non-eligible role (attendant) signs in, **When** sign-in completes, **Then** no push registration
   happens, as on Android.
10. **Given** a registered device, **When** a notification is sent for that account while the app is in the
    foreground, in the background, and terminated, **Then** in each state it is presented as on Android (foreground
    presentation per the existing rule; no badge), and a tap opens the mapped screen (BR-NOTIF-003). From the
    terminated state, the tap is honoured after launch and sign-in checks complete.
11. **Given** a notification tap for a record the current account or location may not access, **When** it is
    opened, **Then** no unauthorized data is shown. The Backend's refusal is handled gracefully, and the app does
    not route to any screen outside the current role's navigation.
12. **Given** a registered device, **When** the user signs out, **Then** the device is unregistered before the
    token is revoked (BR-AUTH-004). Afterwards, no notification for that account is delivered to the device, and
    any pending tap is discarded.
13. **Given** two saved accounts, **When** the user switches from account A to account B, **Then** account A's
    notifications are no longer delivered to the device, any pending tap from account A is discarded, and a tap can
    never open account A's data inside account B's session.
14. **Given** a session ended involuntarily (inactivity expiry or a server 401), **When** notifications for that
    account are later sent, **Then** the observed delivery behaviour is recorded. Delivery to a signed-out device is
    a security failure and a readiness blocker (KL-SEC-005).
15. **Given** a device with a signed-in session, two or more saved accounts and a selected active location, **When**
    the app is completely deleted and then reinstalled, **Then** the new installation opens at the login screen
    with no session, no saved accounts and no previous active location. No previous account's data is shown before
    sign-in, and every protected screen needs a fresh sign-in (FR-041).
16. **Given** a signed-in session with saved accounts, **When** the app is restarted, backgrounded and resumed, or
    terminated by the OS and reopened, **Then** the session and saved accounts are kept exactly as the existing
    policy allows. No extra sign-in is demanded unless the session has expired, the token has been revoked or the
    server refuses it, in which case the existing teardown applies (BR-SESSION-001 to BR-SESSION-003).
17. **Given** a signed-in session with saved accounts, **When** a newer native build is installed over the
    existing app, and separately when a compatible OTA update is applied, **Then** the session and saved accounts
    are kept as the existing policy allows, still subject to session expiry, token revocation and server
    authorization.
18. **Given** a signed-in session with saved accounts, **When** iOS offloads the app and the user reinstalls it
    from the offloaded state, **Then** the session and saved accounts are kept as the existing policy allows, and
    the result is recorded. This scenario is reported as blocked if offloading can't be exercised with the approved
    distribution method.
19. **Given** the same deletion-and-reinstallation scenario on a physical Android device, **When** it runs,
    **Then** the observed Android result is recorded. If it differs from scenario 15, the discrepancy is reported
    for a developer decision and is not silently changed.

---

### User Story 3 — Android users see no change (Priority: P1)

Existing Android staff keep using the app as before. They notice no change in app identity, permissions,
workflows, update prompts or in-app update installation after iOS support lands.

**Why this priority**: Android is the established production platform. A regression affects live venue
operations immediately.

**Independent Test**: Compare the Android app identity, declared permissions, update channel and runtime before
and after the change. Run the Android regression workflow set (FR-053) on a physical Android device and run the
project checks.

**Acceptance Scenarios**:

1. **Given** the pre-feature Android configuration, **When** the change set is complete, **Then** the Android
   package name, app name, icon, versioning sequence and signing identity are unchanged.
2. **Given** the pre-feature Android permission list, **When** the new Android build's permissions are listed,
   **Then** there are no additions or removals unless a developer approved each one in this specification or the
   plan.
3. **Given** an installed Android production build, **When** updates are published after the change, **Then** it
   keeps receiving only updates compatible with its runtime, on its existing channel.
4. **Given** an Android user with an optional or required binary update, **When** they use the in-app update,
   **Then** the download-and-install flow works as before (BR-UPDATE-001 to BR-UPDATE-005).
5. **Given** the Android regression workflow set, **When** it runs on a physical Android device against the
   completed change, **Then** every workflow passes, or is reported as blocked by an unavailable prerequisite and
   not counted as passed.

---

### User Story 4 — Front-desk operations on iPhone (Priority: P2)

A staff user on an iPhone runs the day-to-day desk workflows: scanning a ticket QR code to check a guest in,
looking up and checking in bookings, creating and editing bookings, selling attraction and event tickets on site
(including a card payment), checking in waivers and memberships, and finding customers. The business outcome is
identical to Android.

**Why this priority**: These are the highest-frequency revenue- and admission-affecting workflows. Their
correctness matters more than secondary modules, but they need US1 and US2 first.

**Independent Test**: In an approved test environment (FR-064), run the full-verification workflow set (see
"Module Coverage") on a physical iPhone. Then run the same workflows with equivalent inputs on Android, and compare
the relevant business outcomes (FR-073). Until such an environment is confirmed, the state-changing and payment
scenarios in this story are **blocked by prerequisite** and cannot be reported as verified.

**Acceptance Scenarios**:

1. **Given** the camera permission is granted, **When** staff scan a valid ticket, order, event, membership or
   waiver QR code, **Then** the code is classified and checked in exactly as on Android (BR-CHECKIN-001 to
   BR-CHECKIN-009).
2. **Given** an image of a QR code in the photo library, **When** staff choose "scan from image", **Then** the
   code is decoded and handled as a live scan would be (KL-CHECKIN-004).
3. **Given** an approved test environment in processor sandbox mode, **When** staff run each defined payment
   scenario (FR-065: approval, decline, timeout or unknown outcome, retry, duplicate submission,
   backgrounding/termination, partial failure), **Then**:
   - card data goes only to the processor's tokenization service;
   - success is shown only after the server confirms the charge;
   - an unknown outcome keeps the record and is reported to the user as unknown;
   - the observed numbers of processor transactions and of server payment and sale records match that scenario's
     expected outcome. Charge-level and record-level results are checked separately (BR-PAYMENT-001 to
     BR-PAYMENT-005).
4. **Given** the same payment scenario run on Android with equivalent inputs, **When** the outcomes are compared,
   **Then** the relevant business outcomes match. These are the records created, payment status, amounts charged
   and the message shown.
5. **Given** a save that triggers a change-reason, blocked-period or override-PIN prompt, **When** the save
   starts from inside an open sheet or modal, **Then** the prompt is visible and actionable, and the save
   completes or cancels. It never hangs (BR-API-002, BR-API-003, KL-UI-011).

---

### User Story 5 — The app behaves like a well-adapted iPhone app (Priority: P2)

On iPhones with a notch, Dynamic Island or home indicator, staff can see and reach all content and controls. The
keyboard never hides the field being typed into and can always be dismissed. Swipe-back gestures behave
predictably. Permission prompts explain their purpose, and denial leaves a working app. Light and dark themes look
correct.

**Why this priority**: These differences are the most likely iOS-specific failures (E-09 to E-13). They cut across
every module, but each one degrades rather than blocks a workflow.

**Independent Test**: Use the platform-UX checklist (safe areas, keyboard, gestures, sheets, permissions, themes)
on the full-verification screens. Use each available test iPhone, aiming at the smallest and largest screen sizes
in the supported range (SC-002).

**Acceptance Scenarios**:

1. **Given** an iPhone with a notch or Dynamic Island, **When** any full-verification screen is shown, **Then** no
   header, title, button or essential content sits under the status bar, cutout or home indicator, or behind the
   floating tab bar (KL-UI-001).
2. **Given** a text or numeric field in a full screen, bottom sheet or modal, **When** it is focused, **Then** it
   stays visible above the keyboard, and the keyboard can be dismissed without submitting the form (KL-UI-002,
   KL-UI-003).
3. **Given** a screen where Android intercepts the back action (for example, closing an open escape-room game),
   **When** the iOS user swipes back, **Then** the outcome matches the Android back action, or an approved
   platform difference is recorded (KL-PHOTO-012).
4. **Given** a feature that needs camera, photo-library, calendar or notification access, **When** the user denies
   access, **Then** the app explains what is unavailable and offers a path to Settings. All unrelated
   functionality keeps working and nothing crashes. **Given** the user grants only limited photo-library access,
   **Then** the selected photos are usable.
5. **Given** the app's light, dark or system theme setting, **When** the device appearance changes, **Then** the
   app follows the same theme rules as on Android, and the status bar stays legible.

---

### User Story 6 — Release and update safety across platforms (Priority: P2)

Developers can publish JavaScript updates and binaries for each platform without one platform's update reaching
the other by accident. iOS users follow the same optional and mandatory update rules as Android users, with an
iOS-appropriate action, and are never offered the Android-only installer (RD-08).

**Why this priority**: An update that reaches an incompatible binary can crash the whole installed fleet. An iOS
forced-update lockout would stop every iOS user (KL-PLAT-004, KL-PLAT-005).

**Independent Test**: With test builds of both platforms installed, publish an authorized test update scoped
according to the approved channel strategy, and confirm which installs receive it. Configure the iOS version
record as approved, and confirm the iOS update prompt behaviour.

**Acceptance Scenarios**:

1. **Given** installed Android and iOS builds, **When** an update is published for one platform only, **Then** the
   other platform's installs do not receive it.
2. **Given** a binary that lacks native capabilities required by a newer update, **When** that update is
   published, **Then** the binary does not receive it.
3. **Given** an iOS install below an active iOS version record's latest version, and the update is optional,
   **When** the app launches, **Then** the optional prompt and deferred notice follow BR-UPDATE-003. Its action opens
   the record's approved iOS distribution link, and no APK download or installer is shown or invoked.
4. **Given** an iOS install that the iOS version record requires to update (below the minimum, or forced with an
   update available, BR-UPDATE-001), and a verified, accessible iOS distribution link, **When** the app launches,
   **Then** it is blocked as on Android (BR-UPDATE-002), and the action opens the approved iOS distribution link.
5. **Given** a required iOS update whose link is missing, invalid or inaccessible, **When** the app launches,
   **Then** the mandatory policy is still applied, the user sees an administrator-contact message, no installer is
   invoked, and the condition is reported as a **release configuration failure**.
6. **Given** no active iOS version record, or an unreachable version endpoint, **When** the iOS app launches,
   **Then** it is never blocked and the session is not ended (BR-UPDATE-005).
7. **Given** the Android update flow, **When** the change set is complete, **Then** Android optional, mandatory and
   in-app install behaviour is unchanged (FR-052).

---

### User Story 7 — Device-integrated features on iPhone (Priority: P3)

Staff use features that depend on device capabilities: taking customer photos and delivering them, exporting CSV
files through the share sheet, printing waivers and QR codes, saving QR codes and
photos to the photo library, adding a purchase to the device calendar, copying links and codes, picking images
and documents for upload, and opening phone, email and web links.

**Why this priority**: These features matter but are lower-frequency or have a manual fallback. Except where they
are part of a full-verification workflow (for example, scan-from-image at check-in, or printing and export from
waiver records), they are verified at smoke depth (FR-021). Push notifications are tier F and are covered in User
Story 2 (FR-026).

**Independent Test**: Exercise each capability once on a physical iPhone. Record pass, fail, blocked by prerequisite
or approved limitation for each capability, labelled as smoke-level evidence.

**Acceptance Scenarios**:

1. **Given** consent has been recorded (BR-PHOTO-001), **When** staff capture a customer photo with the iPhone
   held vertically, and separately held horizontally, **Then** the app interface stays portrait. The saved photos
   are portrait and landscape respectively, both meet the capture rule (16:9, up to 4K, existing fallback, iOS
   preset exception, BR-PHOTO-010), and after upload the matching portrait or landscape frame version is applied
   (FR-037, BR-PHOTO-011, KL-PHOTO-010).
2. **Given** an escape-room game, **When** staff take the group photo held vertically, and separately held
   horizontally, **Then** the saved orientation and the applied frame match how the device was held (FR-037).
3. **Given** the same captures on a physical Android device, **When** they run, **Then** the observed orientation
   and frame results are recorded. A difference from the iOS result, or from FR-037, is documented and taken to the
   developers. Android camera behaviour is not changed without approval.
4. **Given** an image chosen from the library in a high-efficiency format, **When** it is uploaded, **Then** the
   Backend accepts it or the user sees a clear error. Nothing fails silently (KL-PHOTO-009).
5. **Given** an export, **When** staff share it, **Then** the iOS share sheet offers the file with the correct
   type. Cancelling the share sheet causes no error.
6. **Given** a print action, **When** staff print, **Then** the iOS print dialog appears. Cancelling it, or having
   no printer, causes no error.
7. **Given** a calendar add, **When** permission is granted, **Then** the event is added to the default calendar.
   **When** permission is denied, **Then** the user is told why.

---

### User Story 8 — Guest kiosk screens on iPhone (Priority: P2)

A staff member launches the waiver kiosk or the escape-room guest kiosk on an iPhone and hands the device to a
guest, who completes signing or check-in.

**Why this priority**: Both kiosks are tier F (RD-10, approved 2026-11-27). They put a signed-in staff device in a
member of the public's hands, and they carry existing security items (KL-PHOTO-002, KL-WAIVER-007, KL-WAIVER-010).

**Independent Test**: In an approved test environment (FR-064), launch each kiosk on a physical iPhone and complete
its guest workflows end to end (FR-027). Then attempt every available iOS exit route, and record whether any staff
functionality, customer data or other security-sensitive area becomes reachable.

**Acceptance Scenarios**:

1. **Given** a staff member has launched the waiver kiosk (session or walk-in mode), **When** a guest completes
   signing, including the returning-guest lookup and the post-waiver ads where configured, **Then** the waiver
   result matches the same workflow on Android with equivalent inputs (FR-073; BR-WAIVER-010 to BR-WAIVER-012).
2. **Given** a staff member has launched the escape-room kiosk, **When** a guest completes room, time and waiver
   check-in, **Then** the result matches the same workflow on Android with equivalent inputs (FR-073).
3. **Given** a guest is using either kiosk, **When** they try every available iOS exit route (edge swipe-back,
   other system navigation gestures, the kiosk's own exit control without a staff action, backgrounding and
   returning), **Then** each attempt and its outcome is recorded.
4. **Given** any exit attempt or kiosk screen, **When** it gives the guest access to staff functionality, customer
   data belonging to other guests, or another security-sensitive area, **Then** the finding is reported as a
   **readiness blocker** with its evidence level. This applies even if Android shows the same weakness. iOS
   readiness is not declared until a developer resolves the finding.
5. **Given** the kiosks on Android, **When** the change set is complete, **Then** their Android behaviour is
   unchanged unless a developer approves a change made to resolve a blocker.

---

### Edge Cases

- **Permanent permission denial**: the user selected "Don't Allow" earlier and the system no longer prompts. The
  app must detect this and offer the Settings path, not a dead button.
- **Limited photo access**: the user granted access to selected photos only. Image pick, QR-from-image and
  save-to-photos must still behave sensibly.
- **Notification permission denied or push unavailable** (prerequisite missing): sign-in and every non-push
  workflow are unaffected, and no error loop occurs. Push scenarios that can't run are reported as blocked.
- **Notification for a previous account**: it arrives after sign-out, an account switch or an involuntary session
  teardown (KL-SEC-005), or a tap is queued from before the switch. It must not be delivered or opened in the new
  session. Observed delivery to a signed-out account is a readiness blocker.
- **Notification tap for an inaccessible record**: the record belongs to another location or is outside the role.
  No data is shown, and the refusal is handled gracefully.
- **Reinstall after complete deletion**: iOS secure storage may survive an app deletion. The reinstalled app must
  start clean (FR-041, RD-09). This must not be confused with app updates, OTA updates, restarts, resuming or
  offloading, which must not clear the session or saved accounts.
- **Deletion and reinstall while signed in with push registered**: the old installation's push registration must
  not lead to notifications for the old account being opened in the new installation (FR-026).
- **OS terminates the backgrounded app**, including during a card payment or a 4K photo capture (KL-PHOTO-007).
  On return, the outcome matches the defined expectation for that scenario (FR-065), and no success is shown
  without server confirmation.
- **Sideways capture saved as portrait**: the device was held horizontally but the photo is saved as portrait, or
  the saved orientation is ambiguous, so the wrong frame version is applied (KL-PHOTO-010). This fails FR-037.
- **Device turned during capture**, or held flat or face-up, where orientation is ambiguous: the saved orientation
  must still be either portrait or landscape and consistent with the frame applied.
- **Android saves sideways shots differently from FR-037**: this is documented as a discrepancy for a developer
  decision, and Android is not silently changed.
- **Duplicate submission**: a double tap or repeated submit during a sale or charge.
- **Kiosk escape that also exists on Android**: a guest reaches the staff app or another guest's data from a kiosk,
  and the same route exists on Android (documented: KL-PHOTO-002, KL-WAIVER-007). It is still a readiness blocker
  (FR-027). Android parity does not excuse it.
- **Partial failure**: the charge succeeds but the record update fails, or the record is created but the charge
  fails, and rollback follows BR-PAYMENT-003 and BR-PAYMENT-005.
- **Swipe-back** during an unsaved form, an open game, a kiosk, or right after sign-in or sign-out: the user must
  never navigate back into an authenticated screen after sign-out, or into the login screen after sign-in.
- **Keyboard over bottom-sheet inputs, and number pads with no dismiss key** (KL-UI-002, KL-UI-003).
- **A prompt triggered while a sheet is open** never appears, and the save hangs (KL-UI-011).
- **Rapid modal sequences** that rely on fixed delays fail to present on iOS (KL-UI-010).
- **An Android-targeted update reaches iOS** (KL-PLAT-004), or an update reaches a binary without its native code
  (KL-PLAT-006).
- **A mandatory iOS version record is activated** with a missing, invalid or inaccessible distribution link, or
  before iOS update behaviour is implemented (KL-PLAT-005). The mandatory policy holds, the administrator-contact
  message is shown, and the condition is a release configuration failure. Activation is preceded by link
  verification (FR-062).
- **The iOS distribution link works only for some users**, for example devices not authorized under the
  distribution method. The link's accessibility to the intended users must be verified before a mandatory update
  is activated.
- **An unauthorized device** attempts installation, or the distribution signing profile or certificate expires.
  The app stops installing or launching on test devices, and the cause must be diagnosable.
- **The build targets the wrong Backend environment**, for example production when a test environment was intended
  (KL-OPS-001).
- **A test prerequisite is unavailable** (test environment, sandbox, Apple account, test device): the dependent
  scenarios are reported as blocked, never as passed.
- **Large system text size**: content stays usable. Accessibility must be no worse than on Android (KL-UI-012).
- **Device appearance changes while the app is open**.
- **iPad use**: iPad is out of scope (RD-04). If the iPhone app is installed on an iPad, it is unsupported and
  unverified, and must not be described as supported.
- **Low storage** during an export, photo save or large image upload: the user sees a clear error and no partial
  record is created.
- **Share or print sheet cancelled, or no printer available.**

## Requirements *(mandatory)*

### Functional Requirements

**A. Shared codebase and consistent behaviour**

- **FR-001**: The iOS app MUST come from the same application codebase as the Android app. Modules MUST NOT be
  duplicated per platform. Platform-specific behaviour MUST be limited to cases where native behaviour requires it,
  and each case MUST be recorded with its justification (Principle V).
- **FR-002**: Business rules, calculations, validations, state transitions and permission-dependent UI MUST produce
  the same outcomes on iOS and Android. A difference is allowed only when this specification, or a later approved
  amendment to it, records it as an approved platform difference.
- **FR-003**: The iOS app MUST use the same Backend API contracts as Android. This feature MUST NOT introduce new
  endpoints, contract changes, Backend changes or Web Admin changes. A Backend capability found to be required MUST
  be reported as a cross-repository dependency.
- **FR-004**: Every approved platform difference and iOS-specific limitation MUST be recorded in the project
  documentation and known-limitations register when the feature is implemented (Principle IX).

**B. App identity, build, installation and prerequisites**

- **FR-010**: The iOS app MUST have its own developer-approved identity (RD-01): a bundle identifier, a display
  name, and the ZapZone branded icon, which replaces the template icon (KL-PLAT-001, KL-PLAT-002).
  [NEEDS CLARIFICATION: Which bundle identifier and display name does the iOS app use? Proposed: `com.zapzone.analytics`. Needed before the first build. (RD-01)]
- **FR-011**: Developers MUST be able to build, sign and install the iOS app using only Windows workstations, the
  cloud build service and physical Apple test devices. No step may require a local macOS machine.
- **FR-012**: Every build, signing-credential creation or change, device registration, update publication,
  distribution and store submission MUST be explicitly authorized by a developer for that specific action
  (Principles VIII and X).
- **FR-013**: Signing certificates, provisioning material, push keys and account credentials MUST NOT appear in the
  repository, documentation, logs or error reports. They are held only by the approved Apple Developer account
  (RD-02) and the build service's credential storage.
- **FR-014**: The initial iOS release MUST support **iPhone only** (RD-04). iPad support and tablet-specific layouts
  are out of scope. The minimum supported iOS version MUST be the lowest version compatible with the existing SDK,
  React Native version, native dependencies and approved build configuration (RD-03). The exact value MUST be
  established by technical verification during planning and recorded with its evidence. The inferred 15.1 (E-17)
  is a candidate only. Reaching a lower or different minimum MUST NOT involve an SDK or React Native upgrade without
  separate approval.
- **FR-015**: The app MUST be installable on authorized physical test iPhones through the developer-approved
  initial distribution method (RD-05). This feature MUST NOT include a TestFlight or public App Store release unless
  it is separately approved.
  [NEEDS CLARIFICATION: Which method distributes the first iPhone test builds? Proposed: authorized internal distribution to registered devices. Needed before plan approval and the first build. (RD-05)]
- **FR-016**: Every iOS build configuration used for testing MUST produce a build that installs and launches.
  Configurations known to be broken (KL-PLAT-003) MUST be fixed or excluded before they are used for iOS.
- **FR-017**: The iOS app MUST declare a usage explanation for every protected capability it actually uses
  (camera, photo-library read, save-to-photos, calendar, notifications). Each explanation MUST describe the actual
  use. For example, the save-to-photos text must cover customer photos as well as QR codes (KL-PHOTO-006). The app
  MUST NOT declare, or prompt for, capabilities it does not use (for example microphone, location or biometrics)
  (KL-PLAT-007).
- **FR-018**: The prerequisites for building and testing MUST be documented as a developer checklist before the
  first build, each with its verification status. The list covers:
  - Apple Developer Program membership, account ownership and team roles;
  - signing credentials and provisioning;
  - the app identity;
  - test-device authorization;
  - per-role test accounts;
  - the test Backend environment and payment sandbox;
  - push credentials (required, because push is tier F, FR-026).

  Their availability is currently **unverified** (E-18, E-19). This specification assumes neither that they exist
  nor that they do not.

**C. Existing functionality compatibility**

- **FR-020**: The **full-verification** workflows (tier F, see "Module Coverage") MUST work on a physical iPhone
  with the same business outcome as on Android, and MUST be verified end to end on a physical iPhone. Tier F
  covers:
  - authentication, sessions and saved accounts;
  - role-based navigation and location scoping;
  - the dashboard and **all primary app tabs**: Home, Location, Activity, Calendar (the Dashboard Calendar),
    Accounts, and the Quick Nav centre control;
  - check-in;
  - bookings: list, details, create, edit, manual booking and the Booking Calendar;
  - onsite sales including card payment;
  - customers;
  - waivers: records, details and check-in;
  - memberships;
  - both guest kiosks (FR-027);
  - push notifications (FR-026).

  A tier F workflow whose verification depends on an unavailable prerequisite (FR-064) MUST be reported as blocked
  and not as verified. Initial iOS readiness MUST NOT be declared while any tier F workflow is blocked or failing.
- **FR-021**: Every other existing module MUST at least receive a **smoke check** on a physical iPhone, unless a
  developer approves a different level: it opens, loads its data, and dismisses without a crash. A smoke check is
  **not** full functional verification. Its result MUST be reported as "smoke-checked", never as "verified" or
  "supported". A module that fails its smoke check is either fixed within this feature or recorded as a
  developer-approved iOS limitation. No module may be left unclassified.
- **FR-022**: No module may be described as iOS-supported without a successful iOS build and physical-device
  evidence for its workflows. Android success MUST NOT count as iOS evidence (Principle V).
- **FR-023**: Functionality that is Android-only by design (in-app binary download and installation, the "install
  unknown apps" settings link) MUST NOT be offered on iOS.
- **FR-024**: Role-based tabs, Quick Nav, module entry points and location scoping MUST match Android
  (BR-ROLE-001, BR-ROLE-002, BR-LOCATION-001 to BR-LOCATION-004). They remain user-experience controls, and Backend
  authorization stays authoritative.
- **FR-025**: Data from one account or location MUST NOT appear after an account switch, sign-out or location
  switch on iOS, including cached data and data restored after the OS terminates the app (BR-SESSION-005).
- **FR-026**: Push notifications are **required** for initial iOS readiness and MUST receive full physical-iPhone
  verification (tier F, RD-13). The verification covers:
  - notification permission requests and denial handling;
  - device registration for eligible roles only (BR-ROLE-003);
  - delivery and presentation in the foreground, background and terminated app states;
  - tap routing to the mapped screen (BR-NOTIF-003);
  - device unregistration on sign-out before token revocation (BR-AUTH-004);
  - account isolation across saved-account switching;
  - no unauthorized access through notification routing;
  - no delivery to, or opening for, a previously signed-in account.

  Existing business rules, Backend authorization and Android notification behaviour MUST be preserved. Apple push
  credentials are a required operational prerequisite whose availability is unverified (E-08). Push scenarios that
  can't run without them are reported as blocked, and readiness is not declared while they are blocked. Security
  failures observed during verification, including existing weaknesses such as KL-SEC-005, are reported with their
  evidence level and are readiness blockers. Remediating unrelated existing defects is not added to scope without
  developer approval.
- **FR-027**: Both guest kiosks (the waiver kiosk and the escape-room check-in kiosk) MUST receive full
  physical-iPhone verification (tier F, RD-10). The verification covers:
  - complete guest workflows, with outcomes matching Android (FR-073);
  - iOS-specific exit-gesture checks.

  Existing kiosk functionality and Android behaviour MUST be preserved. A comprehensive kiosk lock-down
  implementation is out of scope. If verification reveals that a guest can reach staff functionality, customer
  data or another security-sensitive area, the finding MUST be reported as a **readiness blocker**, with its
  evidence level, even if the same weakness exists on Android. It MUST NOT be accepted as an iOS limitation without
  explicit developer resolution (Principle III).
- **FR-028**: Verification tiers set verification depth only. They MUST NOT be used to remove, hide or disable
  existing functionality on either platform. Removing or hiding a module on iOS needs an approved platform
  difference (FR-002). Changing a module's tier needs explicit developer approval.

**D. Platform-specific user experience**

- **FR-030 Safe areas**: On every supported iPhone size in portrait, no interactive or essential content may be
  obscured by the status bar, display cutout, Dynamic Island, home indicator or floating tab bar (KL-UI-001).
  Android layout and spacing MUST NOT change.
- **FR-031 Keyboard**: Every focused input in a screen, bottom sheet or modal MUST stay visible above the keyboard,
  and every keyboard type, numeric pads included, MUST be dismissible without submitting (KL-UI-002, KL-UI-003).
- **FR-032 Navigation and gestures**: System back gestures MUST give outcomes consistent with the Android back
  action in the same context. This includes screens where Android intercepts back (KL-PHOTO-012) and the
  account-switch flow. Gestures MUST NOT bypass a confirmation that Android shows. They MUST NOT return the user
  to an authenticated screen after sign-out, or to the login screen after sign-in.
- **FR-033 Modals and sheets**: Prompts raised during an operation MUST be visible and actionable whatever sheet
  or modal is open, and the operation MUST finish or cancel, never hang (KL-UI-011). Sequential modals MUST present
  reliably on iOS (KL-UI-010).
- **FR-034 Permissions**: Each OS permission MUST be requested at the point of use, not at launch. Denial,
  permanent denial and limited photo access MUST each leave the app usable, with an explanation and a path to
  Settings where recovery is possible.
- **FR-035 Themes**: Light, dark and system theme behaviour MUST match Android, including the in-app theme
  setting. System status-bar content MUST stay legible in both themes.
- **FR-036 Camera**: Live QR scanning and QR-from-image MUST work on iOS (KL-CHECKIN-004). Photo capture MUST meet
  the existing capture-quality rule with its documented iOS exception (BR-PHOTO-010).
- **FR-037 Orientation** (RD-11, approved 2026-11-27):
  - The app interface MUST stay portrait-locked on iOS, as on Android (E-03). Camera screens MUST NOT rotate, and
    no camera change unrelated to these requirements is in scope.
  - Customer photos and escape-room group photos captured with the device held horizontally MUST be saved with
    correct landscape orientation. Those captured with the device held vertically MUST be saved with correct
    portrait orientation (KL-PHOTO-010).
  - The existing capture rule MUST be preserved: 16:9, up to 4K, with its existing fallback and documented iOS
    preset exception (BR-PHOTO-010).
  - The saved photo's effective orientation MUST be recognized correctly by the existing Backend frame selection,
    so the matching portrait or landscape frame version is applied (BR-PHOTO-011).
  - Android camera behaviour MUST be preserved, and its orientation results MUST be verified on a physical Android
    device, not assumed. An Android discrepancy is documented and taken to the developers, not silently changed.

  Orientation detection, image metadata, image processing and camera configuration are planning decisions.
- **FR-038 Accessibility**: iOS accessibility MUST be no worse than Android's. This covers screen-reader labels on
  controls changed by this feature and usability at larger system text sizes on full-verification screens
  (KL-UI-012).

**E. Security and data integrity**

- **FR-040**: Authentication tokens and session state MUST be stored on iOS only in the operating system's secure
  storage (Principle III).
- **FR-041**: Session and account behaviour MUST match current Android behaviour: the inactivity window, resume,
  saved accounts, 401 teardown and sign-out ordering (BR-AUTH-004 to BR-AUTH-006, BR-SESSION-001 to
  BR-SESSION-005). This feature MUST NOT change any session or authentication policy value, including session
  timeout, password-free saved-account switching and token expiry. KL-SEC-001, KL-SEC-002 and KL-ARCH-001 remain
  open and are outside this feature's scope.

  **Clean start after reinstall (RD-09, approved 2026-11-27).** After the app is **completely deleted and
  reinstalled**, the new installation MUST NOT restore any of the following, and the user MUST authenticate again
  before reaching protected functionality:
  - an authenticated session or authentication token;
  - a saved-account list or saved credentials;
  - an active-location selection;
  - account-linked cached data or any other account-linked state.

  Non-sensitive display preferences, such as the theme, MAY reset.

  The clean start MUST NOT be triggered by any of the following, which MUST keep sessions and saved accounts as the
  existing policy allows:
  - a normal app restart;
  - backgrounding and resuming, including after the OS terminates the app;
  - a native app update installed over the existing app;
  - a compatible OTA update;
  - iOS app offloading and its reinstallation.

  Preservation across these events remains subject to the existing session-expiry, token-revocation and
  authorization policies. It never revives an expired session, a revoked token or an account the server refuses.

  The equivalent Android behaviour MUST be verified on a physical device, not assumed. If it differs, the
  difference is reported as a cross-platform discrepancy for a developer decision and is not silently changed. How
  a fresh installation is detected and how persistent secure storage is handled are planning decisions.
- **FR-042**: The feature MUST NOT add or change any client-supplied scope identifier for authorization. Backend
  authorization and tenant isolation stay authoritative. Existing tenant-scoping items stay as documented and MUST
  NOT be presented as resolved.
- **FR-043**: Files containing customer or staff data (exports, cached reports, downloaded photos) MUST NOT be
  more exposed on iOS than on Android. They MUST NOT be visible to the user or other apps except through an action
  the user starts (share, save, print), and MUST NOT be worse than the existing KL-SEC-004 behaviour.
- **FR-044**: Payments on iOS MUST follow BR-PAYMENT-001 to BR-PAYMENT-005:
  - card data goes only to the processor's tokenization service;
  - success is shown only after server confirmation;
  - unknown outcomes keep the record;
  - each sale has exactly one checkout key.

  Two properties are distinct, and each MUST be verified on its own; neither may be inferred from the other:
  - **record-level idempotency**: no duplicate booking, purchase or payment record for one sale;
  - **charge-level idempotency**: no duplicate card charge for one sale.

  No platform payment method (for example a wallet) is added. KL-PAYMENT-006 (charge handler not reviewed) remains
  open. Passing the defined scenarios (FR-065) is evidence for those scenarios only, not proof that duplicates
  cannot occur under other conditions.
- **FR-045**: iOS support MUST NOT add logging or error reporting of tokens, credentials, card data, push tokens or
  customer data.
- **FR-046**: On iOS, only eligible roles register for push (BR-ROLE-003). Sign-out unregisters the device before
  revoking the token (BR-AUTH-004). A push token or notification content MUST NOT be logged or exposed (FR-045).
  KL-SEC-005 (involuntary teardown does not unregister) remains a documented item. If verification observes
  delivery to a signed-out device, it is a readiness blocker under FR-026.
- **FR-047**: If evidence of repository, build or environment compromise appears during this feature, affected
  work MUST stop and be reported before any tooling runs (Principle III).

**F. Android regression protection**

- **FR-050**: The Android app identity MUST stay unchanged: package name, app name, icon, versioning sequence and
  signing.
- **FR-051**: The Android permission set MUST stay unchanged unless a developer approves each individual change.
  The before and after lists MUST be compared and recorded.
- **FR-052**: Android runtime compatibility, update channels and the in-app binary update flow MUST keep working
  as before (BR-UPDATE-001 to BR-UPDATE-005).
- **FR-053**: Android regression protection is mandatory, whatever the iOS verification tiers are. A change to
  shared code or configuration made for iOS MUST be verified on a physical Android device before the feature is
  declared complete. The **Android regression workflow set** is the tier F workflows plus the in-app binary update
  flow, and it is subject to the same environment restrictions (FR-064).

**G. Release and update compatibility**

- **FR-060**: Android and iOS binaries MUST coexist so that each OTA update reaches only the platforms, channels
  and runtimes it was published and verified for. The channel and environment structure MUST follow the approved
  strategy (RD-06, KL-PLAT-004).
- **FR-061**: No OTA update may reach a binary that lacks the native capabilities the update requires. Every
  native change for iOS support MUST ship in new binaries, with a recorded runtime-compatibility assessment
  (Principle VIII, KL-PLAT-006).
- **FR-062**: iOS MUST apply the same optional and mandatory update policies as Android (BR-UPDATE-001 to
  BR-UPDATE-003, BR-UPDATE-005), with an iOS-appropriate action (RD-08, approved 2026-11-27):
  - The Android APK download and installation mechanism MUST NOT be shown or invoked on iOS (FR-023).
  - The update action MUST use the applicable **iOS** version record and its approved iOS-compatible distribution
    link.
  - The distinction between optional and mandatory updates MUST be preserved, and a mandatory update MUST NOT be
    silently bypassed on iOS.
  - Before a mandatory iOS update is activated, the distribution link and its accessibility to the intended users
    MUST be verified. This is an authorized operational step.
  - If a required update's link is missing, invalid or inaccessible, the mandatory-update policy MUST still apply.
    The app shows an administrator-contact message, and the condition MUST be reported as a **release
    configuration failure** (KL-PLAT-005).
  - Android update behaviour MUST stay unchanged (FR-052).

  The iOS distribution method (RD-05), link handling, release configuration and implementation are left to later
  decisions and planning.
- **FR-063**: Each change delivered by this feature MUST carry a release-impact classification: JavaScript or
  asset, native dependency, native configuration, runtime version, or new binary.
- **FR-064**: Device testing MUST use only a Backend environment that a developer has authorized for that testing.
  The **preferred** environment is a non-production Backend with synthetic data and processor sandbox mode for card
  payments (RD-07). Whether such an environment exists is **unknown**, and it is an open operational prerequisite.
  Until an appropriate environment and testing authorization are confirmed:
  - no state-changing operation may be performed against a live environment;
  - no real payment may be processed;
  - no production customer record may be created, modified or deleted;
  - production read-only access MUST NOT be treated as risk-free, and it needs explicit authorization plus
    appropriate data-handling and privacy safeguards;
  - payment and other state-changing workflows MUST NOT be declared fully verified.

  Specification and technical planning MAY proceed conditionally, but initial iOS readiness needs the applicable
  verification evidence.
- **FR-065**: Payment verification MUST run these defined, observable scenarios on iOS, and on Android as the
  comparison, in an approved environment with sandbox processing:
  - **P-1** approved charge;
  - **P-2** declined card;
  - **P-3** processor or network timeout producing an unknown outcome;
  - **P-4** user retry after a failed or unknown outcome;
  - **P-5** duplicate submission (repeated tap or submit);
  - **P-6** app backgrounded, and separately terminated by the OS, during the charge;
  - **P-7** partial failure (record created but charge failed, or charge succeeded but the record update failed),
    including the rollback behaviour in BR-PAYMENT-003 and BR-PAYMENT-005.

  For each scenario, the expected outcome MUST be defined before testing. The report MUST record the observed
  number of processor transactions (charge level), the observed server records (record level), the final payment
  status, and the message shown to the user. Each scenario is reported as passed, failed or blocked.

**H. Verification and reporting**

- **FR-070**: Verification reports MUST keep separate: source verification, existing tests, tests actually run,
  passing tests, build verification, runtime verification and physical-device verification per platform
  (Principle VII).
- **FR-071**: Changed business logic in unit-testable modules MUST get focused regression tests. The project checks
  (tests, lint, type-check) MUST pass with no new errors.
- **FR-072**: The final report MUST classify every existing module and workflow, for each platform, as exactly one
  of the following, and MUST report each category separately:
  - **fully verified** (tier F evidence);
  - **smoke-checked**;
  - **approved deferral** (with the approving developer and date);
  - **unsupported**: an approved platform difference or not applicable, for example the in-app installer on iOS;
  - **blocked by prerequisite** (which prerequisite);
  - **unverified** (with the reason).

  A blocked or unverified item MUST NOT be reported as passed.
- **FR-073**: Comparisons of iOS and Android outcomes MUST use equivalent inputs: the same role, location, records,
  dates, items, quantities and payment scenario. They MUST compare the relevant business outcomes: records created
  or changed, status transitions, amounts, check-in state, and the messages shown. Values that legitimately differ
  per run, such as identifiers and timestamps, are not compared.

### Module Coverage

Tiers (approved 2026-11-27, RD-12):
- **F**: full physical-device verification on iOS, plus Android regression.
- **S**: smoke check (opens, loads, dismisses without crash; not full verification).
- **N/A (iOS)**: Android-only by design.

**Required level vs. actual status**: the tier column states the verification each module **must receive**. It
does not say the module has been verified. The current iOS verification status of **every** row is **not
verified** (E-16). Actual results are recorded only in the verification report, using the FR-072 categories.

Every module in the feature catalog appears below. The tier F granularity is the one the developers confirmed on
2026-11-27 (see Clarifications). Other modules in the same domains are tier S unless a developer approves
otherwise.

| Feature-catalog modules | Required tier | iOS-sensitive concerns | References |
|---|---|---|---|
| Login; sign-out; session expiry and 401 handling; saved accounts and account switching (Accounts tab) | F | Secure storage, resume, termination, reinstall persistence, swipe during the switch bridge | BR-AUTH-*, BR-SESSION-*, KL-ARCH-001, KL-SEC-001/002 |
| Tabs and Quick Nav (role-based navigation, including the Quick Nav centre control); location selection and switching | F | Safe areas, floating tab bar. The centre slot's placeholder screen is reachable by deep link (KL-UI-005, out of scope, must not worsen). | BR-ROLE-*, BR-LOCATION-*, KL-UI-005 |
| Home dashboard; Location tab; Activity tab; Dashboard Calendar tab | F | Safe areas, polling on resume, calendar gestures | KL-ADMIN-001/002 |
| Check-In desk (camera scan, scan from image, guest lookup, admit ticket/order/event/membership/waiver) | F | Camera and photo permissions | BR-CHECKIN-*, KL-CHECKIN-004 |
| Manage Bookings (list); Booking details (including check-in); Create Booking; Edit Booking; Manual Booking; Booking Calendar; booking data layer | F | Keyboard, sheets, prompt hosts, card payment at checkout | BR-API-002/003, BR-PAYMENT-*, KL-UI-002/011 |
| Create Purchase / bulk checkout (attractions); Event onsite purchase; card charge pipeline | F | Keyboard, backgrounding during a charge | BR-PAYMENT-001–005, KL-PAYMENT-006 |
| Customers (list, add, edit) | F | Keyboard | — |
| Waiver Records (list, details, check-in) | F | Sheets, keyboard, print, export | BR-WAIVER-001–004 |
| Waiver kiosk; escape-room guest kiosk | F (FR-027) | Exit gestures, staff-app reachability, guest data exposure | BR-WAIVER-010–012, KL-PHOTO-002, KL-WAIVER-006/007/010 |
| Memberships (list, details, check-in, add member with card charge) | F | Sheets, keyboard, card payment | BR-CHECKIN-005, BR-PAYMENT-* |
| Profile; Settings; User Management hub; Manage Accounts; Attendants Management; Employee PINs; Activity Log; Analytics hub; Performance, Accounting and Page Analytics; Payments (list, refund/void, deleted, invoices) | S | Exports (share sheet), image picker, clipboard | per catalog |
| Bookings hub; Space Schedule; Location Requests; Day Offs | S | Calendar gestures, sheets | per catalog |
| Attractions hub; Manage Attractions; Attraction purchases; Bulk Orders; Events hub; Manage Events; Event purchases; Registration Forms | S | Image and document pickers, QR save, exports | per catalog |
| Packages and Pricing hubs; Manage Packages; Create/Edit Package; Custom Packages; Add-ons; Space; Global Notes; Gift Cards; Promos; Special Pricing; Fee Supports | S | Document picker, keyboard | per catalog |
| Customers hub; Customer Analytics; Customer Concerns; Visitor Tracking; visit follow-up email cards | S | External links, exports | per catalog |
| Waivers hub; Waiver Templates; Template Ads; Group Invites; Returning Customers; Waiver Reports; Deletion Log; Waiver Settings; Membership Plans; Membership Reports | S | Print, clipboard, image picker | per catalog |
| Photos hub; Take Photos; Photo Library; Delivery Log; Slideshow Queue; Photo Overlays; Photo Reports; Photo Settings; Escape Rooms | S, plus the targeted FR-037 orientation and frame check for Take Photos and escape-room group photos (SC-016) | Capture orientation and frame selection, memory, HEIC, save to photos, swipe vs back (KL-PHOTO-012) | BR-PHOTO-001/010/011, KL-PHOTO-007/009/010/012 |
| Email Campaigns; Email Templates; Email Notifications; SMS Notifications; Notifications inbox; Custom Fields | S | Keyboard, external links | per catalog |
| Push notifications: permission, registration, delivery in all app states, tap routing, unregistration, account isolation | F (FR-026) | Needs Apple push credentials (availability unverified); cold-start tap routing; delivery after sign-out | BR-ROLE-003, BR-AUTH-004, BR-NOTIF-003, KL-PLAT-010, KL-SEC-005 |
| App update gate (version check, prompt, notice) | Verified under US6 (RD-08 behaviour) | Forced-update dead end | BR-UPDATE-001–003/005, KL-PLAT-005 |
| In-app binary update download and install | N/A (iOS); Android regression set | — | BR-UPDATE-004 |

### Key Entities

- **iOS app identity**: bundle identifier, display name, icon, version and build number. It is distinct from the
  Android identity and must not change it.
- **Build profile**: a named build configuration (development, internal test, production) with its target
  platform, distribution method, update channel and Backend environment.
- **Release channel and runtime**: the pairing that decides which installed binaries receive an OTA update.
- **Platform version record**: the Backend's per-platform current, minimum and forced version information, which
  drives update prompts.
- **Test device**: a physical iPhone authorized under the distribution method, with its model, screen size and OS
  version.
- **Platform difference record**: a documented, approved difference between iOS and Android behaviour, with its
  justification.
- **Verification evidence record**: one per workflow per platform, with tier, evidence category, device, build,
  environment, result (passed, failed, blocked, smoke-checked) and date.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: At least one developer-authorized iOS cloud build completes from a Windows workstation, with zero
  steps performed on a macOS machine.
- **SC-002**: That build installs and launches to the login screen on 100% of the physical test iPhones actually
  used. The report MUST state two things separately:
  - the **supported range**: iPhone only, from the verified minimum iOS version (FR-014);
  - the **tested devices**: the model, screen size and iOS version of each device used.

  At least one physical iPhone is required. Testing SHOULD cover the smallest and largest screen sizes and the
  oldest and newest iOS versions in the supported range where such devices are available. Any part of the range
  with no tested device MUST be reported as unverified, not as passed.
- **SC-003**: 100% of tier F workflows pass on a physical iPhone for each staff role in scope (company admin,
  location manager, attendant). Their relevant business outcomes match the same workflows run on Android with
  equivalent inputs (FR-073). A tier F workflow blocked by a prerequisite counts as **not met** for initial
  readiness.
- **SC-004**: 100% of feature-catalog modules are classified for each platform under the FR-072 categories, with
  zero unclassified. Zero smoke-checked modules are reported as fully verified or supported. Zero existing modules
  are removed, hidden or disabled on either platform without an approved platform difference (FR-028).
- **SC-005**: Zero crashes are observed while executing the defined tier F verification scenarios on each test
  iPhone used, and zero while executing the smoke checks. This is a statement about the defined scenarios only.
- **SC-006**: 100% of iOS permission prompts correspond to a capability the app uses and describe that use
  accurately. Zero prompts appear for unused capabilities. 100% of denial paths leave the app usable without a
  reinstall.
- **SC-007**: On every test iPhone used, zero tier F screens have content obscured by system UI, zero focused
  inputs are hidden by the keyboard, and 100% of keyboards can be dismissed.
- **SC-008**: For each payment scenario P-1 to P-7 (FR-065), executed in an approved environment with sandbox
  processing, the observed results match that scenario's predefined expected outcome on both platforms:
  - the number of processor transactions;
  - the number of server sale and payment records;
  - the final status;
  - the message shown.

  Across all scenarios, zero unintended duplicate charges, zero unintended duplicate records and zero success
  messages without server confirmation are observed. If no approved environment exists, SC-008 is reported as
  **blocked**, not passed. A pass is evidence for the tested scenarios only.
- **SC-009**: Android identity and permission list show zero unapproved differences before and after. 100% of the
  Android regression workflow set (FR-053) passes on a physical Android device, and any workflow blocked by a
  prerequisite is reported as blocked. The project checks report zero new test, lint or type errors.
- **SC-010**: During release verification, the following are all observed:
  - zero OTA updates reach a platform, channel or runtime they were not published for;
  - 100% of the User Story 6 update scenarios behave as defined;
  - zero iOS update prompts show or invoke the Android installer;
  - zero mandatory iOS updates are bypassed;
  - every required iOS update with a missing, invalid or inaccessible link shows the administrator-contact message
    and is reported as a release configuration failure;
  - zero mandatory iOS updates are activated without prior verification of their link.
- **SC-011**: 100% of statements in the final verification report carry an evidence category (FR-070). Every
  deferred, unsupported, blocked and unverified item is listed in its own category with its reason (FR-072). Zero
  items whose prerequisites were unavailable are reported as passed.
- **SC-012**: Before the first iOS build, the developer prerequisites checklist (FR-018) exists and a developer has
  reviewed it. At completion, zero signing credentials, account secrets or tokens appear in the feature's diff,
  documentation or captured logs (FR-013). 100% of delivered changes carry a release-impact classification
  (FR-063). Every approved platform difference and iOS limitation is recorded in the project documentation
  (FR-004).
- **SC-013**: For each guest kiosk, 100% of its defined guest workflows pass on a physical iPhone with outcomes
  matching Android (FR-027, FR-073). 100% of the available iOS exit routes are attempted and recorded. Any observed
  access from a kiosk to staff functionality, other guests' customer data or another security-sensitive area is
  reported as a readiness blocker, and iOS readiness is not declared while such a blocker is unresolved.
- **SC-014**: For each eligible role, 100% of the push scenarios in User Story 2 (scenarios 8 to 14) pass on a
  physical iPhone, with outcomes matching Android where Android has an equivalent (FR-026). Specifically:
  - registration happens for eligible roles only;
  - a notification is presented and its tap routes correctly in each of the foreground, background and terminated
    states;
  - zero notifications are observed being delivered to, or opened for, an account after sign-out or an account
    switch;
  - zero taps are observed opening data the current account or location may not access.

  Any observed security failure is a readiness blocker. If Apple push credentials or the test environment are
  unavailable, SC-014 is reported as **blocked**, not passed.
- **SC-015**: In 100% of complete deletion-and-reinstallation runs on each test iPhone used (User Story 2 scenario
  15), zero sessions, tokens, saved accounts, active-location selections or account-linked data are observed after
  reinstallation. In 100% of restart, resume, native-update, OTA-update and offload runs (scenarios 16 to 18), zero
  unnecessary loss of the session or saved accounts is observed. A loss caused by session expiry, token revocation
  or server refusal is expected and is not counted as unnecessary, and offload runs that can't be exercised are
  reported as blocked. The Android deletion-and-reinstallation result (scenario 19) is recorded from a physical
  device, and any difference is reported.
- **SC-016**: On each test iPhone used, 100% of vertical captures are saved as portrait and 100% of horizontal
  captures are saved as landscape, for both customer photos and escape-room group photos. 100% of those uploads
  have the matching frame version applied. 100% meet the capture rule (BR-PHOTO-010). The app interface never
  rotates. The same captures on a physical Android device are recorded, and any discrepancy is reported for a
  developer decision. Captures that need the approved test environment (upload and frame application) are reported
  as blocked until it is available.

## Assumptions

- Developers work on Windows with VS Code and Claude Code. The existing cloud build and update service project
  continues to be used. This is the current environment, not a decision about channels or distribution (Approved:
  developer brief).
- Availability of Apple Developer Program membership, company account ownership, team access, signing
  credentials, registered test devices and Apple push credentials is **unverified** (E-19). This specification
  assumes neither that they exist nor that they do not. Each must be confirmed before the activity that needs it
  (Approved: developer, 2026-11-27).
- Availability of a non-production Backend, synthetic test data, a payment sandbox and an approved environment
  for state-changing tests is **unknown** (E-18). It is not assumed either way (Approved: developer, 2026-11-27).
- No React Native or Expo SDK upgrade is needed to support iOS at the current SDK. If one proves necessary, it is
  escalated as a separate decision (Approved: developer, 2026-11-27).
- The minimum iOS version is set by technical verification during planning (FR-014). 15.1 (E-17) is only an
  inferred candidate.
- iOS inherits the app's current languages, online-only operation model and theme options, with no iOS-only
  features.
- Session and authentication policy values stay exactly as on Android. Changing them requires a separate Full SDD
  feature (Approved: developer brief, constitution reserved decisions).
- No Backend or Web Admin change is needed. E-07 shows that the Backend already accepts `ios` for version records
  and push devices. Any Backend data change, such as activating an iOS version record, is an operational action
  requiring authorization, not a code change.
- Any environment used for state-changing tests must contain only synthetic, non-identifying data. This is a
  requirement (FR-064), not an observation about any existing environment.

## Scope Boundaries

**In scope**

- Running the existing app on **iPhone** from the shared codebase, with the iOS identity, permission explanations
  and platform adaptations needed for FR-001 to FR-073.
- Cloud iOS builds and installation on authorized physical test iPhones using the approved initial distribution
  method.
- Platform-specific UX adaptations (safe areas, keyboard, gestures, sheets, permissions, themes, camera and
  orientation) for iOS, without changing Android layout or behaviour.
- Release and update separation needed so the platforms coexist safely, and an iOS-appropriate update behaviour.
- Tiered iOS verification (F and S) of every existing module, and Android regression protection and verification.
- Documentation of platform differences, iOS limitations, verification results and developer prerequisites.

**Out of scope** (unless separately approved)

- iPad support, iPad-specific or tablet layouts, and iPad verification.
- A complete or partial visual redesign.
- React Native or Expo SDK upgrades.
- Removing, hiding or disabling existing functionality on either platform (FR-028).
- Unrelated architectural refactoring. This includes consolidating the two file-system APIs (KL-PLAT-008),
  removing unused packages (KL-PLAT-009) and migrating `Alert.alert` (KL-UI-004), except where a change is
  required for iOS to work.
- New business modules, or Web Admin parity work not caused by a platform difference.
- Any Backend or Web Admin modification.
- Changes to session, authentication, payment, deletion, export or other reserved business policies.
- Remediation of existing security, tenant-scoping or payment findings (for example KL-SEC-001/002/003/004/005,
  KL-ARCH-001, KL-PAYMENT-006).
- A comprehensive kiosk lock-down implementation (KL-WAIVER-007). A security-sensitive kiosk escape found during
  verification is nevertheless a readiness blocker (FR-027). How to resolve it is a developer decision at that
  point.
- TestFlight distribution, public App Store release, App Store listing and review submission.
- Platform payment methods (for example wallets), widgets, App Clips, Siri, biometrics and other iOS-only
  capabilities.
- Creating or provisioning a Backend test environment or payment sandbox. Their availability is a prerequisite,
  not a deliverable of this feature.

These exclusions do not permit ignoring a security or compatibility blocker. Any blocker found MUST be escalated
to the developers.

## Reserved Decisions

The constitution reserves these decisions for the developers. Current configuration values are **not** the
decision. Every open **product** decision carries an inline `[NEEDS CLARIFICATION]` marker (Principle II).
Operational prerequisites and planning items are tracked here only. "Proposed direction" text comes from the Phase 5 brief and is **for discussion only**. "Category" says
what kind of decision it is and when it blocks:

- **Product (spec)**: a product decision needed before the specification is approved.
- **Product (build)**: a product decision needed before the first authorized build.
- **Technical (plan)**: resolved and recorded during `/speckit-plan`.
- **Operational**: a prerequisite that may stay unverified until the activity that needs it is authorized.

| ID | Decision | Category | Status | Blocks | Recommendation / proposed direction (not a decision) |
|---|---|---|---|---|---|
| RD-01 | iOS bundle identifier and display name | Product (build) | Open | First iOS build | Proposed: `com.zapzone.analytics` as the iOS bundle identifier; preserve the Android identity. Confirm availability and company approval before the first build. Effectively permanent once a store record exists. |
| RD-02 | Apple Developer account ownership and team access | Operational | **Unknown**: availability unverified (E-19) | First iOS build; credential creation; device registration | Recommended: a company-owned account, with both developers holding team roles that can manage certificates and devices. Confirm availability, team access and signing authorization before use. |
| RD-03 | Minimum iOS version | Technical (plan) | **Rule approved** 2026-11-27; value pending technical verification | Plan approval | The lowest version compatible with the existing SDK, React Native, native dependencies and approved build configuration, with no upgrade. 15.1 is an inferred candidate only. |
| RD-04 | iPhone only, or iPhone and iPad | Product (spec) | **Approved** 2026-11-27: iPhone only | — | iPad support and tablet layouts are out of scope. |
| RD-05 | Initial distribution method; future TestFlight or App Store | Product (build) | Open | Plan approval; first iOS build | Proposed: authorized internal distribution to registered devices for initial physical-iPhone testing. TestFlight and App Store are separate decisions. |
| RD-06 | Channel, runtime and environment strategy | Technical (plan), with developer approval | Open | First OTA publish after iOS builds exist | Proposed: isolate iOS test updates from existing Android release workflows and preserve Android update compatibility. Exact channel and runtime configuration is set in planning. |
| RD-07 | Backend environment for device testing; payment test mode | Operational | **Unknown**: availability unverified (E-18); preferred approach recorded | Any device testing against a Backend; every state-changing and payment scenario; initial readiness | Preferred: a non-production Backend with synthetic data and processor sandbox. Production access of any kind, including read-only, needs explicit authorization and privacy safeguards (FR-064). |
| RD-08 | iOS app-update behaviour | Product (spec) | **Approved** 2026-11-27: Option A, same rules with an iOS-appropriate action | — | See FR-062, User Story 6 scenarios 3 to 7, and SC-010. The link-handling mechanism and release configuration are left to planning and RD-05. |
| RD-09 | Credential persistence and platform session behaviour on iOS (for example, after reinstall) | Product (spec) | **Approved** 2026-11-27: Option A, clean start after complete deletion and reinstallation | — | See FR-041, User Story 2 scenarios 15 to 19, and SC-015. Restarts, resuming, updates and offloading keep the session. The detection mechanism is a planning decision. Android behaviour is verified, not assumed. |
| RD-10 | Kiosk compatibility and scope (waiver kiosk, escape-room kiosk) | Product (spec) | **Approved** 2026-11-27: Option B, full verification of both kiosks | — | See FR-027 and SC-013. Comprehensive lock-down is out of scope. A security-sensitive kiosk escape is a readiness blocker even with Android parity. |
| RD-11 | Supported orientation; photo-capture orientation; escape-room workflow expectations | Product (spec) | **Approved** 2026-11-27: Option A, photos match how the device is held and the app stays portrait-locked | — | See FR-037, User Story 7 scenarios 1 to 3, and SC-016. Escape-room swipe-back stays under FR-032 (KL-PHOTO-012). The orientation-detection approach is a planning decision. |
| RD-12 | Initial feature coverage and acceptable iOS limitations | Product (spec) | **Approved** 2026-11-27 (Option A, with refined tier F granularity; kiosks via RD-10), except push (RD-13) | — | See FR-020, FR-021, FR-028 and "Module Coverage". |
| RD-13 | Push notifications in initial iOS readiness | Product (spec) | **Approved** 2026-11-27: Option A, required and fully verified | — | See FR-026, FR-046, User Story 2 scenarios 8 to 14, and SC-014. Apple push credentials are an operational prerequisite (RD-02, E-08). |

## Dependencies

- **Apple (availability unverified, E-19)**:
  - Apple Developer Program membership and team access (RD-02);
  - registration of the approved app identity (RD-01);
  - test iPhones authorized for the chosen distribution method (RD-05);
  - Apple push credentials, **required** because push is tier F (FR-026, KL-PLAT-010).

  Each becomes a blocker at the authorized activity that needs it, and push credentials also block initial
  readiness. None blocks clarification or conditional planning. Credentials are not accessed during specification
  work.
- **Cloud build and update service**: access to the existing project, and developer authorization for each build
  and publish.
- **Backend (no code change)**:
  - iOS version records and push-device registration are already accepted (`zapzone-backend@9a445c1`, E-07);
  - operationally, no mandatory iOS version record may be activated until the FR-062 behaviour is implemented and
    its iOS distribution link has been verified as accessible to the intended users (an authorized operational
    step, not part of this specification phase);
  - test accounts are needed for each role and location configuration.
- **Test environment (availability unknown, E-18)**: RD-07. It blocks every state-changing and payment
  verification scenario, and therefore initial readiness, until confirmed. A payment-processor sandbox is needed for
  FR-065.
- **Hardware**:
  - at least one physical iPhone running a supported iOS version, plus further devices where available to cover the
    supported range (SC-002);
  - at least one physical Android device for regression testing.

## Constitution Alignment

| Principle | How this specification applies it |
|---|---|
| I. Sources of truth and parity | No Web counterpart. Existing outcomes must be identical across platforms (FR-002, FR-073). No cross-repository changes (FR-003). Backend facts are cited with a SHA. |
| II. Proportionate SDD | Full SDD. Open reserved decisions are recorded, not assumed. Scope is bounded. |
| III. Security | FR-040 to FR-047, FR-027 and FR-064. Session policy is unchanged. Production access is not treated as risk-free. Kiosk escapes and push delivery to previous accounts are readiness blockers even with Android parity (FR-026, FR-027). Affected `KL-SEC-*`, `KL-ARCH-001` and `KL-PAYMENT-006` items are referenced and not claimed resolved. Signing material is kept out of the repository (FR-013). |
| IV. Contracts and integrity | No new contracts. Defined payment scenarios (FR-065) verify record-level and charge-level idempotency separately (FR-044, SC-008). |
| V. Cross-platform and Android protection | FR-001, FR-002, FR-022 and FR-050 to FR-053. Device family approved (RD-04). Identity, distribution and channels are open (RD-01, RD-05, RD-06). The minimum OS rule is approved, with its value pending verification (RD-03). |
| VI. Architecture and UX | Adapt, don't redesign. No unrelated refactors, and no functionality removal (FR-028). Safe areas, keyboard, themes and accessibility are covered (FR-030 to FR-038). |
| VII. Verification | Evidence categories and result categories are kept separate. Blocked is never reported as passed. Physical-device evidence is required per platform (FR-070 to FR-073). |
| VIII. Release safety | Release classification, runtime compatibility and per-action authorization (FR-060 to FR-063, FR-012). |
| IX. Documentation | Platform differences and limitations are documented on implementation (FR-004). |
| X. Git and scope | No Git, build or publish action without explicit authorization. |

## Referenced Business Rules and Known Limitations

- **Business rules**: BR-AUTH-001 to BR-AUTH-006; BR-SESSION-001 to BR-SESSION-005; BR-ROLE-001 to BR-ROLE-003;
  BR-LOCATION-001 to BR-LOCATION-004; BR-API-002, BR-API-003, BR-API-004; BR-CHECKIN-001 to BR-CHECKIN-009;
  BR-PAYMENT-001 to BR-PAYMENT-005; BR-UPDATE-001 to BR-UPDATE-005; BR-PHOTO-001, BR-PHOTO-010, BR-PHOTO-011;
  BR-WAIVER-001 to BR-WAIVER-004, BR-WAIVER-010 to BR-WAIVER-012; BR-NOTIF-003.
- **Known limitations addressed or constrained by this feature**: KL-PLAT-001 to KL-PLAT-007, KL-PLAT-010;
  KL-UI-001, KL-UI-002, KL-UI-003, KL-UI-010, KL-UI-011, KL-UI-012; KL-PHOTO-006, KL-PHOTO-007, KL-PHOTO-009,
  KL-PHOTO-010, KL-PHOTO-012; KL-CHECKIN-004; KL-OPS-001; KL-TEST-005.
- **Kiosk security items, verified under FR-027**: KL-PHOTO-002, KL-WAIVER-006, KL-WAIVER-007, KL-WAIVER-010.
  Remediation is not in scope, but an observed security-sensitive escape is a readiness blocker.
- **Push security item, verified under FR-026**: KL-SEC-005. Remediation is not in scope, but observed delivery to
  a signed-out account is a readiness blocker.
- **Known limitations referenced but out of scope (must not worsen)**: KL-SEC-001 to KL-SEC-004, KL-SEC-006;
  KL-ARCH-001; KL-PAYMENT-006; KL-PLAT-008, KL-PLAT-009; KL-UI-004, KL-UI-005.
