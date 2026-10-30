import {
  ModuleHubScreen,
  type HubModule,
  type HubQuickLink,
} from "../../components/ui/ModuleHub";

/** One-tap jumps to the create screens (same as their in-screen buttons). */
const QUICK_LINKS: HubQuickLink[] = [
  {
    icon: "send",
    label: "Create Campaign",
    route: "/email-campaign/create-campaign",
  },
  {
    icon: "file-plus",
    label: "Create Template",
    route: "/email-campaign/create-template",
  },
  {
    icon: "bell",
    label: "Create Notification",
    route: "/email-campaign/create-notification",
  },
];

const MODULES: HubModule[] = [
  {
    icon: "send",
    title: "Manage Campaigns",
    description:
      "Bulk emails to customers and staff, with delivery stats at a glance.",
    tags: ["Campaigns", "Delivery", "Filters"],
    accent: "#0644C7",
    route: "/email-campaign/campaigns",
  },
  {
    icon: "mail",
    title: "Email Templates",
    description: "Reusable emails you can send again and again.",
    tags: ["Reusable", "Merge fields"],
    accent: "#059669",
    route: "/email-campaign/email-templates",
  },
  {
    icon: "bell",
    title: "Email Notifications",
    description: "Automated booking and payment emails.",
    tags: ["Automated", "Bookings"],
    accent: "#D97706",
    route: "/email-campaign/email-notification",
  },
  {
    icon: "message-square",
    title: "SMS Notifications",
    description: "Automated texts for parties, attractions and events.",
    tags: ["Text messages", "Automated"],
    accent: "#7C3AED",
    route: "/email-campaign/sms-notifications",
  },
];

// The Email Campaign module hub, same design as the other modules. The
// campaign list stays at /email-campaign/campaigns (now titled Manage
// Campaigns).
const EmailCampaignHub = () => (
  <ModuleHubScreen
    title="Email Campaign"
    heading="What would you like to do?"
    intro="Reach your guests by email and text, from one-off campaigns to automated notifications."
    quickLinks={QUICK_LINKS}
    modules={MODULES}
  />
);

export default EmailCampaignHub;
