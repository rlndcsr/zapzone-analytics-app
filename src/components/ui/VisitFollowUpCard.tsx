import { useRouter } from "expo-router";
import { MailCheck, Star } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { ApiError } from "../../lib/api";
import { getToken } from "../../lib/session";
import {
  canCancelFollowUp,
  canSendFollowUpNow,
  FOLLOW_UP_STATUS_LABELS,
  followUpCardText,
  followUpSendLabel,
  followUpStatusLine,
  formatFollowUpTime,
  type FollowUpRow,
  type FollowUpStatus,
  type StaffVisitType,
  type VisitFollowUpSummary,
} from "../../lib/visitFollowUp/visitFollowUp";
import {
  cancelFollowUp,
  fetchVisitFollowUp,
  sendFollowUpNow,
  sendVisitThanks,
} from "../../services/visitFollowUpService";

const STATUS_STYLES: Record<FollowUpStatus, { pill: string; text: string }> = {
  scheduled: {
    pill: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-900/40",
    text: "text-blue-800 dark:text-blue-300",
  },
  sending: {
    pill: "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-900/40",
    text: "text-blue-800 dark:text-blue-300",
  },
  sent: {
    pill: "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-900/40",
    text: "text-green-800 dark:text-green-300",
  },
  failed: {
    pill: "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-900/40",
    text: "text-red-800 dark:text-red-300",
  },
  skipped: {
    pill: "bg-gray-50 border-gray-200 dark:bg-neutral-800 dark:border-neutral-700",
    text: "text-gray-700 dark:text-gray-300",
  },
  canceled: {
    pill: "bg-gray-50 border-gray-200 dark:bg-neutral-800 dark:border-neutral-700",
    text: "text-gray-700 dark:text-gray-300",
  },
};

