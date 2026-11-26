# Customers, Waivers & Memberships — Business Rules Baseline

> **Purpose:** Record the important business rules the Mobile app's Customers, Waivers and Memberships modules apply today, and which layer enforces each.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e` (cited sections only); Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Static source inspection only; nothing was run. Backend evidence is limited to `routes/api.php` and the controller methods cited; shared traits (`applyAuthScope`, `authorizeRecordScope`, `denyContact`, `applyMembershipScope`) were **not** read, so their exact semantics are *Inferred* from call sites and comments. Web Admin evidence is limited to `zappoint@5de9d9e:src/App.tsx`, `WaiversSearch.tsx` and `Memberships.tsx` sections. "Server-enforced" is used only where the backend code was read.
> **Related:** [Feature catalog](../FEATURE_CATALOG.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Architecture](../ARCHITECTURE.md) · [Customers, waivers & memberships features](../features/customers-waivers-and-memberships.md)

---

## Customers (CRM contacts, analytics, concerns, visitors, follow-ups)

### BR-CUST-001 — A contact needs an email or a phone
- **Rule:** Creating/editing a contact requires at least one of email or phone; email must be valid and unique within the company; DOB must be a valid date.
- **Workflow:** Customers list Add, Edit Customer.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced)
- **Evidence:** `src/app/customers/edit-customer.tsx` (save handler: `CONTACT_NEEDS_EMAIL_OR_PHONE`, `YYYY-MM-DD` check); `zapzone-backend@ae877e2:app/Http/Controllers/Api/ContactController.php` (`ContactController::store` L94–122: `required_without`, `email`, `Rule::unique('contacts')` per `company_id`, `date_of_birth` date, `status` in active/inactive). Update rules **Not assessed** line-by-line.
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-CUST-002 — Contact visibility is role-scoped by the server
- **Rule:** The contacts list, show, update and delete are limited to the caller's scope; Mobile applies no client-side access filter and does not send the global active location.
- **Workflow:** Customers list, Edit Customer, deep link `?openId=`.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `src/services/contactsService.ts` (header comment, `fetchAllContacts`); `ContactController::index` L20–33 (`applyAuthScope`, optional `company_id`/`location_id`), `show`/`update`/`destroy` (`denyContact`).
- **Exceptions:** None found.
- **Verification:** Source-verified that scope helpers are called; scope semantics Inferred (trait not read).
- **Open questions:** Should company admins' global active location narrow this list as it does Concerns/Visitors? (see KL-CUST-005)

### BR-CUST-003 — Deleting a contact is permanent and open to all staff
- **Rule:** Contact delete is a hard delete (model has no SoftDeletes) and is available to any staff role in scope; Mobile shows delete (single and bulk) to all roles.
- **Workflow:** Customers list row/bulk delete.
- **Enforcement layer:** Backend (server-enforced: scope only, no role restriction); Mobile UI-only (no gate)
- **Evidence:** `src/app/customers/customers.tsx` (`deleteContact` ~L502, bulk `Promise.all` ~L581); `routes/api.php` L688–702 (`staff`); `ContactController::destroy` L272–282; `app/Models/Contact.php` (no SoftDeletes — Grep).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** Is attendant-level hard delete of CRM contacts intended? (KL-CUST-006)

### BR-CUST-004 — Customer Analytics location scope
- **Rule:** Company admins may narrow analytics to a location (`location_id`); location managers and attendants are always limited to their own location. Mobile sends the active global location only for company admins.
- **Workflow:** Customer Analytics view and export.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic
- **Evidence:** `src/app/customers/analytics.tsx` (`isCompanyAdmin`, scope ~L100–185); `src/services/customersService.ts` (`fetchCustomerAnalytics`, `exportCustomerAnalytics`); `CustomerController::analytics` L576–609.
- **Exceptions:** The server resolves the acting user from the request's `user_id` parameter when present (L578–579), not strictly from the token.
- **Verification:** Source-verified
- **Open questions:** Whether `user_id` should be trusted (KL-CUST-002); whether company filtering is applied anywhere for an unscoped company admin (KL-CUST-003).

