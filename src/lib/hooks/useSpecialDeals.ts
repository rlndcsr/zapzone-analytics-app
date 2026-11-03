import { useEffect, useMemo, useState } from "react";

import {
  fetchSpecialDeals,
  type PricingEntityType,
  type SpecialDealsResult,
} from "../../services/pricingService";
import { dealDatesFor, type SpecialDeal } from "../pricing/specialPricing";
import { getToken } from "../session";

export function useSpecialDeals(
  entityType: PricingEntityType,
  entityId: number | null | undefined,
  locationId: number | null | undefined,
): { deals: SpecialDeal[]; dealDates: Record<string, string> | undefined } {
  const [data, setData] = useState<SpecialDealsResult | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!entityId || !token) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    fetchSpecialDeals({
      token,
      entityType,
      entityId,
      locationId: locationId ?? undefined,
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) setData(res);
      })
      .catch(() => {
        if (!controller.signal.aborted) setData(null);
      });
    return () => controller.abort();
  }, [entityType, entityId, locationId]);

  const dealDates = useMemo(() => dealDatesFor(data?.dates), [data]);
  return { deals: data?.deals ?? [], dealDates };
}
