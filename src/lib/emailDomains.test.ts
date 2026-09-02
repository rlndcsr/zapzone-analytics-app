import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseEmail, suggestEmails } from "./emailDomains.ts";

const domains = (value: string, options?: Parameters<typeof suggestEmails>[1]) =>
  suggestEmails(value, options).map((s) => s.domain);

describe("splitting a typed address", () => {
  it("splits on the last @ and lowercases the domain", () => {
    assert.deepEqual(parseEmail("jamie@GMAIL.com"), {
      local: "jamie",
      domain: "gmail.com",
    });
    assert.deepEqual(parseEmail("odd@name@gmail.com"), {
      local: "odd@name",
      domain: "gmail.com",
    });
  });

  it("is null until there is something either side of an @", () => {
    assert.equal(parseEmail(""), null);
    assert.equal(parseEmail("jamie"), null);
    assert.equal(parseEmail("@gmail.com"), null);
  });

  it("ignores surrounding whitespace", () => {
    assert.deepEqual(parseEmail("  jamie@  "), { local: "jamie", domain: "" });
  });
});

describe("suggesting a domain", () => {
  it("offers nothing before an @ is typed", () => {
    assert.deepEqual(suggestEmails("jamie"), []);
    assert.deepEqual(suggestEmails(""), []);
  });

  it("offers the popular domains as soon as the @ lands", () => {
    assert.deepEqual(domains("jamie@"), [
      "gmail.com",
      "yahoo.com",
      "hotmail.com",
      "outlook.com",
      "icloud.com",
      "comcast.net",
    ]);
  });

  it("completes a partial domain and carries the local part through", () => {
    const suggestions = suggestEmails("jamie@gma");
    assert.deepEqual(
      suggestions.map((s) => s.email),
      ["jamie@gmail.com"],
    );
    assert.equal(suggestions[0].kind, "completion");
  });

  it("leaves a complete, known domain alone", () => {
    assert.deepEqual(suggestEmails("jamie@gmail.com"), []);
    assert.deepEqual(suggestEmails("jamie@zap-zone.com"), []);
  });

  it("corrects a mistyped domain, transpositions included", () => {
    const suggestions = suggestEmails("jamie@gmial.com");
    assert.equal(suggestions[0].domain, "gmail.com");
    assert.equal(suggestions[0].email, "jamie@gmail.com");
    assert.equal(suggestions[0].kind, "correction");
  });

  it("corrects a missing letter", () => {
    assert.equal(suggestEmails("jamie@hotmai.com")[0].domain, "hotmail.com");
  });

  it("will not guess at a fragment too short to be wrong", () => {
    // "gm" is on its way to gmail/gmx, not a typo — and it prefixes both, so it
    // completes rather than corrects.
    assert.ok(
      suggestEmails("jamie@gm").every((s) => s.kind === "completion"),
      "short fragments complete rather than correct",
    );
    // "zzz" prefixes nothing and is under the correction budget.
    assert.deepEqual(suggestEmails("jamie@zzz"), []);
  });

  it("gives up on a domain nothing is close to", () => {
    assert.deepEqual(suggestEmails("jamie@some-private-domain.org"), []);
  });

  it("honours the limit", () => {
    assert.equal(suggestEmails("jamie@", { limit: 2 }).length, 2);
    assert.equal(suggestEmails("jamie@y", { limit: 1 }).length, 1);
  });

  it("considers extra domains without duplicating the built-ins", () => {
    // zone-entertainment.com is already built in, so passing it again must not
    // list it twice; zone-events.com is new and joins the end of the list.
    const withExtra = domains("jamie@zone-", {
      extraDomains: ["zone-entertainment.com", "zone-events.com"],
    });
    assert.deepEqual(withExtra, ["zone-entertainment.com", "zone-events.com"]);
  });
});