### BR-CUST-005 — Which analytics figures honour the date range
- **Rule:** Presets `7d`/`30d`/`90d`/`1y`/`all` (default `30d`) or custom start/end. Revenue totals honour the range; Total Customers is all-time distinct guest emails; Active Customers and New Customers are fixed to the last 30 days regardless of range. "vs previous period" windows are computed server-side; Mobile displays server changes untouched and colours only like-for-like changes.
- **Workflow:** Customer Analytics.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (display)
- **Evidence:** `CustomerController::analytics` L581–671; `src/lib/customers/customerAnalyticsDisplay.ts` (`kpiDisplay`, `parseChangePercent`).
- **Exceptions:** Sections after L671 were only partly read — other metrics' date handling **Not assessed**.
- **Verification:** Source-verified (backend); Test-backed display rules (`src/lib/customers/customerAnalyticsDisplay.test.ts`)
- **Open questions:** Should KPI labels state their fixed windows? (KL-CUST-001)

### BR-CUST-006 — Concern status transitions
- **Rule:** A concern's status is one of `new`, `contacted`, `resolved`. Setting `new` (reopen) clears handler and handled-at; any other status stamps the acting user and time. A resolution note is optional (≤1000 chars) and kept if omitted. Updates require the concern to be in the caller's scope.
- **Workflow:** Customer Concerns status actions.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `src/services/checkoutConcernsService.ts` (PUT ~L271); `CheckoutConcernController::update` L246–273.
- **Exceptions:** Creating concerns (`POST /api/checkout-concerns`, `/abandoned`) is public and throttled (`routes/api.php` L214–215).
- **Verification:** Source-verified
- **Open questions:** None

### BR-CUST-007 — Lead filter and "Booked?" use the list-only `completed_booking` flag
- **Rule:** "Completed booking" = `completed_booking === true`; "Did not complete booking" = abandoned checkout and not booked; "Requested help" = schedule-help or call-to-book (booked or not); "Needs a follow-up call" = not resolved and not booked. The Lead filter combines with the status filter. Because the PUT response lacks `completed_booking`, Mobile keeps the row's existing flag after a status update.
- **Workflow:** Customer Concerns list, Booked? column and export.
- **Enforcement layer:** Mobile client logic (flag computed by Backend on list only)
- **Evidence:** `src/lib/concerns/leadFilter.ts` (`matchesLeadFilter`, `bookedLabel`); `src/app/customers/customer-concerns.tsx` ~L290; `CheckoutConcernController::index` L214–219 (`completedBookingFlags`), `update` L270–272 (no flag).
- **Exceptions:** None found.
- **Verification:** Test-backed (`src/lib/concerns/leadFilter.test.ts`)
- **Open questions:** None

### BR-CUST-008 — Visitor SMS opt-in display
- **Rule:** SMS column/CSV shows "Opted In" for a guest who consented, "No" for an identified guest who did not, and blank for anonymous visitors; the session detail names the opt-in with its time when known.
- **Workflow:** Visitor Tracking list, export, session detail.
- **Enforcement layer:** Mobile client logic
- **Evidence:** `src/lib/visitors/smsConsent.ts`.
- **Exceptions:** Server-side export content **Not assessed**.
- **Verification:** Test-backed (`src/lib/visitors/smsConsent.test.ts`)
- **Open questions:** None

### BR-CUST-009 — Visit follow-up email actions
- **Rule:** "Send now" is offered only on a completed visit and only for the current recipient address; a scheduled email, or a failed one still retrying, can be cancelled ("Don't send"); bulk ticket-order lines never get follow-ups; completing a booking from Edit Booking sends no booking-update email.
- **Workflow:** Follow-up card on bookings, event purchases, escape-room games; guest ratings panel.
- **Enforcement layer:** Mobile client logic; Backend enforcement Not determined
- **Evidence:** `src/lib/visitFollowUp/visitFollowUp.ts`, `src/lib/visitFollowUp/statusEdit.ts`; `src/services/visitFollowUpService.ts`; routes `staff` (`routes/api.php` L727–733). `VisitFollowUpController` **Not assessed**.
- **Exceptions:** Escape-room bookings are emailed from the game screen (per tests).
- **Verification:** Test-backed (`src/lib/visitFollowUp/visitFollowUp.test.ts`, `src/lib/visitFollowUp/statusEdit.test.ts`)
- **Open questions:** Does the backend reject send-now on an uncompleted visit?

