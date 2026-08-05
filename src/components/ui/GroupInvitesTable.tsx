import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { buildChaperoneLink } from "../../lib/waivers/chaperoneLink";
import type { GroupInvite } from "../../services/waiversService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 64;

const CELL_TEXT = "text-sm text-gray-600 dark:text-gray-300";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type RowContext = {
  /** Resend is admin/manager only — the attendant role has no invite actions. */
  canManage: boolean;
  onResend: (invite: GroupInvite) => Promise<void> | void;
};

/** A single icon action button inside the Actions cell. Nested Pressable, so it
 *  handles its own touch and never triggers the row's open-actions press. */
const ActionIconButton = ({
  icon,
  color,
  label,
  busy = false,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
  label: string;
  busy?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={busy}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={label}
    className="w-8 h-8 items-center justify-center rounded-lg active:opacity-60"
  >
    {busy ? (
      <ActivityIndicator size="small" color={color} />
    ) : (
      <Feather name={icon} size={16} color={color} />
    )}
  </Pressable>
);

/**
 * Row Actions cell — Copy chaperone link and Resend to chaperone, the same two
 * per-row buttons (and order) as the web admin's Group Invites table. The web
 * shows a tooltip plus a toast on copy; native has no tooltip, so the copy
 * button flashes to a green check for two seconds instead — the same feedback
 * the Attractions table's copy-link cell uses.
 */
const ActionsCell = ({
  invite,
  ctx,
}: {
  invite: GroupInvite;
  ctx: RowContext;
}) => {
  const [copied, setCopied] = useState(false);
  const [resending, setResending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = useCallback(async () => {
    await Clipboard.setStringAsync(buildChaperoneLink(invite.manageToken));
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }, [invite.manageToken]);

  const onResend = useCallback(async () => {
    setResending(true);
    try {
      await ctx.onResend(invite);
    } finally {
      setResending(false);
    }
  }, [ctx, invite]);

  return (
    <View className="flex-row items-center gap-1">
      <ActionIconButton
        icon={copied ? "check" : "link-2"}
        color={copied ? "#059669" : PRIMARY}
        label={`Copy chaperone link for ${invite.chaperoneName}`}
        onPress={onCopy}
      />
      {ctx.canManage && (
        <ActionIconButton
          icon="send"
          color={PRIMARY}
          label={`Resend invite to ${invite.chaperoneName}`}
          busy={resending}
          onPress={onResend}
        />
      )}
    </View>
  );
};

type Column = {
  key: string;
  label: string;
  width: number;
  render: (invite: GroupInvite, ctx: RowContext) => ReactNode;
};

const COLUMNS: Column[] = [
  {
    key: "chaperone",
    label: "Chaperone",
    width: 200,
    render: (invite) => {
      const contact = invite.chaperoneEmail || invite.chaperonePhone;
      return (
        <View>
          <Text
            numberOfLines={1}
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            {invite.chaperoneName}
          </Text>
          {!!contact && (
            <Text
              numberOfLines={1}
              className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
            >
              {contact}
            </Text>
          )}
        </View>
      );
    },
  },
  {
    key: "template",
    label: "Template",
    width: 200,
    render: (invite) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {invite.templateTitle ?? "—"}
      </Text>
    ),
  },
  {
    key: "date",
    label: "Date",
    width: 130,
    render: (invite) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {formatDate(invite.selectedDate)}
      </Text>
    ),
  },
  {
    key: "contacts",
    label: "Contacts",
    width: 100,
    render: (invite) => (
      <Text numberOfLines={1} className={CELL_TEXT}>
        {invite.recipientsCount}
      </Text>
    ),
  },
  {
    key: "shareable",
    label: "Shareable",
    width: 110,
    render: (invite) =>
      invite.allowShareableLink ? (
        <Text className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          Enabled
        </Text>
      ) : (
        <Text className="text-xs text-gray-300 dark:text-gray-600">—</Text>
      ),
  },
  {
    key: "actions",
    label: "",
    width: 110,
    render: (invite, ctx) => <ActionsCell invite={invite} ctx={ctx} />,
  },
];

const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, 0);

/**
 * Table layout for Group Invites, mirroring the web admin's bulk-invite table:
 * Chaperone (+ contact), Template, Date, Contacts, Shareable, then the same
 * per-row Copy-link / Resend actions. Horizontally scrollable with fixed column
 * widths, matching WaiversTable/TemplatesTable. Tapping a row opens the actions
 * sheet the card view uses — the Actions cell handles its own presses so they
 * don't open the sheet.
 */
export const GroupInvitesTable = memo(function GroupInvitesTable({
  invites,
  canManage,
  onRowPress,
  onResend,
}: {
  invites: GroupInvite[];
  canManage: boolean;
  onRowPress: (invite: GroupInvite) => void;
  onResend: (invite: GroupInvite) => Promise<void> | void;
}) {
  // Row-independent, so it's built once rather than per row.
  const ctx: RowContext = { canManage, onResend };

  return (
    <View
      className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-100 dark:border-neutral-800 mb-3"
      style={CARD_SHADOW}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ width: TABLE_WIDTH }}>
          {/* Header */}
          <View
            className="flex-row items-center bg-gray-50 dark:bg-neutral-800/60 border-b border-gray-100 dark:border-neutral-800"
            style={{ minHeight: HEADER_MIN_HEIGHT }}
          >
            {COLUMNS.map((col) => (
              <View
                key={col.key}
                className="justify-center px-4 py-3"
                style={{ width: col.width }}
              >
                <Text
                  numberOfLines={1}
                  className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500"
                >
                  {col.label}
                </Text>
              </View>
            ))}
          </View>

          {/* Rows */}
          {invites.map((invite, i) => (
            <Pressable
              key={invite.id}
              onPress={() => onRowPress(invite)}
              accessibilityRole="button"
              accessibilityLabel={`View invite for ${invite.chaperoneName}`}
              className={`flex-row items-center ${
                i < invites.length - 1
                  ? "border-b border-gray-100 dark:border-neutral-800"
                  : ""
              }`}
              style={({ pressed }) => ({
                minHeight: ROW_MIN_HEIGHT,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              {COLUMNS.map((col) => (
                <View
                  key={col.key}
                  className="justify-center px-4 py-3"
                  style={{ width: col.width }}
                >
                  {col.render(invite, ctx)}
                </View>
              ))}
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
});
