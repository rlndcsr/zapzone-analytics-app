import { apiRequest } from "../lib/api";

/** Purchase status, normalized like the web ("completed" -> "confirmed"). */
export type PurchaseStatus =
  | "confirmed"
  | "pending"
  | "checked-in"
  | "cancelled"
  | "refunded"
  | "voided";

/** Flattened attraction-purchase row backing the list + KPI cards. */
export type PurchaseRow = {
  id: number;
  attractionName: string;
  category: string;
  customerName: string;
  email: string;
  phone: string;
  quantity: number;
  status: PurchaseStatus;
  totalAmount: number;
  amountPaid: number;
  paymentMethod: string;
  createdAt: string;
  scheduledDate: string | null;
  scheduledTime: string | null;
  locationId: number | null;
  /** Soft-delete timestamp; only present for trashed purchases. */
  deletedAt: string | null;
};

type RawPurchase = {
  id: number;
  quantity?: number | string | null;
  status?: string | null;
  total_amount?: number | string | null;
  amount_paid?: number | string | null;
  payment_method?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
  location_id?: number | null;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  guest_name?: string | null;
  guest_email?: string | null;
  guest_phone?: string | null;
  attraction?: { name?: string | null; category?: string | null } | null;
  customer?: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

type PurchasesListResponse = {
  success: boolean;
  data: {
    purchases: RawPurchase[];
    pagination?: {
      current_page: number;
      last_page: number;
      per_page: number;
      total: number;
    };
  };
};

// Web loads a single large page and filters/sorts client-side; mirror that.
const PER_PAGE = 100;

function mapPurchase(raw: RawPurchase): PurchaseRow {
  const customerName = raw.customer
    ? `${raw.customer.first_name ?? ""} ${raw.customer.last_name ?? ""}`.trim()
    : "";
  // Backend "completed" is shown as "confirmed" on the web.
  const status = (raw.status === "completed" ? "confirmed" : raw.status) as PurchaseStatus;

  return {
    id: raw.id,
    attractionName: raw.attraction?.name?.trim() || "Unknown Attraction",
    category: raw.attraction?.category?.trim() || "",
    customerName: customerName || raw.guest_name?.trim() || "Walk-in Customer",
    email: raw.customer?.email ?? raw.guest_email ?? "",
    phone: raw.customer?.phone ?? raw.guest_phone ?? "",
    quantity: Number(raw.quantity ?? 0),
    status: status ?? "pending",
    totalAmount: Number(raw.total_amount ?? 0),
    amountPaid: Number(raw.amount_paid ?? 0),
    paymentMethod: raw.payment_method ?? "",
    createdAt: raw.created_at ?? "",
    scheduledDate: raw.scheduled_date ?? null,
    scheduledTime: raw.scheduled_time ?? null,
    locationId: raw.location_id ?? null,
    deletedAt: raw.deleted_at ?? null,
  };
}

type FetchParams = {
  token: string;
  userId: number;
  locationId?: number;
  signal?: AbortSignal;
};

/**
 * GET /api/attraction-purchases — the same endpoint the web Manage Purchases
 * page uses. Returns all attraction purchases the user can access.
 */
export async function fetchAttractionPurchases({
  token,
  userId,
  locationId,
  signal,
}: FetchParams): Promise<PurchaseRow[]> {
  const params = new URLSearchParams({
    per_page: String(PER_PAGE),
    user_id: String(userId),
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<PurchasesListResponse>(
    `/api/attraction-purchases?${params.toString()}`,
    { token, signal },
  );
  const items = res?.data?.purchases ?? [];
  return items.map(mapPurchase);
}

/**
 * GET /api/attraction-purchases/trashed — soft-deleted purchases (the web
 * "View Deleted" list). Read-only here; restore/force-delete come later.
 */
export async function fetchTrashedAttractionPurchases({
  token,
  userId,
  locationId,
  signal,
}: FetchParams): Promise<PurchaseRow[]> {
  const params = new URLSearchParams({
    per_page: String(PER_PAGE),
    user_id: String(userId),
  });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<PurchasesListResponse>(
    `/api/attraction-purchases/trashed?${params.toString()}`,
    { token, signal },
  );
  const items = res?.data?.purchases ?? [];
  return items.map(mapPurchase);
}
