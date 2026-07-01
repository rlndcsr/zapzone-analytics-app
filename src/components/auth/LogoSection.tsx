import { Image } from "expo-image";
import { Text, View } from "react-native";

const logo = require("../../../assets/zapzone-assests/zapzone.png");

/** Brand logo with the screen title and supporting subtitle. */
export function LogoSection() {
  return (
    <View className="items-center">
      <Image
        source={logo}
        style={{ width: 76, height: 60 }}
        contentFit="contain"
      />

      <Text className="mt-5 text-3xl font-bold text-gray-900 dark:text-white">
        Sign In
      </Text>

      <Text className="mt-2 max-w-[280px] text-center text-sm leading-5 text-gray-400 dark:text-gray-500">
        Welcome back! Enter your details to get signed in to your account
      </Text>
    </View>
  );
}
