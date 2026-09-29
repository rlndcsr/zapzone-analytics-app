import { apiRequest } from "../lib/api";
import { mapKioskAd, type KioskAd } from "../lib/waivers/kioskContract";
import {
  mapSession,
  type ApiSession,
  type PhotoSession,
} from "./photosService";
import {
  mapKioskForm,
  type KioskForm,
  type KioskSubmission,
} from "./waiversService";

/*
 * Staff side of the escape-room games — the web admin's Photos → Escape Rooms
 * page (EscapeRoomSessions.tsx + EscapeRoomService.ts). The day board lists
 * every room's scheduled times; opening a time creates (or reuses) that game,
 * where staff take the group photo, record the finish time and email the photo
 * to the players who signed the escape-room waiver for it.
 */

export type EscapeRoomSlotStatus =
  | "waiting"
  | "signing"
  | "photo_ready"
  | "sent"
  | "send_problem"
  | "finished";

export type EscapeRoomExcludedReason =
  | "booking_removed"
  | "booking_cancelled"
  | "booking_moved"
  | "other_location";

/* ----------------------------------------------------------------- domain -- */

export type EscapeRoomSlotBooking = {
  id: number;
  referenceNumber: string;
  name: string;
  participants: number;
  unsigned: number;
};

export type EscapeRoomSlot = {
  key: string;
  sessionId: number | null;
  /** "HH:MM" — what the backend matches a game on. */
  time: string;
  timeLabel: string;
  isPast: boolean;
  inProgress: boolean;
  checkInOpen: boolean;
  bookings: EscapeRoomSlotBooking[];
  playersBooked: number;
  signed: number;
  unsigned: number;
  photos: number;
  sent: number;
  notDelivered: number;
  completed: boolean;
  completionLabel: string;
  status: EscapeRoomSlotStatus;
};

export type EscapeRoomDayRoom = {
  id: number;
  name: string;
  isActive: boolean;
  durationMinutes: number;
  hasWaiver: boolean;
  slots: EscapeRoomSlot[];
};

export type EscapeRoomUnsentGame = {
  sessionId: number;
  date: string;
  time: string;
  timeLabel: string;
  roomName: string | null;
  players: number;
  hasPhoto: boolean;
};

export type EscapeRoomDay = {
  date: string;
  isToday: boolean;
  today: string;
  location: { id: number; name: string };
  /** Public guest check-in page on the web frontend. */
  kioskUrl: string;
  emailAvailable: boolean;
  emailNote: string | null;
  rooms: EscapeRoomDayRoom[];
  unsentEarlier: EscapeRoomUnsentGame[];
};

export type EscapeRoomPlayer = {
  waiverId: number;
  referenceNumber: string | null;
  name: string;
  minors: number;
  emailMasked: string | null;
  hasEmail: boolean;
  photoRelease: boolean | null;
  bookingId: number | null;
  bookingReference: string | null;
  /** Signed at the escape-room check-in rather than through a booking link. */
  isSignIn: boolean;
  signedAt: string | null;
  sent: boolean;
  delivery: {
    id: number;
    status: string;
    gaveUp: boolean;
    isDuplicate: boolean;
    sentAt: string | null;
    error: string | null;
  } | null;
  excludedReason: EscapeRoomExcludedReason | null;
};

export type EscapeRoomGameBooking = {
  id: number;
  referenceNumber: string;
  name: string;
  participants: number;
  status: string;
};

export type EscapeRoomCounts = {
  players: number;
  people: number | null;
  withEmail: number;
  sent: number;
  emailed: number;
  failed: number;
  retrying: number;
  sending: number;
  stuck: number;
  newPlayers: number;
  excluded: number;
  unsigned: number;
};

