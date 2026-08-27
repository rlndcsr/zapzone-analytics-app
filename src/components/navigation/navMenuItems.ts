import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";

import type { UserRole } from "../../services/auth";

export type NavMenuItem = {
  key: string;
  label: string;
  icon: ComponentProps<typeof Feather>["name"];
  route?: string;

  mode?: "push" | "navigate";
};

const BASE_NAV_MENU_ITEMS: NavMenuItem[] = [
  {
    key: "home",
    label: "Home",
    icon: "home",
    route: "/home",
    mode: "navigate",
  },
  {
    key: "attractions",
    label: "Attractions",
    icon: "zap",
    route: "/attractions/attractions",
  },
  { key: "events", label: "Events", icon: "flag", route: "/events/events" },
  {
    key: "bookings",
    label: "Bookings",
    icon: "calendar",
    route: "/bookings/bookings",
  },
  {
    key: "packages",
    label: "Packages",
    icon: "package",
    route: "/packages/packages",
  },
  {
    key: "pricing",
    label: "Pricing",
    icon: "percent",
    route: "/pricing/pricing",
  },
  {
    // Between Pricing and Waivers, as in the web admin sidebar.
    key: "custom-fields",
    label: "Custom Fields",
    icon: "check-square",
    route: "/custom-fields/custom-fields",
  },
  {
    key: "waivers",
    label: "Waivers",
    icon: "file-text",
    route: "/waivers/waivers",
  },
  {
    key: "photos",
    label: "Photos",
    icon: "camera",
    route: "/photos/photos",
  },
  {
    key: "customers",
    label: "Customers",
    icon: "users",
    route: "/customers/customers",
  },
  {
    key: "memberships",
    label: "Memberships",
    icon: "credit-card",
    route: "/memberships/memberships",
  },
  {
    key: "email",
    label: "Email Campaign",
    icon: "mail",
    route: "/email-campaign/campaigns",
  },
  {
    key: "payments",
    label: "Payments",
    icon: "dollar-sign",
    route: "/payments/payments",
  },
  {
    key: "analytics",
    label: "Analytics & Reports",
    icon: "bar-chart-2",
    route: "/analytics-reports/performance-analytics",
  },
];

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
      return null;
  }
}

export function getNavMenuItems(
  role: UserRole | null | undefined,
): NavMenuItem[] {
  const management = managementItemForRole(role);
  if (!management) return BASE_NAV_MENU_ITEMS;

  const items = [...BASE_NAV_MENU_ITEMS];
  items.splice(items.length - 1, 0, management);
  return items;
}
