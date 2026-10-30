import {
  ModuleHubScreen,
  type HubModule,
  type HubQuickLink,
} from "../../components/ui/ModuleHub";
import { getCurrentUser } from "../../lib/session";

// The Events module hub, same design as Attractions. The event list, KPIs,
// filters and CSV export live on Manage Events.
const Events = () => {
  // Web 571430c: Registration Forms sits under Events for admins and managers.
  const role = getCurrentUser()?.role;
  const canManageRegistrationForms =
    role === "company_admin" || role === "location_manager";

  const quickLinks: HubQuickLink[] = [
    { icon: "plus", label: "New Event", route: "/events/create-event" },
    {
      icon: "file-plus",
      label: "New Purchase",
      route: "/events/create-purchase",
    },
    ...(canManageRegistrationForms
      ? [
          {
            icon: "clipboard",
            label: "New Registration",
            route: "/events/registration-event-editor",
          } as HubQuickLink,
        ]
      : []),
  ];

  const modules: HubModule[] = [
    {
      icon: "calendar",
      title: "Manage Events",
      description:
        "Create, edit and schedule every event, with dates and pricing at a glance.",
      tags: ["Event list", "Filters", "Export CSV"],
      accent: "#0644C7",
      route: "/events/manage-events",
    },
    {
      icon: "shopping-bag",
      title: "Event Purchases",
      description: "See every customer purchase and open the details.",
      tags: ["Ticket sales", "Payments", "QR codes"],
      accent: "#059669",
      route: "/events/purchases",
    },
    {
      icon: "plus-circle",
      title: "Onsite Purchase",
      description: "Sell event tickets to walk-in guests in a few taps.",
      tags: ["Walk-ins", "On-site sale"],
      accent: "#D97706",
      route: "/events/create-purchase",
    },
    ...(canManageRegistrationForms
      ? [
          {
            icon: "clipboard",
            title: "Registration Forms",
            description: "Free sign-up forms with a QR code for each event.",
            tags: ["Sign-ups", "QR code"],
            accent: "#7C3AED",
            route: "/events/registration-forms",
          } as HubModule,
        ]
      : []),
  ];

  return (
    <ModuleHubScreen
      title="Events"
      heading="What would you like to do?"
      intro="Run your events from here, from scheduling them to selling tickets and collecting sign-ups."
      quickLinks={quickLinks}
      modules={modules}
    />
  );
};

export default Events;
