import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { getToken } from "../../lib/session";
import {
  recipientContactLine,
  recipientStatusMeta,
  recipientSummary,
  type GroupInviteRecipient,
} from "../../lib/waivers/groupInvites";
import {
  fetchGroupInviteRecipients,
  type GroupInvite,
} from "../../services/waiversService";
import { BottomSheet } from "./BottomSheet";

const PRIMARY = "#0644C7";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr.substring(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const RecipientRow = ({
  recipient,
  first,
}: {
  recipient: GroupInviteRecipient;
  first: boolean;
}) => {
  const status = recipientStatusMeta(recipient.status);
  const contact = recipientContactLine(recipient);
  return (
    <View
      className={`flex-row items-center justify-between gap-3 py-3 ${
        first ? "" : "border-t border-gray-100 dark:border-neutral-800"
      }`}
    >
      <View className="flex-1 min-w-0">
        <Text
          numberOfLines={1}
          className="text-sm font-medium text-gray-900 dark:text-white"
        >
          {recipient.name || "Unnamed contact"}
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
      <View
        className={`shrink-0 px-2 py-0.5 rounded-full border ${status.box}`}
      >
        <Text className={`text-[11px] font-semibold ${status.text}`}>
          {status.label}
        </Text>
      </View>
    </View>
  );
};

export function GroupInviteRecipientsSheet({
  invite,
  onClose,
}: {
  invite: GroupInvite | null;
  onClose: () => void;
}) {
  const [recipients, setRecipients] = useState<GroupInviteRecipient[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const inviteId = invite?.id ?? null;
  const lastInvite = useRef(invite);
  if (invite) lastInvite.current = invite;
  const shown = invite ?? lastInvite.current;

  useEffect(() => {
    if (inviteId == null) return;
    setRecipients(null);
    setError(null);
    const token = getToken();
    if (!token) {
      setError("Not authenticated");
      return;
    }
    const controller = new AbortController();
    fetchGroupInviteRecipients(token, inviteId, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setRecipients(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Could not load this group.");
      });
    return () => controller.abort();
  }, [inviteId, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const summary = recipients ? recipientSummary(recipients) : null;
  const subtitle = shown
    ? [
        formatDate(shown.selectedDate),
        summary && `${summary.signed} of ${summary.total} signed`,
        summary && summary.failed > 0 && `${summary.failed} not delivered`,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <BottomSheet
      visible={invite !== null}
      onClose={onClose}
      title={shown ? `${shown.chaperoneName}'s group` : "Group"}
      subtitle={subtitle}
    >
      <ScrollView
        className="px-5 pb-8"
        style={{ maxHeight: 460 }}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <View className="items-center py-8">
            <Text className="text-sm text-red-600 dark:text-red-400 text-center">
              {error}
            </Text>
            <Pressable
              onPress={retry}
              accessibilityRole="button"
              className="mt-3 px-4 py-2 rounded-lg bg-gray-100 dark:bg-neutral-800 active:opacity-70"
            >
              <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Try again
              </Text>
            </Pressable>
          </View>
        ) : recipients === null ? (
          <View className="items-center py-8">
            <ActivityIndicator color={PRIMARY} />
          </View>
        ) : recipients.length === 0 ? (
          <Text className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
            {"The chaperone hasn't added any parents yet."}
          </Text>
        ) : (
          recipients.map((r, i) => (
            <RecipientRow key={r.id} recipient={r} first={i === 0} />
          ))
        )}
      </ScrollView>
    </BottomSheet>
  );
}
