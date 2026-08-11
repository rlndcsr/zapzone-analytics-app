import { apiRequest, apiUrl } from "../lib/api";

export type PhotoSessionStatus =
  "in_progress" | "awaiting_preview" | "processing" | "ready";

export type PhotoDeliveryMethod = "waiver_message" | "staff_qr" | "kiosk_qr";

export type PhotoDeliverySchedule = "immediate" | "next_day_9am";

export type PhotoProcessingStatus =
  "pending" | "processing" | "ready" | "failed";

export type PhotoDeliveryStatus =
  "queued" | "scheduled" | "sent" | "failed" | "canceled" | "skipped";

export type SessionDeliveryStatus =
  | "none"
  | "pending"
  | "scheduled"
  | "delivered"
  | "partially_delivered"
  | "failed";

export type PhotoChannel = "email" | "sms";

export type PhotoSource = "camera" | "upload" | "kiosk";

/** How the session that produced a photo was started. */
export type PhotoSessionSource = "staff" | "kiosk";

export type SlideshowState = "visible" | "hidden" | "removed";

/* ----------------------------------------------------------------- domain -- */

export type SessionPhoto = {
  id: number;
  position: number;
  source: PhotoSource;
  processingStatus: PhotoProcessingStatus;
  /** Full branded image (signed, expires). */
  deliveryUrl: string | null;
  thumbnailUrl: string | null;
  capturedAt: string | null;
  captureDate: string | null;
  operatingDay: string | null;
  slideshowEligible: boolean;
  slideshowState: SlideshowState;
  downloadCount: number;
};

/** One email/SMS row created for a session (email and SMS are tracked apart). */
export type PhotoDeliveryRow = {
  id: number;
  channel: PhotoChannel;
  destinationMasked: string;
  recipientName: string | null;
  status: PhotoDeliveryStatus;
  /** Same destination as an earlier row — recorded, but not sent twice. */
  isDuplicate: boolean;
  duplicateOfId: number | null;
};

export type PhotoSession = {
  id: number;
  status: PhotoSessionStatus;
  locationId: number;
  locationName: string | null;
  deliveryMethod: PhotoDeliveryMethod | null;
  deliverySchedule: PhotoDeliverySchedule | null;
  slideshowOptIn: boolean;
  photoCount: number;
  maxPhotos: number;
  photos: SessionPhoto[];
  qrStatus: "active" | "expired";
  qrExpiresAt: string | null;
  /** What the staff QR encodes — a page on the public web frontend. */
  qrTargetUrl: string;
  accessStatus: "active" | "expired";
  accessExpiresAt: string | null;
  photoLink: string;
  deliveryStatus: SessionDeliveryStatus;
  deliveries: PhotoDeliveryRow[];
};

/** Whether this site can actually send an email / SMS right now. */
export type PhotoChannelDiagnostics = {
  smsAvailable: boolean;
  emailAvailable: boolean;
  emailTransport: string;
  smsNote: string | null;
  emailNote: string | null;
};

export type PhotoCaptureContext = {
  location: {
    id: number;
    name: string;
    city: string | null;
    state: string | null;
    timezone: string;
  };
  operatingDay: string;
  activeOverlay: { id: number; name: string } | null;
  hasOverlay: boolean;
  limits: {
    staffMaxPhotos: number;
    kioskMaxPhotos: number;
    qrValidHours: number;
    accessValidDays: number;
    kioskCountdownSeconds: number;
    kioskIdleSeconds: number;
  };
  channels: PhotoChannelDiagnostics;
  retentionDays: number;
};

/** Session context the library shows alongside each photo. */
export type LibraryPhotoSession = {
  id: number | null;
  source: PhotoSessionSource | null;
  deliveryStatus: SessionDeliveryStatus | null;
  accessStatus: "active" | "expired" | null;
  accessExpiresAt: string | null;
  photoLink: string | null;
};

export type LibraryPhoto = SessionPhoto & {
  session: LibraryPhotoSession;
  locationName: string | null;
};

/** One operating day (6:00 AM → 5:59 AM) of photos. */
export type PhotoLibraryDay = {
  operatingDay: string;
  label: string;
  photoCount: number;
  kioskCount: number;
  staffCount: number;
  photos: LibraryPhoto[];
};

