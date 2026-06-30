import { View } from "react-native";
import { SkeletonBlock, usePulse } from "./SkeletonBlock";

type Pulse = ReturnType<typeof usePulse>;

/** Matches the `Divider`: a hairline indented past the icon column. */
function DividerSkeleton() {
  return <View className="h-px bg-gray-100 dark:bg-neutral-800 ml-16" />;
}

/**
 * Matches one `SettingRow`: round icon tile, then a label line over a
 * lighter value line.
 */
function RowSkeleton({
  pulse,
  valueWidth,
}: {
  pulse: Pulse;
  valueWidth: string;
}) {
  return (
    <View className="flex-row items-center px-4 py-4">
      <SkeletonBlock pulse={pulse} className="h-9 w-9 rounded-full" />
      <View className="ml-3 flex-1">
        <SkeletonBlock pulse={pulse} className="h-4 w-32 rounded" />
        <SkeletonBlock pulse={pulse} className={`mt-1.5 h-3 rounded ${valueWidth}`} />
      </View>
    </View>
  );
}

// Account rows: name/email, phone, company, locations summary.
const ROW_VALUE_WIDTHS = ["w-44", "w-28", "w-36", "w-48"];

/**
 * Loading placeholder for the Settings → Account card. Renders inside the same
 * rounded card the real rows live in, so only the row content is swapped.
 */
export function SettingsAccountSkeleton() {
  const pulse = usePulse();

  return (
    <>
      {ROW_VALUE_WIDTHS.map((w, i) => (
        <View key={i}>
          {i > 0 && <DividerSkeleton />}
          <RowSkeleton pulse={pulse} valueWidth={w} />
        </View>
      ))}
    </>
  );
}