export type EscapeRoomGame = {
  id: number;
  locationId: number;
  locationName: string | null;
  room: {
    id: number | null;
    name: string | null;
    durationMinutes: number | null;
    isActive: boolean;
    hasWaiver: boolean;
  };
  sessionDate: string;
  sessionTime: string;
  sessionTimeLabel: string;
  completed: boolean;
  escaped: boolean | null;
  completionSeconds: number | null;
  completionLabel: string;
  completedAt: string | null;
  completedWithoutPhoto: boolean;
  completedByName: string | null;
  bookings: EscapeRoomGameBooking[];
  players: EscapeRoomPlayer[];
  excludedPlayers: EscapeRoomPlayer[];
  counts: EscapeRoomCounts;
  photoSession: PhotoSession | null;
  canComplete: boolean;
  canSendNew: boolean;
  canResend: boolean;
  canCompleteWithoutPhoto: boolean;
  sendBlocker: string | null;
  photoLink: string | null;
  blockers: string[];
  emailAvailable: boolean;
  kioskUrl: string | null;
  playersBooked: number | null;
  slideshow: { enabled: boolean; declined: number; notAsked: number } | null;
};

/* -------------------------------------------------------------- mapping -- */

type ApiSlot = {
  key: string;
  session_id: number | null;
  time: string;
  time_label: string;
  is_past: boolean;
  in_progress?: boolean;
  check_in_open?: boolean;
  bookings: {
    id: number;
    reference_number: string;
    name: string;
    participants: number;
    unsigned: number;
  }[];
  players_booked: number;
  signed: number;
  unsigned: number;
  photos: number;
  sent: number;
  not_delivered?: number;
  completed: boolean;
  completion_label: string;
  status: EscapeRoomSlotStatus;
};

type ApiDay = {
  date: string;
  is_today: boolean;
  today: string;
  location: { id: number; name: string };
  kiosk_url: string;
  email_available: boolean;
  email_note: string | null;
  rooms: {
    id: number;
    name: string;
    is_active: boolean;
    duration_minutes: number;
    has_waiver: boolean;
    slots: ApiSlot[];
  }[];
  unsent_earlier?: {
    session_id: number;
    date: string;
    time: string;
    time_label: string;
    room_name: string | null;
    players: number;
    has_photo: boolean;
  }[];
};

type ApiPlayer = {
  waiver_id: number;
  reference_number: string | null;
  name: string;
  minors: number;
  email_masked: string | null;
  has_email: boolean;
  photo_release: boolean | null;
  booking_id: number | null;
  booking_reference: string | null;
  is_sign_in: boolean;
  signed_at: string | null;
  sent: boolean;
  delivery: {
    id: number;
    status: string;
    gave_up?: boolean;
    is_duplicate: boolean;
    sent_at: string | null;
    error: string | null;
  } | null;
  excluded_reason: EscapeRoomExcludedReason | null;
};

type ApiGame = {
  id: number;
  location_id: number;
  location_name: string | null;
  room: {
    id: number | null;
    name: string | null;
    duration_minutes: number | null;
    is_active: boolean;
    has_waiver: boolean;
  };
  session_date: string;
  session_time: string;
  session_time_label: string;
  completed: boolean;
  escaped: boolean | null;
  completion_seconds: number | null;
  completion_label: string;
  completed_at: string | null;
  completed_without_photo?: boolean;
  completed_by_name: string | null;
  bookings: {
    id: number;
    reference_number: string;
    name: string;
    participants: number;
    status: string;
  }[];
  players: ApiPlayer[];
  excluded_players: ApiPlayer[];
  counts: {
    players: number;
    people?: number;
    with_email: number;
    sent: number;
    emailed: number;
    failed: number;
    retrying: number;
    sending: number;
    stuck: number;
    new_players: number;
    excluded: number;
    unsigned: number;
  };
  photo_session: ApiSession | null;
  can_complete: boolean;
  can_send_new: boolean;
  can_resend?: boolean;
  can_complete_without_photo?: boolean;
  send_blocker?: string | null;
  photo_link?: string | null;
  blockers: string[];
  email_available: boolean;
  kiosk_url: string | null;
  players_booked?: number;
  slideshow?: { enabled: boolean; declined: number; not_asked: number };
};

