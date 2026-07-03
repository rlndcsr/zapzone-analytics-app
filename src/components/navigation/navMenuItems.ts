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
  { key: "dashboard", label: "Dashboard", icon: "grid" },
  { key: "customers", label: "Customers", icon: "users" },
  { key: "locations", label: "Locations", icon: "map-pin" },
  { key: "revenue", label: "Revenue", icon: "dollar-sign" },
  { key: "reports", label: "Reports", icon: "file-text" },
  { key: "memberships", label: "Memberships", icon: "award" },
  { key: "notifications", label: "Notifications", icon: "bell" },
  { key: "analytics", label: "Analytics", icon: "bar-chart-2" },
  { key: "settings", label: "Settings", icon: "settings" },
];
