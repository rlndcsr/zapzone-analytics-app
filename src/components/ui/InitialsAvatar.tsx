import { Text, View } from "react-native";

type InitialsAvatarProps = {
  initials: string;
  size?: number;
};

const FONT_RATIO = 0.318;

export function InitialsAvatar({ initials, size = 44 }: InitialsAvatarProps) {
  return (
    <View
      className="items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40"
      style={{ width: size, height: size }}
    >
      <Text
        className="font-bold text-[#2563EB] dark:text-blue-300"
        style={{ fontSize: Math.round(size * FONT_RATIO) }}
      >
        {initials}
      </Text>
    </View>
  );
}
