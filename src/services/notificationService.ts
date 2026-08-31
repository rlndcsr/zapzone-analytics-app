import { apiRequest } from "../lib/api";

const NOTIFICATIONS_TIMEOUT_MS = 30000;

export type AppNotification = {
  id: number;
  location_id: number;
  type: string;
  priority: string;
  title: string;
  message: string;
  action_url: string | null;
  action_text: string | null;
  status: "read" | "unread" | "archived";
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
  };
};

export type NotificationFilterType = "all" | "unread" | "booking" | "payment";

export async function fetchNotifications(
  token: string,
  filterType: NotificationFilterType = "all",
  page: number = 1,
  perPage: number = 5,
  signal?: AbortSignal,
): Promise<PaginatedNotificationsResponse> {
  let params = new URLSearchParams();
  if (filterType === "unread") {
    params.append("unread", "1");
  } else if (filterType === "booking") {
    params.append("type", "booking");
  } else if (filterType === "payment") {
    params.append("type", "payment"); // For 'Purchase' filter
  }

  params.append("page", page.toString());
  params.append("per_page", perPage.toString());

  return apiRequest<PaginatedNotificationsResponse>(
    `/api/notifications?${params.toString()}`,
    { token, timeoutMs: NOTIFICATIONS_TIMEOUT_MS, signal },
  );
}

/** One badge count per filter tab. */
export type NotificationCounts = Record<NotificationFilterType, number>;

/**
 * Counts for every filter tab.
 *
 * There is no count endpoint, so this asks the list endpoint for a single row
 * per filter and reads `pagination.total` — four small requests rather than
 * four full pages. A failed count reads as 0 so a badge never blocks the list.
 */
export async function fetchNotificationCounts(
  token: string,
  signal?: AbortSignal,
): Promise<NotificationCounts> {
  const filters: NotificationFilterType[] = [
    "all",
    "unread",
    "booking",
    "payment",
  ];
  const totals = await Promise.all(
    filters.map((f) =>
      fetchNotifications(token, f, 1, 1, signal)
        .then((r) => r?.data?.pagination?.total ?? 0)
        .catch(() => 0),
    ),
  );
  return {
    all: totals[0],
    unread: totals[1],
    booking: totals[2],
    payment: totals[3],
  };
}

export async function markAllNotificationsAsRead(
  token: string,
  locationId: number,
): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>(
    "/api/notifications/mark-all-as-read",
    {
      method: "PATCH",
      token,
      body: { location_id: locationId },
    },
  );
}

export async function clearAllNotifications(
  token: string,
  locationId: number,
): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>(
    "/api/notifications/clear-all",
    {
      method: "DELETE",
      token,
      body: { location_id: locationId },
    },
  );
}

export async function markNotificationAsRead(
  token: string,
  id: number,
): Promise<{ success: boolean; message: string }> {
  // `mark-as-read`, not `read` — matches the route the web admin calls
  // (Notifications.tsx: `PATCH ${API_BASE_URL}/notifications/${id}/mark-as-read`),
  // and lines up with the `mark-all-as-read` sibling below.
  return apiRequest<{ success: boolean; message: string }>(
    `/api/notifications/${id}/mark-as-read`,
    {
      method: "PATCH",
      token,
    },
  );
}

export async function deleteNotification(
  token: string,
  id: number,
): Promise<{ success: boolean; message: string }> {
  return apiRequest<{ success: boolean; message: string }>(
    `/api/notifications/${id}`,
    {
      method: "DELETE",
      token,
    },
  );
}
