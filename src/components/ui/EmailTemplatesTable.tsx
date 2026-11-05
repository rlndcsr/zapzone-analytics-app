import { useMemo } from "react";
import { Text, View } from "react-native";

import { templateLocationSummary } from "../../lib/email/emailTemplateOptions";
import type {
  EmailTemplateRow,
  EmailTemplateStatus,
} from "../../services/emailService";
import { RowActionGroup } from "./RowActions";
import { SelectableTable, type TableColumn } from "./SelectableTable";
import { ToneDotBadge, type DotTone } from "./SummaryPanel";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function fmtTemplateDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Shared secondary-cell text style so every column reads consistently. */
const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";

// Same status colours the template pills have always used.
const TEMPLATE_STATUS: Record<EmailTemplateStatus, { label: string; tone: DotTone }> = {
  active: { label: "Active", tone: "green" },
  draft: { label: "Draft", tone: "amber" },
  archived: { label: "Archived", tone: "gray" },
};

/** Template status pill with a dot — used by the table and the card list. */
export const TemplateStatusBadge = ({ status }: { status: EmailTemplateStatus }) => {
  const s = TEMPLATE_STATUS[status] ?? TEMPLATE_STATUS.draft;
  return <ToneDotBadge tone={s.tone} label={s.label} />;
};

/** Quiet neutral tag (category) — the flat tables' method/type tag look. */
export const TemplateCategoryTag = ({ category }: { category: string }) => (
  <View className="self-start max-w-full px-2 py-1 rounded-md bg-gray-100 dark:bg-neutral-800">
    <Text numberOfLines={1} className="text-xs font-medium text-gray-700 dark:text-gray-300">
      {category}
    </Text>
  </View>
);

type RowHandlers = {
  onPreview: (t: EmailTemplateRow) => void;
  onEdit: (t: EmailTemplateRow) => void;
  onDelete: (t: EmailTemplateRow) => void;
  onDuplicate: (t: EmailTemplateRow) => void;
  /** Whether this user may copy the row (web `canDuplicate`). */
  canDuplicate: (t: EmailTemplateRow) => boolean;
};

// Columns mirror the web `/admin/email/templates` default-visible set + order:
// Template (name + subject) · Category · Locations · Status · Created · Actions.
function buildColumns(h: RowHandlers): TableColumn<EmailTemplateRow>[] {
  return [
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
    render: (t) => <TemplateCategoryTag category={t.category} />,
  },
  {
    key: "locations",
    label: "Locations",
    width: 170,
    render: (t) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {templateLocationSummary(t)}
      </Text>
    ),
  },
  {
    key: "status",
    label: "Status",
    width: 120,
    render: (t) => (
      <View className="flex-row">
        <TemplateStatusBadge status={t.status} />
      </View>
    ),
  },
  {
    key: "created",
    label: "Created",
    width: 140,
    render: (t) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {fmtTemplateDate(t.createdAt)}
      </Text>
    ),
  },
  {
    // Web parity: Preview · Edit/View · Duplicate · Delete (only on a template
    // this user may change). Neutral icons; only edit and delete are tinted.
    key: "actions",
    label: "Actions",
    width: 170,
    render: (t) => (
      <RowActionGroup
        actions={[
          { key: "preview", icon: "eye", color: "#6B7280", label: `Preview ${t.name}`, onPress: () => h.onPreview(t) },
          {
            key: "edit",
            icon: "edit-2",
            color: "#0644C7",
            label: `${t.canManage ? "Edit" : "View"} ${t.name}`,
            onPress: () => h.onEdit(t),
          },
          h.canDuplicate(t) && {
            key: "duplicate",
            icon: "copy",
            color: "#6B7280",
            label: `Duplicate ${t.name}`,
            onPress: () => h.onDuplicate(t),
          },
          t.canManage && {
            key: "delete",
            icon: "trash-2",
            color: "#DC2626",
            label: `Delete ${t.name}`,
            onPress: () => h.onDelete(t),
          },
        ]}
      />
    ),
  },
  ];
}

/** Table view for Email Templates — thin wrapper over the shared SelectableTable. */
export function EmailTemplatesTable({
  templates,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onRowPress,
  onPreview,
  onEdit,
  onDelete,
  onDuplicate,
  canDuplicate,
}: {
  templates: EmailTemplateRow[];
  selectedIds: Set<number>;
  onToggleRow: (id: number) => void;
  onToggleAll: () => void;
  onRowPress: (t: EmailTemplateRow) => void;
} & RowHandlers) {
  const columns = useMemo(
    () => buildColumns({ onPreview, onEdit, onDelete, onDuplicate, canDuplicate }),
    [onPreview, onEdit, onDelete, onDuplicate, canDuplicate],
  );
  return (
    <SelectableTable
      columns={columns}
      rows={templates}
      rowId={(t) => t.id}
      onRowPress={onRowPress}
      selectedIds={selectedIds}
      onToggleRow={onToggleRow}
      onToggleAll={onToggleAll}
      rowLabel={(t) => t.name}
      flat
    />
  );
}
