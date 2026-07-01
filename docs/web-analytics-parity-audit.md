# Web Admin Analytics → Mobile Parity Audit

_Comparison of every analytics/metrics surface in the **Zappoint** web admin against the
**zapzone-analytics-app** mobile app. Goal: reach feature parity before mobile is "done"._

Legend: ✅ present in mobile · ⚠️ data already reaches the app but is **not displayed** · ❌ missing from mobile

The mobile app currently consumes only three data sources:
1. `GET /api/metrics/dashboard/{userId}` — powers Home cards + Location screen (`locationStats`)
2. `GET /api/bookings` (page-all + client filter) — powers the Calendar screen
3. `GET /api/notifications` — notifications list (not analytics)

Everything the web admin renders from `/analytics/*`, `/accounting-analytics/*`, `/page-analytics/*`,
`/customers/analytics`, `/membership-reports/*`, and `/payments` is **absent** on mobile.

---

## Dashboard (web: CompanyDashboard / ManagerDashboard / AttendantDashboard)

Endpoint: `GET /metrics/dashboard/{userId}` — same endpoint the mobile app uses.
Filters: `timeframe` (today/last_24h/last_7d/last_30d/all_time/custom), `date_from`, `date_to`, `location_id`, `timezone`.

- ✅ **Packages / Total Bookings** — `totalBookings` (+ `confirmedBookings`), `packageBreakdown`
- ✅ **Party Participants** — `totalParticipants`, `participantBreakdown`
- ✅ **Attractions Sold / Tickets Sold** — `totalPurchases`, `attractionBreakdown`
- ✅ **Events Sold** — `totalEventPurchases` (+ `totalEventTickets`), `eventBreakdown`
- ✅ **Memberships / New Members** — `newMemberships`, `membershipBreakdown`
- ✅ **Unique Customers** — `totalCustomers` (+ `newCustomers`), `customerBreakdown`
- ✅ **Confirmed Bookings** — `confirmedBookings`, `confirmedBreakdown`
- ⚠️ **Total Revenue** — `totalRevenue` is in the payload but **no mobile card renders it** (web Manager/Attendant dashboards show it prominently)
- ⚠️ **Avg Booking value** — web ManagerDashboard shows `bookingRevenue / totalBookings`; derivable on mobile from existing payload, not shown
- ⚠️ **Pending / Completed / Cancelled / Checked-in Bookings** — `pendingBookings`, `completedBookings`, `cancelledBookings`, `checkedInBookings` all in payload; mobile only surfaces confirmed
- ⚠️ **Returning Customers** — `returningCustomers` in payload, not shown
- ⚠️ **Active / Total Memberships** — `activeMemberships`, `totalMemberships` in payload, not shown
- ❌ **New Bookings feed** (web Manager/Attendant: recent bookings table)
- ❌ **Recent Ticket Purchases feed** (web Manager: attraction purchases table)
- ❌ **Recent Event Purchases feed** (web Manager/Attendant)
- ❌ **Pending Approvals card** (web Attendant dashboard — `pendingBookings` highlighted)
- ❌ **Attendant-scoped metrics** — `GET /metrics/attendant` (`location_id`, `timeframe`, `date_from/to`)

## Locations (web: CompanyDashboard location stats / CompanyAnalytics)

Source: `locationStats` block of the dashboard endpoint (mobile) + `GET /analytics/company` (web).

- ✅ **Top Performing Locations** — ranked by revenue (mobile "Top Performers")
- ✅ **Per-location: Bookings / Tickets / Events / Guests / Revenue** — `bookings`, `purchases`, `eventPurchases`, `participants`, `revenue`
- ✅ **Utilization %** — `utilization` (mobile color-codes it)
- ⚠️ **Revenue split per location** — `bookingRevenue`, `purchaseRevenue`, `eventPurchaseRevenue` in payload, not shown
- ❌ **Location Performance bar chart** (web CompanyAnalytics — revenue by location, Recharts)
- ❌ **Top Locations by Revenue table** with package-booking counts (`GET /analytics/company`)

## Company Analytics (web: `/admin/analytics`, `GET /analytics/company`)

Filters: `company_id`, `date_range` (7d/30d/90d/1y/custom), `location_ids[]`, `start_date`, `end_date`. Export: `POST /analytics/company/export`.