function mapSlot(raw: ApiSlot): EscapeRoomSlot {
  return {
    key: raw.key,
    sessionId: raw.session_id,
    time: raw.time,
    timeLabel: raw.time_label,
    isPast: Boolean(raw.is_past),
    inProgress: Boolean(raw.in_progress),
    checkInOpen: Boolean(raw.check_in_open),
    bookings: (raw.bookings ?? []).map((b) => ({
      id: b.id,
      referenceNumber: b.reference_number,
      name: b.name,
      participants: b.participants,
      unsigned: b.unsigned,
    })),
    playersBooked: raw.players_booked ?? 0,
    signed: raw.signed ?? 0,
    unsigned: raw.unsigned ?? 0,
    photos: raw.photos ?? 0,
    sent: raw.sent ?? 0,
    notDelivered: raw.not_delivered ?? 0,
    completed: Boolean(raw.completed),
    completionLabel: raw.completion_label ?? "",
    status: raw.status,
  };
}

function mapDay(raw: ApiDay): EscapeRoomDay {
  return {
    date: raw.date,
    isToday: Boolean(raw.is_today),
    today: raw.today,
    location: raw.location,
    kioskUrl: raw.kiosk_url,
    emailAvailable: Boolean(raw.email_available),
    emailNote: raw.email_note ?? null,
    rooms: (raw.rooms ?? []).map((room) => ({
      id: room.id,
      name: room.name,
      isActive: Boolean(room.is_active),
      durationMinutes: room.duration_minutes,
      hasWaiver: Boolean(room.has_waiver),
      slots: (room.slots ?? []).map(mapSlot),
    })),
    unsentEarlier: (raw.unsent_earlier ?? []).map((g) => ({
      sessionId: g.session_id,
      date: g.date,
      time: g.time,
      timeLabel: g.time_label,
      roomName: g.room_name,
      players: g.players,
      hasPhoto: Boolean(g.has_photo),
    })),
  };
}

function mapPlayer(raw: ApiPlayer): EscapeRoomPlayer {
  return {
    waiverId: raw.waiver_id,
    referenceNumber: raw.reference_number,
    name: raw.name,
    minors: raw.minors ?? 0,
    emailMasked: raw.email_masked,
    hasEmail: Boolean(raw.has_email),
    photoRelease: raw.photo_release,
    bookingId: raw.booking_id,
    bookingReference: raw.booking_reference,
    isSignIn: Boolean(raw.is_sign_in),
    signedAt: raw.signed_at,
    sent: Boolean(raw.sent),
    delivery: raw.delivery
      ? {
          id: raw.delivery.id,
          status: raw.delivery.status,
          gaveUp: Boolean(raw.delivery.gave_up),
          isDuplicate: Boolean(raw.delivery.is_duplicate),
          sentAt: raw.delivery.sent_at,
          error: raw.delivery.error,
        }
      : null,
    excludedReason: raw.excluded_reason,
  };
}

function mapGame(raw: ApiGame): EscapeRoomGame {
  const c = raw.counts;
  return {
    id: raw.id,
    locationId: raw.location_id,
    locationName: raw.location_name,
    room: {
      id: raw.room.id,
      name: raw.room.name,
      durationMinutes: raw.room.duration_minutes,
      isActive: Boolean(raw.room.is_active),
      hasWaiver: Boolean(raw.room.has_waiver),
    },
    sessionDate: raw.session_date,
    sessionTime: raw.session_time,
    sessionTimeLabel: raw.session_time_label,
    completed: Boolean(raw.completed),
    escaped: raw.escaped,
    completionSeconds: raw.completion_seconds,
    completionLabel: raw.completion_label ?? "",
    completedAt: raw.completed_at,
    completedWithoutPhoto: Boolean(raw.completed_without_photo),
    completedByName: raw.completed_by_name,
    bookings: (raw.bookings ?? []).map((b) => ({
      id: b.id,
      referenceNumber: b.reference_number,
      name: b.name,
      participants: b.participants,
      status: b.status,
    })),
    players: (raw.players ?? []).map(mapPlayer),
    excludedPlayers: (raw.excluded_players ?? []).map(mapPlayer),
    counts: {
      players: c.players,
      people: c.people ?? null,
      withEmail: c.with_email,
      sent: c.sent,
      emailed: c.emailed,
      failed: c.failed,
      retrying: c.retrying,
      sending: c.sending,
      stuck: c.stuck,
      newPlayers: c.new_players,
      excluded: c.excluded,
      unsigned: c.unsigned,
    },
    photoSession: raw.photo_session ? mapSession(raw.photo_session) : null,
    canComplete: Boolean(raw.can_complete),
    canSendNew: Boolean(raw.can_send_new),
    canResend: Boolean(raw.can_resend),
    canCompleteWithoutPhoto: Boolean(raw.can_complete_without_photo),
    sendBlocker: raw.send_blocker ?? null,
    photoLink: raw.photo_link ?? null,
    blockers: raw.blockers ?? [],
    emailAvailable: Boolean(raw.email_available),
    kioskUrl: raw.kiosk_url,
    playersBooked: raw.players_booked ?? null,
    slideshow: raw.slideshow
      ? {
          enabled: Boolean(raw.slideshow.enabled),
          declined: raw.slideshow.declined ?? 0,
          notAsked: raw.slideshow.not_asked ?? 0,
        }
      : null,
  };
}

