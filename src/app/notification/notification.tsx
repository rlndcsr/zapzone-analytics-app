import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import React from 'react';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { AppNotification, NotificationFilterType } from '../../services/notificationService';

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
  } = useNotifications('all');

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
      case 'urgent':
        return 'bg-red-500/10 text-red-600';
      case 'medium':
        return 'bg-amber-500/10 text-amber-600';
      default:
        return 'bg-blue-500/10 text-blue-600';
    }
  };

  const handleNotificationPress = (item: AppNotification) => {
    // Add any alternative on-press logic here
  };

  const renderNotification = (item: AppNotification) => (
    <Pressable
      key={item.id}
      onPress={() => handleNotificationPress(item)}
      className={`bg-white dark:bg-neutral-900 rounded-2xl p-5 mb-3 shadow-sm ${
        item.status === 'unread' 
          ? 'border-l-4 border-[#0644C7]' 
          : 'border border-gray-100 dark:border-neutral-800'
      }`}
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
        elevation: 1,
      }}
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 flex-row items-center gap-2">
          <View className="w-8 h-8 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center">
            <Text className="text-base">🔔</Text>
          </View>
          <Text className="text-sm font-semibold text-gray-900 dark:text-white flex-1">
            {item.title}
          </Text>
        </View>
        <View className={`px-2.5 py-1 rounded-full ${getPriorityColor(item.priority).split(' ')[0]}`}>
          <Text className={`text-xs font-medium ${getPriorityColor(item.priority).split(' ')[1]}`}>
            {item.priority?.toUpperCase() || 'NORMAL'}
          </Text>
        </View>
      </View>

      <View className="ml-10">
        <Text className="text-sm text-gray-600 dark:text-gray-300 leading-5 mb-2">
          {item.message}
        </Text>
        <Text className="text-xs text-gray-400 dark:text-gray-500">
          {new Date(item.created_at).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
          })} at {new Date(item.created_at).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
          })}
        </Text>
      </View>
    </Pressable>
  );

  const handleClearAll = () => {
    Alert.alert(
      "Clear All Notifications",
      "Are you sure you want to delete all notifications? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear All", style: "destructive", onPress: clearAll }
      ]
    );
  };

  const filterOptions: { label: string, value: NotificationFilterType }[] = [
    { label: 'All', value: 'all' },
    { label: 'Unread', value: 'unread' },
    { label: 'Bookings', value: 'booking' },
    { label: 'Purchase', value: 'payment' },
  ];

  const perPageOptions = [5, 10, 15];

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Gradient Header */}
      <View className="bg-[#0644C7] pt-12 pb-4 px-5 w-full relative overflow-hidden z-10">
        <View className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <View className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <View className="flex-row items-center justify-between relative z-10">
          <Pressable 
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm items-center justify-center"
          >
            <Image
              source={require('../../../assets/zapzone-assests/icon/left.png')}
              style={{ width: 18, height: 18 }}
              contentFit="contain"
              tintColor="#FFFFFF"
            />
          </Pressable>
          <Text className="text-xl font-bold text-white">
            Notifications
          </Text>
          <Pressable 
            onPress={handleClearAll} 
            disabled={actionLoading}
            className="px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm"
          >
            <Text className="text-xs font-medium text-white">
              Clear All
            </Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <View className="px-5 pt-0">
          {/* Welcome Section */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-[-6px] mb-5 shadow-sm">
            <Text className="text-lg font-bold text-gray-900 dark:text-white">
              Stay Updated
            </Text>
            <Text className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {totalCount > 0 
                ? `You have ${totalCount} notification${totalCount > 1 ? 's' : ''}`
                : 'No new notifications'}
            </Text>
          </View>

          {/* Filter & Actions Bar */}
          <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 mb-5 shadow-sm border border-gray-100 dark:border-neutral-800">
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                Filter by
              </Text>
              <Pressable 
                onPress={markAllAsRead} 
                disabled={actionLoading}
                className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-neutral-800 active:bg-gray-200 dark:active:bg-neutral-700"
              >
                <Text className="text-xs font-medium text-[#0644C7]">
                  Mark all read
                </Text>
              </Pressable>
            </View>

            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              className="flex-row -mx-1"
            >
              {filterOptions.map((opt) => {
                const isActive = filter === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => updateFilter(opt.value)}
                    className={`mx-1 px-4 py-2 rounded-full border ${
                      isActive 
                        ? 'bg-[#0644C7] border-[#0644C7]' 
                        : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700'
                    }`}
                  >
                    <Text className={`text-xs font-medium ${
                      isActive ? 'text-white' : 'text-gray-600 dark:text-gray-300'
                    }`}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Loading State */}
          {(loading || actionLoading) && (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-12 items-center shadow-sm">
              <ActivityIndicator size="large" color="#0644C7" />
              <Text className="text-gray-500 dark:text-gray-400 mt-4 text-sm font-medium">
                {actionLoading ? 'Processing...' : 'Loading notifications...'}
              </Text>
            </View>
          )}

          {/* Error State */}
          {error && !loading && (
            <View className="bg-red-50 border border-red-100 rounded-2xl p-5 mb-5">
              <Text className="text-red-600 font-semibold">Something went wrong</Text>
              <Text className="text-red-500 text-sm mt-1">{error}</Text>
            </View>
          )}

          {/* Empty State */}
          {!loading && !actionLoading && !error && notifications.length === 0 && (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-12 items-center shadow-sm border border-gray-100 dark:border-neutral-800">
              <View className="w-20 h-20 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center mb-4">
                <Text className="text-4xl">🔔</Text>
              </View>
              <Text className="text-gray-700 dark:text-gray-200 font-semibold text-lg">
                No notifications
              </Text>
              <Text className="text-gray-400 dark:text-gray-500 text-sm text-center mt-1 max-w-xs">
                You&apos;re all caught up! Check back later for updates.
              </Text>
            </View>
          )}

          {/* Notifications List */}
          {!loading && !actionLoading && !error && notifications.length > 0 && (
            <View>
              {notifications.map(renderNotification)}
            </View>
          )}

          {/* Pagination */}
          {!loading && !actionLoading && !error && totalCount > 0 && (
            <View className="mt-4 mb-10">
              <View className="bg-white dark:bg-neutral-900 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-neutral-800">
                <View className="flex-row items-center justify-between mb-4">
                  <Text className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    Items per page
                  </Text>
                  <View className="flex-row gap-1.5">
                    {perPageOptions.map((option) => {
                      const isActive = perPage === option;
                      return (
                        <Pressable
                          key={option}
                          onPress={() => updatePerPage(option)}
                          className={`px-3 py-1.5 rounded-lg border ${
                            isActive 
                              ? 'bg-[#0644C7] border-[#0644C7]' 
                              : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700'
                          }`}
                        >
                          <Text className={`text-xs font-medium ${
                            isActive ? 'text-white' : 'text-gray-600 dark:text-gray-300'
                          }`}>
                            {option}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View className="flex-row items-center justify-between pt-4 border-t border-gray-100 dark:border-neutral-800">
                  <Pressable
                    onPress={() => setPage(page - 1)}
                    disabled={page === 1}
                    className={`px-4 py-2 rounded-lg border ${
                      page === 1 
                        ? 'bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50' 
                        : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700'
                    }`}
                  >
                    <Text className={`text-sm font-medium ${
                      page === 1 
                        ? 'text-gray-400 dark:text-gray-500' 
                        : 'text-gray-700 dark:text-gray-200'
                    }`}>
                      Previous
                    </Text>
                  </Pressable>
                  
                  <Text className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Page {page} of {lastPage}
                  </Text>

                  <Pressable
                    onPress={() => setPage(page + 1)}
                    disabled={page >= lastPage}
                    className={`px-4 py-2 rounded-lg border ${
                      page >= lastPage 
                        ? 'bg-gray-50 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 opacity-50' 
                        : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700'
                    }`}
                  >
                    <Text className={`text-sm font-medium ${
                      page >= lastPage 
                        ? 'text-gray-400 dark:text-gray-500' 
                        : 'text-gray-700 dark:text-gray-200'
                    }`}>
                      Next
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default Notification;