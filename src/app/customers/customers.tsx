import { View, Text, Pressable, useColorScheme, Animated, Easing } from 'react-native'
import React, { useEffect, useRef } from 'react'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'


const Customers = () => {
  const router = useRouter()
  const scheme = useColorScheme()
  const headerIcon = scheme === 'dark' ? '#fff' : '#111'
  
  // Animation values
  const spinValue = useRef(new Animated.Value(0)).current
  const pulseValue = useRef(new Animated.Value(1)).current
  const translateYValue = useRef(new Animated.Value(0)).current

  useEffect(() => {

    // Floating animation
    Animated.loop(
      Animated.sequence([
        Animated.timing(translateYValue, {
          toValue: -10,
          duration: 1500,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
        Animated.timing(translateYValue, {
          toValue: 0,
          duration: 1500,
          easing: Easing.ease,
          useNativeDriver: true,
        }),
      ])
    ).start()
  }, [spinValue, pulseValue, translateYValue])

  const spin = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  })

  return (
    <>
      {/* Header - Unchanged */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-5 px-5 w-full relative overflow-hidden z-10 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable
            onPress={() => router.back()}
            className="bg-gray-100 dark:bg-neutral-800 p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Feather name="chevron-left" size={20} color={headerIcon} />
          </Pressable>
          <Text className="text-gray-900 dark:text-white text-lg font-bold">Customers</Text>
          <View style={{ width: 36 }} />
        </View>
      </View>

      {/* Body Content */}
      <View className="flex-1 bg-white dark:bg-neutral-900 items-center justify-center px-5">
        {/* Animated Package Icon */}
        <Animated.View
          style={{
            transform: [
              { rotate: spin },
              { scale: pulseValue },
              { translateY: translateYValue },
            ],
          }}
          className="mb-8"
        >
          <Feather name="users" size={80} color={scheme === 'dark' ? '#fff' : '#111'} />
        </Animated.View>

        {/* Coming Soon Message */}
        <Text className="text-3xl font-bold text-gray-900 dark:text-white mb-3 text-center">
        Coming Soon!
        </Text>
        <Text className="text-base text-gray-600 dark:text-gray-400 text-center max-w-xs">
          We are working hard to bring you exciting new packages. Stay tuned for updates!
        </Text>

        {/* Animated Progress Indicator */}
        <View className="mt-8 flex-row items-center justify-center space-x-2">
          {[0, 1, 2].map((index) => (
            <Animated.View
              key={index}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: scheme === 'dark' ? '#fff' : '#111',
                transform: [
                  {
                    scale: pulseValue.interpolate({
                      inputRange: [1, 1.2],
                      outputRange: [1 - index * 0.2, 1.2 - index * 0.2],
                    }),
                  },
                ],
                opacity: pulseValue.interpolate({
                  inputRange: [1, 1.2],
                  outputRange: [0.5 + index * 0.25, 1],
                }),
              }}
            />
          ))}
        </View>
      </View>
    </>
  )
}

export default Customers