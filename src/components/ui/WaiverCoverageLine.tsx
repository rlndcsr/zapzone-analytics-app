import { Clock, ShieldCheck, UserCheck, Users } from "lucide-react-native";
import { Text, View } from "react-native";

import {
  countLabel,
  formsSignedLabel,
  participantsCoveredLabel,
  type WaiverCoverage,
} from "../../lib/waivers/waiverCoverage";

export function WaiverCoverageLine({
  coverage,
  showCheckedIn = true,
}: {
  coverage: Pick<
    WaiverCoverage,
    "participants" | "forms" | "notSigned" | "participantsCheckedIn"
  >;
  showCheckedIn?: boolean;
}) {
  return (
    <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
      <View className="flex-row items-center gap-1">
        <Users size={12} color="#047857" />
        <Text className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
          {participantsCoveredLabel(coverage.participants)}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        <ShieldCheck size={12} color="#4B5563" />
        <Text className="text-[11px] font-medium text-gray-600 dark:text-gray-300">
          {formsSignedLabel(coverage.forms)}
        </Text>
      </View>
      {coverage.notSigned > 0 && (
        <View className="flex-row items-center gap-1">
          <Clock size={12} color="#D97706" />
          <Text className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
            {countLabel(coverage.notSigned, "form", "forms")} not signed yet
          </Text>
        </View>
      )}
      {showCheckedIn && coverage.participantsCheckedIn > 0 && (
        <View className="flex-row items-center gap-1">
          <UserCheck size={12} color="#047857" />
          <Text className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            {coverage.participantsCheckedIn} of {coverage.participants} checked
            in
          </Text>
        </View>
      )}
    </View>
  );
}
