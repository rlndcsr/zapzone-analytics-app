import { DoorOpen } from "lucide-react-native";

import {
  ModuleHubScreen,
  type HubModule,
  type HubQuickLink,
} from "../../components/ui/ModuleHub";
import { getCurrentUser } from "../../lib/session";

const doorIcon = (color: string, size: number) => (
  <DoorOpen size={size} color={color} />
);

/** One-tap actions. Guest Check-in opens Escape Rooms with its check-in QR
 *  showing (?checkin=1); Upload Overlay opens the upload form (?upload=1). */
const QUICK_LINKS: (HubQuickLink & { managerOnly?: boolean })[] = [
  { icon: "camera", label: "Take Photos", route: "/photos/capture" },
  {
    icon: "maximize",
    label: "Guest Check-in",
    route: "/photos/escape-rooms?checkin=1",
  },
  {
    icon: "upload",
    label: "Upload Overlay",
    route: "/photos/overlays?upload=1",
    managerOnly: true,
  },
];

/** Titles and order follow the web admin's Photos section. */
const MODULES: (HubModule & { managerOnly?: boolean })[] = [
  {
    icon: "camera",
    title: "Take Photos",
    description: "Capture customer photos and send them by email or SMS.",
    tags: ["Camera", "Send"],
    accent: "#0644C7",
    route: "/photos/capture",
  },
  {
    icon: "log-in",
    renderIcon: doorIcon,
    title: "Escape Rooms",
    description: "Group photo, finish time and send, for each game.",
    tags: ["Games", "Finish time"],
    accent: "#059669",
    route: "/photos/escape-rooms",
  },
  {
    icon: "image",
    title: "Photo Library",
    description: "Browse, download and resend every photo taken.",
    tags: ["Browse", "Resend"],
    accent: "#D97706",
    route: "/photos/library",
  },
  {
    icon: "monitor",
    title: "Slideshow Queue",
    description: "What the venue screen is showing, and what's next.",
    tags: ["Venue screen", "Queue"],
    accent: "#7C3AED",
    route: "/photos/slideshow-queue",
  },
  {
    icon: "layers",
    title: "Overlays",
    description: "The branded frame applied to every photo.",
    tags: ["Branding", "Frames"],
    accent: "#DB2777",
    route: "/photos/overlays",
    managerOnly: true,
  },
  {
    icon: "send",
    title: "Delivery Log",
    description: "Every photo link sent by email and SMS.",
    tags: ["Email", "SMS"],
    accent: "#0891B2",
    route: "/photos/delivery-log",
  },
  {
    icon: "bar-chart-2",
    title: "Photo Reports",
    description: "Capture, delivery, QR and kiosk stats.",
    tags: ["Stats", "Kiosk"],
    accent: "#DC2626",
    route: "/photos/reports",
    managerOnly: true,
  },
  {
    icon: "settings",
    title: "Photo Settings",
    description: "Passcodes, the date layer and photo retention.",
    tags: ["Passcodes", "Retention"],
    accent: "#475569",
    route: "/photos/settings",
    managerOnly: true,
  },
];

// The Photos module hub, same design as the other modules.
export default function PhotosScreen() {
  const role = getCurrentUser()?.role;
  const canManageSubModules =
    role === "company_admin" || role === "location_manager";

  const quickLinks = QUICK_LINKS.filter(
    (link) => !link.managerOnly || canManageSubModules,
  );
  const modules = MODULES.filter(
    (item) => !item.managerOnly || canManageSubModules,
  );

  return (
    <ModuleHubScreen
      title="Photos"
      heading="What would you like to do?"
      intro="Capture, deliver and display customer photos, from the camera to the venue screen."
      quickLinks={quickLinks}
      modules={modules}
    />
  );
}
