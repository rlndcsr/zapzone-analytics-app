import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COUNTRY_CODE_NEEDED,
  formatPhoneForDisplay,
  isCompletePhone,
  localPhoneDigits,
  needsCountryCode,
  phoneDialUrl,
  phoneForSubmit,
} from "./phone.ts";

/*
 * The web's helpers (zappoint utils/bookingSearch.ts at fec623b), verbatim, so
 * the app's Hermes-safe copy is held to them.
 */
const webDigits = (value: string) => value.replace(/\D+/g, "");
const webClean = (value?: string | null) =>
  String(value ?? "")
    .replace(/\p{Cf}/gu, "")
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xff10 + 48))
    .replace(/＋/g, "+")
    .replace(/ /g, " ")
    .trim()
    .replace(/^[^\d+]*(?=\+)/, "");
const webNoExt = (value?: string | null) =>
  webClean(value).replace(/(\d)\s*(?:extension|ext\.?|x|#|,|;)\s*\d+\s*$/i, "$1");
const webLocal = (value?: string | null) => {
  const raw = webNoExt(value);
  let digits = webDigits(raw);
  const dialOut = raw.match(/^(011|00)/);
  const after = dialOut ? digits.slice(dialOut[0].length) : "";
  if (after.length === 11 && after.startsWith("1")) digits = after;
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
};
const webAbroad = (value?: string | null) => {
  const raw = webNoExt(value);
  const match = raw.match(/^(\+|011|00)/);
  return !!match && !webDigits(raw.slice(match[0].length)).startsWith("1");
};
const webNeedsCode = (value?: string | null) => {
  const raw = webNoExt(value);
  if (!webAbroad(raw)) return false;
  const after = raw.replace(/^\s*(\+|011|00)\s*/, "").replace(/^\(\s*0\s*\)/, "").replace(/^[0\s]+/, "");
  const digits = webDigits(after);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return false;
  const group = after.match(/^(\d{1,2})(?=\D)\D*\d/);
  return !(group && digits.startsWith(group[1]));
};
const webSubmit = (value?: string | null) => {
  const raw = webClean(value);
  return webAbroad(raw) ? raw : webLocal(raw) || raw;
};
const webComplete = (value?: string | null) => {
  const raw = webNoExt(value);
  if (/^[2-9]\d{9}$/.test(webLocal(raw))) return true;
  const dialOut = raw.match(/^(\+|011|00)/);
  if (!dialOut) return false;
  const rest = webDigits(raw.slice(dialOut[0].length));
  return !rest.startsWith("1") && rest.length >= (dialOut[0] === "+" ? 8 : 9);
};
const webDisplay = (value?: string | null) => {
  if (!value) return "";
  const cleaned = webClean(value);
  if (webAbroad(value) || webNoExt(value) !== cleaned || webDigits(cleaned).length > 11) return value;
  const local = webLocal(value);
  return local.length !== 10 ? value : `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
};

describe("matching the web's phone helpers", () => {
  it("agrees on a broad set of typed and pasted numbers", () => {
    const prefixes = ["", "+", "+1 ", "1", "011 ", "00", "00 1 ", "011 1", "＋", " (0) ", "Tel: +"];
    const bodies = ["8105889748", "810 588 9748", "(810) 588-9748", "47 912 34 567", "4791234567", "44 20 7946 0958", "810588", "0123456789", "１２３"];
    const tails = ["", " ext 12", " x5", " #7", ", 3", "​", " "];
    let checked = 0;
    for (const p of prefixes) {
      for (const b of bodies) {
        for (const t of tails) {
          const v = `${p}${b}${t}`;
          assert.equal(localPhoneDigits(v), webLocal(v), `localPhoneDigits ${JSON.stringify(v)}`);
          assert.equal(isCompletePhone(v), webComplete(v), `isCompletePhone ${JSON.stringify(v)}`);
          assert.equal(needsCountryCode(v), webNeedsCode(v), `needsCountryCode ${JSON.stringify(v)}`);
          assert.equal(phoneForSubmit(v), webSubmit(v), `phoneForSubmit ${JSON.stringify(v)}`);
          assert.equal(formatPhoneForDisplay(v), webDisplay(v), `formatPhoneForDisplay ${JSON.stringify(v)}`);
          checked++;
        }
      }
    }
    assert.ok(checked > 600);
  });

  it("drops exactly the web's invisible characters, over every code point", () => {
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const v = `+44${String.fromCodePoint(cp)}2079460958`;
      if (phoneForSubmit(v) !== webSubmit(v)) {
        assert.fail(`U+${cp.toString(16).toUpperCase()} is cleaned differently from the web`);
      }
    }
  });
});

describe("numbers from another country", () => {
  it("keeps the country code when saving", () => {
    assert.equal(phoneForSubmit("+44 20 7946 0958"), "+44 20 7946 0958");
    assert.equal(phoneForSubmit("011 44 20 7946 0958"), "011 44 20 7946 0958");
    assert.equal(phoneForSubmit("+1 (810) 588-9748"), "8105889748");
    assert.equal(phoneForSubmit("(810) 588-9748"), "8105889748");
  });

  it("asks for the country code when a number could be read either way", () => {
    assert.equal(needsCountryCode("+8105889748"), true);
    assert.equal(needsCountryCode("+47 912 34 567"), false);
    assert.equal(needsCountryCode("+1 810 588 9748"), false);
    assert.equal(needsCountryCode("810 588 9748"), false);
    assert.match(COUNTRY_CODE_NEEDED, /\+47 912 34 567/);
  });

  it("takes 011 or 00 as a way of dialling out", () => {
    assert.equal(isCompletePhone("011 44 20 7946 0958"), true);
    assert.equal(isCompletePhone("0044 20 7946 0958"), true);
    assert.equal(localPhoneDigits("011 1 810 588 9748"), "8105889748");
  });
});

describe("extensions", () => {
  it("are ignored when checking the number but kept on screen", () => {
    assert.equal(isCompletePhone("810-588-9748 ext 12"), true);
    assert.equal(localPhoneDigits("810-588-9748 x5"), "8105889748");
    assert.equal(formatPhoneForDisplay("810-588-9748 ext 12"), "810-588-9748 ext 12");
  });
});

const TYPED = [
  "8105889748",
  "810-588-9748",
  "1 810 588 9748",
  "(810)5889748",
  "810.588.9748",
];

describe("localPhoneDigits / isCompletePhone", () => {
  it("reads every common way of typing ten digits as the same number", () => {
    for (const typed of TYPED) {
      assert.equal(localPhoneDigits(typed), "8105889748", typed);
      assert.equal(isCompletePhone(typed), true, typed);
    }
  });

  it("drops a leading 1 only from an 11-digit number", () => {
    assert.equal(localPhoneDigits("18105889748"), "8105889748");
    assert.equal(localPhoneDigits("28105889748"), "28105889748");
    assert.equal(localPhoneDigits("1810588974"), "1810588974");
  });

  it("refuses anything that is not ten local digits", () => {
    for (const typed of ["", "555", "586", "810-588-974", "28105889748", "810 588 97481", "0123456789", null, undefined]) {
      assert.equal(isCompletePhone(typed), false, String(typed));
    }
  });

  it("accepts a dialable number written in international form", () => {
    assert.equal(isCompletePhone("+41 78 700 9926"), true);
    assert.equal(isCompletePhone("+44 20 7946 0958"), true);
    // eight digits is the floor, seven is not enough
    assert.equal(isCompletePhone("+354 1234 5"), true);
    assert.equal(isCompletePhone("+354 1234"), false);
    assert.equal(isCompletePhone(" +41 78 700 9926 "), true);
  });

  it("needs the + to take a number as international", () => {
    // 11 digits that are neither 10 local nor a leading-1 US number
    assert.equal(isCompletePhone("41 78 700 9926"), false);
    assert.equal(isCompletePhone("+555"), false);
  });
});

describe("formatPhoneForDisplay", () => {
  it("settles a complete number to one format", () => {
    for (const typed of TYPED) {
      assert.equal(formatPhoneForDisplay(typed), "(810) 588-9748", typed);
    }
  });

  it("leaves an international number as typed, never as a US one", () => {
    assert.equal(formatPhoneForDisplay("+41 78 700 9926"), "+41 78 700 9926");
    assert.equal(formatPhoneForDisplay("+44 20 7946 0958"), "+44 20 7946 0958");
  });

  it("leaves anything incomplete exactly as typed", () => {
    assert.equal(formatPhoneForDisplay("810-588"), "810-588");
    assert.equal(formatPhoneForDisplay("  586 "), "  586 ");
    assert.equal(formatPhoneForDisplay(""), "");
    assert.equal(formatPhoneForDisplay(null), "");
  });
});

describe("phoneDialUrl", () => {
  it("dials only the digits of a formatted number", () => {
    assert.equal(phoneDialUrl("(313) 555-0100"), "tel:3135550100");
    assert.equal(phoneDialUrl("313.555.0100 ext"), "tel:3135550100");
  });

  it("keeps an international plus", () => {
    assert.equal(phoneDialUrl("+1 313-555-0100"), "tel:+13135550100");
  });

  it("is nothing when there is nothing to dial", () => {
    assert.equal(phoneDialUrl(null), null);
    assert.equal(phoneDialUrl(undefined), null);
    assert.equal(phoneDialUrl(""), null);
    assert.equal(phoneDialUrl("n/a"), null);
  });
});
