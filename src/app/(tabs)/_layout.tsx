import { Image } from "expo-image";
import { Tabs } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, ImageSourcePropType, Pressable, View } from "react-native";

const AnimatedImage = Animated.createAnimatedComponent(Image);

const TabLayout = () => {
  const homeColorAnim = useRef(new Animated.Value(0)).current;
  const locationColorAnim = useRef(new Animated.Value(0)).current;
  const navigationColorAnim = useRef(new Animated.Value(0)).current;
  const calendarColorAnim = useRef(new Animated.Value(0)).current;
  const profileColorAnim = useRef(new Animated.Value(0)).current;

  const animateTabColor = (animValue: Animated.Value, focused: boolean) => {
    Animated.timing(animValue, {
      toValue: focused ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  const getColorValue = (animValue: Animated.Value) => {
    return animValue.interpolate({
      inputRange: [0, 1],
      outputRange: ["#999999", "#0644C7"],
    });
  };

  const getCenterIconColor = (animValue: Animated.Value) => {
    return animValue.interpolate({
      inputRange: [0, 1],
      outputRange: ["#999999", "#FFFFFF"],
    });
  };

  type TabIconProps = {
    source: ImageSourcePropType;
    animValue: Animated.Value;
    focused: boolean;
  };

  const TabIcon = ({ source, animValue, focused }: TabIconProps) => {
    useEffect(() => {
      animateTabColor(animValue, focused);
    }, [animValue, focused]);

    return (
      <AnimatedImage
        source={source}
        style={{
          width: 24,
          height: 24,
          tintColor: getColorValue(animValue) as any,
        }}
        contentFit="contain"
      />
    );
  };

  const CenterTabIcon = ({ source, animValue, focused }: TabIconProps) => {
    useEffect(() => {
      animateTabColor(animValue, focused);
    }, [animValue, focused]);

    return (
      <AnimatedImage
        source={source}
        style={{
          width: 18,
          height: 18,
          tintColor: getCenterIconColor(animValue) as any,
        }}
        contentFit="contain"
      />
    );
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#0644C7",
        tabBarInactiveTintColor: "#999999",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "#E0E0E0",
          borderTopWidth: 1,
          height: 70,
          paddingBottom: 8,
          paddingTop: 8,
        },
        headerShown: false,
        tabBarLabelStyle: {
          fontSize: 12,
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              source={require("../../../assets/zapzone-assests/icon/home.png")}
              animValue={homeColorAnim}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="location"
        options={{
          title: "Store Location",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              source={require("../../../assets/zapzone-assests/icon/pin.png")}
              animValue={locationColorAnim}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="navigation"
        options={{
          title: "",
          tabBarIcon: ({ focused }) => (
            <CenterTabIcon
              source={require("../../../assets/zapzone-assests/icon/more.png")}
              animValue={navigationColorAnim}
              focused={focused}
            />
          ),
          tabBarLabel: () => null,
          tabBarButton: (props: any) => (
            <Pressable
              {...props}
              style={props?.style}
              className="flex-1 justify-center items-center"
            >
              <View className="w-15 h-15 rounded-full bg-blue-600 justify-center items-center shadow-lg">
                {props?.children}
              </View>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              source={require("../../../assets/zapzone-assests/icon/calendar.png")}
              animValue={calendarColorAnim}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              source={require("../../../assets/zapzone-assests/icon/user.png")}
              animValue={profileColorAnim}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
};

export default TabLayout;
