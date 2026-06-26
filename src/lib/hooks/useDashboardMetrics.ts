import { useEffect, useState } from 'react';
import { fetchDashboardMetrics, DashboardMetrics } from '../../services/metricsService';
import { getToken, getCurrentUser } from '../session';

type DateFilterType = 'today' | 'last_24h' | 'last_7d' | 'last_30d' | 'all_time' | 'custom'

export function useDashboardMetrics(dateFilter: DateFilterType = 'today', customStartDate: string = '', customEndDate: string = '') {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMetrics = async () => {
      try {
        const token = getToken();
        const user = getCurrentUser();

        if (!token || !user) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        if (!user.id) {
          setError('User ID is missing');
          setLoading(false);
          return;
        }

        setLoading(true);
        const data = await fetchDashboardMetrics(user.id, token, dateFilter, customStartDate, customEndDate);
        setMetrics(data);
        setError(null);
      } catch (err) {
        console.error('Metrics error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
        setMetrics(null);
      } finally {
        setLoading(false);
      }
    };

    loadMetrics();
  }, [dateFilter, customStartDate, customEndDate]);

  return { metrics, loading, error };
}