- ❌ **Total Revenue KPI** with period-over-period % change + trend
- ❌ **Total Locations / Active Packages / Active Events** KPI cards
- ❌ **Package Bookings / Ticket Purchases / Participants** KPIs with % change
- ❌ **Revenue & Package Bookings** dual-axis line chart (`revenue_trend`)
- ❌ **Location Performance** bar chart (`location_performance`)
- ❌ **Package Distribution** pie chart (`package_distribution`)
- ❌ **Peak Activity Hours** bar chart (`peak_hours`)
- ❌ **Daily Performance (7d)** area chart (`daily_performance`)
- ❌ **Booking Status** pie chart (`booking_status`)
- ❌ **Top Locations / Top Attractions / Top Events** tables
- ❌ **Export (JSON/CSV)**

## Location Manager Analytics (web: `/manager/analytics`, `GET /analytics/location`)

Filters: `location_id`, `date_range`, `start_date`, `end_date`. Export: `POST /analytics/location/export`.

- ❌ **Location Revenue / Package Bookings / Ticket Sales / Total Visitors** KPIs with trend
- ❌ **Active Packages / Active Attractions / Active Events** KPIs
- ❌ **Hourly Revenue Pattern** line chart (`hourly_revenue`)
- ❌ **Daily Performance** area chart (`daily_revenue`)
- ❌ **Package Bookings** bar chart (`package_performance`)
- ❌ **Attraction Ticket Sales** horizontal bar (`attraction_performance`, incl. utilization/capacity)
- ❌ **5-Week Trend** line chart (`weekly_trend`)
- ❌ **Time Slot Performance** bar chart (`time_slot_performance`)
- ❌ **Package / Attraction / Event performance tables**

## Accounting & Sales Analytics (web: `/admin/accounting`, `GET /accounting-analytics/report`)

Filters: `location_id`, `start_date`, `end_date`, `compare_start_date/end_date`, `view_mode` (booked_on/booked_for), `payment_status`, `category_filter`. Export: `GET /accounting-analytics/export`.

- ❌ **Qty Sold / Gross Sales / Discounts / Net Sales** KPIs
- ❌ **Fees / Tax / Total Billed / Collected** KPIs
- ❌ **Authorize Payment / Gateway Net** KPIs
- ❌ **Period-over-period comparison** (change % per metric)
- ❌ **Sales by Category** expandable tables (Parties / Attractions / Events / Add-ons) with item-level gross/discount/net/fees/tax/collected/balance-due
- ❌ **Booked-For vs Created-On** view toggle
- ❌ **CSV export**

## Page / Web Analytics (web: `/admin/analytics/pages`, `GET /page-analytics/*`)

Filters: `from`, `to`, `location_id`, `entity_type`, `sort_by`. ~13 endpoints.

- ❌ **Live visitors** card (`/page-analytics/live`, 15s poll)
- ❌ **Page views / Unique visitors / Sessions / Conversions** KPIs (`/overview`)
- ❌ **Conv. rate / Revenue / Bounce rate / Avg duration** KPIs
- ❌ **New vs Returning visitors**
- ❌ **Traffic & Conversions** area chart (`/timeseries`)
- ❌ **Top Pages** table (`/top-pages`)
- ❌ **Top Entities leaderboard** + drill-down modal (`/entities-leaderboard`, `/entities/{type}/{id}`)
- ❌ **Conversion Funnel** (`/funnel`)
- ❌ **Devices / Browsers / OS** (`/devices`)
- ❌ **Traffic Sources / UTM / Referrers** (`/sources`)
- ❌ **Top Landing Pages** (`/landing-pages`)
- ❌ **Promo Performance** (`/promo-performance`)
- ❌ **Search Queries** (`/searches`)
- ❌ **Attribution** first/last touch (`/attribution`)
- ❌ **Recent Conversions** paginated (`/conversions`)

## Customer Analytics (web: `/customers/analytics`, `GET /customers/analytics`)

Filters: `date_range`, `start_date`, `end_date`, `location_id`, `user_id`. Export: `POST /customers/analytics/export`.

