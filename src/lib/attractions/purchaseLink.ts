import { router } from "expo-router";

import type { AttractionRow } from "../../services/attractionsService";
import { webUrl } from "../api";
import { buildLocationSlug, createSlugWithId } from "../slug";

/**
 * Public purchase URL for an attraction — the exact shape the web
 * ManageAttractions "Copy Link" button builds. Shared so the Attractions table
 * cell and the Attraction Details sheet produce identical links.
 */
export const buildPurchaseLink = (a: AttractionRow): string =>
  webUrl(
    `/purchase/attraction/${buildLocationSlug(
      a.locationName,
      a.locationId,
    )}/${createSlugWithId(a.name, a.id)}`,
  );

/**
 * The web admin's "View Purchase Page" action — opens the in-app purchase page
 * (the internal equivalent of the public `/purchase/attraction/...` route),
 * carrying the same id + slug the public URL uses.
 */
export const openPurchasePage = (a: AttractionRow): void => {
  router.push({
    pathname: "/attractions/purchase-page",
    params: { id: String(a.id), slug: createSlugWithId(a.name, a.id) },
  });
};
