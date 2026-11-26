# ZapZone Mobile — Feature Catalog

> **Purpose:** Central inventory of every implemented module: what users can do, where it lives, and its status.
> Each module links to its detailed section.
> **Status:** Baseline (descriptive). Documents existing behaviour; not a requirements source.
> **Last reviewed:** 2026-11-26
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e` (cited sections only); Backend
> `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Static inspection only, so no module is runtime-verified. Every route folder under
> `src/app/` is covered. Some form internals and many Web Admin pages were not assessed; see each detail document's
> scope note.
> **Related:** [Index](README.md) · [Business rules](BUSINESS_RULES.md) · [Known limitations](KNOWN_LIMITATIONS.md) ·
> [Architecture](ARCHITECTURE.md)

## How to read this catalog

- **Roles (UI)** means who can *reach* the module through tabs, Quick Nav, hubs or buttons in Mobile. It is **not**
  authorisation. Access control is the Backend's job but is not uniform there (see
  [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md)); the detail documents record where the UI and the server differ. "All" means
  every staff role: `company_admin`, `location_manager` and `attendant`.
- **Status** and **Verification** use the definitions in [README.md](README.md#status-definitions). *SV* =
  Source-verified, *TB* = Test-backed (pure-logic unit tests exist; not run), *DVR* = Device verification required.
- **Key limitations** lists the most relevant `KL-*` items. The full register is
  [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md).

## Coverage summary

| Domain | Modules | Detail document | Rules |
|---|---|---|---|
| Dashboard, administration, analytics and payments | 20 | [features/dashboard-administration-analytics-and-payments.md](features/dashboard-administration-analytics-and-payments.md) | [rules](business-rules/dashboard-administration-analytics-and-payments.md) |
| Bookings and scheduling | 12 | [features/bookings-and-scheduling.md](features/bookings-and-scheduling.md) | [rules](business-rules/bookings-and-scheduling.md) |
| Attractions, events and check-in | 11 | [features/attractions-events-and-checkin.md](features/attractions-events-and-checkin.md) | [rules](business-rules/attractions-events-and-checkin.md) |
| Packages and pricing | 12 | [features/packages-and-pricing.md](features/packages-and-pricing.md) | [rules](business-rules/packages-and-pricing.md) |
| Customers, waivers and memberships | 19 | [features/customers-waivers-and-memberships.md](features/customers-waivers-and-memberships.md) | [rules](business-rules/customers-waivers-and-memberships.md) |
| Photos, communications and notifications | 16 | [features/photos-communications-and-notifications.md](features/photos-communications-and-notifications.md) | [rules](business-rules/photos-communications-and-notifications.md) |
| Cross-cutting platform (auth, session, API, location) | — | [ARCHITECTURE.md](ARCHITECTURE.md) | [rules](business-rules/core-platform-rules.md) |

## Dashboard, administration, analytics and payments

Detail: [features/dashboard-administration-analytics-and-payments.md](features/dashboard-administration-analytics-and-payments.md) (abbreviated *D* below).

| Module | What users can do | Main routes | Roles (UI) | Status | Verif. | Key limitations | Detail |
|---|---|---|---|---|---|---|---|
| Tabs & Quick Nav | Role-aware tab bar and module menu | `(tabs)/_layout` | All | Implemented | SV, TB | KL-UI-005 | [D](features/dashboard-administration-analytics-and-payments.md#bottom-tabs--quick-navigation-menu) |
| Home dashboard | Role card sets, breakdowns, 5-min cache, live recent purchases, activity by category | `(tabs)/home` | All | Implemented | TB | KL-ADMIN-002, KL-ANALYTICS-001/003 | [D](features/dashboard-administration-analytics-and-payments.md#home-dashboard) |
| Location tab | Per-location performance table | `(tabs)/location` | Company admin (attendant sees it empty) | Implemented | SV | KL-ADMIN-001 | [D](features/dashboard-administration-analytics-and-payments.md#location-tab-location-performance) |
| Activity tab | Manager's new bookings and recent purchases | `(tabs)/activity` | Location manager | Implemented | SV | — | [D](features/dashboard-administration-analytics-and-payments.md#activity-tab-location-manager) |
| Login | Staff sign-in; add another account | `index` | All | Implemented (no password recovery) | SV | KL-ARCH-001, KL-ADMIN-003 | [D](features/dashboard-administration-analytics-and-payments.md#login-screen) |
| Saved accounts | Switch, add and remove accounts (max 5) | `(tabs)/accounts`, `switch-account` | All | Implemented | SV | KL-SEC-002 | [D](features/dashboard-administration-analytics-and-payments.md#accounts-tab-saved-accounts) |
| Profile | Avatar, logos, business overview, edit personal and company details | `profile/*` | All (logos: admin) | Implemented | SV | KL-ADMIN-005 | [D](features/dashboard-administration-analytics-and-payments.md#profile--edit-profile) |
| Settings | Theme, override PIN, Authorize.Net and Google Calendar cards, update row | `settings/settings` | All | Implemented | SV | KL-ADMIN-006, KL-PAYMENT-001 | [D](features/dashboard-administration-analytics-and-payments.md#settings) |
| App update | Version gate, dialog, reminder notice, Android in-app APK install | Root-layout gate | All | Implemented (Android only) | TB | KL-UPDATE-001–003, KL-PLAT-005 | [D](features/dashboard-administration-analytics-and-payments.md#app-update-gate-dialog-notice-and-installer) |
| User Management hub | Entry to accounts, PINs and logs | `user-managements/user-management-hub` | Admin, manager | Implemented | SV | KL-ADMIN-007 | [D](features/dashboard-administration-analytics-and-payments.md#user-management-hub) |
| Manage Accounts | Load all staff; filter; create, invite, edit, delete, bulk; CSV | `user-managements/manage-accounts` | Company admin | Implemented | SV | KL-ADMIN-008 | [D](features/dashboard-administration-analytics-and-payments.md#manage-accounts-company-admin) |
| Attendants Management | Same capabilities, for attendants | `user-managements/attendants` | Location manager | Implemented | SV | KL-ADMIN-008 | [D](features/dashboard-administration-analytics-and-payments.md#attendants-management-location-manager) |
| Employee PINs | Set, clear and unlock PINs; terminal auto-lock | `user-managements/staff-pins` | Admin, manager | Partially implemented | TB | KL-ADMIN-009 | [D](features/dashboard-administration-analytics-and-payments.md#employee-pins-staff-pins--terminals) |
| Activity Log | Filtered audit trail; CSV | `user-managements/activity-logs` | Admin, manager | Implemented | SV | — | [D](features/dashboard-administration-analytics-and-payments.md#activity-log) |
| Analytics hub | Report entry and quick links | `analytics-reports/analytics-hub` | All | Implemented | SV | — | [D](features/dashboard-administration-analytics-and-payments.md#analytics--reports-hub) |
| Performance Analytics | Company report or location report, chosen by role | `analytics-reports/performance-analytics` | All | Implemented | SV | KL-ANALYTICS-002/004 | [D](features/dashboard-administration-analytics-and-payments.md#performance-analytics-two-reports) |
| Accounting Analytics | Purchases by date range and location | `analytics-reports/accounting-analytics` | All | Implemented | TB | — | [D](features/dashboard-administration-analytics-and-payments.md#accounting-analytics) |
| Page Analytics | Storefront traffic panels | `analytics-reports/page-analytics` | All | Implemented | TB | — | [D](features/dashboard-administration-analytics-and-payments.md#page-analytics) |
| Payments | List, refund/void, delete, restore, invoices | `payments/*` | All | Implemented | SV | KL-PAYMENT-003/005 | [D](features/dashboard-administration-analytics-and-payments.md#payments-hub-payments-list-deleted-payments-package-invoices) |
| Card charge pipeline | Tokenise, charge, outcome, rollback, checkout key (shared by checkouts) | Shared libs | Checkout callers | Implemented | TB | KL-PAYMENT-006 | [D](features/dashboard-administration-analytics-and-payments.md#card-charge-pipeline-shared-by-checkout-screens) |

## Bookings and scheduling

Detail: [features/bookings-and-scheduling.md](features/bookings-and-scheduling.md) (*B*).

| Module | What users can do | Main routes | Roles (UI) | Status | Verif. | Key limitations | Detail |
|---|---|---|---|---|---|---|---|
| Bookings hub | Entry to list, calendar, space schedule, location requests | `bookings/bookings-hub` (`bookings/check-in` redirects to `/check-in`) | All | Implemented | SV | — | [B](features/bookings-and-scheduling.md#bookings-hub) |
| Manage Bookings | KPIs, search and filters, table/card views, bulk status/delete, row actions, export/report/import, trash/restore | `bookings/bookings` | All (location column for company admin) | Implemented | SV | KL-BOOK-001/006/007 | [B](features/bookings-and-scheduling.md#manage-bookings) |
| Booking details | Quick and full view, check-in with balance warning, internal notes log, history, QR, delete | `BookingDetailSheet`, `BookingFullView` | As caller | Implemented | SV | KL-BOOK-001 | [B](features/bookings-and-scheduling.md#booking-details-quick-view-and-full-view) |
| Edit Booking | Server-quoted edits, overlap PIN override, location move or request | `bookings/edit-booking` | All (location move: company admin) | Implemented (custom-package terms not editable) | SV | KL-BOOK-008 | [B](features/bookings-and-scheduling.md#edit-booking) |
| Create Booking | 5-step checkout; card charge uses the server-saved amount due | `bookings/create-booking` | All | Implemented | SV | — | [B](features/bookings-and-scheduling.md#create-booking-step-by-step-wizard) |
| Manual Booking | Standard or flexible desk entry plus Custom Package | `bookings/manual-booking` | All (company admin picks location) | Implemented | SV | KL-BOOK-009/011 | [B](features/bookings-and-scheduling.md#manual-booking-including-custom-package) |
| Booking data layer | In-memory list cache, change-feed merge, date windows | `src/lib/bookings/bookingListCache.ts` | — | Implemented | TB | KL-BOOK-002/005 | [B](features/bookings-and-scheduling.md#booking-data-layer-shared-cache) |
| Booking Calendar | Month, week and day views with tickets and event registrations; filters | `bookings/calendar` | All | Implemented | SV | — | [B](features/bookings-and-scheduling.md#booking-calendar-bookingscalendar) |
| Dashboard Calendar | Day board of spaces; tap to book; walk-ins | `(tabs)/calendar` | All | Implemented | SV, TB | — | [B](features/bookings-and-scheduling.md#dashboard-calendar-tab-tabscalendar) |
| Space Schedule | Space timeline and list; closures; 7-day counts; tap to book | `bookings/space-schedule` | All | Implemented | SV | KL-BOOK-013 | [B](features/bookings-and-scheduling.md#space-schedule) |
| Location Requests | List; approve (or force); reject | `bookings/location-requests` | Company admin or destination staff | Implemented | SV | KL-BOOK-012 | [B](features/bookings-and-scheduling.md#location-requests) |
| Day Offs | Availability blocks: create, edit, bulk add, delete, history | `user-managements/day-offs` | Company admin, location manager | Implemented | SV, TB | KL-BOOK-014 | [B](features/bookings-and-scheduling.md#day-offs--availability-blocks) |

## Attractions, events and check-in

Detail: [features/attractions-events-and-checkin.md](features/attractions-events-and-checkin.md) (*A*). Verification
for all rows: SV.

| Module | What users can do | Main routes | Roles (UI) | Status | Key limitations | Detail |
|---|---|---|---|---|---|---|
| Attractions hub | Entry to attractions features | `attractions/attractions` (`attractions/check-in` redirects) | All | Implemented | — | [A](features/attractions-events-and-checkin.md#attractions-hub) |
| Manage Attractions | List, KPIs, 8-filter sheet, create/edit, duplicate, delete, bulk, import/export, CSV | `attractions/manage-attractions`, `create-attraction`, `edit-attraction`, `purchase-page` | All | Implemented | KL-ATTR-004/005 | [A](features/attractions-events-and-checkin.md#manage-attractions) |
| Attraction purchases | List, KPIs, filters, bulk status/delete, details, QR, edit, deleted view (read-only) | `attractions/purchases`, `purchase-details`, `edit-purchase` | All | Implemented (no restore) | KL-ATTR-001–003 | [A](features/attractions-events-and-checkin.md#attraction-purchases-manage-purchases) |
| Create Purchase / bulk checkout | Walk-in or multi-item sale; slot caps; day-offs; gift card; card, in-store or pay later | `attractions/create-purchase` | All | Implemented | KL-ATTR-006/007 | [A](features/attractions-events-and-checkin.md#create-purchase-and-bulk-order-checkout) |
| Bulk Orders | List; check in all or per line; record payment; cancel; QR | `attractions/orders`, `order-details` | All | Implemented | KL-CHECKIN-002 | [A](features/attractions-events-and-checkin.md#bulk-orders-ticket-orders) |
| Events hub | Entry; registration items for admins and managers | `events/events` | All | Implemented | — | [A](features/attractions-events-and-checkin.md#events-hub) |
| Manage Events | List, 8-filter sheet, toggle, edit, delete, CSV | `events/manage-events`, `create-event`, `edit-event` | All | Implemented | — | [A](features/attractions-events-and-checkin.md#manage-events) |
| Event purchases | 9 filters, bulk status/delete, details (QR = reference), edit | `events/purchases`, `purchase-details`, `edit-purchase` | All | Implemented (no restore) | KL-EVENT-003/005–007 | [A](features/attractions-events-and-checkin.md#event-purchases) |
| Event onsite purchase | Dates and slots with remaining counts, gift card, payment | `events/create-purchase` | All | Implemented | KL-EVENT-001/002 | [A](features/attractions-events-and-checkin.md#event-onsite-purchase) |
| Registration Forms | Events that own per-location forms; registrations; hide/restore; export; QR | `events/registration-*` (5 routes) | Company admin, location manager | Implemented | KL-EVENT-008 | [A](features/attractions-events-and-checkin.md#registration-forms) |
| Check-In desk | Scan or upload QR, guest lookup, admit ticket/order/event/membership/waiver | `/check-in` (+3 redirects) | All | Implemented | KL-CHECKIN-001–005 | [A](features/attractions-events-and-checkin.md#unified-check-in--waivers-desk) |

## Packages and pricing

Detail: [features/packages-and-pricing.md](features/packages-and-pricing.md) (*P*). Every module is reachable by all
roles in the UI. Writes need a staff token on the Backend, but role and tenant checks vary by controller. For
example, global notes have neither (KL-PKG-021).

| Module | What users can do | Main routes | Status | Verif. | Key limitations | Detail |
|---|---|---|---|---|---|---|
| Packages and Pricing hubs | Route to sub-modules; create shortcuts | `packages/packages-hub`, `pricing/pricing-hub` | Implemented | SV | — | [P](features/packages-and-pricing.md#packages-hub--pricing-hub) |
| Manage Packages | List, filter, toggle, hide online, duplicate, delete, JSON import/export | `packages/packages` | Implemented | SV | KL-PKG-007–010 | [P](features/packages-and-pricing.md#manage-packages-regular-packages-list) |
| Create/Edit Package | Full definition, schedules, relations, media | `packages/create-packages`, `edit-packages` | Implemented (with suspected save defects) | SV; DVR | KL-PKG-003–006 | [P](features/packages-and-pricing.md#create--edit-package) |
| Custom Packages | Manage non-regular package types | `packages/custom-packages` (`create-custom-packages` is a stub) | Implemented | SV | KL-PKG-011 | [P](features/packages-and-pricing.md#custom-packages-non-regular-package-types) |
| Add-ons | Create, edit, delete; CSV export | `packages/add-ons` | Partially implemented | SV | KL-PKG-001/012/013 | [P](features/packages-and-pricing.md#add-ons) |
| Space | Room CRUD; multi-create; area-group turnaround | `packages/space` | Implemented | SV | KL-PKG-014/015 | [P](features/packages-and-pricing.md#space-rooms) |
| Global Notes | Global or per-package customer notes | `packages/global-notes` | Implemented | SV | KL-PKG-020/021 | [P](features/packages-and-pricing.md#global-notes) |
| Gift Cards | Create; counter sale; delete | `packages/gift-cards` | Partially implemented | SV | KL-PKG-016/017/022 | [P](features/packages-and-pricing.md#gift-cards) |
| Promos | Single-code CRUD; bulk codes | `packages/promos` | Partially implemented | SV | KL-PKG-002/018/019/023 | [P](features/packages-and-pricing.md#promos-promo-codes) |
| Special Pricing | Rule list, toggle, delete, export, create/edit | `pricing/pricing`, `create-special-pricing` | Partially implemented | SV | KL-PRICE-001/002/004/010 | [P](features/packages-and-pricing.md#special-pricing) |
| Fee Supports | Fee list, toggle, delete, export, create/edit | `pricing/fee-support`, `create-fee-support` | Partially implemented | SV | KL-PRICE-003/004/011 | [P](features/packages-and-pricing.md#fee-supports) |
| Shared pricing services | Fee and special quotes, payment gate, package price | (library) | Implemented | TB | KL-PRICE-007 | [P](features/packages-and-pricing.md#shared-pricing-calculation-services) |

## Customers, waivers and memberships

Detail: [features/customers-waivers-and-memberships.md](features/customers-waivers-and-memberships.md) (*C*).

| Module | What users can do | Main routes | Roles (UI) | Status | Verif. | Key limitations | Detail |
|---|---|---|---|---|---|---|---|
| Customers hub | Links to customer modules | `customers/customers-hub` | All | Implemented | SV | — | [C](features/customers-waivers-and-memberships.md#customers-hub) |
| Customers | Load all contacts; add, edit, tag, delete; CSV and campaign export | `customers/customers`, `edit-customer` | All (no UI gate) | Implemented | SV | KL-CUST-004–006/009 | [C](features/customers-waivers-and-memberships.md#customers-crm-contacts-list) |
| Customer Analytics | KPIs, segments, rankings, export | `customers/analytics` | All (server scope) | Implemented | SV, TB | KL-CUST-001–003 | [C](features/customers-waivers-and-memberships.md#customer-analytics) |
| Customer Concerns | Lead and status filters; set New, Contacted or Resolved | `customers/customer-concerns` | All | Implemented | SV, TB | KL-CUST-007 | [C](features/customers-waivers-and-memberships.md#customer-concerns-checkout-concerns--leads) |
| Visitor Tracking | Sessions, stats, server export, timeline | `customers/visitor-tracking` | All | Implemented | SV | — | [C](features/customers-waivers-and-memberships.md#visitor-tracking) |
| Visit follow-up emails | Thank-you and review emails; send now or cancel; ratings | Cards in other modules | All | Implemented | TB | — | [C](features/customers-waivers-and-memberships.md#visit-follow-up-emails-cross-cutting) |
| Waivers hub | Shortcuts and a Manage row | `waivers/waivers-hub` | All (Manage row gated) | Implemented | SV | — | [C](features/customers-waivers-and-memberships.md#waivers-hub) |
| Waiver Records | Filter, check in, print, delete, CSV, assign | `waivers/waivers`, `create-waiver` | Mixed UI gates | Implemented | SV | KL-WAIVER-001–003/008 | [C](features/customers-waivers-and-memberships.md#waiver-records) |
| Waiver Kiosk | In-app signing (session or walk-in), returning-guest lookup, ads | `waivers/kiosk` | Any staff launches | Implemented | SV; DVR | KL-WAIVER-006/007/010 | [C](features/customers-waivers-and-memberships.md#waiver-kiosk-in-app) |
| Waiver Templates | CRUD, restore, force delete, status, kiosk preview | `waivers/templates`, `create-template` | Admin; manager if setting allows | Implemented | SV | KL-WAIVER-012 | [C](features/customers-waivers-and-memberships.md#waiver-templates--template-builder) |
| Template Ads | Post-waiver ads | `waivers/template-ads` | Admin, manager | Implemented | SV (screen inferred) | — | [C](features/customers-waivers-and-memberships.md#template-ads-post-waiver-ads) |
| Group Invites | Create and resend chaperone invites; copy links | `waivers/group-invites`, `create-group-invite` | Admin, manager | Implemented (staff side) | TB | KL-WAIVER-009 | [C](features/customers-waivers-and-memberships.md#group-invites-bulk--chaperone-invites) |
| Returning Customers | Edit waiver profiles and dependents | `waivers/returning-customers`, `returning-customer` | Admin, manager | Implemented | TB | — | [C](features/customers-waivers-and-memberships.md#returning-customers-waiver-profiles) |
| Waiver Reports | 8 report types | `waivers/reports` | All | Implemented | SV | KL-WAIVER-005/011 | [C](features/customers-waivers-and-memberships.md#waiver-reports) |
| Deletion Log | Audit list of deleted waivers | `waivers/deletion-log` | Shown to all; server allows admin (and manager if setting on) | Implemented | SV | KL-WAIVER-004 | [C](features/customers-waivers-and-memberships.md#waiver-deletion-log) |
| Waiver Settings | Company waiver policy | `waivers/waiver-settings` | Edit: company admin | Implemented | SV | — | [C](features/customers-waivers-and-memberships.md#waiver-settings) |
| Memberships | List, bulk actions, add member with card charge, details, check-in | `memberships/memberships`, `membership-details`, `membership-check-in` | All (no UI gates) | Implemented | SV, TB | KL-MEMBER-001/002/004–007 | [C](features/customers-waivers-and-memberships.md#memberships-members-list) |
| Membership Plans | Plan CRUD, toggle, benefits | `memberships/membership-plan` | Admin, manager | Implemented | SV | — | [C](features/customers-waivers-and-memberships.md#membership-plans) |
| Membership Reports | KPIs for a date range | `memberships/membership-reports` | All | Implemented | SV | KL-MEMBER-003 | [C](features/customers-waivers-and-memberships.md#membership-reports) |

## Photos, communications and notifications

Detail: [features/photos-communications-and-notifications.md](features/photos-communications-and-notifications.md) (*N*).

| Module | What users can do | Main routes | Roles (UI) | Status | Verif. | Key limitations | Detail |
|---|---|---|---|---|---|---|---|
| Photos hub | Entry; admin cards for managers and admins | `photos/photos` | All | Implemented | SV | KL-PHOTO-011 | [N](features/photos-communications-and-notifications.md#photos-hub) |
| Take Photos | Consent; capture or upload; edit; send by email, SMS or QR | `photos/capture` | All | Implemented | SV; DVR | KL-PHOTO-007/009/010 | [N](features/photos-communications-and-notifications.md#take-photos-capture--delivery) |
| Photo Library | Browse by operating day; save to gallery; resend; slideshow toggle; delete | `photos/library` | All (delete: manager/admin) | Implemented | SV | KL-PHOTO-003/005 | [N](features/photos-communications-and-notifications.md#photo-library) |
| Delivery Log | Email and SMS rows; retry, cancel, confirm received, carrier status | `photos/delivery-log` | All | Partially implemented | SV | KL-PHOTO-001/013 | [N](features/photos-communications-and-notifications.md#delivery-log) |
| Slideshow Queue | Show, hide, remove, reorder, pause; past queues | `photos/slideshow-queue` | All | Partially implemented | SV | KL-PHOTO-004 | [N](features/photos-communications-and-notifications.md#slideshow-queue) |
| Photo Overlays | Frames with landscape and portrait versions; schedule; room or event targeting | `photos/overlays` | Admins, location manager | Implemented | SV | — | [N](features/photos-communications-and-notifications.md#photo-overlays-frames) |
| Photo Reports | 8 server reports, rendered generically | `photos/reports` | Admins, location manager | Implemented | SV | KL-PHOTO-014 | [N](features/photos-communications-and-notifications.md#photo-reports) |
| Photo Settings | Passcodes, date layer, retention, templates, links, test message | `photos/settings` | Company admin, location manager | Implemented | SV | — | [N](features/photos-communications-and-notifications.md#photo-settings) |
| Escape Rooms | Day board, group photo, Complete & Send, players, follow-ups | `photos/escape-rooms` | All | Implemented | SV | KL-PHOTO-012 | [N](features/photos-communications-and-notifications.md#escape-rooms-staff-game-board) |
| Escape-room kiosk | Guest room, time and waiver check-in on a staff device | `photos/escape-room-kiosk` | Staff launches; guests use it | Implemented | SV; DVR | KL-PHOTO-002 | [N](features/photos-communications-and-notifications.md#escape-room-guest-check-in-kiosk) |
| Email Campaigns | Create, send or schedule; registrant audience; cancel, resend, delete; CSV | `email-campaign/campaigns`, `create-campaign`, `campaign-details` | All (registrants: manager/admin) | Partially implemented | TB | KL-COMMS-001/002/005 | [N](features/photos-communications-and-notifications.md#email-campaigns) |
| Email Templates | CRUD, duplicate, status, location targeting, preview, event photos | `email-campaign/email-templates`, `template-details`, `create-template` | All | Implemented | TB | — | [N](features/photos-communications-and-notifications.md#email-templates) |
| Email Notifications | Automated emails: defaults, logs, resend, test, visit follow-up fields | `email-campaign/email-notification`, `notification-details`, `create-notification` | All | Implemented | TB | — | [N](features/photos-communications-and-notifications.md#email-notifications-automated-emails) |
| SMS Notifications | Edit, toggle, reset, test and seed company SMS templates | `email-campaign/sms-notifications` | All | Partially implemented | TB | KL-COMMS-003/004 | [N](features/photos-communications-and-notifications.md#sms-notifications) |
| Notifications inbox | Filters, badges, mark read, clear, undo delete, tap-through routing | `notification/notification`, `notification-details` | All | Implemented | TB | KL-NOTIF-001–005 | [N](features/photos-communications-and-notifications.md#notifications-inbox) |
| Custom Fields | Checkout checkboxes with targeting | `custom-fields/custom-fields` | Read: all; write: admin/manager | Implemented | SV | KL-COMMS-006/007 | [N](features/photos-communications-and-notifications.md#custom-fields) |

The Email Campaign hub (`email-campaign/email-campaign-hub`) is described in the same document.

## Cross-cutting capabilities

These are documented under [ARCHITECTURE.md](ARCHITECTURE.md) rather than as modules:

- authentication and session
- saved-account switching mechanics
- the API client and global prompts (change reason, blocked period)
- location scoping
- caching
- push registration and tap routing
- error reporting
- native integrations

## Maintaining this catalog

When a module's routes, roles, status or key limitations change, update its row and its detail section in the same
change. See the maintenance approach in [README.md](README.md#proposed-maintenance-approach-lightweight-for-phase-3-review).