### BR-CUST-010 — Customer search is staff-only and capped
- **Rule:** The customer picker (e.g. Add Member) searches only after ≥2 characters (debounced 300 ms) and shows up to 8 hits; the server requires a staff caller, matches every term against name/email/phone, returns at most 10 active customers.
- **Workflow:** Memberships Add Member (and other pickers).
- **Enforcement layer:** Mobile client logic; Backend (server-enforced)
- **Evidence:** `src/app/memberships/memberships.tsx` ~L809–833; `routes/api.php` L172 (route outside auth middleware); `CustomerController::search` L525–568 (`isStaff` check, `limit(10)`, `active()`).
- **Exceptions:** No company scoping is visible in `search` (KL-CUST-008).
- **Verification:** Source-verified
- **Open questions:** Are customers platform-global by design?

---

## Waivers

### BR-WAIVER-001 — Records default to completed waivers for today
- **Rule:** Without parameters the server lists `completed` waivers whose effective visit date is today; `status=all` removes the status filter; a `timeframe` (or `all=1`) changes the date scope. Mobile defaults to Completed + Today and "Reset" returns there.
- **Workflow:** Waiver Records.
- **Enforcement layer:** Backend (server-enforced default); Mobile client logic
- **Evidence:** `src/app/waivers/waivers.tsx` (`STATUS_OPTIONS`, `resetAll`); `WaiverController::index` L113–153.
- **Exceptions:** Check-in, template, location and submitted-range filters are applied client-side to the current page only (KL-WAIVER-001).
- **Verification:** Source-verified; visit-period mapping Test-backed (`src/lib/waivers/visitPeriod.test.ts`)
- **Open questions:** None

### BR-WAIVER-002 — Waiver deletion
- **Rule:** Only company_admin/admin may delete a waiver, within record scope. Deletion writes a deletion-log row (reason + snapshot of signer name, email, phone, date, status, template, booking, activity), marks status `deleted`, soft-deletes, and writes an activity log, in one transaction. The reason is optional and trimmed. Mobile additionally hides delete unless the company setting `admin_delete_enabled` is on (treated as on before settings load) and blocks double submission.
- **Workflow:** Records row delete, Waiver detail sheet (unified `WaiverDeleteSheet`).
- **Enforcement layer:** Backend (server-enforced role); Mobile UI-only (company switch); Mobile client logic (single-flight)
- **Evidence:** `src/lib/waivers/waiverDeletion.ts` (`canDeleteWaivers`, `submitWaiverDeletion`); `src/services/waiversService.ts` (`deleteWaiver`); `WaiverController::destroy` L617–676, `guardAdmin` L1214–1220. `admin_delete_enabled` is not referenced by any backend controller other than settings validation (Grep).
- **Exceptions:** None found.
- **Verification:** Source-verified; Test-backed (`src/lib/waivers/waiverDeletion.test.ts`)
- **Open questions:** Should the backend honour `admin_delete_enabled`? (KL-WAIVER-003)

### BR-WAIVER-003 — Print and export permission
- **Rule:** Server print (PDF) and server export are allowed for company_admin/admin, and for location_manager only when `manager_print_export_enabled`. Mobile mirrors this for Print. Mobile's Export CSV is generated on the device from the displayed rows and is shown to every role.
- **Workflow:** Records print / Export CSV, detail sheet print.
- **Enforcement layer:** Backend (server-enforced for print and `/waivers/export`); Mobile UI-only (print gate); export not enforced
- **Evidence:** `src/app/waivers/waivers.tsx` (`canPrint`, `exportCsv`, `moreShortcuts`); `WaiverController::print` L679–686, `export` L709–712, `guardPrintExport` L1222–1235. Web: `zappoint@5de9d9e:src/pages/admin/waivers/WaiversSearch.tsx` (`handleExport` L542–563 is also client-side).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** Should client-side CSV exports respect the print/export permission? (KL-WAIVER-002)