function RatingStars({ rating }: { rating: number }) {
  return (
    <View
      className="flex-row items-center gap-0.5"
      accessibilityLabel={`${rating} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={13}
          color={star <= rating ? "#fbbf24" : "#d1d5db"}
          fill={star <= rating ? "#fbbf24" : "transparent"}
        />
      ))}
    </View>
  );
}

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof ApiError && error.status !== 0 ? error.message : fallback;

type Props = {
  visitType: StaffVisitType;
  visitId: number;
  refreshKey?: string | number;
  className?: string;
};

export function VisitFollowUpCard({
  visitType,
  visitId,
  refreshKey,
  className = "mt-6",
}: Props) {
  const router = useRouter();
  const [summary, setSummary] = useState<VisitFollowUpSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const token = getToken();
      if (!token) return;
      try {
        setSummary(await fetchVisitFollowUp(token, visitType, visitId, signal));
      } catch {
        setSummary(null);
      }
    },
    [visitType, visitId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refreshKey]);

  if (!summary || !summary.available) return null;

  const text = followUpCardText(summary, visitType);
  const rows = [...summary.thanks, ...summary.reviews];

  const act = async (
    key: string,
    action: (
      token: string,
    ) => Promise<
      VisitFollowUpSummary | { message: string; data: VisitFollowUpSummary }
    >,
    success: string,
  ) => {
    const token = getToken();
    if (!token) return;
    setBusy(key);
    setNotice(null);
    try {
      const result = await action(token);
      const withMessage = "data" in result && "message" in result;
      setSummary(withMessage ? result.data : (result as VisitFollowUpSummary));
      setNotice({
        ok: true,
        text: withMessage && result.message ? result.message : success,
      });
    } catch (error) {
      setNotice({
        ok: false,
        text: errorMessage(error, "That did not work. Please try again."),
      });
      void load();
    } finally {
      setBusy(null);
    }
  };

  const openEmail = (id: number | null) => {
    if (!id) return;
    router.push({
      pathname: "/email-campaign/create-notification",
      params: { id: String(id) },
    });
  };

  const renderRow = (row: FollowUpRow) => {
    const isReview = row.kind === "review";
    const style = STATUS_STYLES[row.status];
    const canSend = canSendFollowUpNow(row, summary.completed);
    const canCancel = canCancelFollowUp(row);

    return (
      <View
        key={row.id}
        className="py-2 border-t border-gray-100 dark:border-neutral-800"
      >
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-sm text-gray-900 dark:text-white">
            {isReview ? text.reviewName : text.thanksName}
          </Text>
          <View className={`px-2 py-0.5 rounded-full border ${style.pill}`}>
            <Text className={`text-xs font-medium ${style.text}`}>
              {FOLLOW_UP_STATUS_LABELS[row.status]}
            </Text>
          </View>
        </View>
        <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          To {row.recipient_email_masked} · {followUpStatusLine(row)}
        </Text>
        {row.status === "failed" && !!row.error && (
          <Text className="text-xs text-red-600 mt-0.5">{row.error}</Text>
        )}
        {row.rating !== null && (
          <View className="mt-1 flex-row flex-wrap items-center gap-2">
            <RatingStars rating={row.rating} />
            <Text className="text-xs text-gray-700 dark:text-gray-300">
              Rated {formatFollowUpTime(row.rated_at)}
            </Text>
            {!!row.comment && (
              <Text className="text-xs italic text-gray-600 dark:text-gray-400">
                {`“${row.comment}”`}
              </Text>
            )}
          </View>
        )}
        {(canSend || canCancel) && (
          <View className="flex-row flex-wrap gap-2 mt-2">
            {canSend && (
              <Pressable
                disabled={busy !== null}
                onPress={() =>
                  void act(
                    `send-${row.id}`,
                    (t) => sendFollowUpNow(t, row.id),
                    "Email sent.",
                  )
                }
                style={{ opacity: busy !== null ? 0.5 : 1 }}
                className="min-h-[34px] justify-center px-3 rounded-lg border border-gray-300 dark:border-neutral-700 active:opacity-70"
              >
                <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  {busy === `send-${row.id}`
                    ? "Sending…"
                    : followUpSendLabel(row)}
                </Text>
              </Pressable>
            )}
            {canCancel && (
              <Pressable
                disabled={busy !== null}
                onPress={() =>
                  void act(
                    `cancel-${row.id}`,
                    (t) => cancelFollowUp(t, row.id),
                    "The email will not be sent.",
                  )
                }
                style={{ opacity: busy !== null ? 0.5 : 1 }}
                className="min-h-[34px] justify-center px-3 rounded-lg active:opacity-70"
              >
                <Text className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {busy === `cancel-${row.id}` ? "Canceling…" : "Don’t send"}
                </Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View
      className={`${className} bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-4`}
    >
      <View className="flex-row items-start gap-3">
        <View className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
          <MailCheck size={18} color="#0644C7" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-sm font-semibold text-gray-900 dark:text-white">
            Follow-up emails
          </Text>

          {!!text.intro && (
            <Text className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
              {text.intro}
            </Text>
          )}
          {!!text.switchedOff && (
            <Text className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              {text.switchedOff}
            </Text>
          )}
          {!!text.promoProblem && (
            <Text className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              {text.promoProblem}
            </Text>
          )}

          {rows.length > 0 && (
            <View className="mt-2">{rows.map(renderRow)}</View>
          )}

          {!!text.sendThanksLabel && (
            <Pressable
              disabled={busy !== null}
              onPress={() =>
                void act(
                  "thanks",
                  (t) => sendVisitThanks(t, visitType, visitId),
                  `${text.thanksName} sent.`,
                )
              }
              style={{ opacity: busy !== null ? 0.5 : 1 }}
              className="mt-3 self-start min-h-[36px] flex-row items-center gap-2 px-3 rounded-lg bg-[#0644C7] active:opacity-90"
            >
              {busy === "thanks" && (
                <ActivityIndicator size="small" color="#FFFFFF" />
              )}
              <Text className="text-xs font-semibold text-white">
                {busy === "thanks" ? "Sending…" : text.sendThanksLabel}
              </Text>
            </Pressable>
          )}

          {!!notice && (
            <Text
              className={`text-xs mt-2 ${notice.ok ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
            >
              {notice.text}
            </Text>
          )}

          <Text className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            Edit the wording and promo code in{" "}
            <Text
              className={summary.thanks_email.id ? "underline" : undefined}
              onPress={
                summary.thanks_email.id
                  ? () => openEmail(summary.thanks_email.id)
                  : undefined
              }
            >
              {text.thanksName}
            </Text>{" "}
            and{" "}
            <Text
              className={summary.review_email.id ? "underline" : undefined}
              onPress={
                summary.review_email.id
                  ? () => openEmail(summary.review_email.id)
                  : undefined
              }
            >
              {text.reviewName}
            </Text>
            .
          </Text>
        </View>
      </View>
    </View>
  );
}
