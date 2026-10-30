import {
  ModuleHubScreen,
  type HubModule,
  type HubQuickLink,
} from "../../components/ui/ModuleHub";

/** One-tap actions: Add Member (?add=1) and New Plan (?create=1) open their
 *  forms on arrival. */
const QUICK_LINKS: HubQuickLink[] = [
  {
    icon: "user-plus",
    label: "Add Member",
    route: "/memberships/memberships?add=1",
  },
  {
    icon: "plus",
    label: "New Plan",
    route: "/memberships/membership-plan?create=1",
  },
];

const MODULES: HubModule[] = [
  {
    icon: "credit-card",
    title: "Manage Memberships",
    description:
      "Every member subscription, with status, billing and freezes at a glance.",
    tags: ["Members", "Filters", "Past due"],
    accent: "#0644C7",
    route: "/memberships/memberships",
  },
  {
    icon: "layers",
    title: "Membership Plans",
    description: "Pricing, billing cadence and access rules for each plan.",
    tags: ["Pricing", "Benefits"],
    accent: "#059669",
    route: "/memberships/membership-plan",
  },
  {
    icon: "bar-chart-2",
    title: "Membership Reports",
    description: "Members, revenue and renewals over time.",
    tags: ["Revenue", "Renewals"],
    accent: "#D97706",
    route: "/memberships/membership-reports",
  },
];

// The Memberships module hub, same design as the other modules. The member
// list stays at /memberships/memberships (now titled Manage Memberships)
// because notifications link there with ?openId.
const MembershipsHub = () => (
  <ModuleHubScreen
    title="Memberships"
    heading="What would you like to do?"
    intro="Run your member subscriptions, from signing up new members to the plans they pay for."
    quickLinks={QUICK_LINKS}
    modules={MODULES}
  />
);

export default MembershipsHub;
