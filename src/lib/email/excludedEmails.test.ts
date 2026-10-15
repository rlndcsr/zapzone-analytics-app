import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  addExcludedEmail,
  cleanEmailAddress,
  encodedLabelLength,
  excludedEmailsToSave,
  isValidEmailAddress,
  refusedExcludedEmailMessage,
  utf8Length,
} from "./excludedEmails.ts";

/*
 * The web's own check (zappoint utils/emailDomains.ts), verbatim. It leans on
 * `\p{…}`, TextEncoder and URL's IDNA — all present in Node — so the app's
 * hand-written version is held to it here.
 */
const LATIN = "A-Za-z0-9\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F\\u1E00-\\u1EFF";
const WEB_INVISIBLE = /[\p{Cc}\p{Cf}]/gu;
const WEB_LOCAL = new RegExp(`^[${LATIN}!#$%&'*+/=?^_\`{|}~-]+(?:\\.[${LATIN}!#$%&'*+/=?^_\`{|}~-]+)*$`);
const WEB_LABEL = new RegExp(`^[${LATIN}](?:[${LATIN}-]*[${LATIN}])?$`);
const webBytes = (v: string) => new TextEncoder().encode(v).length;
const webEncoded = (label: string) => {
  try {
    return new URL(`http://${label}`).hostname.length;
  } catch {
    return Infinity;
  }
};
const webClean = (v: string) =>
  v.replace(WEB_INVISIBLE, "").toLowerCase().normalize("NFC").trim().replace(/[\s.,;]+$/u, "");
const webValid = (v: string) => {
  const at = v.lastIndexOf("@");
  if (at <= 0) return false;
  const domain = v.slice(at + 1);
  const labels = domain.split(".");
  return (
    WEB_LOCAL.test(v.slice(0, at)) &&
    labels.length >= 2 &&
    webBytes(domain) <= 253 &&
    labels.every(
      (l, i) =>
        WEB_LABEL.test(l) &&
        (/^[A-Za-z0-9-]+$/.test(l)
          ? l.length <= (i === 0 ? 63 : 62)
          : webBytes(l) <= 63 && webEncoded(l) <= 63),
    )
  );
};

describe("cleaning a typed or pasted address", () => {
  it("lowercases and trims a pasted trailing period, comma or semicolon", () => {
    assert.equal(cleanEmailAddress("  Webmaster@BestInGames.com. "), "webmaster@bestingames.com");
    assert.equal(cleanEmailAddress("a@b.com,;"), "a@b.com");
  });

  it("drops invisible characters a paste carries", () => {
    assert.equal(cleanEmailAddress("a​@b­c.com﻿"), "a@bc.com");
  });

  it("joins a letter with its accent", () => {
    assert.equal(cleanEmailAddress("josé@example.com"), "josé@example.com");
  });

  it("strips exactly the web's invisible characters, over every code point", () => {
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const input = `a${String.fromCodePoint(cp)}b@x.com`;
      if (cleanEmailAddress(input) !== webClean(input)) {
        assert.fail(`U+${cp.toString(16).toUpperCase()} is cleaned differently from the web`);
      }
    }
  });
});

describe("checking an address the way the server will", () => {
  it("takes ordinary and accented addresses", () => {
    assert.equal(isValidEmailAddress("webmaster@bestingames.com"), true);
    assert.equal(isValidEmailAddress("first.o'neil+tag@sub.example.co.uk"), true);
    assert.equal(isValidEmailAddress("josé@münchen.de"), true);
  });

  it("refuses what the server refuses", () => {
    for (const bad of ["", "plain", "@b.com", "a@b", "a@-b.com", "a@b-.com", "a..b@c.com", "a b@c.com", "a@b..com", "\u{1F600}@b.com", "a@\u{1F600}.com"]) {
      assert.equal(isValidEmailAddress(bad), false, bad);
    }
  });

  it("follows the web's length limits for labels and the whole domain", () => {
    assert.equal(isValidEmailAddress(`a@${"b".repeat(63)}.com`), true);
    assert.equal(isValidEmailAddress(`a@${"b".repeat(64)}.com`), false);
    assert.equal(isValidEmailAddress(`a@ex.${"b".repeat(62)}`), true);
    assert.equal(isValidEmailAddress(`a@ex.${"b".repeat(63)}`), false);
  });

  it("agrees with the web at the label limit for every accepted letter", () => {
    const ranges = [[0x41, 0x5a], [0x61, 0x7a], [0xc0, 0xd6], [0xd8, 0xf6], [0xf8, 0x24f], [0x1e00, 0x1eff]];
    for (const [from, to] of ranges) {
      for (let cp = from; cp <= to; cp++) {
        const ch = String.fromCodePoint(cp);
        for (let pad = 40; pad <= 64; pad++) {
          for (const repeat of [1, 2, 5]) {
            const address = webClean(`a@${"x".repeat(pad)}${ch.repeat(repeat)}.com`);
            if (isValidEmailAddress(address) !== webValid(address)) {
              assert.fail(`U+${cp.toString(16).toUpperCase()} ×${repeat} after ${pad}: app and web disagree`);
            }
          }
        }
      }
    }
  });

  it("measures a label as DNS writes it (Punycode)", () => {
    for (const label of ["bücher", "münchen", "ééé", "abc", "ỳx"]) {
      assert.equal(encodedLabelLength(label), webEncoded(label), label);
    }
    assert.equal(utf8Length("éa"), 3);
  });
});

describe("the Don't Send To list", () => {
  it("adds a cleaned address and refuses a bad one or a repeat", () => {
    assert.deepEqual(addExcludedEmail([], " Staff@Example.com. "), {
      ok: true,
      list: ["staff@example.com"],
    });
    assert.equal(addExcludedEmail([], "   "), null);
    assert.deepEqual(addExcludedEmail([], "nope"), {
      ok: false,
      title: "Invalid email",
      message: "Please enter a valid email address",
    });
    assert.deepEqual(addExcludedEmail(["a@b.com"], "A@B.com"), {
      ok: false,
      title: "Already excluded",
      message: "Email already excluded",
    });
  });

  it("saves an address typed but not added, once", () => {
    assert.deepEqual(excludedEmailsToSave(["a@b.com"], "c@d.com,", false), {
      emails: ["a@b.com", "c@d.com"],
      error: null,
    });
    assert.deepEqual(excludedEmailsToSave(["a@b.com"], "A@b.com", false), {
      emails: ["a@b.com"],
      error: null,
    });
  });

  it("stops the save when the typed address isn't usable", () => {
    assert.deepEqual(excludedEmailsToSave([], "half@", false), {
      emails: null,
      error: "Enter a valid email in Don't Send To, or clear the box",
    });
  });

  it("always saves an empty list for a visit follow-up email", () => {
    assert.deepEqual(excludedEmailsToSave(["a@b.com"], "bad", true), { emails: [], error: null });
  });

  it("names the address the server refused", () => {
    assert.equal(
      refusedExcludedEmailMessage({ "excluded_emails.1": ["must be valid"] }, ["a@b.com", "x@y.com"]),
      `Don't Send To can't use "x@y.com". Remove it, type it again and save.`,
    );
    assert.equal(refusedExcludedEmailMessage({ name: ["required"] }, ["a@b.com"]), null);
    assert.equal(refusedExcludedEmailMessage(undefined, []), null);
  });
});
