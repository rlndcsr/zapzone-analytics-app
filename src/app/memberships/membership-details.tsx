import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import {
  useCallback,
  useEffect,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomSheet } from "../../components/ui/BottomSheet";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { markMembershipsStale } from "../../lib/membershipsStale";
import { getToken } from "../../lib/session";
import {
  addMembershipNote,
  cancelMembership,
  deleteMembership,
  extendMembership,
  fetchMembershipDetail,
  freezeMembership,
  retryMembershipPayment,
  unfreezeMembership,
  updateMembershipPaymentMethod,
  updateMembershipStatus,
  uploadMembershipPhoto,
  type MembershipDetail,
} from "../../services/membershipsService";

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
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Date + time, e.g. "Jul 23, 2026, 10:50 AM"; em-dash when absent.
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

// Date only, e.g. "7/23/2026"; em-dash when absent.
function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

const VISIT_COLOR: Record<string, string> = {
  allowed: "#16A34A",
  override: "#2563EB",
  denied: "#DC2626",
};

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
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) => (
  <View className="flex-row items-start justify-between py-1.5">
    <Text className="text-sm text-gray-500 dark:text-gray-400 mr-3">{label}</Text>
    <Text
      className={`text-sm font-medium text-gray-900 dark:text-white flex-1 text-right ${
        mono ? "font-mono text-xs" : ""
      }`}
    >
      {value}
    </Text>
  </View>
);

// A pill button used in the Actions card.
const ActionButton = ({
  icon,
  label,
  onPress,
  variant = "outline",
  busy = false,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "danger";
  busy?: boolean;
  disabled?: boolean;
}) => {
  const base =
    variant === "primary"
      ? "bg-[#0644C7]"
      : variant === "danger"
        ? "border border-red-200 dark:border-red-900/50"
        : "border border-gray-200 dark:border-neutral-700";
  const tint = variant === "primary" ? "#FFFFFF" : variant === "danger" ? "#DC2626" : "#374151";
  const textColor =
    variant === "primary"
      ? "text-white"
      : variant === "danger"
        ? "text-red-600 dark:text-red-400"
        : "text-gray-700 dark:text-gray-200";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      className={`flex-row items-center justify-center gap-2 px-3 py-2.5 rounded-xl ${base} ${
        disabled || busy ? "opacity-50" : "active:opacity-80"
      }`}
    >
      {busy ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <Feather name={icon} size={15} color={tint} />
      )}
      <Text className={`text-xs font-semibold ${textColor}`}>{label}</Text>
    </Pressable>
  );
};

const EmptyLine = ({ text }: { text: string }) => (
  <Text className="text-sm text-gray-400 dark:text-gray-500 py-1">{text}</Text>
);

