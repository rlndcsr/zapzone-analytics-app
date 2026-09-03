import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { kioskAccessTokenFrom } from "./kioskToken.ts";

const TOKEN = "Ab3dEf9hIj2kLm5nOp8q";

describe("lifting the access token out of a kiosk URL", () => {
  it("takes the last segment of the URL the API returns", () => {
    assert.equal(
      kioskAccessTokenFrom(`https://app.zap-zone.com/waiver/kiosk-session/${TOKEN}`),
      TOKEN,
    );
  });

  it("ignores a query string or fragment", () => {
    assert.equal(
      kioskAccessTokenFrom(`https://x.test/waiver/kiosk-session/${TOKEN}?src=app`),
      TOKEN,
    );
    assert.equal(
      kioskAccessTokenFrom(`https://x.test/waiver/kiosk-session/${TOKEN}#top`),
      TOKEN,
    );
  });

  it("tolerates a trailing slash", () => {
    assert.equal(
      kioskAccessTokenFrom(`https://x.test/waiver/kiosk-session/${TOKEN}/`),
      TOKEN,
    );
  });

  it("accepts a relative path", () => {
    assert.equal(kioskAccessTokenFrom(`/waiver/kiosk-session/${TOKEN}`), TOKEN);
  });

  it("keeps url-safe punctuation that appears in tokens", () => {
    assert.equal(
      kioskAccessTokenFrom("https://x.test/waiver/kiosk-session/ab_cd-ef_12345"),
      "ab_cd-ef_12345",
    );
  });

  it("is null when the last segment is a route, not a token", () => {
    // Guards the failure that matters: addressing the API with "kiosk-session"
    // would 404 at the till.
    assert.equal(
      kioskAccessTokenFrom("https://x.test/waiver/kiosk-session"),
      null,
    );
    assert.equal(kioskAccessTokenFrom("https://x.test/waiver/"), null);
  });

  it("is null for a short or empty segment", () => {
    assert.equal(kioskAccessTokenFrom("https://x.test/waiver/abc"), null);
    assert.equal(kioskAccessTokenFrom(""), null);
    assert.equal(kioskAccessTokenFrom(null), null);
    assert.equal(kioskAccessTokenFrom(undefined), null);
  });
});
