# Mobile App Overview

> The primary onboarding document for the **Zap Zone Analytics** mobile app — a React Native
> (Expo) companion to the existing admin analytics dashboard. For the systems it depends on,
> see [FRONTEND_OVERVIEW.md](reference/FRONTEND_OVERVIEW.md) and
> [BACKEND_OVERVIEW.md](reference/BACKEND_OVERVIEW.md). This document does not repeat them.

## Purpose

Zap Zone is a multi-location family entertainment venue platform (laser tag, arcade, party
rooms, attractions) operated under a Company → Location tenancy model. The web admin
dashboard already exposes rich analytics and reporting, but it assumes a desk and a laptop.

The mobile app exists to put that performance visibility **in the pocket of the people who
run the venues**. Owners and managers need to check revenue, bookings, and venue utilization
between meetings, on the floor, or away from the office — without opening the full admin SPA.
The app is a focused, read-first window into the numbers that already power the web
dashboards.

## Project Scope

**Included**
- Viewing business analytics (revenue, bookings, utilization) by company and location.
- Accounting / financial reports (gross & net, fees, taxes, discounts, balance due).
- Web/page analytics (traffic, conversions, funnels, top entities).
- Role-based KPI dashboards and operational metrics.
- Filtering and scoping by location and date range; sharing/exporting a report where practical.

**Excluded** (these remain in the web app and are intentionally out of scope)
- Bookings, attraction/event purchases, and check-in flows.
- Payments, refunds, and voids.
- Catalog, membership, promo, gift-card, and email/marketing management.
- All customer-facing flows (booking, RSVP, membership self-service).

The mobile app is a **reporting client**, not an operations tool. It reads data; it does not
mutate venue records.

## Target Users

- **Company Admins** — company-wide performance across all locations.
- **Location Managers** — performance for the location(s) they manage.

Analytics is a manager/admin capability in the existing system, so **attendants** and
**customers** are not target users of this app.

## Relationship to Existing Systems

- **Booking Website** — No functional overlap. The booking site serves customers and guests;
  this app serves staff. They share a backend but not an audience.
- **Admin Dashboard** — The mobile app **mirrors the analytics and reporting views** of the
  web admin dashboard in a mobile-optimized, read-first form. It is a companion, not a
  replacement: management and configuration stay on the web.
- **Existing Backend API** — The Laravel REST API is the app's **single source of truth**.
  The app consumes existing analytics, accounting, page-analytics, and metrics endpoints
  (plus the backend's purpose-built `mobile/*` endpoints). **No new backend functionality is
  required** for this project; role and location scoping continue to be enforced server-side.

## Core Features

- **Business analytics** — revenue, booking volume, and utilization trends, scoped by company
  or location.
- **Accounting reports** — financial reconciliation: gross/net totals, fees, taxes, discounts,
  balance due, and gateway-collected amounts.
- **Page / web analytics** — site traffic, conversions, funnels, traffic sources, devices, and
  entity leaderboards.
- **Role KPI dashboards** — at-a-glance operational metrics tailored to the signed-in role.
- **Scoping controls** — location selection and date-range filtering across reports.

Features are described as capabilities here; the underlying endpoints are documented in the
backend overview.

## High-Level User Flow

1. **Sign in** with staff credentials (company admin or location manager).
2. Land on a **role-scoped dashboard** summarizing key metrics.
3. **Drill into** a report area (business, accounting, or page analytics).
4. **Filter** by location and date range to focus the view.
5. **Read, compare, and share** the resulting figures.

Sign-out clears the session and stored token.

## Technical Overview

- **React Native + Expo** — Built on Expo (SDK 55) with `expo-router` for file-based
  navigation, React Native 0.83 / React 19, NativeWind for Tailwind-style styling, and
  React Navigation bottom tabs. TypeScript throughout. Always consult the versioned Expo docs
  (https://docs.expo.dev/versions/v55.0.0/) before adding native or Expo APIs.
- **Existing backend integration** — Talks to the same Laravel REST API as the web frontend
  over HTTPS/JSON, favoring the backend's `mobile/*` and analytics/reporting endpoints. The
  app introduces no server-side changes.
- **Authentication** — Reuses the staff login flow (`POST /login`), which returns a Laravel
  **Sanctum** bearer token. The token is sent as an `Authorization: Bearer` header and kept in
  secure device storage; customer logins are rejected by the backend.
- **Analytics data consumption** — Read-first: the app issues authenticated GET requests and
  renders the standard JSON response envelopes. All authorization and company/location scoping
  are enforced by the backend, so the app trusts the server to return only permitted data.

## Development Objectives

1. **Parity with web analytics** — surface the same reporting insights managers rely on, adapted
   for mobile.
2. **Mobile-first UX** — fast, legible dashboards and charts suited to small screens and
   on-the-go use.
3. **Reuse existing APIs** — deliver value with **zero backend changes**, consuming current
   endpoints only.
4. **Secure authentication** — robust Sanctum token handling and secure storage.
5. **Maintainable Expo codebase** — typed, conventional, and aligned with the documented Expo
   SDK 55 / expo-router patterns.
