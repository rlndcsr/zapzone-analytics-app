import { Text, View } from "react-native";

import { STATUS_LABELS } from "../../lib/registrationForms/registrationForms";
import type { RegistrationFormStatus } from "../../services/registrationFormsService";

/** Open is blue; Closed and Date passed share the gray pill, as on the web.
 *  A soft pill with a leading status dot, matching the Attractions badge. */
export function RegistrationStatusPill({
  status,
}: {
  status: RegistrationFormStatus;
}) {
  const open = status === "open";
  return (
    <View
      className={`flex-row items-center gap-1.5 px-2 py-0.5 rounded-full ${
        open ? "bg-blue-50 dark:bg-blue-900/30" : "bg-gray-100 dark:bg-neutral-800"
      }`}
    >
      <View
        className={`w-1.5 h-1.5 rounded-full ${
          open ? "bg-blue-500" : "bg-gray-400"
        }`}
      />
      <Text
        className={`text-xs font-medium ${
          open
            ? "text-blue-700 dark:text-blue-400"
            : "text-gray-600 dark:text-gray-400"
        }`}
      >
        {STATUS_LABELS[status]}
      </Text>
    </View>
  );
}
