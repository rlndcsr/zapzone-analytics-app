import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  isValidKioskPhone,
  lookupReturningCustomer,
  type ReturningDependent,
  type ReturningProfile,
} from "../../services/waiversService";

const PRIMARY = "#0644C7";

function describeDependent(d: ReturningDependent): string {
  return [d.age != null ? `Age ${d.age}` : null, d.relationship]
    .filter(Boolean)
    .join(" · ");
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <View className="mb-3">
      <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
        {label}
      </Text>
      <View className="rounded-lg bg-gray-100 px-3 py-2.5 dark:bg-neutral-800">
        <Text className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {value || "—"}
        </Text>
      </View>
    </View>
  );
}

export function KioskSavedSignerFields({
  profile,
  dobConfirmationRequired = false,
}: {
  profile: ReturningProfile;
  /** True when a separate, editable "Confirm your date of birth" input is
   *  rendered alongside these fields — swaps the info note to mention it. */
  dobConfirmationRequired?: boolean;
}) {
  return (
    <>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <ReadOnlyField label="First Name" value={profile.firstName} />
        </View>
        <View className="flex-1">
          <ReadOnlyField label="Last Name" value={profile.lastName} />
        </View>
      </View>
      <ReadOnlyField
        label="Email"
        value={profile.email ?? (profile.hasEmail ? "On file" : "")}
      />
      <ReadOnlyField label="Phone" value={profile.phone ?? ""} />
      <ReadOnlyField
        label="Age"
        value={profile.age != null ? `${profile.age}` : ""}
      />

      <View className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/60">
        <Text className="text-[11px] leading-relaxed text-gray-600 dark:text-gray-300">
          {dobConfirmationRequired
            ? "Your saved details are shown above and can't be changed here. Please confirm your date of birth below to continue. If anything else is wrong, ask a Location Manager or Admin at the front desk to update it for you."
            : "This is the information saved on your record and it cannot be changed here. If anything is wrong, please ask a Location Manager or Admin at the front desk to update it for you."}
        </Text>
      </View>
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      {children}
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      className={`flex-row items-center justify-center gap-2 rounded-xl py-4 active:opacity-80 ${
        disabled || busy ? "opacity-60" : ""
      }`}
      style={{ backgroundColor: PRIMARY }}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || busy) }}
    >
      {busy && <ActivityIndicator size="small" color="#FFFFFF" />}
      <Text className="text-base font-semibold text-white">{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="mt-3 rounded-xl border border-gray-200 bg-white py-3 active:opacity-70 dark:border-neutral-700 dark:bg-neutral-900"
      accessibilityRole="button"
    >
      <Text className="text-center text-sm font-medium text-gray-600 dark:text-gray-300">
        {label}
      </Text>
    </Pressable>
  );
}

