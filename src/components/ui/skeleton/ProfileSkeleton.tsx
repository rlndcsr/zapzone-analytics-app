import { View } from "react-native";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

/**
 * Mirrors the profile `SectionCard` shell: rounded white card (p-5, shadow +
 * border), an icon tile + title in the header, then the supplied rows.
 */
function SkeletonCard({
  pulse,
  titleWidth = "w-44",
  children,
}: {
  pulse: ReturnType<typeof usePulse>;
  titleWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-4 rounded-2xl bg-white dark:bg-neutral-900 p-5 shadow-sm border border-gray-100 dark:border-neutral-800">
      <View className="flex-row items-center gap-2 mb-3">
        {/* icon tile — matches the w-8 h-8 rounded-xl box */}
        <SkeletonBlock pulse={pulse} className="h-8 w-8 rounded-xl" />
        {/* title — matches the text-sm font-semibold heading */}
        <SkeletonBlock pulse={pulse} className={`h-4 rounded-md ${titleWidth}`} />
      </View>
      {children}
    </View>
  );
}

/**
 * One placeholder row matching `InfoRow`: same `py-3` height, top-aligned, with
 * the `/50` bottom border, a short label bar on the left and a wider value bar
 * on the right.
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
    <View className="flex-row items-start justify-between py-3 border-b border-gray-100 dark:border-neutral-800/50">
      <SkeletonBlock pulse={pulse} className={`h-4 rounded ${labelWidth}`} />
      <SkeletonBlock pulse={pulse} className={`h-4 rounded ${valueWidth}`} />
    </View>
  );
}

/**
 * Varied widths so the placeholder reads as real label/value pairs. Eight rows
 * match the eight Personal Information fields (First/Last Name, Email, Phone,
 * Position, Employee ID, Department, Role).
 */
const PERSONAL_ROWS = [
  { labelWidth: "w-20", valueWidth: "w-28" },
  { labelWidth: "w-20", valueWidth: "w-24" },
  { labelWidth: "w-24", valueWidth: "w-40" },
  { labelWidth: "w-24", valueWidth: "w-32" },
  { labelWidth: "w-20", valueWidth: "w-28" },
  { labelWidth: "w-24", valueWidth: "w-20" },
  { labelWidth: "w-24", valueWidth: "w-32" },
  { labelWidth: "w-16", valueWidth: "w-36" },
];

/** Seven rows match the seven Company Details fields. */
const COMPANY_ROWS = [
  { labelWidth: "w-28", valueWidth: "w-32" },
  { labelWidth: "w-28", valueWidth: "w-40" },
  { labelWidth: "w-28", valueWidth: "w-28" },
  { labelWidth: "w-20", valueWidth: "w-36" },
  { labelWidth: "w-20", valueWidth: "w-24" },
  { labelWidth: "w-28", valueWidth: "w-20" },
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
      <SkeletonCard pulse={pulse} titleWidth="w-44">
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
      <SkeletonCard pulse={pulse} titleWidth="w-36">
        {COMPANY_ROWS.map((row, i) => (
          <SkeletonRow
            key={i}
            pulse={pulse}
            labelWidth={row.labelWidth}
            valueWidth={row.valueWidth}
          />
        ))}
      </SkeletonCard>

      {/* Business Overview — caption + two stat tiles (matches the SectionCard
          shell with a #0644C7-tinted stat tile pair). */}
      <SkeletonCard pulse={pulse} titleWidth="w-40">
        <SkeletonBlock pulse={pulse} className="h-3 w-full rounded mb-3" />
        <View className="flex-row gap-3">
          <View className="flex-1 items-center rounded-2xl bg-[#0644C7]/5 dark:bg-[#0644C7]/10 py-5">
            <SkeletonBlock pulse={pulse} className="h-7 w-10 rounded-md" />
            <SkeletonBlock pulse={pulse} className="mt-1 h-3 w-20 rounded" />
          </View>
          <View className="flex-1 items-center rounded-2xl bg-[#0644C7]/5 dark:bg-[#0644C7]/10 py-5">
            <SkeletonBlock pulse={pulse} className="h-7 w-10 rounded-md" />
            <SkeletonBlock pulse={pulse} className="mt-1 h-3 w-20 rounded" />
          </View>
        </View>
      </SkeletonCard>
    </>
  );
}
