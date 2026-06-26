import { Link, Redirect } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";

import { hasPlayedSplash } from "../lib/splashState";

export default function HomeScreen() {
  if (!hasPlayedSplash()) {
    return <Redirect href="/splash" />;
  }

  return (
    <View className="flex-1 items-center justify-center">
      <Image
        source={require("../../assets/zapzone-assests/zapzone.png")}
        className="w-56 h-56"
        resizeMode="contain"
      />

      <Link href="/home" asChild>
        <Pressable>
          <Text className="text-2xl font-bold text-blue-500">Go to Home</Text>
        </Pressable>
      </Link>
    </View>
  );
}