export type PhotoLibrary = {
  days: PhotoLibraryDay[];
  totalPhotos: number;
  /** The server capped the result at 1,500 photos. */
  truncated: boolean;
};

/** A photo attached to a slideshow queue. */
export type SlideshowQueuePhoto = SessionPhoto & {
  sessionSource: PhotoSessionSource | null;
};

export type SlideshowQueueRecord = {
  id: number;
  operatingDay: string | null;
  label: string | null;
  status: "active" | "closed";
  isPaused: boolean;
  openedAt: string | null;
  closedAt: string | null;
  closesAt: string | null;
  totalPhotos: number;
  visiblePhotos: number;
  /** Only the active queue carries photos; past queues return counts alone. */
  photos: SlideshowQueuePhoto[];
};

export type SlideshowSettings = {
  slideshowEnabled: boolean;
  slideshowDurationSeconds: number;
  slideshowUrl: string;
  slideshowPasscode: string;
  durations: number[];
  lastSeenAt: string | null;
  /** The display checked in within the last three minutes. */
  displayOnline: boolean;
};

export type SlideshowQueues = {
  active: SlideshowQueueRecord;
  past: SlideshowQueueRecord[];
  settings: SlideshowSettings;
  operatingDay: string;
  localTime: string;
  cutoffHour: number;
};

export type PhotoOverlayStatus =
  "active" | "scheduled" | "expired" | "disabled";

/** A branded frame composited under the capture-date layer. */
export type PhotoOverlay = {
  id: number;
  locationId: number;
  name: string;
  /** Public disk URL — overlays are venue branding, not customer media. */
  imageUrl: string | null;
  startsAt: string | null;
  endsAt: string | null;
  isEnabled: boolean;
  priority: number;
  status: PhotoOverlayStatus;
  /** True for the overlay that new photos are currently getting. */
  isActive: boolean;
  createdByName: string | null;
  createdAt: string | null;
};

export type PhotoOverlayConflict = {
  overlayId: number;
  overlayName: string;
  conflictsWithId: number;
  conflictsWithName: string;
  winnerId: number;
};

export type PhotoOverlays = {
  overlays: PhotoOverlay[];
  activeOverlayId: number | null;
  conflicts: PhotoOverlayConflict[];
  dateLayerNote: string;
};

/** A completed waiver the photo link can be sent to. */
export type PhotoWaiverMatch = {
  id: number;
  name: string;
  emailMasked: string | null;
  phoneMasked: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  /** False when no usable channel is on record (or the channel is down). */
  contactable: boolean;
  unavailableReason: string | null;
  photoVideoConsent: boolean | null;
  locationName: string | null;
  signedOn: string | null;
};

/* -------------------------------------------------------------- mapping -- */

type ApiPhoto = {
  id: number;
  position: number;
  source: PhotoSource;
  processing_status: PhotoProcessingStatus;
  delivery_url: string | null;
  thumbnail_url: string | null;
  captured_at: string | null;
  capture_date: string | null;
  operating_day: string | null;
  slideshow_eligible: boolean;
  slideshow_state: SlideshowState;
  download_count: number;
};

type ApiDelivery = {
  id: number;
  channel: PhotoChannel;
  destination_masked: string;
  recipient_name: string | null;
  status: PhotoDeliveryStatus;
  is_duplicate: boolean;
  duplicate_of_id: number | null;
};

type ApiSession = {
  id: number;
  status: PhotoSessionStatus;
  location_id: number;
  location_name: string | null;
  delivery_method: PhotoDeliveryMethod | null;
  delivery_schedule: PhotoDeliverySchedule | null;
  slideshow_opt_in: boolean;
  photo_count: number;
  max_photos: number;
  photos: ApiPhoto[];
  qr_status: "active" | "expired";
  qr_expires_at: string | null;
  qr_target_url: string;
  access_status: "active" | "expired";
  access_expires_at: string | null;
  photo_link: string;
  delivery_status: SessionDeliveryStatus;
  deliveries: ApiDelivery[];
};

