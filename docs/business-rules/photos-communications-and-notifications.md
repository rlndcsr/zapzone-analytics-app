# Business Rules — Photos, Communications and Notifications

> **Purpose:** Record the important business rules that the Mobile photos, escape-room, email/SMS, notifications-inbox and custom-fields modules rely on, with the layer that enforces each one.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e` (cited sections only); Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Static source inspection only; nothing was run. "Backend (server-enforced)" is used only where the cited route/middleware/controller code was read. Rules whose server side was not read are marked "Not determined" or "Not assessed". Trivial UI behaviour is omitted.
> **Related:** [Feature catalog](../FEATURE_CATALOG.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Architecture](../ARCHITECTURE.md) · [Features — photos, communications & notifications](../features/photos-communications-and-notifications.md)

---

## Photos (BR-PHOTO)

### BR-PHOTO-001 — Verbal consent before a staff photo session
- **Rule:** A staff photo session can only be opened with the customer's verbal consent recorded; delivery is refused if consent was not recorded.
- **Workflow:** Take Photos (consent step) and escape-room group photo.
- **Enforcement layer:** Mobile UI-only (checkbox gate) · Backend (server-enforced)
- **Evidence:** `src/app/photos/capture.tsx` (`startSession` requires `consent`); `src/services/photosService.ts` (`startPhotoSession` sends `verbal_consent: true`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/PhotoSessionController.php` (`PhotoSessionController::store` rule `verbal_consent: required|accepted`; `PhotoSessionController::deliver` refuses when `verbal_consent_at` is null).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** Mobile always sends `true`; the checkbox is the only real consent capture.

### BR-PHOTO-002 — Per-session photo maximum
- **Rule:** A session holds at most its `max_photos` (staff limit from capture context; Mobile falls back to 3). Further adds are refused with 422.
- **Workflow:** Take Photos capture/upload.
- **Enforcement layer:** Mobile UI-only (`atCap` disables capture) · Backend (server-enforced)
- **Evidence:** `src/app/photos/capture.tsx` (`maxPhotos`, `atCap`); `PhotoSessionController::addPhoto` (count ≥ `maxPhotos()` → 422).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-PHOTO-003 — Photo source and accepted formats
- **Rule:** A JSON `image` data URL is recorded as `camera`; a multipart `file` as `upload`. Uploaded files must be jpg/jpeg/png/webp/gif within `photos.max_upload_kb` (default 12,288 KB, minimum 512).
- **Workflow:** Take Photos (camera vs "upload from device").
- **Enforcement layer:** Mobile client logic · Backend (server-enforced)
- **Evidence:** `src/services/photosService.ts` (`addCapturedPhoto`, `uploadSessionPhoto`); `PhotoSessionController::addPhoto` (validation `mimes:jpg,jpeg,png,webp,gif`, `decodeDataUrl`).
- **Exceptions:** The JSON data-URL path has no explicit size rule in the controller validation (format/size handling downstream Not assessed).
- **Verification:** Source-verified; HEIC behaviour Device verification required (KL-PHOTO-009)
- **Open questions:** Does `expo-image-picker` at quality 0.7 always return JPEG on iOS?

### BR-PHOTO-004 — Delivery is one-shot and needs a ready photo
- **Rule:** A session's delivery method can be chosen once; it needs at least one ready photo; escape-room sessions cannot be delivered here (they are sent from Escape Rooms).
- **Workflow:** Take Photos delivery step.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `PhotoSessionController::deliver` (422 for escape-room session, no ready photo, method already chosen); `src/services/photosService.ts` (`deliverPhotoSession` doc comment).
- **Exceptions:** Library resend (`POST /api/photo-library/{id}/send`) sends again after delivery.
- **Verification:** Source-verified
- **Open questions:** None

