# Attractions, Events, Bulk Orders, Registration Forms and Check-In

> **Purpose:** Describe what the ZapZone Mobile attractions, ticket-purchase, bulk-order, events, registration-form and check-in-desk modules actually do, with evidence.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e` (cited sections only); Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Static source inspection only — nothing was run. Mobile services, hooks, the unified check-in desk, list screens and the purchase/order flows were read in targeted sections; create/edit attraction and event forms, `edit-purchase` screens, `purchase-page.tsx` and the registration editors were inspected only for their service calls (field-level parity "Not assessed"). Backend: routes, `EnsureStaff`, `ScopesByAuthUser`, and the cited controller methods only. Web Admin: router (`App.tsx`), `AdminSidebar`, `bookings/CheckIn.tsx` (event/ticket handlers), and targeted greps of purchase pages. Payment processing internals (Accept.js, `/api/payments/charge`) are documented elsewhere and only referenced here.
> **Related:** [Feature catalog](../FEATURE_CATALOG.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Architecture](../ARCHITECTURE.md) · [Business rules for this area](../business-rules/attractions-events-and-checkin.md)

---

## Contents

1. [Cross-cutting facts](#cross-cutting-facts)
2. Attractions: [Attractions hub](#attractions-hub) · [Manage Attractions](#manage-attractions) · [Attraction purchases](#attraction-purchases-manage-purchases) · [Create Purchase / Bulk Order checkout](#create-purchase-and-bulk-order-checkout) · [Bulk Orders](#bulk-orders-ticket-orders)
3. Events: [Events hub](#events-hub) · [Manage Events](#manage-events) · [Event purchases](#event-purchases) · [Event onsite purchase](#event-onsite-purchase)
4. [Registration Forms](#registration-forms)
5. [Unified Check-In / Waivers desk](#unified-check-in--waivers-desk)
6. [Tests in scope](#tests-in-scope)

---

## Cross-cutting facts

| Topic | What the code does | Evidence |
|---|---|---|
| Navigation gating | Attractions and Events menu entries are shown to **every** role (they are in the base list, not role-gated). Registration Forms is shown only to `company_admin` and `location_manager`. The Check-In / Waivers desk is a Quick Action for every role. | `src/components/navigation/navMenuItems.ts` (`BASE_NAV_MENU_ITEMS`); `src/app/events/events.tsx` (`canManageRegistrationForms`); `src/components/navigation/quickActionItems.ts` (`QUICK_ACTION_ITEMS`) |
| On-screen role checks | Screens in scope do **not** self-guard by role. `isCompanyAdmin` only toggles the location picker on create forms. Deep links reach any screen; the backend decides. | `src/app/attractions/create-attraction.tsx` (`isCompanyAdmin`); `src/app/events/registration-forms.tsx` |
| Backend "staff" gate | `staff` middleware admits `company_admin`, `admin`, `location_manager`, `attendant` with a company; `staff:a\|b` narrows further. | `zapzone-backend@ae877e2:app/Http/Middleware/EnsureStaff.php` (`EnsureStaff::handle`, `ROLES`) |
| Backend location scoping | `location_manager`/`attendant` are restricted to their `location_id`; everyone to their `company_id`. The `user_id` query param is only honoured when it equals the bearer token's user. | `zapzone-backend@ae877e2:app/Http/Traits/ScopesByAuthUser.php` (`resolveAuthUser`, `applyAuthScope`, `authorizeRecordScope`, `denyForeignRecord`) |
| Active global location | List screens read `useActiveLocation()`; `"all"` sends no `location_id`, otherwise `location_id` is sent. | e.g. `src/app/attractions/manage-attractions.tsx`, `src/app/attractions/purchases.tsx`, `src/app/attractions/orders.tsx`, `src/app/events/manage-events.tsx`, `src/app/check-in.tsx` (`deskLocationId`) |
| List caching | Attractions, events, attraction purchases and event purchases use a module-level session cache keyed by user + location with a 5-minute TTL and a "stale" flag set by mutations. | `src/lib/hooks/useAttractions.ts` (`CACHE_TTL_MS`, `markAttractionsStale`); same constant in `useEvents.ts`, `useAttractionPurchases.ts`, `useEventPurchases.ts` |
| Filtering model | Lists download the full set, then search/filter/sort/paginate client-side (5/10/25/50 per page). | screens above |

---

## Attractions hub

- **Purpose:** Landing hub for the Attractions module.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/attractions/attractions.tsx` | Picks Manage Attractions, Manage Purchases, Create Purchase or Bulk Orders; quick links to New Attraction, New Order (same create-purchase screen), Fee Supports, Special Pricing |
| `src/app/attractions/check-in.tsx` | Legacy route; `<Redirect href="/check-in" />` |