/* ------------------------------------------------------------- endpoints -- */

/** Completing a game emails every player inside the request, so allow for it. */
const SEND_TIMEOUT_MS = 60000;

type GameResponse = { data: ApiGame };

const gamePath = (sessionId: number) =>
  `/api/escape-rooms/sessions/${sessionId}`;

/** GET /api/escape-rooms/day — every room's games at a location on one day. */
export async function fetchEscapeRoomDay(
  token: string,
  locationId: number,
  date?: string,
  signal?: AbortSignal,
): Promise<EscapeRoomDay> {
  const query = `location_id=${locationId}${date ? `&date=${date}` : ""}`;
  const res = await apiRequest<{ data: ApiDay }>(
    `/api/escape-rooms/day?${query}`,
    { token, signal },
  );
  return mapDay(res.data);
}

/** POST /api/escape-rooms/sessions — opens (or reuses) the game at a room and time. */
export async function openEscapeRoomGame(
  token: string,
  locationId: number,
  roomId: number,
  date: string,
  time: string,
): Promise<EscapeRoomGame> {
  const res = await apiRequest<GameResponse>("/api/escape-rooms/sessions", {
    method: "POST",
    token,
    body: { location_id: locationId, package_id: roomId, date, time },
  });
  return mapGame(res.data);
}

/** GET /api/escape-rooms/sessions/{id}. */
export async function fetchEscapeRoomGame(
  token: string,
  sessionId: number,
): Promise<EscapeRoomGame> {
  const res = await apiRequest<GameResponse>(gamePath(sessionId), { token });
  return mapGame(res.data);
}

/** POST …/photo-session — starts the group photo; the group's verbal consent is required. */
export async function startEscapeRoomPhoto(
  token: string,
  sessionId: number,
): Promise<EscapeRoomGame> {
  const res = await apiRequest<GameResponse>(
    `${gamePath(sessionId)}/photo-session`,
    { method: "POST", token, body: { verbal_consent: true } },
  );
  return mapGame(res.data);
}

/**
 * POST …/complete — records the result and emails the photo to every signed
 * player. `withoutPhoto` records the result only and sends nothing.
 */
export async function completeEscapeRoomGame(
  token: string,
  sessionId: number,
  escaped: boolean,
  completionTime: string | null,
  withoutPhoto = false,
): Promise<EscapeRoomGame> {
  const res = await apiRequest<GameResponse>(`${gamePath(sessionId)}/complete`, {
    method: "POST",
    token,
    timeoutMs: SEND_TIMEOUT_MS,
    body: {
      escaped,
      completion_time: escaped ? completionTime : null,
      ...(withoutPhoto ? { without_photo: true } : {}),
    },
  });
  return mapGame(res.data);
}

/** POST …/send-new — emails players who signed after the photo went out, and retries stuck sends. */
export async function sendEscapeRoomToNewPlayers(
  token: string,
  sessionId: number,
): Promise<EscapeRoomGame> {
  const res = await apiRequest<GameResponse>(`${gamePath(sessionId)}/send-new`, {
    method: "POST",
    token,
    timeoutMs: SEND_TIMEOUT_MS,
  });
  return mapGame(res.data);
}

/** POST …/waivers/{id}/move — puts a player in a different room or time. */
export async function moveEscapeRoomPlayer(
  token: string,
  sessionId: number,
  waiverId: number,
  roomId: number,
  time: string,
): Promise<EscapeRoomGame> {
  const res = await apiRequest<GameResponse>(
    `${gamePath(sessionId)}/waivers/${waiverId}/move`,
    { method: "POST", token, body: { package_id: roomId, time } },
  );
  return mapGame(res.data);
}

