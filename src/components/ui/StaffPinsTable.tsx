import { Feather } from "@expo/vector-icons";
import { type ComponentProps, useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { staffRoleLabel } from "../../lib/staffPins";
import type { StaffPinRosterEntry } from "../../services/staffPinService";
import { SelectableTable, type TableColumn } from "./SelectableTable";

const IconAction = ({
  icon,
  tint,
  label,
  disabled,
  onPress,
}: {
  icon: ComponentProps<typeof Feather>["name"];
  tint: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    hitSlop={6}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    className={`w-8 h-8 rounded-full items-center justify-center active:bg-gray-100 dark:active:bg-neutral-800 ${
      disabled ? "opacity-40" : ""
    }`}
  >
    <Feather name={icon} size={16} color={tint} />
  </Pressable>
);

/** The web's PIN cell: amber "Locked", green "Set", or plain "Not set". */
function PinStatus({ entry }: { entry: StaffPinRosterEntry }) {
  if (entry.locked) {
    return (
      <View className="flex-row">
        <View className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30">
          <Feather name="lock" size={10} color="#B45309" />
          <Text className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            Locked
          </Text>
        </View>
      </View>
    );
  }
  if (entry.has_pin) {
    return (
      <View className="flex-row">
        <View className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <Text className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
            Set
          </Text>
        </View>
      </View>
    );
  }
  return <Text className="text-xs text-gray-500 dark:text-gray-400">Not set</Text>;
}

type Handlers = {
  /** A change is in flight — every action waits for it, as on the web. */
  busy: boolean;
  onSetPin: (entry: StaffPinRosterEntry) => void;
  onUnlock: (entry: StaffPinRosterEntry) => void;
  onRemove: (entry: StaffPinRosterEntry) => void;
};

function buildColumns(h: Handlers): TableColumn<StaffPinRosterEntry>[] {
  return [
    {
      key: "employee",
      label: "Employee",
      width: 230,
      render: (e) => (
        <View>
          <Text
            numberOfLines={1}
            className="text-sm font-semibold text-gray-900 dark:text-white"
          >
            {e.name}
          </Text>
          <Text
            numberOfLines={1}
            className="text-xs text-gray-400 dark:text-gray-500 mt-0.5"
          >
            {e.email}
          </Text>
        </View>
      ),
    },
    {
      key: "role",
      label: "Role",
      width: 150,
      render: (e) => (
        <Text numberOfLines={1} className="text-sm text-gray-700 dark:text-gray-300">
          {staffRoleLabel(e.role)}
        </Text>
      ),
    },
    {
      key: "pin",
      label: "PIN",
      width: 110,
      render: (e) => <PinStatus entry={e} />,
    },
    {
      key: "actions",
      label: "Actions",
      width: 190,
      render: (e) => (
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={() => h.onSetPin(e)}
            disabled={h.busy}
            accessibilityRole="button"
            accessibilityLabel={`${e.has_pin ? "Reset" : "Set"} PIN for ${e.name}`}
            accessibilityState={{ disabled: h.busy }}
            className={`h-8 px-3 mr-1 items-center justify-center rounded-lg border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 active:bg-gray-100 dark:active:bg-neutral-800 ${
              h.busy ? "opacity-40" : ""
            }`}
          >
            <Text className="text-xs font-semibold text-gray-700 dark:text-gray-200">
              {e.has_pin ? "Reset PIN" : "Set PIN"}
            </Text>
          </Pressable>
          {e.locked && (
            <IconAction
              icon="unlock"
              tint="#B45309"
              label={`Unlock ${e.name}'s PIN`}
              disabled={h.busy}
              onPress={() => h.onUnlock(e)}
            />
          )}
          {e.has_pin && (
            <IconAction
              icon="trash-2"
              tint="#EF4444"
              label={`Remove ${e.name}'s PIN`}
              disabled={h.busy}
              onPress={() => h.onRemove(e)}
            />
          )}
        </View>
      ),
    },
  ];
}

/** The Employee PINs roster — the web's Employee / Role / PIN / Actions table. */
export function StaffPinsTable({
  roster,
  busy,
  onSetPin,
  onUnlock,
  onRemove,
}: { roster: StaffPinRosterEntry[] } & Handlers) {
  const columns = useMemo(
    () => buildColumns({ busy, onSetPin, onUnlock, onRemove }),
    [busy, onSetPin, onUnlock, onRemove],
  );
  return <SelectableTable columns={columns} rows={roster} rowId={(e) => e.id} />;
}
