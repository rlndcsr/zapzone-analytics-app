import { Text, View } from "react-native";

import type {
  EmailTemplateRow,
  EmailTemplateStatus,
} from "../../services/emailService";
import { SelectableTable, type TableColumn } from "./SelectableTable";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// Same status colors as the Templates card view.
const STATUS_PILL: Record<
  EmailTemplateStatus,
  { label: string; pill: string; text: string }
> = {
  active: { label: "Active", pill: "bg-green-100 dark:bg-green-900/40", text: "text-green-700 dark:text-green-300" },
  draft: { label: "Draft", pill: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" },
  archived: { label: "Archived", pill: "bg-gray-200 dark:bg-neutral-700", text: "text-gray-600 dark:text-gray-300" },
};

// Columns mirror the web `/admin/email/templates` default-visible set + order:
// Template (name + subject) · Category · Status · Created.
const COLUMNS: TableColumn<EmailTemplateRow>[] = [
  {
    key: "template",
    label: "Template",
    width: 220,
    render: (t) => (
      <View>
        <Text numberOfLines={1} className="text-sm font-semibold text-gray-900 dark:text-white">
          {t.name}
        </Text>
        {!!t.subject && (
          <Text numberOfLines={1} className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {t.subject}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "category",
    label: "Category",
    width: 150,
    render: (t) => (
      <View className="flex-row">
        <View className="bg-blue-50 dark:bg-blue-900/30 px-2.5 py-1 rounded-md">
          <Text numberOfLines={1} className="text-xs font-medium text-[#0644C7] dark:text-blue-300">
            {t.category}
          </Text>
        </View>
      </View>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 120,
    render: (t) => {
      const p = STATUS_PILL[t.status] ?? STATUS_PILL.draft;
      return (
        <View className="flex-row">
          <View className={`px-2.5 py-1 rounded-full ${p.pill}`}>
            <Text className={`text-xs font-semibold ${p.text}`}>{p.label}</Text>
          </View>
        </View>
      );
    },
  },
  {
    key: "created",
    label: "Created",
    width: 140,
    render: (t) => (
      <Text numberOfLines={1} className="text-sm text-gray-500 dark:text-gray-400">
        {fmtDate(t.createdAt)}
      </Text>
    ),
  },
];

/** Table view for Email Templates — thin wrapper over the shared SelectableTable. */
export function EmailTemplatesTable({
  templates,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowPress,
}: {
  templates: EmailTemplateRow[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  onRowPress: (t: EmailTemplateRow) => void;
}) {
  return (
    <SelectableTable
      columns={COLUMNS}
      rows={templates}
      rowId={(t) => t.id}
      onRowPress={onRowPress}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
    />
  );
}
