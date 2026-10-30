import {
  ModuleHubScreen,
  type HubModule,
  type HubQuickLink,
} from "../../components/ui/ModuleHub";

/** One-tap jumps: the two create screens, then the modules pricing applies to. */
const QUICK_LINKS: HubQuickLink[] = [
  {
    icon: "percent",
    label: "Create Special Pricing",
    route: "/pricing/create-special-pricing",
  },
  {
    icon: "dollar-sign",
    label: "Create Fee Support",
    route: "/pricing/create-fee-support",
  },
  { icon: "package", label: "Packages", route: "/packages/packages-hub" },
  { icon: "star", label: "Attractions", route: "/attractions/attractions" },
  { icon: "calendar", label: "Events", route: "/events/events" },
];

const MODULES: HubModule[] = [
  {
    icon: "percent",
    title: "Special Pricing",
    description:
      "Automatic discounts by date, day or time, with priority and stacking rules.",
    tags: ["Discounts", "Recurring", "Export CSV"],
    accent: "#0644C7",
    route: "/pricing/pricing",
  },
  {
    icon: "dollar-sign",
    title: "Fee Supports",
    description:
      "Extra fees added to packages, attractions, events and memberships.",
    tags: ["Fees", "Surcharges"],
    accent: "#059669",
    route: "/pricing/fee-support",
  },
];

// The Pricing module hub, same design as the other modules. The Special
// Pricing list stays at /pricing/pricing because the Attractions and Packages
// "Special Pricing" shortcuts link there directly.
const PricingHub = () => (
  <ModuleHubScreen
    title="Pricing"
    heading="What would you like to do?"
    intro="Control what guests pay, from automatic discounts to the extra fees added at checkout."
    quickLinks={QUICK_LINKS}
    modules={MODULES}
  />
);

export default PricingHub;
