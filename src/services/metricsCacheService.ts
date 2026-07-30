import { Directory, File, Paths } from "expo-file-system";
import type { DashboardData } from "./metricsService";

// Port of the web admin's MetricsCacheService (zappoint
// src/services/MetricsCacheService.ts). The web puts a memory Map in front of
// the browser Cache Storage API and hydrates the dashboard from it *before*
// fetching, so its cards paint a snapshot up to CACHE_EXPIRY_MS old. Mobile had
// no metrics cache at all, so it always painted the live response — which is
// why the two clients could show different counts for the same window.
//
// RN has no Cache Storage API; the equivalent "survives a restart, may be
// evicted by the OS" store is a JSON file per key in the cache directory.

const CACHE_PREFIX = "metrics-cache-v1";
/** 5 minutes — the web's CACHE_EXPIRY_MS. */
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

/** The web has one component (and one cache namespace) per role dashboard. */
export type DashboardType = "attendant" | "company" | "manager";

export type CachedMetricsData = {
  data: DashboardData;
  timestamp: number;
};

type CacheScope = {
  dashboardType: DashboardType;
  /** Scopes entries to the signed-in user — see `getCacheKey`. */
  userId: number;
  locationId?: number | "all";
  timeframe?: string;
};

class MetricsCacheService {
  private memoryCache = new Map<string, CachedMetricsData>();

  /**
   * Mirrors the web's key — `metrics_<type>_<location>_<timeframe>` with its
   * `|| 'all'` and `|| 'last_30d'` fallbacks — plus the user id. The web omits
   * the user, which lets the next account read the previous one's cached
   * metrics for up to 5 minutes; that leak is not worth reproducing, and the
   * key is internal so scoping it changes no request and no displayed value.
   */
  private getCacheKey({
    dashboardType,
    userId,
    locationId,
    timeframe,
  }: CacheScope): string {
    return `metrics_${dashboardType}_${userId}_${locationId || "all"}_${
      timeframe || "last_30d"
    }`;
  }

  private isCacheValid(timestamp: number): boolean {
    return Date.now() - timestamp < CACHE_EXPIRY_MS;
  }

  private fileFor(cacheKey: string): File {
    return new File(Paths.cache, `${CACHE_PREFIX}-${cacheKey}.json`);
  }

  /** Memory hit → file hit → miss. Expired entries are dropped, like the web's. */
  async getCachedMetrics(scope: CacheScope): Promise<CachedMetricsData | null> {
    const cacheKey = this.getCacheKey(scope);

    const memoryData = this.memoryCache.get(cacheKey);
    if (memoryData && this.isCacheValid(memoryData.timestamp)) {
      return memoryData;
    }

    try {
      const file = this.fileFor(cacheKey);
      if (file.exists) {
        const parsed = JSON.parse(await file.text()) as CachedMetricsData;
        if (parsed?.data?.metrics && this.isCacheValid(parsed.timestamp)) {
          this.memoryCache.set(cacheKey, parsed);
          return parsed;
        }
        file.delete();
      }
    } catch {
      // A missing, unreadable, or corrupt entry is a cache miss — never an error.
    }

    return null;
  }

  /** Write-through to memory + disk after a successful fetch (best-effort). */
  async cacheMetrics(scope: CacheScope, data: DashboardData): Promise<void> {
    const cacheKey = this.getCacheKey(scope);
    const cached: CachedMetricsData = { data, timestamp: Date.now() };

    this.memoryCache.set(cacheKey, cached);

    try {
      const file = this.fileFor(cacheKey);
      file.create({ overwrite: true });
      file.write(JSON.stringify(cached));
    } catch {
      // Disk unavailable/full — the memory tier still serves this run.
    }
  }

  /**
   * Drop every cached dashboard snapshot (the web's `clearAllCaches`), so the
   * next dashboard render refetches. Called after a mutation that moves the
   * metrics, e.g. saving an edited purchase.
   */
  async clearAllCaches(): Promise<void> {
    this.memoryCache.clear();

    try {
      for (const entry of new Directory(Paths.cache).list()) {
        if (entry instanceof File && entry.name.startsWith(CACHE_PREFIX)) {
          entry.delete();
        }
      }
    } catch {
      // Unreadable cache dir — memory is already cleared, disk entries expire.
    }
  }
}

export const metricsCacheService = new MetricsCacheService();
