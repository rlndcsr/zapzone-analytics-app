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