### BR-PHOTO-005 — Delivery methods, schedules and recipients
- **Rule:** `waiver_message` sends to chosen completed waivers and event registrants by email/SMS, `immediate` or `next_day_9am`; registrants are texted only when `text_registrants` is set; `staff_qr` shows a QR and starts the QR window. Email and SMS are tracked as separate delivery rows; a duplicate destination is recorded but not sent twice.
- **Workflow:** Take Photos, Photo Library send.
- **Enforcement layer:** Mobile client logic · Backend (server-enforced, partially read)
- **Evidence:** `src/lib/photos/photoRecipients.ts` (`recipientIds`, `receivesSomething`); `src/services/photosService.ts` (`recipientBody`, `PhotoDeliveryRow.isDuplicate`); `PhotoSessionController::deliver` (`method`/`schedule` rules, `resolveRecipients`, staff-QR branch).
- **Exceptions:** People search falls back to waivers only on servers without `people-search`.
- **Verification:** Test-backed (`src/lib/photos/photoRecipients.test.ts`); server dedupe/consent internals Not assessed
- **Open questions:** Whether `photo_video_consent: false` blocks a send server-side — Not assessed.

### BR-PHOTO-006 — Changes only before delivery
- **Rule:** Photos can be removed/reordered and the session discarded only before a delivery method is chosen, and never once its escape-room game is complete.
- **Workflow:** Take Photos; escape-room photo.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `PhotoSessionController::destroyPhoto`, `PhotoSessionController::destroy`, `PhotoSessionController::addPhoto` (completed-game checks).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-PHOTO-007 — Who may delete library photos
- **Rule:** Only `company_admin`, `admin`, `location_manager` may delete library photos (single or bulk).
- **Workflow:** Photo Library.
- **Enforcement layer:** Mobile UI-only (`canDelete`) · Backend (server-enforced)
- **Evidence:** `src/app/photos/library.tsx` (`canDelete`); `zapzone-backend@ae877e2:routes/api.php` (`photo-library/delete`, `DELETE photo-library/{photo}` with `photo.staff:company_admin|admin|location_manager`).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** Server bulk limit (Mobile comment says 200) Not assessed.

### BR-PHOTO-008 — Manager-only photo administration
- **Rule:** Overlays, photo settings, passcodes, test messages, message templates, message links and reports are limited to `company_admin`, `admin`, `location_manager`; resetting texting confirmation to `company_admin`, `admin`.
- **Workflow:** Overlays, Settings, Reports.
- **Enforcement layer:** Mobile UI-only · Backend (server-enforced)
- **Evidence:** `src/app/photos/{overlays,settings,reports}.tsx` (`canManage`, `canResetTexting`); `src/app/photos/photos.tsx` (`managerOnly`); `zapzone-backend@ae877e2:routes/api.php` (`photo.staff:company_admin|admin|location_manager`, `photo-settings/texting/reset` → `photo.staff:company_admin|admin`); `zapzone-backend@ae877e2:app/Http/Middleware/EnsurePhotoStaff.php`.
- **Exceptions:** Mobile hub and Settings screen omit the `admin` role that the server allows (KL-PHOTO-011).
- **Verification:** Source-verified
- **Open questions:** None

### BR-PHOTO-009 — Photo data is company- and location-scoped
- **Rule:** Every photo/escape-room endpoint requires a staff User in one of four roles; records are limited to the caller's company, and to their own location for `location_manager`/`attendant`.
- **Workflow:** All photo screens.
- **Enforcement layer:** Backend (server-enforced) · Mobile client logic (location choice)
- **Evidence:** `zapzone-backend@ae877e2:routes/api.php` (`Route::middleware('photo.staff')` group); `EnsurePhotoStaff::handle`; `zapzone-backend@ae877e2:app/Http/Traits/ScopesByAuthUser.php` (`applyAuthScope`, `authorizeRecordScope`, `guardCompanyAccess`); `PhotoDeliveryController::index` (`guardLocationAccess`).
- **Exceptions:** Company scoping is skipped when the user has no `company_id` (`authorizeRecordScope` condition) — impact Not assessed.
- **Verification:** Source-verified
- **Open questions:** None

