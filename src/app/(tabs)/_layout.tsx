import { Image } from "expo-image";
import { Tabs } from "expo-router";
import { ImageSourcePropType, Pressable, View } from "react-native";

const TabLayout = () => {
  type TabIconProps = {
    source: ImageSourcePropType;
    focused: boolean;
  };

  const TabIcon = ({ source, focused }: TabIconProps) => {
    return (
      <Image
        source={source}
        style={{
          width: 18,
          height: 18,
          tintColor: focused ? "#0644C7" : "#999999",
        }}
        contentFit="contain"
      />
    );
  };

  const CenterTabIcon = ({ source, focused }: TabIconProps) => {
    return (
      <Image
        source={source}
        style={{
          width: 18,
          height: 18,
          tintColor: "#FFFFFF",
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
          height: 80,
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
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="location"
        options={{
          title: "Location",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              source={require("../../../assets/zapzone-assests/icon/pin.png")}
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
              focused={focused}
            />
          ),
          tabBarLabel: () => null,
          tabBarButton: (props: any) => (
            <View style={{ top: -15, justifyContent: 'center', alignItems: 'center', ...props.style }}>
              <Pressable
                {...props}
                style={{}}
                className="w-16 h-16 rounded-full bg-blue-700 justify-center items-center shadow-lg"
              >
                {props?.children}
              </Pressable>
            </View>
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
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
};

export default TabLayout;
