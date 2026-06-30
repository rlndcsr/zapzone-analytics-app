import { View } from "react-native";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

type Pulse = ReturnType<typeof usePulse>;

/** Matches the `SectionHeader`: icon tile + title, with the same spacing. */
function HeaderSkeleton({ pulse }: { pulse: Pulse }) {
  return (
    <View className="flex-row items-center gap-2 mb-3 mt-2">
      <SkeletonBlock pulse={pulse} className="h-8 w-8 rounded-lg" />
      <SkeletonBlock pulse={pulse} className="h-5 w-44 rounded-md" />
    </View>
  );
}

/**
 * Matches one `InputField`: a short label above an `h-14` rounded-full pill.
 * `last` drops the bottom margin to mirror the final field in each card.
 */
function InputSkeleton({
  pulse,
  labelWidth = "w-28",
  last = false,
}: {
  pulse: Pulse;
  labelWidth?: string;
  last?: boolean;
}) {
  return (
    <View className={last ? "" : "mb-3"}>
      <SkeletonBlock pulse={pulse} className={`mb-2 h-4 rounded ${labelWidth}`} />
      <SkeletonBlock pulse={pulse} className="h-14 w-full rounded-full" />
    </View>
  );
}

// Approximate label widths so the fields read as a real form.
const PERSONAL_LABELS = ["w-24", "w-24", "w-32", "w-28", "w-32", "w-28", "w-28"];
const COMPANY_LABELS = [
  "w-32",
  "w-32",
  "w-32",
  "w-20",
  "w-20",
  "w-28",
  "w-32",
  "w-12",
  "w-32",
  "w-36",
  "w-20",
];

/**
 * Loading placeholder for the Edit Profile form. Mirrors the Personal
 * Information and Company Details cards (and the read-only Business Metrics
 * card) plus the Save button so the screen keeps its shape while data loads.
 */
export function EditProfileSkeleton() {
  const pulse = usePulse();

  return (
    <>
      {/* Personal Information */}
      <View className="rounded-2xl bg-white dark:bg-neutral-900 p-4">
        <HeaderSkeleton pulse={pulse} />
        {PERSONAL_LABELS.map((w, i) => (
          <InputSkeleton
            key={i}
            pulse={pulse}
            labelWidth={w}
            last={i === PERSONAL_LABELS.length - 1}
          />
        ))}
      </View>

      {/* Company Details */}
      <View className="mt-4 rounded-2xl bg-white dark:bg-neutral-900 p-4">
        <HeaderSkeleton pulse={pulse} />
        {COMPANY_LABELS.map((w, i) => (
          <InputSkeleton
            key={i}
            pulse={pulse}
            labelWidth={w}
            last={i === COMPANY_LABELS.length - 1}
          />
        ))}
      </View>

      {/* Business Metrics — caption + two stat tiles */}
      <View className="mt-4 rounded-2xl bg-white dark:bg-neutral-900 p-4">
        <HeaderSkeleton pulse={pulse} />
        <SkeletonBlock pulse={pulse} className="h-3 w-full rounded mb-3" />
        <View className="flex-row gap-3">
          <View className="flex-1 items-center rounded-2xl bg-blue-50 dark:bg-blue-900/30 py-5">
            <SkeletonBlock pulse={pulse} className="h-8 w-10 rounded-md" />
            <SkeletonBlock pulse={pulse} className="mt-2 h-3 w-20 rounded" />
          </View>
          <View className="flex-1 items-center rounded-2xl bg-blue-50 dark:bg-blue-900/30 py-5">
            <SkeletonBlock pulse={pulse} className="h-8 w-10 rounded-md" />
            <SkeletonBlock pulse={pulse} className="mt-2 h-3 w-20 rounded" />
          </View>
        </View>
      </View>

      {/* Save button */}
      <SkeletonBlock pulse={pulse} className="mt-6 h-14 w-full rounded-full" />
    </>
  );
}