export function KioskReturningPanel({
  templateId,
  profile,
  maxMinors,
  dependentsEnabled,
  onFound,
  onContinue,
  onNewCustomer,
  onCancel,
}: {
  templateId: number;
  profile: ReturningProfile | null;
  maxMinors: number;
  dependentsEnabled: boolean;
  onFound: (profile: ReturningProfile, lookupToken: string | null) => void;
  onContinue: (selection: {
    profile: ReturningProfile;
    selectedDependentIds: number[];
  }) => void;
  onNewCustomer: () => void;
  onCancel: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [lastName, setLastName] = useState("");
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<
    "idle" | "not_found" | "needs_staff" | "rate_limited"
  >("idle");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const runLookup = async () => {
    const value = phone.trim();
    const surname = lastName.trim();
    if (!value) {
      setError("Please enter your phone number.");
      return;
    }
    if (!isValidKioskPhone(value)) {
      setError("Please enter your full 10-digit phone number.");
      return;
    }
    if (!surname) {
      setError("Please enter your last name.");
      return;
    }
    setLooking(true);
    setError(null);
    setOutcome("idle");
    const res = await lookupReturningCustomer(templateId, value, surname);
    setLooking(false);

    if (res.status === "found") {
      if (res.profile) onFound(res.profile, res.lookupToken);
      else setOutcome("not_found");
      return;
    }
    if (res.status === "error") {
      setError(res.message);
      return;
    }
    if (res.status === "rate_limited") {
      setOutcome("rate_limited");
      setError(res.message);
      return;
    }
    setOutcome(res.status);
  };

  const retry = () => {
    setPhone("");
    setLastName("");
    setOutcome("idle");
    setError(null);
  };

  /* ---------------------------------------------------------- lookup -- */

  if (!profile) {
    if (outcome === "needs_staff") {
      return (
        <Card>
          <View className="items-center">
            <View className="mb-4 h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/30">
              <Feather name="alert-triangle" size={22} color="#F59E0B" />
            </View>
            <Text className="text-center text-base font-semibold text-gray-900 dark:text-white">
              Please see the front desk
            </Text>
            <Text className="mt-2 text-center text-sm leading-5 text-gray-500 dark:text-gray-400">
              We need a Location Manager or Admin to help with this phone number
              before you can continue. They will get you signed in right away.
            </Text>
          </View>
          <View className="mt-5">
            <SecondaryButton label="Try a different number" onPress={retry} />
            <SecondaryButton
              label="Continue as a new customer"
              onPress={onNewCustomer}
            />
          </View>
        </Card>
      );
    }

    if (outcome === "not_found") {
      return (
        <Card>
          <View className="items-center">
            <View className="mb-4 h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-neutral-800">
              <Feather name="search" size={22} color="#9CA3AF" />
            </View>
            <Text className="text-center text-base font-semibold text-gray-900 dark:text-white">
              We could not find that number
            </Text>
            <Text className="mt-2 text-center text-sm leading-5 text-gray-500 dark:text-gray-400">
              Check the number and try again, or carry on as a new customer —
              your details will be saved for next time.
            </Text>
          </View>
          <View className="mt-5">
            <PrimaryButton label="Try again" onPress={retry} />
            <SecondaryButton
              label="Continue as a new customer"
              onPress={onNewCustomer}
            />
          </View>
        </Card>
      );
    }

    return (
      <Card>
        <Text className="text-base font-bold text-gray-900 dark:text-white">
          Welcome back
        </Text>
        <Text className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Enter the phone number and last name on your account and we will
          bring up your saved details.
        </Text>

        <Text className="mb-1.5 mt-5 text-sm font-semibold text-gray-800 dark:text-gray-100">
          Phone Number
        </Text>
        <TextInput
          value={phone}
          onChangeText={(t) => {
            setPhone(t);
            if (error) setError(null);
          }}
          placeholder="(555) 123-4567"
          placeholderTextColor="#9CA3AF"
          keyboardType="phone-pad"
          maxLength={30}
          returnKeyType="next"
          editable={!looking}
          className="rounded-lg border border-gray-200 px-3 py-3 text-base text-gray-900 dark:border-neutral-700 dark:text-white"
          accessibilityLabel="Phone number"
        />

        <Text className="mb-1.5 mt-4 text-sm font-semibold text-gray-800 dark:text-gray-100">
          Last Name
        </Text>
        <TextInput
          value={lastName}
          onChangeText={(t) => {
            setLastName(t);
            if (error) setError(null);
          }}
          placeholder="Last name on your waiver"
          placeholderTextColor="#9CA3AF"
          autoCapitalize="words"
          returnKeyType="search"
          onSubmitEditing={runLookup}
          editable={!looking}
          className="rounded-lg border border-gray-200 px-3 py-3 text-base text-gray-900 dark:border-neutral-700 dark:text-white"
          accessibilityLabel="Last name"
        />
        {error && (
          <Text className="mt-2 text-xs text-red-600 dark:text-red-400">
            {error}
          </Text>
        )}
        {outcome === "rate_limited" && (
          <Text className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            You can still continue as a new customer.
          </Text>
        )}

        <View className="mt-5">
          <PrimaryButton
            label={looking ? "Checking…" : "Find My Details"}
            onPress={runLookup}
            busy={looking}
          />
          <SecondaryButton label="I'm a new customer" onPress={onNewCustomer} />
          <SecondaryButton label="Back" onPress={onCancel} />
        </View>
      </Card>
    );
  }

  /* ---------------------------------------------------------- review -- */

  const dependents = profile.dependents;
  const canPickDependents = dependentsEnabled && dependents.length > 0;
  const atCap = maxMinors > 0 && selectedIds.length >= maxMinors;

  const toggle = (id: number) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  return (
    <View>
      <Card>
        <Text className="text-base font-bold text-gray-900 dark:text-white">
          Your Information
        </Text>
        <Text className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
          This is what we have on file for you.
        </Text>

        <KioskSavedSignerFields profile={profile} />
      </Card>

      {canPickDependents && (
        <Card>
          <Text className="text-base font-bold text-gray-900 dark:text-white">
            Who is with you today?
          </Text>
          <Text className="mb-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
            Tick everyone taking part. You can add anyone new on the next
            screen.
          </Text>

          {dependents.map((d) => {
            const on = selectedIds.includes(d.id);
            const blocked = !on && atCap;
            return (
              <Pressable
                key={d.id}
                onPress={() => !blocked && toggle(d.id)}
                disabled={blocked}
                className={`mb-2 flex-row items-center gap-3 rounded-xl border px-3.5 py-3 active:opacity-80 ${
                  on
                    ? "border-[#0644C7] bg-blue-50 dark:bg-blue-900/20"
                    : "border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-900"
                } ${blocked ? "opacity-50" : ""}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: blocked }}
                accessibilityLabel={`${d.firstName} ${d.lastName}${
                  describeDependent(d) ? `, ${describeDependent(d)}` : ""
                }`}
              >
                <View
                  className={`h-5 w-5 items-center justify-center rounded border ${
                    on
                      ? "border-[#0644C7] bg-[#0644C7]"
                      : "border-gray-300 dark:border-neutral-600"
                  }`}
                >
                  {on && <Feather name="check" size={13} color="#FFFFFF" />}
                </View>
                <Text className="flex-1 text-sm font-medium text-gray-900 dark:text-white">
                  {d.firstName} {d.lastName}
                </Text>
                <Text className="text-[11px] text-gray-500 dark:text-gray-400">
                  {describeDependent(d)}
                </Text>
              </Pressable>
            );
          })}

          {atCap && (
            <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              This waiver covers up to {maxMinors}{" "}
              {maxMinors === 1 ? "dependent" : "dependents"}.
            </Text>
          )}
        </Card>
      )}

      <View className="mb-4">
        <PrimaryButton
          label="Continue"
          onPress={() =>
            onContinue({ profile, selectedDependentIds: selectedIds })
          }
        />
        <SecondaryButton label="Not you? Start over" onPress={onCancel} />
      </View>
    </View>
  );
}
