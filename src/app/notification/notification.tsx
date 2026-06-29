import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native'
import React from 'react'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { useNotifications } from '../../lib/hooks/useNotifications'
import { AppNotification, NotificationFilterType } from '../../services/notificationService'

const Notification = () => {
  const {
    notifications,
    loading,
    error,
    filter,
    updateFilter,
    markAllAsRead,
    clearAll,
    actionLoading,
    page,
    setPage,
    perPage,
    updatePerPage,
    lastPage,
    totalCount
  } = useNotifications('all')

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
      case 'urgent':
        return 'text-red-700 bg-red-100'
      case 'medium':
        return 'text-orange-700 bg-orange-100'
      default:
        return 'text-blue-700 bg-blue-100'
    }
  }

  const handleNotificationPress = (item: AppNotification) => {
    // Add any alternative on-press logic here, such as marking a single notification as read
  }

  const renderNotification = (item: AppNotification) => (
    <Pressable
      key={item.id}
      onPress={() => handleNotificationPress(item)}
      className={`bg-white dark:bg-neutral-900 p-4 rounded-xl mb-3 border ${item.status === 'unread' ? 'border-blue-200 bg-blue-50/50' : 'border-gray-100 dark:border-neutral-800'} active:bg-gray-50 dark:active:bg-neutral-800`}
    >
      <View className="flex-row justify-between items-start mb-2">
        <View className="flex-1">
          <Text className="text-base font-semibold text-gray-900 dark:text-white">{item.title}</Text>
        </View>
        <View className={`px-2 py-1 rounded-md ml-2 ${getPriorityColor(item.priority).split(' ')[1]}`}>
          <Text className={`text-xs font-medium uppercase ${getPriorityColor(item.priority).split(' ')[0]}`}>
            {item.priority || 'NORMAL'}
          </Text>
        </View>
      </View>
      <Text className="text-sm text-gray-600 dark:text-gray-300 mb-2 leading-5">{item.message}</Text>
      <Text className="text-xs text-gray-400 dark:text-gray-500">
        {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </Pressable>
  )

  const handleClearAll = () => {
    Alert.alert(
      "Clear All Notifications",
      "Are you sure you want to delete all notifications? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear All", style: "destructive", onPress: clearAll }
      ]
    )
  }

  const filterOptions: { label: string, value: NotificationFilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Unread', value: 'unread' },
    { label: 'Bookings', value: 'booking' },
    { label: 'Purchase', value: 'payment' },
  ]

  const perPageOptions = [5, 10, 15]

  return (
    <View className="flex-1 bg-background dark:bg-black">
      {/* Header */}
      <View className="bg-blue-600 h-[37px] w-full mb-2" />
      <View className="px-5 py-4 flex-row items-center justify-between border-b border-gray-100 dark:border-neutral-800 bg-white dark:bg-neutral-900">
        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            className="mr-4 h-10 w-10 items-center justify-center rounded-full border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-black active:bg-gray-100 dark:active:bg-neutral-800"
          >
            <Image
              source={require('../../../assets/zapzone-assests/icon/left.png')}
              style={{ width: 14, height: 14, tintColor: '#9CA3AF' }}
              contentFit="contain"
            />
          </Pressable>
          <Text className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</Text>
        </View>
        <Pressable onPress={handleClearAll} disabled={actionLoading}>
          <Text className="text-red-600 font-semibold">Clear All</Text>
        </Pressable>
      </View>

      {/* Filters & Actions Bar */}
      <View className="bg-white dark:bg-neutral-900 border-b border-gray-100 dark:border-neutral-800 px-5 py-3">
        <View className="flex-row items-center justify-between mb-3">
          <Text className="text-sm font-semibold text-gray-700 dark:text-gray-200">Filter By:</Text>
          <Pressable
            onPress={markAllAsRead}
            disabled={actionLoading}
            className="bg-gray-100 dark:bg-neutral-800 px-3 py-1.5 rounded-lg active:bg-gray-200 dark:active:bg-neutral-800"
          >
            <Text className="text-blue-600 font-medium text-sm">Mark all read</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
          {filterOptions.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => updateFilter(opt.value)}
              className={`mr-2 px-4 py-2 rounded-full border ${filter === opt.value
                  ? 'bg-blue-600 border-blue-600'
                  : 'bg-white dark:bg-neutral-900 border-gray-300'
                }`}
            >
              <Text className={`text-sm font-medium ${filter === opt.value ? 'text-white' : 'text-gray-700 dark:text-gray-200'
                }`}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView className="flex-1 px-5 pt-4" showsVerticalScrollIndicator={false}>
        {(loading || actionLoading) && (
          <View className="py-10 items-center justify-center">
            <ActivityIndicator size="large" color="#0644C7" />
            <Text className="text-gray-500 dark:text-gray-400 mt-3 font-medium">
              {actionLoading ? 'Processing...' : 'Loading notifications...'}
            </Text>
          </View>
        )}

        {error && !loading && (
          <View className="bg-red-50 border border-red-200 p-4 rounded-xl mb-4">
            <Text className="text-red-700 font-semibold mb-1">Failed to load notifications</Text>
            <Text className="text-red-600 text-sm">{error}</Text>
          </View>
        )}

        {!loading && !actionLoading && !error && notifications.length === 0 && (
          <View className="py-10 items-center justify-center">
            <Text className="text-gray-500 dark:text-gray-400 text-base font-medium">No notifications found.</Text>
          </View>
        )}

        {!loading && !actionLoading && !error && notifications.map(renderNotification)}

        {/* Pagination UI */}
        {!loading && !actionLoading && !error && totalCount > 0 && (
          <View className="mt-4 mb-10 pb-10">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-sm text-gray-600 dark:text-gray-300 font-medium">Items per page:</Text>
              <View className="flex-row">
                {perPageOptions.map((option) => (
                  <Pressable
                    key={option}
                    onPress={() => updatePerPage(option)}
                    className={`ml-2 px-3 py-1.5 rounded-lg border ${perPage === option ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200' : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700'
                      }`}
                  >
                    <Text className={`text-sm font-medium ${perPage === option ? 'text-blue-700' : 'text-gray-600 dark:text-gray-300'
                      }`}>{option}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View className="flex-row items-center justify-between">
              <Pressable
                onPress={() => setPage(page - 1)}
                disabled={page === 1}
                className={`px-4 py-2 rounded-lg border ${page === 1 ? 'bg-gray-100 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50' : 'bg-white dark:bg-neutral-900 border-gray-300 active:bg-gray-50 dark:active:bg-neutral-800'
                  }`}
              >
                <Text className={`text-sm font-semibold ${page === 1 ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'
                  }`}>Previous</Text>
              </Pressable>

              <Text className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                Page {page} of {lastPage}
              </Text>

              <Pressable
                onPress={() => setPage(page + 1)}
                disabled={page >= lastPage}
                className={`px-4 py-2 rounded-lg border ${page >= lastPage ? 'bg-gray-100 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50' : 'bg-white dark:bg-neutral-900 border-gray-300 active:bg-gray-50 dark:active:bg-neutral-800'
                  }`}
              >
                <Text className={`text-sm font-semibold ${page >= lastPage ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'
                  }`}>Next</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

export default Notification