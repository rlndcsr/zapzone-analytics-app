# Photos, Communications and Notifications

> **Purpose:** Describe what the Mobile app's Photos (capture, delivery, library, slideshow, overlays, reports, settings, escape rooms), Email Campaign (campaigns, templates, email + SMS notifications), Notifications inbox and Custom Fields modules actually do, with evidence.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e` (cited sections only); Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Static source inspection only — nothing was run, built or tested. Mobile services, key screens and pure-logic helpers were read; very large screens (`src/app/photos/settings.tsx`, `overlays.tsx`, `create-notification.tsx`, `notification-details.tsx`, `EscapeRoomGameView.tsx`) were inspected by targeted search, not line by line. Backend: route table and the photo/email/SMS/notification/custom-field controllers were sampled at the cited methods only. Web Admin: sidebar, service calls and a few page greps only. Push registration and cold-start push routing are documented elsewhere (see [Architecture](../ARCHITECTURE.md)). Anything not checked is marked "Not assessed".
> **Related:** [Feature catalog](../FEATURE_CATALOG.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Architecture](../ARCHITECTURE.md) · [Business rules — photos, communications & notifications](../business-rules/photos-communications-and-notifications.md)

---

## Contents

- Photos
  - [Photos hub](#photos-hub)
  - [Take Photos (capture & delivery)](#take-photos-capture--delivery)
  - [Photo Library](#photo-library)
  - [Delivery Log](#delivery-log)
  - [Slideshow Queue](#slideshow-queue)
  - [Photo Overlays (frames)](#photo-overlays-frames)
  - [Photo Reports](#photo-reports)
  - [Photo Settings](#photo-settings)
- Escape rooms
  - [Escape Rooms (staff game board)](#escape-rooms-staff-game-board)
  - [Escape-room guest check-in kiosk](#escape-room-guest-check-in-kiosk)
- Communications
  - [Email Campaign hub](#email-campaign-hub)
  - [Email Campaigns](#email-campaigns)
  - [Email Templates](#email-templates)
  - [Email Notifications (automated emails)](#email-notifications-automated-emails)
  - [SMS Notifications](#sms-notifications)
- [Notifications inbox](#notifications-inbox)
- [Custom Fields](#custom-fields)
- [Cross-cutting observations](#cross-cutting-observations)

---

## Shared conventions in this area

- **Location resolution (Photos, Escape Rooms).** Each photo screen computes `effectiveLocationId`: a `company_admin` uses the global active location (`useActiveLocation`, `src/lib/location/activeLocationStore.ts`); "All Locations" yields `null`, which blocks location-bound screens (capture, library, escape rooms, overlays, settings) behind a "pick a location" state. Every other role uses `getCurrentUser().location_id`. Delivery Log and Photo Reports accept `null` and query company-wide. Evidence: `src/app/photos/capture.tsx` (`PhotoCaptureScreen`, `effectiveLocationId`), `src/app/photos/delivery-log.tsx` (`effectiveLocationId`).
- **Backend gate for every photo/escape-room endpoint.** All routes sit in `Route::middleware('photo.staff')` — the caller must be a staff `User` with role `company_admin`, `admin`, `location_manager` or `attendant`; some routes narrow the roles further. `zapzone-backend@ae877e2:routes/api.php` (photo group), `zapzone-backend@ae877e2:app/Http/Middleware/EnsurePhotoStaff.php` (`EnsurePhotoStaff::handle`, `ROLES`). Records are scoped to the caller's company, and to the caller's own location for `location_manager`/`attendant`: `zapzone-backend@ae877e2:app/Http/Traits/ScopesByAuthUser.php` (`applyAuthScope`, `authorizeRecordScope`).
- **Email/SMS/notification endpoints** use the `staff` middleware (same four roles, no narrower role list): `zapzone-backend@ae877e2:routes/api.php` (`email-templates`, `email-campaigns`, `email-notifications`, `sms-notifications`, `notifications` groups), `zapzone-backend@ae877e2:app/Http/Middleware/EnsureStaff.php` (`ROLES`).
- **HTTP client.** Almost all calls go through `apiRequest` (`src/lib/api.ts`), which carries the bearer token, timeouts and global 401 handling. Exceptions: multipart uploads (`uploadSessionPhoto`, `postOverlayForm` in `src/services/photosService.ts`) call `fetch` directly (see KL-PHOTO-008), and the guest kiosk calls use `publicEndpoint: true` (`src/services/escapeRoomService.ts`).
- **Role gating on Mobile is navigation/UI only.** The side menu (`src/components/navigation/navMenuItems.ts`, `getNavMenuItems`) shows Photos, Email Campaign, Custom Fields and Notifications to every role; screens hide manager-only actions client-side. Server enforcement is cited per module.

---

# Photos

## Photos hub

- **Purpose:** Entry point to the Photos module, with quick links (Take Photos, Guest Check-in, Upload Overlay) and module cards.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/photos/photos.tsx` | Picks a photo sub-module; "Guest Check-in" opens `/photos/escape-rooms?checkin=1`; "Upload Overlay" opens `/photos/overlays?upload=1` |

- **Roles:** All staff see Take Photos, Escape Rooms, Photo Library, Slideshow Queue, Delivery Log. Photo Overlays, Photo Reports, Photo Settings and the Upload Overlay quick link are shown only to `company_admin` and `location_manager` (`PhotosScreen`, `managerOnly`, `canManageSubModules`). Note: the hub excludes the `admin` role, while the backend and the individual screens allow `admin` (KL-PHOTO-011).
- **Location scoping:** None on the hub itself.
- **Web Admin counterpart:** Photos sidebar section, `zappoint@5de9d9e:src/components/admin/AdminSidebar.tsx` — attendants get Take Photos / Escape Rooms / Library / Slideshow Queue / Delivery Log; managers and company admins also get Overlays / Reports / Settings. Parity: **Verified** (same split), Mobile adaptation (hub layout).
- **Shared components:** `ModuleHubScreen` (`src/components/ui/ModuleHub`).
- **Source references:** `src/app/photos/photos.tsx` (`QUICK_LINKS`, `MODULES`, `PhotosScreen`).

## Take Photos (capture & delivery)

- **Purpose:** Staff capture up to the session maximum of customer photos (camera or device upload), then deliver the branded photos by email/SMS to waiver signers and event registrants, or show a QR code.
- **Implementation status:** Implemented · **Verification:** Source-verified (camera behaviour: Device verification required)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/photos/capture.tsx` | Steps: **Consent** → **Capture** (camera / upload / remove / reorder) → **Delivery** (choose method, recipients, schedule, slideshow opt-in) → **Done** (send outcome, QR fallback, start over); can discard the session before delivery |

- **Roles:** Any staff role reaching the hub. Backend: `photo.staff` (all four roles), record scope by company/location.
- **Location scoping:** `effectiveLocationId` (see conventions). Context and session creation send `location_id`.
- **Main workflows & operations**
  1. **Consent.** Staff tick a verbal-consent box; the session is created with `verbal_consent: true` (BR-PHOTO-001).
  2. **Capture.** `PhotoCameraView` (`src/components/photos/PhotoCameraView.tsx`) opens the back camera with `ratio="16:9"` (Android-only prop) and, once ready, chooses `pictureSize` via `pickCaptureSize` (`src/lib/photos/captureSize.ts`): the largest 16:9 size ≤ 3840×2160, else the smallest 16:9 size, else the first size ≥ 1.8 MP (BR-PHOTO-010). `takePictureAsync({ quality: 0.7, base64: true })` result is posted as `data:image/jpeg;base64,…` JSON so the server records `source: camera` (`addCapturedPhoto`).
  3. **Upload from device.** `ImagePicker.launchImageLibraryAsync({ quality: 0.7 })` → multipart `file` (`uploadSessionPhoto`); recorded as `upload`. The code comment states the 0.7 quality re-encodes to JPEG so HEIC never reaches the backend's jpg/jpeg/png/webp/gif allow-list — not runtime-verified (KL-PHOTO-009).
  4. **Edit before delivery.** Remove a photo, move it up/down (full ordered id list), or discard the whole session.
  5. **Recipients.** `RecipientPicker` (`src/components/photos/RecipientPicker.tsx`) searches `people-search` (completed waivers + event registrants within ±1 operating day); falls back to `waiver-search` when the server lacks the route (`searchPhotoPeople`). Registrants are emailed, and texted only when staff tick "Also text" (`recipientIds`, `src/lib/photos/photoRecipients.ts`).
  6. **Deliver.** `waiver_message` (schedule `immediate` or `next_day_9am`) or `staff_qr`; optional `slideshow_opt_in`. Result screen renders the server's `outcome` (sent/partial/failed/scheduled, carrier-pending counts, texts-blocked flag) and keeps offering the QR when a message did not go out (`needsQrFallback`, `src/lib/photos/deliveryOutcome.ts`).
  7. **Frame tip.** When today's active frame lacks a landscape or portrait version, a tip is shown (`frameShapeTip`, `src/lib/photos/frameVersions.ts`); the tip is not gated on actual device orientation.
- **Data sources** (`src/services/photosService.ts`)

| Function | HTTP |
|---|---|
| `fetchCaptureContext` | GET `/api/photo-sessions/context?location_id=` |
| `startPhotoSession` | POST `/api/photo-sessions` |
| `addCapturedPhoto` / `uploadSessionPhoto` | POST `/api/photo-sessions/{id}/photos` (JSON data URL / multipart, 60 s timeout for JSON only) |
| `removeSessionPhoto` | DELETE `/api/photo-sessions/{id}/photos/{photoId}` |
| `reorderSessionPhotos` | POST `/api/photo-sessions/{id}/photos/reorder` |
| `searchPhotoPeople` / `searchPhotoWaivers` | GET `/api/photo-sessions/people-search` (throttled) / `waiver-search` |
| `deliverPhotoSession` | POST `/api/photo-sessions/{id}/deliver` (throttle `photo-send`) |
| `discardPhotoSession` | DELETE `/api/photo-sessions/{id}` |

- **Validation & business rules:** BR-PHOTO-001…006, BR-PHOTO-009, BR-PHOTO-010. Server: consent required (`PhotoSessionController::store`), per-session max photos and allowed types (`PhotoSessionController::addPhoto`), one-shot delivery requiring ≥1 ready photo and recorded consent, escape-room sessions refused (`PhotoSessionController::deliver`), discard/remove refused after delivery (`PhotoSessionController::destroy`, `destroyPhoto`).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/photos/PhotoCapture.tsx` with camera constraints in `zappoint@5de9d9e:src/hooks/usePhotoCamera.ts` (`SHARP_VIDEO`: ideal 3840×2160, aspect 16:9). Parity: **Partial / Mobile adaptation** — same endpoints and steps; capture uses native `expo-camera` instead of getUserMedia + canvas.
- **Shared components & utilities:** `PhotoCameraView`, `RecipientPicker`, `src/lib/photos/{captureSize,photoRecipients,deliveryOutcome,frameVersions}.ts`.
- **Loading / empty / error / refresh:** Toasts for every failure (`useTransientAlert`); `submitLockRef` prevents double submits; context re-fetched when the session starts so the frame line is current. Camera states: starting / live / denied / unavailable with "Allow Camera Access" or "Open Settings" and a reminder that upload still works.
- **Platform-specific behaviour:** `ratio="16:9"` is Android-only; iOS relies on its 16:9 presets (comment in `PhotoCameraView`). App is portrait-locked (`app.json` `orientation: "portrait"`) and `responsiveOrientationWhenOrientationLocked` is not set, so iOS sideways shots may be recorded in portrait orientation (KL-PHOTO-010, Device verification required). 4K base64 capture held in JS memory (KL-PHOTO-007). `KeyboardAvoidingView` uses `padding` on iOS only.
- **Tests:** `src/lib/photos/captureSize.test.ts` (size choice), `photoRecipients.test.ts` (recipient ids, text opt-in, labels), `deliveryOutcome.test.ts` (outcome styling, retry/QR-fallback rules), `frameVersions.test.ts` (frame shape helpers). Screens/services untested.
- **Known limitations:** KL-PHOTO-007, KL-PHOTO-008, KL-PHOTO-009, KL-PHOTO-010.
- **Source references:** `src/app/photos/capture.tsx` (`startSession`, `takePhoto`, `uploadPhoto`, `removePhoto`, `movePhoto`, `deliver`, `discard`); `src/components/photos/PhotoCameraView.tsx` (`handleReady`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/PhotoSessionController.php`.

## Photo Library

- **Purpose:** Browse ready photos grouped by operating day, save them to the device gallery, resend them, toggle them onto the venue slideshow, and (managers) delete them.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/photos/library.tsx` | Filter by source (staff/kiosk) and date range or day window; preview a photo; save one or many to the gallery; send to waivers/registrants (email/SMS, now or next day 9 AM); add/remove from slideshow; delete one or many |

- **Roles:** All staff view/send/save. Delete shown to `company_admin`, `admin`, `location_manager` (`canDelete`); server-enforced by `photo.staff:company_admin|admin|location_manager` on `DELETE /api/photo-library/{photo}` and `POST /api/photo-library/delete` (`zapzone-backend@ae877e2:routes/api.php`).
- **Location scoping:** `effectiveLocationId` required.
- **Main workflows & operations:** day window helpers `libraryDayWindow` / `libraryDaysNotice` (`src/lib/photos/libraryDays.ts`; default 14, max 120 days); truncation notice when the server caps the result (client comment: 1,500 photos — server cap Not assessed). Save to gallery downloads `GET /api/photo-library/{id}/download` with the bearer header via `expo-file-system/legacy` then `MediaLibrary.saveToLibraryAsync`, requesting permission on failure; bulk save is sequential and reports "Saved n of m" on partial failure. Slideshow toggle calls `setPhotoOnSlideshow` without the release-confirmation path (KL-PHOTO-003).
- **Data sources:** `fetchPhotoLibrary` GET `/api/photo-library` (30 s timeout); `photoDownloadUrl`; `sendLibraryPhoto` POST `/api/photo-library/{id}/send` (throttled); `setPhotoOnSlideshow` POST `/api/slideshow-photos/{id}/inclusion`; `deleteLibraryPhoto` / `deleteLibraryPhotos`.
- **Validation & business rules:** BR-PHOTO-005, BR-PHOTO-007, BR-PHOTO-012, BR-PHOTO-014.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/photos/PhotoLibrary.tsx`; web also offers a zip bulk download (`POST /photo-library/download`, `zappoint@5de9d9e:src/services/PhotoService.ts`). Parity: **Partial** (no zip download — Mobile adaptation saves per photo, sequentially; KL-PHOTO-005).
- **Platform-specific behaviour:** Gallery save depends on `expo-media-library`; the iOS photo-library permission text only mentions booking QR codes (`app.json` `photosPermission`/`savePhotosPermission`) (KL-PHOTO-006).
- **Tests:** `src/lib/photos/libraryDays.test.ts`.
- **Known limitations:** KL-PHOTO-003, KL-PHOTO-006.
- **Source references:** `src/app/photos/library.tsx` (`saveToGallery`, `downloadSelected`, `runDelete`, `toggleSlideshow`, `send`).

## Delivery Log

- **Purpose:** Every email/SMS photo-link send (one row per channel), with outcome tracking, retry, cancel, carrier status refresh and staff "confirm received".
- **Implementation status:** Partially implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/photos/delivery-log.tsx` | Filter by status, channel, kind (immediate / next-day / kiosk), dates, text outcome, "show deduplicated"; retry or cancel a row; confirm a text was received; refresh carrier status (429 = wait) |

- **Roles:** All staff (hub). Backend: `photo.staff`; `location_id` filter checked by `guardLocationAccess`; rows scoped by `applyAuthScope` (`zapzone-backend@ae877e2:app/Http/Controllers/Api/PhotoDeliveryController.php` `PhotoDeliveryController::index`).
- **Location scoping:** company admin on "All Locations" → company-wide; otherwise one location.
- **Data sources:** `fetchPhotoDeliveryLog` GET `/api/photo-deliveries`; `retryPhotoDelivery` POST `…/{id}/retry`; `cancelPhotoDelivery` POST `…/{id}/cancel`; `refreshPhotoDeliveryStatus` POST `…/status`; `confirmPhotoTextReceived` POST `…/{id}/confirm-receipt`.
- **Known defect:** the backend returns a Laravel paginator (default `per_page` 30, max 100) but Mobile sends no `page`/`per_page` and never pages, so only the newest 30 rows are shown while the header total counts all rows; `truncated` is never set by this endpoint (KL-PHOTO-001). The row mapper also accepts many alias field names because its author had "no local source" for the payload (KL-PHOTO-013).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/photos/PhotoDeliveryLog.tsx` pages through results (`page`, `per_page: 25`). Parity: **Gap** (paging).
- **Tests:** `src/lib/photos/deliveryOutcome.test.ts` (merge, retry eligibility, pending ids).
- **Known limitations:** KL-PHOTO-001, KL-PHOTO-013.

## Slideshow Queue

- **Purpose:** See and control what the venue slideshow display shows today, plus past queues and display status.
- **Implementation status:** Partially implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/photos/slideshow-queue.tsx` | View today's queue (priority then capture time), last 30 closed queues, display online/last seen, URL/passcode; show / hide / remove a photo; reorder; pause/resume rotation |

- **Data sources:** `fetchSlideshowQueues` GET `/api/slideshow-queues?location_id=`; `updateSlideshowPhotoState` PATCH `/api/slideshow-photos/{photo}`; `reorderSlideshowQueue` POST `/api/slideshow-queues/{queue}/reorder`; `setSlideshowQueuePaused` POST `…/paused`.
- **Gap:** the backend has an approval workflow (`POST /api/slideshow-photos/{photo}/approval`, `POST /api/slideshow-queues/{queue}/approve-pending`, `SlideshowQueueController::setApproval`/`approvePending`) used by the web (`zappoint@5de9d9e:src/services/PhotoService.ts`); Mobile only reads `slideshow_approval_status` and cannot approve/reject (KL-PHOTO-004). Escape-room photos blocked by the release check return 409 with no confirm path here (KL-PHOTO-003).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/photos/SlideshowQueue.tsx`. Parity: **Partial**.
- **Public slideshow display page:** web-only (Not assessed in detail).
- **Tests:** none specific.

## Photo Overlays (frames)

- **Purpose:** Upload and schedule branded frames applied to photos, optionally tied to one escape room or to an event's day(s), with landscape and portrait versions.
- **Implementation status:** Implemented · **Verification:** Source-verified (server image rules: Not assessed)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/photos/overlays.tsx` | List frames (active / scheduled / expired / disabled, conflicts, active frame); upload a frame (+ optional other-shape version) with name, start/end, priority, "Applies to" (all / escape room / event day), and — admins — copy an event frame to the event's other locations; add/replace/remove a version; change room; enable/disable; delete |

- **Roles:** Screen requires `company_admin`, `admin` or `location_manager` (`canManage`); copy to other locations only `company_admin`/`admin` (`canCopyFrames`). Server: `photo.staff:company_admin|admin|location_manager` on all overlay routes; `event-days` additionally `staff:company_admin|admin|location_manager`.
- **Main workflows:** file picked with `expo-document-picker` restricted to PNG/WebP (`FRAME_FILE_TYPES`) and uploaded multipart in original encoding to keep transparency (`createPhotoOverlay`, `savePhotoOverlayVersion`); shape checks and messages from `src/lib/photos/frameVersions.ts`; event-day helpers in `src/lib/photos/overlayEvents.ts`. Client comments state the server refuses two versions of the same shape, a frame with no transparent area and frames over 12.5 MP — server rules Not assessed. Per-photo frame selection by photo shape is server-side (`missing_shape` handling seen in `PhotoOverlayController`/`PhotoSessionController`; selection algorithm Not assessed).
- **Data sources:** GET `/api/photo-overlays?location_id=`; GET `/api/photo-overlays/event-days` (404 → "no event days"); POST `/api/photo-overlays` (multipart); POST `/api/photo-overlays/{id}` (update: version, `remove_alt_image`, `package_id`, `is_enabled`); DELETE `/api/photo-overlays/{id}`; room picker GET `/api/escape-rooms/rooms`.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/photos/PhotoOverlays.tsx`. Parity: **Partial** (Not assessed beyond shape hints).
- **Tests:** `src/lib/photos/frameVersions.test.ts`, `overlayEvents.test.ts`.
- **Known limitations:** KL-PHOTO-008 (multipart via direct `fetch`).

## Photo Reports

- **Purpose:** Eight server reports over a date range: Photo activity, Delivery, QR codes, Kiosk, Slideshow, Daily library, Overlays, Audit log (`REPORT_OPTIONS` in `src/app/photos/reports.tsx`).
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Roles:** Screen: `company_admin`, `admin`, `location_manager`; server: `photo.staff:company_admin|admin|location_manager` on GET `/api/photo-reports/{type}`.
- **Location scoping:** optional `location_id` (company-wide on "All Locations").
- **Behaviour:** `fetchPhotoReport` walks whatever keys the server returns into generic metric/row sections, with dedicated tables only for `by_day` and `entries` (KL-PHOTO-014). Renders `PhotoReportTables` (`src/components/ui/PhotoReportTables.tsx`).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/photos/PhotoReports.tsx`. Parity: Not assessed in detail.
- **Tests:** none.

## Photo Settings

- **Purpose:** Per-location photo configuration and messaging setup.
- **Implementation status:** Implemented · **Verification:** Source-verified (targeted search only)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/photos/settings.tsx` | Kiosk/slideshow on-off, kiosk countdown, slideshow duration, retention days, date-layer format/position/size/margin/background, failure-notify email; rotate kiosk/slideshow passcodes; send a test email/SMS (and poll carrier status); reset texting confirmation (`company_admin`/`admin`); edit photo message templates (immediate / next_day / kiosk) and reset to default; manage "Links for photo messages" (`link_<key>` placeholders, per-location URLs); links out to the Event photos email template and the Thanks for Playing email |

- **Roles:** Screen: `company_admin` or `location_manager` (`canManage`; excludes `admin`, KL-PHOTO-011). Server: `photo.staff:company_admin|admin|location_manager` for settings/templates/links/test-message (test-message also throttled); `photo.staff:company_admin|admin` for `texting/reset`.
- **Data sources:** GET/PUT `/api/photo-settings`; POST `/api/photo-settings/passcode`, `/test-message`, `/test-message/status`, `/texting/reset`; GET `/api/photo-templates`, PUT `/api/photo-templates/{id}`, POST `…/{id}/reset`; GET/POST `/api/photo-message-links`, PUT `…/{id}`, PUT `…/{id}/url`, DELETE `…/{id}` (404/503 → section hidden).
- **Business rules:** BR-PHOTO-008. Locked server constants displayed read-only (QR validity, access days, max photos, kiosk idle, 6 AM operating-day cutoff, next-day delivery hour). Retention purge exists server-side (`zapzone-backend@ae877e2:app/Console/Commands/PurgeExpiredPhotos.php`; behaviour Not assessed).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/photos/PhotoSettings.tsx`. Parity: Not assessed in detail.
- **Tests:** `src/lib/photos/messageLinks.test.ts`; `src/lib/escapeRooms/gameFollowUp.test.ts` ("Photo Settings escape-room email note").
- **Security note:** the settings payload includes kiosk/slideshow passcodes and device URLs for managers (`PhotoSettingRecord`) — intended, but treat as sensitive.

---

# Escape rooms

## Escape Rooms (staff game board)

- **Purpose:** Per-day board of every escape room's scheduled times; opening a time creates or reuses that game, where staff take the group photo, record the result/finish time, and email the photo with the "Thanks for Playing" follow-up email to the players who signed the escape-room waiver.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/photos/escape-rooms.tsx` | Pick a day (follows venue "today" until changed), "busy only" filter, open a game, show the guest check-in QR (`?checkin=1`), deep links `?date=&session=` |
| `src/components/photos/escapeRooms/EscapeRoomGameView.tsx` | Group photo (consent), Complete & Send (one-time), Result only (optionally email players), send to new players / retry stuck, move/remove/link-booking a player, resend photo (optionally to a typed address), correct the result, slideshow inclusion with release confirmation, per-player thank-you/review resend or cancel |
| `EscapeRoomDayBoard.tsx`, `EscapeRoomPlayerRow.tsx`, `EscapeRoomQrModal.tsx` | Board, player rows, check-in QR + "Open on this device" (pushes `/photos/escape-room-kiosk`) |

- **Roles:** All staff; setup links (`canManageSetup`) only for `company_admin`, `admin`, `location_manager`. Server: `photo.staff` (all four roles) + record scope (`zapzone-backend@ae877e2:app/Http/Controllers/Api/EscapeRoomSessionController.php`).
- **Location scoping:** `effectiveLocationId`.
- **Main workflows & operations:** day poll every 60 s, open game poll every 30 s while focused; sequence guards stop stale responses overwriting the current view. Follow-up wording and eligibility in `src/lib/escapeRooms/gameFollowUp.ts` (`gameFollowUpState`, `canResendThanks`, `reviewResendLabel`, `canCancelRetryingReview`, `completeAndSendQuestion`, `recordOnlyQuestion`). Slideshow inclusion retries with `confirm_release` after a 409 (`setSlideshow`).
- **Data sources** (`src/services/escapeRoomService.ts`): GET `/api/escape-rooms/day`, GET `/api/escape-rooms/rooms`, POST `/api/escape-rooms/sessions`, GET `…/sessions/{id}`, POST `…/{id}/photo-session` (`verbal_consent`), `…/complete` (60 s), `…/send-new` (60 s), `…/waivers/{id}/move|remove|resend|booking`, `…/{id}/result`; photo capture reuses the photo-session endpoints; follow-ups via `src/services/visitFollowUpService.ts` (`/api/visit-follow-ups/*`, `staff` middleware).
- **Validation & business rules:** BR-ESCAPE-001…005, BR-ESCAPE-007, BR-PHOTO-012 (kiosk: BR-ESCAPE-006).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/photos/EscapeRoomSessions.tsx`. Parity: **Partial** (service comments claim port; "busy only" preference lasts for the app session instead of localStorage — Mobile adaptation).
- **Platform-specific behaviour:** Android `BackHandler` closes an open game before leaving (`useFocusEffect` handler); on iOS the edge-swipe pops the whole screen instead (no equivalent) — Device verification required (KL-PHOTO-012).
- **Tests:** `src/lib/escapeRooms/escapeRooms.test.ts` (badges, finish time, guest times, previews), `gameFollowUp.test.ts` (follow-up state, result-only email, complete & send, per-player follow-ups).
- **Known limitations:** KL-PHOTO-003 (release confirm only here).

## Escape-room guest check-in kiosk

- **Purpose:** Run the public escape-room check-in on a staff device: guests choose room and time and sign the room's waiver; the screen resets between guests.
- **Implementation status:** Implemented · **Verification:** Source-verified (kiosk lock: Device verification required)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/photos/escape-room-kiosk.tsx` | Room → Time → Waiver steps (`KioskWaiverForm`), success modal with optional ad (`KioskAdModal`), staff exit by press-and-hold (`StaffReturnControl`, 1.2 s) |

- **Roles:** Launched by staff from the QR modal; the guest calls are public (`publicEndpoint: true`). Server: `zapzone-backend@ae877e2:routes/api.php` — `GET waivers/escape-room/{locationId}`, `GET …/rooms/{packageId}` (throttle `escape-room-kiosk`), `POST …/submit` (throttle `escape-room-submit`), outside `auth:sanctum`.
- **Behaviour:** inactivity reset (server `inactivity_timeout_seconds`, default 120 s); every touch calls `touchSession()` so the staff session does not expire under a guest; room list refreshes every few minutes and on app foreground; retries every 30 s when unavailable; a refused `waiver_template_version` reloads the form; refused `package_id`/`session_time` show notices. Signed game links (`date`, `room`, `time`, `sig`) pre-select a game.
- **Security concern:** no Android back or iOS swipe-back lock (only `escape-rooms.tsx` and `switch-account.tsx` register `hardwareBackPress`; no `gestureEnabled: false` outside auth screens), so a guest may navigate back into the signed-in staff app (KL-PHOTO-002).
- **Web Admin counterpart:** web public page `/waiver/escape-room/:locationId?staff=1` (per Mobile comments; web page Not assessed).
- **Tests:** `src/lib/escapeRooms/escapeRooms.test.ts` (guest check-in times, pinned game, preview check delays).

---

# Communications

## Email Campaign hub

- **Purpose:** Entry to Manage Campaigns, Email Templates, Email Notifications and SMS Notifications; quick links to create campaign/template/notification.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Route:** `src/app/email-campaign/email-campaign-hub.tsx` (`EmailCampaignHub`).
- **Roles:** No role filter on Mobile (all staff). Web shows the same Email section to attendants (`zappoint@5de9d9e:src/components/admin/AdminSidebar.tsx`). Server: `staff` middleware on every email/SMS route.

## Email Campaigns

- **Purpose:** One-off bulk emails to customers, staff groups, custom addresses or event registrants; track delivery; cancel, resend failed, delete.
- **Implementation status:** Partially implemented · **Verification:** Source-verified; Test-backed (`campaignSchedule.test.ts`, `campaignSendOutcome.test.ts`, `eventRecipients.test.ts`)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/email-campaign/campaigns.tsx` | List (all pages loaded), status chips incl. derived "Scheduled", search, card/table view, bulk cancel/delete, CSV export via share sheet, stat cards |
| `src/app/email-campaign/create-campaign.tsx` | Name, audience cards (Customers, Attendants, Company Admins, Location Managers, custom emails; Event Registrants for managers/admins), subject/body with merge-variable panel, Save draft, Send now or Schedule for later |
| `src/app/email-campaign/campaign-details.tsx` | Details, recipient logs with errors, Cancel (pending/sending), Resend to failed (completed/failed with failures), Delete (completed/cancelled/failed) |

- **Roles:** All staff on Mobile; Event Registrants card only for `company_admin`/`admin`/`owner`/`location_manager` (`canManageEventPhotoEmails`, `src/lib/email/emailTemplateOptions.ts`), server-enforced (`EmailCampaignController::eventFormsFor`: 403 otherwise; own-location forms only). Location staff see their location's and company-wide campaigns (`EmailCampaignController::index`); company-wide campaigns can be cancelled/changed only by company-level roles (`companyWideCampaignRefusal`).
- **Location scoping:** list and statistics pass the global active location (`fetchEmailCampaigns(token, activeLocationId)`); **creation never sends `location_id`**, so the backend stores `null` (company-wide) for company-level roles and the staff member's location otherwise (`EmailCampaignController::campaignLocationId`) (KL-COMMS-002).
- **Main workflows:** scheduling via `resolveSchedule`/`campaignTiming` (`src/lib/email/campaignSchedule.ts`); registrant recipient preview debounced 500 ms and re-checked before sending ("Nobody would get this email"); send outcome via `campaignSendOutcome` (refused / sending / done) (BR-EMAIL-001). Event picker: `EventRecipientPicker` (`src/components/ui/EventRecipientPicker.tsx`, max 100 forms per `MAX_EVENT_FORMS`).
- **Data sources** (`src/services/emailService.ts`): GET `/api/email-campaigns` (paged `per_page=100`, up to 50 pages, `fetchEveryPage`), GET `/statistics`, GET `/{id}`, POST `/` , POST `/preview-recipients`, POST `/{id}/cancel`, POST `/{id}/resend` (`type` failed|all), DELETE `/{id}`; GET `/api/email-templates/variables`.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/email/{EmailCampaigns,CreateEmailCampaign,EmailCampaignDetails}.tsx`. Parity: **Partial** — web create also offers template selection (`email_template_id`), a location picker, send-test (`POST /email-campaigns/send-test`), inline image upload and attachments (`zappoint@5de9d9e:src/services/EmailCampaignService.ts`); Mobile has none of these (KL-COMMS-001). Web also branches on `response.data.status === 'failed'` (Verified parity for refusal handling).
- **Shared components:** `EmailComposerKit`, `EmailCampaignsTable`, `EmailBulkBar`, `HtmlBody`, `markEmailCampaignsStale` (`src/lib/emailStale.ts`).
- **Loading / error:** list errors render a retry state; actions use `Alert.alert`.
- **Known limitations:** KL-COMMS-001, KL-COMMS-002, KL-COMMS-005.

## Email Templates

- **Purpose:** Reusable email templates, including the "Event photos" category used for registrant photo emails.
- **Implementation status:** Implemented · **Verification:** Source-verified; Test-backed (`emailTemplateOptions.test.ts`, `safeEmailHtml.test.ts`)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/email-campaign/email-templates.tsx` | List all pages, search/filter, preview, duplicate, bulk status change, delete |
| `src/app/email-campaign/template-details.tsx` | Read a template (body rendered by `HtmlBody`); Edit or View |
| `src/app/email-campaign/create-template.tsx` | Create/edit name, subject (≤255), body, status (active/draft/archived), category, location targeting (company-level roles only), Event photos: attach photos + SMS body (≤600), server-rendered preview (`EmailPreviewSheet`) |

- **Roles:** company-level (`company_admin`, `admin`, `owner`) target locations; others' templates stay at their location (client comment: server keeps them local — Not assessed); rows with `can_manage: false` open read-only (`templateReadOnlyReason`); duplication rules in `canDuplicateTemplate`.
- **Data sources:** GET/POST `/api/email-templates`, GET/PUT/DELETE `/{id}`, POST `/{id}/duplicate`, PATCH `/{id}/status`, POST `/preview`, GET `/variables`.
- **Rendering safety:** `HtmlBody` (`src/components/ui/HtmlBody.tsx`) renders email HTML as native views after `cleanEmailHtml` (`src/lib/email/safeEmailHtml.ts`) and opens only `http(s)`, `mailto`, `tel` links. Backend sanitiser exists (`zapzone-backend@ae877e2:app/Support/EmailHtml.php`; rules Not assessed).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/email/{EmailTemplates,CreateEmailTemplate,EditEmailTemplate}.tsx`. Parity: Not assessed in detail.
- **Tests:** `emailTemplateOptions.test.ts`, `safeEmailHtml.test.ts`, `src/lib/htmlBlocks.test.ts`.

## Email Notifications (automated emails)

- **Purpose:** Automated emails fired by booking/purchase/visit triggers, including default templates, the visit "Thanks for Playing"/follow-up emails, logs and test sends.
- **Implementation status:** Implemented · **Verification:** Source-verified (targeted search); Test-backed helpers (`visitEmail.test.ts`, `notificationSettings.test.ts`, `excludedEmails.test.ts`)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/email-campaign/email-notification.tsx` | List with stats (total/active/booking/purchase triggers counted over loaded rows), bulk toggle (skips locked rows), duplicate, delete, send test |
| `src/app/email-campaign/notification-details.tsx` | Details, statistics, paginated logs with resend for failed rows, test send, reset default |
| `src/app/email-campaign/create-notification.tsx` | Create/edit trigger, entity ("Apply to"), recipients, custom and "Don't Send To" emails, timing hours, subject/body or template, QR toggle, active; visit-email fields (promo, sender name, review link, activity filter) via `VisitEmailSettings` |

- **Roles:** visit/follow-up emails can be created by `company_admin`/`location_manager` (`canCreateVisitEmail`) and edited by `company_admin` or a `location_manager` with a location (`canSetUpVisitEmail`); location field shown only to company admins; rows with `can_edit: false` are locked. Backend controller role checks Not assessed (route: `staff`).
- **Data sources:** `/api/email-notifications` list/show/logs/resend/create/update/delete/duplicate/send-test/reset-default/toggle-status (see `src/services/emailService.ts`).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/email/{EmailNotifications,CreateEmailNotification,EditEmailNotification,EmailNotificationDetails}.tsx`. Parity: Not assessed in detail.

## SMS Notifications

- **Purpose:** View and edit the company's automated text templates grouped by segment (Parties, Attractions, Events, Waiver, All).
- **Implementation status:** Partially implemented (no create/delete/logs) · **Verification:** Source-verified; Test-backed (`src/lib/sms/smsText.test.ts`)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/email-campaign/sms-notifications.tsx` | Toggle Active/Off, edit body + recipients + active (character and segment counter, merge fields), reset a default, send a test to a phone number, seed missing defaults; banner when SMS isn't configured |

- **Roles:** All staff on Mobile and Web. Server: `staff` middleware + company check only (`SmsNotificationController::authorizeCompany`); defaults restrict editable fields (`SmsNotificationController::update`), cannot be deleted (`destroy`), only defaults reset (`resetDefault`). `send-test` has no throttle and requires SMS configured (`sendTest`) (KL-COMMS-003, KL-COMMS-004).
- **Data sources:** GET `/api/sms-notifications` (per_page 200), GET `/options`, PUT `/{id}`, PATCH `/{id}/toggle-status`, POST `/{id}/reset-default`, POST `/{id}/send-test`, POST `/seed-defaults` (`src/services/smsNotificationService.ts`).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/sms/SmsNotifications.tsx`. Parity: Partial (Not assessed whether web creates/deletes).

---

## Notifications inbox

- **Purpose:** Staff in-app notifications (bookings, payments, system alerts) with filters, mark read, clear, delete with undo, and tap-through to the related record.
- **Implementation status:** Implemented · **Verification:** Source-verified; Test-backed routing/grouping
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/notification/notification.tsx` | Tabs All / Unread / Booking / Purchase with count badges, page size 5/10/15 + paging, search within the loaded page, Today/Earlier groups, swipe to delete (5 s undo), mark all read, clear all, tap to open |
| `src/app/notification/notification-details.tsx` | Fallback details: renders `id`, `title`, `message` from route params (no fetch) |

- **Roles:** Reachable from the menu, dashboard header and Settings for all staff. Server: `staff` middleware; list scoped to the company's locations and, for managers/attendants, their location (`NotificationController::visibleTo` + `applyAuthScope`); id-bound routes check `denyForeignRecord`; mark-all/clear-all validate `location_id` via `scopedLocation` (`zapzone-backend@ae877e2:app/Http/Controllers/Api/NotificationController.php`).
- **Location scoping:** list request sends no `location_id`; mark-all/clear-all send the user's **home** `location_id` and silently do nothing when it is missing (`src/lib/hooks/useNotifications.ts` `markAllAsRead`, `clearAll`) (KL-NOTIF-001). Web does the same (`zappoint@5de9d9e:src/pages/admin/Notifications.tsx` uses `user.location_id`).
- **Main workflows:** filters map to `unread=1`, `type=booking`, `type=payment` (`fetchNotifications`, `src/services/notificationService.ts`); badges come from four 1-row list calls (`fetchNotificationCounts`); tapping marks read optimistically then `router.push(resolveNotificationRoute(item))` — `action_url` rules first, then type/metadata, then the details screen (`src/lib/notifications/notificationRouteMapper.ts`); Today/Earlier on the venue calendar day (`groupByDay`, `src/lib/notifications/notificationGroups.ts`); icons via `notificationIcon.ts`.
- **Data sources:** GET `/api/notifications`; PATCH `/api/notifications/mark-all-as-read`; DELETE `/api/notifications/clear-all`; PATCH `/api/notifications/{id}/mark-as-read`; DELETE `/api/notifications/{id}`.
- **Read state:** stored on the notification row (`status`, `read_at`), not per user — marking read, clearing or deleting affects everyone who sees it (KL-NOTIF-002).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/Notifications.tsx` — filters all/unread/bookings/purchases applied client-side, "purchases" matches `type === 'purchase'` (Mobile sends `type=payment`), click navigates to `action_url`. Parity: **Partial / Mobile adaptation** (KL-NOTIF-005).
- **Push:** push registration, foreground presentation and cold-start routing (`pushDevice.ts`, `foregroundPresentation.ts`, `pushNavigationQueue.ts`, `src/components/PushNotificationRouter.tsx`) reuse `resolveNotificationRoute` via `pushDataToNotification`; mechanics are covered in [Architecture](../ARCHITECTURE.md).
- **Tests:** `notificationRouteMapper.test.ts`, `notificationGroups.test.ts`, `notificationIcon.test.ts` (plus push tests `pushNavigationQueue.test.ts`, `foregroundPresentation.test.ts`). `useNotifications` and the service are untested.
- **Known limitations:** KL-NOTIF-001…005.

---

## Custom Fields

- **Purpose:** Manage extra checkout checkboxes (label, help text, required, audience customer/admin/both, active) and which venues/packages/attractions/events ask them.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/custom-fields/custom-fields.tsx` | List with active count; create/edit in a sheet with `TargetingPicker`; delete |

- **Roles:** Read for all staff; create/edit/delete shown to `company_admin`/`location_manager` (`canWrite`) and only on rows with `can_manage !== false`. Server: GET `custom-fields` for staff; POST/PUT/DELETE behind `staff:company_admin|admin|location_manager` (`zapzone-backend@ae877e2:routes/api.php`); `can_manage` computed per row (`CustomFieldController::index`). Web hides Custom Fields from attendants (`AdminSidebar.tsx`), Mobile shows a view-only screen (KL-COMMS-006).
- **Main workflows:** on create, unrestricted dimensions are omitted; on edit, empty arrays are sent so a cleared restriction is cleared (BR-FIELD-002). Delete is a model delete (`CustomFieldController::destroy` calls `$customField->delete()`; soft-delete per Mobile comment — Not assessed).
- **Data sources:** GET/POST `/api/custom-fields`, PUT/DELETE `/api/custom-fields/{id}` (`src/services/customFieldsService.ts`); GET `/api/targeting-options` (`src/services/targetingOptionsService.ts`). Checkout-side enforcement of `is_required` (public `GET custom-fields/applicable`) Not assessed.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/settings/CustomFields.tsx`. Parity: Not assessed in detail.
- **Tests:** none (KL-COMMS-007).

---

## Cross-cutting observations

- Mobile ports most web flows endpoint-for-endpoint, often with comments naming the web file; several mappers tolerate older servers (`?? null` fallbacks, 404 → feature hidden).
- Pure logic is extracted to `src/lib/**` and unit-tested with `node:test`; screens, hooks and services have no tests (KL-PHOTO-015).
- Backend error bodies sometimes include raw exception text (`EmailCampaignController::store` `'error' => $e->getMessage()`, `SmsNotificationController::sendTest`) (KL-COMMS-005).
- Known limitation IDs used here: KL-PHOTO-001…015, KL-COMMS-001…007, KL-NOTIF-001…005 — see [Known limitations](../KNOWN_LIMITATIONS.md).
