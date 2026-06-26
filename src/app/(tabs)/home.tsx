import { View, Text, Pressable, ScrollView, Modal, ActivityIndicator } from 'react-native'
import React, { useState } from 'react'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { BlurView } from 'expo-blur'
import { useDashboardMetrics } from '../../lib/hooks/useDashboardMetrics'

type DateFilterType = 'today' | 'last_24h' | 'last_7d' | 'last_30d' | 'all_time' | 'custom'

const Home = () => {
  const [selectedMetric, setSelectedMetric] = useState<number | null>(null)
  const [dateFilter, setDateFilter] = useState<DateFilterType>('today')
  const [showDateDropdown, setShowDateDropdown] = useState(false)
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  
  const { metrics, loading, error } = useDashboardMetrics(dateFilter, customStartDate, customEndDate)

  const dateFilterOptions = [
    { label: 'Today', value: 'today' as DateFilterType },
    { label: 'Last 24 Hours', value: 'last_24h' as DateFilterType },
    { label: 'Last 7 Days', value: 'last_7d' as DateFilterType },
    { label: 'Last 30 Days', value: 'last_30d' as DateFilterType },
    { label: 'All Time', value: 'all_time' as DateFilterType },
    { label: 'Custom Range', value: 'custom' as DateFilterType },
  ]

  const currentDateLabel = dateFilterOptions.find(opt => opt.value === dateFilter)?.label || 'Today'

  // Icon mapping
  const getIcon = (iconName: string) => {
    const iconMap: { [key: string]: any } = {
      'group.png': require("../../../assets/zapzone-assests/icon/group.png"),
      'ticket.png': require("../../../assets/zapzone-assests/icon/ticket.png"),
      'shopping-cart.png': require("../../../assets/zapzone-assests/icon/shopping-cart.png"),
      'membership.png': require("../../../assets/zapzone-assests/icon/membership.png"),
      'add-user.png': require("../../../assets/zapzone-assests/icon/add-user.png"),
      'checked.png': require("../../../assets/zapzone-assests/icon/checked.png"),
      'party.png': require("../../../assets/zapzone-assests/icon/party-popper.png"),
    }
    return iconMap[iconName] || null
  }

  // Darken color function
  const darkenColor = (color: string, percent: number = 30) => {
    const num = parseInt(color.replace("#", ""), 16)
    const amt = Math.round(2.55 * percent)
    const R = (num >> 16) - amt
    const G = (num >> 8 & 0x00FF) - amt
    const B = (num & 0x0000FF) - amt
    return "#" + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 +
      (G<255?G<1?0:G:255)*0x100 + (B<255?B<1?0:B:255))
      .toString(16).slice(1)
  }

  const metricDefinitions = [
    {
      id: 1,
      label: 'Today',
      title: 'Parties',
      key: 'parties' as const,
      icon: 'party.png',
      iconBg: 'bg-blue-100',
      color: '#5B7EFF',
      breakdown: [
        { label: 'Birthday Parties', percentage: '0%' },
        { label: 'Private Parties', percentage: '0%' },
        { label: 'Team Parties', percentage: '0%' },
        { label: 'Group Parties', percentage: '0%' },
        { label: 'Other', percentage: '0%' },
      ]
    },
    {
      id: 2,
      label: 'Today',
      title: 'Party Participants',
      key: 'party_participants' as const,
      icon: 'group.png',
      iconBg: 'bg-purple-100',
      color: '#A78BFA',
      breakdown: [
        { label: 'Children', percentage: '0%' },
        { label: 'Adults', percentage: '0%' },
      ]
    },
    {
      id: 3,
      label: 'Today',
      title: 'Attraction Sold',
      key: 'attraction_sold' as const,
      icon: 'ticket.png',
      iconBg: 'bg-green-100',
      color: '#10B981',
      breakdown: [
        { label: 'Laser Tag', percentage: '0%' },
        { label: 'Ropes', percentage: '0%' },
        { label: 'Arcade', percentage: '0%' },
        { label: 'Other Attraction', percentage: '0%' },
      ]
    },
    {
      id: 4,
      label: 'Today',
      title: 'Event Sold',
      key: 'event_sold' as const,
      icon: 'shopping-cart.png',
      iconBg: 'bg-pink-100',
      color: '#EC4899',
      breakdown: [
        { label: 'Open Jump', percentage: '0%' },
        { label: 'Special Events', percentage: '0%' },
        { label: 'Champs', percentage: '0%' },
        { label: 'Other Events', percentage: '0%' },
      ]
    },
    {
      id: 5,
      label: 'Today',
      title: 'Memberships',
      key: 'memberships' as const,
      icon: 'membership.png',
      iconBg: 'bg-yellow-100',
      color: '#F59E0B',
      breakdown: [
        { label: 'Basic', percentage: '0%' },
        { label: 'Standard', percentage: '0%' },
        { label: 'Premium', percentage: '0%' },
        { label: 'Family', percentage: '0%' },
      ]
    },
    {
      id: 6,
      label: 'Today',
      title: 'Unique Customers',
      key: 'unique_customers' as const,
      icon: 'add-user.png',
      iconBg: 'bg-red-100',
      color: '#EF4444',
      breakdown: [
        { label: 'New Customers', percentage: '0%' },
        { label: 'Returning Customers', percentage: '0%' },
      ]
    },
    {
      id: 7,
      label: 'Today',
      title: 'Confirm Booking',
      key: 'confirm_booking' as const,
      icon: 'checked.png',
      iconBg: 'bg-teal-100',
      color: '#14B8A6',
      breakdown: [
        { label: 'Parties', percentage: '0%' },
        { label: 'Events', percentage: '0%' },
        { label: 'Attraction', percentage: '0%' },
      ]
    },
  ]

  const MetricCard = ({ metric }: { metric: typeof metricDefinitions[0] }) => {
    const value = metrics ? String(metrics[metric.key] ?? 0) : '0'
    
    return (
      <Pressable
        onPress={() => setSelectedMetric(metric.id)}
        className='flex-1 bg-white rounded-xl p-4 m-1'
      >
        <View className='flex-row items-center justify-between mb-3'>
          <View className='flex-row items-center gap-1'>
            <Text className='text-xs font-medium text-gray-600'>
              {metric.label}
            </Text>
            <Image
              source={require("../../../assets/zapzone-assests/icon/info.png")}
              style={{width: 14, height: 14}}
              contentFit="contain"
            />
          </View>
          <View className={`${metric.iconBg} p-2.5 rounded-lg`}>
            <Image
              source={getIcon(metric.icon)}
              style={{ 
                width: 22, 
                height: 22,
                tintColor: darkenColor(metric.color, 20)
              }}
              contentFit="contain"
            />
          </View>
        </View>
        <Text className='text-base font-semibold text-gray-700 mb-3'>{metric.title}</Text>
        <Text className='text-4xl font-bold text-gray-900'>{value}</Text>
      </Pressable>
    )
  }

  const currentMetric = metricDefinitions.find(m => m.id === selectedMetric)

  return (
    <SafeAreaView className='flex-1 bg-background'> 
      <ScrollView className='flex-1' showsVerticalScrollIndicator={false}>
        <View className='px-5'>
          {/* Header */}
          <View className='flex-row items-center justify-between mb-6'>
            <Pressable>
              <Image
                source={require("../../../assets/zapzone-assests/icon/more.png")}
                style={{ width: 24, height: 24 }}
                contentFit="contain"
              />
            </Pressable>
            <Pressable>
              <Image
                source={require("../../../assets/zapzone-assests/icon/bell.png")}
                style={{ width: 24, height: 24 }}
                contentFit="contain"
              />
            </Pressable>
          </View>

          {/* Title Section */}
          <View className='mb-6'>
            <Text className='text-3xl font-bold text-gray-900 mb-2'>Dashboard</Text>
            <Text className='text-sm text-gray-500'>Real-time venue performance overview.</Text>
          </View>

          {/* Filter Section */}
          <View className='flex-row items-center justify-between mb-6 relative'>
            <View className='flex-1 mr-2'>
              <Pressable 
                onPress={() => setShowDateDropdown(!showDateDropdown)}
                className='flex-row items-center gap-2 bg-white px-4 py-3 rounded-lg border border-gray-200'
              >
                <Image
                  source={require("../../../assets/zapzone-assests/icon/calendar.png")}
                  style={{ width: 18, height: 18 }}
                  contentFit="contain"
                />
                <Text className='text-sm font-medium text-gray-700 flex-1'>{currentDateLabel}</Text>
                <Image
                  source={require("../../../assets/zapzone-assests/icon/arrow-down.png")}
                  style={{ width: 8, height: 12 }}
                  contentFit="contain"
                />
              </Pressable>

              {/* Dropdown Menu */}
              {showDateDropdown && (
                <View className='absolute top-14 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50'>
                  {dateFilterOptions.map((option, index) => (
                    <Pressable
                      key={option.value}
                      onPress={() => {
                        setDateFilter(option.value)
                        setShowDateDropdown(false)
                      }}
                      className={`px-4 py-3 ${index !== dateFilterOptions.length - 1 ? 'border-b border-gray-100' : ''} ${
                        dateFilter === option.value ? 'bg-blue-50' : ''
                      }`}
                    >
                      <Text className={`text-sm font-medium ${
                        dateFilter === option.value ? 'text-blue-700' : 'text-gray-700'
                      }`}>
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            
            <Pressable className='bg-white p-3 rounded-lg border border-gray-200'>
              <Image
                source={require("../../../assets/zapzone-assests/icon/scanner.png")}
                style={{ width: 20, height: 20 }}
                contentFit="contain"
              />
            </Pressable>
          </View>

          {/* Loading State */}
          {loading && (
            <View className='flex-1 justify-center items-center py-20'>
              <ActivityIndicator size="large" color="#0644C7" />
              <Text className='text-gray-500 mt-3'>Loading metrics...</Text>
            </View>
          )}

          {/* Error State */}
          {error && (
            <View className='bg-red-50 border border-red-200 rounded-lg p-4 mb-6'>
              <Text className='text-red-700 font-semibold'>Error</Text>
              <Text className='text-red-600 text-sm'>{error}</Text>
            </View>
          )}

          {/* Metrics Grid */}
          {!loading && !error && (
            <View className='flex-row flex-wrap'>
              {metricDefinitions.map((metric) => (
                <View key={metric.id} className='w-1/2'>
                  <MetricCard metric={metric} />
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Breakdown Modal */}
      <Modal
        visible={selectedMetric !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedMetric(null)}
      >
        <View className='flex-1 bg-black/50 justify-center items-center p-5'>
          <Pressable
            className='flex-1 justify-center items-center'
            onPress={() => setSelectedMetric(null)}
          >
            <Pressable
              className='bg-white rounded-2xl p-6 w-full max-w-sm'
              onPress={(e) => e.stopPropagation()}
            >
              {currentMetric && (
                <>
                  {/* Modal Header */}
                  <View className='flex-row items-center justify-between mb-6'>
                    <View className='flex-row items-center gap-3'>
                      <View style={{ backgroundColor: currentMetric.color }} className='p-2 rounded-lg'>
                        <Image
                          source={getIcon(currentMetric.icon)}
                          style={{ width: 20, height: 20 }}
                          contentFit="contain"
                          tintColor="#FFFFFF"
                        />
                      </View>
                      <Text className='text-lg font-bold text-gray-900'>{currentMetric.title} Breakdown</Text>
                    </View>
                    <Pressable
                      onPress={() => setSelectedMetric(null)}
                      className='p-1'
                    >
                      <Text className='text-xl text-gray-500'>✕</Text>
                    </Pressable>
                  </View>

                  {/* Breakdown Items */}
                  <View className='space-y-2 mb-4'>
                    {currentMetric.breakdown.map((item, index) => (
                      <View key={index} className='flex-row items-center justify-between py-2 border-b border-gray-100'>
                        <Text className='text-sm text-gray-700'>{item.label}</Text>
                        <Text className='text-xs text-gray-500'>{item.percentage}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Total */}
                  <View className='flex-row items-center justify-between pt-4 border-t border-gray-200'>
                    <Text className='text-sm font-semibold text-gray-900'>Total</Text>
                    <Text className='text-lg font-bold text-gray-900'>
                      {metrics ? metrics[currentMetric.key] ?? 0 : 0}
                    </Text>
                  </View>
                </>
              )}
            </Pressable>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

export default Home