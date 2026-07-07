import { View, Text, Pressable, useColorScheme } from 'react-native'
import React from 'react'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'


const UserManagement = () => {
  const router = useRouter()
  const scheme = useColorScheme()
  const headerIcon = scheme === 'dark' ? '#fff' : '#111'
  return (
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
          <Text className="text-gray-900 dark:text-white text-lg font-bold">User Management</Text>
          <View style={{ width: 36 }} />
        </View>
    </View>
  )
}

export default UserManagement