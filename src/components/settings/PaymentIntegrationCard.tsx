import { Feather } from "@expo/vector-icons";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { formatDateTimeET } from "../../lib/date/venueTime";
import { getCurrentUser, getToken } from "../../lib/session";
import {
  authorizeNetAccountName,
  authorizeNetAccountPlace,
  connectAuthorizeNetAccount,
  disconnectOwnAuthorizeNetAccount,
  fetchAuthorizeNetAccounts,
  fetchAuthorizeNetStatus,
  type AuthorizeNetAccount,
  type AuthorizeNetEnvironment,
  type AuthorizeNetStatus,
} from "../../services/authorizeNetService";
import { fetchLocations, type LocationOption } from "../../services/locationsService";
import { BottomSheet } from "../ui/BottomSheet";
import { SelectField, TextField, type SelectOption } from "../ui/FormControls";

const PRIMARY = "#0644C7";

/* --------------------------------------------------------------- fragments -- */

/** Small outline pill — the web's environment / status chips. */
const Chip = ({ label, tone }: { label: string; tone: "green" | "gray" }) => (
  <View
    className={`rounded-full px-2 py-0.5 ${
      tone === "green"
        ? "bg-emerald-100 dark:bg-emerald-900/30"
        : "bg-gray-100 dark:bg-neutral-800"
    }`}
  >
    <Text
      className={`text-[10px] font-medium ${
        tone === "green"
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-gray-500 dark:text-gray-400"
      }`}
    >
      {label}
    </Text>
  </View>
);

