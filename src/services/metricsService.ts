import { apiRequest } from "../lib/api";

export type DashboardMetrics = {
  parties: number;
  party_participants: number;
  attraction_sold: number;
  event_sold: number;
  memberships: number;
  unique_customers: number;
  confirm_booking: number;
  [key: string]: number;
};

export async function fetchDashboardMetrics(
  userId: number,
  token: string,
  dateFilter: string = 'today',
  customStartDate: string = '',
  customEndDate: string = ''
): Promise<DashboardMetrics> {
  let params = new URLSearchParams();
  params.append('date_filter', dateFilter);
  
  if (dateFilter === 'custom' && customStartDate && customEndDate) {
    params.append('start_date', customStartDate);
    params.append('end_date', customEndDate);
  }

  return apiRequest<DashboardMetrics>(
    `/api/metrics/dashboard/${userId}?${params.toString()}`,
    { token }
  );
}