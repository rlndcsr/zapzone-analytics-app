import { ApiError, apiRequest, apiUrl } from "../lib/api";

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

export type SlideshowApprovalStatus = "pending" | "approved" | "rejected";

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
  slideshowApprovalStatus: SlideshowApprovalStatus | null;
  /** On the venue screen right now (eligible, visible and approved). */
  showsInSlideshow: boolean;
  width: number | null;
  height: number | null;
  downloadCount: number;
};

/** How a send actually went — for a text, whether it reached the phone. */
export type PhotoDeliveryOutcome =
  | "received"
  | "delivered"
  | "awaiting_carrier"
  | "unconfirmed"
  | "not_delivered"
  | "sent"
  | "failed"
  | "skipped"
  | "duplicate"
  | "scheduled"
  | "queued"
  | "canceled";

export type PhotoOutcomeTone = "success" | "info" | "warning" | "danger" | "muted";

export type PhotoTextingState = "not_configured" | "unverified" | "verified" | "failing";

/** Who a delivery row was sent to: a waiver, or an event registration. */
export type PhotoRecipientSource = "waiver" | "registration";

/** One email/SMS row created for a session (email and SMS are tracked apart). */
export type PhotoDeliveryRow = {
  id: number;
  channel: PhotoChannel;
  destinationMasked: string;
  recipientName: string | null;
  /** Null from a server that predates event-registration recipients. */
  recipientSource: PhotoRecipientSource | null;
  registrationEntryId: number | null;
  status: PhotoDeliveryStatus;
  /** Same destination as an earlier row — recorded, but not sent twice. */
  isDuplicate: boolean;
  duplicateOfId: number | null;
  error: string | null;
  /** The server's outcome; null from a server that predates delivery tracking. */
  outcome: PhotoDeliveryOutcome | null;
  outcomeTone: PhotoOutcomeTone | null;
  outcomeLabel: string | null;
  outcomeDetail: string | null;
  receiptConfirmedByName: string | null;
  /** The text is with the phone carrier and not yet confirmed either way. */
  awaitingCarrier: boolean;
  /** Still worth asking the carrier about; null when the server did not say. */
  carrierPending: boolean | null;
  canConfirmReceipt: boolean;
  /** False when sending again would not help (e.g. the number is blocked). */
  retryUseful: boolean | null;
  canRetry: boolean;
};

/** The server's summary of one send, for the result screen. */
export type PhotoSendOutcome = {
  result: "sent" | "partial" | "failed" | "scheduled";
  headline: string;
  message: string;
  carrierPending: number;
  deliveryIds: number[];
  confirmableIds: number[];
  textingState: PhotoTextingState;
  askForReceipt: boolean;
  /** Carriers are blocking texts from the sending number right now. */
  textsBlocked: boolean;
};

