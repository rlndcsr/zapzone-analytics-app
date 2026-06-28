import { View, Text, Pressable } from "react-native";
import React from "react";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";

const NotificationDetails = () => {
  const { id } = useLocalSearchParams<{ id?: string }>();

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View className="bg-blue-600 h-[37px] w-full mb-2" />
      <View className="px-5 py-4 flex-row items-center border-b border-gray-100 bg-white">
        <Pressable
          onPress={() => router.back()}
          className="mr-4 h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-gray-50 active:bg-gray-100"
        >
          <Image
            source={require("../../../assets/zapzone-assests/icon/left.png")}
            style={{ width: 14, height: 14, tintColor: "#1F2937" }}
            contentFit="contain"
          />
        </Pressable>
        <Text className="text-2xl font-bold text-gray-900">
          Notification Details
        </Text>
      </View>

      <View className="flex-1 items-center justify-center px-5">
        <Text className="text-gray-500 text-base font-medium">
          {id ? `Notification #${id}` : "No notification selected."}
        </Text>
      </View>
    </View>
  );
};

export default NotificationDetails;