### BR-WAIVER-004 — Waiver check-in
- **Rule:** Only a `completed` waiver that is not already checked in can be checked in (400 otherwise); check-in stamps time and user and writes an activity log; undo is available. Server allows any staff in record scope; Mobile Records shows check-in only to company_admin/location_manager.
- **Workflow:** Records row action, detail sheet, check-in desk.
- **Enforcement layer:** Backend (server-enforced state rules); Mobile UI-only (role restriction)
- **Evidence:** `src/app/waivers/waivers.tsx` (`canCheckIn = canAssign`); `WaiverController::checkIn` L961–992, `undoCheckIn` L995+.
- **Exceptions:** Other Mobile check-in surfaces (check-in desk) **Not assessed** for role gating.
- **Verification:** Source-verified
- **Open questions:** Intended attendant permission on Records (KL-WAIVER-008).

### BR-WAIVER-005 — Assigning a waiver is manager/admin-only
- **Rule:** Creating a staff-sent waiver (template + visit date + optional contact/links) is limited to company_admin/admin/location_manager.
- **Workflow:** Assign Waiver (`create-waiver`).
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only (Records button)
- **Evidence:** `src/app/waivers/waivers.tsx` (`canAssign`); `src/services/waiversService.ts` (`assignWaiver`); `WaiverController::assign` L261–264 (`guardManager` L1198–1204). Hub quick link "Assign Waiver" is not role-gated (`src/app/waivers/waivers-hub.tsx`).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-WAIVER-006 — Template management permission
- **Rule:** Create, edit, delete (soft), restore, force-delete, status change and kiosk preview of templates require company_admin/admin, or location_manager when `manager_can_build_templates`. Mobile mirrors this, and further limits "Delete permanently" to company_admin.
- **Workflow:** Templates, Template builder.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only (force-delete stricter)
- **Evidence:** `src/app/waivers/templates.tsx` (`canManage` L184–187, force delete L645); `WaiverTemplateController` (`store`/`update`/`destroy`/`restore`/`forceDestroy`/`updateStatus`/`kioskPreview`, `guardCanManageTemplates` L559–575).
- **Exceptions:** Escape-room templates are managed from Escape Rooms and excluded from the generic kiosk and group invites.
- **Verification:** Source-verified; Test-backed template classification (`src/lib/waivers/templateDisplay.test.ts`)
- **Open questions:** None

### BR-WAIVER-007 — Post-waiver ads permission
- **Rule:** Ad CRUD, reorder and ad settings are open to company_admin/admin/location_manager on the server (independent of the template-builder switch); Mobile allows targeting and reorder only for company_admin.
- **Workflow:** Template Ads.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only (stricter)
- **Evidence:** `src/app/waivers/template-ads.tsx` L106–108; `routes/api.php` L850–857.
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-WAIVER-008 — Waiver settings
- **Rule:** Any staff user with a company can read settings; only company_admin/admin can update them (Mobile: company_admin only). Validated ranges include kiosk inactivity timeout 10–600 s and reminder window 1–168 h; duplicate rule ∈ none/allow/manager_only.
- **Workflow:** Waiver Settings.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only
- **Evidence:** `src/app/waivers/waiver-settings.tsx` (`canEdit` L112); `WaiverSettingController::show/update` L15–67; Web `App.tsx` L289 (`ProtectedRoute` company_admin).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-WAIVER-009 — Deletion log access
- **Rule:** The deletion log is visible to company_admin/admin, and to location_manager only when `manager_can_view_deletion_log`; attendants get 403.
- **Workflow:** Deletion Log.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `WaiverController::deletionLog` L804–825; Mobile shows the shortcut to all roles (`src/app/waivers/waivers.tsx` `moreShortcuts`, `waivers-hub.tsx` `manageLinksFor`).
- **Exceptions:** **Disagreement:** `GET /api/waivers/reports/deleted` returns the same log rows including snapshots to any in-scope staff (`WaiverReportController::report` L25–49, `deleted` L199–216), and Mobile offers that report to all roles (`src/app/waivers/reports.tsx`).
- **Verification:** Source-verified
- **Open questions:** Which access rule is intended? (KL-WAIVER-005)