/** Whether photo texts are confirmed to reach phones, for one company. */
export type PhotoTextingStatus = {
  state: PhotoTextingState;
  headline: string;
  note: string | null;
  sender: string | null;
  senderKind: "toll_free" | "standard" | "short_code" | "none";
  verified: {
    at: string | null;
    method: "staff_confirmed" | "guest_opened_link";
    byName: string | null;
    locationName: string | null;
  } | null;
  problem: { code: string | null; meaning: string } | null;
  recent: {
    days: number;
    attempted: number;
    received: number;
    delivered: number;
    awaitingCarrier: number;
    unconfirmed: number;
    notDelivered: number;
    failed: number;
    skipped: number;
    topProblem: { code: string; meaning: string | null; count: number } | null;
  };
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
  /** Null from a server that predates texting confirmation. */
  smsStatus: PhotoTextingStatus | null;
  photoLinkNote: string | null;
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

/** The registration location form an event-day frame is tied to. */
export type PhotoOverlayEvent = {
  id: number;
  name: string | null;
  firstDay: string | null;
  eventDate: string | null;
  dayCount: number | null;
  /** 6 AM on the first day to 6 AM after the last, location time (ISO). */
  windowStart: string | null;
  windowEnd: string | null;
  /** The event window narrowed by the frame's own hours. */
  effectiveStart: string | null;
  effectiveEnd: string | null;
  /** The form was removed, so the frame is never used again. */
  locationFormRemoved: boolean;
  /** Its own hours fall outside the event's day(s). */
  neverRuns: boolean;
};

/** A branded frame composited under the capture-date layer. */
export type PhotoOverlay = {
  id: number;
  locationId: number;
  /** Set when the frame is only for one escape room's group photos. */
  packageId: number | null;
  roomName: string | null;
  /** Set when the frame is only for one event's day(s). */
  registrationEventId: number | null;
  event: PhotoOverlayEvent | null;
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
  winnerName: string | null;
};

/** The other locations' copies a new event frame was (or was not) given. */
export type PhotoOverlayCopies = {
  created: { overlayId: number; locationName: string | null }[];
  skipped: { locationName: string | null; reason: string | null }[];
};

/** Another location's form in the same registration event. */
export type PhotoEventDaySibling = {
  formId: number;
  locationId: number;
  locationName: string | null;
  firstDay: string;
  eventDate: string;
  /** False when the frame can't be copied there; `reason` says why. */
  usable: boolean;
  reason: string | null;
};

/** An upcoming registration location form a frame can be tied to. */
export type PhotoEventDay = {
  id: number;
  name: string;
  eventDate: string;
  firstDay: string;
  dayCount: number;
  groupId: number | null;
  windowStart: string | null;
  windowEnd: string | null;
  hasFrame: boolean;
  /** Only sent to company admins and admins. */
  siblings: PhotoEventDaySibling[];
};

export type PhotoEventDays = {
  /** False on a server without event frames, or before registrations exist. */
  available: boolean;
  forms: PhotoEventDay[];
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

export type PhotoWaiverRecipient = PhotoWaiverMatch & { kind: "waiver" };

/** An event registrant near the photo's day — emailed, and texted only on request. */
export type PhotoRegistrationMatch = {
  kind: "registration";
  id: number;
  name: string;
  emailMasked: string | null;
  phoneMasked: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  canEmail: boolean;
  /** A text can go out, but only when staff tick "Also text". */
  canText: boolean;
  contactable: boolean;
  unavailableReason: string | null;
  photoVideoConsent: boolean | null;
  eventName: string | null;
  firstDay: string | null;
  eventDate: string | null;
  /** The event runs on the photo's operating day. */
  coversPhotoDay: boolean;
  registeredOn: string | null;
};

/** One row of the guest picker: a waiver or an event registration. */
export type PhotoRecipientMatch = PhotoWaiverRecipient | PhotoRegistrationMatch;

export type PhotoPeopleSearchResult = {
  /** The operating day registrations are listed for (±1 day). */
  referenceDay: string | null;
  waivers: PhotoWaiverRecipient[];
  registrations: PhotoRegistrationMatch[];
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
  slideshow_approval_status?: SlideshowApprovalStatus | null;
  shows_in_slideshow?: boolean;
  width?: number | null;
  height?: number | null;
  download_count: number;
};

type ApiDelivery = {
  id: number;
  channel: PhotoChannel;
  destination_masked: string;
  recipient_name: string | null;
  recipient_source?: PhotoRecipientSource | null;
  registration_entry_id?: number | null;
  status: PhotoDeliveryStatus;
  is_duplicate: boolean;
  duplicate_of_id: number | null;
  error?: string | null;
  outcome?: PhotoDeliveryOutcome | null;
  outcome_tone?: PhotoOutcomeTone | null;
  outcome_label?: string | null;
  outcome_detail?: string | null;
  receipt_confirmed_by_name?: string | null;
  awaiting_carrier?: boolean;
  carrier_pending?: boolean;
  can_confirm_receipt?: boolean;
  retry_useful?: boolean;
  can_retry?: boolean;
};

type ApiSendOutcome = {
  result: PhotoSendOutcome["result"];
  headline: string;
  message: string;
  carrier_pending: number;
  delivery_ids: number[];
  confirmable_ids: number[];
  texting_state: PhotoTextingState;
  ask_for_receipt: boolean;
  texts_blocked?: boolean;
};

type ApiTextingStatus = {
  state: PhotoTextingState;
  headline: string;
  note: string | null;
  sender: string | null;
  sender_kind: PhotoTextingStatus["senderKind"];
  verified: {
    at: string | null;
    method: "staff_confirmed" | "guest_opened_link";
    by_name: string | null;
    location_name: string | null;
  } | null;
  problem: { code: string | null; meaning: string } | null;
  recent?: {
    days: number;
    attempted: number;
    received: number;
    delivered: number;
    awaiting_carrier: number;
    unconfirmed: number;
    not_delivered: number;
    failed: number;
    skipped: number;
    top_problem: { code: string; meaning: string | null; count: number } | null;
  };
};

function mapSendOutcome(raw: ApiSendOutcome | null | undefined): PhotoSendOutcome | null {
  if (!raw) return null;
  return {
    result: raw.result,
    headline: raw.headline,
    message: raw.message,
    carrierPending: raw.carrier_pending ?? 0,
    deliveryIds: raw.delivery_ids ?? [],
    confirmableIds: raw.confirmable_ids ?? [],
    textingState: raw.texting_state,
    askForReceipt: Boolean(raw.ask_for_receipt),
    textsBlocked: Boolean(raw.texts_blocked),
  };
}

export function mapTextingStatus(raw: ApiTextingStatus | null | undefined): PhotoTextingStatus | null {
  if (!raw) return null;
  const r = raw.recent;
  return {
    state: raw.state,
    headline: raw.headline,
    note: raw.note ?? null,
    sender: raw.sender ?? null,
    senderKind: raw.sender_kind ?? "none",
    verified: raw.verified
      ? {
          at: raw.verified.at,
          method: raw.verified.method,
          byName: raw.verified.by_name,
          locationName: raw.verified.location_name,
        }
      : null,
    problem: raw.problem ?? null,
    recent: {
      days: r?.days ?? 14,
      attempted: r?.attempted ?? 0,
      received: r?.received ?? 0,
      delivered: r?.delivered ?? 0,
      awaitingCarrier: r?.awaiting_carrier ?? 0,
      unconfirmed: r?.unconfirmed ?? 0,
      notDelivered: r?.not_delivered ?? 0,
      failed: r?.failed ?? 0,
      skipped: r?.skipped ?? 0,
      topProblem: r?.top_problem ?? null,
    },
  };
}

export type ApiSession = {
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
    slideshowApprovalStatus: raw.slideshow_approval_status ?? null,
    showsInSlideshow: Boolean(raw.shows_in_slideshow),
    width: raw.width ?? null,
    height: raw.height ?? null,
    downloadCount: raw.download_count ?? 0,
  };
}

/** The delivery-tracking fields every delivery payload carries (`presentDelivery`). */
function mapOutcomeFields(raw: Partial<ApiDelivery>) {
  return {
    error: raw.error ?? null,
    outcome: raw.outcome ?? null,
    outcomeTone: raw.outcome_tone ?? null,
    outcomeLabel: raw.outcome_label ?? null,
    outcomeDetail: raw.outcome_detail ?? null,
    receiptConfirmedByName: raw.receipt_confirmed_by_name ?? null,
    awaitingCarrier: Boolean(raw.awaiting_carrier),
    carrierPending: raw.carrier_pending ?? null,
    canConfirmReceipt: Boolean(raw.can_confirm_receipt),
    retryUseful: raw.retry_useful ?? null,
    // An older server omits it; keep offering the action rather than hide it.
    canRetry: raw.can_retry !== false,
  };
}

/** Which kind of guest the row went to (`presentDelivery`). */
function mapRecipientFields(raw: Partial<ApiDelivery>) {
  return {
    recipientSource: raw.recipient_source ?? null,
    registrationEntryId: raw.registration_entry_id ?? null,
  };
}

function mapDelivery(raw: ApiDelivery): PhotoDeliveryRow {
  return {
    id: raw.id,
    channel: raw.channel,
    destinationMasked: raw.destination_masked,
    recipientName: raw.recipient_name,
    ...mapRecipientFields(raw),
    status: raw.status,
    isDuplicate: raw.is_duplicate,
    duplicateOfId: raw.duplicate_of_id,
    ...mapOutcomeFields(raw),
  };
}

/** The current row a refused retry / confirm sends back with its 422. */
export function deliveryFromError(e: unknown): PhotoDeliveryRow | null {
  const data = e instanceof ApiError ? (e.body as { data?: ApiDelivery } | null)?.data : null;
  return data && typeof data === "object" && typeof data.id === "number" ? mapDelivery(data) : null;
}

export function mapSession(raw: ApiSession): PhotoSession {
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
        sms_status?: ApiTextingStatus | null;
        photo_link_note?: string | null;
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
      smsStatus: mapTextingStatus(d.channels.sms_status),
      photoLinkNote: d.channels.photo_link_note ?? null,
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
type ApiWaiverMatch = {
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
};

type ApiRegistrationMatch = {
  id: number;
  name: string;
  email_masked: string | null;
  phone_masked: string | null;
  has_email: boolean;
  has_phone: boolean;
  can_email: boolean;
  can_text: boolean;
  contactable: boolean;
  unavailable_reason: string | null;
  photo_video_consent: boolean | null;
  event_name: string | null;
  first_day: string | null;
  event_date: string | null;
  covers_photo_day: boolean;
  registered_on: string | null;
};

function mapWaiverMatch(raw: ApiWaiverMatch): PhotoWaiverMatch {
  return {
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
  };
}

function mapRegistrationMatch(raw: ApiRegistrationMatch): PhotoRegistrationMatch {
  return {
    kind: "registration",
    id: raw.id,
    name: raw.name,
    emailMasked: raw.email_masked,
    phoneMasked: raw.phone_masked,
    hasEmail: Boolean(raw.has_email),
    hasPhone: Boolean(raw.has_phone),
    canEmail: Boolean(raw.can_email),
    canText: Boolean(raw.can_text),
    contactable: Boolean(raw.contactable),
    unavailableReason: raw.unavailable_reason ?? null,
    photoVideoConsent: raw.photo_video_consent ?? null,
    eventName: raw.event_name ?? null,
    firstDay: raw.first_day ?? null,
    eventDate: raw.event_date ?? null,
    coversPhotoDay: Boolean(raw.covers_photo_day),
    registeredOn: raw.registered_on ?? null,
  };
}

const asWaiverRecipients = (rows: PhotoWaiverMatch[]): PhotoWaiverRecipient[] =>
  rows.map((row) => ({ ...row, kind: "waiver" as const }));

/** A 404 from Laravel's router (no such route), not a "record not found" 404. */
const isMissingRoute = (e: unknown): boolean => {
  if (!(e instanceof ApiError) || e.status !== 404) return false;
  const message = (e.body as { message?: unknown } | null | undefined)?.message;
  return typeof message !== "string" || /route .*could not be found/i.test(message);
};

export async function searchPhotoWaivers(
  token: string,
  query: string,
  locationId?: number | null,
  signal?: AbortSignal,
): Promise<PhotoWaiverMatch[]> {
  const params = new URLSearchParams({ q: query });
  if (locationId != null) params.append("location_id", String(locationId));

  const res = await apiRequest<{ data: ApiWaiverMatch[] }>(
    `/api/photo-sessions/waiver-search?${params.toString()}`,
    { token, signal },
  );

  return (res.data ?? []).map(mapWaiverMatch);
}

/**
 * GET /api/photo-sessions/people-search — completed waivers plus the event
 * registrants at the session's location whose event runs within a day of the
 * photo's operating day. A server without the route answers with waivers only.
 */
export async function searchPhotoPeople(
  token: string,
  query: string,
  photoSessionId: number,
  locationId?: number | null,
  signal?: AbortSignal,
): Promise<PhotoPeopleSearchResult> {
  const params = new URLSearchParams({
    q: query,
    photo_session_id: String(photoSessionId),
  });
  try {
    const res = await apiRequest<{
      data: {
        reference_day?: string | null;
        waivers?: ApiWaiverMatch[];
        registrations?: ApiRegistrationMatch[];
      } | null;
    }>(`/api/photo-sessions/people-search?${params.toString()}`, {
      token,
      signal,
    });
    const d = res.data;
    return {
      referenceDay: d?.reference_day ?? null,
      waivers: asWaiverRecipients(
        (Array.isArray(d?.waivers) ? d.waivers : []).map(mapWaiverMatch),
      ),
      registrations: (Array.isArray(d?.registrations) ? d.registrations : []).map(
        mapRegistrationMatch,
      ),
    };
  } catch (e) {
    if (!isMissingRoute(e)) throw e;
    return {
      referenceDay: null,
      waivers: asWaiverRecipients(
        await searchPhotoWaivers(token, query, locationId, signal),
      ),
      registrations: [],
    };
  }
}

/** Who a send goes to; registrations and the text opt-in only when chosen. */
export type PhotoRecipientIds = {
  waiverIds: number[];
  registrationEntryIds?: number[];
  /** Also text the chosen registrations that asked for a text. */
  textRegistrants?: boolean;
};

const recipientBody = (ids: PhotoRecipientIds) => ({
  waiver_ids: ids.waiverIds,
  ...(ids.registrationEntryIds?.length
    ? {
        registration_entry_ids: ids.registrationEntryIds,
        text_registrants: Boolean(ids.textRegistrants),
      }
    : {}),
});

export type DeliverPhotoSessionInput = {
  method: "waiver_message" | "staff_qr";
  schedule?: PhotoDeliverySchedule;
  /** Required for `waiver_message`; ignored for the staff QR. */
  recipients?: PhotoRecipientIds;
  slideshowOptIn?: boolean;
};

/** What a send returns: the session, the server's line, and how each message went. */
export type PhotoSendResult = {
  session: PhotoSession;
  message: string | null;
  outcome: PhotoSendOutcome | null;
};

/**
 * POST /api/photo-sessions/{id}/deliver — one-shot: a session that already has
 * a delivery method is rejected. Returns the server's own summary line.
 */
export async function deliverPhotoSession(
  token: string,
  sessionId: number,
  input: DeliverPhotoSessionInput,
): Promise<PhotoSendResult> {
  const res = await apiRequest<{ data: ApiSession; message?: string; outcome?: ApiSendOutcome }>(
    `/api/photo-sessions/${sessionId}/deliver`,
    {
      method: "POST",
      token,
      body: {
        method: input.method,
        schedule:
          input.method === "waiver_message" ? input.schedule : undefined,
        ...(input.method === "waiver_message" && input.recipients
          ? recipientBody(input.recipients)
          : {}),
        slideshow_opt_in: input.slideshowOptIn,
      },
    },
  );
  return {
    session: mapSession(res.data),
    message: res.message ?? null,
    outcome: mapSendOutcome(res.outcome),
  };
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
  /** Operating days to cover (1–120); the server's default is 14. */
  days?: number;
};

/**
 * GET /api/photo-library — ready photos grouped by operating day. The server
 * returns the `days` most recent days (14 by default) and caps the set at
 * 1,500 photos.
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
  if (filters.days != null) params.append("days", String(filters.days));

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

/** POST /api/photo-library/{id}/send — resend by email or text to waivers and registrants. */
export async function sendLibraryPhoto(
  token: string,
  photoId: number,
  input: PhotoRecipientIds & { schedule?: PhotoDeliverySchedule },
): Promise<PhotoSendResult> {
  const res = await apiRequest<{ data: ApiSession; message?: string; outcome?: ApiSendOutcome }>(
    `/api/photo-library/${photoId}/send`,
    {
      method: "POST",
      token,
      body: { ...recipientBody(input), schedule: input.schedule },
    },
  );
  return {
    session: mapSession(res.data),
    message: res.message ?? null,
    outcome: mapSendOutcome(res.outcome),
  };
}

/**
 * POST /api/slideshow-photos/{id}/inclusion — add to, or drop from, today's queue.
 * A 409 means some players were never asked about a photo release; send it
 * again with `confirmRelease` once staff confirm the group agreed.
 */
export async function setPhotoOnSlideshow(
  token: string,
  photoId: number,
  include: boolean,
  confirmRelease = false,
): Promise<string> {
  const res = await apiRequest<{ message?: string }>(
    `/api/slideshow-photos/${photoId}/inclusion`,
    {
      method: "POST",
      token,
      body: { include, ...(confirmRelease ? { confirm_release: true } : {}) },
    },
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

/* ---------------------------------------------------------- delivery log -- */

/**
 * What produced the send. The two schedules a waiver message can carry, plus
 * `kiosk` — a kiosk link is sent as soon as the guest asks for it, so it is a
 * kind of delivery rather than a schedule.
 */
export type PhotoDeliveryKind = PhotoDeliverySchedule | "kiosk";

/** One row of the delivery log — an email or SMS send, not a session. */
export type PhotoDeliveryLogRow = PhotoDeliveryRow & {
  sessionId: number | null;
  /** How the session that produced the link was started. */
  sessionSource: PhotoSessionSource | null;
  locationName: string | null;
  /** Immediate, held for 9:00 AM the next day, or kiosk (the "kind" column). */
  kind: PhotoDeliveryKind | null;
  /** When this row last moved — sent, else scheduled for, else created. */
  occurredAt: string | null;
  /** The customer followed the link at least once. */
  linkOpened: boolean;
  failureReason: string | null;
};

/** The web's "Text outcome" filter. */
export type PhotoTextOutcomeFilter = "not_delivered" | "awaiting_carrier" | "reached_phone";

export type PhotoDeliveryLog = {
  rows: PhotoDeliveryLogRow[];
  total: number;
  /** The server capped the result set. */
  truncated: boolean;
};

export type PhotoDeliveryLogFilters = {
  /**
   * Narrow to one location. Omitted when the workspace is on All Locations —
   * the log is company-wide, like the web page, which has no location filter and
   * prints the location on every row instead.
   */
  locationId?: number | null;
  status?: PhotoDeliveryStatus;
  channel?: PhotoChannel;
  kind?: PhotoDeliveryKind;
  /** Send-date bounds, YYYY-MM-DD. */
  from?: string;
  to?: string;
  /** The web's "Show deduplicated links" — include suppressed dupes. */
  includeDuplicates?: boolean;
  outcome?: PhotoTextOutcomeFilter;
};

type ApiDeliveryLogRow = Partial<ApiDelivery> & {
  /** What the log endpoint actually sends (`presentDelivery`). */
  photo_session_id?: number | null;
  session_id?: number | null;
  session?: {
    id?: number | null;
    source?: PhotoSessionSource | null;
    location_name?: string | null;
    location?: { name?: string | null } | null;
  } | null;
  session_source?: PhotoSessionSource | null;
  source?: PhotoSessionSource | null;
  location_name?: string | null;
  location?: { name?: string | null } | null;
  /** Destination, whichever name the serializer used. */
  destination?: string | null;
  masked_destination?: string | null;
  recipient?: string | null;
  name?: string | null;
  kind?: PhotoDeliveryKind | null;
  delivery_schedule?: PhotoDeliverySchedule | null;
  schedule?: PhotoDeliverySchedule | null;
  sent_at?: string | null;
  scheduled_for?: string | null;
  scheduled_at?: string | null;
  created_at?: string | null;
  link_opened?: boolean;
  link_opened_at?: string | null;
  opened_at?: string | null;
  failure_reason?: string | null;
  error?: string | null;
};

/**
 * Reads one row without assuming a single spelling. This endpoint has no local
 * source to check against, so each field accepts the plausible aliases rather
 * than rendering a blank cell when the serializer disagrees with the guess.
 */
function mapDeliveryLogRow(raw: ApiDeliveryLogRow): PhotoDeliveryLogRow {
  return {
    id: raw.id ?? 0,
    channel: raw.channel ?? "email",
    destinationMasked:
      raw.destination_masked ??
      raw.masked_destination ??
      raw.destination ??
      "—",
    recipientName: raw.recipient_name ?? raw.recipient ?? raw.name ?? null,
    ...mapRecipientFields(raw),
    status: raw.status ?? "queued",
    isDuplicate: Boolean(raw.is_duplicate),
    duplicateOfId: raw.duplicate_of_id ?? null,
    sessionId: raw.photo_session_id ?? raw.session?.id ?? raw.session_id ?? null,
    sessionSource: raw.session?.source ?? raw.session_source ?? raw.source ?? null,
    locationName:
      raw.session?.location_name ??
      raw.session?.location?.name ??
      raw.location_name ??
      raw.location?.name ??
      null,
    kind: raw.kind ?? raw.delivery_schedule ?? raw.schedule ?? null,
    // Whichever timestamp the row's status implies; the log sorts on this.
    occurredAt:
      raw.sent_at ??
      raw.scheduled_for ??
      raw.scheduled_at ??
      raw.created_at ??
      null,
    linkOpened: Boolean(raw.link_opened ?? raw.link_opened_at ?? raw.opened_at),
    failureReason: raw.failure_reason ?? raw.error ?? null,
    ...mapOutcomeFields(raw),
  };
}

/**
 * Pulls the row array out of whatever envelope came back: a bare array, a
 * Laravel paginator (`data.data`), or a named key. Returns [] when none matches,
 * and says so in dev — an empty list and an unrecognised envelope look identical
 * on screen otherwise, which is the hard part of diagnosing this remotely.
 */
function readDeliveryRows(payload: unknown): ApiDeliveryLogRow[] {
  if (Array.isArray(payload)) return payload as ApiDeliveryLogRow[];
  if (!payload || typeof payload !== "object") return [];

  const bag = payload as Record<string, unknown>;
  for (const key of ["deliveries", "rows", "data", "items", "results"]) {
    if (Array.isArray(bag[key])) return bag[key] as ApiDeliveryLogRow[];
  }
  if (__DEV__) {
    console.warn(
      "[photoDeliveryLog] no row array found; envelope keys =",
      Object.keys(bag),
    );
  }
  return [];
}

/** The delivery-log collection route, with `{id}/retry` and `{id}/cancel`. */
const DELIVERY_LOG_PATH = "/api/photo-deliveries";

/** Grouping and masking make this a heavier response than a plain list. */
const DELIVERY_LOG_TIMEOUT_MS = 30000;

/**
 * GET /api/photo-deliveries — every email and SMS row, newest first. Email and
 * SMS are tracked separately, so one session appears twice with its own status
 * per channel. Company-wide unless `locationId` narrows it.
 */
export async function fetchPhotoDeliveryLog(
  token: string,
  filters: PhotoDeliveryLogFilters = {},
  signal?: AbortSignal,
): Promise<PhotoDeliveryLog> {
  const params = new URLSearchParams();
  if (filters.locationId != null) {
    params.append("location_id", String(filters.locationId));
  }
  if (filters.status) params.append("status", filters.status);
  if (filters.channel) params.append("channel", filters.channel);
  if (filters.kind) params.append("kind", filters.kind);
  if (filters.from) params.append("from", filters.from);
  if (filters.to) params.append("to", filters.to);
  if (filters.includeDuplicates) params.append("include_duplicates", "1");
  if (filters.outcome) params.append("outcome", filters.outcome);

  const query = params.toString();
  const res = await apiRequest<Record<string, unknown>>(
    query ? `${DELIVERY_LOG_PATH}?${query}` : DELIVERY_LOG_PATH,
    { token, signal, timeoutMs: DELIVERY_LOG_TIMEOUT_MS },
  );

  // Rows may sit under `data` or at the top level; try both before giving up.
  const envelope = (res?.data ?? res) as Record<string, unknown>;
  const rawRows = readDeliveryRows(envelope);
  const rows = rawRows.map(mapDeliveryLogRow);

  const meta = Array.isArray(envelope)
    ? {}
    : ((envelope?.meta as Record<string, unknown>) ?? envelope ?? {});
  const total = typeof meta.total === "number" ? meta.total : rows.length;

  return { rows, total, truncated: Boolean(meta.truncated) };
}

/**
 * POST /api/photo-deliveries/{id}/retry — sends the same link again. A refusal
 * is a 422 carrying the current row; read it with {@link deliveryFromError}.
 */
export async function retryPhotoDelivery(
  token: string,
  deliveryId: number,
): Promise<{ message: string; row: PhotoDeliveryRow | null }> {
  const res = await apiRequest<{ message?: string; data?: ApiDelivery }>(
    `${DELIVERY_LOG_PATH}/${deliveryId}/retry`,
    { method: "POST", token },
  );
  return {
    message: res.message ?? "That link was sent again.",
    row: res.data ? mapDelivery(res.data) : null,
  };
}

/**
 * POST /api/photo-deliveries/status — asks the carrier about texts still on
 * their way. A 429 means this sign-in checked too often; wait a minute.
 */
export async function refreshPhotoDeliveryStatus(
  token: string,
  deliveryIds: number[],
): Promise<{ deliveries: PhotoDeliveryRow[]; outcome: PhotoSendOutcome | null }> {
  const res = await apiRequest<{
    data: { deliveries: ApiDelivery[]; outcome: ApiSendOutcome | null };
  }>(`${DELIVERY_LOG_PATH}/status`, {
    method: "POST",
    token,
    body: { delivery_ids: deliveryIds },
  });
  return {
    deliveries: (res.data?.deliveries ?? []).map(mapDelivery),
    outcome: mapSendOutcome(res.data?.outcome),
  };
}

/** POST /api/photo-deliveries/{id}/confirm-receipt — staff saw the text on the guest's phone. */
export async function confirmPhotoTextReceived(
  token: string,
  deliveryId: number,
): Promise<{ message: string; row: PhotoDeliveryRow }> {
  const res = await apiRequest<{ message: string; data: ApiDelivery }>(
    `${DELIVERY_LOG_PATH}/${deliveryId}/confirm-receipt`,
    { method: "POST", token },
  );
  return { message: res.message, row: mapDelivery(res.data) };
}

/** POST /api/photo-deliveries/{id}/cancel — drops a queued or scheduled send. */
export async function cancelPhotoDelivery(
  token: string,
  deliveryId: number,
): Promise<string> {
  const res = await apiRequest<{ message?: string }>(
    `${DELIVERY_LOG_PATH}/${deliveryId}/cancel`,
    { method: "POST", token },
  );
  return res.message ?? "That delivery was canceled.";
}

/* -------------------------------------------------------- photo reports -- */

/** One figure on a report — the server decides which, and in what order. */
export type PhotoReportMetric = {
  key: string;
  /** "PHOTOS UPLOADED" from `photos_uploaded`, as the web renders it. */
  label: string;
  value: string;
};

/** One record in a list-shaped report (Audit log, Daily library, …). */
export type PhotoReportRow = {
  key: string;
  fields: { key: string; label: string; value: string }[];
};

/**
 * A block of a report: figures, records, or both. The root block holds the
 * top-level figures; a nested object or list in the response becomes its own
 * titled block, so a report is rendered from whatever it returns.
 */
export type PhotoReportSection = {
  key: string;
  /** null on the root block, which needs no heading. */
  label: string | null;
  metrics: PhotoReportMetric[];
  rows: PhotoReportRow[];
};

/** A row of the Daily library report's `by_day` table. */
export type PhotoReportDay = {
  operatingDay: string;
  photos: number;
  downloads: number;
};

/** A row of the Audit log report's `entries` table. */
export type PhotoReportAuditEntry = {
  id: number;
  action: string;
  description: string | null;
  userName: string | null;
  locationName: string | null;
  createdAt: string | null;
};

export type PhotoReport = {
  sections: PhotoReportSection[];
  /** Daily library's `by_day`, newest operating day first (server order). */
  byDay: PhotoReportDay[];
  /** Audit log's `entries`, newest first (server order). */
  auditEntries: PhotoReportAuditEntry[];
  /** The zone the date bounds are read in, e.g. "America/Detroit". */
  timezone: string | null;
  /** The server's own sentence about that zone, when it sends one. */
  timezoneNote: string | null;
};

export type PhotoReportInput = {
  /** Which report to run — the URL segment, e.g. "activity". */
  report: string;
  /** Omitted when the workspace is on All Locations. */
  locationId?: number | null;
  /** Inclusive date bounds, YYYY-MM-DD, read in the location's zone. */
  from?: string;
  to?: string;
};

/** Keys that describe the request, not a figure to put on a tile. */
const REPORT_META_KEYS = new Set([
  "report",
  "type",
  "label",
  "timezone",
  "business_timezone",
  "timezone_note",
  "location_id",
  "location_name",
  "from",
  "to",
  "range",
  "generated_at",
]);

/** Lists with a dedicated table; the generic walker must leave them alone. */
const REPORT_TABLE_KEYS = new Set(["by_day", "entries"]);

const metricLabel = (key: string): string =>
  key.replace(/[_-]+/g, " ").trim().toUpperCase();

/** Numbers get thousands separators; anything unrenderable is dropped. */
function metricValue(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return raw.toLocaleString();
  }
  if (typeof raw === "string") return raw;
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  return null;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** How deep to follow nested objects before treating them as unrenderable. */
const REPORT_MAX_DEPTH = 2;

function rowFrom(entry: unknown, index: number): PhotoReportRow | null {
  if (isPlainObject(entry)) {
    const fields = Object.entries(entry)
      .map(([key, raw]) => ({
        key,
        label: metricLabel(key),
        value: metricValue(raw),
      }))
      .filter((f): f is PhotoReportRow["fields"][number] => f.value !== null);
    return fields.length ? { key: String(index), fields } : null;
  }
  const value = metricValue(entry);
  return value === null
    ? null
    : { key: String(index), fields: [{ key: "value", label: "", value }] };
}

/**
 * Walks a report response into flat, renderable blocks. The eight reports do not
 * share a shape — some are counters, some are lists — and there is no local
 * source for any of them, so nothing here is keyed to a known field name: every
 * figure and record is whatever the server sent, in its order.
 */
function buildSections(
  source: Record<string, unknown>,
  keyPath: string,
  label: string | null,
  depth: number,
  out: PhotoReportSection[],
): void {
  const section: PhotoReportSection = {
    key: keyPath || "root",
    label,
    metrics: [],
    rows: [],
  };
  out.push(section);

  for (const [key, raw] of Object.entries(source)) {
    // Only the root echoes the request back; a nested block's keys are data.
    if (depth === 0 && (REPORT_META_KEYS.has(key) || REPORT_TABLE_KEYS.has(key)))
      continue;

    const scalar = metricValue(raw);
    if (scalar !== null) {
      section.metrics.push({ key, label: metricLabel(key), value: scalar });
      continue;
    }

    if (Array.isArray(raw)) {
      const rows = raw
        .map(rowFrom)
        .filter((row): row is PhotoReportRow => row !== null);
      if (rows.length) {
        out.push({
          key: `${keyPath}${key}`,
          label: metricLabel(key),
          metrics: [],
          rows,
        });
      }
      continue;
    }

    if (isPlainObject(raw) && depth < REPORT_MAX_DEPTH) {
      buildSections(raw, `${keyPath}${key}.`, metricLabel(key), depth + 1, out);
    }
  }
}

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v : null;

const asCount = (v: unknown): number => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

function mapReportDays(raw: unknown): PhotoReportDay[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPlainObject).map((row) => ({
    operatingDay: asString(row.operating_day) ?? "—",
    photos: asCount(row.photos),
    downloads: asCount(row.downloads),
  }));
}

function mapAuditEntries(raw: unknown): PhotoReportAuditEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPlainObject).map((row, i) => ({
    id: asCount(row.id) || i,
    action: asString(row.action) ?? "—",
    description: asString(row.description),
    userName: asString(row.user_name),
    locationName: asString(row.location_name),
    createdAt: asString(row.created_at),
  }));
}

/**
 * GET /api/photo-reports/{type} — one report over a date range. Company-wide
 * unless `locationId` narrows it. `type` must be one of the eight the server
 * accepts; see REPORT_OPTIONS on the reports screen.
 */
export async function fetchPhotoReport(
  token: string,
  input: PhotoReportInput,
  signal?: AbortSignal,
): Promise<PhotoReport> {
  const params = new URLSearchParams();
  if (input.locationId != null) {
    params.append("location_id", String(input.locationId));
  }
  if (input.from) params.append("from", input.from);
  if (input.to) params.append("to", input.to);
  const query = params.toString();

  const path = `/api/photo-reports/${input.report}${query ? `?${query}` : ""}`;
  const res = await apiRequest<Record<string, unknown>>(path, {
    token,
    signal,
  });

  // Figures may sit under `data`, under `data.metrics`, or at the top level.
  const body = (res?.data ?? res) as Record<string, unknown>;
  const payload = isPlainObject(body.metrics)
    ? (body.metrics as Record<string, unknown>)
    : body;

  const sections: PhotoReportSection[] = [];
  buildSections(payload, "", null, 0, sections);

  const timezone = (body.business_timezone ?? null) as string | null;
  const timezoneNote = (body.timezone_note ?? null) as string | null;

  if (__DEV__ && sections.every((s) => !s.metrics.length && !s.rows.length)) {
    console.warn(
      `[photoReport:${input.report}] nothing renderable; payload keys =`,
      Object.keys(body),
    );
  }

  return {
    sections: sections.filter((s) => s.metrics.length || s.rows.length),
    byDay: mapReportDays(payload.by_day),
    auditEntries: mapAuditEntries(payload.entries),
    timezone,
    timezoneNote,
  };
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

type ApiOverlayEvent = {
  id: number;
  name: string | null;
  first_day: string | null;
  event_date: string | null;
  day_count: number | null;
  window_start: string | null;
  window_end: string | null;
  effective_start: string | null;
  effective_end: string | null;
  location_form_removed: boolean;
  never_runs: boolean;
};

type ApiOverlay = {
  id: number;
  location_id: number;
  package_id?: number | null;
  room_name?: string | null;
  registration_event_id?: number | null;
  event?: ApiOverlayEvent | null;
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

function mapOverlayEvent(raw: ApiOverlayEvent | null | undefined): PhotoOverlayEvent | null {
  if (!raw) return null;
  return {
    id: raw.id,
    name: raw.name ?? null,
    firstDay: raw.first_day ?? null,
    eventDate: raw.event_date ?? null,
    dayCount: raw.day_count ?? null,
    windowStart: raw.window_start ?? null,
    windowEnd: raw.window_end ?? null,
    effectiveStart: raw.effective_start ?? null,
    effectiveEnd: raw.effective_end ?? null,
    locationFormRemoved: Boolean(raw.location_form_removed),
    neverRuns: Boolean(raw.never_runs),
  };
}

function mapOverlay(raw: ApiOverlay): PhotoOverlay {
  return {
    id: raw.id,
    locationId: raw.location_id,
    packageId: raw.package_id ?? null,
    roomName: raw.room_name ?? null,
    registrationEventId: raw.registration_event_id ?? null,
    event: mapOverlayEvent(raw.event),
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
        winner_name?: string | null;
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
      winnerName: c.winner_name ?? null,
    })),
    dateLayerNote: res.data?.date_layer_note ?? "",
  };
}

