import {
  ModuleHubScreen,
  type HubModule,
  type HubQuickLink,
} from "../../components/ui/ModuleHub";
import { getCurrentUser } from "../../lib/session";

// The Analytics & Reports module hub, same design as the other modules.
const AnalyticsHub = () => {
  const role = getCurrentUser()?.role;
  const canManageSubModules =
    role === "company_admin" || role === "location_manager";

  /** The other modules' reports, one tap away. Photo Reports is admin and
   *  manager only, as on the Photos hub. */
  const quickLinks: HubQuickLink[] = [
    { icon: "pie-chart", label: "Customer Analytics", route: "/customers/analytics" },
    {
      icon: "credit-card",
      label: "Membership Reports",
      route: "/memberships/membership-reports",
    },
    { icon: "file-text", label: "Waiver Reports", route: "/waivers/reports" },
    ...(canManageSubModules
      ? [
          {
            icon: "camera",
            label: "Photo Reports",
            route: "/photos/reports",
          } as HubQuickLink,
        ]
      : []),
  ];

  const modules: HubModule[] = [
    {
      icon: "trending-up",
      title: "Performance Analytics",
      description:
        "Revenue, bookings and location performance for any period.",
      tags: ["Revenue", "Bookings", "Locations"],
      accent: "#0644C7",
      route: "/analytics-reports/performance-analytics",
    },
    {
      icon: "bar-chart",
      title: "Page Analytics",
      description: "Visitors, engagement and conversions on your pages.",
      tags: ["Visitors", "Conversions"],
      accent: "#059669",
      route: "/analytics-reports/page-analytics",
    },
    {
      icon: "bar-chart-2",
      title: "Accounting",
      description: "Purchases made on the dates you pick.",
      tags: ["Purchases", "Date range"],
      accent: "#D97706",
      route: "/analytics-reports/accounting-analytics",
    },
  ];

  return (
    <ModuleHubScreen
      title="Analytics & Reports"
      heading="What would you like to do?"
      intro="See how the business is doing, from revenue and bookings to page visits and accounting."
      quickLinks={quickLinks}
      modules={modules}
    />
  );
};

export default AnalyticsHub;
