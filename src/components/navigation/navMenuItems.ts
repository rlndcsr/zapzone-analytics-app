// The exact icons the web admin sidebar uses (AdminSidebar.tsx), under the same
// names — lucide-react-native still exports the older aliases (Home,
// CheckSquare, FileSignature, BarChart3) for the same glyphs.
import {
  BarChart3,
  Bell,
  Calendar,
  CalendarCheck,
  Camera,
  CheckSquare,
  CreditCard,
  FileSignature,
  Home,
  IdCard,
  Mail,
  Package,
  Percent,
  Settings,
  Ticket,
  User,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react-native";

import type { UserRole } from "../../services/auth";

export type NavMenuItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  route?: string;

  mode?: "push" | "navigate";
};

const BASE_NAV_MENU_ITEMS: NavMenuItem[] = [
  {
    key: "home",
    label: "Home",
    icon: Home,
    route: "/home",
    mode: "navigate",
  },
  {
    key: "attractions",
    label: "Attractions",
    icon: Ticket,
    route: "/attractions/attractions",
  },
  { key: "events", label: "Events", icon: CalendarCheck, route: "/events/events" },
  {
    key: "bookings",
    label: "Bookings",
    icon: Calendar,
    route: "/bookings/bookings",
  },
  {
    key: "packages",
    label: "Packages",
    icon: Package,
    route: "/packages/packages",
  },
  {
    key: "pricing",
    label: "Pricing",
    icon: Percent,
    route: "/pricing/pricing",
  },
  {
    // Between Pricing and Waivers, as in the web admin sidebar.
    key: "custom-fields",
    label: "Custom Fields",
    icon: CheckSquare,
    route: "/custom-fields/custom-fields",
  },
  {
    key: "waivers",
    label: "Waivers",
    icon: FileSignature,
    route: "/waivers/waivers",
  },
  {
    key: "photos",
    label: "Photos",
    icon: Camera,
    route: "/photos/photos",
  },
  {
    key: "customers",
    label: "Customers",
    icon: Users,
    route: "/customers/customers",
  },
  {
    key: "memberships",
    label: "Memberships",
    icon: IdCard,
    route: "/memberships/memberships",
  },
  {
    key: "email",
    label: "Email Campaign",
    icon: Mail,
    route: "/email-campaign/campaigns",
  },
  {
    key: "payments",
    label: "Payments",
    icon: CreditCard,
    route: "/payments/payments",
  },
  {
    key: "analytics",
    label: "Analytics & Reports",
    icon: BarChart3,
    route: "/analytics-reports/performance-analytics",
  },
];

const USER_MANAGEMENT_ITEM: NavMenuItem = {
  key: "management",
  label: "User Management",
  icon: UserCog,
  route: "/user-managements/manage-accounts",
};

const ATTENDANTS_MANAGEMENT_ITEM: NavMenuItem = {
  key: "management",
  label: "Attendants Management",
  icon: UserCog,
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

/**
 * The menu's "Profile & Support" section: the account-level destinations that
 * sit outside the module list above. Accounts is the tab, so it navigates;
 * everything else here is pushed over whatever screen opened the menu.
 */
export const PROFILE_SUPPORT_ITEMS: NavMenuItem[] = [
  {
    key: "profile",
    label: "Profile",
    icon: User,
    route: "/profile",
  },
  {
    key: "accounts",
    label: "Accounts",
    icon: Users,
    route: "/accounts",
    mode: "navigate",
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    route: "/settings/settings",
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: Bell,
    route: "/notification/notification",
  },
];