/**
 * GET /api/photo-overlays/event-days — this location's upcoming registration
 * forms a frame can be tied to. A server without event frames 404s or says
 * `available: false`; both read as "no event days".
 */
export async function fetchPhotoEventDays(
  token: string,
  locationId: number,
  signal?: AbortSignal,
): Promise<PhotoEventDays> {
  try {
    const res = await apiRequest<{
      data: {
        available?: boolean;
        forms?: {
          id: number;
          name: string;
          event_date: string;
          first_day: string;
          day_count: number;
          group_id: number | null;
          window_start: string | null;
          window_end: string | null;
          has_frame: boolean;
          siblings?: {
            form_id: number;
            location_id: number;
            location_name: string | null;
            first_day: string;
            event_date: string;
            usable: boolean;
            reason: string | null;
          }[];
        }[];
      } | null;
    }>(`/api/photo-overlays/event-days?location_id=${locationId}`, {
      token,
      signal,
    });
    const d = res.data;
    return {
      available: Boolean(d?.available),
      forms: (Array.isArray(d?.forms) ? d.forms : []).map((f) => ({
        id: f.id,
        name: f.name,
        eventDate: f.event_date,
        firstDay: f.first_day || f.event_date,
        dayCount: f.day_count ?? 1,
        groupId: f.group_id ?? null,
        windowStart: f.window_start ?? null,
        windowEnd: f.window_end ?? null,
        hasFrame: Boolean(f.has_frame),
        siblings: (f.siblings ?? []).map((s) => ({
          formId: s.form_id,
          locationId: s.location_id,
          locationName: s.location_name ?? null,
          firstDay: s.first_day,
          eventDate: s.event_date,
          usable: Boolean(s.usable),
          reason: s.reason ?? null,
        })),
      })),
    };
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return { available: false, forms: [] };
    throw e;
  }
}