### BR-WAIVER-010 — Kiosk signature requirements
- **Rule:** A submission needs signer first/last name, valid email, phone, DOB showing the signer is an adult (server `ADULT_AGE`), typed legal name, accepted agreement, accepted electronic-signature consent when the template enables it; each minor needs first/last name, past-or-today DOB and relationship; minors and selected dependents are capped by the template's `max_minors`. A drawn signature is optional (must be a `data:image/` URI if sent — Mobile sends SVG); the typed legal name is the binding signature. Photo/video and marketing consent are sent only when the template enables them; `read_seconds` is recorded.
- **Workflow:** In-app kiosk (session and walk-in), escape-room kiosk form.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic (pre-validation)
- **Evidence:** `src/components/waivers/KioskWaiverForm.tsx` (`firstProblem` L317–340, `handleSubmit` L342–380); `WaiverPublicController::validateSubmission` L1497–1544.
- **Exceptions:** Returning guests' phone is the masked value on file and is not re-validated client-side; the server re-reads signer details from the saved profile (Mobile comment in `src/app/waivers/kiosk.tsx` ~L217–227; server merge **Not assessed**).
- **Verification:** Source-verified; minor cap and phone shape Test-backed (`src/lib/waivers/kioskContract.test.ts`); SVG signature rendering in the printed PDF **Not assessed**
- **Open questions:** None

### BR-WAIVER-011 — Launching a kiosk
- **Rule:** Any staff role may create a prefilled kiosk session for a booking / attraction purchase / event purchase; if the waiver is already completed for the booking date, no kiosk opens. The generic kiosk launcher lists standard templates only (escape-room templates excluded). Walk-in and token kiosk form/submit endpoints are public and throttled.
- **Workflow:** Records "Launch Kiosk", booking/purchase waiver panels, check-in verification.
- **Enforcement layer:** Backend (server-enforced for session creation); Mobile client logic (template filtering)
- **Evidence:** `src/lib/waivers/kiosk.ts` (`launchKioskSession`); `src/app/waivers/waivers.tsx` (`openKiosk`, `standardTemplatesOnly`); `WaiverController::kioskSession` L363–366 (`guardStaff`); `routes/api.php` L85–91.
- **Exceptions:** Draft templates open in read-only preview through the staff `kiosk-preview` endpoint.
- **Verification:** Source-verified; token parsing Test-backed (`src/lib/waivers/kioskToken.test.ts`)
- **Open questions:** None

### BR-WAIVER-012 — Returning-guest lookup at the kiosk
- **Rule:** Offered only for walk-in kiosks when the server reports returning lookup enabled (a server config flag, not a company setting). Lookup needs phone + last name against an active, non-escape-room template; a found profile is returned with masked email/phone, age (never DOB) and child dependents; a lookup token binds the later submission; rate limiting yields 429 ("too many lookups"); a degraded lookup yields 503; profiles flagged for review require staff.
- **Workflow:** In-app kiosk (start → lookup → form).
- **Enforcement layer:** Backend (server-enforced); Mobile client logic
- **Evidence:** `src/app/waivers/kiosk.tsx` (`phase`, `lookupToken`); `src/lib/waivers/kioskContract.ts` (`classifyLookupResponse`, `classifyLookupFailure`, `isValidKioskPhone`); `WaiverPublicController::kioskLookup` L463–513, `kioskSubmit` ~L281–285 (needs-staff and lookup-token checks); `WaiverProfileService::presentForKiosk` L282–302, `maskEmail`/`maskPhone` L310–329.
- **Exceptions:** None found.
- **Verification:** Source-verified; Test-backed (`src/lib/waivers/kioskContract.test.ts`)
- **Open questions:** None

### BR-WAIVER-013 — Group (bulk) invites
- **Rule:** Only company_admin/admin/location_manager may create or resend. Template and date are required, chaperone name required (email/phone optional); escape-room templates are rejected (422). For location_manager/attendant the invite is forced to the user's location and bookings/events from another location are refused (403). Create succeeds even if the chaperone could not be notified (message says so; `chaperone_notified` flag). Resend returns 422 when no email/text went out. There is no staff-side per-recipient resend; recipient resend/edit exist only on the public chaperone-token routes.
- **Workflow:** Group Invites, Create Group Invite.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only (role gate); Mobile client logic (feedback)
- **Evidence:** `src/app/waivers/group-invites.tsx` (`canManage` L183–185); `src/lib/waivers/groupInvites.ts` (`createInviteFeedback`, `recipientSummary`); `WaiverBulkInviteController::store` L97–173, `resend` L176–196, `guardManager` L240+; `routes/api.php` L96–102, L841–842.
- **Exceptions:** Hub quick link "Create Group Invite" is not role-gated (`waivers-hub.tsx`).
- **Verification:** Source-verified; Test-backed (`src/lib/waivers/groupInvites.test.ts`)
- **Open questions:** None

