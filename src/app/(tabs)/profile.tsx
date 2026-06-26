import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getCurrentUser } from "../../lib/session";
import { signOut } from "../../services/auth";

const Profile = () => {
  const router = useRouter();
  const user = getCurrentUser();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;

    setLoggingOut(true);
    try {
      await signOut();
    } finally {
      router.replace("/");
    }
  };

  const roleLabel = user?.role
    ? String(user.role).replace(/_/g, " ")
    : null;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["top", "bottom"]}>
      <View className="flex-1 px-6 pt-6">
        <Text className="text-2xl font-bold text-gray-900">Profile</Text>

        {user ? (
          <View className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
            <Text className="text-lg font-semibold text-gray-900">
              {user.name}
            </Text>
            <Text className="mt-1 text-sm text-gray-500">{user.email}</Text>
            {roleLabel ? (
              <Text className="mt-1 text-sm capitalize text-gray-400">
                {roleLabel}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View className="mt-auto pb-6">
          <Pressable
            onPress={handleLogout}
            disabled={loggingOut}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            android_ripple={{ color: "#FECACA" }}
            className={`h-14 flex-row items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 active:opacity-90 ${
              loggingOut ? "opacity-60" : ""
            }`}
          >
            {loggingOut ? (
              <ActivityIndicator color="#DC2626" />
            ) : (
              <>
                <Feather name="log-out" size={18} color="#DC2626" />
                <Text className="text-base font-semibold text-red-600">
                  Log Out
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
};

export default Profile;
