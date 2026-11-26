# ZapZone Mobile — Business Rules Register

> **Purpose:** Index of the documented business rules (`BR-*`): where each domain's rules live, how enforcement is
> classified, and where Mobile, Web Admin and Backend disagree.
> **Status:** Baseline (descriptive). Rules record **observed behaviour**, not owner-approved requirements.
> **Last reviewed:** 2026-11-26
> **Inspected revisions:** Mobile `973d281`; Web Admin `zappoint@5de9d9e`; Backend `zapzone-backend@ae877e2` (cited
> sections only)
> **Scope & limitations:** Static inspection only. "Backend (server-enforced)" is claimed only where Backend code was
> read. Per-controller scoping was not assessed everywhere.
> **Related:** [Index](README.md) · [Feature catalog](FEATURE_CATALOG.md) · [Known limitations](KNOWN_LIMITATIONS.md) ·
> [Architecture](ARCHITECTURE.md)

## How to use this register

- Before changing behaviour in a module, read its domain file below and cite the affected `BR-*` IDs in the change or
  SDD spec.
- **A rule here is not automatically correct.** Several rules document gaps between client and server. Those are
  cross-referenced to `KL-*` items and listed under [discrepancies](#cross-repository-discrepancies-requiring-decisions).
- IDs are stable. Never renumber or reuse one; mark a rule *Superseded* with a date and a pointer instead.

## Entry format

Every rule in the domain files records:
- **Rule**
- **Workflow**
- **Enforcement layer**
- **Evidence**: Mobile path and symbol; Backend or Web Admin `repo@sha:path` and symbol where verified.
- **Exceptions**
- **Verification**
- **Open questions**

## Enforcement layers

| Layer | Meaning |
|---|---|
| **Backend (server-enforced)** | Validated or authorised by Backend code that was read: controller, middleware, form request or service. |
| **Mobile client logic** | Computed or validated in Mobile code (usually a pure `src/lib` helper). Can be bypassed by other clients. |
| **Mobile UI-only** | Visibility or disabling in the UI only. **This is not authorisation.** |
| **Web Admin reference behaviour** | What Web Admin does. It is the reference for intent, not proof of enforcement. |
| **Not determined** | The enforcing layer could not be established. |

## Domain files

| Domain | ID prefixes | Rules | File |
|---|---|---|---|
| Core platform: authentication, session, roles, location, API behaviour | `BR-AUTH` (6), `BR-SESSION` (5), `BR-ROLE` (3), `BR-LOCATION` (4), `BR-API` (5) | 23 | [business-rules/core-platform-rules.md](business-rules/core-platform-rules.md) |
| Bookings, availability, calendars | `BR-BOOKING` (19), `BR-AVAIL` (5), `BR-CAL` (5) | 29 | [business-rules/bookings-and-scheduling.md](business-rules/bookings-and-scheduling.md) |
| Attractions, purchases, events, registration, check-in | `BR-ATTR` (5), `BR-PURCH` (13), `BR-EVENT` (6), `BR-REG` (6), `BR-CHECKIN` (9) | 39 | [business-rules/attractions-events-and-checkin.md](business-rules/attractions-events-and-checkin.md) |
| Packages, add-ons, spaces, gift cards, promos, pricing, fees | `BR-PKG` (14), `BR-ADDON` (3), `BR-SPACE` (3), `BR-GIFT` (4), `BR-PROMO` (4), `BR-PRICE` (6), `BR-FEE` (2) | 36 | [business-rules/packages-and-pricing.md](business-rules/packages-and-pricing.md) |
| Customers, waivers, memberships | `BR-CUST` (10), `BR-WAIVER` (15), `BR-MEMBER` (8) | 33 | [business-rules/customers-waivers-and-memberships.md](business-rules/customers-waivers-and-memberships.md) |
| Photos, escape rooms, email, SMS, notifications, custom fields | `BR-PHOTO` (14), `BR-ESCAPE` (7), `BR-EMAIL` (8), `BR-SMS` (3), `BR-NOTIF` (4), `BR-FIELD` (2) | 38 | [business-rules/photos-communications-and-notifications.md](business-rules/photos-communications-and-notifications.md) |
| Dashboard, profile, staff, analytics, payments, app update | `BR-DASH` (7), `BR-PROFILE` (4), `BR-STAFF` (9), `BR-ANALYTICS` (5), `BR-PAYMENT` (9), `BR-UPDATE` (5) | 39 | [business-rules/dashboard-administration-analytics-and-payments.md](business-rules/dashboard-administration-analytics-and-payments.md) |
| **Total** | | **237** | |

## Foundational rules most specifications will touch

| Rule | Summary | Enforcement |
|---|---|---|
| BR-AUTH-001 | Only staff users can sign in | Backend |
| BR-ROLE-001 | Authorisation is server-side; Mobile role checks are UI gating | Backend where middleware applied; Mobile UI-only |
| BR-LOCATION-001 / -002 / -003 | Managers and attendants are scoped to their location; managers switch only to assigned locations (token-held); company admins use a client-side workspace location | Backend mechanism plus Mobile client logic |
| BR-SESSION-001 / -002 | Sliding inactivity window; one teardown per 401 storm; 403 is not a logout | Mobile client logic |
| BR-API-002 / -003 | A 422 `change_reason` prompts and retries once; a 409 `BLOCKED_PERIOD` asks for confirmation and resends with acknowledgement | Backend plus Mobile client logic |
| BR-BOOKING-013, BR-PURCH-004, BR-PAYMENT-004 | One checkout idempotency key per sale (`checkout_key`) | Backend plus Mobile client logic |
| BR-PAYMENT-001 | Card data goes device → Authorize.Net only; the Backend receives an opaque nonce | Mobile client logic (device check needed) |
| BR-BOOKING-014, BR-PURCH-006, BR-PRICE-002 | Staff-side totals are computed in the client; server total enforcement depends on configuration | Mobile client logic; Backend config-dependent |
| BR-PRICE-001 | Special pricing follows the visit date | Mobile client logic |
| BR-WAIVER-010 / -011 | Kiosk signing requirements and kiosk launch | Backend plus Mobile client logic |

## Cross-repository discrepancies requiring decisions

Recorded, **not resolved**. Each needs an owner or product decision, or a separate fix. Details are in the linked
rule or `KL-*` item.

| Area | Mobile | Web Admin | Backend | Refs |
|---|---|---|---|---|
| Booking check-in eligibility | Three different gates (table: paid; More sheet: paid + confirmed; quick view: confirmed) | Table gate: paid | `/check-in`: confirmed only; `/status` allows any transition | BR-BOOKING-001–003, KL-BOOK-001/003 |
| Location-change request review | Shown to destination staff | Same as Mobile | Company admin only | BR-BOOKING-018, KL-BOOK-012 |
| Attraction and event "checked in" via status update | Bulk status bypasses check-in guards and audit | Same pattern | Generic update endpoints allow it | KL-ATTR-001, KL-EVENT-003 |
| Waiver admin-delete setting | UI gate | UI gate | Not enforced | BR-WAIVER-002, KL-WAIVER-003 |
| Waiver records location filter | Client-side, current page only | Sends `location_id` | Supports `location_id` | KL-WAIVER-001 |
| Waiver check-in and template force-delete roles | Stricter than server | — | More permissive | KL-WAIVER-008/012 |
| Membership actions | No UI gates | — | Role checks in controller; `admin` excluded from some actions | KL-MEMBER-001/006 |
| Company profile editing | Form shown to all roles | Company admin only | Admin and manager | BR-PROFILE-004, KL-ADMIN-005 |
| Override PIN length | 4–6 digits | — | Exact configured length | KL-ADMIN-006 |
| `admin` role | Not modelled in types, navigation or several role lists | Hidden in several modules | Allowed by several routes | KL-ARCH-004, KL-PHOTO-011, KL-EVENT-008 |
| Payload contracts | Special pricing and fee create omit `company_id`; add-on image sent as an array; bulk promo keys; `display_order: null` | Sends `company_id \|\| 1` | Rejects (static reading) | KL-PRICE-001/003, KL-PKG-001–003 |
| Notification "purchases" filter | `type=payment` | `type==='purchase'` (client-side) | Knows `payment`, not `purchase` | KL-NOTIF-005 |
| Manual Booking flexible flags | Sends `skip_date_validation` and `is_manual_entry` | — | Never read | BR-BOOKING-016, KL-BOOK-011 |

## Unresolved product questions surfaced by the rules

1. **Check-in policy:** should a balance due block check-in? Which check-in gate is intended (KL-BOOK-001,
   KL-EVENT-004, KL-CHECKIN-001)?
2. **Server enforcement of staff totals:** what is the deployed `CheckoutTotalGuard` configuration (KL-BOOK-017,
   KL-ATTR-007)?
3. **Role model:** is the `admin` role in use? Should attendants see management modules such as Memberships,
   Custom Fields and Payments restore?
4. **Waiver kiosk:** must it honour the inactivity timeout and lock-down settings on Mobile (KL-WAIVER-006/007)?
5. **Inactivity lock:** what TTL is intended, and should re-entry need a password (KL-SEC-001/002)?
6. **Client-side CSV exports of PII:** should they follow server export permissions (KL-WAIVER-002)?