function mapPhoto(raw: ApiPhoto): SessionPhoto {
  return {
    id: raw.id,
    position: raw.position,
    source: raw.source,
    processingStatus: raw.processing_status,
    deliveryUrl: raw.delivery_url,
    thumbnailUrl: raw.thumbnail_url,
    capturedAt: raw.captured_at,
    captureDate: raw.capture_date,
    operatingDay: raw.operating_day,
    slideshowEligible: Boolean(raw.slideshow_eligible),
    slideshowState: raw.slideshow_state,
    downloadCount: raw.download_count ?? 0,
  };
}

function mapDelivery(raw: ApiDelivery): PhotoDeliveryRow {
  return {
    id: raw.id,
    channel: raw.channel,
    destinationMasked: raw.destination_masked,
    recipientName: raw.recipient_name,
    status: raw.status,
    isDuplicate: raw.is_duplicate,
    duplicateOfId: raw.duplicate_of_id,
  };
}

function mapSession(raw: ApiSession): PhotoSession {
  return {
    id: raw.id,
    status: raw.status,
    locationId: raw.location_id,
    locationName: raw.location_name,
    deliveryMethod: raw.delivery_method,
    deliverySchedule: raw.delivery_schedule,
    slideshowOptIn: Boolean(raw.slideshow_opt_in),
    photoCount: raw.photo_count,
    maxPhotos: raw.max_photos,
    photos: (raw.photos ?? []).map(mapPhoto),
    qrStatus: raw.qr_status,
    qrExpiresAt: raw.qr_expires_at,
    qrTargetUrl: raw.qr_target_url,
    accessStatus: raw.access_status,
    accessExpiresAt: raw.access_expires_at,
    photoLink: raw.photo_link,
    deliveryStatus: raw.delivery_status,
    deliveries: (raw.deliveries ?? []).map(mapDelivery),
  };
}

/* ------------------------------------------------------------- endpoints -- */

/** Server-side image processing runs inside the request, so allow for it. */
const PHOTO_UPLOAD_TIMEOUT_MS = 60000;

/** GET /api/photo-sessions/context — location, overlay, limits and channels. */
export async function fetchCaptureContext(
  token: string,
  locationId: number,
  signal?: AbortSignal,
): Promise<PhotoCaptureContext> {
  const res = await apiRequest<{
    data: {
      location: PhotoCaptureContext["location"];
      operating_day: string;
      active_overlay: { id: number; name: string } | null;
      has_overlay: boolean;
      limits: {
        staff_max_photos: number;
        kiosk_max_photos: number;
        qr_valid_hours: number;
        access_valid_days: number;
        kiosk_countdown_seconds: number;
        kiosk_idle_seconds: number;
      };
      channels: {
        sms_available: boolean;
        email_available: boolean;
        email_transport: string;
        sms_note: string | null;
        email_note: string | null;
      };
      retention_days: number;
    };
  }>(`/api/photo-sessions/context?location_id=${locationId}`, {
    token,
    signal,
  });

  const d = res.data;
  return {
    location: d.location,
    operatingDay: d.operating_day,
    activeOverlay: d.active_overlay,
    hasOverlay: d.has_overlay,
    limits: {
      staffMaxPhotos: d.limits.staff_max_photos,
      kioskMaxPhotos: d.limits.kiosk_max_photos,
      qrValidHours: d.limits.qr_valid_hours,
      accessValidDays: d.limits.access_valid_days,
      kioskCountdownSeconds: d.limits.kiosk_countdown_seconds,
      kioskIdleSeconds: d.limits.kiosk_idle_seconds,
    },
    channels: {
      smsAvailable: d.channels.sms_available,
      emailAvailable: d.channels.email_available,
      emailTransport: d.channels.email_transport,
      smsNote: d.channels.sms_note,
      emailNote: d.channels.email_note,
    },
    retentionDays: d.retention_days,
  };
}

/** POST /api/photo-sessions — opens a staff session; verbal consent required. */
export async function startPhotoSession(
  token: string,
  locationId: number,
): Promise<PhotoSession> {
  const res = await apiRequest<{ data: ApiSession }>("/api/photo-sessions", {
    method: "POST",
    token,
    body: { location_id: locationId, verbal_consent: true },
  });
  return mapSession(res.data);
}

/**
 * POST /api/photo-sessions/{id}/photos — a camera capture, sent as a JPEG data
 * URL exactly like the web canvas capture so the backend records it as `camera`
 * (a multipart upload is always recorded as `upload`).
 */
