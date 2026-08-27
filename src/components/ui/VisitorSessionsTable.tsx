import { Feather } from "@expo/vector-icons";
import { memo, type ComponentProps, type ReactNode } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";

import {
  formatSessionDuration,
  type VisitorSessionRow,
} from "../../services/visitorTrackingService";

const PRIMARY = "#0644C7";

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const HEADER_MIN_HEIGHT = 48;
const ROW_MIN_HEIGHT = 76;

type FeatherIconName = ComponentProps<typeof Feather>["name"];

/** Page title when there is one, else its path — the web's pageLabel. */
const pageLabel = (title: string, path: string): string =>
  title || path || "—";

/** "3 pages · 2 clicks · 1 purchase · 4m 10s" — the web's session sub-line. */
function sessionSummary(session: VisitorSessionRow): string {
  const parts = [
    `${session.pageViews} page${session.pageViews === 1 ? "" : "s"}`,
    `${session.clicks} click${session.clicks === 1 ? "" : "s"}`,
  ];
  if (session.conversions > 0) {
    parts.push(
      `${session.conversions} purchase${session.conversions === 1 ? "" : "s"}`,
    );
  }
  parts.push(formatSessionDuration(session.durationMs));
  return parts.join(" · ");
}

/** Tappable phone / email line — opens the dialer or mail app. */
const ContactLine = ({
  icon,
  value,
  url,
  small,
}: {
  icon: FeatherIconName;
  value: string;
  url: string;
  small?: boolean;
}) => (
  <Pressable
    onPress={() => Linking.openURL(url)}
    accessibilityRole="link"
    accessibilityLabel={value}
    className="flex-row items-center gap-1.5 active:opacity-70"
  >
    <Feather name={icon} size={small ? 11 : 12} color="#6B7280" />
    <Text
      numberOfLines={1}
      className={
        small
          ? "flex-1 text-xs text-[#0644C7] dark:text-blue-400"
          : "flex-1 text-sm font-medium text-[#0644C7] dark:text-blue-400"
      }
    >
      {value}
    </Text>
  </Pressable>
);

type RowContext = { onView: () => void };

type Column = {
  key: string;
  label: string;
  width: number;
  render: (session: VisitorSessionRow, ctx: RowContext) => ReactNode;
};

/**
 * Columns mirror the web page's default-visible set, in order and label:
 * Customer (name or Anonymous, email, device · browser) · Phone · Session
 * (entry → exit, with the page/click/purchase/duration line) · Date · Actions.
 * The web's Pages, Clicks, Purchases and Time on site columns are
 * `defaultVisible: false`, so they're folded into the Session cell here too.
 */
const COLUMNS: Column[] = [
  {
    key: "customer",
    label: "Customer",
    width: 210,
    render: (s) => (
      <View>
        {s.guestName ? (
          <Text
            numberOfLines={1}
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            {s.guestName}
          </Text>
        ) : (
          <Text className="text-sm text-gray-400 dark:text-gray-500">
            Anonymous
          </Text>
        )}
        {!!s.guestEmail && (
          <View className="mt-0.5">
            <ContactLine
              icon="mail"
              value={s.guestEmail}
              url={`mailto:${s.guestEmail}`}
              small
            />
          </View>
        )}
        {(!!s.deviceType || !!s.browser) && (
          <Text
            numberOfLines={1}
            className="text-[11px] capitalize text-gray-400 dark:text-gray-500 mt-0.5"
          >
            {[s.deviceType, s.browser].filter(Boolean).join(" · ")}
          </Text>
        )}
      </View>
    ),
  },
  {
    key: "phone",
    label: "Phone",
    width: 170,
    render: (s) =>
      s.guestPhone ? (
        <ContactLine
          icon="phone"
          value={s.guestPhone}
          url={`tel:${s.guestPhone}`}
        />
      ) : (
        <Text className="text-sm text-gray-400 dark:text-gray-500">—</Text>
      ),
  },
  {
    key: "session",
    label: "Session",
    width: 250,
    render: (s) => (
      <View>
        <Text numberOfLines={2} className="text-sm text-gray-800 dark:text-gray-200">
          {pageLabel(s.entryTitle, s.entryPage)}
          {!!s.exitPage && s.exitPage !== s.entryPage && (
            <Text className="text-gray-400 dark:text-gray-500">
              {" → "}
              {pageLabel(s.exitTitle, s.exitPage)}
            </Text>
          )}
        </Text>
        <Text
          numberOfLines={1}
          className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
        >
          {sessionSummary(s)}
        </Text>
      </View>
    ),
  },
  {
    key: "date",
    label: "Date",
    width: 190,
    render: (s) => (
      <View>
        <Text numberOfLines={1} className="text-sm text-gray-800 dark:text-gray-200">
          {s.dateLabel || s.sessionDate || "—"}
        </Text>
        <Text
          numberOfLines={1}
          className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
        >
          {s.firstSeenLabel} – {s.lastSeenLabel} ET
        </Text>
      </View>
    ),
  },
  {
    key: "actions",
    label: "Actions",
    width: 100,
    render: (_s, ctx) => (
      <Pressable
        onPress={ctx.onView}
        accessibilityRole="button"
        accessibilityLabel="View session timeline"
        className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-neutral-800 items-center justify-center active:opacity-70"
      >
        <Feather name="eye" size={15} color={PRIMARY} />
      </Pressable>
    ),
  },
];

/**
 * Table layout for Visitor Tracking — the web grid, scrolled horizontally with
 * fixed column widths so the header and rows stay aligned. Rows are inert; the
 * phone / email links and the eye action own their own touches, so a sideways
 * scroll can't open a timeline.
 */
export const VisitorSessionsTable = memo(function VisitorSessionsTable({
  sessions,
  onViewSession,
}: {
  sessions: VisitorSessionRow[];
  onViewSession: (session: VisitorSessionRow) => void;
}) {
  const tableWidth = COLUMNS.reduce((sum, c) => sum + c.width, 0);

  return (
    <View
      className="rounded-2xl bg-white dark:bg-neutral-900 overflow-hidden border border-gray-100 dark:border-neutral-800 mb-3"
      style={CARD_SHADOW}
    >
      <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled>
        <View style={{ width: tableWidth }}>
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
          {sessions.map((session, i) => {
            const ctx: RowContext = { onView: () => onViewSession(session) };
            return (
              <View
                key={`${session.visitorId}|${session.sessionDate}`}
                accessibilityLabel={`Session for ${session.guestName || "anonymous visitor"}`}
                className={`flex-row items-center ${
                  i < sessions.length - 1
                    ? "border-b border-gray-100 dark:border-neutral-800"
                    : ""
                }`}
                style={{ minHeight: ROW_MIN_HEIGHT }}
              >
                {COLUMNS.map((col) => (
                  <View
                    key={col.key}
                    className="justify-center px-4 py-3"
                    style={{ width: col.width }}
                  >
                    {col.render(session, ctx)}
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
});