const MembershipDetailsScreen = () => {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const headerIcon = scheme === "dark" ? "#FFFFFF" : "#111827";
  const { id } = useLocalSearchParams<{ id?: string }>();
  const membershipId = id ? Number(id) : null;

  const [detail, setDetail] = useState<MembershipDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Inline editors.
  const [noteText, setNoteText] = useState("");
  const [pmText, setPmText] = useState("");
  const [showExtend, setShowExtend] = useState(false);
  const [extendDate, setExtendDate] = useState("");
  const [extendNote, setExtendNote] = useState("");

  const loadDetail = useCallback(async () => {
    if (membershipId == null || Number.isNaN(membershipId)) {
      setError("Membership not found");
      setLoading(false);
      return;
    }
    const token = getToken();
    if (!token) {
      setError("Not signed in");
      setLoading(false);
      return;
    }
    try {
      const d = await fetchMembershipDetail(token, membershipId);
      setDetail(d);
      setPmText(d.paymentMethodLabel ?? "");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load membership");
    } finally {
      setLoading(false);
    }
  }, [membershipId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // Run a mutation, then refresh this screen + flag the list stale.
  const runAction = useCallback(
    async (key: string, fn: (token: string, id: number) => Promise<void>) => {
      const token = getToken();
      if (!token || membershipId == null) return;
      setBusy(key);
      try {
        await fn(token, membershipId);
        markMembershipsStale();
        await loadDetail();
      } catch (err) {
        Alert.alert(
          "Action failed",
          err instanceof Error ? err.message : "Please try again.",
        );
      } finally {
        setBusy(null);
      }
    },
    [membershipId, loadDetail],
  );

  const confirmCancel = (effective: "immediate" | "end_of_term") =>
    Alert.alert(
      effective === "immediate" ? "Cancel now?" : "Cancel at end of term?",
      effective === "immediate"
        ? "The membership ends immediately."
        : "The membership stays active until the current term ends.",
      [
        { text: "Back", style: "cancel" },
        {
          text: "Confirm",
          style: "destructive",
          onPress: () =>
            runAction("cancel", (t, mid) => cancelMembership(t, mid, effective)),
        },
      ],
    );

  const confirmDelete = () =>
    Alert.alert(
      "Delete membership?",
      "This permanently removes the canceled membership. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const token = getToken();
            if (!token || membershipId == null) return;
            setBusy("delete");
            try {
              await deleteMembership(token, membershipId);
              markMembershipsStale();
              router.back();
            } catch (err) {
              Alert.alert(
                "Delete failed",
                err instanceof Error ? err.message : "Please try again.",
              );
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );

  const submitExtend = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(extendDate.trim())) {
      Alert.alert("Invalid date", "Use the format YYYY-MM-DD.");
      return;
    }
    const date = extendDate.trim();
    const note = extendNote.trim() || undefined;
    setShowExtend(false);
    runAction("extend", (t, mid) => extendMembership(t, mid, date, note));
  };

  const addNote = async () => {
    const content = noteText.trim();
    if (!content) return;
    setNoteText("");
    await runAction("note", (t, mid) => addMembershipNote(t, mid, content));
  };

  const savePm = async () => {
    await runAction("pm", (t, mid) => updateMembershipPaymentMethod(t, mid, pmText.trim()));
  };

  const pickPhoto = async () => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission needed", "Allow photo library access to upload a photo.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (result.canceled) return;
      const a = result.assets?.[0];
      if (!a?.uri) return;
      await runAction("photo", (t, mid) =>
        uploadMembershipPhoto(t, mid, {
          uri: a.uri,
          name: a.fileName ?? "membership-photo.jpg",
          type: a.mimeType ?? "image/jpeg",
        }),
      );
    } catch {
      Alert.alert("Photo error", "Could not open the image picker.");
    }
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
            Membership Details
          </Text>
          {!!detail && (
            <Text
              className="text-xs text-gray-400 dark:text-gray-500"
              numberOfLines={1}
            >
              {detail.memberName}
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
            {error ?? "Membership not found"}
          </Text>
          <Pressable
            onPress={() => router.back()}
            className="mt-5 px-5 py-3 rounded-full bg-[#0644C7]"
          >
            <Text className="text-white font-semibold">Back to Memberships</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const s = detail.status;
  const term =
    detail.termStart || detail.termEnd
      ? `${formatDate(detail.termStart)} → ${formatDate(detail.termEnd)}`
      : "—";

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      <Header />

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}
      >
        {/* Member */}
        <SectionCard icon="user" title="Member">
          <View className="flex-row items-center gap-3">
            {detail.photoUrl ? (
              <Image
                source={{ uri: detail.photoUrl }}
                style={{ width: 56, height: 56, borderRadius: 12 }}
              />
            ) : (
              <View className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-neutral-800 items-center justify-center">
                <Feather name="camera" size={20} color="#9CA3AF" />
              </View>
            )}
            <View className="flex-1">
              <Text className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                Pass Holder
              </Text>
              <Text
                className="text-base font-bold text-gray-900 dark:text-white"
                numberOfLines={1}
              >
                {detail.memberName}
              </Text>
              {!!detail.email && (
                <Text
                  className="text-sm text-gray-500 dark:text-gray-400"
                  numberOfLines={1}
                >
                  {detail.email}
                </Text>
              )}
            </View>
            <StatusBadge status={detail.status} />
          </View>
        </SectionCard>

        {/* Actions */}
        <SectionCard icon="zap" title="Actions">
          <View className="flex-row flex-wrap gap-2">
            <ActionButton
              icon="calendar"
              label="Extend"
              onPress={() => {
                setExtendDate(detail.termEnd ? detail.termEnd.slice(0, 10) : "");
                setExtendNote("");
                setShowExtend(true);
              }}
              busy={busy === "extend"}
            />
            {s === "past_due" && (
              <ActionButton
                icon="refresh-cw"
                label="Retry Payment"
                onPress={() => runAction("retry", retryMembershipPayment)}
                busy={busy === "retry"}
              />
            )}
            {s === "active" && (
              <ActionButton
                icon="pause-circle"
                label="Freeze"
                onPress={() => runAction("freeze", (t, mid) => freezeMembership(t, mid))}
                busy={busy === "freeze"}
              />
            )}
            {s === "frozen" && (
              <ActionButton
                icon="play-circle"
                label="Unfreeze"
                onPress={() => runAction("unfreeze", (t, mid) => unfreezeMembership(t, mid))}
                busy={busy === "unfreeze"}
              />
            )}
            {s === "suspended" && (
              <ActionButton
                icon="play-circle"
                label="Reactivate"
                onPress={() =>
                  runAction("reactivate", (t, mid) => updateMembershipStatus(t, mid, "active"))
                }
                busy={busy === "reactivate"}
              />
            )}
            {s !== "canceled" && s !== "expired" && (
              <>
                <ActionButton
                  icon="clock"
                  label="Cancel (Term)"
                  onPress={() => confirmCancel("end_of_term")}
                  busy={busy === "cancel"}
                />
                <ActionButton
                  icon="x-circle"
                  label="Cancel Now"
                  variant="danger"
                  onPress={() => confirmCancel("immediate")}
                  busy={busy === "cancel"}
                />
              </>
            )}
            {s === "canceled" && (
              <ActionButton
                icon="trash-2"
                label="Delete"
                variant="danger"
                onPress={confirmDelete}
                busy={busy === "delete"}
              />
            )}
            <ActionButton
              icon="camera"
              label="Upload Photo"
              onPress={pickPhoto}
              busy={busy === "photo"}
            />
          </View>
        </SectionCard>

        {/* Plan & Term */}
        <SectionCard icon="clipboard" title="Plan & Term">
          <InfoRow label="Plan" value={detail.planName} />
          <InfoRow label="Started" value={formatDate(detail.startedAt)} />
          <InfoRow label="Membership Term" value={term} />
          <InfoRow
            label="Visits Used"
            value={detail.visitsUsed != null ? String(detail.visitsUsed) : "—"}
          />
          <InfoRow
            label="Visits Remaining"
            value={detail.visitsRemaining != null ? String(detail.visitsRemaining) : "∞"}
          />
          <InfoRow label="Home Location" value={detail.homeLocationName || "—"} />
          <InfoRow label="QR Token" value={detail.qrToken || "—"} mono />
        </SectionCard>

        {/* Recent Visits */}
        <SectionCard icon="clock" title="Recent Visits">
          {detail.visits.length === 0 ? (
            <EmptyLine text="No visits yet." />
          ) : (
            detail.visits.slice(0, 20).map((v) => (
              <View
                key={v.id}
                className="flex-row items-start justify-between py-2 border-b border-gray-100 dark:border-neutral-800"
              >
                <View className="flex-1 mr-2">
                  <Text className="text-sm text-gray-900 dark:text-white">
                    {formatDateTime(v.visitedAt)}
                  </Text>
                  {!!v.denialReason && (
                    <Text className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                      {v.denialReason}
                    </Text>
                  )}
                  <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {v.locationName || "—"}
                    {v.staffName ? ` · ${v.staffName}` : ""}
                    {v.countedAgainstUsage ? "" : " · not counted"}
                  </Text>
                </View>
                <Text
                  className="text-xs font-semibold capitalize"
                  style={{ color: VISIT_COLOR[v.result] ?? "#DC2626" }}
                >
                  {v.result}
                </Text>
              </View>
            ))
          )}
        </SectionCard>

        {/* Payments */}
        <SectionCard icon="credit-card" title="Payments">
          {detail.payments.length === 0 ? (
            <EmptyLine text="No payments recorded." />
          ) : (
            detail.payments.map((p) => (
              <View
                key={p.id}
                className="py-2 border-b border-gray-100 dark:border-neutral-800"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <StatusBadge status={p.status} />
                    {!!p.retryAttempt && (
                      <Text className="text-xs text-gray-400 dark:text-gray-500">
                        retry #{p.retryAttempt}
                      </Text>
                    )}
                  </View>
                  <Text className="text-sm font-semibold text-gray-900 dark:text-white">
                    {money(p.amount)}
                  </Text>
                </View>
                {!!p.description && (
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {p.description}
                  </Text>
                )}
                <View className="flex-row items-center justify-between mt-0.5">
                  <Text className="text-xs text-gray-400 dark:text-gray-500">
                    {formatDateTime(p.chargedAt ?? p.failedAt)}
                  </Text>
                  {!!p.transactionId && (
                    <Text
                      className="text-xs font-mono text-gray-400 dark:text-gray-500"
                      numberOfLines={1}
                    >
                      txn: {p.transactionId}
                    </Text>
                  )}
                </View>
                {p.status === "failed" && !!p.failureReason && (
                  <Text
                    className="text-xs text-red-600 dark:text-red-400 mt-0.5"
                    numberOfLines={1}
                  >
                    {p.failureReason}
                  </Text>
                )}
              </View>
            ))
          )}
        </SectionCard>

        {/* Staff Notes */}
        <SectionCard icon="message-square" title="Staff Notes">
          <View className="flex-row items-center gap-2 mb-3">
            <View className="flex-1 rounded-xl px-3.5 py-2.5 border border-gray-200 dark:border-neutral-800">
              <TextInput
                value={noteText}
                onChangeText={setNoteText}
                placeholder="Add a note…"
                placeholderTextColor="#9CA3AF"
                onSubmitEditing={addNote}
                className="text-sm text-gray-900 dark:text-white"
                style={{ paddingVertical: 0 }}
              />
            </View>
            <Pressable
              onPress={addNote}
              disabled={busy === "note"}
              className="px-4 py-2.5 rounded-xl bg-[#0644C7] active:opacity-90"
            >
              {busy === "note" ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-sm font-semibold text-white">Add</Text>
              )}
            </Pressable>
          </View>
          {detail.notes.length === 0 ? (
            <EmptyLine text="No notes." />
          ) : (
            detail.notes.map((n) => (
              <View
                key={n.id}
                className="py-2 border-b border-gray-100 dark:border-neutral-800"
              >
                <Text className="text-sm text-gray-800 dark:text-gray-100">
                  {n.content}
                </Text>
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {formatDateTime(n.createdAt)}
                  {n.authorName ? ` · ${n.authorName}` : ""}
                </Text>
              </View>
            ))
          )}
        </SectionCard>

        {/* Payment Method */}
        <SectionCard icon="credit-card" title="Payment Method">
          <Text className="text-sm text-gray-500 dark:text-gray-400 mb-2">
            Current: {detail.paymentMethodLabel || "— none on file"}
          </Text>
          <View className="flex-row items-center gap-2">
            <View className="flex-1 rounded-xl px-3.5 py-2.5 border border-gray-200 dark:border-neutral-800">
              <TextInput
                value={pmText}
                onChangeText={setPmText}
                placeholder="e.g. Visa *4242"
                placeholderTextColor="#9CA3AF"
                className="text-sm text-gray-900 dark:text-white"
                style={{ paddingVertical: 0 }}
              />
            </View>
            <Pressable
              onPress={savePm}
              disabled={busy === "pm"}
              className="px-4 py-2.5 rounded-xl bg-[#0644C7] active:opacity-90"
            >
              {busy === "pm" ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text className="text-sm font-semibold text-white">Save</Text>
              )}
            </Pressable>
          </View>
          <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
            Informational only — this does not charge the card.
          </Text>
        </SectionCard>

        {/* Audit Log */}
        <SectionCard icon="list" title="Audit Log">
          {detail.auditLog.length === 0 ? (
            <EmptyLine text="No activity yet." />
          ) : (
            detail.auditLog.map((a) => (
              <View
                key={a.id}
                className="py-2 border-b border-gray-100 dark:border-neutral-800"
              >
                <View className="flex-row items-start justify-between">
                  <Text className="text-sm font-medium text-gray-900 dark:text-white flex-1 mr-2 capitalize">
                    {a.action.replace(/_/g, " ")}
                    {a.actorName ? (
                      <Text className="text-xs font-normal text-gray-400 dark:text-gray-500">
                        {"  "}by {a.actorName}
                      </Text>
                    ) : null}
                  </Text>
                  <Text className="text-xs text-gray-400 dark:text-gray-500">
                    {formatDateTime(a.createdAt)}
                  </Text>
                </View>
                {(a.afterStatus || a.afterResult) && (
                  <Text className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {[a.afterStatus, a.afterResult].filter(Boolean).join(" · ")}
                  </Text>
                )}
                {!!a.note && (
                  <Text className="text-xs italic text-gray-500 dark:text-gray-400 mt-0.5">
                    “{a.note}”
                  </Text>
                )}
              </View>
            ))
          )}
        </SectionCard>

        {/* Benefit Redemptions */}
        <SectionCard icon="award" title="Benefit Redemptions">
          {detail.redemptions.length === 0 ? (
            <EmptyLine text="No benefit redemptions yet." />
          ) : (
            detail.redemptions.map((r) => (
              <View
                key={r.id}
                className="flex-row items-start justify-between py-2 border-b border-gray-100 dark:border-neutral-800"
              >
                <View className="flex-1 mr-2">
                  <Text className="text-sm font-medium text-gray-900 dark:text-white">
                    {r.label}
                  </Text>
                  {!!r.staffName && (
                    <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {r.staffName}
                    </Text>
                  )}
                </View>
                <Text className="text-xs text-gray-400 dark:text-gray-500">
                  {formatDateTime(r.createdAt)}
                </Text>
              </View>
            ))
          )}
        </SectionCard>
      </ScrollView>

      {/* Extend sheet — new term end date + optional note. */}
      <BottomSheet
        visible={showExtend}
        onClose={() => setShowExtend(false)}
        title="Extend Membership"
      >
        <View className="px-6 pb-6">
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            New Term End
          </Text>
          <View className="rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 mb-4">
            <TextInput
              value={extendDate}
              onChangeText={setExtendDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              className="text-sm text-gray-900 dark:text-white"
              style={{ paddingVertical: 0 }}
            />
          </View>
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            Note (optional)
          </Text>
          <View className="rounded-xl px-3.5 py-3 border border-gray-200 dark:border-neutral-800 mb-5">
            <TextInput
              value={extendNote}
              onChangeText={setExtendNote}
              placeholder="Reason for extension"
              placeholderTextColor="#9CA3AF"
              className="text-sm text-gray-900 dark:text-white"
              style={{ paddingVertical: 0 }}
            />
          </View>
          <Pressable
            onPress={submitExtend}
            className="items-center py-3.5 rounded-xl bg-[#0644C7] active:opacity-90"
          >
            <Text className="text-sm font-semibold text-white">Extend</Text>
          </Pressable>
        </View>
      </BottomSheet>
    </View>
  );
};

export default MembershipDetailsScreen;
