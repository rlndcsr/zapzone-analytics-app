import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";

export type NavMenuItem = {
  key: string;
  label: string;
  icon: ComponentProps<typeof Feather>["name"];
  /** Destination route; items without one just close the menu (not yet wired). */
  route?: string;
};

export const NAV_MENU_ITEMS: NavMenuItem[] = [
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
  { key: "management", label: "User Management", icon: "user", route: "/management/management" },
  { key: "analytics", label: "Analytics & Reports", icon: "bar-chart-2", route: "/analytics-reports/performance-analytics" },
];
