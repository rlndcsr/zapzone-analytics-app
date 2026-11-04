import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { FeatherIconName } from "../../lib/attractions/attractionDisplay";

export type RegistrationTileData = {
  icon: FeatherIconName;
  label: string;
  value: number | null;
  hint: string;
};

/**
 * One cell of the summary panel. Cells sit in a single bordered card and are
 * separated by hairlines (`divideLeft` / `divideTop`) rather than each being
 * its own tile — the same panel as Manage Attractions. Hints explain a count,
 * so unlike the attractions cells they wrap instead of truncating.
 */
function RegistrationTile({
  icon,
  label,
  value,
  hint,
  divideLeft,
  divideTop,
}: RegistrationTileData & { divideLeft: boolean; divideTop: boolean }) {
  return (
    <View
      className={`flex-1 p-4 ${
        divideLeft ? "border-l border-gray-100 dark:border-neutral-800" : ""
      } ${divideTop ? "border-t border-gray-100 dark:border-neutral-800" : ""}`}
    >
      <View className="flex-row items-center gap-1.5">
        <Feather name={icon} size={13} color="#9CA3AF" />
        <Text
          numberOfLines={1}
          className="shrink text-xs font-medium text-gray-500 dark:text-gray-400"
        >
          {label}
        </Text>
      </View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        className="text-2xl font-semibold text-gray-900 dark:text-white mt-1.5"
      >
        {value === null ? "—" : value.toLocaleString()}
      </Text>
      <Text className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
        {hint}
      </Text>
    </View>
  );
}

/**
 * The registration counts as one bordered panel, two cells per row. An odd
 * last cell spans the full width rather than leaving a blank half.
 */
export function RegistrationSummary({
  tiles,
}: {
  tiles: RegistrationTileData[];
}) {
  const rows: RegistrationTileData[][] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <View className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
      {rows.map((row, r) => (
        <View key={r} className="flex-row">
          {row.map((tile, c) => (
            <RegistrationTile
              key={tile.label}
              {...tile}
              divideLeft={c > 0}
              divideTop={r > 0}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