export async function addCapturedPhoto(
  token: string,
  sessionId: number,
  dataUrl: string,
): Promise<PhotoSession> {
  const res = await apiRequest<{ data: ApiSession }>(
    `/api/photo-sessions/${sessionId}/photos`,
    {
      method: "POST",
      token,
      body: { image: dataUrl, source: "camera" },
      timeoutMs: PHOTO_UPLOAD_TIMEOUT_MS,
    },
  );
  return mapSession(res.data);
}

/**
 * POST /api/photo-sessions/{id}/photos — multipart upload of a file already on
 * the device (the web's "Upload from device"). Direct fetch so React Native
 * sets the multipart boundary itself.
 */
export async function uploadSessionPhoto(
  token: string,
  sessionId: number,
  asset: { uri: string; name?: string; type?: string },
): Promise<PhotoSession> {
  const form = new FormData();
  form.append("file", {
    uri: asset.uri,
    name: asset.name ?? "photo.jpg",
    type: asset.type ?? "image/jpeg",
  } as unknown as Blob);

  const res = await fetch(apiUrl(`/api/photo-sessions/${sessionId}/photos`), {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (data?.message as string) ?? "That file could not be uploaded.",
    );
  }
  return mapSession(data.data as ApiSession);
}

/** DELETE /api/photo-sessions/{id}/photos/{photoId} — before delivery only. */
export async function removeSessionPhoto(
  token: string,
  sessionId: number,
  photoId: number,
): Promise<PhotoSession> {
  const res = await apiRequest<{ data: ApiSession }>(
    `/api/photo-sessions/${sessionId}/photos/${photoId}`,
    { method: "DELETE", token },
  );
  return mapSession(res.data);
}

/** POST /api/photo-sessions/{id}/photos/reorder — full ordered id list. */
export async function reorderSessionPhotos(
  token: string,
  sessionId: number,
  order: number[],
): Promise<PhotoSession> {
  const res = await apiRequest<{ data: ApiSession }>(
    `/api/photo-sessions/${sessionId}/photos/reorder`,
    { method: "POST", token, body: { order } },
  );
  return mapSession(res.data);
}

/**
 * GET /api/photo-sessions/waiver-search — completed waivers by name, phone or
 * email (min 2 characters, 25 results). `location_id` orders local matches
 * first; it is a preference, not a filter.
 */
export async function searchPhotoWaivers(
  token: string,
  query: string,
  locationId?: number | null,
  signal?: AbortSignal,
): Promise<PhotoWaiverMatch[]> {
  const params = new URLSearchParams({ q: query });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<{
    data: {
      id: number;
      name: string;
      email_masked: string | null;
      phone_masked: string | null;
      has_email: boolean;
      has_phone: boolean;
      contactable: boolean;
      unavailable_reason: string | null;
      photo_video_consent: boolean | null;
      location_name: string | null;
      signed_on: string | null;
    }[];
  }>(`/api/photo-sessions/waiver-search?${params.toString()}`, {
    token,
    signal,
  });

  return (res.data ?? []).map((raw) => ({
    id: raw.id,
    name: raw.name,
    emailMasked: raw.email_masked,
    phoneMasked: raw.phone_masked,
    hasEmail: raw.has_email,
    hasPhone: raw.has_phone,
    contactable: raw.contactable,
    unavailableReason: raw.unavailable_reason,
    photoVideoConsent: raw.photo_video_consent,
    locationName: raw.location_name,
    signedOn: raw.signed_on,
  }));
}

export type DeliverPhotoSessionInput = {
  method: "waiver_message" | "staff_qr";
  schedule?: PhotoDeliverySchedule;
  waiverIds?: number[];
  slideshowOptIn?: boolean;
};

/**
 * POST /api/photo-sessions/{id}/deliver — one-shot: a session that already has
 * a delivery method is rejected. Returns the server's own summary line.
 */
export async function deliverPhotoSession(
  token: string,
  sessionId: number,
  input: DeliverPhotoSessionInput,
): Promise<{ session: PhotoSession; message: string | null }> {
  const res = await apiRequest<{ data: ApiSession; message?: string }>(
    `/api/photo-sessions/${sessionId}/deliver`,
    {
      method: "POST",
      token,
      body: {
        method: input.method,
        schedule:
          input.method === "waiver_message" ? input.schedule : undefined,
        waiver_ids:
          input.method === "waiver_message" ? input.waiverIds : undefined,
        slideshow_opt_in: input.slideshowOptIn,
      },
    },
  );
  return { session: mapSession(res.data), message: res.message ?? null };
}

