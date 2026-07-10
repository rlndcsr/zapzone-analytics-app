import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import type { UserRole } from "../../services/auth";

export type NavMenuItem = {
  key: string;
  label: string;
  icon: ComponentProps<typeof Feather>["name"];
  /** Destination route; items without one just close the menu (not yet wired). */
  route?: string;
};

// Modules every role sees in Quick Navigation, in display order. The
// role-scoped team/user administration entry is spliced in before Analytics
// by getNavMenuItems (see below).
const BASE_NAV_MENU_ITEMS: NavMenuItem[] = [
  { key: "attractions", label: "Attractions", icon: "zap", route: "/attractions/attractions" },
  { key: "events", label: "Events", icon: "flag", route: "/events/events" },
  { key: "bookings", label: "Bookings", icon: "calendar", route: "/bookings/bookings" },
  { key: "packages", label: "Packages", icon: "package", route: "/packages/packages" },
  { key: "pricing", label: "Pricing", icon: "percent", route: "/pricing/pricing" },
  { key: "waivers", label: "Waivers", icon: "file-text", route: "/waivers/waivers" },
  { key: "customers", label: "Customers", icon: "users", route: "/customers/customers" },
  { key: "memberships", label: "Memberships", icon: "credit-card", route: "/memberships/memberships" },
  { key: "email", label: "Email Campaign", icon: "mail", route: "/email-campaign/email-templates" },
  { key: "payments", label: "Payments", icon: "dollar-sign", route: "/payments/payments" },
  { key: "analytics", label: "Analytics & Reports", icon: "bar-chart-2", route: "/analytics-reports/performance-analytics" },
];

// The team/user administration entry is role-scoped, mirroring the Web Admin
// sidebar (AdminSidebar.tsx switch(role)): company_admin gets "User Management",
// location_manager gets "Attendants Management", and attendant sees neither.
// Both reuse the same icon and destination, differing only by label — exactly
// as the web sidebar reuses the UserCog icon for both entries.
const USER_MANAGEMENT_ITEM: NavMenuItem = {
  key: "management",
  label: "User Management",
  icon: "user",
  route: "/user-managements/manage-accounts",
};

const ATTENDANTS_MANAGEMENT_ITEM: NavMenuItem = {
  key: "management",
  label: "Attendants Management",
  icon: "user",
  route: "/user-managements/attendants",
};

function managementItemForRole(
  role: UserRole | null | undefined,
): NavMenuItem | null {
  switch (role) {
    case "company_admin":
      return USER_MANAGEMENT_ITEM;
    case "location_manager":
      return ATTENDANTS_MANAGEMENT_ITEM;
    default:
      // attendant (and unknown roles) see neither, matching the Web Admin.
      return null;
  }
}

/**
 * Resolves the Quick Navigation items for the authenticated user's role.
 * Follows the same role→config resolver pattern as getRoleTabs /
 * getDashboardConfig. The role-scoped management entry is inserted before the
 * trailing Analytics item to preserve the original ordering.
 */
export function getNavMenuItems(
  role: UserRole | null | undefined,
): NavMenuItem[] {
  const management = managementItemForRole(role);
  if (!management) return BASE_NAV_MENU_ITEMS;

  const items = [...BASE_NAV_MENU_ITEMS];
  items.splice(items.length - 1, 0, management);
  return items;
}
