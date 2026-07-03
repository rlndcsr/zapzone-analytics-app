import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import React from 'react';
import { router } from 'expo-router';
import { useNotifications } from '../../lib/hooks/useNotifications';
import { AppNotification, NotificationFilterType } from '../../services/notificationService';
import { Bell, ChevronLeft, Check, X, Filter, Bookmark, CreditCard, AlertCircle, BellOff } from 'lucide-react-native';

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
        return 'text-red-600';
      case 'medium':
        return 'text-amber-600';
      default:
        return 'text-blue-600';
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'high':
      case 'urgent':
        return <AlertCircle size={12} color="#dc2626" />;
      case 'medium':
        return <AlertCircle size={12} color="#d97706" />;
      default:
        return <Bell size={12} color="#2563eb" />;
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
          ? 'bg-blue-50/50 dark:bg-neutral-800/50' 
          : 'border border-gray-100 dark:border-neutral-800'
      }`}
      style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 1,
      }}
    >
      <View className="flex-row items-start justify-between mb-2">
        <View className="flex-1 flex-row items-center gap-3">
          <View className={`w-10 h-10 rounded-full items-center justify-center ${
            item.status === 'unread' 
              ? 'bg-blue-100 dark:bg-blue-900/30' 
              : 'bg-gray-100 dark:bg-neutral-800'
          }`}>
            <Bell size={20} color={item.status === 'unread' ? '#0644C7' : '#6b7280'} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-gray-900 dark:text-white">
              {item.title}
            </Text>
            <View className="flex-row items-center gap-1.5 mt-0.5">
              {getPriorityIcon(item.priority)}
              <Text className={`text-xs font-medium ${getPriorityColor(item.priority)}`}>
                {item.priority?.toUpperCase() || 'NORMAL'}
              </Text>
              {item.status === 'unread' && (
                <View className="w-1.5 h-1.5 rounded-full bg-blue-600 ml-1" />
              )}
            </View>
          </View>
        </View>
      </View>

      <View className="ml-13">
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

  const filterOptions: { label: string, value: NotificationFilterType, icon: any }[] = [
    { label: 'All', value: 'all', icon: Bell },
    { label: 'Unread', value: 'unread', icon: BellOff },
    { label: 'Bookings', value: 'booking', icon: Bookmark },
    { label: 'Purchase', value: 'payment', icon: CreditCard },
  ];

  const perPageOptions = [5, 10, 15];

  const getFilterIcon = (value: string) => {
    const option = filterOptions.find(opt => opt.value === value);
    return option?.icon || Bell;
  };

  return (
    <View className="flex-1 bg-gray-50 dark:bg-black">
      {/* Minimal Header */}
      <View className="bg-white dark:bg-neutral-900 pt-12 pb-4 px-5 border-b border-gray-100 dark:border-neutral-800">
        <View className="flex-row items-center justify-between">
          <Pressable 
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-gray-100 dark:bg-neutral-800 items-center justify-center"
          >
            <ChevronLeft size={20} color="#000" strokeWidth={2.5} />
          </Pressable>
          <Text className="text-lg font-semibold text-gray-900 dark:text-white">
            Notifications
          </Text>
          <Pressable 
            onPress={handleClearAll} 
            disabled={actionLoading}
            className="p-2"
          >
            <X size={18} color="#6b7280" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
      >
        <View className="px-5 pt-0">
          {/* Stats Section */}
          <View className="flex-row items-center justify-between bg-white dark:bg-neutral-900 rounded-2xl p-5 mt-6 mb-5 shadow-sm border border-gray-100 dark:border-neutral-800">
            <View>
              <Text className="text-sm font-medium text-gray-500 dark:text-gray-400">
                Total Notifications
              </Text>
              <Text className="text-2xl font-bold text-gray-900 dark:text-white">
                {totalCount}
              </Text>
            </View>
            <Pressable 
              onPress={markAllAsRead} 
              disabled={actionLoading}
              className="flex-row items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-neutral-800"
            >
              <Check size={16} color="#0644C7" />
              <Text className="text-xs font-medium text-[#0644C7]">
                Mark all read
              </Text>
            </Pressable>
          </View>

          {/* Filter Bar */}
          <View className="flex-row gap-2 mb-5 overflow-x-auto pb-1">
            {filterOptions.map((opt) => {
              const isActive = filter === opt.value;
              const IconComponent = opt.icon;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => updateFilter(opt.value)}
                  className={`flex-row items-center gap-2 px-4 py-2.5 rounded-xl border ${
                    isActive 
                      ? 'bg-[#0644C7] border-[#0644C7]' 
                      : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700'
                  }`}
                >
                  <IconComponent 
                    size={16} 
                    color={isActive ? '#FFFFFF' : '#6b7280'} 
                  />
                  <Text className={`text-xs font-medium ${
                    isActive ? 'text-white' : 'text-gray-600 dark:text-gray-300'
                  }`}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Loading State */}
          {(loading || actionLoading) && (
            <View className="bg-white dark:bg-neutral-900 rounded-2xl p-12 items-center shadow-sm border border-gray-100 dark:border-neutral-800">
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
                <BellOff size={32} color="#9ca3af" />
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