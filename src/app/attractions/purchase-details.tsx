import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
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

import { PurchaseQRSheet } from "../../components/ui/PurchaseQRSheet";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { markAttractionPurchasesStale } from "../../lib/hooks/useAttractionPurchases";
import { getToken } from "../../lib/session";
import {
  deleteAttractionPurchase,
  fetchAttractionPurchaseDetail,
  type AttractionPurchaseDetail,
} from "../../services/attractionPurchasesService";
import {
  fetchEntityWaivers,
  type ConnectedWaiver,
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

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

const SectionCard = ({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: React.ReactNode;
}) => (
  <View
    className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-4 shadow-sm"
    style={CARD_SHADOW}
  >
    <View className="flex-row items-center gap-2 mb-4">
      <View className="w-8 h-8 rounded-lg bg-[#0644C7]/10 items-center justify-center">
        <Feather name={icon} size={16} color={PRIMARY} />
      </View>
      <Text className="text-base font-bold text-gray-900 dark:text-white">
        {title}
      </Text>
    </View>
    {children}
  </View>
);

const InfoRow = ({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) => (
  <View className="flex-row items-start justify-between py-1.5">
    <Text className="text-sm text-gray-500 dark:text-gray-400 mr-3">{label}</Text>
    <Text
      className={`text-sm font-medium text-gray-900 dark:text-white flex-1 text-right ${valueClass}`}
    >
      {value}
    </Text>
  </View>
);

const WaiverRow = ({ waiver }: { waiver: ConnectedWaiver }) => (
  <View className="flex-row items-start justify-between py-2.5 border-b border-gray-100 dark:border-neutral-800">
    <View className="flex-1 mr-2">
      <Text className="text-sm font-medium text-gray-900 dark:text-white">
        {waiver.adultName}
      </Text>
      <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
        {waiver.template ? `${waiver.template} · ` : ""}
        {waiver.selectedDate ?? ""}
        {waiver.minors.length > 0 ? ` · Minors: ${waiver.minors.join(", ")}` : ""}
      </Text>
    </View>
    <StatusBadge status={waiver.status} />
  </View>
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
        <View className="items-center">
          <Text className="text-gray-900 dark:text-white text-lg font-bold">
            Purchase Details
          </Text>
          {detail && (
            <Text className="text-xs text-gray-400 dark:text-gray-500">
              Purchase ID: #{detail.id}
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

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <Header />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      >
        {/* Primary action: View QR Code */}
        <Pressable
          onPress={() => setShowQR(true)}
          className="flex-row items-center justify-center gap-2 bg-[#0644C7] py-3.5 rounded-xl active:opacity-90 mb-4"
        >
          <Feather name="maximize" size={16} color="#FFFFFF" />
          <Text className="text-sm font-semibold text-white">View QR Code</Text>
        </Pressable>

        {/* Purchase Information */}
        <SectionCard icon="user" title="Purchase Information">
          <Text className="text-xs text-gray-400 dark:text-gray-500 mb-1">
            Customer
          </Text>
          <Text className="text-base font-semibold text-gray-900 dark:text-white">
            {detail.customerName}
          </Text>
          {!!detail.email && (
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {detail.email}
            </Text>
          )}
          {!!detail.phone && (
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {detail.phone}
            </Text>
          )}

          <View className="mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
            <InfoRow label="Purchase Date" value={formatDateTime(detail.createdAt)} />
            <View className="flex-row items-center justify-between py-1.5">
              <Text className="text-sm text-gray-500 dark:text-gray-400">Status</Text>
              <StatusBadge status={detail.status} />
            </View>
          </View>
        </SectionCard>

        {/* Attraction Details */}
        <SectionCard icon="zap" title="Attraction Details">
          <InfoRow label="Attraction" value={detail.attractionName} />
          {!!detail.category && <InfoRow label="Category" value={detail.category} />}
          <InfoRow
            label="Quantity"
            value={`${detail.quantity} ticket${detail.quantity > 1 ? "s" : ""}`}
          />
          {!!detail.scheduledDate && (
            <InfoRow
              label="Scheduled Date"
              value={formatScheduledDate(detail.scheduledDate)}
            />
          )}
          {!!detail.scheduledTime && (
            <InfoRow
              label="Scheduled Time"
              value={convertTo12Hour(detail.scheduledTime)}
            />
          )}
          <InfoRow label="Duration" value={durationLabel(detail)} />
        </SectionCard>

        {/* Purchased Add-ons */}
        {detail.addOns.length > 0 && (
          <SectionCard icon="plus-circle" title="Purchased Add-ons">
            {detail.addOns.map((a) => (
              <View
                key={a.id}
                className="flex-row items-center justify-between py-2 border-b border-gray-100 dark:border-neutral-800"
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
        <SectionCard icon="credit-card" title="Payment Information">
          <View className="flex-row items-start justify-between py-1.5">
            <Text className="text-sm text-gray-500 dark:text-gray-400">
              Total Amount
            </Text>
            <Text className="text-2xl font-bold text-gray-900 dark:text-white">
              {money(detail.totalAmount)}
            </Text>
          </View>
          <InfoRow label="Payment Method" value={prettyMethod(detail.paymentMethod)} />
          {!!detail.transactionId && (
            <InfoRow label="Transaction ID" value={detail.transactionId} />
          )}
          {!!detail.paymentId && (
            <InfoRow label="Payment ID" value={detail.paymentId} />
          )}

          {detail.appliedFees.length > 0 && (
            <View className="mt-3 pt-3 border-t border-gray-100 dark:border-neutral-800">
              <Text className="text-xs font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
                Applied Fees
              </Text>
              {detail.appliedFees.map((f, i) => (
                <View
                  key={`${f.name}-${i}`}
                  className="flex-row items-center justify-between py-1.5"
                >
                  <Text className="text-sm text-gray-700 dark:text-gray-200">
                    {f.name}
                  </Text>
                  <Text className="text-sm font-medium text-gray-900 dark:text-white">
                    +{money(f.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </SectionCard>

        {/* Notes */}
        <SectionCard icon="file-text" title="Notes">
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
        <SectionCard icon="shield" title="Waivers">
          {waiversLoading ? (
            <View className="py-4 items-center">
              <ActivityIndicator color={PRIMARY} />
            </View>
          ) : !waivers || waivers.summary.total === 0 ? (
            <Text className="text-sm text-gray-400 dark:text-gray-500">
              No waiver connected to this attraction purchase.
            </Text>
          ) : (
            <>
              <View className="flex-row items-center gap-3 mb-2">
                <Text className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {waivers.summary.completed} complete
                </Text>
                {waivers.summary.pending > 0 && (
                  <Text className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    {waivers.summary.pending} pending
                  </Text>
                )}
              </View>
              {waivers.waivers.map((w) => (
                <WaiverRow key={w.id} waiver={w} />
              ))}
            </>
          )}
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
