/**
 * Authorize.Net "Accept" card tokenization for React Native.
 *
 * The web admin tokenizes with Accept.js (`window.Accept.dispatchData`), which
 * needs a DOM. Rather than ship a hidden WebView, this posts the same request
 * Accept.js posts — `securePaymentContainerRequest` against the Accept endpoint
 * — which is exactly what Authorize.Net's own iOS/Android Accept SDKs do. Same
 * endpoint, same payload, same one-time nonce back.
 *
 * The security property the web relies on is preserved: the card number goes
 * from the device straight to Authorize.Net over TLS and is never sent to (or
 * logged by) the ZapZone backend, which only ever receives the opaque nonce.
 *
 * Request/response shape, the client-side validation rules and the `E_WC_*`
 * code mapping below were all read off the live `AcceptCore.js`, so a failure
 * here produces the same code + text the web admin would show.
 */

import type {
  AuthorizeNetPublicKey,
  CardData,
  PaymentOpaqueData,
} from "../../services/paymentsService";

/** Host Accept.js posts to (its `window.encryptEndPoint`), per environment. */
const ENCRYPT_ENDPOINT: Record<"sandbox" | "production", string> = {
  sandbox: "https://apitest.authorize.net",
  production: "https://api.authorize.net",
};

/** Accept.js `messageInfo` table — reused verbatim so copy matches the web. */
const MESSAGE_INFO: Record<string, string> = {
  E_WC_04: "Please provide mandatory field to library.",
  E_WC_05: "Please provide valid credit card number.",
  E_WC_06: "Please provide valid expiration month.",
  E_WC_07: "Please provide valid expiration year.",
  E_WC_08: "Expiration date must be in the future.",
  E_WC_10: "Please provide valid apiloginid.",
  E_WC_13: "Invalid Fingerprint.",
  E_WC_14: "Accept.js encryption failed.",
  E_WC_15: "Please provide valid CVV.",
  E_WC_18: "Client key is required.",
  E_WC_19: "An error occurred during processing. Please try again.",
  E_WC_20: "An error occurred while parsing the XML request.",
  E_WC_21: "User authentication failed due to invalid authentication values.",
  E_WC_22: "The authentication type is not allowed for this method call.",
};

/**
 * Gateway code → Accept.js code, exactly as `AcceptCore.js` remaps them before
 * handing the response to the caller.
 */
const GATEWAY_CODE_MAP: Record<string, string> = {
  I00001: "I_WC_01",
  E00001: "E_WC_19",
  E00003: "E_WC_20",
  E00007: "E_WC_21",
  E00059: "E_WC_22",
  E00096: "E_WC_13",
};

/** A tokenization failure carrying Accept's own code, for precise messaging. */
export class AcceptTokenizationError extends Error {
  readonly code: string;

  constructor(code: string, text: string) {
    // Web parity: `PaymentService.tokenizeCard` rejects with "code: text".
    super(`${code}: ${text}`);
    this.name = "AcceptTokenizationError";
    this.code = code;
  }
}

const fail = (code: string, text?: string): never => {
  throw new AcceptTokenizationError(code, text ?? MESSAGE_INFO[code] ?? code);
};

/**
 * RFC 4122 v4 GUID for the request's `data.id`. Accept.js sends a fresh one per
 * request; it only has to be unique, so `Math.random` is sufficient (this is a
 * correlation id, not a secret).
 */
function newGuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Accept.js's own pre-flight validation, in its order. Running it locally means
 * a bad CVV or a past expiry fails instantly with the same message instead of
 * costing a round trip.
 */
