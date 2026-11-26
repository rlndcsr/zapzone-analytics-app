# Packages & Pricing — Feature Baseline

> **Purpose:** Describe what the Mobile app's Packages and Pricing modules (packages, custom packages, add-ons, spaces, gift cards, promo codes, global notes, special pricing, fee supports) and the shared pricing-calculation services actually do today, with evidence.
> **Status:** Baseline (descriptive) — documents existing behaviour; not a requirements source
> **Last reviewed:** 2026-11-25
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e` (cited sections only); Backend `zapzone-backend@ae877e2` (cited sections only)
> **Scope & limitations:** Static source inspection only — nothing was run, built or tested. Inspected: every route under `src/app/packages/*` and `src/app/pricing/*`; `src/lib/packages/*`, `src/lib/pricing/*`, `src/lib/giftCards/*`, `src/lib/packageSetup.ts`, `src/lib/addOnQuantity.ts`, `src/lib/venueCategories.ts`, `src/lib/rooms.ts`; the package/pricing hooks and services; `PackageActionsSheet`. Backend: `routes/api.php` (package/pricing routes), `EnsureStaff`, `ScopesByAuthUser` (parts), and the relevant parts of `PackageController`, `MobilePackageController`, `AddOnController`, `RoomController`, `GiftCardController`, `PromoController`, `SpecialPricingController`, `FeeSupportController`, `GlobalNoteController`, `Store/UpdatePackageRequest`, `StorePackageAvailabilityScheduleRequest`. Web Admin: targeted greps/reads of `src/pages/admin/packages/*`, `special-pricing/SpecialPricings.tsx`, `fee-supports/FeeSupports.tsx`, `components/admin/promos/*`. **Not assessed:** how bookings/purchases consume these definitions server-side (owned by the bookings investigator), `SpecialPricing::getFullPriceBreakdown` internals, `PromoController::locationIdsForActor`, filter/table/detail sheet UI internals, `CustomPackageFields` (booking-level custom packages).
> **Related:** [Feature catalog](../FEATURE_CATALOG.md) · [Business rules index](../BUSINESS_RULES.md) · [Known limitations](../KNOWN_LIMITATIONS.md) · [Architecture](../ARCHITECTURE.md) · [Packages & pricing business rules](../business-rules/packages-and-pricing.md)

---

## Overview

| Area | What staff accomplish | Entry route |
|---|---|---|
| Packages hub | Jump to every package-definition sub-module or a create form | `/packages/packages-hub` |
| Manage Packages | List, filter, toggle, show/hide online, duplicate, delete, import/export packages | `/packages/packages` |
| Create / Edit Package | Full package definition incl. schedules, relations, deposits | `/packages/create-packages`, `/packages/edit-packages?id=` |
| Custom Packages | Same management for non-`regular` package types | `/packages/custom-packages` |
| Add-ons | CRUD + CSV export of add-ons | `/packages/add-ons` |
| Space | CRUD of rooms/spaces, area-group turnaround | `/packages/space` |
| Gift Cards | Create, sell at the counter, delete gift cards | `/packages/gift-cards` |
| Promos | Create/edit/delete single codes, generate bulk codes | `/packages/promos` |
| Global Notes | Customer-facing notes for all or selected packages | `/packages/global-notes` |
| Pricing hub | Jump to special pricing / fee supports | `/pricing/pricing-hub` |
| Special Pricing | List/toggle/delete/export rules; create/edit rules | `/pricing/pricing`, `/pricing/create-special-pricing` |
| Fee Supports | List/toggle/delete/export fees; create/edit fees | `/pricing/fee-support`, `/pricing/create-fee-support` |
| Shared pricing services | Fee + special-pricing quotes used by booking/purchase screens | (no route) |

**Cross-cutting facts (apply to every module below unless stated):**

- **Navigation/roles.** "Packages" and "Pricing" are in `BASE_NAV_MENU_ITEMS` for every role (`src/components/navigation/navMenuItems.ts` `getNavMenuItems`); no screen in scope blocks a role from opening it. Role checks inside screens are limited to: location pickers (company admin only) and the Front-End Availability switch (`canChangeOnlineAvailability`). The backend `staff` middleware admits `company_admin`, `admin`, `location_manager` and `attendant` (`zapzone-backend@ae877e2:app/Http/Middleware/EnsureStaff.php` `ROLES`), so attendants can perform most writes here (see per-module "Roles").
- **Lists are loaded whole and filtered/sorted/paginated client-side** (default 5 per page via `Pagination`), with pull-to-refresh. Most screens use `useAsyncList` or a module cache hook.
- **UI kit.** List screens use `components/ui/SummaryPanel` primitives (filter chips, empty/error states, status dot badges) and a `HubShortcuts` "More" row (`components/ui/ModuleHub`); only Global Notes uses `ModuleHeader`. Create/edit for add-ons, spaces, gift cards, promos and global notes are `BottomSheet` forms; packages, special pricing and fee supports use full-screen forms.
- **Hub `?create=1` deep links** open the create sheet once, then clear the param (add-ons, space, promos, gift cards).
- **Not in this app:** customer storefront pages; package trash/restore; drag-and-drop package reordering (see [Known limitations](../KNOWN_LIMITATIONS.md) KL-PKG-009).

---

## Packages hub & Pricing hub

- **Purpose:** Landing screens that route to sub-modules and offer one-tap create shortcuts.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/packages/packages-hub.tsx` | Opens Manage Packages, Custom Packages, Gift Cards, Space, Add-ons, Promos; quick links: Create Package, Create Custom (`/packages/create-packages?type=custom`), Create Space/Add-on/Promo/Gift Card (`?create=1`), Global Notes, Fee Supports, Special Pricing |
| `src/app/pricing/pricing-hub.tsx` | Opens Special Pricing and Fee Supports; quick links to both create screens, Packages hub, Attractions, Events |

- **Roles:** All signed-in staff roles (nav is not role-filtered for these items).
- **Location scoping:** None.
- **Main workflows & operations:** Navigation only.
- **Data sources:** None.
- **Validation & business rules:** None.
- **Web Admin counterpart:** Web uses the admin sidebar, not hubs — **Mobile adaptation**.
- **Shared components & utilities:** `ModuleHubScreen` (`src/components/ui/ModuleHub.tsx`).
- **Loading / empty / error / refresh:** Static.
- **Platform-specific behaviour:** None found.
- **Tests:** None.
- **Known limitations:** KL-PKG-011 (`src/app/packages/create-custom-packages.tsx` is a placeholder; the hub routes to `create-packages?type=custom` instead).
- **Source references:** `packages-hub.tsx` (`QUICK_LINKS`, `MODULES`); `pricing-hub.tsx`.

---

## Package definitions

### Manage Packages (regular packages list)

- **Purpose:** Manage the `regular` (or untyped) package catalog.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/packages/packages.tsx` | Search (name/description), sort (Name / Price / Category / Display Order, asc/desc), category chips, "Hidden from booking site (N)" chip, KPI panel (total, active, avg price, hidden), per-card actions, select + bulk delete, Import/Export JSON |
| `src/components/ui/PackageActionsSheet.tsx` | Read-only package details (eye icon) or Duplicate form (copy icon); Edit and Delete from the sheet |

- **Roles:** All staff roles can open and use it. The online/hidden globe button is shown only when `canChangeOnlineAvailability(role)` (company_admin, admin, location_manager) and the server reported the flag (`src/lib/packages/onlineAvailability.ts`). Server: all package writes require `staff`; `PATCH /api/packages/{package}/online-availability` requires `staff:company_admin|admin|location_manager` (`routes/api.php` L424–441). Writes are location-checked server-side (`PackageController::denyForeignPackage`, `scopedLocation`, `manageablePackageIds`).
- **Location scoping:** Shows `LocationWorkspaceSelector`; filters rows client-side by **location name** equal to the active location's name (or all). Bulk delete selection is cleared when the active location changes. Import targets the active location, else the user's `location_id`; "All Locations" blocks import.
- **Main workflows & operations**
  - Activate/deactivate (optimistic, reconciled with server, reverted on error).
  - Hide from / show on booking site (confirmation dialog; detects an older server that ignores the flag → "Not changed").
  - View details; Edit → Edit Package screen; Duplicate (company admins can pick a target location when >1 known; others copy in place); Delete (single, confirmed); bulk Delete (`Promise.allSettled` over per-id deletes, partial-failure message).
  - Import Packages: pick a JSON file (`expo-document-picker`), accept array or `{packages:[]}`, strip id/timestamps/location, force workspace location, POST bulk import; reports imported/failed and backend-only rows the server left online; guards double-tap.
  - Export Packages: JSON of the filtered rows (stored category, not normalized) shared via `expo-sharing`.
- **Data sources**
  - `usePackages` → `fetchPackages` → `GET /api/mobile/packages` (lightweight `MobilePackageController::index`, scalar columns + `location:id,name`, ordered by `display_order`, `name`).
  - `GET /api/packages/{id}` (detail; public route at `routes/api.php` L161) via `fetchPackageDetail`.
  - `PATCH /api/packages/{id}/toggle-status`, `PATCH /api/packages/{id}/online-availability`, `DELETE /api/packages/{id}`, `POST /api/packages` (duplicate), `POST /api/packages/bulk-import`.
- **Validation & business rules:** BR-PKG-001, BR-PKG-006, BR-PKG-007, BR-PKG-008, BR-PKG-009, BR-PKG-011, BR-PKG-013.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/packages/Packages.tsx` — **Partial**. Mobile matches sort keys, backend-only filter, import/export, duplicate logic (`handleConfirmDuplicate`). Missing on mobile: drag-and-drop reorder (`reorderPackages`), bulk min-notice update (`bulkUpdateMinNotice`), "Deleted Packages" (`TrashedPackages.tsx`). Mobile `reorderPackages` exists in `packagesService.ts` but has no caller.
- **Shared components & utilities:** `usePackages` (session cache keyed by user + kind + location, 5-min TTL, stale flag, patch-log replay `src/lib/packages/patchLog.ts`), `PackageActionsSheet`, `BackendOnlyBadge`, `normalizeCategory`, `Pagination`.
- **Loading / empty / error / refresh:** Skeletons on first load; cached rows shown instantly with quiet refresh; red banner with "Try again" when nothing cached; distinct empty states ("No packages yet" vs "No packages found"); refetch on focus when another screen marked the cache stale.
- **Platform-specific behaviour:** Export uses `expo-file-system/legacy` + `expo-sharing` with `UTI: "public.json"` (iOS) / `mimeType` (Android); falls back to an alert with the cache path if sharing is unavailable.
- **Tests:** `src/lib/packages/patchLog.test.ts` (switch not undone by an older refresh), `src/lib/packages/onlineAvailability.test.ts` (who may change, wording, import stayed-online count), `src/lib/venueCategories.test.ts` (category folding).
- **Known limitations:** KL-PKG-007 (location filter by name), KL-PKG-008 (delete wording vs soft delete), KL-PKG-009 (web-only reorder/bulk notice/trash), KL-PKG-010 (duplicate omits schedules/escape-room flag), KL-PKG-024 (security: mobile packages endpoint scoping).
- **Source references:** `src/app/packages/packages.tsx` (`handleToggleActive`, `handleToggleOnline`, `runImport`, `runExport`, `runDeleteSelected`); `src/services/packagesService.ts` (`fetchPackages`, `togglePackageStatus`, `setPackageOnlineAvailability`, `duplicatePackage`, `deletePackage`, `bulkImportPackages`); `src/lib/hooks/usePackages.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/MobilePackageController.php` (`index`, `applyMobileScope`); `PackageController` (`toggleIsActiveStatus`, `updateOnlineAvailability`, `destroy`, `bulkImport`).

### Create / Edit Package

- **Purpose:** Define a package: details, pricing & players, booking rules & deposits, availability schedules, attractions/spaces/add-ons, image and invitation template, online availability.
- **Implementation status:** Implemented (with defects, see KL) · **Verification:** Source-verified; Device verification required for the save paths flagged in KL-PKG-003.
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/packages/create-packages.tsx` | Single-page form; `?type=` preselects package type (regular/custom/seasonal/holiday/special); Reset; live preview card |
| `src/app/packages/edit-packages.tsx` | Same form seeded from `GET /api/packages/{id}`; location shown read-only |
| `src/app/packages/create-custom-packages.tsx` | Placeholder stub (renders a text label only) |

- **Roles:** All staff roles may create/edit (server `staff`). Company admins pick the location (defaults to the active workspace location); other roles are locked to their own location (UI) and the server forces `location_id = user.location_id` for non-company-admins (`PackageController::store`). Front-End Availability field: everyone sees it; only managers/admins send it (create) or send it when changed (edit); the server also refuses a change by others (`guardOnlineAvailabilityChange`, 403).
- **Location scoping:** Attractions, spaces and add-on pickers load for the chosen location; changing location clears those selections. Server rejects relations from another location with 422 (`assertRelationsMatchLocation`).
- **Main workflows & operations**
  - Create: validate → `POST /api/packages` → if schedules exist, `PUT /api/packages/{id}/availability-schedules` (bulk replace). A schedule failure after creation shows "Partly saved".
  - Edit: validate → `PUT /api/packages/{id}` → schedules PUT **only when at least one schedule row exists** (KL-PKG-004).
  - Schedule editor: daily / weekly (weekday chips) / monthly (occurrence-weekday patterns such as `first-saturday`), start/end (HH:MM 24h), interval (min 15), optional per-schedule minimum players, active flag, generated-slot preview (`generateScheduleSlots`), interval/turnaround note (`scheduleIntervalMessage`), call-to-book notice.
  - Booking window presets 1–12 months (30-day multiples) and advance-notice presets 1 h–4 weeks (`src/lib/packages/bookingWindow.ts`).
  - Image picked from library as base64 data URL (quality 0.7); sent only when newly picked. Invitation: link **or** file (PDF/DOC/DOCX/PNG/JPEG as base64); edit sends the file tri-state (new / `null` to clear / omitted to keep).
  - Promos and gift cards: create always sends empty lists; edit resends the loaded ids (no UI to change them). Backend Store/UpdatePackageRequest have no `promo_ids`/`gift_card_ids` rules, so these keys are dropped by `validated()` (KL-PKG-006).
- **Data sources:** `fetchLocations` → `GET /api/mobile/locations`; `fetchCategories` → `GET /api/categories`; `fetchAttractions`; `fetchRoomOptions` → `GET /api/rooms`; `fetchAddOns` → `GET /api/addons` (all pages); `createPackage` / `updatePackage` / `savePackageAvailabilitySchedules`.
- **Validation & business rules:** BR-PKG-002, BR-PKG-003, BR-PKG-004, BR-PKG-005, BR-PKG-006, BR-PKG-012.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/packages/CreatePackage.tsx`, `EditPackage.tsx` — **Partial**. Differences: web sends `display_order` as a number (default 0) while mobile sends `null` (KL-PKG-003); web edit always PUTs schedules once loaded (empty list clears them) while mobile skips an empty list (KL-PKG-004); web sends `is_escape_room`, mobile never does; web exposes display order, mobile does not.
- **Shared components & utilities:** `FormControls` (`TextField`, `SelectField`, `SegmentedToggle`, `ToggleRow`), `attractionFormKit` (`Section`, `CallToBookNotice`), `OnlineAvailabilityField`, `validatePackageSetup` (`src/lib/packageSetup.ts`), `scheduleSlots.ts`, `scheduleDays.ts`, `bookingWindow.ts`, `markPackagesStale`.
- **Loading / empty / error / refresh:** Edit shows a spinner until detail + options load, and an error panel with Back on failure. Submit errors surface the server message via `Alert`.
- **Platform-specific behaviour:** Both forms wrap content in `KeyboardAvoidingView` with `behavior="padding"` on iOS only. Many numeric fields use `number-pad`/`decimal-pad`, which on iOS have no return key (Device verification required for usability).
- **Tests:** `src/lib/packageSetup.test.ts` (duration minutes, setup guards), `src/lib/packages/scheduleSlots.test.ts`, `scheduleDays.test.ts`, `bookingWindow.test.ts`, `onlineAvailability.test.ts`.
- **Known limitations:** KL-PKG-003, KL-PKG-004, KL-PKG-005, KL-PKG-006, KL-PKG-011.
- **Source references:** `create-packages.tsx` (`validateStep`, `handleSubmit`, `buildSchedulePayload`); `edit-packages.tsx` (`invitationFileForSave`, `handleSubmit`); `packagesService.ts` (`CreatePackageInput`, `UpdatePackageInput`, `PackageScheduleInput`); `zapzone-backend@ae877e2:app/Http/Requests/StorePackageRequest.php`, `UpdatePackageRequest.php`, `StorePackageAvailabilityScheduleRequest.php`; `PackageController::store`, `::update`, `::updateAvailabilitySchedules`.

### Custom Packages (non-regular package types)

- **Purpose:** Manage packages whose `package_type` is not `regular` (custom, seasonal, holiday, special). This is **not** the booking-level "custom package" (`is_custom_package` on a booking, `src/components/bookings/CustomPackageFields.tsx`), which belongs to the bookings domain.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/packages/custom-packages.tsx` — search (name, normalized category, location name), type chips with counts, KPIs (total/active/avg price/backend-only), status toggle, online toggle, edit, delete, details/duplicate via `PackageActionsSheet`; "New" → `create-packages?type=custom`.
- **Roles:** Same as Manage Packages.
- **Location scoping:** Filters by active location **id** (unlike Manage Packages, which uses name).
- **Main workflows & operations:** As Manage Packages minus import/export and bulk delete.
- **Data sources:** `usePackages({ kind: "custom" })` (same `GET /api/mobile/packages`, filtered client-side with `!isRegularPackage`).
- **Validation & business rules:** BR-PKG-001, BR-PKG-006, BR-PKG-007.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/packages/CustomPackages.tsx` — **Not assessed** in detail (existence verified).
- **Shared components & utilities:** `usePackages`, `PackageActionsSheet`, `SummaryPanel`, `HubShortcuts`.
- **Loading / empty / error / refresh:** As Manage Packages; page index clamps after deletes.
- **Platform-specific behaviour:** None found.
- **Tests:** As Manage Packages (lib-level only).
- **Known limitations:** KL-PKG-008.
- **Source references:** `custom-packages.tsx` (`toggleStatus`, `toggleOnline`, `confirmDelete`); `packagesService.ts` (`isRegularPackage`).

### Add-ons

- **Purpose:** Maintain the extras (food, drinks, etc.) packages and purchases can carry.
- **Implementation status:** Partially implemented · **Verification:** Source-verified; Device verification required for image upload (KL-PKG-001).
- **Routes / screens:** `src/app/packages/add-ons.tsx` — list with search, KPI/summary, create/edit bottom sheet (location for company admins, image, name, price, min/max quantity, description, "force add-on" switch), delete, CSV export.
- **Roles:** All staff roles. Location picker in the form only for company admins (others default to their own location). Server: add-on writes are inside `Route::middleware('staff')` (`routes/api.php` L515–520); store/update call `scopedLocation`; update/destroy call `denyForeignRecord` (`AddOnController`).
- **Location scoping:** `LocationWorkspaceSelector` + client filter by active location id. List fetch itself is not location-filtered (server scopes by role).
- **Main workflows & operations:** Create (`POST /api/addons`), edit (`PUT /api/addons/{id}`), delete (`DELETE /api/addons/{id}`), export CSV (ID, name, location, price, min/max, forced, description).
- **Data sources:** `fetchAddOnList` → `GET /api/addons?per_page=500&page=n` (up to 20 pages, de-duplicated).
- **Validation & business rules:** BR-ADDON-001, BR-ADDON-002, BR-ADDON-003.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/packages/AddOns.tsx` — **Partial**. Web requires a price for non-forced add-ons and ≥1 package with per-package price for forced add-ons (`price_each_packages`); mobile has neither (KL-PKG-012). Web has import/export modals; mobile export only (KL-PKG-013).
- **Shared components & utilities:** `useAsyncList`, `SummaryPanel`, `HubShortcuts`, `BottomSheet`; `src/lib/addOnQuantity.ts` (used by booking screens, encodes forced/min/max rules).
- **Loading / empty / error / refresh:** Skeleton, error banner, empty state naming the active location; pull-to-refresh.
- **Platform-specific behaviour:** Image picker via `expo-image-picker`; CSV via `expo-file-system/legacy` + `expo-sharing`.
- **Tests:** `src/lib/addOnQuantity.test.ts` (forced recognition, min resolution, clamping, seeding).
- **Known limitations:** KL-PKG-001, KL-PKG-012, KL-PKG-013.
- **Source references:** `add-ons.tsx` (`saveForm`, `confirmDelete`, `exportCsv`); `src/services/addOnsService.ts` (`AddOnInput`, `fetchAllAddOns`, `fetchCustomPackageAddOns`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/AddOnController.php` (`store`, `update`).

### Space (rooms)

- **Purpose:** Maintain bookable spaces/rooms, their capacity, availability, area group, turnaround (`booking_interval`) and break times.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/packages/space.tsx` — search (name/area group), status chips (all/available/inactive), Filters sheet (location, sort by name/capacity/created, order), create sheet (single or multiple with base name + suffix + count + start), edit sheet (name, capacity, available, area group, turnaround, breaks), delete, "Area group settings" (turnaround and "Spaces in this group can start at the same time" for every space in a group).
- **Roles:** All staff roles; location picker shown in create. Server: room writes in `staff` group (`routes/api.php` L481–486); `store`/`update` call `scopedLocation`; `show`/`update`/`destroy` call `denyForeignRecord` (`RoomController`).
- **Location scoping:** Location filter defaults to (and follows) the active workspace location; can be widened in Filters. New spaces default to the active location, else the user's.
- **Main workflows & operations:** Create one or many (sequential `POST /api/rooms`; partial success closes the sheet and reports "N of M"), edit (`PUT /api/rooms/{id}`), delete (`DELETE /api/rooms/{id}`), area-group turnaround (one `PUT` per room in the group).
- **Data sources:** `fetchSpaceList` → `GET /api/rooms?per_page=100&page=n` (no `include_unavailable`); `fetchLocations` → `GET /api/mobile/locations`.
- **Validation & business rules:** BR-SPACE-001, BR-SPACE-002, BR-SPACE-003.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/packages/Rooms.tsx` — **Partial**: web uses `roomService.updateBookingIntervalByAreaGroup` (`PATCH /api/rooms/area-group/{areaGroup}/update-booking-interval`) and `bulkDeleteRooms`; mobile loops per-room PUTs and has no bulk delete (KL-PKG-015).
- **Shared components & utilities:** `src/lib/rooms.ts` (`turnaroundUpdate`, `areaGroupValue`, `roomIsAvailable`, `sortRoomsNumerically`); `bookingsService.ts` room functions.
- **Loading / empty / error / refresh:** Skeleton, error banner, filtered empty state, pull-to-refresh.
- **Platform-specific behaviour:** None found.
- **Tests:** `src/lib/rooms.test.ts` (numeric ordering, turnaround update, area group null, availability reading).
- **Known limitations:** KL-PKG-014 (inactive spaces likely not returned), KL-PKG-015.
- **Source references:** `space.tsx` (`saveRoom`, `saveCreate`, `saveAreaGroup`); `src/services/bookingsService.ts` (`fetchSpaceList`, `createRoom`, `updateRoom`, `deleteRoom`, `updateAreaGroupSettings`, `breaksToPayload`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/RoomController.php` (`index`, `store`, `update`).

### Global Notes

- **Purpose:** Customer-facing notes shown during booking, either global (all packages) or pinned to selected packages.
- **Implementation status:** Implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/packages/global-notes.tsx` — list (ordered by display order), active toggle, edit/create sheet (title, content, active, "global" switch, package picker), delete.
- **Roles:** All staff roles. Server: `apiResource('global-notes')` + `toggle-status` under `staff` only; **no company/location ownership checks** (`GlobalNoteController`, `GlobalNote` model has no company/location column) — see KL-PKG-021.
- **Location scoping:** None (package picker uses role-scoped `GET /api/mobile/packages`).
- **Main workflows & operations:** Create (`POST /api/global-notes`), update (`PUT /api/global-notes/{id}`), delete, toggle status (`PATCH .../toggle-status`).
- **Data sources:** `fetchGlobalNotes` → `GET /api/global-notes`; `fetchPackages`.
- **Validation & business rules:** BR-PKG-014.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/packages/GlobalNotes.tsx` — **Partial**: web edits `display_order` (and sets it to `notes.length` on create); mobile never sends it (KL-PKG-020).
- **Shared components & utilities:** `globalNotePayload` (`src/lib/packages/globalNotePayload.ts`), `ModuleHeader`, `SummaryPanel`.
- **Loading / empty / error / refresh:** Error and empty states, pull-to-refresh; optimistic toggle.
- **Platform-specific behaviour:** None found.
- **Tests:** `src/lib/packages/globalNotePayload.test.ts` (null package_ids for global, null cleared title, trimming).
- **Known limitations:** KL-PKG-020, KL-PKG-021 (security).
- **Source references:** `global-notes.tsx`; `src/services/globalNotesService.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/GlobalNoteController.php`; `app/Models/GlobalNote.php` (`scopeForPackage`).

---

## Discounts & stored value

### Gift Cards

- **Purpose:** Create gift cards, sell them at the counter (cash / in-store), look them up and delete them.
- **Implementation status:** Partially implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/packages/gift-cards.tsx` — search by code, status chips (all/active/inactive; expired cards count as inactive), "Sell" (header primary), "Create Gift Card" sheet (type, value, balance, max usage, expiry `YYYY-MM-DD`, description, targeting), sold-card result with copy-code, delete.
- **Roles:** Create/delete/update/redeem routes are inside the `staff` group (`routes/api.php` L529–567). Sale: `POST /api/gift-cards/purchase` is a public, throttled route; cash/in-store sales require a staff principal (`GiftCardController::purchase`, 403 otherwise); location managers/attendants may only sell for their own location (403). Mobile: company admins pick the sale location; others are fixed to their own.
- **Location scoping:** List requests `location_id` = active workspace location (omitted for "All Locations"). Created cards carry `location_id = user.location_id` (company admins send none) plus targeting lists.
- **Main workflows & operations:** Create (`POST /api/gift-cards`), sell (`POST /api/gift-cards/purchase`), delete (`DELETE /api/gift-cards/{id}`, soft: `deleted=true, status=deleted`). No edit/deactivate/reactivate on mobile.
- **Data sources:** `fetchGiftCardList` → `GET /api/gift-cards?status=all&include_expired=1&...` (200/page, ≤25 pages); `useLocationOptions` for the sale location list.
- **Validation & business rules:** BR-GIFT-001, BR-GIFT-002, BR-GIFT-003, BR-GIFT-004.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/packages/GiftCard.tsx` — **Partial**: web also edits, deactivates and reactivates cards (`updateGiftCard`); sell flow is equivalent.
- **Shared components & utilities:** `src/lib/giftCards/sellGiftCard.ts`, `giftCardExpiry.ts`, `checkoutGiftCard.ts` (checkout use in booking/purchase screens), `TargetingPicker`/targeting payload, `expo-clipboard`.
- **Loading / empty / error / refresh:** Skeleton, error banner, empty state; server field errors shown verbatim on create failure.
- **Platform-specific behaviour:** None found.
- **Tests:** `src/lib/giftCards/sellGiftCard.test.ts`, `giftCardExpiry.test.ts`, `checkoutGiftCard.test.ts` (apply/clamp/round, 429 wording, payload field, server-due reconciliation).
- **Known limitations:** KL-PKG-016, KL-PKG-017, KL-PKG-022 (security).
- **Source references:** `gift-cards.tsx` (`submitCreate`, `handleSell`, `confirmDelete`); `src/services/giftCardsService.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/GiftCardController.php` (`index`, `store`, `purchase`, `resolvePurchaseAmount`, `destroy`).

### Promos (promo codes)

- **Purpose:** Manage single promo codes and bulk-generated code batches.
- **Implementation status:** Partially implemented · **Verification:** Source-verified
- **Routes / screens:** `src/app/packages/promos.tsx` — tabs "single" / "bulk"; single: search (name/code), status chips, create sheet (name, code optional, type fixed/percentage, value, start/end, total and per-user limits, description, targeting), edit sheet (type, value, dates, limits, status, description, targeting), delete; bulk: batch list, "Generate Bulk Codes" sheet.
- **Roles:** All promo routes require `staff` (`routes/api.php` L569–578). No mobile role gating.
- **Location scoping:** Single codes requested with `location_id` = active location; batches unfiltered.
- **Main workflows & operations:** `POST /api/promos`, `PATCH /api/promos/{id}`, `DELETE /api/promos/{id}` (server soft-deletes: `deleted=true, status=inactive`), `POST /api/promos/generate-bulk` (broken, KL-PKG-002), `GET /api/promos/batches`. A create conflict pre-fills the server's suggested free code.
- **Data sources:** `fetchPromoList` → `GET /api/promos?status=all&exclude_batches=1&...`; `fetchPromoBatches`. Also used elsewhere: `fetchPromos` (package form options), `fetchSharedPromoCodes` (visit e-mails), `validatePromoCode` → `POST /api/promos/validate-code` (checkout quote).
- **Validation & business rules:** BR-PROMO-001, BR-PROMO-002, BR-PROMO-003, BR-PROMO-004.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/packages/Promo.tsx` + `zappoint@5de9d9e:src/components/admin/promos/BatchListTab.tsx`, `GenerateBulkModal.tsx` — **Partial**: web batch tab exports CSV, deactivates and deletes batches; mobile lists batches only. Web bulk payload uses `name/type/value/usage_limit_per_code`; mobile uses different keys (KL-PKG-002).
- **Shared components & utilities:** targeting picker/payload, `SummaryPanel`, `useAsyncList`.
- **Loading / empty / error / refresh:** Per-tab loaders, errors and pull-to-refresh.
- **Platform-specific behaviour:** None found.
- **Tests:** None for promo definitions (only `checkoutGiftCard.test.ts` covers gift-card checkout helpers).
- **Known limitations:** KL-PKG-002, KL-PKG-018, KL-PKG-019, KL-PKG-023 (security).
- **Source references:** `promos.tsx` (`submitCreate`, `submitEdit`, `submitBulk`); `src/services/promosService.ts`; `src/services/discountCodesService.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/PromoController.php` (`store`, `update`, `destroy`, `generateBulk`, `listBatches`).

---

## Pricing rules

### Special Pricing

- **Purpose:** Automatic discounts by visit date/day/time for packages, attractions, events or everything, with priority and stacking.
- **Implementation status:** Partially implemented · **Verification:** Source-verified; Device verification required for the create path (KL-PRICE-001).
- **Routes / screens**

| Route file | What the user does |
|---|---|
| `src/app/pricing/pricing.tsx` | Card/table view (`ViewToggle`, `SpecialPricingTable`), filters sheet, detail sheet, toggle active, delete, export CSV, KPIs |
| `src/app/pricing/create-special-pricing.tsx` | Create or edit (`?id=`): name, description, location (or company-wide), fixed/percentage amount, recurrence (one-time / weekly day / monthly), first/last visit dates (non-one-time), visit time window, entity type + item checklist, priority, stackable, active; $100 preview |

- **Roles:** All staff roles (routes under `staff`, `routes/api.php` L501–504). No mobile gating. Server does **not** check record ownership on update/delete/toggle (KL-PRICE-010).
- **Location scoping:** List keeps company-wide rules (`location_id` null) plus rules matching the active location. Entity checklist for a new company-wide rule lists the active location's items; when editing it is not narrowed (so saved cross-location targets are not dropped).
- **Main workflows & operations:** `GET /api/special-pricings?per_page=100&sort_by=priority&sort_order=desc` (one page), `PATCH .../toggle-status`, `DELETE /api/special-pricings/{id}`, `GET /api/special-pricings/{id}`, `POST` / `PUT /api/special-pricings[/{id}]`. Monthly edits keep the loaded day of month (no picker). One-time rules have no date field on mobile.
- **Data sources:** `useSpecialPricings` (module cache keyed by location only, 5-min TTL, stale flag); `specialPricingService.ts`; entity lists via `fetchPackages`, `fetchAttractions`, `fetchEvents`; `fetchLocations`.
- **Validation & business rules:** BR-PRICE-005, BR-PRICE-006.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/special-pricing/SpecialPricings.tsx` — **Partial**: web sends `company_id` and `specific_date`, has a monthly day-of-month picker and bulk delete; mobile has none of these (KL-PRICE-001, KL-PRICE-002, KL-PRICE-006).
- **Shared components & utilities:** `SpecialPricingFiltersSheet`, `SpecialPricingDetailSheet`, `SpecialPricingTable`, `ViewToggle`, `SummaryPanel`.
- **Loading / empty / error / refresh:** Cached list shown instantly; spinner/error/empty states; refetch on focus after a create/edit marks stale.
- **Platform-specific behaviour:** Create screen has no `KeyboardAvoidingView` (KL-PRICE-005). CSV export via `expo-file-system/legacy` + `expo-sharing`.
- **Tests:** None for the rule-definition screens (pricing-calculation tests listed under Shared pricing services).
- **Known limitations:** KL-PRICE-001, KL-PRICE-002, KL-PRICE-004, KL-PRICE-005, KL-PRICE-006, KL-PRICE-008, KL-PRICE-010 (security).
- **Source references:** `pricing.tsx`; `create-special-pricing.tsx` (`submit`, `loadEntities`); `src/services/specialPricingService.ts`; `src/lib/hooks/useSpecialPricings.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/SpecialPricingController.php` (`store`, `update`, `destroy`, `toggleStatus`).

### Fee Supports

- **Purpose:** Extra fees (fixed or percentage; additive or inclusive) applied to packages, attractions, events or memberships.
- **Implementation status:** Partially implemented · **Verification:** Source-verified; Device verification required for the create path (KL-PRICE-003).
- **Routes / screens:** `src/app/pricing/fee-support.tsx` (card/table view, filters, detail, toggle, delete, CSV export, KPIs); `src/app/pricing/create-fee-support.tsx` (create/edit: name, location, calculation type, amount, application type, entity type, "apply to all" or item checklist, active; $100 preview).
- **Roles:** All staff roles (routes under `staff`, `routes/api.php` L506–509). Server `update` has no record-ownership check (KL-PRICE-011).
- **Location scoping:** List keeps company-wide fees plus the active location's.
- **Main workflows & operations:** `GET /api/fee-supports?per_page=100` (one page, sorted newest first client-side), toggle, delete, `GET /api/fee-supports/{id}`, `POST` / `PUT`.
- **Data sources:** `useFeeSupports`; `src/services/feeSupportService.ts`.
- **Validation & business rules:** BR-FEE-001, BR-FEE-002, BR-PRICE-006.
- **Web Admin counterpart:** `zappoint@5de9d9e:src/pages/admin/fee-supports/FeeSupports.tsx` — **Partial**: web sends `company_id` (falls back to `1` when the user has none); mobile never sends it (KL-PRICE-003).
- **Shared components & utilities:** `FeeSupportFiltersSheet`, `FeeSupportDetailSheet`, `FeeSupportTable`, `ViewToggle`.
- **Loading / empty / error / refresh:** As Special Pricing.
- **Platform-specific behaviour:** No `KeyboardAvoidingView` on the create screen (KL-PRICE-005).
- **Tests:** None for fee definitions; `combineFreshPricing.test.ts` covers how a fee total is combined.
- **Known limitations:** KL-PRICE-003, KL-PRICE-004, KL-PRICE-005, KL-PRICE-011 (security).
- **Source references:** `fee-support.tsx`; `create-fee-support.tsx` (`submit`); `feeSupportService.ts` (`FeeSupportInput`); `zapzone-backend@ae877e2:app/Http/Controllers/Api/FeeSupportController.php` (`store`, `update`, `getForEntity`).

---

## Shared pricing calculation services

- **Purpose:** One place for the fee and special-pricing quotes that booking and purchase screens (attraction/event purchases, create/manual booking, ticket orders) use, plus package price and add-on quantity helpers.
- **Implementation status:** Implemented · **Verification:** Test-backed for pure helpers (files below); network/hook behaviour Source-verified only.
- **Routes / screens:** No own route. Consumers (verified by import): `src/app/attractions/create-purchase.tsx`, `edit-purchase.tsx`, `purchase-page.tsx`; `src/app/events/create-purchase.tsx`, `edit-purchase.tsx`; `src/app/bookings/create-booking.tsx`, `manual-booking.tsx`, `edit-booking.tsx`; `src/services/ticketOrdersService.ts`; `src/components/pricing/SpecialPricingNotes.tsx`.
- **Roles:** Whatever the consuming screen allows. `GET /api/special-pricings/for-entity`, `/deals`, `GET /api/fee-supports/for-entity` are public routes (`routes/api.php` L236–240).
- **Location scoping:** Callers pass `location_id`; otherwise the server derives it from the entity (`SpecialPricingController::getForEntity` → `entityLocationId`).
- **Main workflows & operations**
  - `fetchFeeBreakdown` → `GET /api/fee-supports/for-entity?entity_type&entity_id&base_price[&location_id]`; returns `null` when there is no usable `total`.
  - `fetchSpecialPricing` → `GET /api/special-pricings/for-entity?...&base_price=<one unit>&quantity=<units>&date=<visit Y-m-d>&time`; throws on failure so callers can distinguish "no special" from "could not check".
  - `fetchSpecialDeals` → `GET /api/special-pricings/deals` (which visit days have specials) via `useSpecialDeals`.
  - `quotePurchaseSpecial` → `POST /api/attraction-purchases/{id}/special-quote` or `/api/event-purchases/{id}/special-quote` via `useSpecialRepricing` (300 ms debounce) on purchase edits.
  - `useOnsitePricing`: base = unit price × qty + add-ons − manual discount (clamped), then fee lookup and special lookup (500 ms debounce), exposing `specialChecking`/`specialCheckFailed` for the payment gate.
  - `resolveFreshPricing`: submit-time re-fetch of both quotes; `combineFreshPricing` combines them.
  - `buildAppliedFees` / `buildAppliedDiscounts` / `mapSavedDiscount` build the persisted `applied_fees` / `applied_discounts` (with per-unit fields).
  - `packagePriceForParticipants`, `packageSpecialQuantity`, `clampAddOnQuantity`, `seedForcedAddOns`.
- **Data sources:** As above.
- **Validation & business rules:** BR-PRICE-001 … BR-PRICE-004, BR-PKG-010, BR-ADDON-002, BR-GIFT-003, BR-FEE-002.
- **Web Admin counterpart:** Code comments cite web `utils/fees.ts`, `utils/discounts.ts`, `OnsitePurchaseEvent.tsx`, `PurchaseAttraction.tsx` — **Not assessed** (web files not opened).
- **Shared components & utilities:** `SpecialPricingNotes` (notices), `venueNow` (venue clock).
- **Loading / empty / error / refresh:** Hook-level: pending and failed states drive "payment paused" messaging (`SPECIAL_CHECK_FAILED`, `specialPaymentBlocker`).
- **Platform-specific behaviour:** None found.
- **Tests:** `src/lib/pricing/specialPricing.test.ts` (venue day/clock, `specialVisit`, payment gate, quantity, breakdown normalization, labels, deal wording, edit swap, repricing notice, sold ticket price, older-server fallback); `src/lib/pricing/combineFreshPricing.test.ts`; `src/lib/packages/packagePricing.test.ts`; `src/lib/addOnQuantity.test.ts`; `src/lib/giftCards/checkoutGiftCard.test.ts`.
- **Known limitations:** KL-PRICE-007 (server enforcement of charged totals not assessed here).
- **Source references:** `src/services/pricingService.ts`; `src/lib/pricing/specialPricing.ts`; `src/lib/pricing/combineFreshPricing.ts`; `src/lib/hooks/useOnsitePricing.ts`, `useSpecialRepricing.ts`, `useSpecialDeals.ts`; `src/lib/packages/packagePricing.ts`; `src/lib/addOnQuantity.ts`; `src/services/discountCodesService.ts`; `zapzone-backend@ae877e2:app/Http/Controllers/Api/SpecialPricingController.php` (`getForEntity`, `deals`).

---

## Known limitations referenced in this file

Full entries live in [Known limitations](../KNOWN_LIMITATIONS.md). One-line summaries:

| ID | Summary |
|---|---|
| KL-PKG-001 | Add-on image is sent as an array; backend requires a string → save with a new image is rejected |
| KL-PKG-002 | Bulk promo generation sends the wrong field names → backend 422 |
| KL-PKG-003 | Package create/edit send `display_order: null` into a NOT NULL column |
| KL-PKG-004 | Edit Package cannot clear all availability schedules |
| KL-PKG-005 | Schedule interval >240 min passes mobile checks, fails server → "Partly saved" |
| KL-PKG-006 | Promo/gift-card links in package payloads are ignored by the server |
| KL-PKG-007 | Manage Packages filters the active location by name, not id |
| KL-PKG-008 | Delete dialogs say "cannot be undone" but deletes are soft; no restore on mobile |
| KL-PKG-009 | Reorder, bulk min-notice and Deleted Packages are web-only |
| KL-PKG-010 | Duplicate does not copy schedules or the escape-room flag |
| KL-PKG-011 | `create-custom-packages.tsx` is an unused placeholder route |
| KL-PKG-012 | Add-on form lacks per-package pricing for forced add-ons and allows a blank price |
| KL-PKG-013 | Add-on import (web) not on mobile |
| KL-PKG-014 | Space list never requests unavailable spaces |
| KL-PKG-015 | Area-group turnaround is per-room PUTs; no bulk space delete |
| KL-PKG-016 | Gift cards: no edit/deactivate/reactivate; Balance field ignored by server |
| KL-PKG-017 | Gift-card sale has no checkout key; amount bounds hard-coded |
| KL-PKG-018 | Promo batch list mis-maps id/used count; no batch actions |
| KL-PKG-019 | Promo edit rejects same-day start/end; server allows it |
| KL-PKG-020 | Global notes display order not editable |
| KL-PKG-021 | Security: global notes not tenant-scoped |
| KL-PKG-022 | Security: gift-card delete/create/list scoping gaps |
| KL-PKG-023 | Security: promo record writes and batch list not tenant-scoped |
| KL-PKG-024 | Security: `GET /api/mobile/packages` lacks `staff` middleware |
| KL-PRICE-001 | Special pricing create omits required `company_id` |
| KL-PRICE-002 | No one-time date or monthly day picker for special pricing |
| KL-PRICE-003 | Fee support create omits required `company_id` |
| KL-PRICE-004 | Special pricing / fee lists load only the first 100 rows |
| KL-PRICE-005 | Pricing forms and bottom sheets lack keyboard avoidance (iOS) |
| KL-PRICE-006 | No bulk delete for special pricing |
| KL-PRICE-007 | Server enforcement of staff-side charged totals not assessed |
| KL-PRICE-008 | Special-pricing cache key not user-scoped |
| KL-PRICE-010 | Security: special pricing writes not tenant-scoped |
| KL-PRICE-011 | Security: fee support writes not tenant-scoped |
