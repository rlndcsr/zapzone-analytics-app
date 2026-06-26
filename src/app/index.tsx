import { Link } from "expo-router";
import { Image, Pressable, View , Text} from "react-native";

export default function HomeScreen() {
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
