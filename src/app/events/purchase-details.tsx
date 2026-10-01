import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";

import { BulkOrderNotice } from "../../components/ui/BulkOrderNotice";
import { VisitFollowUpCard } from "../../components/ui/VisitFollowUpCard";
import { WaiverConnectionCard } from "../../components/ui/WaiverConnectionCard";
import { formatDateTimeET } from "../../lib/date/venueTime";
import { markEventPurchasesStale } from "../../lib/hooks/useEventPurchases";
import { resolvePaymentState } from "../../lib/payments/paymentState";
import { getToken } from "../../lib/session";
import {
  deleteEventPurchase,
  fetchEventPurchaseDetail,
  type EventPurchaseDetail,
} from "../../services/eventPurchasesService";
import {
  fetchEntityWaivers,
  type EntityWaivers,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";
type IconName = ComponentProps<typeof Feather>["name"];

const CARD_SHADOW = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const money = (n: number) =>
  `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const prettyMethod = (m: string): string => {
  const t = m.replace(/[_.-]/g, " ").trim();
  if (!t) return "N/A";
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Instant in venue time — no zone suffix, matching the web detail page. */
function formatDateTime(iso: string | null): string {
  return formatDateTimeET(iso, { showZone: false });
}

function formatScheduledDate(dateStr: string): string {
  const d = new Date(dateStr.substring(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function convertTo12Hour(time: string): string {
  const [hStr, mStr] = time.split(":");
  let hour = Number(hStr);
  const meridian = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${mStr ?? "00"} ${meridian}`;
}

/** The web's statusConfig labels — "checked-in" reads "Checked In", not "Checked-in". */
const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  "checked-in": "Checked In",
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

/** The web statusConfig pill colours. */
const STATUS_PILL: Record<string, string> = {
  confirmed: "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300",
  "checked-in": "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300",
  pending: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300",
  completed: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300",
  cancelled: "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300",
};

/* --- Presentational helpers (mirror the web ViewEventPurchase layout) ----- */

/**
 * One section of the details card — the web stacks these inside a single card,
 * divided by a hairline; Payment Information and Notes sit on a grey wash.
 */