const LinkAction = ({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon?: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    className={`flex-row items-center gap-1.5 ${
      disabled ? "opacity-50" : "active:opacity-60"
    }`}
  >
    {icon ? <Feather name={icon} size={13} color={PRIMARY} /> : null}
    <Text className="text-xs font-medium text-[#0644C7]">{label}</Text>
  </Pressable>
);

/* -------------------------------------------------------- connection card -- */

function ConnectionRow({
  account,
  canDisconnect,
  busy,
  onDisconnect,
}: {
  account: AuthorizeNetAccount;
  canDisconnect: boolean;
  busy: boolean;
  onDisconnect: () => void;
}) {
  const place = authorizeNetAccountPlace(account);

  return (
    <View className="rounded-xl border border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3.5 mb-2.5">
      <View className="flex-row items-start">
        <View className="flex-1 pr-2">
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <Feather name="map-pin" size={13} color={PRIMARY} />
            <Text className="text-sm font-bold text-gray-900 dark:text-white">
              {authorizeNetAccountName(account)}
            </Text>
            {place ? (
              <Text className="text-xs text-gray-500 dark:text-gray-400">
                {place}
              </Text>
            ) : null}
          </View>
          <View className="flex-row flex-wrap items-center gap-2 mt-2">
            <Chip
              label={
                account.environment === "production" ? "Production" : "Sandbox"
              }
              tone={account.environment === "production" ? "green" : "gray"}
            />
            <Chip
              label={account.isActive ? "Active" : "Inactive"}
              tone={account.isActive ? "green" : "gray"}
            />
          </View>
        </View>
        {/* Status dot, as on the web card's top-right. */}
        <View
          className={`h-2.5 w-2.5 rounded-full mt-1 ${
            account.isActive ? "bg-emerald-500" : "bg-gray-300 dark:bg-neutral-600"
          }`}
        />
      </View>

      <View className="flex-row items-end justify-between mt-3">
        <View className="flex-1 pr-2">
          <Text className="text-xs text-gray-500 dark:text-gray-400">
            Connected
          </Text>
          <Text className="text-xs text-gray-700 dark:text-gray-200 mt-0.5">
            {formatDateTimeET(account.connectedAt, { month: "short" })}
          </Text>
        </View>
        {canDisconnect ? (
          <Pressable
            onPress={onDisconnect}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={`Disconnect ${authorizeNetAccountName(account)}`}
            className={`flex-row items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 ${
              busy ? "opacity-60" : "active:opacity-90"
            }`}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Feather name="trash-2" size={13} color="#FFFFFF" />
            )}
            <Text className="text-xs font-semibold text-white">Disconnect</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- card -- */

const ENVIRONMENT_OPTIONS: SelectOption[] = [
  { label: "Production", value: "production" },
  { label: "Sandbox", value: "sandbox" },
];

export function PaymentIntegrationCard() {
  const currentUser = getCurrentUser();
  const isCompanyAdmin = currentUser?.role === "company_admin";
  const ownLocationId = currentUser?.location_id ?? null;

  const [status, setStatus] = useState<AuthorizeNetStatus | null>(null);
  const [accounts, setAccounts] = useState<AuthorizeNetAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sheet, setSheet] = useState<null | "all" | "connect">(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Connect form
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [formLocationId, setFormLocationId] = useState<number | null>(null);
  const [apiLoginId, setApiLoginId] = useState("");
  const [transactionKey, setTransactionKey] = useState("");
  const [publicClientKey, setPublicClientKey] = useState("");
  const [environment, setEnvironment] =
    useState<AuthorizeNetEnvironment>("production");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const token = getToken();
    if (!token) return;
    setError(null);
    try {
      // Both are needed for the summary line: the own-location status is the
      // web's source, and the full list is what makes it meaningful for a
      // company admin (whose own status is always "no location assigned").
      const [s, list] = await Promise.all([
        fetchAuthorizeNetStatus(token, signal),
        fetchAuthorizeNetAccounts(token, signal),
      ]);
      setStatus(s);
      setAccounts(list);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load payment accounts.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const summary = useMemo(() => {
    if (loading) return "Checking…";
    if (error) return "Unavailable";
    if (status?.connected && status.account) {
      const env =
        status.account.environment === "production" ? "Production" : "Sandbox";
      return status.credentialsValid
        ? `Connected · ${env}`
        : `Connected · ${env} · credentials need re-entry`;
    }
    // A company admin has no own location, so the endpoint above can only ever
    // answer "not connected" for them — report the real list instead of a
    // number that would read as "nothing is set up".
    const connected = accounts?.length ?? 0;
    if (status?.unavailableReason && connected > 0) {
      return `${connected} location${connected === 1 ? "" : "s"} connected`;
    }
    return "Not connected";
  }, [loading, error, status, accounts]);

  const openConnect = useCallback(async () => {
    setApiLoginId("");
    setTransactionKey("");
    setPublicClientKey("");
    setEnvironment("production");
    setFormLocationId(isCompanyAdmin ? null : ownLocationId);
    setSheet("connect");

    if (!isCompanyAdmin) return;
    const token = getToken();
    if (!token) return;
    try {
      setLocations(await fetchLocations(token));
    } catch {
      // The picker simply stays empty; the form still validates before sending.
    }
  }, [isCompanyAdmin, ownLocationId]);

  const connectedLocationIds = useMemo(
    () => new Set((accounts ?? []).map((a) => a.locationId)),
    [accounts],
  );

  const locationOptions = useMemo<SelectOption[]>(
    () =>
      locations
        .filter((l) => !connectedLocationIds.has(l.id))
        .map((l) => ({ label: l.name, value: l.id })),
    [locations, connectedLocationIds],
  );

  const submitConnect = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    if (!apiLoginId.trim() || !transactionKey.trim() || !publicClientKey.trim()) {
      Alert.alert(
        "Missing details",
        "API Login ID, Transaction Key and Public Client Key are all required.",
      );
      return;
    }
    if (isCompanyAdmin && formLocationId == null) {
      Alert.alert("Select a location", "Choose which location to connect.");
      return;
    }

    setSaving(true);
    try {
      await connectAuthorizeNetAccount(token, {
        apiLoginId,
        transactionKey,
        publicClientKey,
        environment,
        locationId: formLocationId,
      });
      setSheet(null);
      await load();
      Alert.alert("Connected", "The Authorize.Net account is now connected.");
    } catch (err) {
      Alert.alert(
        "Could not connect",
        err instanceof Error ? err.message : "Please check the credentials.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    apiLoginId,
    transactionKey,
    publicClientKey,
    environment,
    formLocationId,
    isCompanyAdmin,
    load,
  ]);

  const confirmDisconnect = useCallback(
    (account: AuthorizeNetAccount) => {
      Alert.alert(
        "Disconnect account?",
        `${authorizeNetAccountName(account)} will stop accepting card payments until a new account is connected.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Disconnect",
            style: "destructive",
            onPress: async () => {
              const token = getToken();
              if (!token) return;
              setDisconnecting(true);
              try {
                await disconnectOwnAuthorizeNetAccount(token);
                await load();
              } catch (err) {
                Alert.alert(
                  "Could not disconnect",
                  err instanceof Error ? err.message : "Please try again.",
                );
              } finally {
                setDisconnecting(false);
              }
            },
          },
        ],
      );
    },
    [load],
  );

  return (
    <>
      <View className="overflow-hidden rounded-2xl bg-white dark:bg-neutral-900 shadow-sm border border-gray-100 dark:border-neutral-800 p-4">
        <View className="flex-row items-center justify-between">
          <Text className="text-base font-bold text-gray-900 dark:text-white">
            Payment Integration
          </Text>
        </View>

        <View className="mt-3 rounded-xl bg-gray-50 dark:bg-neutral-800/50 p-3">
          <View className="flex-row items-center">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-800">
              <Feather name="credit-card" size={17} color="#6B7280" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-sm font-medium text-gray-800 dark:text-gray-100">
                Authorize.Net
              </Text>
              <Text
                className="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                numberOfLines={1}
              >
                {summary}
              </Text>
            </View>
            {loading ? <ActivityIndicator size="small" color={PRIMARY} /> : null}
          </View>

          <View className="flex-row items-center justify-end gap-4 mt-3">
            <LinkAction
              icon="list"
              label="View All"
              onPress={() => setSheet("all")}
            />
            <LinkAction label="Connect Account" onPress={openConnect} />
          </View>
        </View>

        {error ? (
          <Text className="text-xs text-red-500 mt-2">{error}</Text>
        ) : null}
      </View>

      {/* All connections — the web's "All Authorize.Net Connections" modal. */}
      <BottomSheet
        visible={sheet === "all"}
        onClose={() => setSheet(null)}
        title="All Authorize.Net Connections"
        subtitle="Payment accounts across all locations"
      >
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 12 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="pt-1">
            {accounts === null ? (
              <View className="items-center py-10">
                <ActivityIndicator color={PRIMARY} />
              </View>
            ) : accounts.length === 0 ? (
              <View className="items-center py-10">
                <View className="h-14 w-14 items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-800 mb-3">
                  <Feather name="credit-card" size={24} color="#9CA3AF" />
                </View>
                <Text className="text-base font-semibold text-gray-700 dark:text-gray-200">
                  No connections yet
                </Text>
                <Text className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-center">
                  No locations have connected Authorize.Net.
                </Text>
              </View>
            ) : (
              accounts.map((account) => (
                <ConnectionRow
                  key={account.id}
                  account={account}
                  // The DELETE endpoint acts on the caller's own location only,
                  // so the button is offered on that row and nowhere else.
                  canDisconnect={
                    ownLocationId != null && account.locationId === ownLocationId
                  }
                  busy={disconnecting}
                  onDisconnect={() => confirmDisconnect(account)}
                />
              ))
            )}
          </View>
        </ScrollView>

        <View className="flex-row gap-3 px-5 pt-3 pb-6 border-t border-gray-100 dark:border-neutral-800">
          <Pressable
            onPress={() => setSheet(null)}
            className="flex-1 items-center rounded-xl border border-gray-200 dark:border-neutral-700 py-3.5 active:opacity-70"
            accessibilityRole="button"
          >
            <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Close
            </Text>
          </Pressable>
          <Pressable
            onPress={openConnect}
            className="flex-1 items-center rounded-xl py-3.5 active:opacity-90"
            style={{ backgroundColor: PRIMARY }}
            accessibilityRole="button"
          >
            <Text className="text-sm font-semibold text-white">
              Connect New Location
            </Text>
          </Pressable>
        </View>
      </BottomSheet>

      {/* Connect — the same POST the web connect form sends. */}
      <BottomSheet
        visible={sheet === "connect"}
        onClose={() => (saving ? undefined : setSheet(null))}
        title="Connect Authorize.Net"
        subtitle="Credentials are stored encrypted by the server"
      >
        <ScrollView
          className="px-5"
          contentContainerStyle={{ paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4 pt-1">
            {isCompanyAdmin ? (
              <SelectField
                label="Location"
                required
                placeholder="Select a location..."
                value={formLocationId}
                options={locationOptions}
                onSelect={(v) => setFormLocationId(Number(v))}
              />
            ) : null}
            <TextField
              label="API Login ID"
              required
              value={apiLoginId}
              onChangeText={setApiLoginId}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="e.g. 5KP3u95bQpv"
            />
            <TextField
              label="Transaction Key"
              required
              value={transactionKey}
              onChangeText={setTransactionKey}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="Transaction key"
            />
            <TextField
              label="Public Client Key"
              required
              value={publicClientKey}
              onChangeText={setPublicClientKey}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Public client key (Accept.js)"
              hint="Found under Account → Manage Public Client Key in the Authorize.Net portal."
            />
            <SelectField
              label="Environment"
              required
              value={environment}
              options={ENVIRONMENT_OPTIONS}
              onSelect={(v) => setEnvironment(v as AuthorizeNetEnvironment)}
            />

            <View className="flex-row gap-3 mt-2">
              <Pressable
                onPress={() => setSheet(null)}
                disabled={saving}
                className="flex-1 items-center rounded-xl border border-gray-200 dark:border-neutral-700 py-3.5 active:opacity-70"
                accessibilityRole="button"
              >
                <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={submitConnect}
                disabled={saving}
                className={`flex-1 flex-row items-center justify-center gap-2 rounded-xl py-3.5 ${
                  saving ? "opacity-60" : "active:opacity-90"
                }`}
                style={{ backgroundColor: PRIMARY }}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : null}
                <Text className="text-sm font-semibold text-white">
                  {saving ? "Connecting…" : "Connect"}
                </Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </BottomSheet>
    </>
  );
}
