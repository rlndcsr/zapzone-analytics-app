import { Feather } from "@expo/vector-icons";
import { Text, View } from "react-native";

import type { TemplateLocationsValue, TemplateTargeting } from "../../lib/email/emailTemplateOptions";
import { CheckboxRow, FieldLabel, RadioRow } from "./FormControls";

/**
 * Which locations an email template covers: every location, or the ones ticked
 * (web: TemplateLocationsPicker). A location the template already covers but
 * this list doesn't show — an inactive one — stays listed so it isn't dropped
 * by accident.
 */
export function TemplateLocationsPicker({
  locations,
  targetLocations = [],
  value,
  onChange,
  disabled = false,
  error,
}: {
  locations: { id: number; name: string }[];
  targetLocations?: TemplateTargeting["targetLocations"];
  value: TemplateLocationsValue;
  onChange: (value: TemplateLocationsValue) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const listed = new Set(locations.map((location) => location.id));
  const unlistedIds = [
    ...new Set([
      ...targetLocations.filter((target) => target.name !== null).map((target) => target.id),
      ...value.selectedIds,
    ]),
  ].filter((id) => !listed.has(id));
  const options = [
    ...locations.map((location) => ({ id: location.id, label: location.name })),
    ...unlistedIds.map((id) => {
      const target = targetLocations.find((t) => t.id === id);
      const inactive = Boolean(target?.name) && target?.active === false;
      return { id, label: `${target?.name ?? `Location #${id}`}${inactive ? " (inactive)" : ""}` };
    }),
  ];
  const ticked = options.filter((option) => value.selectedIds.includes(option.id)).length;

  const toggle = (id: number) =>
    onChange({
      allLocations: false,
      selectedIds: value.selectedIds.includes(id)
        ? value.selectedIds.filter((selected) => selected !== id)
        : [...value.selectedIds, id],
    });

  return (
    <View style={disabled ? { opacity: 0.6 } : undefined} pointerEvents={disabled ? "none" : "auto"}>
      <FieldLabel>Locations</FieldLabel>
      <RadioRow
        label="Every location"
        selected={value.allLocations}
        onPress={() => onChange({ ...value, allLocations: true })}
      />
      <Text className="text-xs text-gray-400 dark:text-gray-500 ml-[30px] -mt-1 mb-1">
        Includes locations added later
      </Text>
      <RadioRow
        label="Only the locations I tick"
        selected={!value.allLocations}
        onPress={() => onChange({ ...value, allLocations: false })}
      />
      <Text className="text-xs text-gray-400 dark:text-gray-500 ml-[30px] -mt-1">
        {ticked === 0 ? "None ticked yet" : `${ticked} of ${options.length} ticked`}
      </Text>

      {!value.allLocations && (
        <View
          className={`mt-2 rounded-xl border p-3 gap-3 ${
            error ? "border-red-400" : "border-gray-200 dark:border-neutral-700"
          }`}
        >
          {options.map((option) => (
            <CheckboxRow
              key={option.id}
              checked={value.selectedIds.includes(option.id)}
              onToggle={() => toggle(option.id)}
              label={
                <View className="flex-row items-center gap-1.5">
                  <Feather name="map-pin" size={13} color="#9CA3AF" />
                  <Text className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200" numberOfLines={1}>
                    {option.label}
                  </Text>
                </View>
              }
            />
          ))}
        </View>
      )}
      {!!error && <Text className="text-xs text-red-600 mt-1.5">{error}</Text>}
    </View>
  );
}