### BR-WAIVER-014 — Returning-customer profile maintenance
- **Rule:** Only company_admin/admin/location_manager may list, view and edit waiver profiles and their dependents; profiles cannot be deleted (no endpoint); dependents can. Mobile requires both names and a phone to save a profile, a real `YYYY-MM-DD` DOB if given, both names on a dependent, and sends blanks as null.
- **Workflow:** Returning Customers list and detail.
- **Enforcement layer:** Backend (server-enforced role); Mobile client logic (form rules; server validation **Not assessed**)
- **Evidence:** `routes/api.php` L882–889; `src/lib/waivers/returningCustomers.ts`; Web `App.tsx` L288 (`ProtectedRoute` company_admin + location_manager).
- **Exceptions:** None found.
- **Verification:** Source-verified; Test-backed (`src/lib/waivers/returningCustomers.test.ts`)
- **Open questions:** None

### BR-WAIVER-015 — Period summary ignores the status filter
- **Rule:** The Records summary panel counts the same visit period (and, for company admins, the active location) as the dashboard, independent of the list's status filter, so the two screens agree.
- **Workflow:** Waiver Records summary panel.
- **Enforcement layer:** Mobile client logic; Web Admin reference behaviour
- **Evidence:** `src/app/waivers/waivers.tsx` (`periodScope`, `useWaiverPeriodSummary`); Web `WaiversSearch.tsx` L203–214; backend `WaiverController::periodSummary` L40+ (body **Not assessed**).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

---

## Memberships

### BR-MEMBER-001 — Selling a membership (Add Member)
- **Rule:** Mobile requires an existing customer (from search) and a plan; holder name and home location are optional. Payment type is `charge`, `external` (cash/external, no card) or `comp`; free plans need no card. For `charge`, the merchant is resolved server-side for the exact plan + home location; any change to either invalidates it; submit stays disabled until a gateway matching the current plan/location is loaded and card number, month, year and CVV are valid; test card numbers are refused; the card is tokenized with Accept.js before `POST /api/memberships`.
- **Workflow:** Memberships Add Member sheet.
- **Enforcement layer:** Mobile client logic; Backend (server-enforced validation of the create payload)
- **Evidence:** `src/app/memberships/memberships.tsx` (Add Member ~L760–957); `src/lib/payments/membershipChargeGate.ts` (`isMembershipChargeReady`); `MembershipController::store` L379–402 (`customer_id` or first/last name, `membership_plan_id` required, email optional). Charge execution path **Not assessed**.
- **Exceptions:** Backend accepts a new customer by name without `customer_id`; Mobile does not offer this (KL-MEMBER-005).
- **Verification:** Test-backed (`src/lib/payments/membershipChargeGate.test.ts`); remainder Source-verified
- **Open questions:** None

### BR-MEMBER-002 — Deleting a membership
- **Rule:** Only company_admin may delete, and only a `canceled` membership (422 otherwise); deletion is logged and soft-deletes the record. Mobile shows Delete (detail and bulk) to all roles.
- **Workflow:** Membership Details, Memberships bulk Delete.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only (none)
- **Evidence:** `src/services/membershipsService.ts` (`deleteMembership` comment); `MembershipController::destroy` L920–939; route `staff:company_admin|admin|location_manager` (`routes/api.php` L811) is broader than the controller check.
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-MEMBER-003 — Status change and term extension
- **Rule:** Setting a status (`pending`, `active`, `past_due`, `suspended`, `frozen`, `canceled`, `expired`) or extending the term end is limited to company_admin and location_manager (the `admin` role is not included). Extension may push past the plan's season end or revive an expired/past-due membership. Mobile "Reactivate" sets status `active`.
- **Workflow:** Membership Details.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only (none)
- **Evidence:** `src/app/memberships/membership-details.tsx` (~L299, ~L490); `MembershipController::updateStatus` L842–853, `extend` L900–914.
- **Exceptions:** No location-scope check is visible in these methods (KL-MEMBER-002).
- **Verification:** Source-verified
- **Open questions:** Is excluding `admin` intended? (KL-MEMBER-006)

