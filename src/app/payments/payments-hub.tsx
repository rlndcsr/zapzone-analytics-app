import {
  ModuleHubScreen,
  type HubModule,
  type HubQuickLink,
} from "../../components/ui/ModuleHub";

/** One-tap actions: each opens its own screen. */
const QUICK_LINKS: HubQuickLink[] = [
  {
    icon: "file-text",
    label: "Package Invoices",
    route: "/payments/package-invoices",
  },
  {
    icon: "trash-2",
    label: "Deleted Payments",
    route: "/payments/deleted-payments",
  },
];

const MODULES: HubModule[] = [
  {
    icon: "credit-card",
    title: "Manage Payments",
    description:
      "Every payment transaction, with status, refunds and invoices at a glance.",
    tags: ["Transactions", "Filters", "Export CSV"],
    accent: "#0644C7",
    route: "/payments/payments",
  },
  {
    icon: "package",
    title: "Package Invoices",
    description: "Every invoice for one package, as a single PDF.",
    tags: ["Invoices", "PDF"],
    accent: "#059669",
    route: "/payments/package-invoices",
  },
  {
    icon: "trash-2",
    title: "Deleted Payments",
    description: "Deleted payments and their totals, to restore or remove.",
    tags: ["Restore", "Remove"],
    accent: "#DC2626",
    route: "/payments/deleted-payments",
  },
];

// The Payments module hub, same design as the other modules. The payment list
// stays at /payments/payments (now titled Manage Payments) because
// notifications link there with ?openId.
const PaymentsHub = () => (
  <ModuleHubScreen
    title="Payments"
    heading="What would you like to do?"
    intro="Keep track of every payment, from today's transactions to invoices and deleted records."
    quickLinks={QUICK_LINKS}
    modules={MODULES}
  />
);

export default PaymentsHub;