- ⚠️ **Total Customers / New Customers** — mobile shows these on the Dashboard "Unique Customers" card, but NOT the dedicated analytics view
- ❌ **Active Customers / Repeat Rate / Avg Revenue per Customer** KPIs
- ❌ **Booking Time Distribution** bar chart
- ❌ **Customer Growth** area chart (9-month)
- ❌ **Revenue & Bookings Trend** line chart
- ❌ **Bookings per Customer** bar chart
- ❌ **Customer Status Distribution** pie chart
- ❌ **Customer Activity by Hour** bar chart
- ❌ **Customer Lifetime Value segments** pie chart
- ❌ **Repeat Customer Rate** trend line
- ❌ **Top Activities / Top Packages / Top Events per customer** tables
- ❌ **Recent Customers** table
- ❌ **Customers list summary** — Total/Active/Inactive/Recently-added (`/contacts/statistics`)

## Membership Analytics (web: `/memberships/reports`, `GET /membership-reports/summary`)

Filters: `from`, `to`, `location_id`.

- ⚠️ **New memberships** — mobile Dashboard shows `newMemberships`, but not the reports view
- ❌ **Active / Past Due / Suspended / Frozen** counts
- ❌ **New / Canceled in range** counts
- ❌ **MRR (Monthly Recurring Revenue)**
- ❌ **ARR (Annual Recurring Revenue)**
- ❌ **Top Plans** by active member count
- ❌ **Visits by Location**
- ❌ **Revenue in range + failed payment count**
- ❌ **Underused Memberships** (retention candidates)
- ❌ **Memberships list summary** — Total/Active/Past Due/Frozen (`/memberships`)

## Payments / Revenue (web: `/admin/payments`, `GET /payments`)

Filters: `location_id`, `status`, `method`, `payable_type`, `dateRange`, `start_date`, `end_date`.

- ❌ **Total Payments** (count + revenue)
- ❌ **Completed** (count + collected)
- ❌ **Pending** (count + awaiting)
- ❌ **Refunded / Voided** (count + returned)
- ❌ Breakdown by **status / method / payable type**

## Bookings / Events / Attractions list summaries (web)

Mobile has the **Calendar** (✅ bookings by day/status) but none of the list-page KPI tiles:

- ❌ **Bookings**: Total / Package / Participants / Revenue / Possible Revenue (`GET /bookings`)
- ❌ **Events**: Total / Active / Avg Price / Date-range count (`GET /events`)
- ❌ **Event Purchases**: Total / Revenue / Avg Purchase / Unique Customers (`GET /event-purchases`)
- ❌ **Attractions**: Total / Active / Avg Price / Total Capacity (`GET /attractions`)
- ❌ **Attraction Purchases**: Total / Revenue / Avg Purchase / Unique Customers (`GET /attractions/purchases`)

## Operations / Staff analytics (web)

- ❌ **Attendant Activity Logs**: Total / Today's / Purchases / Active Attendants (`GET /activity-logs`)
- ❌ **Manage Attendants**: Total / Active / New (30d) / Departments (`GET /users?role=attendant`)

---

## Missing Analytics for Mobile App (summary)

**Tier 1 — quick wins (data already in the dashboard payload, no new endpoint):**
- Total Revenue card, Avg Booking value
- Full booking-status split: Pending, Completed, Cancelled, Checked-in
- Returning Customers; Active/Total Memberships
- Per-location revenue split (booking/purchase/event)

**Tier 2 — whole analytics screens absent (new endpoints, already exist server-side):**
- Company Analytics (`/analytics/company`) — trends, charts, top tables, export
- Location Manager Analytics (`/analytics/location`)
- Accounting & Sales (`/accounting-analytics/report`) — gross/net/tax/fees/collected + category breakdown + comparison
- Customer Analytics (`/customers/analytics`) — CLV, repeat rate, growth, cohorts
- Membership Reports (`/membership-reports/summary`) — MRR/ARR, churn, underused
- Payments/Revenue (`/payments`) — status & method breakdown

**Tier 3 — advanced / lower priority for mobile:**
- Page/Web Analytics (`/page-analytics/*`) — ~13 endpoints (live visitors, funnels, attribution, devices, sources)
- Operational list-page KPI tiles (Bookings/Events/Attractions summaries)
- Staff analytics (activity logs, attendant management)

**Charts to note:** web uses **Recharts** throughout (Line/Area/Bar/Pie). Mobile has no charting
library yet — Tier 2/3 parity needs one (e.g. `victory-native`, `react-native-gifted-charts`, or Skia).