/** DELETE /api/photo-sessions/{id} — discard everything before delivery. */
export async function discardPhotoSession(
  token: string,
  sessionId: number,
): Promise<void> {
  await apiRequest(`/api/photo-sessions/${sessionId}`, {
    method: "DELETE",
    token,
  });
}

/* --------------------------------------------------------- photo library -- */

/** Grouping and signed URLs make this a heavy response; give it room. */
const LIBRARY_TIMEOUT_MS = 30000;

type ApiLibraryPhoto = ApiPhoto & {
  session?: {
    id: number | null;
    source: PhotoSessionSource | null;
    delivery_status: SessionDeliveryStatus | null;
    access_status: "active" | "expired" | null;
    access_expires_at: string | null;
    photo_link: string | null;
  };
  location_name?: string | null;
};

function mapLibraryPhoto(raw: ApiLibraryPhoto): LibraryPhoto {
  return {
    ...mapPhoto(raw),
    session: {
      id: raw.session?.id ?? null,
      source: raw.session?.source ?? null,
      deliveryStatus: raw.session?.delivery_status ?? null,
      accessStatus: raw.session?.access_status ?? null,
      accessExpiresAt: raw.session?.access_expires_at ?? null,
      photoLink: raw.session?.photo_link ?? null,
    },
    locationName: raw.location_name ?? null,
  };
}

export type PhotoLibraryFilters = {
  locationId: number;
  source?: PhotoSessionSource;
  /** Operating day bounds, YYYY-MM-DD. */
  from?: string;
  to?: string;
};

/**
 * GET /api/photo-library — ready photos grouped by operating day. The server
 * returns the 14 most recent days and caps the set at 1,500 photos.
 */
export async function fetchPhotoLibrary(
  token: string,
  filters: PhotoLibraryFilters,
  signal?: AbortSignal,
): Promise<PhotoLibrary> {
  const params = new URLSearchParams({
    location_id: String(filters.locationId),
  });
  if (filters.source) params.append("source", filters.source);
  if (filters.from) params.append("from", filters.from);
  if (filters.to) params.append("to", filters.to);

  const res = await apiRequest<{
    data: {
      days: {
        operating_day: string;
        label: string;
        photo_count: number;
        kiosk_count: number;
        staff_count: number;
        photos: ApiLibraryPhoto[];
      }[];
      total_photos: number;
      truncated: boolean;
    };
  }>(`/api/photo-library?${params.toString()}`, {
    token,
    signal,
    timeoutMs: LIBRARY_TIMEOUT_MS,
  });

  return {
    days: (res.data?.days ?? []).map((day) => ({
      operatingDay: day.operating_day,
      label: day.label,
      photoCount: day.photo_count,
      kioskCount: day.kiosk_count,
      staffCount: day.staff_count,
      photos: (day.photos ?? []).map(mapLibraryPhoto),
    })),
    totalPhotos: res.data?.total_photos ?? 0,
    truncated: Boolean(res.data?.truncated),
  };
}

/** GET /api/photo-library/{id}/download — streamed JPEG; needs the bearer header. */
export function photoDownloadUrl(photoId: number): string {
  return apiUrl(`/api/photo-library/${photoId}/download`);
}

/** POST /api/photo-library/{id}/send — resend through the waiver message flow. */
export async function sendLibraryPhoto(
  token: string,
  photoId: number,
  input: { waiverIds: number[]; schedule?: PhotoDeliverySchedule },
): Promise<void> {
  await apiRequest(`/api/photo-library/${photoId}/send`, {
    method: "POST",
    token,
    body: { waiver_ids: input.waiverIds, schedule: input.schedule },
  });
}

/** POST /api/slideshow-photos/{id}/inclusion — add to, or drop from, today's queue. */
export async function setPhotoOnSlideshow(
  token: string,
  photoId: number,
  include: boolean,
): Promise<string> {
  const res = await apiRequest<{ message?: string }>(
    `/api/slideshow-photos/${photoId}/inclusion`,
    { method: "POST", token, body: { include } },
  );
  return res.message ?? "That change was saved.";
}