- **Roles:** All roles via menu. Web: attendant, manager and admin sidebars all list the Attractions section (`zappoint@5de9d9e:src/components/admin/AdminSidebar.tsx` (`getNavigation`)).
- **Web Admin counterpart:** sidebar section — parity **Mobile adaptation** (hub screen instead of sidebar group). Legacy redirect matches web `/attractions/check-in → /check-in` (`zappoint@5de9d9e:src/App.tsx`) — **Verified**.
- **Source references:** `ModuleHubScreen` (`src/components/ui/ModuleHub`).

## Manage Attractions

- **Purpose:** Catalog management for attractions (list, KPIs, filters, CRUD, import/export).
- **Implementation status:** Implemented · **Verification:** Source-verified (create/edit form field parity Not assessed)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/attractions/manage-attractions.tsx` | Table (default) or card view; search; Filters sheet; KPIs; select rows for bulk activate/deactivate/delete; per-row status picker, edit, duplicate, delete; Actions sheet; Import/Export sheets; Export CSV |
| `src/app/attractions/create-attraction.tsx` | Create attraction (location picker for company admins) |
| `src/app/attractions/edit-attraction.tsx` | Edit attraction (opened with `?id=`) |
| `src/app/attractions/purchase-page.tsx` | In-app "View purchase page" (internal equivalent of the public purchase URL) — not inspected in depth |

- **Roles:** All roles (no client gate). Backend: index under `auth:sanctum`; store/update/destroy/activate/deactivate/bulk-delete/bulk-import/reorder behind `staff` (`zapzone-backend@ae877e2:routes/api.php`, attractions block ~L443–455). `GET /api/attractions/{id}` and slot availability are public routes.
- **Location scoping:** `useAttractions({ locationId })` sends `location_id` for a specific active location. Server scopes managers/attendants to their own location (`AttractionController::index` → `applyAuthScope`). Writes check location via `scopedLocation` / `denyForeignRecord`.
- **Main workflows & operations**
  - KPIs (client): total, active, inactive, average price, summed capacity.
  - Filters sheet (`AttractionFiltersSheet`): status, category, pricing type, duration (unlimited/timed), capacity visibility, price range, capacity range, created-date range (created date reuses `DateRangeSheet`; filter sheet is closed first to avoid stacked native Modals).
  - Sort: `compareAttractionsByDisplayOrder` (display order, then name) — client-side; server default is name asc.
  - Per-record actions (`AttractionActionsSheet`): detail view, **Copy link** (public purchase URL), **View purchase page** (in-app route), Edit, Duplicate, Delete.
  - Duplicate: client-side `GET /api/attractions/{id}` then `POST /api/attractions` named "<name> (Copy)", `is_active: false`, same location (see BR-ATTR-003).
  - Bulk: activate/deactivate fan out per id; delete uses one `POST /api/attractions/bulk-delete`.
  - Import (JSON via `AttractionsImportSheet` → `POST /api/attractions/bulk-import`, location injected from the active location); Export (JSON sheet) and Export CSV (filtered rows, written to cache dir and shared via `expo-sharing`).
- **Data sources** (`src/services/attractionsService.ts`)

| Function | HTTP |
|---|---|
| `fetchAttractions` | `GET /api/attractions?per_page=100&page=N&user_id&location_id?&is_active?` (all pages, max 20) |
| `fetchAttractionDetail` | `GET /api/attractions/{id}` |
| `createAttraction` / `updateAttraction` / `deleteAttraction` | `POST /api/attractions` / `PUT /api/attractions/{id}` / `DELETE /api/attractions/{id}` |
| `setAttractionActive` | `PATCH /api/attractions/{id}/activate\|deactivate` |
| `bulkDeleteAttractions` | `POST /api/attractions/bulk-delete` |
| `bulkImportAttractions` | `POST /api/attractions/bulk-import` |
| `fetchAttractionSlotAvailability` | `GET /api/attractions/{id}/slot-availability/{Y-m-d}` |

- **Validation & business rules:** required name/description/category/price≥0/capacity≥1/location, no same-clock schedule (BR-ATTR-001); per-slot cap blank = unlimited (BR-ATTR-002); duplicate (BR-ATTR-003); hard delete (BR-ATTR-004); bulk fan-out (BR-ATTR-005).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/attractions/ManageAttractions.tsx`, `CreateAttractions.tsx`, `EditAttraction.tsx`, `AttractionDetails.tsx` — parity **Partial / Not assessed** at field level (mobile comments claim parity; only routes and roles were verified).
- **Shared components & utilities:** `AttractionsTable`, `AttractionCard`, `AttractionsBulkBar`, `AttractionFiltersSheet`, `AttractionActionsSheet`, `AttractionsImportSheet`, `AttractionsExportSheet`, `ViewToggle`; `src/lib/attractions/purchaseLink.ts` (`buildPurchaseLink`, `openPurchasePage`), `src/lib/attractions/attractionsCsv.ts`, `src/lib/attractions/attractionDisplay.tsx`.
- **Loading / empty / error / refresh:** skeleton while loading; stale cache shown instantly then refreshed; pull-to-refresh calls `refetch`; refetch on focus when stale; errors surface via `Alert.alert` for mutations.
- **Platform-specific behaviour:** No `Platform.OS` branches found in these screens. CSV export uses `expo-file-system/legacy` + `expo-sharing` (UTI set for iOS) — Device verification required.
- **Tests:** none specific to this screen; `src/lib/attractions/purchaseEditPayload.test.ts` covers purchase edit payload text fields (not this screen).
- **Known limitations:** KL-ATTR-004 (link host fallback), KL-ATTR-005 (duplicate with no location), KL-ATTR-008 (page-walk caps).
- **Source references:** `src/app/attractions/manage-attractions.tsx` (`ManageAttractions`, `runBulkStatus`, `confirmBulkDelete`, `handleRowDuplicate`, `exportCsv`); `src/services/attractionsService.ts` (`duplicateAttraction`, `compareAttractionsByDisplayOrder`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/AttractionController.php` (`index`, `store`, `destroy`, `bulkDelete`, `slotAvailability`).

## Attraction purchases (Manage Purchases)

- **Purpose:** Find, review, change status of, delete and edit attraction ticket purchases.
- **Implementation status:** Implemented (deleted view read-only) · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/attractions/purchases.tsx` | KPIs, search, Filters sheet, table/card toggle, bulk status/delete, per-row status/delete/edit, "Deleted Purchases" view, Export CSV, shortcuts to Bulk Orders and Check-In |
| `src/app/attractions/purchase-details.tsx` | Detail of one purchase: QR (`PurchaseQRSheet`), connected waivers, bulk-order banner linking to its order, add-to-calendar, edit, delete |
| `src/app/attractions/edit-purchase.tsx` | Edit a purchase; a bulk-order line can change only schedule + notes (`UpdateOrderLineInput`) — screen internals not fully inspected |

- **Roles:** All roles via menu. Backend: `attraction-purchases` resource (except store/destroy), `trashed`, `verify`, `check-in` are behind `staff`; `POST` and `DELETE` are public routes with their own checks (`routes/api.php` ~L190–194, ~L457–471).
- **Location scoping:** active location → `location_id`; server scoping via `ScopesByAuthUser`/`denyStaffElsewhere`.
- **Main workflows & operations**
  - KPIs (client): transactions (`countTransactions` — all lines of one bulk order count once), lines, confirmed, revenue (sum of `amountPaid`), average, distinct customer emails.
  - Filters (`PurchaseFiltersSheet`): status, payment method, category, attraction, created range, scheduled range, amount range; search over customer/email/attraction/phone.
  - Bulk status (confirmed / checked-in / cancelled / refunded) = per-id `PUT /api/attraction-purchases/{id}` `{status}` (KL-ATTR-001, KL-ATTR-002). Bulk delete = per-id soft delete.
  - Deleted view: `GET /api/attraction-purchases/trashed` (100 rows, read-only; no restore — KL-ATTR-003).
  - QR: `JSON {"type":"attraction_purchase","id":N}`; re-send receipt via `POST /api/attraction-purchases/{id}/qrcode`.
- **Data sources** (`src/services/attractionPurchasesService.ts`): `fetchAttractionPurchases` (`GET /api/attraction-purchases?per_page=500&page=N&user_id&location_id?&scheduled_from?&scheduled_to?`, max 40 pages, de-duplicated by id); `searchAttractionPurchases` (`?search=&per_page=25`); `fetchAttractionPurchaseDetail` / `fetchAttractionPurchaseForEdit` (`GET /{id}`); `updateAttractionPurchase` / `updateAttractionPurchaseStatus` (`PUT /{id}`); `deleteAttractionPurchase` (`DELETE /{id}` + checkout token body); `forceDeleteAttractionPurchase` (`DELETE /{id}/force-delete`); `sendAttractionPurchaseReceipt` (`POST /{id}/qrcode`); `verifyAttractionPurchase` (`GET /{id}/verify`); `checkInAttractionPurchase` (`PATCH /{id}/check-in`); `fetchTrashedAttractionPurchases`.
- **Validation & business rules:** status "completed" displayed as "confirmed" (BR-PURCH-011); order-line edit lock and delete refusal (BR-PURCH-007); soft delete (BR-PURCH-008); transaction counting (BR-PURCH-010); edit money clamps (BR-PURCH-012).
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/attractions/AttractionPurchases.tsx`, `PurchaseDetails.tsx`, `EditPurchase.tsx`. Bulk status via `updatePurchase` per id — **Verified** (`handleBulkStatusChange`). Web has bulk restore (`handleBulkRestore`) — **Gap**. Web list payment recording (`selectedPurchaseForPayment`) — mobile equivalent **Not assessed**.
- **Shared components & utilities:** `PurchasesTable`, `PurchasesBulkBar`, `PurchaseFiltersSheet`, `PurchaseQRSheet`, `BulkOrderNotice` + `src/lib/bulkOrder.ts` (`bulkOrderNotice`), `src/lib/purchaseMetrics.ts`, `src/lib/orderAmounts.ts`, `src/lib/attractions/purchaseDisplay.tsx`, `src/lib/attractions/purchaseEditPayload.ts`.
- **Loading / empty / error / refresh:** skeleton (`AttractionPurchasesSkeleton`), pull-to-refresh, refetch on focus when stale; bulk failures show one alert.
- **Platform-specific behaviour:** none found in-screen. Calendar insert and QR save are device features — Device verification required.
- **Tests:** `src/lib/purchaseMetrics.test.ts` (transaction counting), `src/lib/bulkOrder.test.ts` (order banner/route), `src/lib/orderAmounts.test.ts` (amount clamps/edit balance), `src/lib/attractions/purchaseEditPayload.test.ts` (nullable text fields), `src/lib/payments/payableRoute.test.ts` (purchase/order routes).
- **Known limitations:** KL-ATTR-001, KL-ATTR-002, KL-ATTR-003.
- **Source references:** `src/app/attractions/purchases.tsx` (`kpis`, `filtered`, `runBulkStatus`, `confirmBulkDelete`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/AttractionPurchaseController.php` (`update` order-line guard ~L1122, `destroy`, `publicForceDelete`).

## Create Purchase and Bulk Order checkout

- **Purpose:** Staff on-site sale of attraction tickets; in "order mode" a multi-item cart of attractions and events checked out as one ticket order.
- **Implementation status:** Implemented · **Verification:** Source-verified (card charge path: see payments doc; Device verification required)
- **Routes / screens:** `src/app/attractions/create-purchase.tsx` — single purchase, or bulk mode (`orderMode = bulkMode || orderLines.length > 0`) with Attractions/Events item tabs.
- **Roles:** All roles via hub/quick links. Backend `POST /api/attraction-purchases` and `POST /api/ticket-orders` are public routes; staff behaviour is detected from the bearer token (`AddOnRuleService::isStaff`).
- **Location scoping:** the transaction's location is the first order line's location, else the selected attraction/event's (`orderLocationId`); it picks the Authorize.Net account and scopes the event catalog.
- **Main workflows & operations**
  - Customer: email search-as-you-type (`searchCustomers`), name required; email required only if "Send email receipt" is on (single purchase).
  - Visit date: `DatePickerSheet` fed by `computeDayOffAvailability` from `GET /api/day-offs/location/{id}` (full day-offs disabled, partial closures trim slots) — BR-PURCH-002.
  - Slot capacity: `GET /api/attractions/{id}/slot-availability/{date}` → `buildSlotRemainingMap`; quantity ceiling/clamp; sold-out slots blocked; events via `available-time-slots` — BR-PURCH-001.
  - Pricing (single): client computes fees + special pricing, re-resolved at submit (`resolveFreshPricing`); bulk: server quote `POST /api/ticket-orders/quote` (debounced).
  - Gift card: `GiftCardCheckoutField`; code sent as `gift_card_code`, redeemed server-side (BR-PURCH-005; no web twin — KL-ATTR-006).
  - Payment methods: Card (Authorize.Net, default), In-Store, Pay Later. Purchase/order is created first, then the card is charged; a proven failure rolls back (`forceDeleteAttractionPurchase` / `rollbackTicketOrder`), an unknown outcome keeps it (BR-PURCH-003). In-store order payments are recorded with `recordPayment`.
  - Idempotency: `checkout_key` from `checkoutKeyFor`, 3-second resubmit cooldown and submit lock (BR-PURCH-004).
  - Order receipt QR stored best-effort (`storeTicketOrderQrCode`).
- **Data sources:** `createAttractionPurchase` (`POST /api/attraction-purchases`), `quoteTicketOrder`, `checkoutTicketOrder` (`POST /api/ticket-orders`), `storeTicketOrderQrCode` (`POST /api/ticket-orders/{id}/qrcode`), `rollbackTicketOrder` (`DELETE /api/ticket-orders/{id}/rollback` with `qr_token`), `fetchDayOffsByLocation`, `fetchAttractionSlotAvailability`, `fetchEventAvailableTimeSlots`, `searchCustomers`, `recordPayment`.
- **Validation & business rules:** BR-PURCH-001…006, BR-PURCH-009.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/attractions/CreatePurchase.tsx` — same bulk-mode/order-lines model, `ticketOrderService.quote/checkout/storeQrCode`, slot availability — **Verified** at structure level. Gift card field absent on web staff pages (grep: no "gift" in `CreatePurchase.tsx`, `OnsitePurchaseEvent.tsx`, `PurchaseAttraction.tsx`) — **Mobile adaptation / Gap**.
- **Shared components & utilities:** `src/lib/ticketLimits.ts`, `src/lib/attractions/dayOffAvailability.ts`, `src/lib/events/eventSaleDates.ts`, `src/lib/giftCards/checkoutGiftCard.ts`, `src/lib/orderAmounts.ts`, `src/lib/payments/*` (checkout keys/tokens), `useQrDataUri`.
- **Loading / empty / error / refresh:** blocker list explains why Submit is disabled (`orderBlockers`/`purchaseBlockers`); toasts and alerts for failures, including "Order created, payment not recorded".
- **Platform-specific behaviour:** none found in-screen; card entry and QR rendering need Device verification.
- **Tests:** `src/lib/ticketLimits.test.ts`, `src/lib/attractions/dayOffAvailability.test.ts`, `src/lib/events/eventSaleDates.test.ts`, `src/lib/giftCards/checkoutGiftCard.test.ts`, `src/lib/payments/checkoutKey.test.ts`, `src/lib/payments/checkoutTokens.test.ts` (contents not reviewed in this pass).
- **Known limitations:** KL-ATTR-006, KL-ATTR-007.
- **Source references:** `src/app/attractions/create-purchase.tsx` (`submitOrder`, `handleSubmit`, `orderBlockers`, `purchaseBlockers`, `cardPreflightError`); `src/services/ticketOrdersService.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/AttractionPurchaseController.php` (`store`).

## Bulk Orders (ticket orders)

- **Purpose:** List, inspect, check in, collect payment for and cancel multi-item ticket orders.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/attractions/orders.tsx` | KPIs (orders, ticket lines, collected, outstanding, tickets), search, Filters (status, payment method), per-order "Check in all", Export CSV, New Order |
| `src/app/attractions/order-details.tsx` | Lines with per-line check-in and waivers, check in all, record venue payment of the remaining balance, cancel order, QR (`OrderQRSheet`, `{"type":"ticket_order","id":N}`), edit a line (routes to attraction/event edit-purchase with `from=order`) |

- **Roles:** All roles via hub. Backend: `GET /api/ticket-orders[/{id}]` under `auth:sanctum` (listing limited by `limitListingToRequester` + `applyAuthScope`); `check-in` and `cancel` behind `staff` (`routes/api.php` ~L318–321).
- **Data sources:** `listAllTicketOrders` (`GET /api/ticket-orders?page&per_page=200&location_id?`, max 50 pages), `fetchTicketOrder`, `checkInTicketOrder` (`POST /{id}/check-in` with optional `line_ids`), `cancelTicketOrder` (`POST /{id}/cancel`), `fetchPaymentsForPayable`, `recordPayment`.
- **Validation & business rules:** BR-CHECKIN-004 (line eligibility), BR-PURCH-007.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/orders/TicketOrders.tsx`, `TicketOrderDetails.tsx` — parity **Not assessed** beyond routes (`/orders`, `/orders/:id`).
- **Loading / empty / error / refresh:** reload on focus; latest-request guard; pull-to-refresh.
- **Tests:** `src/lib/bulkOrder.test.ts`, `src/lib/payments/payableRoute.test.ts`.
- **Source references:** `src/app/attractions/order-details.tsx` (`checkIn`, `recordVenuePayment`, `cancelOrder`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/TicketOrderController.php` (`index`, `checkIn`, `cancel`).

---

## Events hub

- **Purpose:** Landing hub for events.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/events/events.tsx` — Manage Events, Event Purchases, Onsite Purchase, Registration Forms (admin/manager only); quick links New Event, New Purchase, New Registration (admin/manager only).
- **Roles:** All roles; Registration items hidden unless `company_admin`/`location_manager`. Web: attendant sidebar lists Events without Registration Forms; manager sidebar includes it (`AdminSidebar.tsx` `getNavigation`) — **Verified**.

## Manage Events

- **Purpose:** Event catalog management.
- **Implementation status:** Implemented · **Verification:** Source-verified (create/edit form parity Not assessed)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/events/manage-events.tsx` | Table/card list, search, Filters sheet, per-row status toggle, edit, delete, Registration Form shortcut (admin/manager), Export CSV |
| `src/app/events/create-event.tsx` | Create event (location picker for company admins) |
| `src/app/events/edit-event.tsx` | Edit event (`?id=`) |

- **Roles:** All roles client-side. Backend: `GET /api/events`, `GET /api/events/{id}`, `available-dates`, `available-time-slots` are **public** routes; create/update/delete/toggle behind `staff` (`routes/api.php` ~L223–228, ~L749–752).
- **Main workflows & operations:** Filters (`EventFiltersSheet`): status, date type, schedule (upcoming/ongoing/past), start-date range, created range, price range, add-ons with/without, time of day. Toggle uses `PATCH /api/events/{id}/toggle-status` (bare model response). Delete confirms "can't be undone" but `Event` uses `SoftDeletes` (no restore route seen).
- **Data sources** (`src/services/eventsService.ts`): `fetchEvents` (`GET /api/events?per_page=100&user_id&location_id?` — server ignores pagination and returns all, `EventController::index`), `fetchEventDetail`, `createEvent`, `updateEvent`, `toggleEventStatus`, `deleteEvent`, `fetchEventAvailableDates`, `fetchEventAvailableTimeSlots`.
- **Validation & business rules:** BR-EVENT-001…005.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/events/Events.tsx`, `CreateEvent.tsx`, `EditEvent.tsx` — **Not assessed** at field level.
- **Shared components & utilities:** `EventsTable`, `EventFiltersSheet`, `src/components/events/eventFormKit.tsx`, `src/lib/events/eventEditForm.ts`.
- **Tests:** `src/lib/events/eventEditForm.test.ts` (edit-form seeding/payload helpers; contents not reviewed), `src/lib/events/eventSaleDates.test.ts`.
- **Known limitations:** KL-EVENT-002, KL-EVENT-009.
- **Source references:** `src/app/events/manage-events.tsx` (`handleDelete`, `handleRegistrationForm`, `exportCsv`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/EventController.php` (`index`, `store`, `toggleStatus`, `getAvailableTimeSlots`).

## Event purchases

- **Purpose:** Find, review, change status of, delete and edit event ticket purchases.
- **Implementation status:** Implemented (deleted view read-only) · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/events/purchases.tsx` | KPIs, search, 9-filter sheet, table/card, bulk status (confirmed/checked-in/completed/cancelled; "completed" asks for confirmation because it emails guests) and bulk delete, per-row status/delete/edit, deleted view, Export CSV |
| `src/app/events/purchase-details.tsx` | Detail: QR (`EventPurchaseQRSheet` encodes `reference_number`), waivers, bulk-order banner, edit, delete |
| `src/app/events/edit-purchase.tsx` | Edit; order lines limited to date/time/notes/special requests (`UpdateEventOrderLineInput`) |

- **Roles:** All roles via menu; backend routes behind `staff` except public `POST`/`DELETE`.
- **Main workflows & operations:** Filters (`EventPurchaseFiltersSheet`): status, event, payment method, payment status, customer type, balance (due/paid), created range, scheduled range, amount range. Status change uses `PATCH /api/event-purchases/{id}/status`; completion may return `follow_up` (visit follow-up emails).
- **Data sources** (`src/services/eventPurchasesService.ts`): `fetchEventPurchases` (`GET /api/event-purchases?per_page=100&user_id&location_id?&start_date?&end_date?` — server returns all rows, unpaginated), `searchEventPurchases`, `verifyEventPurchaseByReference` (`GET /verify/{reference}`, 404 → null), `fetchTrashedEventPurchases`, `createEventPurchase`, `fetchEventPurchaseDetail` (bare model or `{data}`), `updateEventPurchase` (`PUT`), `updateEventPurchaseStatus` (`PATCH /status`), `deleteEventPurchase`, force-delete.
- **Validation & business rules:** BR-PURCH-013, BR-EVENT-006, BR-PURCH-007.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/events/EventPurchases.tsx`, `ViewEventPurchase.tsx`, `EditEventPurchase.tsx` — **Not assessed** beyond routes; restore exists server-side (`event-purchases/bulk-restore`) but not on mobile — **Gap**.
- **Known limitations:** KL-EVENT-003, KL-EVENT-005, KL-EVENT-006, KL-EVENT-007.
- **Source references:** `src/app/events/purchases.tsx` (`runBulkStatus`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/EventPurchaseController.php` (`index`, `updateStatus`).

## Event onsite purchase

- **Purpose:** Staff sale of event tickets to walk-ins.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/events/create-purchase.tsx`.
- **Main workflows & operations:** pick event → dates from `GET /api/events/{id}/available-dates` (fallback: client-generated dates) → slots from `available-time-slots/{date}` with remaining counts (fallback: the event's raw schedule with no counts — KL-EVENT-001) → quantity clamped to remaining → customer, gift card, payment (card/in-store/pay later), `checkout_key`; `send_email` only honoured for in-store.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/events/OnsitePurchaseEvent.tsx` reads `remaining_tickets` — **Partial** (gift card field is mobile-only).
- **Known limitations:** KL-EVENT-001, KL-ATTR-006.
- **Source references:** `src/app/events/create-purchase.tsx` (`loadTimeSlots`, `loadAvailableDates`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/EventPurchaseController.php` (`store` ~L249–265, ~L402–415).

---

## Registration Forms

- **Purpose:** Free sign-up forms: a registration event (group) owns one location form per location; staff view registrations, duplicates, history, hide/restore entries, export, and share the public link/QR.
- **Implementation status:** Implemented · **Verification:** Source-verified (editor internals partially inspected)
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/events/registration-forms.tsx` | Year + location list of registration events with totals; "from event" handoff from Manage Events opens the linked form or starts a new event |
| `src/app/events/registration-event.tsx` | One registration event: its location forms, export all locations (CSV) |
| `src/app/events/registration-event-editor.tsx` | Create/edit an event and its location set (sends `expected_location_ids`, confirm-remove retry), delete event |
| `src/app/events/registration-form-details.tsx` | One location form: counts, registrations (search/filter/pages), contact history sheet, hide/restore entry, open/close registration, export CSV, QR/link panel, photo frames info |
| `src/app/events/registration-form-editor.tsx` | Edit a location form's fields, delete the form |

- **Roles:** Client hub: `company_admin`, `location_manager`. Backend: `staff:company_admin|admin|location_manager` on both route groups (`routes/api.php` ~L859–880); managing a group requires every form's location to be within the staff member's locations (`ManagesRegistrationForms::canManageGroup`).
- **Location scoping:** list passes active location; forms resolved per company + `denyStaffElsewhere` (`ManagesRegistrationForms::accessibleEvent`).
- **Data sources** (`src/services/registrationFormsService.ts`): `/api/registration-events` (GET list, GET/POST/DELETE `{id}`, `event-options`, `{id}/registrations`, `{id}/registrations/export`, `{id}/contacts/{cid}/history`, `{id}/entries/{eid}/hide|restore`) and `/api/registration-event-groups` (GET list by year/location, POST, GET/POST/DELETE `{id}`, `{id}/export`). Header images go multipart via a direct `fetch` (bypasses `apiRequest`).
- **Validation & business rules:** BR-REG-001…006.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/registration-events/RegistrationEvents.tsx`, `RegistrationEventGroupPage.tsx`, `RegistrationEventDetails.tsx` (routes allow `company_admin`, `location_manager` — `App.tsx`) — routes/roles **Verified**; feature-level **Not assessed**. Public `/register/:code` (`EventRegistrationForm`) is web-only — **Mobile adaptation** (share link/QR only).
- **Shared components & utilities:** `src/components/events/*` (`RegistrationQrPanel`, `RegistrationHistorySheet`, `RegistrationTile`, `RegistrationStatusPill`, `RegistrationLoadFailure`); `src/lib/registrationForms/*` (`registrationForms.ts`, `registrationPayload.ts`, `shareCsv.ts`, `pickHeaderImage.ts`).
- **Platform-specific behaviour:** header image picking and CSV sharing are device features — Device verification required.
- **Tests:** `src/lib/registrationForms/registrationForms.test.ts`, `registrationEvents.test.ts`, `registrationLinking.test.ts`, `registrationPayload.test.ts` (pure helpers; contents not reviewed).
- **Known limitations:** KL-EVENT-008.

---

## Unified Check-In / Waivers desk

- **Purpose:** One desk that scans or looks up bookings, attraction tickets, bulk orders, event tickets, memberships and waivers, and admits them.
- **Implementation status:** Implemented · **Verification:** Source-verified; camera/image decode Device verification required
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/check-in.tsx` | Start/stop camera, upload a QR image, see the day's waivers/bookings for a chosen date, find a guest by name, open a record and Approve / Check In All / Override, launch the waiver kiosk |
| `src/app/attractions/check-in.tsx`, `src/app/memberships/membership-check-in.tsx`, `src/app/bookings/check-in.tsx` | Redirects to `/check-in` |

- **Roles:** All roles (Quick Action). Backend: every check-in/verify endpoint used is behind `staff` (any staff role incl. attendant): `attraction-purchases/{id}/verify|check-in`, `event-purchases/verify/{reference}` and `/{id}/status`, `ticket-orders/{id}/check-in`, `waivers/{id}/check-in`. Web shows Check-In / Waivers to attendant, manager, admin (`AdminSidebar.tsx`).
- **Location scoping:** day lists, waivers and guest lookup send the active location; membership check-in uses active location, else the user's home `location_id`, else refuses (`checkInLocationId`).
- **Main workflows & operations**
  - Code dispatch: `resolveScannedCode` → booking (handled by `useBookingCheckIn`, documented with bookings) or entity surface (`useEntityCheckIn.open`). Unrecognised → "Code not recognised" (BR-CHECKIN-001).
  - Attraction ticket: `verify` → review (status banner, balance-due warning, waivers) → Approve only if `confirmed` → `PATCH check-in` (BR-CHECKIN-002).
  - Bulk order: `GET /api/ticket-orders/{id}` + payments → Check In All (or per line) when paid, not cancelled/refunded, a line remains (BR-CHECKIN-004).
  - Event ticket: `verify/{EVT-…}` → refused if bulk-order line, completed, cancelled, already checked in → `PATCH /status checked-in` (BR-CHECKIN-003).
  - Membership: scan → Approve or Override (recorded override note) (BR-CHECKIN-005).
  - Waiver: scan by reference → Approve when signed and not yet checked in (BR-CHECKIN-006).
  - Day lists: date picker (venue date, earliest 2020-01-01), Waivers/Bookings tabs, search, paging; row check-in/undo for waivers (`useDeskWaivers`).
  - Guest lookup (≥2 chars): bookings, waivers (all dates/statuses), attraction tickets, orders, event tickets — 25 per source, each source failing independently (`useGuestLookup`).
- **Data sources:** `useEntityCheckIn` → `verifyAttractionPurchase`, `checkInAttractionPurchase`, `fetchTicketOrder`, `checkInTicketOrder`, `fetchPaymentsForPayable`, `verifyEventPurchaseByReference`, `updateEventPurchaseStatus`, `scanMembership`/`checkInMembership`, `scanWaiver`/`checkInWaiver`, `fetchEntityWaivers`; `fetchBookingsForCheckIn`; `useDeskWaivers` → `fetchWaivers`, `checkInWaiver`, `undoWaiverCheckIn`; `fetchTemplates` (kiosk).
- **Validation & business rules:** BR-CHECKIN-001…009.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/bookings/CheckIn.tsx` — event refusal text and order-line rule (`confirmEventCheckIn`), ticket verify/check-in handlers, membership location requirement — **Verified**; booking half and waiver lists **Not assessed** here.
- **Shared components & utilities:** `QrScannerView` (expo-camera `CameraView`, QR only, permission request/open-settings), `VerifyTicketDetails`, `VerifyOrderDetails`, `VerifyEntityDetails` (`VerifyEventTicketDetails`, membership, waiver), `VerifyBookingDetails`, `GuestLookupResults`; `src/lib/checkin/*`.
- **Loading / empty / error / refresh:** re-entrancy latch on scans; camera re-armed only if it was running; notices replace toasts; waivers reloaded when a surface closes; day list keeps last good rows on failure.
- **Platform-specific behaviour:** No `Platform.OS` branch in the desk. Image decode uses `scanFromURLAsync(uri, ["qr"])` and `expo-image-picker`; camera permission handled in `QrScannerView` (`canAskAgain` → Settings). Both need Device verification on iOS and Android (KL-CHECKIN-004).
- **Tests:** `src/lib/checkin/resolveScannedCode.test.ts`, `parseTicketQr.test.ts`, `checkInOrder.test.ts`, `deskDate.test.ts`, `eventCheckInRefusal.test.ts`, `ticketBalance.test.ts`, `checkInWaiverList.test.ts` (pure helpers). No tests for `useEntityCheckIn` or the screen's `canApprove` gate (KL-CHECKIN-005).
- **Known limitations:** KL-CHECKIN-001, KL-CHECKIN-002, KL-CHECKIN-003, KL-CHECKIN-004, KL-CHECKIN-005, KL-EVENT-003.
- **Source references:** `src/app/check-in.tsx` (`dispatchScan`, `uploadImage`, `canApprove`, `loadDay`); `src/lib/hooks/useEntityCheckIn.ts` (`open`, `confirm`, `checkInLocationId`); `src/lib/hooks/useGuestLookup.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/AttractionPurchaseController.php` (`verify`, `checkIn`), `EventPurchaseController.php` (`verifyByReference`, `updateStatus`), `TicketOrderController.php` (`checkIn`).

---

## Tests in scope

All are `node:test` pure-logic unit tests; their presence was confirmed, contents were not reviewed in this pass and nothing was run.

| Test file | Module under test |
|---|---|
| `src/lib/checkin/resolveScannedCode.test.ts`, `parseTicketQr.test.ts` | scan code classification |
| `src/lib/checkin/checkInOrder.test.ts`, `deskDate.test.ts`, `eventCheckInRefusal.test.ts`, `ticketBalance.test.ts`, `checkInWaiverList.test.ts` | desk ordering, venue date, event refusal, balance, waiver list |
| `src/lib/attractions/dayOffAvailability.test.ts`, `purchaseEditPayload.test.ts` | day-off calendar, edit payload |
| `src/lib/events/eventSaleDates.test.ts`, `eventEditForm.test.ts` | sale dates, event edit form |
| `src/lib/registrationForms/*.test.ts` (4 files) | registration helpers/payloads/linking |
| `src/lib/ticketLimits.test.ts`, `bulkOrder.test.ts`, `orderAmounts.test.ts`, `purchaseMetrics.test.ts` | slot caps, order banner, amounts, transaction counts |
| `src/lib/giftCards/checkoutGiftCard.test.ts`, `src/lib/payments/checkoutKey.test.ts`, `checkoutTokens.test.ts`, `payableRoute.test.ts` | gift card math, idempotency key, checkout token, routes |
