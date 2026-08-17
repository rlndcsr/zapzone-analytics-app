import {
  Activity,
  Building,
  Calendar,
  Plus,
  type LucideIcon,
} from "lucide-react-native";

/**
 * One shortcut in the menu's Quick Actions section.
 *
 * Drawn from the web admin dashboard's `quickActions` array — same order, same
 * labels, same lucide glyphs — each pointed at this app's screen for that
 * destination. lucide is a Feather fork, so these sit next to the Quick
 * Navigation items' Feather icons without a visible weight change.
 *
 * Attractions, Packages, Customers and Analytics are deliberately left out:
 * Quick Navigation below already covers those four modules.
 */
export type QuickActionItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  route: string;
  /** `navigate` for a tab route, `push` for anything stacked above (tabs). */
  mode?: "push" | "navigate";
};

export const QUICK_ACTION_ITEMS: QuickActionItem[] = [
  {
    key: "new-booking",
    label: "New Booking",
    icon: Plus,
    route: "/bookings/create-booking",
  },
  {
    key: "calendar",
    label: "Calendar",
    icon: Calendar,
    route: "/bookings/calendar",
  },
  {
    key: "check-in",
    label: "Check-in",
    icon: Activity,
    route: "/bookings/check-in",
  },
  // The web's "Locations" tile opens the location activity log (/admin/activity),
  // so this points at the same report rather than the Locations tab.
  {
    key: "locations",
    label: "Locations",
    icon: Building,
    route: "/user-managements/activity-logs",
  },
];