/** POST …/waivers/{id}/remove — drops a player from this game; the waiver itself is kept. */
export async function removeEscapeRoomPlayer(
  token: string,
  sessionId: number,
  waiverId: number,
): Promise<EscapeRoomGame> {
  const res = await apiRequest<GameResponse>(
    `${gamePath(sessionId)}/waivers/${waiverId}/remove`,
    { method: "POST", token },
  );
  return mapGame(res.data);
}

/** POST …/waivers/{id}/resend — sends the photo again, optionally to a typed address. */
export async function resendEscapeRoomPhoto(
  token: string,
  sessionId: number,
  waiverId: number,
  email: string | null,
): Promise<EscapeRoomGame> {
  const res = await apiRequest<GameResponse>(
    `${gamePath(sessionId)}/waivers/${waiverId}/resend`,
    {
      method: "POST",
      token,
      timeoutMs: SEND_TIMEOUT_MS,
      body: email ? { email } : {},
    },
  );
  return mapGame(res.data);
}

/** POST …/result — fixes the recorded result. Emails already sent are not changed. */
export async function correctEscapeRoomResult(
  token: string,
  sessionId: number,
  escaped: boolean,
  completionTime: string | null,
): Promise<EscapeRoomGame> {
  const res = await apiRequest<GameResponse>(`${gamePath(sessionId)}/result`, {
    method: "POST",
    token,
    body: { escaped, completion_time: escaped ? completionTime : null },
  });
  return mapGame(res.data);
}

/** POST …/waivers/{id}/booking — links a check-in signer to one of this game's bookings, or unlinks. */
export async function linkEscapeRoomBooking(
  token: string,
  sessionId: number,
  waiverId: number,
  bookingId: number | null,
): Promise<EscapeRoomGame> {
  const res = await apiRequest<GameResponse>(
    `${gamePath(sessionId)}/waivers/${waiverId}/booking`,
    { method: "POST", token, body: { booking_id: bookingId } },
  );
  return mapGame(res.data);
}

/* ---------------------------------------------- guest check-in (public) -- */

/*
 * The guest side: players choose their room and time and sign the escape-room
 * waiver. These are the public routes behind the web's
 * /waiver/escape-room/{locationId} page, which the app now renders itself when
 * staff press "Open on this device". No bearer token is sent.
 */

export type EscapeRoomGuestTime = {
  time: string;
  /** The game's date when it differs from the kiosk day (a signed-ahead link). */
  date: string | null;
  label: string;
  inProgress: boolean;
  /** Finished within the grace window — still accepted, but not offered. */
  justFinished: boolean;
};

export type EscapeRoomGuestRoom = {
  id: number;
  name: string;
  durationMinutes: number;
  times: EscapeRoomGuestTime[];
};

/** A link to one game: the date, optionally room and time, and its signature. */
export type EscapeRoomGameLink = {
  date: string;
  room?: string;
  time?: string;
  sig?: string;
};

export type EscapeRoomKiosk = {
  location: { id: number; name: string };
  date: string;
  /** "Tuesday, September 29". */
  dateLabel: string;
  today: string | null;
  /** Signing ahead for a booked game on a later day. */
  ahead: boolean;
  rooms: EscapeRoomGuestRoom[];
  inactivityTimeoutSeconds: number;
};

export type EscapeRoomRoomForm = {
  form: KioskForm;
  room: { id: number; name: string; durationMinutes: number };
  times: EscapeRoomGuestTime[];
};

export type EscapeRoomSubmitResult = {
  id: number | null;
  referenceNumber: string | null;
  roomName: string;
  sessionTimeLabel: string;
  ad: KioskAd | null;
};

type ApiGuestTime = {
  time: string;
  date?: string;
  label: string;
  in_progress: boolean;
  just_finished?: boolean;
};

const mapGuestTimes = (raw: ApiGuestTime[] | undefined): EscapeRoomGuestTime[] =>
  (raw ?? []).map((t) => ({
    time: t.time,
    date: t.date ?? null,
    label: t.label,
    inProgress: Boolean(t.in_progress),
    justFinished: Boolean(t.just_finished),
  }));

