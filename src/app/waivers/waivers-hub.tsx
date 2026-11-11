import {
  ModuleHubScreen,
  type HubModule,
  type HubQuickLink,
} from "../../components/ui/ModuleHub";
import { getCurrentUser } from "../../lib/session";

/** One-tap jumps to the create screens (same as their in-screen buttons). */
const QUICK_LINKS: HubQuickLink[] = [
  { icon: "plus", label: "Assign Waiver", route: "/waivers/create-waiver" },
  {
    icon: "file-plus",
    label: "Create Template",
    route: "/waivers/create-template",
  },
  {
    icon: "user-plus",
    label: "Create Group Invite",
    route: "/waivers/create-group-invite",
  },
];

/**
 * The web Waiver Records "⋯ Manage" menu, in its order, as a shortcut row.
 * Role rules match Waiver Records' own shortcuts: attendants only get Reports
 * and Deletion Log; Settings is company-admin only.
 */
function manageLinksFor(role: string | undefined): HubQuickLink[] {
  const isCompanyAdmin = role === "company_admin";
  const canManageSubModules = isCompanyAdmin || role === "location_manager";
  return [
    ...(canManageSubModules
      ? ([
          { label: "Templates", icon: "file-text", route: "/waivers/templates" },
          { label: "Group Invites", icon: "users", route: "/waivers/group-invites" },
          {
            label: "Returning Customers",
            icon: "user-check",
            route: "/waivers/returning-customers",
          },
        ] as HubQuickLink[])
      : []),
    { label: "Reports", icon: "bar-chart-2", route: "/waivers/reports" },
    { label: "Deletion Log", icon: "clipboard", route: "/waivers/deletion-log" },
    ...(isCompanyAdmin
      ? ([
          { label: "Settings", icon: "settings", route: "/waivers/waiver-settings" },
        ] as HubQuickLink[])
      : []),
  ];
}

const MODULES: HubModule[] = [
  {
    icon: "file-text",
    title: "Waiver Records",
    description:
      "Every signed waiver, with filters, check-in and the kiosk launcher.",
    tags: ["Records", "Kiosk", "Export CSV"],
    accent: "#0644C7",
    route: "/waivers/waivers",
  },
  {
    icon: "layout",
    title: "Templates",
    description: "The waiver text guests sign, assigned to activities.",
    tags: ["Legal text", "Activities"],
    accent: "#059669",
    route: "/waivers/templates",
  },
  {
    icon: "users",
    title: "Groups Invite",
    description: "Send a chaperone one link to collect a whole group's waivers.",
    tags: ["Groups", "Share link"],
    accent: "#D97706",
    route: "/waivers/group-invites",
  },
  {
    icon: "bar-chart-2",
    title: "Reports",
    description: "Waiver totals and trends over time.",
    tags: ["Totals", "Trends"],
    accent: "#7C3AED",
    route: "/waivers/reports",
  },
];

// The Waivers module hub, same design as the other modules. The records list
// stays at /waivers/waivers (titled Waiver Records) because notifications and
// the check-in desk link there directly, some with ?openId.
const WaiversHub = () => (
  <ModuleHubScreen
    title="Waivers"
    heading="What would you like to do?"
    intro="Collect and track guest waivers, from signed records to templates and group invites."
    quickLinks={QUICK_LINKS}
    manageLinks={manageLinksFor(getCurrentUser()?.role)}
    modules={MODULES}
  />
);

export default WaiversHub;
