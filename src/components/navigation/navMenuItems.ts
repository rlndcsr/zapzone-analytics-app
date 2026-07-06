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
  { key: "packages", label: "Packages", icon: "package" },
  { key: "pricing", label: "Pricing", icon: "dollar-sign" },
  { key: "waivers", label: "Waivers", icon: "map-pin" },
  { key: "customers", label: "Customers", icon: "users" },
  { key: "memberships", label: "Memberships", icon: "credit-card" },
  { key: "email", label: "Email Campaign", icon: "mail" },
  { key: "payments", label: "Payments", icon: "dollar-sign" },
  { key: "management", label: "User Management", icon: "users" },
  { key: "analytics", label: "Analytics & Reports", icon: "bar-chart-2" },
];
