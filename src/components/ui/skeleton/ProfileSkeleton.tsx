import { View } from "react-native";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

/**
 * Mirrors the profile `SectionCard` shell: rounded white card, an icon tile +
 * title in the header, then the supplied rows.
 */
function SkeletonCard({
  pulse,
  children,
}: {
  pulse: ReturnType<typeof usePulse>;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-4 rounded-2xl bg-white dark:bg-neutral-900 p-4">
      <View className="flex-row items-center gap-2 mb-2">
        {/* icon tile — matches the h-8 w-8 rounded-lg box */}
        <SkeletonBlock pulse={pulse} className="h-8 w-8 rounded-lg" />
        {/* title — matches the text-base font-bold heading */}
        <SkeletonBlock pulse={pulse} className="h-5 w-44 rounded-md" />
      </View>
      {children}
    </View>
  );
}

/**
 * One placeholder row matching `InfoRow`: same `py-2.5` height and bottom
 * border, a short label bar on the left and a wider value bar on the right.
 */
function SkeletonRow({
  pulse,
  labelWidth,
  valueWidth,
}: {
  pulse: ReturnType<typeof usePulse>;
  labelWidth: string;
  valueWidth: string;
}) {
  return (
    <View className="flex-row items-center justify-between py-2.5 border-b border-gray-100 dark:border-neutral-800">
      <SkeletonBlock pulse={pulse} className={`h-4 rounded ${labelWidth}`} />
      <SkeletonBlock pulse={pulse} className={`h-4 rounded ${valueWidth}`} />
    </View>
  );
}

/** Varied widths so the placeholder reads as real label/value pairs. */
const PERSONAL_ROWS = [
  { labelWidth: "w-20", valueWidth: "w-28" },
  { labelWidth: "w-20", valueWidth: "w-24" },
  { labelWidth: "w-24", valueWidth: "w-40" },
  { labelWidth: "w-24", valueWidth: "w-32" },
  { labelWidth: "w-24", valueWidth: "w-28" },
  { labelWidth: "w-24", valueWidth: "w-20" },
  { labelWidth: "w-24", valueWidth: "w-32" },
  { labelWidth: "w-16", valueWidth: "w-36" },
];

const COMPANY_ROWS = [
  { labelWidth: "w-28", valueWidth: "w-32" },
  { labelWidth: "w-28", valueWidth: "w-40" },
  { labelWidth: "w-28", valueWidth: "w-28" },
  { labelWidth: "w-20", valueWidth: "w-36" },
  { labelWidth: "w-20", valueWidth: "w-24" },
  { labelWidth: "w-24", valueWidth: "w-20" },
  { labelWidth: "w-20", valueWidth: "w-44" },
];

/**
 * Loading placeholder matching the Personal Information, Company Details, and
 * Business Overview cards so the screen keeps its shape while data is fetched.
 */
export function ProfileSkeleton() {
  const pulse = usePulse();

  return (
    <>
      {/* Personal Information */}
      <SkeletonCard pulse={pulse}>
        {PERSONAL_ROWS.map((row, i) => (
          <SkeletonRow
            key={i}
            pulse={pulse}
            labelWidth={row.labelWidth}
            valueWidth={row.valueWidth}
          />
        ))}
      </SkeletonCard>

      {/* Company Details */}
      <SkeletonCard pulse={pulse}>
        {COMPANY_ROWS.map((row, i) => (
          <SkeletonRow
            key={i}
            pulse={pulse}
            labelWidth={row.labelWidth}
            valueWidth={row.valueWidth}
          />
        ))}
      </SkeletonCard>

      {/* Business Overview — caption + two stat tiles */}
      <View className="mt-4 rounded-2xl bg-white dark:bg-neutral-900 p-4">
        <View className="flex-row items-center gap-2 mb-2">
          <SkeletonBlock pulse={pulse} className="h-8 w-8 rounded-lg" />
          <SkeletonBlock pulse={pulse} className="h-5 w-40 rounded-md" />
        </View>
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
    </>
  );
}
