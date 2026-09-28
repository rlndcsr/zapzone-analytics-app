import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatPhoneForDisplay,
  isCompletePhone,
  localPhoneDigits,
  phoneDialUrl,
} from "./phone.ts";

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
    for (const typed of ["", "555", "586", "810-588-974", "28105889748", "810 588 97481", null, undefined]) {
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