export type CreatePhotoOverlayInput = {
  locationId: number;
  name: string;
  /** The picked file, kept in its original encoding so PNG alpha survives. */
  file: { uri: string; name?: string; type?: string };
  startsAt?: string;
  endsAt?: string;
  priority: number;
  /** Only that escape room's group photos. */
  packageId?: number;
  /** Only on that registration form's event day(s). */
  registrationEventId?: number;
  /** Admins: also copy an event frame to the event's other locations. */
  alsoOtherLocations?: boolean;
};

/**
 * POST /api/photo-overlays — multipart upload (png/jpg/jpeg/webp, max 8 MB).
 * Direct fetch so React Native sets the multipart boundary itself.
 */
export async function createPhotoOverlay(
  token: string,
  input: CreatePhotoOverlayInput,
): Promise<{ overlay: PhotoOverlay; copies: PhotoOverlayCopies }> {
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
  if (input.packageId != null) form.append("package_id", String(input.packageId));
  if (input.registrationEventId != null) {
    form.append("registration_event_id", String(input.registrationEventId));
  }
  if (input.alsoOtherLocations) form.append("also_other_locations", "1");

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
  const copies = data?.copies as {
    created?: { overlay_id: number; location_name: string | null }[];
    skipped?: { location_name: string | null; reason: string | null }[];
  } | null | undefined;
  return {
    overlay: mapOverlay(data.data as ApiOverlay),
    copies: {
      created: (Array.isArray(copies?.created) ? copies.created : []).map((c) => ({
        overlayId: c.overlay_id,
        locationName: c.location_name ?? null,
      })),
      skipped: (Array.isArray(copies?.skipped) ? copies.skipped : []).map((s) => ({
        locationName: s.location_name ?? null,
        reason: s.reason ?? null,
      })),
    },
  };
}

