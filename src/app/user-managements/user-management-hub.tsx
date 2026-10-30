import {
  ModuleHubScreen,
  type HubModule,
  type HubQuickLink,
} from "../../components/ui/ModuleHub";
import { getCurrentUser } from "../../lib/session";

// The User Management module hub, same design as the other modules. Company
// admins manage every staff account; location managers manage their
// attendants — the same split the menu used before the hub.
const UserManagementHub = () => {
  const isCompanyAdmin = getCurrentUser()?.role === "company_admin";
  const accountsRoute = isCompanyAdmin
    ? "/user-managements/manage-accounts"
    : "/user-managements/attendants";

  // Send Invitation / Staff Account open their forms (?invite=1 / ?create=1).
  const quickLinks: HubQuickLink[] = [
    { icon: "send", label: "Send Invitation", route: `${accountsRoute}?invite=1` },
    { icon: "user-plus", label: "Staff Account", route: `${accountsRoute}?create=1` },
  ];

  const modules: HubModule[] = [
    isCompanyAdmin
      ? {
          icon: "users",
          title: "Manage Accounts",
          description: "Every staff account across your company.",
          tags: ["Staff", "Roles", "Export CSV"],
          accent: "#0644C7",
          route: accountsRoute,
        }
      : {
          icon: "users",
          title: "Manage Attendants",
          description: "Every staff member at your location.",
          tags: ["Staff", "Invites"],
          accent: "#0644C7",
          route: accountsRoute,
        },
    {
      icon: "key",
      title: "Employee PINs",
      description: "Issue staff PINs and set the automatic logout.",
      tags: ["PINs", "Auto logout"],
      accent: "#059669",
      route: "/user-managements/staff-pins",
    },
    {
      icon: "activity",
      title: "Activity Log",
      description: "Review what staff accounts have been doing.",
      tags: ["Audit", "History"],
      accent: "#D97706",
      route: "/user-managements/activity-logs",
    },
    {
      icon: "calendar",
      title: "Day Offs",
      description: "Blocked dates and holidays for the venue.",
      tags: ["Holidays", "Blocked dates"],
      accent: "#7C3AED",
      route: "/user-managements/day-offs",
    },
  ];

  return (
    <ModuleHubScreen
      title={isCompanyAdmin ? "User Management" : "Attendants"}
      heading="What would you like to do?"
      intro="Look after your team, from staff accounts and PINs to activity and days off."
      quickLinks={quickLinks}
      modules={modules}
    />
  );
};

export default UserManagementHub;
