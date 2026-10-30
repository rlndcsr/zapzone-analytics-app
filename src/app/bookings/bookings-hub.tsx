import {
  ModuleHubScreen,
  type HubModule,
  type HubQuickLink,
} from "../../components/ui/ModuleHub";

/** One-tap jumps: the two entry buttons on Manage Bookings, plus Packages
 *  (what bookings are sold from). */
const QUICK_LINKS: HubQuickLink[] = [
  {
    icon: "edit-3",
    label: "Manual Booking",
    route: "/bookings/manual-booking",
  },
  { icon: "plus", label: "Create Booking", route: "/bookings/create-booking" },
  { icon: "package", label: "Packages", route: "/packages/packages-hub" },
];

const MODULES: HubModule[] = [
  {
    icon: "list",
    title: "Manage Bookings",
    description:
      "Search, filter and update every booking, with payments and status at a glance.",
    tags: ["Booking list", "Filters", "Reports"],
    accent: "#0644C7",
    route: "/bookings/bookings",
  },
  {
    icon: "calendar",
    title: "Calendar View",
    description: "Browse bookings day by day on a calendar.",
    tags: ["Day view", "Categories"],
    accent: "#059669",
    route: "/bookings/calendar",
  },
  {
    icon: "grid",
    title: "Space Schedule",
    description: "See which spaces are booked and when, across the day.",
    tags: ["Rooms", "Time slots"],
    accent: "#D97706",
    route: "/bookings/space-schedule",
  },
  {
    icon: "map-pin",
    title: "Location Requests",
    description: "Review and answer requests to move a booking's location.",
    tags: ["Approvals", "Transfers"],
    accent: "#7C3AED",
    route: "/bookings/location-requests",
  },
];

// The Bookings module hub, same design as Attractions and Events. The booking
// list stays at /bookings/bookings (now titled Manage Bookings) because
// notifications and other screens deep-link there with ?openId.
const BookingsHub = () => (
  <ModuleHubScreen
    title="Bookings"
    heading="What would you like to do?"
    intro="Run your bookings from here, from taking new ones to keeping the day's schedule on track."
    quickLinks={QUICK_LINKS}
    modules={MODULES}
  />
);

export default BookingsHub;
