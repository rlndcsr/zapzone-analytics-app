import { useEffect, useRef, useState } from "react";

import {
  fetchLocations,
  type LocationOption,
} from "../../services/locationsService";
import { getToken } from "../session";

/**
 * Active locations for the company-admin location filter / day-off picker.
 * Managers and attendants are auto-scoped to their own location server-side, so
 * callers typically only mount this for company admins.
 */
export function useLocationOptions() {
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchLocations(token)
      .then((list) => {
        if (requestId === requestIdRef.current) setLocations(list);
      })
      .catch(() => {
        /* Filter is best-effort; the list still loads without it. */
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
    return () => {
      requestIdRef.current++;
    };
  }, []);

  return { locations, loading };
}