/** DELETE /api/photo-library/{id} — company_admin, admin or location_manager. */
export async function deleteLibraryPhoto(
  token: string,
  photoId: number,
): Promise<string> {
  const res = await apiRequest<{ message?: string }>(
    `/api/photo-library/${photoId}`,
    { method: "DELETE", token },
  );
  return res.message ?? "Photo deleted.";
}

/** POST /api/photo-library/delete — same role rule, max 200 ids. */
export async function deleteLibraryPhotos(
  token: string,
  photoIds: number[],
): Promise<string> {
  const res = await apiRequest<{ message?: string }>(
    "/api/photo-library/delete",
    { method: "POST", token, body: { photo_ids: photoIds } },
  );
  return res.message ?? "Photos deleted.";
}

/* ------------------------------------------------------- slideshow queue -- */

type ApiQueue = {
  id: number;
  operating_day: string | null;
  label: string | null;
  status: "active" | "closed";
  is_paused: boolean;
  opened_at: string | null;
  closed_at: string | null;
  closes_at: string | null;
  total_photos: number;
  visible_photos: number;
  photos: (ApiPhoto & { session_source?: PhotoSessionSource | null })[];
};

function mapQueue(raw: ApiQueue): SlideshowQueueRecord {
  return {
    id: raw.id,
    operatingDay: raw.operating_day,
    label: raw.label,
    status: raw.status,
    isPaused: Boolean(raw.is_paused),
    openedAt: raw.opened_at,
    closedAt: raw.closed_at,
    closesAt: raw.closes_at,
    totalPhotos: raw.total_photos,
    visiblePhotos: raw.visible_photos,
    photos: (raw.photos ?? []).map((photo) => ({
      ...mapPhoto(photo),
      sessionSource: photo.session_source ?? null,
    })),
  };
}

/**
 * GET /api/slideshow-queues — today's queue with its photos (priority first,
 * then capture time), the last 30 closed queues, and the display settings.
 */
export async function fetchSlideshowQueues(
  token: string,
  locationId: number,
  signal?: AbortSignal,
): Promise<SlideshowQueues> {
  const res = await apiRequest<{
    data: {
      active: ApiQueue;
      past: ApiQueue[];
      settings: {
        slideshow_enabled: boolean;
        slideshow_duration_seconds: number;
        slideshow_url: string;
        slideshow_passcode: string;
        durations: number[];
        last_seen_at: string | null;
        display_online: boolean;
      };
      operating_day: string;
      local_time: string;
      cutoff_hour: number;
    };
  }>(`/api/slideshow-queues?location_id=${locationId}`, { token, signal });

  const d = res.data;
  return {
    active: mapQueue(d.active),
    past: (d.past ?? []).map(mapQueue),
    settings: {
      slideshowEnabled: Boolean(d.settings.slideshow_enabled),
      slideshowDurationSeconds: d.settings.slideshow_duration_seconds,
      slideshowUrl: d.settings.slideshow_url,
      slideshowPasscode: d.settings.slideshow_passcode,
      durations: d.settings.durations ?? [],
      lastSeenAt: d.settings.last_seen_at,
      displayOnline: Boolean(d.settings.display_online),
    },
    operatingDay: d.operating_day,
    localTime: d.local_time,
    cutoffHour: d.cutoff_hour,
  };
}

/** PATCH /api/slideshow-photos/{photo} — show, hide or remove one photo. */
export async function updateSlideshowPhotoState(
  token: string,
  photoId: number,
  slideshowState: SlideshowState,
): Promise<void> {
  await apiRequest(`/api/slideshow-photos/${photoId}`, {
    method: "PATCH",
    token,
    body: { slideshow_state: slideshowState },
  });
}

/** POST /api/slideshow-queues/{queue}/reorder — full ordered photo id list. */
export async function reorderSlideshowQueue(
  token: string,
  queueId: number,
  order: number[],
): Promise<void> {
  await apiRequest(`/api/slideshow-queues/${queueId}/reorder`, {
    method: "POST",
    token,
    body: { order },
  });
}

