import { Text, View } from "react-native";

import { STATUS_LABELS } from "../../lib/registrationForms/registrationForms";
import type { RegistrationFormStatus } from "../../services/registrationFormsService";

/** Open is blue; Closed and Date passed share the gray pill, as on the web. */
export function RegistrationStatusPill({
  status,
}: {
  status: RegistrationFormStatus;
}) {
  const open = status === "open";
  return (
    <View
      className={`px-2 py-0.5 rounded-full border ${
        open
          ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800"
          : "bg-gray-100 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700"
      }`}
    >
      <Text
        className={`text-xs font-medium ${
          open
            ? "text-blue-800 dark:text-blue-300"
            : "text-gray-700 dark:text-gray-300"
        }`}
      >
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}