/** POST /api/photo-overlays/{id} — tie the overlay to one escape room, or null for all photos. */
export async function setPhotoOverlayRoom(
  token: string,
  overlayId: number,
  roomId: number | null,
): Promise<void> {
  await apiRequest(`/api/photo-overlays/${overlayId}`, {
    method: "POST",
    token,
    body: { package_id: roomId },
  });
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

/* -------------------------------------------------------------- settings -- */

/** LocationPhotoSetting::toAdminArray() — passcodes and device URLs included. */
export type PhotoSettingRecord = {
  id: number;
  locationId: number;
  kioskEnabled: boolean;
  slideshowEnabled: boolean;
  kioskCountdownSeconds: number;
  slideshowDurationSeconds: number;
  retentionDays: number;
  dateFormat: string;
  datePosition: string;
  dateFontSize: number;
  dateMargin: number;
  dateBackground: string;
  failureNotifyEmail: string | null;
  kioskPasscode: string;
  slideshowPasscode: string;
  kioskUrl: string;
  slideshowUrl: string;
};

/** Server-side constants the admin cannot change. */
export type PhotoSettingsLocked = {
  qrValidHours: number;
  accessValidDays: number;
  staffMaxPhotos: number;
  kioskMaxPhotos: number;
  kioskIdleSeconds: number;
  operatingDayCutoffHour: number;
  nextDayDeliveryHour: number;
};

export type PhotoSettingsOptions = {
  dateFormats: { value: string; preview: string }[];
  datePositions: string[];
  dateBackgrounds: string[];
  slideshowDurations: number[];
  countdownOptions: number[];
};

export type PhotoSettings = {
  setting: PhotoSettingRecord;
  location: {
    id: number;
    name: string;
    timezone: string;
    timezoneStored: string | null;
  };
  locked: PhotoSettingsLocked;
  /** Settings adds the photo-link base to the shared channel diagnostics. */
  channels: PhotoChannelDiagnostics & {
    photoLinkBase: string | null;
  };
  options: PhotoSettingsOptions;
};

type ApiPhotoSetting = {
  id: number;
  location_id: number;
  kiosk_enabled: boolean;
  slideshow_enabled: boolean;
  kiosk_countdown_seconds: number | null;
  slideshow_duration_seconds: number | null;
  retention_days: number | null;
  date_format: string | null;
  date_position: string | null;
  date_font_size: number | null;
  date_margin: number | null;
  date_background: string | null;
  failure_notify_email: string | null;
  kiosk_passcode: string | null;
  slideshow_passcode: string | null;
  kiosk_url: string | null;
  slideshow_url: string | null;
};

function mapPhotoSetting(raw: ApiPhotoSetting): PhotoSettingRecord {
  return {
    id: raw.id,
    locationId: raw.location_id,
    kioskEnabled: Boolean(raw.kiosk_enabled),
    slideshowEnabled: Boolean(raw.slideshow_enabled),
    kioskCountdownSeconds: raw.kiosk_countdown_seconds ?? 10,
    slideshowDurationSeconds: raw.slideshow_duration_seconds ?? 8,
    retentionDays: raw.retention_days ?? 90,
    dateFormat: raw.date_format ?? "",
    datePosition: raw.date_position ?? "",
    dateFontSize: raw.date_font_size ?? 34,
    dateMargin: raw.date_margin ?? 28,
    dateBackground: raw.date_background ?? "",
    failureNotifyEmail: raw.failure_notify_email ?? null,
    kioskPasscode: raw.kiosk_passcode ?? "",
    slideshowPasscode: raw.slideshow_passcode ?? "",
    kioskUrl: raw.kiosk_url ?? "",
    slideshowUrl: raw.slideshow_url ?? "",
  };
}

/** GET /api/photo-settings?location_id= — one location's photo configuration. */
export async function fetchPhotoSettings(
  token: string,
  locationId: number,
  signal?: AbortSignal,
): Promise<PhotoSettings> {
  const res = await apiRequest<{
    data: {
      setting: ApiPhotoSetting;
      location: {
        id: number;
        name: string;
        timezone: string;
        timezone_stored: string | null;
      };
      locked: {
        qr_valid_hours: number;
        access_valid_days: number;
        staff_max_photos: number;
        kiosk_max_photos: number;
        kiosk_idle_seconds: number;
        operating_day_cutoff_hour: number;
        next_day_delivery_hour: number;
      };
      channels: {
        sms_available: boolean;
        email_available: boolean;
        email_transport: string;
        sms_note: string | null;
        email_note: string | null;
        photo_link_base: string | null;
        photo_link_note: string | null;
        sms_status?: ApiTextingStatus | null;
      };
      options: {
        date_formats: { value: string; preview: string }[];
        date_positions: string[];
        date_backgrounds: string[];
        slideshow_durations: number[];
        countdown_options: number[];
      };
    };
  }>(`/api/photo-settings?location_id=${locationId}`, { token, signal });

  const d = res.data;
  return {
    setting: mapPhotoSetting(d.setting),
    location: {
      id: d.location.id,
      name: d.location.name,
      timezone: d.location.timezone,
      timezoneStored: d.location.timezone_stored,
    },
    locked: {
      qrValidHours: d.locked.qr_valid_hours,
      accessValidDays: d.locked.access_valid_days,
      staffMaxPhotos: d.locked.staff_max_photos,
      kioskMaxPhotos: d.locked.kiosk_max_photos,
      kioskIdleSeconds: d.locked.kiosk_idle_seconds,
      operatingDayCutoffHour: d.locked.operating_day_cutoff_hour,
      nextDayDeliveryHour: d.locked.next_day_delivery_hour,
    },
    channels: {
      smsAvailable: Boolean(d.channels.sms_available),
      emailAvailable: Boolean(d.channels.email_available),
      emailTransport: d.channels.email_transport,
      smsNote: d.channels.sms_note,
      emailNote: d.channels.email_note,
      photoLinkBase: d.channels.photo_link_base ?? null,
      photoLinkNote: d.channels.photo_link_note ?? null,
      smsStatus: mapTextingStatus(d.channels.sms_status),
    },
    options: {
      dateFormats: d.options.date_formats ?? [],
      datePositions: d.options.date_positions ?? [],
      dateBackgrounds: d.options.date_backgrounds ?? [],
      slideshowDurations: d.options.slideshow_durations ?? [],
      countdownOptions: d.options.countdown_options ?? [],
    },
  };
}

export type PhotoSettingsUpdate = {
  locationId: number;
  kioskEnabled: boolean;
  slideshowEnabled: boolean;
  kioskCountdownSeconds: number;
  slideshowDurationSeconds: number;
  retentionDays: number;
  dateFormat: string;
  datePosition: string;
  dateFontSize: number;
  dateMargin: number;
  dateBackground: string;
  /** null clears it — sent explicitly so the server unsets the address. */
  failureNotifyEmail: string | null;
};

/** PUT /api/photo-settings — saves the editable fields for one location. */
export async function updatePhotoSettings(
  token: string,
  input: PhotoSettingsUpdate,
): Promise<PhotoSettingRecord> {
  const res = await apiRequest<{ data: ApiPhotoSetting }>(
    "/api/photo-settings",
    {
      method: "PUT",
      token,
      body: {
        location_id: input.locationId,
        kiosk_enabled: input.kioskEnabled,
        slideshow_enabled: input.slideshowEnabled,
        kiosk_countdown_seconds: input.kioskCountdownSeconds,
        slideshow_duration_seconds: input.slideshowDurationSeconds,
        retention_days: input.retentionDays,
        date_format: input.dateFormat,
        date_position: input.datePosition,
        date_font_size: input.dateFontSize,
        date_margin: input.dateMargin,
        date_background: input.dateBackground,
        failure_notify_email: input.failureNotifyEmail,
      },
    },
  );
  return mapPhotoSetting(res.data);
}

export type PhotoTestChannel = "email" | "sms";

export type PhotoTestResult = {
  success: boolean;
  message: string;
  /** A test text's carrier reference and check token, for following it up. */
  providerReference?: string | null;
  checkToken?: string | null;
  characters?: number | null;
  segments?: number | null;
  encoding?: string | null;
};

const firstFieldError = (e: ApiError): string | null =>
  Object.values(e.fieldErrors ?? {})[0]?.[0] ?? null;

/**
 * POST /api/photo-settings/test-message — sends a sample photo link to one
 * address. Resolves rather than throws, so the caller renders the outcome
 * inline exactly as the web does.
 */
export async function sendPhotoTestMessage(
  token: string,
  input: {
    locationId: number;
    channel: PhotoTestChannel;
    destination: string;
    /** Which template's saved wording to test; the server defaults to immediate. */
    kind?: PhotoTemplateKind;
  },
): Promise<PhotoTestResult> {
  try {
    const res = await apiRequest<{
      message?: string;
      data?: {
        provider_reference?: string | null;
        check_token?: string | null;
        characters?: number | null;
        segments?: number | null;
        encoding?: string | null;
      };
    }>("/api/photo-settings/test-message", {
      method: "POST",
      token,
      body: {
        location_id: input.locationId,
        channel: input.channel,
        destination: input.destination,
        ...(input.kind ? { kind: input.kind } : {}),
      },
    });
    return {
      success: true,
      message: res?.message ?? "Test message sent.",
      providerReference: res?.data?.provider_reference ?? null,
      checkToken: res?.data?.check_token ?? null,
      characters: res?.data?.characters ?? null,
      segments: res?.data?.segments ?? null,
      encoding: res?.data?.encoding ?? null,
    };
  } catch (e) {
    // First validation error, then the server's message — the web's order.
    const fieldError = e instanceof ApiError ? firstFieldError(e) : null;
    const message =
      fieldError ??
      (e instanceof Error && e.message
        ? e.message
        : "The test message could not be sent.");
    return { success: false, message };
  }
}

/** POST /api/photo-settings/test-message/status — has the carrier delivered the test text? */
export async function fetchTestMessageStatus(
  token: string,
  input: { locationId: number; providerReference: string; checkToken: string },
): Promise<{ final: boolean; delivered: boolean; message: string }> {
  const res = await apiRequest<{
    data: { final: boolean; delivered: boolean; message: string };
  }>("/api/photo-settings/test-message/status", {
    method: "POST",
    token,
    body: {
      location_id: input.locationId,
      provider_reference: input.providerReference,
      check_token: input.checkToken,
    },
  });
  return {
    final: Boolean(res.data?.final),
    delivered: Boolean(res.data?.delivered),
    message: res.data?.message ?? "",
  };
}

/** POST /api/photo-settings/texting/reset — company_admin / admin: mark texting not confirmed. */
export async function resetTextingConfirmation(
  token: string,
  locationId: number,
): Promise<{ message: string; texting: PhotoTextingStatus | null }> {
  const res = await apiRequest<{ message: string; data: ApiTextingStatus }>(
    "/api/photo-settings/texting/reset",
    { method: "POST", token, body: { location_id: locationId } },
  );
  return { message: res.message, texting: mapTextingStatus(res.data) };
}

/** POST /api/photo-settings/passcode — issues a new device passcode. */
export async function rotatePhotoPasscode(
  token: string,
  locationId: number,
  mode: "kiosk" | "slideshow",
): Promise<PhotoSettingRecord> {
  const res = await apiRequest<{ data: ApiPhotoSetting }>(
    "/api/photo-settings/passcode",
    { method: "POST", token, body: { location_id: locationId, mode } },
  );
  return mapPhotoSetting(res.data);
}

/* ----------------------------------------------------- message templates -- */

/** `registration` is the "Event registration photos" email sent to event registrants. */
export type PhotoTemplateKind = "immediate" | "next_day" | "kiosk" | "registration";

export type PhotoMessageTemplate = {
  id: number;
  companyId: number | null;
  kind: PhotoTemplateKind;
  emailSubject: string;
  emailBody: string;
  smsBody: string;
  /** For `registration`: off means registrants get the usual photo email. */
  isActive: boolean;
  /** For `registration`: attach the photos as well as the link. */
  attachPhotos: boolean;
};

export type PhotoTemplates = {
  templates: PhotoMessageTemplate[];
  /** Placeholder names, without the braces the UI adds. */
  variables: string[];
  /** Each kind's own variables (e.g. `event_name` for registration); null from an older server. */
  variablesByKind: Record<string, string[]> | null;
  /** `link_<key>` placeholders from "Links for photo messages". */
  linkVariables: { variable: string; label: string }[];
  kinds: string[];
  /** The Thanks for Playing email escape-room photos go out with. */
  escapeRoomEmail: {
    id: number;
    name: string;
    isActive: boolean;
    roomsWithoutEmail: string[];
    /** Each active Thanks email and the escape rooms it covers. */
    emails: { id: number; name: string; rooms: string[] }[];
  } | null;
};

type ApiPhotoTemplate = {
  id: number;
  company_id: number | null;
  kind: PhotoTemplateKind;
  email_subject: string | null;
  email_body: string | null;
  sms_body: string | null;
  is_active: boolean;
  attach_photos?: boolean | null;
};

function mapPhotoTemplate(raw: ApiPhotoTemplate): PhotoMessageTemplate {
  return {
    id: raw.id,
    companyId: raw.company_id ?? null,
    kind: raw.kind,
    emailSubject: raw.email_subject ?? "",
    emailBody: raw.email_body ?? "",
    smsBody: raw.sms_body ?? "",
    isActive: Boolean(raw.is_active),
    attachPhotos: Boolean(raw.attach_photos),
  };
}

/** GET /api/photo-templates — company templates plus the variable names. */
export async function fetchPhotoTemplates(
  token: string,
  signal?: AbortSignal,
): Promise<PhotoTemplates> {
  const res = await apiRequest<{
    data: {
      templates: ApiPhotoTemplate[];
      variables: string[];
      variables_by_kind?: Record<string, string[]> | null;
      link_variables?: { variable: string; label: string }[] | null;
      kinds: string[];
      escape_room_email?: {
        id: number;
        name: string;
        is_active: boolean;
        rooms_without_email?: string[];
        emails?: { id: number; name: string; rooms: string[] }[];
      } | null;
    };
  }>("/api/photo-templates", { token, signal });
  const email = res.data.escape_room_email;

  return {
    templates: (res.data.templates ?? []).map(mapPhotoTemplate),
    variables: res.data.variables ?? [],
    variablesByKind: res.data.variables_by_kind ?? null,
    linkVariables: Array.isArray(res.data.link_variables) ? res.data.link_variables : [],
    kinds: res.data.kinds ?? [],
    escapeRoomEmail: email
      ? {
          id: email.id,
          name: email.name,
          isActive: Boolean(email.is_active),
          roomsWithoutEmail: email.rooms_without_email ?? [],
          emails: (email.emails ?? []).map((e) => ({
            id: e.id,
            name: e.name,
            rooms: e.rooms ?? [],
          })),
        }
      : null,
  };
}

/** PUT /api/photo-templates/{id} — saves one template's wording (and, for registration, its switches). */
export async function updatePhotoTemplate(
  token: string,
  templateId: number,
  input: {
    emailSubject: string;
    emailBody: string;
    smsBody: string;
    isActive?: boolean;
    attachPhotos?: boolean;
  },
): Promise<PhotoMessageTemplate> {
  const res = await apiRequest<{ data: ApiPhotoTemplate }>(
    `/api/photo-templates/${templateId}`,
    {
      method: "PUT",
      token,
      body: {
        email_subject: input.emailSubject,
        email_body: input.emailBody,
        sms_body: input.smsBody,
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        ...(input.attachPhotos !== undefined ? { attach_photos: input.attachPhotos } : {}),
      },
    },
  );
  return mapPhotoTemplate(res.data);
}

/* --------------------------------------------- links for photo messages -- */

/** A named link with a default address and optional per-location addresses. */
export type PhotoMessageLink = {
  id: number;
  key: string;
  /** "link_instagram" — the placeholder without braces. */
  variable: string;
  label: string;
  defaultUrl: string | null;
  /** Only the locations this user works at. */
  urls: { locationId: number; url: string }[];
};

export type PhotoMessageLinks = {
  links: PhotoMessageLink[];
  locations: { id: number; name: string }[];
  /** Company admins and admins add, rename and remove links. */
  canManageLinks: boolean;
  maxLinks: number;
};

type ApiMessageLink = {
  id: number;
  key: string;
  variable: string;
  label: string;
  default_url: string | null;
  urls?: { location_id: number; url: string }[];
};

function mapMessageLink(raw: ApiMessageLink): PhotoMessageLink {
  return {
    id: raw.id,
    key: raw.key,
    variable: raw.variable || `link_${raw.key}`,
    label: raw.label,
    defaultUrl: raw.default_url ?? null,
    urls: (raw.urls ?? []).map((u) => ({ locationId: u.location_id, url: u.url })),
  };
}

const MESSAGE_LINKS_PATH = "/api/photo-message-links";

/**
 * GET /api/photo-message-links — null when the server doesn't have message
 * links (404) or they aren't set up yet (503), so the section stays hidden.
 */
export async function fetchMessageLinks(
  token: string,
  signal?: AbortSignal,
): Promise<PhotoMessageLinks | null> {
  try {
    const res = await apiRequest<{
      data: {
        links?: ApiMessageLink[];
        locations?: { id: number; name: string }[];
        can_manage_links?: boolean;
        max_links?: number;
      };
    }>(MESSAGE_LINKS_PATH, { token, signal });
    const d = res.data;
    return {
      links: (d?.links ?? []).map(mapMessageLink),
      locations: d?.locations ?? [],
      canManageLinks: Boolean(d?.can_manage_links),
      maxLinks: d?.max_links ?? 0,
    };
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 503)) return null;
    throw e;
  }
}

