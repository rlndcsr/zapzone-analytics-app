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
import { ConnectedWaiversPanel } from "../../components/ui/ConnectedWaiversPanel";
import { PurchaseQRSheet } from "../../components/ui/PurchaseQRSheet";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { formatDateTimeET } from "../../lib/date/venueTime";
import { markAttractionPurchasesStale } from "../../lib/hooks/useAttractionPurchases";
import { getToken } from "../../lib/session";
import {
  deleteAttractionPurchase,
  fetchAttractionPurchaseDetail,
  type AttractionPurchaseDetail,
} from "../../services/attractionPurchasesService";
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
  const t = m.replace(/[_-]/g, " ").trim();
  if (!t) return "N/A";
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
};

/** "July 27, 2026 at 6:48 PM" — the web `formatLocalDateTime` output, read on
 *  the venue's clock so a phone in another timezone doesn't shift the day. */
function formatDateTime(iso: string | null): string {
  return formatDateTimeET(iso, { showZone: false, fallback: "N/A" });
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

function durationLabel(detail: AttractionPurchaseDetail): string {
  if (!detail.duration) return "Unlimited";
  return `${detail.duration} ${detail.durationUnit}`;
}

/* --- Presentational helpers (match the app's card/section convention) ----- */

/**
 * A titled section. The web page stacks these as bordered bands inside one
 * card; on mobile each is its own card, which reads the same way when scrolled.
 */
const SectionCard = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
    style={CARD_SHADOW}
  >
    <Text className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
      {title}
    </Text>
    {children}
  </View>
);

/**
 * One icon-led field in a section's two-column grid — icon tile, muted label,
 * value, plus optional extra lines beneath (e.g. the customer's email/phone or
 * an attraction's category), exactly as the web page lays them out.
 */
const InfoTile = ({
  icon,
  label,
  value,
  extra,
  valueClass = "text-sm font-medium text-gray-900 dark:text-white",
  full,
  children,
}: {
  icon: IconName;
  label: string;
  value?: string;
  /** Muted lines under the value. Falsy entries are skipped. */
  extra?: (string | null | undefined)[];
  valueClass?: string;
  full?: boolean;
  /** Rendered instead of `value` — used for the Status badge. */
  children?: React.ReactNode;
}) => (
  <View className={`${full ? "w-full" : "w-1/2"} px-1.5 mb-4`}>
    <View className="flex-row items-start gap-2.5">
      <View className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 items-center justify-center">
        <Feather name={icon} size={16} color={PRIMARY} />
      </View>
      <View className="flex-1">
        <Text className="text-xs text-gray-500 dark:text-gray-400">{label}</Text>
        {children ?? <Text className={valueClass}>{value}</Text>}
        {extra
          ?.filter((line): line is string => !!line)
          .map((line) => (
            <Text
              key={line}
              className="text-xs text-gray-500 dark:text-gray-400"
            >
              {line}
            </Text>
          ))}
      </View>
    </View>
  </View>
);

/** Two-column grid wrapper for {@link InfoTile}s. */
const TileGrid = ({ children }: { children: React.ReactNode }) => (
  <View className="flex-row flex-wrap -mx-1.5">{children}</View>
);