/** POST /api/slideshow-queues/{queue}/paused — hold or resume the rotation. */
export async function setSlideshowQueuePaused(
  token: string,
  queueId: number,
  isPaused: boolean,
): Promise<void> {
  await apiRequest(`/api/slideshow-queues/${queueId}/paused`, {
    method: "POST",
    token,
    body: { is_paused: isPaused },
  });
}

/* ------------------------------------------------------------- overlays -- */

type ApiOverlay = {
  id: number;
  location_id: number;
  name: string;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_enabled: boolean;
  priority: number;
  status: PhotoOverlayStatus;
  is_active: boolean;
  created_by_name: string | null;
  created_at: string | null;
};

function mapOverlay(raw: ApiOverlay): PhotoOverlay {
  return {
    id: raw.id,
    locationId: raw.location_id,
    name: raw.name,
    imageUrl: raw.image_url,
    startsAt: raw.starts_at,
    endsAt: raw.ends_at,
    isEnabled: Boolean(raw.is_enabled),
    priority: raw.priority,
    status: raw.status,
    isActive: Boolean(raw.is_active),
    createdByName: raw.created_by_name,
    createdAt: raw.created_at,
  };
}

/** GET /api/photo-overlays — overlays for a location, priority first. */
export async function fetchPhotoOverlays(
  token: string,
  locationId: number,
  signal?: AbortSignal,
): Promise<PhotoOverlays> {
  const res = await apiRequest<{
    data: {
      overlays: ApiOverlay[];
      active_overlay_id: number | null;
      conflicts: {
        overlay_id: number;
        overlay_name: string;
        conflicts_with_id: number;
        conflicts_with_name: string;
        winner_id: number;
      }[];
      date_layer_note: string;
    };
  }>(`/api/photo-overlays?location_id=${locationId}`, { token, signal });

  return {
    overlays: (res.data?.overlays ?? []).map(mapOverlay),
    activeOverlayId: res.data?.active_overlay_id ?? null,
    conflicts: (res.data?.conflicts ?? []).map((c) => ({
      overlayId: c.overlay_id,
      overlayName: c.overlay_name,
      conflictsWithId: c.conflicts_with_id,
      conflictsWithName: c.conflicts_with_name,
      winnerId: c.winner_id,
    })),
    dateLayerNote: res.data?.date_layer_note ?? "",
  };
}

export type CreatePhotoOverlayInput = {
  locationId: number;
  name: string;
  /** The picked file, kept in its original encoding so PNG alpha survives. */
  file: { uri: string; name?: string; type?: string };
  startsAt?: string;
  endsAt?: string;
  priority: number;
};

/**
 * POST /api/photo-overlays — multipart upload (png/jpg/jpeg/webp, max 8 MB).
 * Direct fetch so React Native sets the multipart boundary itself.
 */
export async function createPhotoOverlay(
  token: string,
  input: CreatePhotoOverlayInput,
): Promise<PhotoOverlay> {
  const form = new FormData();
  form.append("location_id", String(input.locationId));
  form.append("name", input.name);
  form.append("image", {
    uri: input.file.uri,
    name: input.file.name ?? "overlay.png",
    type: input.file.type ?? "image/png",
  } as unknown as Blob);
  if (input.startsAt) form.append("starts_at", input.startsAt);
  if (input.endsAt) form.append("ends_at", input.endsAt);
  form.append("priority", String(input.priority));

  const res = await fetch(apiUrl("/api/photo-overlays"), {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      (data?.message as string) ?? "That overlay could not be saved.",
    );
  }
  return mapOverlay(data.data as ApiOverlay);
}

/** POST /api/photo-overlays/{id} — the update route; used for enable/disable. */
export async function setPhotoOverlayEnabled(
  token: string,
  overlayId: number,
  isEnabled: boolean,
): Promise<void> {
  await apiRequest(`/api/photo-overlays/${overlayId}`, {
    method: "POST",
    token,
    body: { is_enabled: isEnabled },
  });
}

/** DELETE /api/photo-overlays/{id} — removes the overlay and its image. */
export async function deletePhotoOverlay(
  token: string,
  overlayId: number,
): Promise<void> {
  await apiRequest(`/api/photo-overlays/${overlayId}`, {
    method: "DELETE",
    token,
  });
}
