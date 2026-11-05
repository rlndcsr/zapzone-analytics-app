import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { buildChaperoneLink, buildGroupLink } from "../../lib/waivers/chaperoneLink";
import { groupLinkState } from "../../lib/waivers/groupInvites";
import type { GroupInvite } from "../../services/waiversService";
import { RowActionGroup } from "./RowActions";
import { SelectableTable, type TableColumn } from "./SelectableTable";

const PRIMARY = "#0644C7";
const NEUTRAL = "#6B7280";

const CELL_TEXT = "text-sm text-gray-700 dark:text-gray-300";

export function formatInviteDate(dateStr: string | null): string {
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
  onViewRecipients: (invite: GroupInvite) => void;
};

/** Copies `link`, then flips to a green check for two seconds. */
function useCopyFlash(link: string) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    await Clipboard.setStringAsync(link);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }, [link]);

  return { copied, copy };
}

/**
 * Group link cell — the web's "Group link" column: a Copy button for the link
 * parents use to sign once the invite has one, "Enabled" while it's allowed but
 * not minted yet, else a dash.
 */
const GroupLinkCell = ({ invite }: { invite: GroupInvite }) => {
  const state = groupLinkState(invite);
  const { copied, copy } = useCopyFlash(
    invite.shareableToken ? buildGroupLink(invite.shareableToken) : "",
  );
  if (state === "enabled")
    return (
      <Text className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
        Enabled
      </Text>
    );
  if (state === "off")
    return <Text className="text-xs text-gray-300 dark:text-gray-600">—</Text>;
  return (
    <Pressable
      onPress={copy}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Copy the group link for ${invite.chaperoneName}`}
      className="flex-row items-center gap-1 self-start active:opacity-60"
    >
      <Feather
        name={copied ? "check" : "share-2"}
        size={13}
        color={copied ? "#059669" : PRIMARY}
      />
      <Text
        className={`text-xs font-semibold ${
          copied
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-[#0644C7] dark:text-blue-400"
        }`}
      >
        {copied ? "Copied" : "Copy"}
      </Text>
    </Pressable>
  );
};

/**
 * Row actions — See who has signed, Copy chaperone link and Resend to
 * chaperone, the web row's buttons in its order. Native has no tooltip, so the
 * copy button flashes to a green check for two seconds instead.
 */
const ActionsCell = ({ invite, ctx }: { invite: GroupInvite; ctx: RowContext }) => {
  const { copied, copy } = useCopyFlash(buildChaperoneLink(invite.manageToken));
  const [resending, setResending] = useState(false);

  const onResend = useCallback(async () => {
    setResending(true);
    try {
      await ctx.onResend(invite);
    } finally {
      setResending(false);
    }
  }, [ctx, invite]);

  return (
    <RowActionGroup
      actions={[
        {
          key: "recipients",
          icon: "list",
          color: NEUTRAL,
          label: `See who has signed in ${invite.chaperoneName}'s group`,
          onPress: () => ctx.onViewRecipients(invite),
        },
        {
          key: "copy",
          icon: copied ? "check" : "link-2",
          color: copied ? "#059669" : NEUTRAL,
          label: `Copy chaperone link for ${invite.chaperoneName}`,
          onPress: copy,
        },
        ctx.canManage && {
          key: "resend",
          icon: "send",
          color: PRIMARY,
          label: `Resend invite to ${invite.chaperoneName}`,
          busy: resending,
          onPress: onResend,
        },
      ]}
    />
  );
};

function buildColumns(ctx: RowContext): TableColumn<GroupInvite>[] {
  return [
    {
      key: "chaperone",
      label: "Chaperone",
      width: 200,
      render: (invite) => {
        const contact = invite.chaperoneEmail || invite.chaperonePhone;
        return (
          <View>
            <Text numberOfLines={1} className="text-sm font-semibold text-gray-900 dark:text-white">
              {invite.chaperoneName}
            </Text>
            {!!contact && (
              <Text numberOfLines={1} className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
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
          {formatInviteDate(invite.selectedDate)}
        </Text>
      ),
    },
    {
      key: "signed",
      label: "Signed",
      width: 140,
      render: (invite) => (
        <View>
          <Text numberOfLines={1} className={CELL_TEXT}>
            <Text className="font-semibold text-gray-900 dark:text-white">
              {invite.completeCount}
            </Text>{" "}
            of {invite.recipientsCount}
          </Text>
          {invite.failedCount > 0 && (
            <Text numberOfLines={1} className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              {invite.failedCount} not delivered
            </Text>
          )}
        </View>
      ),
    },
    {
      key: "groupLink",
      label: "Group link",
      width: 110,
      render: (invite) => <GroupLinkCell invite={invite} />,
    },
    {
      key: "actions",
      label: "Actions",
      width: 140,
      render: (invite) => <ActionsCell invite={invite} ctx={ctx} />,
    },
  ];
}

/**
 * Table layout for Group Invites, mirroring the web admin's bulk-invite table:
 * Chaperone (+ contact), Template, Date, Signed ("X of Y" + not delivered),
 * Group link, then the same per-row actions. Tapping a row opens the actions
 * sheet the card view uses; cells with buttons handle their own presses.
 */
export const GroupInvitesTable = memo(function GroupInvitesTable({
  invites,
  canManage,
  onRowPress,
  onResend,
  onViewRecipients,
}: {
  invites: GroupInvite[];
  canManage: boolean;
  onRowPress: (invite: GroupInvite) => void;
  onResend: (invite: GroupInvite) => Promise<void> | void;
  onViewRecipients: (invite: GroupInvite) => void;
}) {
  const columns = useMemo(
    () => buildColumns({ canManage, onResend, onViewRecipients }),
    [canManage, onResend, onViewRecipients],
  );
  return (
    <SelectableTable
      columns={columns}
      rows={invites}
      rowId={(i) => i.id}
      onRowPress={onRowPress}
      rowLabel={(i) => `invite for ${i.chaperoneName}`}
      flat
    />
  );
});