/** POST /api/photo-message-links — admins only. */
export async function createMessageLink(
  token: string,
  input: { label: string; defaultUrl: string | null },
): Promise<PhotoMessageLink> {
  const res = await apiRequest<{ data: ApiMessageLink }>(MESSAGE_LINKS_PATH, {
    method: "POST",
    token,
    body: { label: input.label, default_url: input.defaultUrl },
  });
  return mapMessageLink(res.data);
}

/** PUT /api/photo-message-links/{id} — rename or change the default address (admins only). */
export async function updateMessageLink(
  token: string,
  linkId: number,
  input: { label: string; defaultUrl: string | null },
): Promise<PhotoMessageLink> {
  const res = await apiRequest<{ data: ApiMessageLink }>(`${MESSAGE_LINKS_PATH}/${linkId}`, {
    method: "PUT",
    token,
    body: { label: input.label, default_url: input.defaultUrl },
  });
  return mapMessageLink(res.data);
}

/** PUT /api/photo-message-links/{id}/url — one location's own address; null clears it. */
export async function setMessageLinkUrl(
  token: string,
  linkId: number,
  locationId: number,
  url: string | null,
): Promise<PhotoMessageLink> {
  const res = await apiRequest<{ data: ApiMessageLink }>(`${MESSAGE_LINKS_PATH}/${linkId}/url`, {
    method: "PUT",
    token,
    body: { location_id: locationId, url },
  });
  return mapMessageLink(res.data);
}

/** DELETE /api/photo-message-links/{id} — admins only. */
export async function deleteMessageLink(token: string, linkId: number): Promise<void> {
  await apiRequest(`${MESSAGE_LINKS_PATH}/${linkId}`, { method: "DELETE", token });
}

/** POST /api/photo-templates/{id}/reset — restores the default wording. */
export async function resetPhotoTemplate(
  token: string,
  templateId: number,
): Promise<PhotoMessageTemplate> {
  const res = await apiRequest<{ data: ApiPhotoTemplate }>(
    `/api/photo-templates/${templateId}/reset`,
    { method: "POST", token },
  );
  return mapPhotoTemplate(res.data);
}