### BR-MEMBER-004 — Freeze, unfreeze and cancel
- **Rule:** Freeze/cancel are allowed to the owning customer or in-scope staff. Freeze may carry an `until` date after today. Cancel `effective` is `immediate` (status → canceled now) or `end_of_term` (cancellation scheduled at the current term end); when omitted the plan's cancellation mode applies. Mobile bulk Cancel uses `end_of_term`.
- **Workflow:** Membership Details, Memberships bulk actions.
- **Enforcement layer:** Backend (server-enforced)
- **Evidence:** `src/app/memberships/memberships.tsx` (`runBulkStatus` ~L362–386); `MembershipController::freeze` L855–867, `cancel` L869–894, `ownerOrStaff` L1694–1710. `unfreeze` route is `staff` (L808); method body **Not assessed**.
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-MEMBER-005 — Membership list scope
- **Rule:** Location managers and attendants see memberships whose home location or sold-at location is theirs; `location_id` filters by home location. Mobile passes the company admin's active global location.
- **Workflow:** Memberships list.
- **Enforcement layer:** Backend (server-enforced); Mobile client logic
- **Evidence:** `src/app/memberships/memberships.tsx` L229–237; `MembershipController::index` L266–286.
- **Exceptions:** Detail `show` performs no scope check in the method (KL-MEMBER-002).
- **Verification:** Source-verified
- **Open questions:** None

### BR-MEMBER-006 — Plan management permission
- **Rule:** Plan create/update/delete/toggle and benefit writes are limited to company_admin/admin/location_manager; plan reads are open to all staff. Mobile shows management only to company_admin/location_manager. Plans are soft-deleted.
- **Workflow:** Membership Plans.
- **Enforcement layer:** Backend (server-enforced); Mobile UI-only
- **Evidence:** `src/app/memberships/membership-plan.tsx` (`canManage` L420–422); `routes/api.php` L787–795; `app/Models/MembershipPlan.php` (SoftDeletes — Grep).
- **Exceptions:** None found.
- **Verification:** Source-verified
- **Open questions:** None

### BR-MEMBER-007 — Member photo and notes
- **Rule:** Any authenticated staff user may upload a member photo (image, ≤5 MB; previous path audited) or add a note.
- **Workflow:** Membership Details.
- **Enforcement layer:** Backend (server-enforced validation)
- **Evidence:** `MembershipController::uploadPhoto` L956–972, `addNote` L974+; `src/services/membershipsService.ts` (`uploadMembershipPhoto`, `addMembershipNote`).
- **Exceptions:** No scope check visible in these methods (KL-MEMBER-002).
- **Verification:** Source-verified
- **Open questions:** None

### BR-MEMBER-008 — Membership report date range
- **Rule:** Mobile requests the summary for a from/to range defaulting to one month back through today and sends no location.
- **Workflow:** Membership Reports.
- **Enforcement layer:** Mobile client logic; Backend defaults Not assessed
- **Evidence:** `src/app/memberships/membership-reports.tsx` (~L65, ~L298–335); `src/services/membershipsService.ts` (`fetchMembershipReport` — comment says backend defaults to the current month).
- **Exceptions:** None found.
- **Verification:** Source-verified (Mobile); backend Not assessed
- **Open questions:** Should company admins' active location apply? (KL-MEMBER-003)

---

## Recorded disagreements (Mobile vs Web Admin vs Backend)
- **Waiver records location:** Web sends `location_id` server-side (`WaiversSearch.tsx` L201); Mobile filters the current page client-side; backend supports `location_id` (`WaiverController::applyLocationScope`).
- **Waiver delete switch:** Mobile/Web treat `admin_delete_enabled` as a gate; backend ignores it.
- **Deletion visibility:** deletion log restricted; `reports/deleted` not.
- **Waiver check-in:** backend allows any staff; Mobile Records limits to admin/manager.
- **Template force delete:** backend allows managers with the builder switch; Mobile admin-only.
- **Membership delete route vs controller:** route allows managers; controller allows company_admin only.
- **Membership status/extend:** exclude `admin`, unlike neighbouring routes.
