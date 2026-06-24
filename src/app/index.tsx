import { Image, View } from "react-native";

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center">
      <Image
        source={require("../../assets/zapzone-assests/zapzone.png")}
        className="w-56 h-56"
        resizeMode="contain"
      />
    </View>
  );
}
