import {
  ModuleHubScreen,
  type HubModule,
  type HubQuickLink,
} from "../../components/ui/ModuleHub";

/** One-tap jumps, same routes as the Manage Attractions "More" menu. */
const QUICK_LINKS: HubQuickLink[] = [
  {
    icon: "plus",
    label: "New Attraction",
    route: "/attractions/create-attraction",
  },
  // Same destination as the Bulk Orders screen's "New Order" button.
  {
    icon: "file-plus",
    label: "New Order",
    route: "/attractions/create-purchase",
  },
  { icon: "dollar-sign", label: "Fee Supports", route: "/pricing/fee-support" },
  { icon: "percent", label: "Special Pricing", route: "/pricing/pricing" },
];

const MODULES: HubModule[] = [
  {
    icon: "star",
    title: "Manage Attractions",
    description:
      "Create, edit and organise every attraction, with pricing and capacity at a glance.",
    tags: ["Attraction list", "Filters", "Import / Export"],
    accent: "#0644C7",
    route: "/attractions/manage-attractions",
  },
  {
    icon: "shopping-bag",
    title: "Manage Purchases",
    description:
      "Look up ticket purchases, check their status and open the details.",
    tags: ["Ticket sales", "Payments", "Check-in"],
    accent: "#059669",
    route: "/attractions/purchases",
  },
  {
    icon: "shopping-cart",
    title: "Create Purchase",
    description: "Sell tickets on-site for walk-in guests in a few taps.",
    tags: ["Walk-ins", "On-site sale"],
    accent: "#D97706",
    route: "/attractions/create-purchase",
  },
  {
    icon: "layers",
    title: "Bulk Orders",
    description: "Multi-item orders for groups, with their own check-in.",
    tags: ["Group orders", "Check-in"],
    accent: "#7C3AED",
    route: "/attractions/orders",
  },
];

// The Attractions module hub. The attraction list, KPIs, filters and
// import/export live on Manage Attractions.
const Attractions = () => (
  <ModuleHubScreen
    title="Attractions"
    heading="What would you like to do?"
    intro="Run your attractions from here, from setting them up to selling tickets at the front desk."
    quickLinks={QUICK_LINKS}
    modules={MODULES}
  />
);

export default Attractions;