const PurchaseDetailsScreen = () => {
  const insets = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const headerIcon = colorScheme === "dark" ? "#FFFFFF" : "#111827";
  const { id } = useLocalSearchParams<{ id?: string }>();
  const purchaseId = id ? Number(id) : null;

  const [detail, setDetail] = useState<AttractionPurchaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
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
      const d = await fetchAttractionPurchaseDetail(token, purchaseId);
      if (!d) {
        setError("Purchase not found");
      } else {
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

  // Re-read the purchase when we come back from Edit Purchase (the web lands on
  // a freshly mounted details route there, so it refetches too).
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
    fetchEntityWaivers(token, "attraction_purchase", purchaseId, controller.signal)
      .then((r) => setWaivers(r))
      .catch(() => {
        if (!controller.signal.aborted) setWaivers(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setWaiversLoading(false);
      });
    return () => controller.abort();
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
              await deleteAttractionPurchase(token, detail.id);
              // Refresh the Manage Purchases list on return (focus-consume).
              markAttractionPurchasesStale();
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
    <View className="bg-white dark:bg-neutral-900 pt-12 pb-4 px-5 w-full border-b border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-3">
        <Pressable
          onPress={() => router.back()}
          className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Feather name="chevron-left" size={20} color={headerIcon} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Purchase Details
          </Text>
          {detail && (
            <Text className="text-xs text-gray-500 dark:text-gray-400">
              Purchase ID: #{detail.id}
            </Text>
          )}
        </View>
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

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <Header />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      >
        {/* Header actions — Edit + View QR Code, as on the web details page. */}
        <View className="flex-row items-center gap-3 mb-4">
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/attractions/edit-purchase",
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
          <Pressable
            onPress={() => setShowQR(true)}
            className="flex-1 flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90"
          >
            <Feather name="maximize" size={16} color="#FFFFFF" />
            <Text className="text-sm font-semibold text-white">
              View QR Code
            </Text>
          </Pressable>
        </View>

        <BulkOrderNotice
          ticketOrderId={detail.ticketOrderId}
          linePosition={detail.linePosition}
        />

        {/* Purchase Information */}
        <SectionCard title="Purchase Information">
          <TileGrid>
            <InfoTile
              icon="user"
              label="Customer"
              value={detail.customerName}
              extra={[detail.email, detail.phone]}
            />
            <InfoTile
              icon="calendar"
              label="Purchase Date"
              value={formatDateTime(detail.createdAt)}
            />
            <InfoTile icon="check-circle" label="Status">
              <View className="flex-row mt-0.5">
                <StatusBadge status={detail.status} />
              </View>
            </InfoTile>
          </TileGrid>
        </SectionCard>

        {/* Attraction Details */}
        <SectionCard title="Attraction Details">
          <TileGrid>
            <InfoTile
              icon="map-pin"
              label="Attraction Name"
              value={detail.attractionName}
              extra={[detail.category]}
            />
            <InfoTile
              icon="tag"
              label="Quantity"
              value={`${detail.quantity} ticket${detail.quantity > 1 ? "s" : ""}`}
            />
            {!!detail.scheduledDate && (
              <InfoTile
                icon="calendar"
                label="Scheduled"
                value={`${formatScheduledDate(detail.scheduledDate)}${
                  detail.scheduledTime
                    ? ` at ${convertTo12Hour(detail.scheduledTime)}`
                    : ""
                }`}
              />
            )}
            <InfoTile
              icon="clock"
              label="Duration"
              value={durationLabel(detail)}
            />
          </TileGrid>
        </SectionCard>

        {/* Purchased Add-ons */}
        {detail.addOns.length > 0 && (
          <SectionCard title="Purchased Add-ons">
            {detail.addOns.map((a) => (
              <View
                key={a.id}
                className="flex-row items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4 mb-2 dark:border-neutral-700 dark:bg-neutral-800/40"
              >
                <View className="flex-1 mr-2">
                  <Text className="text-sm font-medium text-gray-900 dark:text-white">
                    {a.name}
                  </Text>
                  <Text className="text-xs text-gray-400 dark:text-gray-500">
                    Qty: {a.quantity} × {money(a.priceAtPurchase)}
                  </Text>
                </View>
                <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                  {money(a.quantity * a.priceAtPurchase)}
                </Text>
              </View>
            ))}
          </SectionCard>
        )}

        {/* Payment Information */}
        <SectionCard title="Payment Information">
          <TileGrid>
            <InfoTile
              icon="dollar-sign"
              label="Total Amount"
              value={money(detail.totalAmount)}
              valueClass="text-2xl font-medium text-gray-900 dark:text-white"
            />
            <InfoTile
              icon="credit-card"
              label="Payment Method"
              value={prettyMethod(detail.paymentMethod)}
            />
            {!!detail.transactionId && (
              <InfoTile
                icon="file-text"
                label="Transaction ID"
                value={detail.transactionId}
              />
            )}
            {!!detail.paymentId && (
              <InfoTile
                icon="file-text"
                label="Payment ID"
                value={detail.paymentId}
              />
            )}
          </TileGrid>

          {detail.appliedFees.length > 0 && (
            <View>
              <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                Applied Fees
              </Text>
              {detail.appliedFees.map((f, i) => (
                <View
                  key={`${f.name}-${i}`}
                  className="flex-row items-center justify-between py-1"
                >
                  <Text className="flex-1 mr-2 text-sm text-gray-600 dark:text-gray-300">
                    {f.name}{" "}
                    <Text className="text-xs text-gray-400 dark:text-gray-500">
                      ({f.applicationType})
                    </Text>
                  </Text>
                  <Text className="text-sm font-medium text-red-500">
                    {f.applicationType === "additive" ? "+" : ""}
                    {money(f.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </SectionCard>

        {/* Notes */}
        <SectionCard title="Notes">
          <Text
            className={`text-sm ${
              detail.notes
                ? "text-gray-700 dark:text-gray-200"
                : "text-gray-400 dark:text-gray-500 italic"
            }`}
          >
            {detail.notes || "No notes"}
          </Text>
        </SectionCard>

        {/* Waivers */}
        <SectionCard title="Waivers">
          <ConnectedWaiversPanel
            sourceType="attraction_purchase"
            sourceId={purchaseId ?? 0}
            entityLabel="attraction purchase"
            waivers={waivers}
            loading={waiversLoading}
          />
        </SectionCard>

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

      <PurchaseQRSheet
        visible={showQR}
        onClose={() => setShowQR(false)}
        purchaseId={detail.id}
        customerName={detail.customerName}
        attractionName={detail.attractionName}
        status={detail.status}
      />
    </View>
  );
};

export default PurchaseDetailsScreen;
