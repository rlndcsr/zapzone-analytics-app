import { View } from "react-native";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

/**
 * Mirrors the profile `Card` shell: rounded white card with a hairline border
 * and a bold heading, holding the supplied rows.
 */
function SkeletonCard({
  pulse,
  titleWidth = "w-44",
  padded,
  children,
}: {
  pulse: ReturnType<typeof usePulse>;
  titleWidth?: string;
  /** `p-5` for content cards; the row lists use the tighter `px-5 py-2`. */
  padded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      className={`rounded-3xl border border-gray-100 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 ${
        padded ? "p-5" : "px-5 py-2"
      }`}
    >
      {/* title — matches the text-[15px] font-bold heading */}
      <SkeletonBlock
        pulse={pulse}
        className={`mb-1 mt-3 h-4 rounded-md ${titleWidth}`}
      />
      {children}
    </View>
  );
}

/**
 * One placeholder row matching `MenuRow`/`ExpandableRow`: the same `py-3.5`
 * height, a rounded icon chip, a label bar and the chevron.
 */
function SkeletonMenuRow({
  pulse,
  labelWidth,
}: {
  pulse: ReturnType<typeof usePulse>;
  labelWidth: string;
}) {
  return (
    <View className="flex-row items-center py-3.5">
      <SkeletonBlock pulse={pulse} className="h-10 w-10 rounded-2xl" />
      <View className="ml-4 flex-1">
        <SkeletonBlock pulse={pulse} className={`h-4 rounded ${labelWidth}`} />
      </View>
      <SkeletonBlock pulse={pulse} className="h-4 w-4 rounded" />
    </View>
  );
}

/**
 * Loading placeholder for the fetched part of the profile: the Company
 * Information rows (Personal Information and Company Details, both collapsed)
 * and the Business Overview card, so the screen keeps its shape while the
 * request is in flight.
 */
export function ProfileSkeleton() {
  const pulse = usePulse();

  return (
    <>
      {/* Company Information — two collapsed rows */}
      <SkeletonCard pulse={pulse} titleWidth="w-44">
        <SkeletonMenuRow pulse={pulse} labelWidth="w-40" />
        <View className="ml-14 h-px bg-gray-100 dark:bg-neutral-800/60" />
        <SkeletonMenuRow pulse={pulse} labelWidth="w-32" />
      </SkeletonCard>

      {/* Business Overview — caption + two stat tiles (matches the Card shell
          with a #0644C7-tinted stat tile pair). */}
      <SkeletonCard pulse={pulse} titleWidth="w-40" padded>
        <SkeletonBlock pulse={pulse} className="mb-3 h-3 w-full rounded" />
        <View className="flex-row gap-3">
          <View className="flex-1 items-center rounded-2xl bg-[#0644C7]/5 py-5 dark:bg-[#0644C7]/10">
            <SkeletonBlock pulse={pulse} className="h-7 w-10 rounded-md" />
            <SkeletonBlock pulse={pulse} className="mt-1 h-3 w-20 rounded" />
          </View>
          <View className="flex-1 items-center rounded-2xl bg-[#0644C7]/5 py-5 dark:bg-[#0644C7]/10">
            <SkeletonBlock pulse={pulse} className="h-7 w-10 rounded-md" />
            <SkeletonBlock pulse={pulse} className="mt-1 h-3 w-20 rounded" />
          </View>
        </View>
      </SkeletonCard>
    </>
  );
}