const Section = ({
  title,
  tinted = false,
  last = false,
  children,
}: {
  title?: string;
  tinted?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) => (
  <View
    className={`p-5 ${
      last ? "" : "border-b border-gray-100 dark:border-neutral-800"
    } ${tinted ? "bg-gray-50 dark:bg-neutral-800/40" : ""}`}
  >
    {!!title && (
      <Text className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
        {title}
      </Text>
    )}
    {children}
  </View>
);

/** Two-up grid of tiles; `full` tiles take the whole row. */
const TileGrid = ({ children }: { children: React.ReactNode }) => (
  <View className="flex-row flex-wrap -mx-1.5">{children}</View>
);

/** Icon tile: tinted square icon, grey label, value (or custom children) below. */
const Tile = ({
  icon,
  label,
  value,
  mono = false,
  full = false,
  children,
}: {
  icon: IconName;
  label: string;
  value?: string;
  mono?: boolean;
  full?: boolean;
  children?: React.ReactNode;
}) => (
  <View
    className="flex-row items-start gap-3 px-1.5 py-2"
    style={{ width: full ? "100%" : "50%" }}
  >
    <View className="w-9 h-9 rounded-lg bg-[#0644C7]/10 items-center justify-center">
      <Feather name={icon} size={17} color={PRIMARY} />
    </View>
    <View className="flex-1">
      <Text className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
        {label}
      </Text>
      {children ?? (
        <Text
          className={`font-medium text-gray-900 dark:text-white ${
            mono ? "font-mono text-xs" : "text-sm"
          }`}
        >
          {value}
        </Text>
      )}
    </View>
  </View>
);

const Pill = ({ text, className }: { text: string; className: string }) => (
  <View className={`self-start px-3 py-1 rounded-full ${className}`}>
    <Text className={`text-xs font-medium ${className}`}>{text}</Text>
  </View>
);

const EventPurchaseDetailsScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const { id } = useLocalSearchParams<{ id?: string }>();
  const purchaseId = id ? Number(id) : null;

  const [detail, setDetail] = useState<EventPurchaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [waivers, setWaivers] = useState<EntityWaivers | null>(null);
  const [waiversLoading, setWaiversLoading] = useState(true);

  const deleteLockRef = useRef(false);

  const loadDetail = useCallback(async () => {
    if (purchaseId == null || Number.isNaN(purchaseId)) {
      setError("Purchase not found");
      setLoading(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const d = await fetchEventPurchaseDetail(token, purchaseId);
      if (!d) setError("Purchase not found");
      else {
        setDetail(d);
        setError(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load purchase details",
      );
    } finally {
      setLoading(false);
    }
  }, [purchaseId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Re-read the purchase when we come back from Edit Event Purchase (the web
  // lands on a freshly mounted details route there, so it refetches too).
  const firstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocusRef.current) {
        firstFocusRef.current = false;
        return;
      }
      loadDetail();
    }, [loadDetail]),
  );

  // Connected waivers (mirrors the web WaiverConnectionPanel), loaded on demand.
  useEffect(() => {
    if (purchaseId == null || Number.isNaN(purchaseId)) {
      setWaiversLoading(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setWaiversLoading(false);
      return;
    }
    const controller = new AbortController();
    setWaiversLoading(true);
    fetchEntityWaivers(token, "event_purchase", purchaseId, controller.signal)
      .then((r) => setWaivers(r))
      .catch(() => {
        if (!controller.signal.aborted) setWaivers(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setWaiversLoading(false);
      });
    return () => controller.abort();
  }, [purchaseId]);

  // Re-read after a check-in from the waivers card, so its counts follow the server.
  const reloadWaivers = useCallback(async () => {
    const token = getToken();
    if (!token || purchaseId == null || Number.isNaN(purchaseId)) return;
    try {
      setWaivers(await fetchEntityWaivers(token, "event_purchase", purchaseId));
    } catch {
      // Keep what is showing; the card reports its own action errors.
    }
  }, [purchaseId]);

  const confirmDelete = () => {
    if (!detail) return;
    Alert.alert(
      "Delete purchase",
      "Are you sure you want to delete this purchase? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (deleteLockRef.current) return;
            const token = getToken();
            if (!token) {
              Alert.alert("Not signed in", "Please sign in again.");
              return;
            }
            deleteLockRef.current = true;
            setDeleting(true);
            try {
              await deleteEventPurchase(token, detail.id);
              markEventPurchasesStale();
              router.back();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error
                  ? err.message
                  : "Could not delete the purchase.",
              );
            } finally {
              setDeleting(false);
              deleteLockRef.current = false;
            }
          },
        },
      ],
    );
  };

  const Header = () => (
    <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={() => router.back()}
          className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={20} color={headerIcon} />
        </Pressable>
        <View className="items-center flex-1 mx-2">
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Event Purchase Details
          </Text>
          {detail && !!detail.referenceNumber && (
            <Text
              className="text-xs text-gray-500 dark:text-gray-400"
              numberOfLines={1}
            >
              Reference: {detail.referenceNumber}
            </Text>
          )}
        </View>
        <View style={{ width: 36 }} />
      </View>
    </View>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <Header />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={PRIMARY} />
        </View>
      </View>
    );
  }

  if (error || !detail) {
    return (
      <View className="flex-1 bg-gray-50 dark:bg-black">
        <Header />
        <View className="flex-1 items-center justify-center px-8">
          <Feather name="alert-circle" size={40} color="#9CA3AF" />
          <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg mt-3">
            {error ?? "Purchase not found"}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-5 px-5 py-3 rounded-full bg-[#0644C7]"
          >
            <Text className="text-white font-semibold">Back to Purchases</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const paidInFull = detail.amountPaid >= detail.totalAmount;
  // "Paid in Full" / "Partially Paid" / … — the same resolver the web uses.
  const payment = resolvePaymentState({
    payment_status: detail.paymentStatus,
    total_amount: detail.totalAmount,
    amount_paid: detail.amountPaid,
  });

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <Header />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      >
        {/* Header action — Edit, the only one on the web details page. */}
        <View className="flex-row items-center gap-3 mb-4">
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/events/edit-purchase",
                params: { id: String(detail.id), from: "details" },
              })
            }
            className="flex-1 flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:opacity-70"
          >
            <Feather name="edit-2" size={16} color="#6B7280" />
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Edit
            </Text>
          </Pressable>
        </View>

        <BulkOrderNotice
          ticketOrderId={detail.ticketOrderId}
          linePosition={detail.linePosition}
        />

        {/* One card, sectioned like the web ViewEventPurchase. */}
        <View
          className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-neutral-800 overflow-hidden mb-4"
          style={CARD_SHADOW}
        >
          {/* Purchase Information */}
          <Section title="Purchase Information">
            <TileGrid>
              <Tile icon="user" label="Customer" full>
                <Text className="text-sm font-medium text-gray-900 dark:text-white">
                  {detail.customerName}
                </Text>
                {!!detail.email && (
                  <Text className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {detail.email}
                  </Text>
                )}
                {!!detail.phone && (
                  <Text className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {detail.phone}
                  </Text>
                )}
              </Tile>
              <Tile
                icon="hash"
                label="Reference Number"
                value={detail.referenceNumber || "—"}
                mono
              />
              <Tile icon="check-circle" label="Status">
                <Pill
                  text={STATUS_LABEL[detail.status] ?? detail.status}
                  className={
                    STATUS_PILL[detail.status] ??
                    "bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-gray-200"
                  }
                />
              </Tile>
              <Tile
                icon="calendar"
                label="Created At"
                value={formatDateTime(detail.createdAt)}
                full
              />
            </TileGrid>
          </Section>

          {/* Event Details */}
          <Section title="Event Details">
            <TileGrid>
              <Tile icon="map-pin" label="Event Name" full>
                <Text className="text-sm font-medium text-gray-900 dark:text-white">
                  {detail.eventName}
                </Text>
                {!!detail.locationName && (
                  <Text className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                    {detail.locationName}
                  </Text>
                )}
              </Tile>
              <Tile
                icon="tag"
                label="Quantity"
                value={`${detail.quantity} ticket${detail.quantity > 1 ? "s" : ""}`}
              />
              {!!detail.purchaseDate && (
                <Tile icon="calendar" label="Scheduled">
                  <Text className="text-sm font-medium text-gray-900 dark:text-white">
                    {formatScheduledDate(detail.purchaseDate)}
                    {!!detail.purchaseTime && (
                      <Text className="font-normal text-gray-600 dark:text-gray-400">
                        {` at ${convertTo12Hour(detail.purchaseTime)}`}
                      </Text>
                    )}
                  </Text>
                </Tile>
              )}
            </TileGrid>
          </Section>

          {/* Purchased Add-ons */}
          {detail.addOns.length > 0 && (
            <Section title="Purchased Add-ons">
              <View className="gap-3">
                {detail.addOns.map((a) => (
                  <View
                    key={a.id}
                    className="flex-row items-center justify-between rounded-lg border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-800/40 p-4"
                  >
                    <View className="flex-1 mr-2">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">
                        {a.name}
                      </Text>
                      <Text className="text-xs text-gray-500 dark:text-gray-400">
                        Qty: {a.quantity} × {money(a.priceAtPurchase)}
                      </Text>
                    </View>
                    <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                      {money(a.quantity * a.priceAtPurchase)}
                    </Text>
                  </View>
                ))}
              </View>
            </Section>
          )}

          {/* Event Features — what the ticket includes, off the parent event.
              Hidden when the event lists none, like the web section. */}
          {detail.eventFeatures.length > 0 && (
            <Section title="Event Features">
              {detail.eventFeatures.map((feature, i) => (
                <View key={i} className="flex-row items-start gap-2.5 py-0.5">
                  <View
                    className="w-1 h-1 rounded-full bg-gray-700 dark:bg-gray-300"
                    style={{ marginTop: 8 }}
                  />
                  <Text className="flex-1 text-sm leading-5 text-gray-700 dark:text-gray-200">
                    {feature}
                  </Text>
                </View>
              ))}
            </Section>
          )}

          {/* Payment Information */}
          <Section
            title="Payment Information"
            tinted
            last={
              detail.customFieldResponses.length === 0 &&
              !detail.notes &&
              !detail.specialRequests
            }
          >
            <TileGrid>
              <Tile icon="dollar-sign" label="Total Amount">
                <Text className="text-2xl font-medium text-gray-900 dark:text-white">
                  {money(detail.totalAmount)}
                </Text>
              </Tile>
              <Tile icon="dollar-sign" label="Amount Paid">
                <Text
                  className={`text-2xl font-medium ${
                    paidInFull
                      ? "text-green-600 dark:text-green-400"
                      : "text-orange-600 dark:text-orange-400"
                  }`}
                >
                  {money(detail.amountPaid)}
                </Text>
              </Tile>
              <Tile
                icon="credit-card"
                label="Payment Method"
                value={prettyMethod(detail.paymentMethod)}
              />
              {!!detail.cardLabel && (
                <Tile icon="credit-card" label="Card Used">
                  <Text className="text-sm font-medium text-gray-900 dark:text-white">
                    {detail.cardLabel}
                  </Text>
                  <Text className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    Ask the guest to confirm the last four digits.
                  </Text>
                </Tile>
              )}
              <Tile icon="check-circle" label="Payment Status">
                <Pill text={payment.label} className={payment.pillClass} />
              </Tile>
              {!!detail.transactionId && (
                <Tile
                  icon="file-text"
                  label="Transaction ID"
                  value={detail.transactionId}
                  mono
                />
              )}
              {detail.discountAmount > 0 && (
                <Tile icon="dollar-sign" label="Discount">
                  <Text className="text-sm font-medium text-green-600 dark:text-green-400">
                    -{money(detail.discountAmount)}
                  </Text>
                </Tile>
              )}
            </TileGrid>

            {/* Applied Fees — additive fees were charged on top (red "+"),
                inclusive ones sit inside the price, as the web shows them. */}
            {detail.appliedFees.length > 0 && (
              <View className="mt-3">
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Applied Fees
                </Text>
                {detail.appliedFees.map((f, i) => (
                  <View
                    key={`${f.name}-${i}`}
                    className="flex-row items-center justify-between py-0.5"
                  >
                    <Text className="flex-1 mr-3 text-sm text-gray-600 dark:text-gray-300">
                      {f.name}
                      <Text className="text-xs text-gray-400">
                        {` (${f.applicationType})`}
                      </Text>
                    </Text>
                    <Text
                      className={`text-sm ${
                        f.applicationType === "additive"
                          ? "text-red-600 dark:text-red-400"
                          : "text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {f.applicationType === "additive" ? "+" : ""}
                      {money(f.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {detail.appliedDiscounts.length > 0 && (
              <View className="mt-3">
                <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Applied Discounts
                </Text>
                {detail.appliedDiscounts.map((d, i) => (
                  <View
                    key={`${d.name}-${i}`}
                    className="flex-row items-center justify-between py-0.5"
                  >
                    <Text className="flex-1 mr-3 text-sm text-gray-600 dark:text-gray-300">
                      {d.name}
                      {!!d.type && (
                        <Text className="text-xs text-gray-400">{` (${d.type})`}</Text>
                      )}
                    </Text>
                    <Text className="text-sm text-green-600 dark:text-green-400">
                      -{money(d.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Section>

          {/* Extra confirmations — the web's CustomFieldAnswers block. */}
          {detail.customFieldResponses.length > 0 && (
            <Section last={!detail.notes && !detail.specialRequests}>
              <Text className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">
                Extra confirmations
              </Text>
              {detail.customFieldResponses.map((r) => (
                <View key={r.id} className="flex-row items-start gap-2 py-0.5">
                  <Feather
                    name={r.value ? "check" : "x"}
                    size={15}
                    color={r.value ? "#16a34a" : "#9ca3af"}
                    style={{ marginTop: 2 }}
                  />
                  <Text
                    className={`flex-1 text-sm ${
                      r.value
                        ? "text-gray-800 dark:text-gray-100"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {r.label}
                  </Text>
                </View>
              ))}
            </Section>
          )}

          {/* Notes — only when there are some, like the web. */}
          {(!!detail.notes || !!detail.specialRequests) && (
            <Section title="Notes" tinted last>
              {!!detail.notes && (
                <View className={detail.specialRequests ? "mb-3" : ""}>
                  <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Notes
                  </Text>
                  <Text className="text-sm text-gray-700 dark:text-gray-200 leading-5">
                    {detail.notes}
                  </Text>
                </View>
              )}
              {!!detail.specialRequests && (
                <View>
                  <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Special Requests
                  </Text>
                  <Text className="text-sm text-gray-700 dark:text-gray-200 leading-5">
                    {detail.specialRequests}
                  </Text>
                </View>
              )}
            </Section>
          )}
        </View>

        {/* Follow-up emails, then Waivers — the web's order under the card. */}
        {detail.status !== "cancelled" && (
          <VisitFollowUpCard
            visitType="event_purchase"
            visitId={detail.id}
            refreshKey={detail.status}
            className="mb-4"
          />
        )}

        <View className="mb-4">
          <WaiverConnectionCard
            type="event_purchase"
            id={detail.id}
            waivers={waivers}
            loading={waiversLoading}
            onChanged={reloadWaivers}
          />
        </View>

        {/* Delete Purchase */}
        <Pressable
          onPress={confirmDelete}
          disabled={deleting}
          className="flex-row items-center justify-center gap-2 py-3.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-neutral-900 active:opacity-70 mt-1"
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#dc2626" />
          ) : (
            <>
              <Feather name="trash-2" size={16} color="#dc2626" />
              <Text className="text-sm font-semibold text-red-600">
                Delete Purchase
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
};

export default EventPurchaseDetailsScreen;