function validate(card: CardData, credentials: AuthorizeNetPublicKey): {
  cardNumber: string;
  month: string;
  year: string;
  cardCode: string;
} {
  if (!credentials.apiLoginId || credentials.apiLoginId.length >= 255) {
    fail("E_WC_10");
  }
  if (!credentials.clientKey) {
    fail("E_WC_18");
  }

  // Accept.js strips ". ,:-" then requires 13-16 digits, then Luhn.
  const cardNumber = (card.cardNumber ?? "").replace(/[. ,:-]+/g, "");
  if (!/^[0-9]{13,16}$/.test(cardNumber)) fail("E_WC_05");
  let sum = 0;
  let double = false;
  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(cardNumber.charAt(i), 10);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  if (sum % 10 !== 0) fail("E_WC_05");

  // Month is zero-padded before the 01-12 check, as Accept.js does.
  const month = (card.month ?? "").length === 1 ? `0${card.month}` : (card.month ?? "");
  if (!/^(0[1-9]|1[012])$/.test(month)) fail("E_WC_06");

  const rawYear = card.year ?? "";
  if (!/^[0-9]{2}(?:[0-9]{2})?$/.test(rawYear)) fail("E_WC_07");
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

  // Expiry is the last instant of the expiration month (`new Date(y, m, 0)`
  // is the last day of month `m`), so a card expiring this month still works.
  const expiry = new Date(Number(year), Number(month), 0);
  expiry.setHours(23, 59, 59, 999);
  if (expiry.getTime() < Date.now()) fail("E_WC_08");

  // CVV is optional to Accept.js, but rejected outright when malformed.
  const cardCode = (card.cardCode ?? "").trim();
  if (cardCode && !/^[0-9]{3,4}$/.test(cardCode)) fail("E_WC_15");

  return { cardNumber, month, year, cardCode };
}

type AcceptResponse = {
  opaqueData?: { dataDescriptor?: string; dataValue?: string };
  messages?: {
    resultCode?: string;
    message?: { code?: string; text?: string }[];
  };
};

/** Tokenization is a user-blocking call — don't hang on a stalled network. */
const TOKENIZE_TIMEOUT_MS = 20000;

/**
 * Exchanges raw card data for a one-time Authorize.Net nonce.
 *
 * @param card        Card number / MM / YYYY / CVV as typed.
 * @param credentials The location's public pair from
 *                    `GET /api/authorize-net/public-key/{locationId}`.
 * @throws {AcceptTokenizationError} on validation, transport or gateway failure.
 */
export async function tokenizeCardWithAccept(
  card: CardData,
  credentials: AuthorizeNetPublicKey,
): Promise<PaymentOpaqueData> {
  const { cardNumber, month, year, cardCode } = validate(card, credentials);

  const body = {
    securePaymentContainerRequest: {
      merchantAuthentication: {
        name: credentials.apiLoginId,
        clientKey: credentials.clientKey,
      },
      data: {
        type: "TOKEN",
        id: newGuid(),
        token: {
          cardNumber,
          // Accept.js concatenates month + year with no separator ("022030").
          expirationDate: `${month}${year}`,
          // Omitted entirely when blank, matching Accept.js's optional fields.
          ...(cardCode ? { cardCode } : {}),
        },
      },
    },
  };

  const endpoint = `${ENCRYPT_ENDPOINT[credentials.environment]}/xml/v1/request.api`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TOKENIZE_TIMEOUT_MS);

  let raw: string;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    raw = await response.text();
  } catch {
    // Never surface the request object in the error — it holds the card number.
    throw new AcceptTokenizationError(
      "E_WC_14",
      "Could not reach the payment network. Please check your connection and try again.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // Authorize.Net's JSON API prefixes responses with a UTF-8 BOM, which makes
  // JSON.parse throw — strip it before parsing (Accept.js is served a BOM-less
  // XHR body, so this quirk only bites direct callers).
  let parsed: AcceptResponse;
  try {
    // The BOM is matched as an escape on purpose: a literal BOM in this
    // source file is invisible and easily lost to a reformat or re-encode.
    parsed = JSON.parse(raw.replace(/^[\uFEFF\s]+/, "")) as AcceptResponse;
  } catch {
    fail("E_WC_14");
    throw new Error("unreachable");
  }

  const messages = parsed.messages?.message ?? [];
  if (parsed.messages?.resultCode === "Error" || !parsed.opaqueData?.dataValue) {
    const first = messages[0];
    const code = GATEWAY_CODE_MAP[first?.code ?? ""] ?? first?.code ?? "E_WC_14";
    fail(code, first?.text ?? MESSAGE_INFO[code]);
  }

  return {
    dataDescriptor: parsed.opaqueData!.dataDescriptor ?? "COMMON.ACCEPT.INAPP.PAYMENT",
    dataValue: parsed.opaqueData!.dataValue!,
  };
}
