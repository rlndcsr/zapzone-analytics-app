import {
  ModuleHubScreen,
  type HubModule,
  type HubQuickLink,
} from "../../components/ui/ModuleHub";

/** One-tap jumps: a Create shortcut per sub-module (?create=1 opens that
 *  screen's create form), then the Manage Packages "More" menu routes. Four
 *  show at once; the rest swipe in. */
const QUICK_LINKS: HubQuickLink[] = [
  { icon: "plus", label: "Create Package", route: "/packages/create-packages" },
  {
    icon: "box",
    label: "Create Custom",
    route: "/packages/create-packages?type=custom",
  },
  { icon: "home", label: "Create Space", route: "/packages/space?create=1" },
  {
    icon: "coffee",
    label: "Create Add-on",
    route: "/packages/add-ons?create=1",
  },
  {
    icon: "tag",
    label: "Create Promo Code",
    route: "/packages/promos?create=1",
  },
  {
    icon: "gift",
    label: "Create Gift Card",
    route: "/packages/gift-cards?create=1",
  },
  { icon: "file-text", label: "Global Notes", route: "/packages/global-notes" },
  { icon: "dollar-sign", label: "Fee Supports", route: "/pricing/fee-support" },
  { icon: "percent", label: "Special Pricing", route: "/pricing/pricing" },
];

const MODULES: HubModule[] = [
  {
    icon: "package",
    title: "Manage Packages",
    description:
      "Create, edit and sort every package, with prices and categories at a glance.",
    tags: ["Package list", "Filters", "Import / Export"],
    accent: "#0644C7",
    route: "/packages/packages",
  },
  {
    icon: "box",
    title: "Custom Packages",
    description: "Packages built for a customer, and their details.",
    tags: ["Tailored", "Quotes"],
    accent: "#059669",
    route: "/packages/custom-packages",
  },
  {
    icon: "gift",
    title: "Gift Cards",
    description: "Manage and look up every gift card and its balance.",
    tags: ["Balances", "Codes"],
    accent: "#D97706",
    route: "/packages/gift-cards",
  },
  {
    icon: "home",
    title: "Space",
    description: "Rooms and areas guests can book, and when they're free.",
    tags: ["Rooms", "Availability"],
    accent: "#7C3AED",
    route: "/packages/space",
  },
  {
    icon: "coffee",
    title: "Add-ons",
    description: "Food, drinks and extras guests can add to a booking.",
    tags: ["Food & drink", "Extras"],
    accent: "#DB2777",
    route: "/packages/add-ons",
  },
  {
    icon: "tag",
    title: "Promos",
    description: "Promo codes and the discounts they unlock.",
    tags: ["Codes", "Discounts"],
    accent: "#0891B2",
    route: "/packages/promos",
  },
];

// The Packages module hub, same design as Attractions, Events and Bookings.
// The package list stays at /packages/packages (now titled Manage Packages)
// because the Calendar and Escape Rooms screens link there directly.
const PackagesHub = () => (
  <ModuleHubScreen
    title="Packages"
    heading="What would you like to do?"
    intro="Set up everything guests can book, from packages and spaces to add-ons, gift cards and promos."
    quickLinks={QUICK_LINKS}
    modules={MODULES}
  />
);

export default PackagesHub;