### BR-PHOTO-010 — Capture size preference
- **Rule:** Prefer the largest 16:9 picture size up to 3840×2160; if none ≤ 4K, the smallest 16:9; with no 16:9 size, the first size ≥ 1.8 MP (else the largest). Android also requests `ratio="16:9"`.
- **Workflow:** Take Photos camera.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/photos/captureSize.ts` (`pickCaptureSize`, `isWideSize`); `src/components/photos/PhotoCameraView.tsx` (`handleReady`, `ratio`); web reference `zappoint@5de9d9e:src/hooks/usePhotoCamera.ts` (`SHARP_VIDEO`).
- **Exceptions:** iOS ignores `ratio`; its presets are used.
- **Verification:** Test-backed (`src/lib/photos/captureSize.test.ts`); on-device sizes Device verification required
- **Open questions:** None

### BR-PHOTO-011 — Frames have landscape and portrait versions
- **Rule:** A frame may carry one version per shape; uploads keep their original PNG/WebP encoding (transparency); the server chooses the version per photo and reports a `missing_shape`.
- **Workflow:** Photo Overlays; capture tip.
- **Enforcement layer:** Mobile client logic (file types, shape checks) · Not determined (server selection and refusal rules)
- **Evidence:** `src/lib/photos/frameVersions.ts` (`FRAME_FILE_TYPES`, `fitsShape`, `frameShapeTip`); `src/services/photosService.ts` (`savePhotoOverlayVersion` comment: same-shape, no transparent area, >12.5 MP refused).
- **Exceptions:** Capture tip is not gated on device orientation.
- **Verification:** Test-backed (`src/lib/photos/frameVersions.test.ts`); server rules Not assessed
- **Open questions:** Server-side selection algorithm.

### BR-PHOTO-012 — Escape-room photos on the slideshow need a finished game and confirmed release
- **Rule:** Adding, showing or approving an escape-room photo for the venue slideshow is refused (409) until the game is finished and the photo release is confirmed; staff confirm with `confirm_release`.
- **Workflow:** Escape Rooms game view; Library slideshow toggle; Slideshow Queue.
- **Enforcement layer:** Backend (server-enforced) · Mobile client logic (confirm path in game view only)
- **Evidence:** `zapzone-backend@ae877e2:app/Http/Controllers/Api/SlideshowQueueController.php` (`escapeRoomReleaseBlock` used by `updatePhoto`, `setInclusion`, `setApproval`); `src/components/photos/escapeRooms/EscapeRoomGameView.tsx` (`setSlideshow` retries with `confirmRelease`); `src/app/photos/library.tsx` (`toggleSlideshow`, no confirm).
- **Exceptions:** Library and Slideshow Queue cannot confirm (KL-PHOTO-003).
- **Verification:** Source-verified
- **Open questions:** None

### BR-PHOTO-013 — Delivery follow-up actions
- **Rule:** A delivery can be retried (refusal returns 422 with the current row), cancelled while queued/scheduled, confirmed as received by staff, and its carrier status refreshed (429 when checked too often).
- **Workflow:** Delivery Log, capture result screen.
- **Enforcement layer:** Mobile client logic · Backend (routes verified; rule internals Not assessed)
- **Evidence:** `src/services/photosService.ts` (`retryPhotoDelivery`, `cancelPhotoDelivery`, `confirmPhotoTextReceived`, `refreshPhotoDeliveryStatus`, `deliveryFromError`); `src/lib/photos/deliveryOutcome.ts` (`canRetryFromLog`, `canRetryFromOutcome`); `zapzone-backend@ae877e2:routes/api.php` (`photo-deliveries/*`).
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/photos/deliveryOutcome.test.ts`)
- **Open questions:** Exact cancel/retry eligibility server-side.

### BR-PHOTO-014 — Library day window
- **Rule:** The library covers operating days (6:00 AM to 5:59 AM), the most recent 14 by default, up to 120; the server may truncate a large result.
- **Workflow:** Photo Library.
- **Enforcement layer:** Mobile client logic · Not determined (server cap)
- **Evidence:** `src/lib/photos/libraryDays.ts` (`DEFAULT_LIBRARY_DAYS`, `MAX_LIBRARY_DAYS`); `src/services/photosService.ts` (`fetchPhotoLibrary`, `PhotoLibrary.truncated`).
- **Exceptions:** Explicit from/to dates override the window.
- **Verification:** Test-backed (`src/lib/photos/libraryDays.test.ts`)
- **Open questions:** Server 1,500-photo cap Not assessed.

---

## Escape rooms (BR-ESCAPE)

### BR-ESCAPE-001 — One game per room, date and time
- **Rule:** Opening a slot creates the game for that room/date/time or reuses the existing one.
- **Workflow:** Escape Rooms day board.
- **Enforcement layer:** Backend (route verified; reuse logic Not assessed) · Mobile client logic
- **Evidence:** `src/services/escapeRoomService.ts` (`openEscapeRoomGame`); `zapzone-backend@ae877e2:routes/api.php` (`POST escape-rooms/sessions` → `EscapeRoomSessionController::open`).
- **Exceptions:** None found.
- **Verification:** Source-verified (client); server Inferred
- **Open questions:** None

### BR-ESCAPE-002 — Group consent for the group photo
- **Rule:** The group photo session requires the group's verbal consent.
- **Workflow:** Escape-room game view.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `src/services/escapeRoomService.ts` (`startEscapeRoomPhoto`); `EscapeRoomSessionController::startPhoto` (`verbal_consent: required|accepted`).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-ESCAPE-003 — Complete & Send happens once
- **Rule:** Completing a game records escaped/finish time and emails the group photo with the Thanks for Playing email to the signed players; this is one-time. "Result only" records without a photo (a photo cannot be added later) and can optionally email players; past-day games ask for confirmation.
- **Workflow:** Escape-room game view.
- **Enforcement layer:** Mobile client logic (confirm wording) · Backend (validation `without_photo`, `email_players` read; send internals Not assessed)
- **Evidence:** `src/lib/escapeRooms/gameFollowUp.ts` (`completeAndSendQuestion`, `recordOnlyQuestion`, `pastGameCompleteConfirm`); `src/services/escapeRoomService.ts` (`completeEscapeRoomGame`); `EscapeRoomSessionController::complete`.
- **Exceptions:** Players who sign later are emailed via "send to new players".
- **Verification:** Test-backed (`src/lib/escapeRooms/gameFollowUp.test.ts`)
- **Open questions:** None

### BR-ESCAPE-004 — Correcting a result does not resend emails
- **Rule:** A recorded result can be corrected; emails already sent are not changed.
- **Workflow:** Escape-room game view.
- **Enforcement layer:** Not determined (documented only in Mobile service comment)
- **Evidence:** `src/services/escapeRoomService.ts` (`correctEscapeRoomResult` doc comment); `EscapeRoomSessionController::correctResult` (exists; behaviour Not assessed).
- **Exceptions:** None found.
- **Verification:** Inferred
- **Open questions:** Confirm server behaviour.

### BR-ESCAPE-005 — Photo emails depend on the Thanks for Playing email
- **Rule:** When the room's Thanks for Playing email is switched off, the photo cannot be emailed; a review request may still be scheduled. Per-player thank-you/review resend and cancel follow `canResendThanks`, `reviewResendLabel`, `canCancelRetryingReview`.
- **Workflow:** Escape-room game view; Photo Settings note.
- **Enforcement layer:** Mobile client logic · Not determined (server)
- **Evidence:** `src/lib/escapeRooms/gameFollowUp.ts` (`gameFollowUpState`, `followUpInfoParts`, `escapeRoomEmailNote`); `src/services/visitFollowUpService.ts`.
- **Exceptions:** Older servers: `canEmailPlayers` falls back to thanks-or-review active.
- **Verification:** Test-backed (`src/lib/escapeRooms/gameFollowUp.test.ts`)
- **Open questions:** None

### BR-ESCAPE-006 — Guest check-in kiosk contract
- **Rule:** Guest check-in uses public, throttled endpoints; a waiver edited mid-signing is refused (template id/version sent back) and the form reloads; the device resets after inactivity (server setting, default 120 s); touches keep the staff session alive.
- **Workflow:** Escape-room kiosk.
- **Enforcement layer:** Backend (throttles verified; version check Not assessed) · Mobile client logic
- **Evidence:** `src/services/escapeRoomService.ts` (`fetchEscapeRoomKiosk`, `submitEscapeRoomWaiver`); `src/app/photos/escape-room-kiosk.tsx` (`armIdle`, `touchSession`, `refusedField(e, "waiver_template_version")`); `zapzone-backend@ae877e2:routes/api.php` (`waivers/escape-room/*`, `throttle:escape-room-kiosk`, `throttle:escape-room-submit`).
- **Exceptions:** None found.
- **Verification:** Source-verified (client); kiosk lock Device verification required (KL-PHOTO-002)
- **Open questions:** What prevents arbitrary public submissions besides throttling — Not assessed.

### BR-ESCAPE-007 — Removing a player keeps the waiver
- **Rule:** Removing a player from a game stops this game's photo and follow-ups for them; the signed waiver is kept.
- **Workflow:** Escape-room game view.
- **Enforcement layer:** Mobile client logic (wording) · Not determined (server)
- **Evidence:** `src/lib/escapeRooms/gameFollowUp.ts` (`REMOVE_PLAYER_QUESTION`); `src/services/escapeRoomService.ts` (`removeEscapeRoomPlayer`).
- **Exceptions:** None found.
- **Verification:** Inferred
- **Open questions:** None

---

## Email (BR-EMAIL)

### BR-EMAIL-001 — A refused campaign send is a 2xx "success" with status failed
- **Rule:** When the email provider refuses a send-now or resend, the API still answers 2xx `success: true`, with `data.status = "failed"` and `message` = the reason. Clients must branch on `data.status`, never on `success`.
- **Workflow:** Create Campaign, Campaign details resend.
- **Enforcement layer:** Backend (server-enforced) · Mobile client logic · Web Admin reference behaviour
- **Evidence:** `zapzone-backend@ae877e2:app/Http/Controllers/Api/EmailCampaignController.php` (`EmailCampaignController::store` message match on `STATUS_FAILED`, 201; `resend` likewise); `src/lib/email/campaignSendOutcome.ts` (`campaignSendOutcome`); `src/app/email-campaign/create-campaign.tsx` (`save`); `zappoint@5de9d9e:src/pages/admin/email/CreateEmailCampaign.tsx` (`response.data.status === 'failed'`).
- **Exceptions:** Large sends return status `sending` (BR-EMAIL-004).
- **Verification:** Test-backed (`src/lib/email/campaignSendOutcome.test.ts`)
- **Open questions:** None

### BR-EMAIL-002 — Scheduling window and "Scheduled" status
- **Rule:** A scheduled campaign must be in the future and within a year; it is stored as `pending` with `scheduled_at` and shown as "Scheduled".
- **Workflow:** Create Campaign, campaign list/details.
- **Enforcement layer:** Mobile client logic (364-day limit) · Backend (server-enforced: `after:now`, `before:+1 year`)
- **Evidence:** `src/lib/email/campaignSchedule.ts` (`resolveSchedule`, `SCHEDULE_LIMIT_MS`, `isScheduledCampaign`, `campaignDisplayStatus`); `EmailCampaignController::store` (validation, `status => STATUS_PENDING`).
- **Exceptions:** Event-registrant campaigns cannot be scheduled (BR-EMAIL-003). "Save draft" also stores `pending` without `scheduled_at`.
- **Verification:** Test-backed (`src/lib/email/campaignSchedule.test.ts`)
- **Open questions:** Scheduler command that sends due campaigns — Not assessed.

### BR-EMAIL-003 — Event-registrant campaigns
- **Rule:** Only `company_admin`, `admin`, `owner`, `location_manager` may email event registrants; at least one form; only own-location forms for location staff; never scheduled; refused if nobody would receive it.
- **Workflow:** Create Campaign.
- **Enforcement layer:** Mobile UI-only · Mobile client logic · Backend (server-enforced)
- **Evidence:** `src/app/email-campaign/create-campaign.tsx` (`canEmailRegistrants`, `someoneGetsIt`); `src/lib/email/campaignSchedule.ts` (`canScheduleCampaign`); `src/lib/email/eventRecipients.ts` (`MAX_EVENT_FORMS` = 100, client only); `EmailCampaignController::eventFormsFor`, `EmailCampaignController::store` ("Nobody would get this email").
- **Exceptions:** None found.
- **Verification:** Test-backed (`campaignSchedule.test.ts`, `eventRecipients.test.ts`); server Source-verified
- **Open questions:** Server limit on number of forms — Not assessed.

### BR-EMAIL-004 — Customer opt-out and background sending
- **Rule:** The Customers audience excludes people who unsubscribed and every customer email carries an opt-out link; sends over 20 recipients continue in the background with status `sending`.
- **Workflow:** Create Campaign, resend.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `EmailCampaignController` (customer recipient builder with `optedOutEmails`, `opt_out_link`; `SEND_IN_REQUEST_LIMIT = 20`, `markAsSending`); `src/app/email-campaign/create-campaign.tsx` (`RECIPIENT_CARDS` "each email has an unsubscribe link").
- **Exceptions:** Staff audiences get an empty `opt_out_link`.
- **Verification:** Source-verified
- **Open questions:** None

### BR-EMAIL-005 — Campaign ownership and status rules
- **Rule:** Location staff see their location's and company-wide campaigns; company-wide campaigns can be changed only by company-level roles; cancel only `pending`/`sending`; resend refused while `sending`; campaign location is the given `location_id`, else `null` for company-level roles, else the staff member's location.
- **Workflow:** Campaign list/details, create.
- **Enforcement layer:** Backend (server-enforced) · Mobile UI-only (button visibility)
- **Evidence:** `EmailCampaignController::index`, `cancel`, `resend`, `companyWideCampaignRefusal`, `campaignLocationId`; `src/app/email-campaign/campaign-details.tsx` (`canCancel`, delete statuses).
- **Exceptions:** Mobile never sends `location_id` on create (KL-COMMS-002).
- **Verification:** Source-verified
- **Open questions:** Delete status restrictions server-side — Not assessed.

### BR-EMAIL-006 — Template targeting and read-only rows
- **Rule:** Company-level roles choose the locations a template covers (empty = all); other staff's templates stay at their location; rows the server marks `can_manage: false` are view-only; Event photos templates allow attached photos and an SMS body ≤ 600 characters; subject ≤ 255.
- **Workflow:** Email Templates.
- **Enforcement layer:** Mobile client logic · Not determined (server `can_manage` computation not read)
- **Evidence:** `src/lib/email/emailTemplateOptions.ts` (`isCompanyLevelRole`, `canManageEventPhotoEmails`, `canDuplicateTemplate`, `templateReadOnlyReason`, `EVENT_PHOTO_SMS_LIMIT`, `TEMPLATE_SUBJECT_LIMIT`); `src/services/emailService.ts` (`templateBody`).
- **Exceptions:** Older servers send only `location_id` (`mapTargeting`).
- **Verification:** Test-backed (`src/lib/email/emailTemplateOptions.test.ts`)
- **Open questions:** Server enforcement of manager scoping.

### BR-EMAIL-007 — Email HTML is sanitised and links restricted
- **Rule:** Saved email HTML is cleaned (scripts, event handlers, `javascript:`/non-image `data:` URLs removed) before display or editing; tapped links open only `http(s)`, `mailto`, `tel`.
- **Workflow:** Template/campaign/notification viewers and editors.
- **Enforcement layer:** Mobile client logic · Backend (sanitiser class exists; rules Not assessed)
- **Evidence:** `src/lib/email/safeEmailHtml.ts` (`cleanEmailHtml`); `src/components/ui/HtmlBody.tsx` (`openLink`); `zapzone-backend@ae877e2:app/Support/EmailHtml.php`.
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/email/safeEmailHtml.test.ts`, `src/lib/htmlBlocks.test.ts`)
- **Open questions:** None

### BR-EMAIL-008 — Automated email (notification) rules
- **Rule:** Default notifications cannot be deleted and can be reset only when customised; follow-up (visit) emails can be created by `company_admin`/`location_manager` and edited by a company admin or a manager with a location; "Don't Send To" addresses are sent whenever given (an empty list clears); timing hours validated per trigger.
- **Workflow:** Email Notifications.
- **Enforcement layer:** Mobile client logic · Not determined (controller checks not read)
- **Evidence:** `src/lib/email/visitEmail.ts` (`canDeleteNotification`, `canResetNotification`, `canCreateVisitEmail`, `canSetUpVisitEmail`, `adminLocationField`); `src/lib/email/excludedEmails.ts`; `src/lib/email/notificationSettings.ts` (`hoursError`, `hoursPayload`); `src/services/emailService.ts` (`createEmailNotification`).
- **Exceptions:** Rows with `can_edit: false` are locked.
- **Verification:** Test-backed (`visitEmail.test.ts`, `excludedEmails.test.ts`, `notificationSettings.test.ts`)
- **Open questions:** Server enforcement — Not assessed.

---

## SMS (BR-SMS)

### BR-SMS-001 — SMS templates are company-wide; defaults are locked
- **Rule:** SMS templates belong to the company; any staff role may edit them. For defaults only body, recipients, custom phones, active and timing change; defaults cannot be deleted; only defaults can be reset.
- **Workflow:** SMS Notifications.
- **Enforcement layer:** Backend (server-enforced) · Mobile client logic
- **Evidence:** `zapzone-backend@ae877e2:app/Http/Controllers/Api/SmsNotificationController.php` (`update`, `destroy`, `resetDefault`, `authorizeCompany`); `zapzone-backend@ae877e2:routes/api.php` (`sms-notifications` under `staff`); `src/services/smsNotificationService.ts` (`updateSmsNotification`).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** Whether attendants should edit company SMS (KL-COMMS-003).

### BR-SMS-002 — Test SMS
- **Rule:** A test SMS requires SMS to be configured; it sends "[TEST] " + the effective body with sample values and tags stripped.
- **Workflow:** SMS Notifications.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `SmsNotificationController::sendTest`; `src/services/smsNotificationService.ts` (`sendTestSms`).
- **Exceptions:** No throttle (KL-COMMS-004).
- **Verification:** Source-verified
- **Open questions:** None

### BR-SMS-003 — Character and segment counting
- **Rule:** Characters are counted as code points; any character above 127 switches to 70/67-character segments, otherwise 160/153.
- **Workflow:** SMS editor; event-photo SMS body.
- **Enforcement layer:** Mobile client logic (mirrors backend `segmentCount` per comment)
- **Evidence:** `src/lib/sms/smsText.ts` (`smsCharCount`, `smsSegments`).
- **Exceptions:** GSM-7 extension characters not modelled.
- **Verification:** Test-backed (`src/lib/sms/smsText.test.ts`)
- **Open questions:** None

---

## Notifications inbox (BR-NOTIF)

### BR-NOTIF-001 — Inbox visibility is scoped server-side
- **Rule:** Staff see notifications for their company's locations; managers and attendants only their location; id-bound actions refuse foreign records; mark-all/clear-all require a `location_id` the caller may access.
- **Workflow:** Notifications inbox.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `zapzone-backend@ae877e2:app/Http/Controllers/Api/NotificationController.php` (`visibleTo`, `index`, `markAsRead`/`destroy` → `denyForeignRecord`, `markAllAsRead`/`clearAll` → `scopedLocation`); `routes/api.php` (`staff` group).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-NOTIF-002 — Read and cleared state is shared, not per user
- **Rule:** Read status lives on the notification row; marking read, clearing or deleting changes it for every staff member who can see it.
- **Workflow:** Notifications inbox.
- **Enforcement layer:** Backend (server-enforced data model)
- **Evidence:** `NotificationController::markAsRead` (`status`, `read_at` on the row), `clearAll`, `destroy`.
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** Intended? (KL-NOTIF-002)

### BR-NOTIF-003 — Tap routing order
- **Rule:** A tapped notification (or push) routes by `action_url` first (known shapes: attraction/event purchases, bookings, payments, location-change requests, photo delivery log, customer concerns), then by type/metadata ids, then to the generic details screen; it never throws.
- **Workflow:** Inbox tap, push tap.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/notifications/notificationRouteMapper.ts` (`ACTION_URL_RULES`, `resolveByType`, `resolveNotificationRoute`, `pushDataToNotification`).
- **Exceptions:** Web navigates to `action_url` directly (`zappoint@5de9d9e:src/pages/admin/Notifications.tsx`).
- **Verification:** Test-backed (`src/lib/notifications/notificationRouteMapper.test.ts`)
- **Open questions:** None

### BR-NOTIF-004 — Delete with undo; Today/Earlier by venue day
- **Rule:** A swiped delete is held locally for 5 s (undo) before `DELETE` is sent, and is flushed before any reload or on unmount; rows are grouped Today/Earlier by the venue's calendar day, undated rows go to Earlier.
- **Workflow:** Notifications inbox.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/hooks/useNotifications.ts` (`UNDO_TIMEOUT_MS`, `deleteNotification`, `flushPendingDelete`); `src/lib/notifications/notificationGroups.ts` (`groupByDay`); `src/app/notification/notification.tsx` (`venueDateKey`).
- **Exceptions:** None found.
- **Verification:** Test-backed for grouping (`notificationGroups.test.ts`); undo Source-verified
- **Open questions:** None

---

## Custom fields (BR-FIELD)

### BR-FIELD-001 — Who may change custom fields
- **Rule:** Any staff role may read custom fields; only `company_admin`, `admin`, `location_manager` may create, edit or delete; rows covering more venues than a manager runs are `can_manage: false` (company admin only).
- **Workflow:** Custom Fields.
- **Enforcement layer:** Mobile UI-only (`canWrite` excludes `admin`) · Backend (server-enforced routes; `can_manage` computed server-side)
- **Evidence:** `src/app/custom-fields/custom-fields.tsx` (`canWrite`, `field.canManage`); `zapzone-backend@ae877e2:routes/api.php` (`custom-fields` POST/PUT/DELETE under `staff:company_admin|admin|location_manager`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/CustomFieldController.php` (`index` sets `can_manage`, `store` 403 branch).
- **Exceptions:** Mobile `canWrite` omits `admin`.
- **Verification:** Source-verified
- **Open questions:** None

### BR-FIELD-002 — Checkbox-only fields and targeting convention
- **Rule:** Only the `checkbox` type exists; audience is `customer`, `admin` or `both`; an empty targeting list means "all". On create, unrestricted dimensions are omitted; on edit, empty arrays are sent so a restriction is actually cleared.
- **Workflow:** Custom Fields editor.
- **Enforcement layer:** Backend (server-enforced type/audience validation) · Mobile client logic (payload shape)
- **Evidence:** `CustomFieldController` validation (`type` in `TYPE_CHECKBOX`, `audience` in `AUDIENCES`); `src/app/custom-fields/custom-fields.tsx` (`save`); `src/services/customFieldsService.ts` (`CustomFieldInput`).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** Checkout enforcement of `is_required` — Not assessed.
