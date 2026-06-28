import { apiRequest } from "../lib/api";

export type AppNotification = {
  id: number;
  location_id: number;
  type: string;
  priority: string;
  title: string;
  message: string;
  action_url: string | null;
  action_text: string | null;
  status: 'read' | 'unread' | 'archived';
  created_at: string;
  metadata: any;
};

export type PaginatedNotificationsResponse = {
  success: boolean;
  data: {
    notifications: AppNotification[];
    pagination: {
      current_page: number;
      last_page: number;
      per_page: number;
      total: number;
    };
  }
};

export type NotificationFilterType = 'all' | 'unread' | 'booking' | 'payment';

export async function fetchNotifications(
  token: string,
  filterType: NotificationFilterType = 'all',
  page: number = 1,
  perPage: number = 5
): Promise<PaginatedNotificationsResponse> {
  let params = new URLSearchParams();
  if (filterType === 'unread') {
    params.append('unread', '1');
  } else if (filterType === 'booking') {
    params.append('type', 'booking');
  } else if (filterType === 'payment') {
    params.append('type', 'payment'); // For 'Purchase' filter
  }

  params.append('page', page.toString());
  params.append('per_page', perPage.toString());

  return apiRequest<PaginatedNotificationsResponse>(
    `/api/notifications?${params.toString()}`,
    { token }
  );
}

export async function markAllNotificationsAsRead(
  token: string,
  locationId: number
): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>('/api/notifications/mark-all-as-read', {
    method: 'PATCH',
    token,
    body: { location_id: locationId },
  });
}

export async function clearAllNotifications(
  token: string,
  locationId: number
): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>('/api/notifications/clear-all', {
    method: 'DELETE',
    token,
    body: { location_id: locationId },
  });
}
