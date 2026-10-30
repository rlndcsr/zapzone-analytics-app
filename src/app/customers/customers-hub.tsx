import { Ionicons } from "@expo/vector-icons";

import {
  ModuleHubScreen,
  type HubModule,
  type HubQuickLink,
} from "../../components/ui/ModuleHub";

/** One-tap actions. Add Customer / Add Member open their forms (?add=1). */
const QUICK_LINKS: HubQuickLink[] = [
  {
    icon: "user-plus",
    label: "Add Customer",
    route: "/customers/customers?add=1",
  },
  {
    icon: "phone-call",
    label: "Customer Concerns",
    route: "/customers/customer-concerns",
  },
  {
    icon: "credit-card",
    label: "Add Member",
    route: "/memberships/memberships?add=1",
  },
];

const MODULES: HubModule[] = [
  {
    icon: "users",
    title: "Manage Customers",
    description:
      "Search, add and edit every customer, with their status at a glance.",
    tags: ["Customer list", "Filters", "Export CSV"],
    accent: "#0644C7",
    route: "/customers/customers",
  },
  {
    icon: "pie-chart",
    title: "Customer Analytics",
    description: "KPIs, trends, top customers and segments.",
    tags: ["KPIs", "Segments"],
    accent: "#059669",
    route: "/customers/analytics",
  },
  {
    icon: "phone-call",
    title: "Customer Concerns",
    description: "Guests waiting on a call, or who left checkout.",
    tags: ["Call backs", "Abandoned"],
    accent: "#D97706",
    route: "/customers/customer-concerns",
  },
  {
    // Footprints, like the web sidebar's icon. Feather has no footprint
    // glyph, so this one comes from Ionicons.
    icon: "activity",
    renderIcon: (color, size) => (
      <Ionicons name="footsteps-outline" size={size} color={color} />
    ),
    title: "Visitor Tracking",
    description: "Every visit as its own session, one visitor a day.",
    tags: ["Sessions", "Visits"],
    accent: "#7C3AED",
    route: "/customers/visitor-tracking",
  },
];

// The Customers module hub, same design as the other modules. The customer
// list stays at /customers/customers (now titled Manage Customers) because
// notifications link there with ?openId.
const CustomersHub = () => (
  <ModuleHubScreen
    title="Customers"
    heading="What would you like to do?"
    intro="Know your guests, from the customer list to the concerns waiting on a call back."
    quickLinks={QUICK_LINKS}
    modules={MODULES}
  />
);

export default CustomersHub;