/** `recent=1` keeps a game that just started choosable, as the web asks. */
const guestQuery = (link: EscapeRoomGameLink | null) => {
  const params = new URLSearchParams({ recent: "1" });
  if (link) {
    params.append("date", link.date);
    if (link.room) params.append("room", link.room);
    if (link.time) params.append("time", link.time);
    if (link.sig) params.append("sig", link.sig);
  }
  return params.toString();
};

/** GET /api/waivers/escape-room/{locationId} — rooms taking check-ins and their times. */
export async function fetchEscapeRoomKiosk(
  locationId: number,
  link: EscapeRoomGameLink | null,
): Promise<EscapeRoomKiosk> {
  const res = await apiRequest<{
    data: {
      location: { id: number; name: string };
      date: string;
      date_label: string;
      today?: string;
      ahead?: boolean;
      rooms: { id: number; name: string; duration_minutes: number; times: ApiGuestTime[] }[];
      settings?: { inactivity_timeout_seconds?: number };
    };
  }>(`/api/waivers/escape-room/${locationId}?${guestQuery(link)}`, {
    publicEndpoint: true,
  });
  const d = res.data;
  return {
    location: d.location,
    date: d.date,
    dateLabel: d.date_label,
    today: d.today ?? null,
    ahead: Boolean(d.ahead),
    rooms: (d.rooms ?? []).map((room) => ({
      id: room.id,
      name: room.name,
      durationMinutes: room.duration_minutes,
      times: mapGuestTimes(room.times),
    })),
    inactivityTimeoutSeconds: d.settings?.inactivity_timeout_seconds ?? 120,
  };
}

/** GET /api/waivers/escape-room/{locationId}/rooms/{roomId} — that room's waiver and fresh times. */
export async function fetchEscapeRoomForm(
  locationId: number,
  roomId: number,
  link: EscapeRoomGameLink | null,
): Promise<EscapeRoomRoomForm> {
  const res = await apiRequest<{ data: Record<string, unknown> }>(
    `/api/waivers/escape-room/${locationId}/rooms/${roomId}?${guestQuery(link)}`,
    { publicEndpoint: true },
  );
  const d = res.data ?? {};
  const room = (d.room ?? {}) as { id: number; name: string; duration_minutes: number };
  return {
    form: mapKioskForm(d),
    room: { id: room.id, name: room.name, durationMinutes: room.duration_minutes },
    times: mapGuestTimes(d.times as ApiGuestTime[] | undefined),
  };
}

/**
 * POST /api/waivers/escape-room/{locationId}/submit — signs the waiver for one
 * room and time. The template id and version the guest read are sent back so
 * a waiver edited mid-signing is refused (409 on `waiver_template_version`).
 */
export async function submitEscapeRoomWaiver(
  locationId: number,
  roomId: number,
  sessionTime: string,
  submission: KioskSubmission,
  shown: {
    sessionDate?: string | null;
    templateId?: number | null;
    templateVersion?: number | null;
    gameSignature?: string | null;
  },
): Promise<EscapeRoomSubmitResult> {
  const res = await apiRequest<{
    data?: {
      id?: number;
      reference_number?: string | null;
      room_name?: string;
      session_time_label?: string;
      ad?: unknown;
    };
  }>(`/api/waivers/escape-room/${locationId}/submit`, {
    method: "POST",
    publicEndpoint: true,
    body: {
      ...submission,
      package_id: roomId,
      session_time: sessionTime,
      ...(shown.sessionDate ? { session_date: shown.sessionDate } : {}),
      ...(shown.templateId ? { waiver_template_id: shown.templateId } : {}),
      ...(shown.templateVersion ? { waiver_template_version: shown.templateVersion } : {}),
      ...(shown.gameSignature ? { game_signature: shown.gameSignature } : {}),
    },
  });
  const d = res.data ?? {};
  return {
    id: d.id ?? null,
    referenceNumber: d.reference_number?.trim() || null,
    roomName: d.room_name ?? "",
    sessionTimeLabel: d.session_time_label ?? "",
    ad: mapKioskAd(d.ad),
  };
}
